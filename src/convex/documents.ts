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
import { assertRateLimit, sanitizeText } from "./lib/security";

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

function generatePublicRef() {
  const y = new Date().getFullYear();
  const part = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SD-${y}-${part}`;
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


/** Documents visibles en « reçus » : destinataire actuel OU intervenant du circuit. */
async function collectInboxDocuments(
  ctx: DbCtx,
  userId: Id<"users">,
  includeArchived: boolean,
) {
  const byRecipient = await ctx.db
    .query("documents")
    .withIndex("by_recipient", (q) => q.eq("recipientId", userId))
    .collect();
  const map = new Map<string, Doc<"documents">>();
  for (const d of byRecipient) {
    map.set(String(d._id), d);
  }
  try {
    const steps = await ctx.db
      .query("documentSteps")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
      .collect();
    for (const s of steps) {
      const key = String(s.documentId);
      if (map.has(key)) continue;
      const d = await ctx.db.get(s.documentId);
      if (d) map.set(key, d);
    }
  } catch {
    /* table absente ou index : ignorer */
  }
  return [...map.values()].filter((d) =>
    includeArchived ? true : !d.archivedAt,
  );
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
    /** Circuit séquentiel optionnel (après le 1er destinataire). */
    circuitAssigneeIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const sender = await ctx.db.get(userId);
    if (!sender) throw new Error("Compte introuvable.");

    // Anti-abus : max 20 envois / 10 minutes
    await assertRateLimit(ctx, {
      userId,
      action: "document.sent",
      maxPerWindow: 20,
      windowMs: 10 * 60 * 1000,
    });

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

    // Circuit : destinataire principal + suivants (sans doublons, max 8)
    const circuitIds: Id<"users">[] = [args.recipientId];
    for (const id of args.circuitAssigneeIds ?? []) {
      if (circuitIds.some((x) => x === id)) continue;
      if (id === userId) continue;
      circuitIds.push(id);
      if (circuitIds.length >= 8) break;
    }
    const circuitUsers = [];
    for (const id of circuitIds) {
      const u = await ctx.db.get(id);
      if (!u) throw new Error("Un intervenant du circuit est introuvable.");
      circuitUsers.push(u);
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
      publicRef: generatePublicRef(),
      hasCircuit: circuitUsers.length > 1,
      currentStepIndex: 0,
      circuitTotalSteps: circuitUsers.length,
      createdAt: now,
      updatedAt: now,
    });

    // Créer les étapes du circuit
    for (let i = 0; i < circuitUsers.length; i++) {
      const u = circuitUsers[i]!;
      await ctx.db.insert("documentSteps", {
        documentId,
        stepIndex: i,
        assigneeId: u._id,
        assigneeName: displayName(u),
        taskLabel: tasks[0],
        status: i === 0 ? "active" : "waiting",
        createdAt: now,
      });
    }

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

    // Notifications relatives pour chaque intervenant du circuit
    try {
      for (let i = 0; i < circuitUsers.length; i++) {
        const u = circuitUsers[i]!;
        const fromName =
          i === 0
            ? displayName(sender)
            : displayName(circuitUsers[i - 1]!);
        const toName =
          i < circuitUsers.length - 1
            ? displayName(circuitUsers[i + 1]!)
            : null;
        const isFirst = i === 0;
        await pushNotification(ctx, {
          userId: u._id,
          type: isFirst ? "document.received" : "document.circuit_pending",
          title: isFirst
            ? "Document à recevoir et traiter"
            : "Document à recevoir (circuit)",
          body: toName
            ? `De la part de ${fromName} — « ${objet} ». Après traitement, transmettre à ${toName}.`
            : `De la part de ${fromName} — « ${objet} ». Vous êtes la dernière étape : validez pour clôturer.`,
          documentId,
        });
      }
    } catch (e) {
      console.error("[send] notification circuit échouée:", e);
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

/** Relancer le résumé IA (document bloqué en_attente / indisponible). */
export const retrySummary = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document introuvable.");
    if (doc.senderId !== userId && doc.recipientId !== userId) {
      const user = await ctx.db.get(userId);
      if (!user || (user.role !== "admin" && user.role !== "root")) {
        throw new Error("Accès refusé.");
      }
    }
    await ctx.db.patch(args.documentId, {
      summaryStatus: "en_attente",
      summary: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.ai.summarizeDocument, {
      documentId: args.documentId,
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

    let documents = await collectInboxDocuments(
      ctx,
      userId,
      includeArchived,
    );
    documents = documents
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
    const documents = await collectInboxDocuments(ctx, userId, false);
    return await decorate(ctx, documents.sort(sortByDateDesc));
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
    try {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const document = await ctx.db.get(args.documentId);
    if (!document) return null;
    const user = await ctx.db.get(userId);
    let steps: Doc<"documentSteps">[] = [];
    try {
      steps = await ctx.db
        .query("documentSteps")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();
      steps.sort((a, b) => a.stepIndex - b.stepIndex);
    } catch (e) {
      console.error("[documents.get] steps", e);
      steps = [];
    }
    const isStepAssignee = steps.some((s) => s.assigneeId === userId);
    const isAdmin = isAdminRole(user?.role);
    if (
      document.senderId !== userId &&
      document.recipientId !== userId &&
      !isStepAssignee &&
      !isAdmin
    ) {
      return null;
    }

    const activeStep = steps.find((s) => s.status === "active") ?? null;
    const isSender = document.senderId === userId;
    const myStepIndex = steps.findIndex((s) => s.assigneeId === userId);
    const myStep = myStepIndex >= 0 ? steps[myStepIndex]! : null;
    const prevStep = myStepIndex > 0 ? steps[myStepIndex - 1]! : null;
    const nextStep =
      myStepIndex >= 0 && myStepIndex < steps.length - 1
        ? steps[myStepIndex + 1]!
        : null;

    const hasCircuit = Boolean(document.hasCircuit) || steps.length > 1;

    // Suivi global uniquement pour l'émetteur (créateur du circuit)
    const stepsGlobal = isSender
      ? steps.map((s) => ({
          _id: s._id,
          stepIndex: s.stepIndex,
          assigneeId: s.assigneeId,
          assigneeName: s.assigneeName,
          taskLabel: s.taskLabel ?? null,
          status: s.status,
          note: s.note ?? null,
          actedAt: s.actedAt ?? null,
          isMine: s.assigneeId === userId,
        }))
      : [];

    // Suivi relatif pour un intervenant du circuit
    const relativeTracking =
      !isSender && myStep
        ? {
            receiveFrom:
              myStepIndex === 0
                ? document.senderName
                : prevStep?.assigneeName ?? document.senderName,
            sendTo: nextStep?.assigneeName ?? null,
            isLastStep: !nextStep,
            myStatus: myStep.status,
            myStepIndex: myStep.stepIndex,
            waitingForPrevious:
              myStep.status === "waiting" &&
              prevStep != null &&
              prevStep.status !== "done",
            isMyTurn: myStep.status === "active",
          }
        : null;

    return {
      ...(await decorate(ctx, [document]))[0]!,
      downloadUrl: await ctx.storage.getUrl(document.storageId),
      isRecipient: document.recipientId === userId,
      isSender,
      publicRef: document.publicRef ?? null,
      hasCircuit,
      currentStepIndex: document.currentStepIndex ?? 0,
      circuitTotalSteps: document.circuitTotalSteps ?? steps.length,
      // Global seulement pour l'émetteur
      steps: stepsGlobal,
      // Intervenant : vue relative uniquement
      relativeTracking,
      activeStep: activeStep
        ? {
            stepIndex: activeStep.stepIndex,
            assigneeId: activeStep.assigneeId,
            assigneeName: activeStep.assigneeName,
            isMine: activeStep.assigneeId === userId,
            status: activeStep.status,
          }
        : null,
      canActOnStep:
        activeStep != null &&
        activeStep.assigneeId === userId &&
        document.status !== "traite",
      isFullyTreated:
        document.status === "traite" &&
        (steps.length === 0 || steps.every((s) => s.status === "done")),
    };
    } catch (e) {
      console.error("[documents.get]", e);
      return null;
    }
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

    try {
      await writeAudit(ctx, {
        action: "document.viewed",
        actorId: userId,
        actorName: displayName(user ?? {}),
        documentId: args.documentId,
        details: "Document consulté",
      });
    } catch (e) {
      console.error("[markViewed] audit", e);
    }

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
    // Circuit multi-étapes : utiliser « Valider mon étape » plutôt que Traité direct
    if (
      document.hasCircuit &&
      args.status === "traite" &&
      (document.currentStepIndex ?? 0) < (document.circuitTotalSteps ?? 1) - 1
    ) {
      throw new Error(
        "Ce document suit un circuit. Validez votre étape pour passer au suivant.",
      );
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
    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) return [];
      const document = await ctx.db.get(args.documentId);
      if (!document) return [];
      const user = await ctx.db.get(userId);
      let allowed =
        document.senderId === userId ||
        document.recipientId === userId ||
        isAdminRole(user?.role);
      if (!allowed) {
        try {
          const steps = await ctx.db
            .query("documentSteps")
            .withIndex("by_document", (q) =>
              q.eq("documentId", args.documentId),
            )
            .collect();
          allowed = steps.some((s) => s.assigneeId === userId);
        } catch {
          allowed = false;
        }
      }
      if (!allowed) return [];

      const logs = await ctx.db
        .query("auditLogs")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();

      return logs.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error("[documents.auditTrail]", e);
      return [];
    }
  },
});

/** Counters for the dashboard home. */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        received: 0,
        sent: 0,
        awaiting: 0,
        inProgress: 0,
        done: 0,
        byStatus: { envoye: 0, consulte: 0, en_cours: 0, traite: 0 },
        departments: 0,
        archived: 0,
      };
    }

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


/**
 * Vue d'ensemble entreprise — réservée au DG / root.
 * Tous les échanges et le suivi par département.
 */

/** Valider ou refuser l'étape active du circuit. */
export const completeStep = mutation({
  args: {
    documentId: v.id("documents"),
    decision: v.union(v.literal("done"), v.literal("rejected")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");
    const user = await ctx.db.get(userId);

    const steps = await ctx.db
      .query("documentSteps")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    steps.sort((a, b) => a.stepIndex - b.stepIndex);

    if (steps.length === 0) {
      // Pas de circuit : équivalent setStatus
      if (document.recipientId !== userId) {
        throw new Error("Seul le destinataire peut traiter ce document.");
      }
      const now = Date.now();
      await ctx.db.patch(args.documentId, {
        status: args.decision === "done" ? "traite" : "consulte",
        updatedAt: now,
      });
      return { done: args.decision === "done", advanced: false };
    }

    const active = steps.find((s) => s.status === "active");
    if (!active) throw new Error("Aucune étape active.");
    if (active.assigneeId !== userId) {
      throw new Error("Ce n'est pas votre tour dans le circuit.");
    }

    const now = Date.now();
    const note = args.note?.trim().slice(0, 500) || undefined;

    if (args.decision === "rejected") {
      await ctx.db.patch(active._id, {
        status: "rejected",
        note,
        actedAt: now,
      });
      await ctx.db.patch(args.documentId, {
        status: "consulte",
        updatedAt: now,
      });
      try {
        await writeAudit(ctx, {
          action: "document.step_rejected",
          actorId: userId,
          actorName: displayName(user ?? {}),
          documentId: args.documentId,
          details: note || "Étape refusée",
        });
      } catch {}
      try {
        await pushNotification(ctx, {
          userId: document.senderId,
          type: "document.status",
          title: "Étape refusée",
          body: `« ${document.objet} » — ${displayName(user ?? {})} a refusé l'étape ${active.stepIndex + 1}`,
          documentId: args.documentId,
        });
      } catch {}
      return { done: false, advanced: false, rejected: true };
    }

    // done
    await ctx.db.patch(active._id, {
      status: "done",
      note,
      actedAt: now,
    });


    const next = steps.find((s) => s.stepIndex === active.stepIndex + 1);
    if (!next) {
      // Complet uniquement si toutes les étapes sont done
      const refreshed = await ctx.db
        .query("documentSteps")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();
      const allDone = refreshed.every((s) => s.status === "done");
      if (!allDone) {
        throw new Error(
          "Le document n'est pas entièrement traité : des étapes restent ouvertes.",
        );
      }
      await ctx.db.patch(args.documentId, {
        status: "traite",
        currentStepIndex: active.stepIndex,
        updatedAt: now,
        archivedAt: now,
        archivedBy: userId,
      });
      try {
        await writeAudit(ctx, {
          action: "document.circuit_complete",
          actorId: userId,
          actorName: displayName(user ?? {}),
          documentId: args.documentId,
          details: "Circuit terminé",
        });
      } catch {}
      try {
        await pushNotification(ctx, {
          userId: document.senderId,
          type: "document.status",
          title: "Document entièrement traité",
          body: `« ${document.objet} » — toutes les étapes sont terminées`,
          documentId: args.documentId,
        });
      } catch {}
      return { done: true, advanced: false };
    }

    // Avancer vers l'étape suivante
    await ctx.db.patch(next._id, { status: "active" });
    const nextUser = await ctx.db.get(next.assigneeId);
    await ctx.db.patch(args.documentId, {
      recipientId: next.assigneeId,
      recipientName: next.assigneeName,
      recipientDepartmentId: nextUser?.departmentId,
      currentStepIndex: next.stepIndex,
      status: "en_cours",
      updatedAt: now,
    });

    try {
      await writeAudit(ctx, {
        action: "document.step_done",
        actorId: userId,
        actorName: displayName(user ?? {}),
        documentId: args.documentId,
        details: `Étape ${active.stepIndex + 1} validée → ${next.assigneeName}`,
      });
    } catch {}
    try {
      const afterNext = steps.find((s) => s.stepIndex === next.stepIndex + 1);
      await pushNotification(ctx, {
        userId: next.assigneeId,
        type: "document.received",
        title: "Vous devez recevoir ce document",
        body: afterNext
          ? `De la part de ${displayName(user ?? {})} — « ${document.objet} ». Après traitement, transmettre à ${afterNext.assigneeName}.`
          : `De la part de ${displayName(user ?? {})} — « ${document.objet} ». Dernière étape : validez pour clôturer le circuit.`,
        documentId: args.documentId,
      });
    } catch {}
    try {
      await pushNotification(ctx, {
        userId: document.senderId,
        type: "document.status",
        title: "Circuit avancé",
        body: `« ${document.objet} » — passé à ${next.assigneeName}`,
        documentId: args.documentId,
      });
    } catch {}

    return { done: false, advanced: true, nextAssignee: next.assigneeName };
  },
});



