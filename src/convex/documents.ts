import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { documentStatusValidator, summaryStatusValidator } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";
import { pushNotification } from "./inAppNotifications";

type DbCtx = QueryCtx | MutationCtx;

const ROLES = {
  ROOT: "root",
  ADMIN: "admin",
} as const;

/** Limite serveur des fichiers (10 Mo) */
export const MAX_FILE_BYTES_SERVER = 10 * 1024 * 1024;

/** Types MIME autorisés côté serveur */
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/json",
  "application/xml",
  "text/xml",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".odt", ".rtf", ".txt", ".md", ".csv",
  ".xls", ".xlsx", ".json", ".xml", ".png", ".jpg", ".jpeg", ".webp",
  ".heic", ".heif", ".gif",
]);

function isAdminRole(role?: string | null) {
  return role === ROLES.ROOT || role === ROLES.ADMIN;
}

async function requireUserId(ctx: DbCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Vous devez être connecté.");
  return userId;
}

async function departmentName(
  ctx: DbCtx,
  departmentId?: Id<"departments"> | null,
) {
  if (!departmentId) return null;
  const department = await ctx.db.get(departmentId);
  return department?.name ?? null;
}

function displayName(user: { name?: string | null; email?: string | null }) {
  return user.name?.trim() || user.email || "Utilisateur";
}

function sortByDateDesc(a: { createdAt: number }, b: { createdAt: number }) {
  return b.createdAt - a.createdAt;
}

/** Écrit une entrée dans le journal d'audit */
async function writeAudit(
  ctx: MutationCtx,
  params: {
    action: string;
    actorId: Id<"users">;
    actorName: string;
    documentId?: Id<"documents">;
    details?: string;
    metadata?: unknown;
  },
) {
  await ctx.db.insert("auditLogs", {
    action: params.action,
    actorId: params.actorId,
    actorName: params.actorName,
    documentId: params.documentId,
    details: params.details,
    metadata: params.metadata,
    createdAt: Date.now(),
  });
}

function validateFile(args: {
  fileName: string;
  contentType?: string;
  size?: number;
}) {
  if (args.size != null && args.size > MAX_FILE_BYTES_SERVER) {
    throw new Error(
      `Le fichier dépasse la taille maximale autorisée (${MAX_FILE_BYTES_SERVER / (1024 * 1024)} Mo).`,
    );
  }
  if (args.size != null && args.size <= 0) {
    throw new Error("Fichier vide non autorisé.");
  }
  const ext = args.fileName.includes(".")
    ? "." + args.fileName.split(".").pop()!.toLowerCase()
    : "";
  const mime = (args.contentType ?? "").toLowerCase().split(";")[0]!.trim();
  const extOk = !ext || ALLOWED_EXTENSIONS.has(ext);
  const mimeOk =
    !mime ||
    mime === "application/octet-stream" ||
    ALLOWED_CONTENT_TYPES.has(mime) ||
    mime.startsWith("image/");

  // Accepter si l'extension OU le MIME est valide (les téléphones envoient souvent
  // des types génériques ou HEIC sans extension claire).
  if (!extOk && !mimeOk) {
    throw new Error(
      `Type de fichier non autorisé${ext ? ` (${ext})` : ""}. Formats acceptés : PDF, Word, Excel, images, texte.`,
    );
  }
}

async function decorate(ctx: DbCtx, documents: Doc<"documents">[]) {
  return await Promise.all(
    documents.map(async (document) => ({
      ...document,
      summary: document.summary ?? null,
      summarySource: document.summarySource ?? null,
      senderDepartmentName: await departmentName(ctx, document.senderDepartmentId),
      recipientDepartmentName: await departmentName(
        ctx,
        document.recipientDepartmentId,
      ),
    })),
  );
}

/** Signed upload URL used by the client to push the file into Convex storage. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Records a sent document and asks the backend to build its automatic
 * summary. The receiver is chosen in two steps on the client (department,
 * then member), so only the resolved `recipientId` matters here.
 */
export const send = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    objet: v.string(),
    tasks: v.array(v.string()),
    extractedText: v.optional(v.string()),
    recipientId: v.id("users"),
    onBehalfOfType: v.union(v.literal("internal"), v.literal("external")),
    onBehalfOfUserId: v.optional(v.id("users")),
    onBehalfOfName: v.optional(v.string()),
    onBehalfOfFunction: v.optional(v.string()),
    onBehalfOfDepartment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const sender = await ctx.db.get(userId);
    if (!sender) throw new Error("Compte introuvable.");

    // Validation serveur des fichiers
    validateFile({
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
    });

    const objet = args.objet.trim();
    if (!objet) throw new Error("Précisez l'objet de l'envoi.");

    const tasks = args.tasks.map((t) => t.trim()).filter(Boolean);
    if (tasks.length === 0) {
      throw new Error("Sélectionnez au moins une tâche à réaliser.");
    }

    const recipient = await ctx.db.get(args.recipientId);
    if (!recipient) throw new Error("Destinataire introuvable.");
    if (recipient._id === userId) {
      throw new Error("Vous ne pouvez pas vous envoyer un document à vous-même.");
    }

    // Resolve "de la part de"
    let onBehalfOfName = args.onBehalfOfName?.trim() || undefined;
    let onBehalfOfFunction = args.onBehalfOfFunction?.trim() || undefined;
    let onBehalfOfDepartment = args.onBehalfOfDepartment?.trim() || undefined;
    let onBehalfOfUserId = args.onBehalfOfUserId;

    if (args.onBehalfOfType === "internal") {
      if (!onBehalfOfUserId) {
        throw new Error("Choisissez la personne au nom de qui vous envoyez.");
      }
      const onBehalfUser = await ctx.db.get(onBehalfOfUserId);
      if (!onBehalfUser) throw new Error("Personne introuvable.");
      onBehalfOfName = displayName(onBehalfUser);
      onBehalfOfFunction = onBehalfUser.fonction ?? undefined;
      if (onBehalfUser.departmentId) {
        const dept = await ctx.db.get(onBehalfUser.departmentId);
        onBehalfOfDepartment = dept?.name ?? undefined;
      }
    } else {
      if (!onBehalfOfName) {
        throw new Error(
          "Indiquez le nom de la personne au nom de qui vous envoyez.",
        );
      }
      onBehalfOfUserId = undefined;
    }

    // Envoi inter-départements autorisé pour tout compte connecté validé.
    // (Le choix du destinataire se fait via département → membre côté UI.)

    const now = Date.now();
    const documentId = await ctx.db.insert("documents", {
      fileName: args.fileName,
      storageId: args.storageId,
      contentType: args.contentType,
      size: args.size,
      objet,
      tasks,
      task: tasks.join(" · "),
      onBehalfOfType: args.onBehalfOfType,
      onBehalfOfUserId,
      onBehalfOfName,
      onBehalfOfFunction,
      onBehalfOfDepartment,
      extractedText: args.extractedText?.slice(0, 40000),
      summaryStatus: "en_attente",
      senderId: userId,
      senderName: displayName(sender),
      senderDepartmentId: sender.departmentId,
      recipientId: recipient._id,
      recipientName: displayName(recipient),
      recipientDepartmentId: recipient.departmentId,
      status: "envoye",
      createdAt: now,
      updatedAt: now,
    });

    // Secondaires : ne doivent jamais faire échouer l'envoi (transaction unique)
    try {
      await writeAudit(ctx, {
        action: "document.sent",
        actorId: userId,
        actorName: displayName(sender),
        documentId,
        details: `Envoi à ${displayName(recipient)} — ${objet}`,
        metadata: { tasks, fileName: args.fileName },
      });
    } catch (e) {
      console.error("[send] audit log échoué:", e);
    }

    try {
      await pushNotification(ctx, {
        userId: recipient._id,
        type: "document.received",
        title: "Nouveau document reçu",
        body: `${displayName(sender)} : ${objet}`,
        documentId,
      });
    } catch (e) {
      console.error("[send] notification in-app échouée:", e);
    }

    try {
      await ctx.scheduler.runAfter(0, internal.ai.summarizeDocument, {
        documentId,
      });
    } catch (e) {
      console.error("[send] planification résumé IA échouée:", e);
    }

    if (recipient.email) {
      try {
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.sendDocumentReceivedEmail,
          {
            toEmail: recipient.email,
            toName: displayName(recipient),
            senderName: displayName(sender),
            objet,
            tasks,
            fileName: args.fileName,
            onBehalfOfName,
          },
        );
      } catch (e) {
        console.error("[send] planification email échouée:", e);
      }
    }

    return documentId;
  },
});

/** Minimal payload the summary action needs. */
export const getForSummary = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) return null;
    return {
      fileName: document.fileName,
      task: document.tasks?.join(" · ") ?? document.task ?? "",
      objet: document.objet ?? "",
      extractedText: document.extractedText ?? "",
      contentType: document.contentType ?? "",
      storageId: document.storageId,
      // URL signée pour analyse vision (images)
      fileUrl: await ctx.storage.getUrl(document.storageId),
    };
  },
});

export const setSummary = internalMutation({
  args: {
    documentId: v.id("documents"),
    summary: v.string(),
    summaryStatus: summaryStatusValidator,
    summarySource: v.optional(v.union(v.literal("ia"), v.literal("extrait"))),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      summary: args.summary,
      summaryStatus: args.summaryStatus,
      summarySource: args.summarySource,
    });
    return null;
  },
});