export const enterpriseOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const me = await ctx.db.get(userId);
    if (!me || (me.role !== "admin" && me.role !== "root")) {
      return null;
    }

    const [docs, departments, users, joinReqs] = await Promise.all([
      ctx.db.query("documents").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("departmentJoinRequests").collect(),
    ]);

    const active = docs.filter((d) => !d.archivedAt);
    const byStatus = {
      envoye: active.filter((d) => d.status === "envoye").length,
      consulte: active.filter((d) => d.status === "consulte").length,
      en_cours: active.filter((d) => d.status === "en_cours").length,
      traite: active.filter((d) => d.status === "traite").length,
    };
    const open = byStatus.envoye + byStatus.consulte + byStatus.en_cours;
    const overdue = active.filter((d) => {
      if (d.status === "traite") return false;
      const age = Date.now() - (d.createdAt ?? d._creationTime);
      return age > 48 * 3600 * 1000;
    }).length;

    const depMap = new Map(
      departments.map((d) => [String(d._id), d] as const),
    );

    type DepRow = {
      departmentId: string;
      name: string;
      members: number;
      chiefs: number;
      sent: number;
      received: number;
      open: number;
      traite: number;
      overdue: number;
    };

    const perDept = new Map<string, DepRow>();
    const ensure = (id: string | undefined | null, fallbackName?: string) => {
      const key = id ? String(id) : "__none__";
      if (!perDept.has(key)) {
        const dep = id ? depMap.get(String(id)) : null;
        perDept.set(key, {
          departmentId: key,
          name: dep?.name ?? fallbackName ?? "Sans département",
          members: 0,
          chiefs: 0,
          sent: 0,
          received: 0,
          open: 0,
          traite: 0,
          overdue: 0,
        });
      }
      return perDept.get(key)!;
    };

    for (const u of users) {
      if (u.accountStatus && u.accountStatus !== "valide" && u.role !== "admin" && u.role !== "root") {
        continue;
      }
      const row = ensure(u.departmentId ? String(u.departmentId) : null);
      if (u.departmentId) {
        row.members += 1;
        if (u.departmentRole === "chef") row.chiefs += 1;
      }
    }

    for (const d of active) {
      const senderRow = ensure(
        d.senderDepartmentId ? String(d.senderDepartmentId) : null,
      );
      senderRow.sent += 1;
      const recvRow = ensure(
        d.recipientDepartmentId ? String(d.recipientDepartmentId) : null,
      );
      recvRow.received += 1;
      if (d.status !== "traite") {
        recvRow.open += 1;
        const age = Date.now() - (d.createdAt ?? d._creationTime);
        if (age > 48 * 3600 * 1000) recvRow.overdue += 1;
      } else {
        recvRow.traite += 1;
      }
    }

    // Inclure tous les départements même sans docs
    for (const dep of departments) {
      ensure(String(dep._id), dep.name);
    }

    const departmentStats = [...perDept.values()]
      .filter((r) => r.departmentId !== "__none__" || r.sent + r.received > 0)
      .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, "fr"));

    const recent = [...active]
      .sort(
        (a, b) =>
          Number(b.createdAt ?? b._creationTime) -
          Number(a.createdAt ?? a._creationTime),
      )
      .slice(0, 20)
      .map((d) => ({
        _id: d._id,
        fileName: d.fileName,
        objet: d.objet,
        status: d.status,
        senderName: d.senderName,
        recipientName: d.recipientName,
        senderDepartment:
          (d.senderDepartmentId &&
            depMap.get(String(d.senderDepartmentId))?.name) ||
          "—",
        recipientDepartment:
          (d.recipientDepartmentId &&
            depMap.get(String(d.recipientDepartmentId))?.name) ||
          "—",
        createdAt: d.createdAt ?? d._creationTime,
        tasks: d.tasks ?? [],
      }));

    const pendingAccounts = users.filter(
      (u) => u.accountStatus === "en_attente",
    ).length;
    const pendingJoins = joinReqs.filter((r) => r.status === "pending").length;
    const validatedUsers = users.filter(
      (u) =>
        !u.accountStatus ||
        u.accountStatus === "valide" ||
        u.role === "admin" ||
        u.role === "root",
    ).length;

    return {
      totals: {
        documents: active.length,
        open,
        traite: byStatus.traite,
        overdue,
        byStatus,
        departments: departments.length,
        users: validatedUsers,
        pendingAccounts,
        pendingJoins,
      },
      departmentStats,
      recent,
      generatedAt: Date.now(),
    };
  },
});