/** Filtre texte libre (objet, tâches, noms, fichier) */
function matchesSearch(
  doc: Doc<"documents">,
  needle: string,
): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  const tasksText = (doc.tasks ?? []).join(" ");
  return (
    (doc.objet ?? "").toLowerCase().includes(n) ||
    tasksText.toLowerCase().includes(n) ||
    (doc.fileName ?? "").toLowerCase().includes(n) ||
    (doc.senderName ?? "").toLowerCase().includes(n) ||
    (doc.recipientName ?? "").toLowerCase().includes(n) ||
    (doc.onBehalfOfName ?? "").toLowerCase().includes(n) ||
    (doc.task ?? "").toLowerCase().includes(n)
  );
}

/**
 * Documents reçus — avec pagination, recherche et filtre d'archivage.
 * cursor = createdAt du dernier élément (pour pagination simple).
 */
export const inbox = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(documentStatusValidator),
    includeArchived: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
    const includeArchived = args.includeArchived ?? false;

    let documents = await ctx.db
      .query("documents")
      .withIndex("by_recipient", (q) => q.eq("recipientId", userId))
      .collect();

    documents = documents
      .filter((d) => (includeArchived ? true : !d.archivedAt))
      .filter((d) => (args.status ? d.status === args.status : true))
      .filter((d) => matchesSearch(d, (args.search ?? "").trim()))
      .sort(sortByDateDesc);

    if (args.cursor != null) {
      documents = documents.filter((d) => d.createdAt < args.cursor!);
    }

    const page = documents.slice(0, limit);
    // Retourne un tableau (compatible ancien + nouveau frontend)
    return await decorate(ctx, page);
  },
});

/** Documents envoyés — pagination + recherche */
export const sent = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(documentStatusValidator),
    includeArchived: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
    const includeArchived = args.includeArchived ?? false;

    let documents = await ctx.db
      .query("documents")
      .withIndex("by_sender", (q) => q.eq("senderId", userId))
      .collect();

    documents = documents
      .filter((d) => (includeArchived ? true : !d.archivedAt))
      .filter((d) => (args.status ? d.status === args.status : true))
      .filter((d) => matchesSearch(d, (args.search ?? "").trim()))
      .sort(sortByDateDesc);

    if (args.cursor != null) {
      documents = documents.filter((d) => d.createdAt < args.cursor!);
    }

    const page = documents.slice(0, limit);
    return await decorate(ctx, page);
  },
});

/** Compatibilité : anciennes queries sans args (utilisées par le dashboard) */
export const inboxAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_recipient", (q) => q.eq("recipientId", userId))
      .collect();
    return await decorate(
      ctx,
      documents.filter((d) => !d.archivedAt).sort(sortByDateDesc),
    );
  },
});

export const sentAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_sender", (q) => q.eq("senderId", userId))
      .collect();
    return await decorate(
      ctx,
      documents.filter((d) => !d.archivedAt).sort(sortByDateDesc),
    );
  },
});

/** A single document with its download URL, if the caller may see it. */
export const get = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) return null;
    if (document.senderId !== userId && document.recipientId !== userId) {
      throw new Error("Vous n'avez pas accès à ce document.");
    }

    return {
      ...(await decorate(ctx, [document]))[0]!,
      downloadUrl: await ctx.storage.getUrl(document.storageId),
      isRecipient: document.recipientId === userId,
      isSender: document.senderId === userId,
    };
  },
});

/** The receiver opens a document: mark it as consulted. */
export const markViewed = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");
    if (document.recipientId !== userId) return null;
    if (document.status !== "envoye") return null;

    const user = await ctx.db.get(userId);
    const now = Date.now();
    await ctx.db.patch(args.documentId, {
      status: "consulte",
      viewedAt: now,
      updatedAt: now,
    });

    await writeAudit(ctx, {
      action: "document.viewed",
      actorId: userId,
      actorName: displayName(user ?? {}),
      documentId: args.documentId,
      details: "Document consulté",
    });

    return null;
  },
});

/** The receiver updates the treatment status the sender can follow. */
export const setStatus = mutation({
  args: {
    documentId: v.id("documents"),
    status: documentStatusValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");
    if (document.recipientId !== userId) {
      throw new Error("Seul le destinataire peut changer le statut.");
    }

    const user = await ctx.db.get(userId);
    const now = Date.now();
    await ctx.db.patch(args.documentId, {
      status: args.status,
      updatedAt: now,
      viewedAt: document.viewedAt ?? now,
    });

    await writeAudit(ctx, {
      action: "document.status_changed",
      actorId: userId,
      actorName: displayName(user ?? {}),
      documentId: args.documentId,
      details: `Statut → ${args.status}`,
      metadata: { from: document.status, to: args.status },
    });

    // Notification in-app + email à l'expéditeur
    const statusLabels: Record<string, string> = {
      envoye: "Envoyé",
      consulte: "Consulté",
      en_cours: "En cours",
      traite: "Traité",
    };
    const statusLabel = statusLabels[args.status] ?? args.status;

    await pushNotification(ctx, {
      userId: document.senderId,
      type: "document.status",
      title: "Statut mis à jour",
      body: `« ${document.objet} » → ${statusLabel} (par ${displayName(user ?? {})})`,
      documentId: args.documentId,
    });

    const sender = await ctx.db.get(document.senderId);
    if (sender?.email) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.sendStatusChangedEmail,
        {
          toEmail: sender.email,
          toName: displayName(sender),
          documentObjet: document.objet,
          newStatus: args.status,
          changedByName: displayName(user ?? {}),
        },
      );
    }

    return null;
  },
});

/** Archiver un document (soft delete) — accessible par expéditeur ou destinataire */
export const archive = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");
    if (document.senderId !== userId && document.recipientId !== userId) {
      throw new Error("Vous n'avez pas accès à ce document.");
    }
    if (document.archivedAt) return null;

    const user = await ctx.db.get(userId);
    const now = Date.now();
    await ctx.db.patch(args.documentId, {
      archivedAt: now,
      archivedBy: userId,
      updatedAt: now,
    });

    await writeAudit(ctx, {
      action: "document.archived",
      actorId: userId,
      actorName: displayName(user ?? {}),
      documentId: args.documentId,
      details: "Document archivé",
    });

    return null;
  },
});

/** Désarchiver */
export const unarchive = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");
    if (document.senderId !== userId && document.recipientId !== userId) {
      throw new Error("Vous n'avez pas accès à ce document.");
    }

    const user = await ctx.db.get(userId);
    await ctx.db.patch(args.documentId, {
      archivedAt: undefined,
      archivedBy: undefined,
      updatedAt: Date.now(),
    });

    await writeAudit(ctx, {
      action: "document.unarchived",
      actorId: userId,
      actorName: displayName(user ?? {}),
      documentId: args.documentId,
      details: "Document désarchivé",
    });

    return null;
  },
});

/** Suppression définitive (uniquement si déjà archivé, et par l'expéditeur ou un admin) */
export const remove = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");

    const user = await ctx.db.get(userId);
    const isOwner = document.senderId === userId;
    const isAdmin = isAdminRole(user?.role);
    if (!isOwner && !isAdmin) {
      throw new Error("Seul l'expéditeur ou un administrateur peut supprimer définitivement.");
    }
    if (!document.archivedAt) {
      throw new Error("Archivez d'abord le document avant de le supprimer définitivement.");
    }

    // Supprimer le fichier du storage
    try {
      await ctx.storage.delete(document.storageId);
    } catch {
      // ignore si déjà absent
    }

    await writeAudit(ctx, {
      action: "document.deleted",
      actorId: userId,
      actorName: displayName(user ?? {}),
      documentId: args.documentId,
      details: `Suppression définitive de ${document.fileName}`,
      metadata: { fileName: document.fileName, objet: document.objet },
    });

    await ctx.db.delete(args.documentId);
    return null;
  },
});

/** Historique d'audit d'un document */
export const auditTrail = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) return [];
    if (document.senderId !== userId && document.recipientId !== userId) {
      throw new Error("Vous n'avez pas accès à ce document.");
    }

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    return logs.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Counters for the dashboard home. */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    const received = await ctx.db
      .query("documents")
      .withIndex("by_recipient", (q) => q.eq("recipientId", userId))
      .collect();
    const sentDocs = await ctx.db
      .query("documents")
      .withIndex("by_sender", (q) => q.eq("senderId", userId))
      .collect();
    const departmentCount = (await ctx.db.query("departments").collect()).length;

    const activeReceived = received.filter((d) => !d.archivedAt);
    const activeSent = sentDocs.filter((d) => !d.archivedAt);

    // Aligné avec les libellés UI :
    // - awaiting (« À traiter ») = reçus pas encore « Traité »
    //   (envoyé + consulté + en cours)
    const inProgress = activeReceived.filter(
      (d) => d.status === "en_cours",
    ).length;
    const done = activeReceived.filter((d) => d.status === "traite").length;
    const awaiting = activeReceived.filter((d) => d.status !== "traite").length;

    return {
      received: activeReceived.length,
      sent: activeSent.length,
      awaiting,
      inProgress,
      done,
      byStatus: {
        envoye: activeReceived.filter((d) => d.status === "envoye").length,
        consulte: activeReceived.filter((d) => d.status === "consulte").length,
        en_cours: inProgress,
        traite: done,
      },
      departments: departmentCount,
      archived:
        received.filter((d) => d.archivedAt).length +
        sentDocs.filter((d) => d.archivedAt).length,
    };
  },
});

