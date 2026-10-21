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
/** SLA par défaut par étape de circuit (heures). */
export const DEFAULT_STEP_DEADLINE_HOURS = 48;
/** Délai minimum entre deux relances (ms). */
export const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000;

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
  const seq = String(Math.floor(1 + Math.random() * 98)).padStart(3, "0");
  return `N°${seq}-${y}/MNDPT`;
}

/**
 * N° officiel : N°{seq}-{année}/MNDPT/{hiérarchie codes du sommet → feuille}
 * Ex. émetteur DTD rattaché DGDN → SG → N°071-2026/MNDPT/SG/DGDN/DTD
 */
async function generateOfficialNumero(
  ctx: MutationCtx,
  senderDepartmentId: Id<"departments"> | undefined | null,
): Promise<string> {
  const y = new Date().getFullYear();
  const codes: string[] = [];
  let currentId: Id<"departments"> | null | undefined = senderDepartmentId;
  let guard = 0;
  while (currentId && guard < 12) {
    guard += 1;
    const dep = await ctx.db.get(currentId);
    if (!dep) break;
    const code = (dep.code ?? "").trim().toUpperCase();
    if (code && code !== "MNDPT") {
      codes.unshift(code);
    }
    currentId = dep.parentId ?? null;
  }
  // Dédupliquer codes adjacents (sécurité)
  const unique: string[] = [];
  for (const c of codes) {
    if (unique[unique.length - 1] !== c) unique.push(c);
  }
  const path =
    unique.length > 0 ? `MNDPT/${unique.join("/")}` : "MNDPT";

  // Séquence annuelle approximative (nb de courriers de l'année + 1)
  let seq = 1;
  try {
    const all = await ctx.db.query("documents").collect();
    const prefix = `N°`;
    const yearTag = `-${y}/`;
    const count = all.filter(
      (d) =>
        d.publicRef &&
        d.publicRef.includes(yearTag) &&
        d.publicRef.startsWith(prefix),
    ).length;
    seq = count + 1;
  } catch {
    seq = Math.floor(1 + Math.random() * 98);
  }
  const seqStr = String(Math.min(seq, 999)).padStart(3, "0");
  return `N°${seqStr}-${y}/${path}`;
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


/**
 * Documents visibles en « reçus » :
 * - destinataire nommé
 * - intervenant du circuit
 * - membre de la structure destinataire (direction/service) ou d'un service enfant
 */
async function collectInboxDocuments(
  ctx: DbCtx,
  userId: Id<"users">,
  includeArchived: boolean,
) {
  const me = await ctx.db.get(userId);
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

  // Envoi structurel + transmissions multi-destinataires
  if (me?.departmentId) {
    const myDeptId = String(me.departmentId);
    const allDepts = await ctx.db.query("departments").collect();
    const relevant = new Set<string>([myDeptId]);
    const mine = allDepts.find((d) => String(d._id) === myDeptId);
    if (mine?.parentId) relevant.add(String(mine.parentId));
    for (const d of allDepts) {
      if (d.parentId && String(d.parentId) === myDeptId) {
        relevant.add(String(d._id));
      }
    }

    for (const rid of relevant) {
      try {
        const structural = await ctx.db
          .query("documents")
          .withIndex("by_recipient_department", (q) =>
            q.eq("recipientDepartmentId", rid as Id<"departments">),
          )
          .collect();
        for (const d of structural) map.set(String(d._id), d);
      } catch {
        /* ignore */
      }
      try {
        const txs = await ctx.db
          .query("documentTransmissions")
          .withIndex("by_department", (q) =>
            q.eq("departmentId", rid as Id<"departments">),
          )
          .collect();
        for (const tx of txs) {
          if (map.has(String(tx.documentId))) continue;
          const d = await ctx.db.get(tx.documentId);
          if (d) map.set(String(d._id), d);
        }
      } catch {
        /* table absente */
      }
    }
  }

  return [...map.values()].filter((d) =>
    includeArchived ? true : !d.archivedAt,
  );
}

async function decorate(ctx: DbCtx, documents: Doc<"documents">[]) {
  return await Promise.all(
    documents.map(async (document) => {
      let fileUrl: string | null = null;
      try {
        fileUrl = await ctx.storage.getUrl(document.storageId);
      } catch {
        fileUrl = null;
      }
      return {
        ...document,
        summary: document.summary ?? null,
        summarySource: document.summarySource ?? null,
        senderDepartmentName: await departmentName(
          ctx,
          document.senderDepartmentId,
        ),
        recipientDepartmentName: await departmentName(
          ctx,
          document.recipientDepartmentId,
        ),
        fileUrl,
      };
    }),
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
 * L'intermédiaire joint la version modifiée du fichier.
 * Même dossier / même identifiant publicRef — pas un nouvel envoi.
 */
export const attachRevision = mutation({
  args: {
    documentId: v.id("documents"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    note: v.optional(v.string()),
    /** Tâches optionnelles destinées au prochain intervenant du circuit */
    tasksForNext: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");
    if (document.status === "traite") {
      throw new Error("Ce document est déjà clôturé.");
    }

    const user = await ctx.db.get(userId);
    let steps: Doc<"documentSteps">[] = [];
    try {
      steps = await ctx.db
        .query("documentSteps")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();
    } catch {
      steps = [];
    }
    const myStep = steps.find((s) => s.assigneeId === userId);
    const allowed =
      document.recipientId === userId ||
      Boolean(myStep) ||
      isAdminRole(user?.role);
    if (!allowed) {
      throw new Error("Vous n'êtes pas autorisé à renvoyer ce dossier.");
    }

    validateFile({
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
    });

    const now = Date.now();
    // Historique de la version précédente
    await ctx.db.insert("documentRevisions", {
      documentId: args.documentId,
      storageId: document.storageId,
      fileName: document.fileName,
      contentType: document.contentType,
      size: document.size,
      uploadedBy: userId,
      uploadedByName: displayName(user ?? {}),
      stepIndex: myStep?.stepIndex,
      note: args.note?.trim().slice(0, 300) || "Version précédente archivée",
      createdAt: now,
    });

    const tasksForNext = (args.tasksForNext ?? [])
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 30);

    // Le fichier courant devient la version renvoyée (même id, même publicRef)
    const docPatch: Record<string, unknown> = {
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      revisionCount: (document.revisionCount ?? 0) + 1,
      lastRevisedAt: now,
      lastRevisedByName: displayName(user ?? {}),
      updatedAt: now,
      status: document.status === "envoye" ? "en_cours" : document.status,
    };
    if (tasksForNext.length > 0) {
      docPatch.tasks = tasksForNext;
      docPatch.task = tasksForNext.join(" · ");
    }
    await ctx.db.patch(args.documentId, docPatch);

    // Attribuer les tâches au prochain dans le circuit (étape suivante en attente ou active)
    if (tasksForNext.length > 0 && myStep) {
      const ordered = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
      const nextStep =
        ordered.find((s) => s.stepIndex === myStep.stepIndex + 1) ??
        ordered.find(
          (s) =>
            s.stepIndex > myStep.stepIndex &&
            (s.status === "waiting" || s.status === "active"),
        );
      if (nextStep) {
        try {
          await ctx.db.patch(nextStep._id, {
            taskLabel: tasksForNext.join(" · ").slice(0, 500),
          });
        } catch (e) {
          console.error("[attachRevision] next taskLabel", e);
        }
      }
    }

    // Nouvelle révision enregistrée aussi
    await ctx.db.insert("documentRevisions", {
      documentId: args.documentId,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      uploadedBy: userId,
      uploadedByName: displayName(user ?? {}),
      stepIndex: myStep?.stepIndex,
      note:
        (
          (args.note?.trim() || "Fichier modifié renvoyé dans le circuit") +
          (tasksForNext.length
            ? ` | Tâches pour la suite : ${tasksForNext.join(", ")}`
            : "")
        ).slice(0, 500),
      createdAt: now + 1,
    });

    try {
      await writeAudit(ctx, {
        action: "document.revision",
        actorId: userId,
        actorName: displayName(user ?? {}),
        documentId: args.documentId,
        details: `Nouvelle version : ${args.fileName} (réf. ${document.publicRef ?? "—"})`,
      });
    } catch {}

    try {
      await pushNotification(ctx, {
        userId: document.senderId,
        type: "document.status",
        title: "Fichier mis à jour dans le circuit",
        body: `${displayName(user ?? {})} a renvoyé une version de « ${document.objet} » (${document.publicRef ?? "dossier"})${
          tasksForNext.length ? ` — tâches : ${tasksForNext.slice(0, 3).join(", ")}` : ""
        }`,
        documentId: args.documentId,
      });
    } catch {}

    return {
      publicRef: document.publicRef ?? null,
      mailKind: document.mailKind ?? "envoi",
      revisionCount: (document.revisionCount ?? 0) + 1,
      tasksForNext,
    };
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
    observations: v.optional(v.string()),
    tasks: v.array(v.string()),
    extractedText: v.optional(v.string()),
    /** Destinataire nommé (optionnel si envoi structurel) */
    recipientId: v.optional(v.id("users")),
    /** Destination principale : direction ou service MNDPT */
    recipientDepartmentId: v.optional(v.id("departments")),
    /** Circuit de structures (après la 1re), optionnel */
    circuitDepartmentIds: v.optional(v.array(v.id("departments"))),
    /**
     * Destinations multiples (directions/services).
     * kind: traitement (doit traiter) | ampliation (pour info).
     * Si fourni, prioritaire sur recipientDepartmentId seul.
     */
    recipientTargets: v.optional(
      v.array(
        v.object({
          departmentId: v.id("departments"),
          kind: v.union(v.literal("traitement"), v.literal("ampliation")),
        }),
      ),
    ),
    onBehalfOfType: v.union(v.literal("internal"), v.literal("external")),
    onBehalfOfUserId: v.optional(v.id("users")),
    onBehalfOfName: v.optional(v.string()),
    onBehalfOfFunction: v.optional(v.string()),
    onBehalfOfDepartment: v.optional(v.string()),
    /** Circuit séquentiel optionnel (après le 1er destinataire). */
    circuitAssigneeIds: v.optional(v.array(v.id("users"))),
    /** N° officiel du courrier (manuel ou auto). */
    publicRef: v.optional(v.string()),
    /** Délai max par étape (heures), défaut 48. */
    stepDeadlineHours: v.optional(v.number()),
    parentCourrierId: v.optional(v.id("documents")),
    referenceText: v.optional(v.string()),
    requiresResponse: v.optional(v.boolean()),
    /** Structure qui émet le courrier (pour le N° hiérarchique) */
    emittingDepartmentId: v.optional(v.id("departments")),
    /** envoi (défaut) ou transmission de courrier papier */
    mailKind: v.optional(
      v.union(v.literal("envoi"), v.literal("transmission")),
    ),
    /** Champs additionnels (max 8) */
    customFields: v.optional(
      v.array(
        v.object({
          label: v.string(),
          value: v.string(),
          source: v.optional(
            v.union(
              v.literal("manual"),
              v.literal("courrier"),
              v.literal("structure"),
            ),
          ),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const sender = await ctx.db.get(userId);
    if (!sender) throw new Error("Compte introuvable.");

    // Anti-abus : max 20 envois / 10 minutes
    await assertRateLimit(ctx, {
      userId,
      action: "document.sent",
      maxPerWindow: 60,
      windowMs: 10 * 60 * 1000,
    });

    // Validation serveur des fichiers
    validateFile({
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
    });

    let manualRef = (args.publicRef ?? "").trim();
    // Normaliser espaces ; conserver N° officiel ou REF-
    if (manualRef) {
      const up = manualRef.toUpperCase();
      if (
        !up.startsWith("N°") &&
        !up.startsWith("Nº") &&
        !up.startsWith("REF-") &&
        !up.startsWith("SD-")
      ) {
        // Saisie libre courte → préfixe N° année si purement alphanumérique court
        if (/^[A-Z0-9\/\-]+$/i.test(manualRef) && manualRef.length < 12) {
          manualRef = `N°${manualRef}`;
        }
      }
    }

    // N° unique : pas de continuation de circuit
    if (manualRef) {
      const existing = await ctx.db
        .query("documents")
        .withIndex("by_publicRef", (q) => q.eq("publicRef", manualRef))
        .first();
      if (existing) {
        throw new Error(
          existing.status === "traite"
            ? `Le dossier « ${manualRef} » est déjà clôturé. Utilisez un nouvel identifiant.`
            : `Le N° « ${manualRef} » est déjà utilisé. Choisissez un autre numéro pour un nouvel envoi.`,
        );
      }
    }

    const objet = args.objet.trim();
    if (!objet) throw new Error("Précisez l'objet de l'envoi.");

    const tasks = args.tasks.map((t) => t.trim()).filter(Boolean);
    if (tasks.length === 0) {
      throw new Error("Sélectionnez au moins une tâche à réaliser.");
    }

    // ——— Résolution destinataire : STRUCTURE (prioritaire) ou personne ———
    const allUsers = await ctx.db.query("users").collect();
    const membersOfDept = (deptId: Id<"departments">) =>
      allUsers.filter(
        (u) =>
          u.departmentId &&
          String(u.departmentId) === String(deptId) &&
          (u.accountStatus === "valide" ||
            !u.accountStatus ||
            u.role === "admin" ||
            u.role === "root"),
      );

    // Destinations structurelles prioritaires (multi-cibles)
    let recipientDeptId = args.recipientDepartmentId;
    if (
      !recipientDeptId &&
      args.recipientTargets &&
      args.recipientTargets.length > 0
    ) {
      const firstTreat =
        args.recipientTargets.find((t) => t.kind === "traitement") ??
        args.recipientTargets[0];
      recipientDeptId = firstTreat?.departmentId;
    }
    let recipientDept = recipientDeptId
      ? await ctx.db.get(recipientDeptId)
      : null;

    let recipient: Doc<"users"> | null = null;
    if (args.recipientId) {
      recipient = await ctx.db.get(args.recipientId);
      if (!recipient) throw new Error("Destinataire introuvable.");
      if (recipient._id === userId) {
        throw new Error(
          "Vous ne pouvez pas vous envoyer un document à vous-même.",
        );
      }
      // Si pas de structure choisie, prendre le département de la personne
      if (!recipientDeptId && recipient.departmentId) {
        recipientDeptId = recipient.departmentId;
        recipientDept = await ctx.db.get(recipient.departmentId);
      }
    } else if (recipientDeptId && recipientDept) {
      // Envoi structurel : le dossier appartient à la structure.
      // Si des membres existent, on peut noter le chef comme contact (optionnel).
      // Jamais l'émetteur admin comme « récepteur » artificiel.
      const members = membersOfDept(recipientDeptId).filter(
        (m) => String(m._id) !== String(userId),
      );
      const chef = members.find((m) => m.departmentRole === "chef");
      recipient = chef ?? members[0] ?? null;
    } else {
      throw new Error(
        "Choisissez une direction ou un service destinataire (ou une personne).",
      );
    }

    // Circuit personnes (compat) — uniquement s'il y a un destinataire nommé
    const circuitIds: Id<"users">[] = [];
    if (recipient) circuitIds.push(recipient._id);
    for (const id of args.circuitAssigneeIds ?? []) {
      if (circuitIds.some((x) => x === id)) continue;
      if (id === userId) continue;
      circuitIds.push(id);
      if (circuitIds.length >= 8) break;
    }

    // Circuit de structures → un représentant (chef/membre) par structure
    const circuitDeptIds: Id<"departments">[] = [];
    if (recipientDeptId) circuitDeptIds.push(recipientDeptId);
    for (const did of args.circuitDepartmentIds ?? []) {
      if (circuitDeptIds.some((x) => String(x) === String(did))) continue;
      circuitDeptIds.push(did);
      if (circuitDeptIds.length >= 8) break;
    }

    type CircuitNode = {
      user: Doc<"users">;
      departmentId?: Id<"departments">;
      departmentName?: string;
    };
    const circuitNodes: CircuitNode[] = [];

    if (circuitDeptIds.length > 0 && !args.circuitAssigneeIds?.length) {
      // Mode structure : étapes personne seulement s'il y a un membre réel
      // (sinon le dossier reste stocké sur la structure via transmissions)
      for (const did of circuitDeptIds) {
        const dep = await ctx.db.get(did);
        const members = membersOfDept(did).filter(
          (m) => String(m._id) !== String(userId),
        );
        const chef = members.find((m) => m.departmentRole === "chef");
        const rep = chef ?? members[0] ?? null;
        if (!rep) continue;
        circuitNodes.push({
          user: rep,
          departmentId: did,
          departmentName: dep?.name ?? dep?.code,
        });
      }
    } else {
      for (const id of circuitIds) {
        const u = await ctx.db.get(id);
        if (!u) throw new Error("Un intervenant du circuit est introuvable.");
        let depName: string | undefined;
        if (u.departmentId) {
          const dep = await ctx.db.get(u.departmentId);
          depName = dep?.name;
        }
        circuitNodes.push({
          user: u,
          departmentId: u.departmentId,
          departmentName: depName,
        });
      }
    }

    const circuitUsers = circuitNodes.map((n) => n.user);

    // Resolve "de la part de"
    let onBehalfOfName = args.onBehalfOfName?.trim() || undefined;
    let onBehalfOfFunction = args.onBehalfOfFunction?.trim() || undefined;
    let onBehalfOfDepartment = args.onBehalfOfDepartment?.trim() || undefined;
    let onBehalfOfUserId = args.onBehalfOfUserId;

    if (args.onBehalfOfType === "internal") {
      // Signataire = fonction (pas une personne nommée)
      if (onBehalfOfFunction) {
        onBehalfOfName = undefined;
        onBehalfOfUserId = undefined;
      } else if (onBehalfOfUserId) {
        const onBehalfUser = await ctx.db.get(onBehalfOfUserId);
        if (!onBehalfUser) throw new Error("Personne introuvable.");
        // Ne plus exposer le nom : uniquement la fonction si disponible
        onBehalfOfName = undefined;
        onBehalfOfFunction =
          onBehalfOfFunction || onBehalfUser.fonction || undefined;
        onBehalfOfUserId = undefined;
        if (onBehalfUser.departmentId) {
          const dept = await ctx.db.get(onBehalfUser.departmentId);
          onBehalfOfDepartment = dept?.name ?? undefined;
        }
      }
      if (!onBehalfOfDepartment && args.emittingDepartmentId) {
        const ed = await ctx.db.get(args.emittingDepartmentId);
        if (ed) {
          onBehalfOfDepartment = ed.code
            ? `${ed.code} — ${ed.name}`
            : ed.name;
        }
      }
      // Structure émettrice suffit pour l'envoi interne
      if (!args.emittingDepartmentId && !onBehalfOfUserId) {
        throw new Error(
          "Choisissez la structure qui émet le courrier (étape Émetteur).",
        );
      }
    } else {
      if (!onBehalfOfName) {
        throw new Error(
          "Indiquez le nom de la personne au nom de qui vous envoyez.",
        );
      }
      onBehalfOfUserId = undefined;
    }

    const sanitizedCustomFields = (args.customFields ?? [])
      .slice(0, 8)
      .map((f) => ({
        label: f.label.trim().slice(0, 80),
        value: f.value.trim().slice(0, 500),
        source: f.source,
      }))
      .filter((f) => f.label.length > 0 && f.value.length > 0);

    // Courrier parent (réponse)
    let parentCourrierId = args.parentCourrierId;
    let referenceText = args.referenceText?.trim().slice(0, 500) || undefined;
    if (parentCourrierId) {
      const parent = await ctx.db.get(parentCourrierId);
      if (!parent || !("objet" in parent)) {
        throw new Error("Courrier d'origine introuvable.");
      }
      const parentDoc = parent as Doc<"documents">;
      if (!referenceText) {
        referenceText = parentDoc.publicRef
          ? `Votre correspondance ${parentDoc.publicRef}`
          : `Votre courrier « ${parentDoc.objet} »`;
      }
    }

    const emittingDeptId =
      args.emittingDepartmentId ?? sender.departmentId ?? undefined;

    const isTransmission = args.mailKind === "transmission";
    if (isTransmission) {
      const refTxt = (args.referenceText ?? "").trim();
      if (!refTxt) {
        throw new Error(
          "Pour une transmission, indiquez la Réf. du courrier papier (obligatoire).",
        );
      }
    }

    let finalRef: string | undefined = manualRef || undefined;
    if (isTransmission) {
      // Pas de N° officiel de sortie
      finalRef = undefined;
    } else if (!finalRef) {
      finalRef = await generateOfficialNumero(ctx, emittingDeptId);
    }

    const now = Date.now();
    const documentId = await ctx.db.insert("documents", {
      fileName: args.fileName,
      storageId: args.storageId,
      contentType: args.contentType,
      size: args.size,
      objet,
      observations: args.observations?.trim().slice(0, 2000) || undefined,
      tasks,
      task: tasks.join(" · "),
      onBehalfOfType: args.onBehalfOfType,
      onBehalfOfUserId,
      onBehalfOfName,
      onBehalfOfFunction,
      onBehalfOfDepartment,
      customFields: sanitizedCustomFields,
      extractedText: args.extractedText?.slice(0, 40000),
      summaryStatus: "en_attente",
      senderId: userId,
      senderName: displayName(sender),
      senderDepartmentId: emittingDeptId ?? sender.departmentId,
      recipientId: recipient?._id,
      recipientName: recipientDept
        ? `${recipientDept.code ? recipientDept.code + " — " : ""}${recipientDept.name}`
        : recipient
          ? displayName(recipient)
          : "Structure",
      recipientDepartmentId:
        recipientDeptId ?? recipient?.departmentId ?? undefined,
      status: "envoye",
      publicRef: finalRef,
      mailKind: isTransmission ? "transmission" : "envoi",
      parentCourrierId: parentCourrierId,
      referenceText,
      requiresResponse: args.requiresResponse === true,
      hasCircuit: circuitUsers.length > 1,
      currentStepIndex: 0,
      circuitTotalSteps: circuitUsers.length,
      stepDeadlineHours: Math.min(
        168,
        Math.max(1, Math.floor(args.stepDeadlineHours ?? DEFAULT_STEP_DEADLINE_HOURS)),
      ),
      dueAt:
        now +
        Math.max(1, circuitUsers.length || 1) *
          Math.min(
            168,
            Math.max(1, Math.floor(args.stepDeadlineHours ?? DEFAULT_STEP_DEADLINE_HOURS)),
          ) *
          3600 *
          1000,
      createdAt: now,
      updatedAt: now,
    });

    const stepHours = Math.min(
      168,
      Math.max(1, Math.floor(args.stepDeadlineHours ?? DEFAULT_STEP_DEADLINE_HOURS)),
    );
    // Créer les étapes du circuit (structure et/ou personne)
    for (let i = 0; i < circuitNodes.length; i++) {
      const node = circuitNodes[i]!;
      const u = node.user;
      const isFirst = i === 0;
      await ctx.db.insert("documentSteps", {
        documentId,
        stepIndex: i,
        assigneeId: u._id,
        assigneeName: node.departmentName
          ? `${node.departmentName}`
          : displayName(u),
        assigneeDepartmentName: node.departmentName,
        assigneeDepartmentId: node.departmentId,
        taskLabel: tasks[0],
        status: isFirst ? "active" : "waiting",
        activatedAt: isFirst ? now : undefined,
        dueAt: isFirst ? now + stepHours * 3600 * 1000 : undefined,
        createdAt: now,
      });
    }

    // ——— Transmissions structurelles (document unique, multi-destinataires) ———
    try {
      type Target = {
        departmentId: Id<"departments">;
        kind: "traitement" | "ampliation";
      };
      const targets: Target[] = [];
      const seen = new Set<string>();
      const pushTarget = (
        id: Id<"departments">,
        kind: "traitement" | "ampliation",
      ) => {
        const k = String(id);
        if (seen.has(k)) return;
        seen.add(k);
        targets.push({ departmentId: id, kind });
      };

      if (args.recipientTargets && args.recipientTargets.length > 0) {
        for (const rt of args.recipientTargets) {
          pushTarget(rt.departmentId, rt.kind);
        }
      } else {
        if (recipientDeptId) pushTarget(recipientDeptId, "traitement");
        for (const did of args.circuitDepartmentIds ?? []) {
          pushTarget(did, "traitement");
        }
      }
      // Garantir au moins la destination principale
      if (targets.length === 0 && recipientDeptId) {
        pushTarget(recipientDeptId, "traitement");
      }

      for (const tr of targets) {
        const dep = await ctx.db.get(tr.departmentId);
        if (!dep) continue;
        await ctx.db.insert("documentTransmissions", {
          documentId,
          departmentId: tr.departmentId,
          departmentName: dep.name,
          departmentCode: dep.code,
          kind: tr.kind,
          status: "envoye",
          createdAt: now,
          updatedAt: now,
        });
      }
    } catch (e) {
      console.error("[send] transmissions:", e);
    }

    // Secondaires : ne doivent jamais faire échouer l'envoi (transaction unique)
    try {
      await writeAudit(ctx, {
        action: "document.sent",
        actorId: userId,
        actorName: displayName(sender),
        documentId,
        details: `Envoi à ${
          recipientDept
            ? `${recipientDept.code ? recipientDept.code + " — " : ""}${recipientDept.name}`
            : recipient
              ? displayName(recipient)
              : "structure"
        } — ${objet}`,
        metadata: { tasks, fileName: args.fileName },
      });
    } catch (e) {
      console.error("[send] audit log échoué:", e);
    }

        // Notifier les membres des structures destinataires (+ services enfants)
    try {
      const notifyDeptIds = new Set<string>();
      if (recipientDeptId) notifyDeptIds.add(String(recipientDeptId));
      for (const rt of args.recipientTargets ?? []) {
        notifyDeptIds.add(String(rt.departmentId));
      }
      if (notifyDeptIds.size > 0) {
        const allDepts = await ctx.db.query("departments").collect();
        const audienceIds = new Set<string>(notifyDeptIds);
        for (const d of allDepts) {
          if (d.parentId && notifyDeptIds.has(String(d.parentId))) {
            audienceIds.add(String(d._id));
          }
        }
        const notified = new Set<string>();
        for (const aid of audienceIds) {
          const members = membersOfDept(aid as Id<"departments">);
          for (const m of members) {
            if (m._id === userId) continue;
            if (notified.has(String(m._id))) continue;
            notified.add(String(m._id));
            await pushNotification(ctx, {
              userId: m._id,
              type: "document.received",
              title: "Nouveau document pour votre structure",
              body: `${displayName(sender)} → ${recipientDept?.code ?? recipientDept?.name ?? "structure"} — « ${objet} »`,
              documentId,
            });
          }
        }
      }
    } catch (e) {
      console.error("[send] notif structure échouée:", e);
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

    if (recipient?.email) {
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
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
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
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
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


/** N° des courriers reçus (pour le champ Réf. à l'envoi / réponse). */
export const listReceivedRefs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    try {
      const docs = await collectInboxDocuments(ctx, userId, false);
      const seen = new Set<string>();
      const out: Array<{
        publicRef: string;
        objet: string;
        documentId: Id<"documents">;
        createdAt: number;
      }> = [];
      for (const d of docs.sort(sortByDateDesc)) {
        let ref = (d.publicRef ?? "").trim();
        if (!ref) {
          // Ancien courrier sans N° : libellé utilisable en Réf.
          const y = new Date(d.createdAt).getFullYear();
          ref = `Courrier du ${y} — ${(d.objet || d.fileName).slice(0, 50)}`;
        }
        if (seen.has(ref)) continue;
        seen.add(ref);
        out.push({
          publicRef: ref,
          objet: d.objet || d.fileName,
          documentId: d._id,
          createdAt: d.createdAt,
        });
        if (out.length >= 100) break;
      }
      return out;
    } catch (e) {
      console.error("[listReceivedRefs]", e);
      return [];
    }
  },
});

/** Compatibilité : anciennes queries sans args (utilisées par le dashboard) */
export const inboxAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const documents = await collectInboxDocuments(ctx, userId, false);
    return await decorate(ctx, documents.sort(sortByDateDesc));
  },
});

export const sentAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
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
    const isSender = document.senderId === userId;

    // Membre d'une structure destinataire (même sans recipientId nommé)
    let isStructureViewer = false;
    try {
      const meUser = await ctx.db.get(userId);
      if (meUser?.departmentId) {
        const myDept = String(meUser.departmentId);
        const allDepts = await ctx.db.query("departments").collect();
        const mine = allDepts.find((d) => String(d._id) === myDept);
        const matchIds = new Set<string>([myDept]);
        if (mine?.parentId) matchIds.add(String(mine.parentId));
        for (const d of allDepts) {
          if (d.parentId && String(d.parentId) === myDept) {
            matchIds.add(String(d._id));
          }
        }
        if (
          document.recipientDepartmentId &&
          matchIds.has(String(document.recipientDepartmentId))
        ) {
          isStructureViewer = true;
        }
        if (!isStructureViewer) {
          const txs = await ctx.db
            .query("documentTransmissions")
            .withIndex("by_document", (q) =>
              q.eq("documentId", document._id),
            )
            .collect();
          isStructureViewer = txs.some((tr) =>
            matchIds.has(String(tr.departmentId)),
          );
        }
      }
    } catch {
      /* ignore */
    }

    if (
      !isSender &&
      document.recipientId !== userId &&
      !isStepAssignee &&
      !isAdmin &&
      !isStructureViewer
    ) {
      return null;
    }

    const activeStep = steps.find((s) => s.status === "active") ?? null;
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
          assigneeDepartmentName: s.assigneeDepartmentName ?? null,
          taskLabel: s.taskLabel ?? null,
          status: s.status,
          statusLabel:
            s.status === "done"
              ? "Traité (étape terminée)"
              : s.status === "active"
                ? "En cours ici"
                : s.status === "rejected"
                  ? "Refusé"
                  : "En attente",
          note: s.note ?? null,
          actedAt: s.actedAt ?? null,
          isMine: s.assigneeId === userId,
          isCurrent: s.status === "active",
        }))
      : [];

    const currentLocation =
      activeStep != null
        ? {
            name: activeStep.assigneeName,
            department: activeStep.assigneeDepartmentName ?? null,
            stepIndex: activeStep.stepIndex,
          }
        : document.status === "traite"
          ? { name: "Circuit terminé", department: null, stepIndex: -1 }
          : {
              name: document.recipientName,
              department: null,
              stepIndex: document.currentStepIndex ?? 0,
            };

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
      isRecipient: Boolean(
        (document.recipientId && document.recipientId === userId) ||
          isStructureViewer,
      ),
      isSender,
      publicRef: document.publicRef ?? null,
      mailKind: document.mailKind ?? "envoi",
      referenceText: document.referenceText ?? null,
      requiresResponse: Boolean(document.requiresResponse),
      parentCourrierId: document.parentCourrierId ?? null,
      revisionCount: document.revisionCount ?? 0,
      lastRevisedAt: document.lastRevisedAt ?? null,
      lastRevisedByName: document.lastRevisedByName ?? null,
      hasCircuit,
      currentStepIndex: document.currentStepIndex ?? 0,
      circuitTotalSteps: document.circuitTotalSteps ?? steps.length,
      // Global seulement pour l'émetteur
      steps: stepsGlobal,
      // Intervenant : vue relative uniquement
      relativeTracking,
      currentLocation,
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
      /** Destinataire nommé, étape circuit, ou membre structure destinataire */
      canUpdateStatus:
        document.status !== "traite" &&
        (Boolean(document.recipientId && document.recipientId === userId) ||
          isStepAssignee ||
          isStructureViewer),
      /**
       * Répondre : tout utilisateur qui peut ouvrir le courrier
       * (sauf l'émetteur) — envoi structurel n'a souvent pas de recipientId.
       */
      canReply: !isSender && document.status !== "traite",
      /** Émetteur peut modifier tant que personne n'a lu (statut encore « envoyé ») */
      canEdit: isSender && document.status === "envoye" && !document.archivedAt,
      canCancel: isSender && document.status === "envoye" && !document.archivedAt,
      isLastInCircuit:
        myStepIndex >= 0 && myStepIndex === steps.length - 1,
      myStepDone: myStep?.status === "done",
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



/**
 * Annuler un envoi non lu : retire le courrier pour tous les destinataires.
 * Réservé à l'émetteur tant que le statut est encore « envoye ».
 */
export const cancelUnreadSend = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");
    if (document.senderId !== userId) {
      throw new Error("Seul l'émetteur peut annuler cet envoi.");
    }
    if (document.status !== "envoye") {
      throw new Error(
        "Ce courrier a déjà été lu ou traité : annulation impossible.",
      );
    }
    if (document.archivedAt) {
      throw new Error("Courrier archivé : annulation impossible.");
    }

    // Transmissions / étapes liées
    try {
      const txs = await ctx.db
        .query("documentTransmissions")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();
      for (const tr of txs) await ctx.db.delete(tr._id);
    } catch {
      /* table absente éventuelle */
    }
    try {
      const steps = await ctx.db
        .query("documentSteps")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();
      for (const s of steps) await ctx.db.delete(s._id);
    } catch {
      /* ignore */
    }

    try {
      await ctx.storage.delete(document.storageId);
    } catch {
      /* ignore */
    }

    const user = await ctx.db.get(userId);
    await writeAudit(ctx, {
      action: "document.cancelled",
      actorId: userId,
      actorName: displayName(user ?? {}),
      documentId: args.documentId,
      details: `Annulation de l'envoi non lu : ${document.fileName}`,
      metadata: {
        fileName: document.fileName,
        objet: document.objet,
        publicRef: document.publicRef ?? null,
      },
    });

    await ctx.db.delete(args.documentId);
    return { ok: true as const };
  },
});

/**
 * Modifier un courrier déjà envoyé tant qu'il n'a pas été lu
 * (statut encore « envoye »). Réservé à l'émetteur.
 */
export const updateUnreadSend = mutation({
  args: {
    documentId: v.id("documents"),
    objet: v.optional(v.string()),
    observations: v.optional(v.string()),
    tasks: v.optional(v.array(v.string())),
    referenceText: v.optional(v.string()),
    publicRef: v.optional(v.string()),
    customFields: v.optional(
      v.array(
        v.object({
          label: v.string(),
          value: v.string(),
          source: v.optional(
            v.union(
              v.literal("manual"),
              v.literal("courrier"),
              v.literal("structure"),
            ),
          ),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");
    if (document.senderId !== userId) {
      throw new Error("Seul l'émetteur peut modifier ce courrier.");
    }
    if (document.status !== "envoye") {
      throw new Error(
        "Ce courrier a déjà été lu ou traité : modification impossible.",
      );
    }
    if (document.archivedAt) {
      throw new Error("Courrier archivé : modification impossible.");
    }

    const patch: Record<string, unknown> = {};
    if (args.objet !== undefined) {
      const o = args.objet.trim();
      if (!o) throw new Error("L'objet est obligatoire.");
      patch.objet = o;
    }
    if (args.observations !== undefined) {
      patch.observations = args.observations.trim() || undefined;
    }
    if (args.tasks !== undefined) {
      if (args.tasks.length === 0) {
        throw new Error("Sélectionnez au moins une tâche.");
      }
      patch.tasks = args.tasks;
      patch.task = args.tasks.join(" · ");
    }
    if (args.referenceText !== undefined) {
      patch.referenceText = args.referenceText.trim() || undefined;
    }
    if (args.publicRef !== undefined) {
      const r = args.publicRef.trim();
      if (r) patch.publicRef = r;
    }
    if (args.customFields !== undefined) {
      patch.customFields = args.customFields.slice(0, 8);
    }

    if (Object.keys(patch).length === 0) return { ok: true as const };
    await ctx.db.patch(args.documentId, patch);
    return { ok: true as const };
  },
});

/** The receiver opens a document: mark it as consulted. */
export const markViewed = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");
    if (document.recipientId !== userId && document.senderId !== userId) {
      let allowed = false;
      try {
        const steps = await ctx.db
          .query("documentSteps")
          .withIndex("by_document", (q) =>
            q.eq("documentId", args.documentId),
          )
          .collect();
        if (steps.some((s) => s.assigneeId === userId)) allowed = true;
      } catch {
        /* ignore */
      }
      if (!allowed) {
        const meUser = await ctx.db.get(userId);
        if (meUser?.departmentId) {
          const myDept = String(meUser.departmentId);
          const matchIds = new Set<string>([myDept]);
          const allDepts = await ctx.db.query("departments").collect();
          const mine = allDepts.find((d) => String(d._id) === myDept);
          if (mine?.parentId) matchIds.add(String(mine.parentId));
          for (const d of allDepts) {
            if (d.parentId && String(d.parentId) === myDept) {
              matchIds.add(String(d._id));
            }
          }
          if (
            document.recipientDepartmentId &&
            matchIds.has(String(document.recipientDepartmentId))
          ) {
            allowed = true;
          }
          if (!allowed) {
            const txs = await ctx.db
              .query("documentTransmissions")
              .withIndex("by_document", (q) =>
                q.eq("documentId", args.documentId),
              )
              .collect();
            allowed = txs.some((tr) =>
              matchIds.has(String(tr.departmentId)),
            );
          }
        }
      }
      if (!allowed) return null;
    }
    if (document.senderId === userId) return null; // l'émetteur n'ouvre pas = pas « lu »
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

/** Transmissions d'un document (statuts par structure). */
export const listTransmissions = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    try {
      const rows = await ctx.db
        .query("documentTransmissions")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();
      return rows.sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return [];
    }
  },
});

export const setStatus = mutation({
  args: {
    documentId: v.id("documents"),
    status: documentStatusValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document introuvable.");
    if (document.status === "traite") {
      throw new Error("Ce document est déjà entièrement traité.");
    }

    const user = await ctx.db.get(userId);
    const actorLabel = displayName(user ?? { name: "Utilisateur" });
    const now = Date.now();
    const uid = String(userId);

    let steps: Doc<"documentSteps">[] = [];
    try {
      steps = await ctx.db
        .query("documentSteps")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();
      steps.sort((a, b) => a.stepIndex - b.stepIndex);
    } catch (e) {
      console.error("[setStatus] load steps", e);
      steps = [];
    }

    const isAssignee = steps.some((s) => String(s.assigneeId) === uid);
    const isRecipient = Boolean(
      document.recipientId && String(document.recipientId) === uid,
    );

    // Transmissions : membre de la structure destinataire
    let myTransmission: Doc<"documentTransmissions"> | null = null;
    let allTransmissions: Doc<"documentTransmissions">[] = [];
    try {
      allTransmissions = await ctx.db
        .query("documentTransmissions")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();
      if (user?.departmentId) {
        const myDept = String(user.departmentId);
        const allDepts = await ctx.db.query("departments").collect();
        const mine = allDepts.find((d) => String(d._id) === myDept);
        const matchIds = new Set<string>([myDept]);
        if (mine?.parentId) matchIds.add(String(mine.parentId));
        myTransmission =
          allTransmissions.find(
            (tr) =>
              matchIds.has(String(tr.departmentId)) &&
              tr.kind === "traitement",
          ) ??
          allTransmissions.find((tr) =>
            matchIds.has(String(tr.departmentId)),
          ) ??
          null;
      }
    } catch {
      /* table absente */
    }

    const isStructureMember = Boolean(myTransmission);
    if (
      !isRecipient &&
      !isAssignee &&
      !isStructureMember &&
      !isAdminRole(user?.role)
    ) {
      throw new Error("Vous ne pouvez pas modifier le statut de ce document.");
    }

    // ——— Statut partagé au niveau structure (transmission) ———
    if (myTransmission) {
      const txStatus =
        args.status === "traite"
          ? "traite"
          : args.status === "en_cours"
            ? "en_cours"
            : args.status === "consulte"
              ? "consulte"
              : "envoye";
      await ctx.db.patch(myTransmission._id, {
        status: txStatus,
        actedByUserId: userId,
        actedByName: actorLabel,
        actedAt: now,
        updatedAt: now,
      });

      // Document global = traité seulement si toutes les transmissions "traitement" sont traitées
      const refreshed = await ctx.db
        .query("documentTransmissions")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();
      const needTreat = refreshed.filter((tr) => tr.kind === "traitement");
      const allDone =
        needTreat.length > 0 &&
        needTreat.every((tr) => tr.status === "traite");

      if (allDone) {
        await ctx.db.patch(args.documentId, {
          status: "traite",
          updatedAt: now,
          viewedAt: document.viewedAt ?? now,
        });
      } else if (args.status !== "traite") {
        await ctx.db.patch(args.documentId, {
          status: args.status,
          updatedAt: now,
          viewedAt:
            args.status === "consulte" || args.status === "en_cours"
              ? (document.viewedAt ?? now)
              : document.viewedAt,
        });
      } else {
        // Une structure a traité mais pas toutes
        await ctx.db.patch(args.documentId, {
          status: "en_cours",
          updatedAt: now,
          viewedAt: document.viewedAt ?? now,
        });
      }

      try {
        await writeAudit(ctx, {
          action: "document.status",
          actorId: userId,
          actorName: actorLabel,
          documentId: args.documentId,
          details: `${myTransmission.departmentCode ?? myTransmission.departmentName}: ${txStatus}`,
        });
      } catch {}

      // Si circuit personnes en parallèle, continuer le flux circuit si besoin
      if (!(args.status === "traite" && steps.length > 0)) {
        return args.documentId;
      }
    }

    // ——— Traité dans un circuit multi-étapes ———
    if (args.status === "traite" && steps.length > 0) {
      // 1) Trouver mon étape
      let myStep =
        steps.find(
          (s) => String(s.assigneeId) === uid && s.status === "active",
        ) ??
        steps.find(
          (s) =>
            String(s.assigneeId) === uid &&
            s.status !== "done" &&
            s.status !== "rejected",
        ) ??
        null;

      // Destinataire actuel = détenteur du dossier
      if (!myStep && isRecipient) {
        myStep =
          steps.find((s) => s.status === "active") ??
          steps.find((s) => s.status !== "done" && s.status !== "rejected") ??
          null;
      }

      if (!myStep) {
        throw new Error(
          "Aucune étape à valider pour vous sur ce dossier.",
        );
      }

      // 2) Si mon étape est en attente mais toutes les précédentes sont done → activer
      if (myStep.status === "waiting") {
        const prevOk = steps
          .filter((s) => s.stepIndex < myStep!.stepIndex)
          .every((s) => s.status === "done");
        if (prevOk && String(myStep.assigneeId) === uid) {
          try {
            // Désactiver d'éventuelles autres active
            for (const s of steps) {
              if (s.status === "active" && s._id !== myStep._id) {
                await ctx.db.patch(s._id, { status: "waiting" });
              }
            }
            await ctx.db.patch(myStep._id, {
              status: "active",
              activatedAt: now,
            });
            myStep = { ...myStep, status: "active" as const };
          } catch (e) {
            console.error("[setStatus] auto-activate", e);
          }
        }
      }

      if (myStep.status === "waiting") {
        throw new Error(
          "Ce n'est pas encore votre tour : attendez que la personne précédente valide son étape.",
        );
      }

      // 3) Marquer mon étape terminée
      await ctx.db.patch(myStep._id, {
        status: "done",
        actedAt: now,
      });

      const next = steps.find((s) => s.stepIndex === myStep!.stepIndex + 1);

      // 4a) Dernière étape → dossier entièrement traité
      if (!next) {
        await ctx.db.patch(args.documentId, {
          status: "traite",
          currentStepIndex: myStep.stepIndex,
          updatedAt: now,
          viewedAt: document.viewedAt ?? now,
        });
        try {
          await writeAudit(ctx, {
            action: "document.circuit_complete",
            actorId: userId,
            actorName: actorLabel,
            documentId: args.documentId,
            details: "Dernière étape validée — document traité",
          });
        } catch {}
        try {
          await pushNotification(ctx, {
            userId: document.senderId,
            type: "document.status",
            title: "Document entièrement traité",
            body: `« ${document.objet} » (${document.publicRef ?? "—"}) — clôturé par ${actorLabel}`,
            documentId: args.documentId,
          });
        } catch {}
        return { outcome: "circuit_complete" as const };
      }

      // 4b) Transmettre à l'étape suivante
      try {
        await ctx.db.patch(next._id, {
          status: "active",
          activatedAt: now,
          dueAt:
            now +
            (document.stepDeadlineHours ?? DEFAULT_STEP_DEADLINE_HOURS) *
              3600 *
              1000,
        });
      } catch {
        await ctx.db.patch(next._id, { status: "active" });
      }

      const nextUser = await ctx.db.get(next.assigneeId);
      const patchDoc: Record<string, unknown> = {
        recipientId: next.assigneeId,
        recipientName: next.assigneeName || displayName(nextUser ?? {}),
        currentStepIndex: next.stepIndex,
        status: "en_cours",
        updatedAt: now,
        viewedAt: document.viewedAt ?? now,
      };
      if (nextUser?.departmentId) {
        patchDoc.recipientDepartmentId = nextUser.departmentId;
      }
      await ctx.db.patch(args.documentId, patchDoc);

      try {
        await writeAudit(ctx, {
          action: "document.step_done",
          actorId: userId,
          actorName: actorLabel,
          documentId: args.documentId,
          details: `Étape ${myStep.stepIndex + 1} terminée → ${next.assigneeName}`,
        });
      } catch {}
      try {
        await pushNotification(ctx, {
          userId: document.senderId,
          type: "document.status",
          title: "Circuit avancé",
          body: `« ${document.objet} » — ${actorLabel} a terminé ; en cours chez ${next.assigneeName}`,
          documentId: args.documentId,
        });
      } catch {}
      try {
        const after = steps.find((s) => s.stepIndex === next.stepIndex + 1);
        await pushNotification(ctx, {
          userId: next.assigneeId,
          type: "document.received",
          title: "Document à traiter (circuit)",
          body: after
            ? `De la part de ${actorLabel} — « ${document.objet} ». Après traitement, transmettre à ${after.assigneeName}.`
            : `De la part de ${actorLabel} — « ${document.objet} ». Dernière étape : marquez Traité pour clôturer.`,
          documentId: args.documentId,
        });
      } catch {}

      return {
        outcome: "step_advanced" as const,
        nextAssignee: next.assigneeName,
      };
    }

    // ——— Consulté / En cours (ou Traité sans circuit) ———
    await ctx.db.patch(args.documentId, {
      status: args.status,
      updatedAt: now,
      viewedAt: document.viewedAt ?? now,
    });

    try {
      await writeAudit(ctx, {
        action: "document.status_changed",
        actorId: userId,
        actorName: actorLabel,
        documentId: args.documentId,
        details: `Statut → ${args.status}`,
        metadata: { from: document.status, to: args.status },
      });
    } catch {}

    try {
      const labels: Record<string, string> = {
        consulte: "Consulté",
        en_cours: "En cours",
        traite: "Traité",
      };
      await pushNotification(ctx, {
        userId: document.senderId,
        type: "document.status",
        title: "Statut mis à jour",
        body: `« ${document.objet} » → ${labels[args.status] ?? args.status} (par ${actorLabel})`,
        documentId: args.documentId,
      });
    } catch {}

    return { outcome: "status_updated" as const };
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

/**
 * Supprime TOUS les documents et données liées (étapes, révisions, fichiers storage).
 * Ne touche pas : utilisateurs, départements, annonces, chat, bot, présence.
 * Réservé admin / root.
 */
export const purgeAllDocuments = mutation({
  args: {
    confirm: v.literal("SUPPRIMER_TOUS_LES_DOCUMENTS"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const me = await ctx.db.get(userId);
    if (!me || !isAdminRole(me.role)) {
      throw new Error("Seul le DG ou le super utilisateur peut purger les documents.");
    }

    let documentsDeleted = 0;
    let stepsDeleted = 0;
    let revisionsDeleted = 0;
    let storageDeleted = 0;
    let notifsDeleted = 0;
    let auditsDeleted = 0;

    // 1) Étapes de circuit
    try {
      const steps = await ctx.db.query("documentSteps").collect();
      for (const s of steps) {
        await ctx.db.delete(s._id);
        stepsDeleted += 1;
      }
    } catch (e) {
      console.error("[purge] steps", e);
    }

    // 2) Révisions
    try {
      const revs = await ctx.db.query("documentRevisions").collect();
      for (const r of revs) {
        await ctx.db.delete(r._id);
        revisionsDeleted += 1;
      }
    } catch (e) {
      console.error("[purge] revisions", e);
    }

    // 3) Documents + fichiers storage
    const docs = await ctx.db.query("documents").collect();
    for (const d of docs) {
      if (d.storageId) {
        try {
          await ctx.storage.delete(d.storageId);
          storageDeleted += 1;
        } catch {
          /* fichier déjà absent */
        }
      }
      await ctx.db.delete(d._id);
      documentsDeleted += 1;
    }

    // 4) Notifications liées aux documents
    try {
      const notifs = await ctx.db.query("notifications").collect();
      for (const n of notifs) {
        if (n.documentId) {
          await ctx.db.delete(n._id);
          notifsDeleted += 1;
        }
      }
    } catch (e) {
      console.error("[purge] notifs", e);
    }

    // 5) Journaux d'audit liés aux documents
    try {
      const logs = await ctx.db.query("auditLogs").collect();
      for (const l of logs) {
        if (l.documentId) {
          await ctx.db.delete(l._id);
          auditsDeleted += 1;
        }
      }
    } catch (e) {
      console.error("[purge] audit", e);
    }

    try {
      await writeAudit(ctx, {
        action: "documents.purged",
        actorId: userId,
        actorName: displayName(me),
        details: `Purge globale : ${documentsDeleted} document(s)`,
        metadata: {
          documentsDeleted,
          stepsDeleted,
          revisionsDeleted,
          storageDeleted,
        },
      });
    } catch {
      /* audit sans documentId ok */
    }

    return {
      documentsDeleted,
      stepsDeleted,
      revisionsDeleted,
      storageDeleted,
      notifsDeleted,
      auditsDeleted,
    };
  },
});


/**
 * Historique organisationnel d'un dossier (structures + états + dates).
 * Orienté services — pas de noms de personnes dans le parcours public.
 */
export const documentHistory = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const document = await ctx.db.get(args.documentId);
    if (!document) return null;
    const user = await ctx.db.get(userId);

    let allowed =
      document.senderId === userId ||
      document.recipientId === userId ||
      isAdminRole(user?.role);
    if (!allowed && user?.departmentId) {
      if (
        document.recipientDepartmentId &&
        String(document.recipientDepartmentId) === String(user.departmentId)
      ) {
        allowed = true;
      }
      if (!allowed && document.senderDepartmentId &&
          String(document.senderDepartmentId) === String(user.departmentId)) {
        allowed = true;
      }
    }
    if (!allowed) {
      try {
        const steps = await ctx.db
          .query("documentSteps")
          .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
          .collect();
        allowed = steps.some((s) => s.assigneeId === userId);
      } catch {
        allowed = false;
      }
    }
    if (!allowed) {
      try {
        const txs = await ctx.db
          .query("documentTransmissions")
          .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
          .collect();
        if (user?.departmentId) {
          allowed = txs.some(
            (tr) => String(tr.departmentId) === String(user.departmentId),
          );
        }
      } catch {
        /* */
      }
    }
    if (!allowed) return null;

    const senderDep = document.senderDepartmentId
      ? await ctx.db.get(document.senderDepartmentId)
      : null;
    const recipientDep = document.recipientDepartmentId
      ? await ctx.db.get(document.recipientDepartmentId)
      : null;

    type Event = {
      at: number;
      structure: string;
      status: string;
      note?: string | null;
      kind: "envoi" | "transmission" | "etape" | "statut";
    };
    const events: Event[] = [];

    events.push({
      at: document.createdAt ?? document._creationTime,
      structure: senderDep
        ? `${senderDep.code ? senderDep.code + " — " : ""}${senderDep.name}`
        : "Structure émettrice",
      status: "envoye",
      note: "Dépôt / envoi du dossier",
      kind: "envoi",
    });

    try {
      const txs = await ctx.db
        .query("documentTransmissions")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();
      for (const tr of txs.sort((a, b) => a.createdAt - b.createdAt)) {
        events.push({
          at: tr.actedAt ?? tr.updatedAt ?? tr.createdAt,
          structure:
            (tr.departmentCode ? tr.departmentCode + " — " : "") +
            (tr.departmentName ?? "Structure"),
          status: tr.status,
          note: tr.kind === "ampliation" ? "Ampliation (info)" : "Traitement",
          kind: "transmission",
        });
      }
    } catch {
      /* */
    }

    try {
      const steps = await ctx.db
        .query("documentSteps")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();
      for (const s of steps.sort((a, b) => a.stepIndex - b.stepIndex)) {
        const struct =
          s.assigneeDepartmentName ||
          (s.assigneeDepartmentId
            ? (await ctx.db.get(s.assigneeDepartmentId))?.name
            : null) ||
          "Structure";
        events.push({
          at: s.actedAt ?? s.activatedAt ?? s.createdAt,
          structure: struct,
          status: s.status,
          note: s.note ?? s.taskLabel ?? null,
          kind: "etape",
        });
      }
    } catch {
      /* */
    }

    events.push({
      at: document.updatedAt ?? document.createdAt ?? document._creationTime,
      structure: recipientDep
        ? `${recipientDep.code ? recipientDep.code + " — " : ""}${recipientDep.name}`
        : document.recipientName || "Structure destinataire",
      status: document.status,
      note: "État actuel",
      kind: "statut",
    });

    events.sort((a, b) => a.at - b.at);

    return {
      publicRef: document.publicRef ?? null,
      mailKind: document.mailKind ?? "envoi",
      objet: document.objet ?? document.fileName,
      currentStatus: document.status,
      currentStructure: recipientDep
        ? `${recipientDep.code ? recipientDep.code + " — " : ""}${recipientDep.name}`
        : document.recipientName || "—",
      events,
    };
  },
});

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
    if (document.status === "traite") {
      throw new Error("Ce document est déjà entièrement traité.");
    }
    const user = await ctx.db.get(userId);
    const actorLabel = displayName(user ?? { name: "Utilisateur" });
    const now = Date.now();
    const uid = String(userId);
    const note = args.note?.trim().slice(0, 500) || undefined;

    let steps: Doc<"documentSteps">[] = [];
    try {
      steps = await ctx.db
        .query("documentSteps")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect();
      steps.sort((a, b) => a.stepIndex - b.stepIndex);
    } catch {
      steps = [];
    }

    if (steps.length === 0) {
      if (String(document.recipientId) !== uid) {
        throw new Error("Seul le destinataire peut traiter ce document.");
      }
      await ctx.db.patch(args.documentId, {
        status: args.decision === "done" ? "traite" : "consulte",
        updatedAt: now,
      });
      return {
        done: args.decision === "done",
        advanced: false,
        nextAssignee: null as string | null,
      };
    }

    let myStep =
      steps.find((s) => String(s.assigneeId) === uid && s.status === "active") ??
      steps.find(
        (s) =>
          String(s.assigneeId) === uid &&
          s.status !== "done" &&
          s.status !== "rejected",
      );

    if (!myStep && String(document.recipientId) === uid) {
      myStep = steps.find((s) => s.status === "active");
    }

    if (!myStep) {
      throw new Error("Aucune étape active pour vous.");
    }

    if (myStep.status === "waiting") {
      const prevOk = steps
        .filter((s) => s.stepIndex < myStep!.stepIndex)
        .every((s) => s.status === "done");
      if (prevOk && String(myStep.assigneeId) === uid) {
        await ctx.db.patch(myStep._id, { status: "active", activatedAt: now });
        myStep = { ...myStep, status: "active" as const };
      } else {
        throw new Error(
          "Ce n'est pas encore votre tour dans le circuit.",
        );
      }
    }

    if (args.decision === "rejected") {
      await ctx.db.patch(myStep._id, {
        status: "rejected",
        note,
        actedAt: now,
      });
      await ctx.db.patch(args.documentId, {
        status: "consulte",
        updatedAt: now,
      });
      try {
        await pushNotification(ctx, {
          userId: document.senderId,
          type: "document.status",
          title: "Étape refusée",
          body: `« ${document.objet} » — ${actorLabel} a refusé${note ? ` : ${note}` : ""}`,
          documentId: args.documentId,
        });
      } catch {}
      return { done: false, advanced: false, rejected: true, nextAssignee: null };
    }

    // decision === done → même logique que setStatus traite
    await ctx.db.patch(myStep._id, {
      status: "done",
      note,
      actedAt: now,
    });

    const next = steps.find((s) => s.stepIndex === myStep!.stepIndex + 1);
    if (!next) {
      await ctx.db.patch(args.documentId, {
        status: "traite",
        currentStepIndex: myStep.stepIndex,
        updatedAt: now,
      });
      try {
        await pushNotification(ctx, {
          userId: document.senderId,
          type: "document.status",
          title: "Document entièrement traité",
          body: `« ${document.objet} » — clôturé par ${actorLabel}`,
          documentId: args.documentId,
        });
      } catch {}
      return { done: true, advanced: false, nextAssignee: null };
    }

    try {
      await ctx.db.patch(next._id, {
        status: "active",
        activatedAt: now,
      });
    } catch {
      await ctx.db.patch(next._id, { status: "active" });
    }

    const nextUser = await ctx.db.get(next.assigneeId);
    const patchDoc: Record<string, unknown> = {
      recipientId: next.assigneeId,
      recipientName: next.assigneeName || displayName(nextUser ?? {}),
      currentStepIndex: next.stepIndex,
      status: "en_cours",
      updatedAt: now,
    };
    if (nextUser?.departmentId) {
      patchDoc.recipientDepartmentId = nextUser.departmentId;
    }
    await ctx.db.patch(args.documentId, patchDoc);

    try {
      await pushNotification(ctx, {
        userId: next.assigneeId,
        type: "document.received",
        title: "Document à traiter (circuit)",
        body: `De la part de ${actorLabel} — « ${document.objet} »`,
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

    return {
      done: false,
      advanced: true,
      nextAssignee: next.assigneeName as string | null,
    };
  },
});



export const enterpriseOverview = query({
  args: {},
  handler: async (ctx) => {
    try {
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

    // Agréger les services dans leur direction parente ; n'afficher que les directions
    for (const dep of departments) {
      if (!dep.parentId) continue;
      const child = perDept.get(String(dep._id));
      const parent = perDept.get(String(dep.parentId));
      if (!child || !parent) continue;
      parent.members += child.members;
      parent.chiefs += child.chiefs;
      parent.sent += child.sent;
      parent.received += child.received;
      parent.open += child.open;
      parent.traite += child.traite;
      parent.overdue += child.overdue;
    }

    const directionIds = new Set(
      departments
        .filter(
          (d) =>
            !d.parentId &&
            (d.kind == null || d.kind === "direction" || d.kind !== "service"),
        )
        .map((d) => String(d._id)),
    );

    const departmentStats = [...perDept.values()]
      .filter(
        (r) =>
          r.departmentId === "__none__"
            ? r.sent + r.received > 0
            : directionIds.has(r.departmentId),
      )
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
        departments: directionIds.size,
        users: validatedUsers,
        pendingAccounts,
        pendingJoins,
      },
      departmentStats,
      recent,
      generatedAt: Date.now(),
    };
    } catch (e) {
      console.error("[enterpriseOverview]", e);
      return null;
    }
  },
});

/**
 * Tableau de bord détaillé d'un département (DG uniquement).
 * Membres, stats docs, retards, derniers échanges liés au département.
 */
export const departmentOverview = query({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, args) => {
    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) return null;
      const me = await ctx.db.get(userId);
      if (!me) return null;
      const isAdmin = me.role === "admin" || me.role === "root";
      const isChefOfDept =
        me.departmentRole === "chef" &&
        me.departmentId === args.departmentId;
      if (!isAdmin && !isChefOfDept) {
        return null;
      }

      const department = await ctx.db.get(args.departmentId);
      if (!department) return null;

      const [allUsers, allDocs] = await Promise.all([
        ctx.db.query("users").collect(),
        ctx.db.query("documents").collect(),
      ]);

      const members = allUsers
        .filter(
          (u) =>
            u.departmentId === args.departmentId &&
            (u.accountStatus === "valide" ||
              !u.accountStatus ||
              u.role === "admin" ||
              u.role === "root"),
        )
        .map((u) => ({
          _id: u._id,
          name: displayName(u),
          email: u.email ?? null,
          fonction: u.fonction ?? null,
          departmentRole: u.departmentRole ?? "membre",
          lastSeenAt: u.lastSeenAt ?? null,
          accountStatus: u.accountStatus ?? "valide",
        }))
        .sort((a, b) => {
          if (a.departmentRole === "chef" && b.departmentRole !== "chef")
            return -1;
          if (b.departmentRole === "chef" && a.departmentRole !== "chef")
            return 1;
          return a.name.localeCompare(b.name, "fr");
        });

      const chief = members.find((m) => m.departmentRole === "chef") ?? null;

      const related = allDocs.filter(
        (d) =>
          !d.archivedAt &&
          (d.senderDepartmentId === args.departmentId ||
            d.recipientDepartmentId === args.departmentId),
      );

      const sent = related.filter(
        (d) => d.senderDepartmentId === args.departmentId,
      );
      const received = related.filter(
        (d) => d.recipientDepartmentId === args.departmentId,
      );
      const open = received.filter((d) => d.status !== "traite");
      const traite = received.filter((d) => d.status === "traite");
      const overdue = open.filter((d) => {
        const age = Date.now() - (d.createdAt ?? d._creationTime);
        return age > 48 * 3600 * 1000;
      });

      const recent = [...related]
        .sort(
          (a, b) =>
            Number(b.createdAt ?? b._creationTime) -
            Number(a.createdAt ?? a._creationTime),
        )
        .slice(0, 25)
        .map((d) => ({
          _id: d._id,
          fileName: d.fileName,
          objet: d.objet,
          status: d.status,
          senderName: d.senderName,
          recipientName: d.recipientName,
          direction:
            d.senderDepartmentId === args.departmentId &&
            d.recipientDepartmentId === args.departmentId
              ? "interne"
              : d.senderDepartmentId === args.departmentId
                ? "envoyé"
                : "reçu",
          hasCircuit: Boolean(d.hasCircuit),
          currentStepIndex: d.currentStepIndex ?? 0,
          circuitTotalSteps: d.circuitTotalSteps ?? 0,
          createdAt: d.createdAt ?? d._creationTime,
        }));

      // Docs où un membre du département est étape active du circuit
      let circuitActive = 0;
      try {
        for (const d of related.filter((x) => x.hasCircuit)) {
          const steps = await ctx.db
            .query("documentSteps")
            .withIndex("by_document", (q) => q.eq("documentId", d._id))
            .collect();
          const active = steps.find((s) => s.status === "active");
          if (
            active &&
            members.some((m) => m._id === active.assigneeId)
          ) {
            circuitActive += 1;
          }
        }
      } catch {
        /* ignore */
      }

      return {
        department: {
          _id: department._id,
          name: department.name,
          description: department.description ?? null,
          parentId: department.parentId ?? null,
          createdAt: department.createdAt,
        },
        chief,
        members,
        totals: {
          members: members.length,
          sent: sent.length,
          received: received.length,
          open: open.length,
          traite: traite.length,
          overdue: overdue.length,
          circuitActive,
        },
        recent,
        generatedAt: Date.now(),
      };
    } catch (e) {
      console.error("[departmentOverview]", e);
      return null;
    }
  },
});



/** Recherche d'un dossier par identifiant public (continuation de circuit). */
export const lookupByPublicRef = query({
  args: { publicRef: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const ref = args.publicRef.trim().toUpperCase();
    if (ref.length < 3) return null;
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_publicRef", (q) => q.eq("publicRef", ref))
      .first();
    if (!doc) return { found: false as const, publicRef: ref };
    const steps = (
      await ctx.db
        .query("documentSteps")
        .withIndex("by_document", (q) => q.eq("documentId", doc._id))
        .collect()
    ).sort((a, b) => a.stepIndex - b.stepIndex);
    const active = steps.find((s) => s.status === "active") ?? null;
    const myStep = steps.find((s) => s.assigneeId === userId) ?? null;
    const next =
      active != null
        ? steps.find((s) => s.stepIndex === active.stepIndex + 1) ?? null
        : null;
    return {
      found: true as const,
      publicRef: ref,
      documentId: doc._id,
      objet: doc.objet,
      status: doc.status,
      isClosed: doc.status === "traite",
      hasCircuit: steps.length > 0,
      isMyTurn: active?.assigneeId === userId,
      activeAssigneeName: active?.assigneeName ?? null,
      activeDepartment: active?.assigneeDepartmentName ?? null,
      activeStepIndex: active?.stepIndex ?? null,
      myStepStatus: myStep?.status ?? null,
      suggestedNext: next
        ? {
            userId: next.assigneeId,
            name: next.assigneeName,
            department: next.assigneeDepartmentName ?? null,
            stepIndex: next.stepIndex,
          }
        : null,
      isLastStep: Boolean(active && !next),
      circuitTotalSteps: steps.length || doc.circuitTotalSteps || 0,
      senderName: doc.senderName,
    };
  },
});

/** Relancer la personne dont c'est le tour dans le circuit. */
export const alertActiveStep = mutation({
  args: {
    documentId: v.id("documents"),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const me = await ctx.db.get(userId);
    if (!me) throw new Error("Compte introuvable.");
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document introuvable.");
    if (doc.status === "traite") {
      throw new Error("Ce dossier est déjà clôturé.");
    }
    const isSender = doc.senderId === userId;
    const isAdmin = isAdminRole(me.role);
    if (!isSender && !isAdmin) {
      throw new Error("Seul l'émetteur ou le DG peut envoyer une alerte.");
    }
    if (
      doc.lastAlertAt &&
      Date.now() - doc.lastAlertAt < ALERT_COOLDOWN_MS
    ) {
      const waitH = Math.ceil(
        (ALERT_COOLDOWN_MS - (Date.now() - doc.lastAlertAt)) / 3600000,
      );
      throw new Error(
        `Relance déjà envoyée récemment. Réessayez dans environ ${waitH} h.`,
      );
    }
    const steps = (
      await ctx.db
        .query("documentSteps")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect()
    ).sort((a, b) => a.stepIndex - b.stepIndex);
    const active = steps.find((s) => s.status === "active");
    if (!active) throw new Error("Aucune étape active à relancer.");
    const msg =
      args.message?.trim().slice(0, 300) ||
      `Rappel : merci de traiter le dossier « ${doc.objet} » (${doc.publicRef ?? "—"})`;
    await pushNotification(ctx, {
      userId: active.assigneeId,
      type: "document.status",
      title: "Relance — dossier en attente",
      body: `${displayName(me)} : ${msg}`,
      documentId: args.documentId,
    });
    try {
      await writeAudit(ctx, {
        action: "document.alert",
        actorId: userId,
        actorName: displayName(me),
        documentId: args.documentId,
        details: `Alerte → ${active.assigneeName}`,
      });
    } catch {}
    await ctx.db.patch(args.documentId, { lastAlertAt: Date.now() });
    return { ok: true as const, to: active.assigneeName };
  },
});

/**
 * Suivi des dossiers (circuit + envois concernés).
 * Chacun voit ce qui le concerne ; le DG voit tout.
 */
export const circuitTracking = query({
  args: {},
  handler: async (ctx) => {
    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) return null;
      const me = await ctx.db.get(userId);
      if (!me) return null;
      const isAdmin = isAdminRole(me.role);

      let docs = await ctx.db.query("documents").collect();
      docs = docs.filter((d) => !d.archivedAt);

      if (!isAdmin) {
        const myStepDocIds = new Set<string>();
        try {
          const allSteps = await ctx.db.query("documentSteps").collect();
          for (const s of allSteps) {
            if (s.assigneeId === userId) myStepDocIds.add(String(s.documentId));
          }
        } catch {
          /* ignore */
        }
        docs = docs.filter(
          (d) =>
            d.senderId === userId ||
            d.recipientId === userId ||
            myStepDocIds.has(String(d._id)),
        );
      }

      const now = Date.now();
      const items = [];
      for (const d of docs) {
        let steps: Doc<"documentSteps">[] = [];
        try {
          steps = (
            await ctx.db
              .query("documentSteps")
              .withIndex("by_document", (q) => q.eq("documentId", d._id))
              .collect()
          ).sort((a, b) => a.stepIndex - b.stepIndex);
        } catch {
          steps = [];
        }
        const active = steps.find((s) => s.status === "active") ?? null;
        const stepHours = d.stepDeadlineHours ?? DEFAULT_STEP_DEADLINE_HOURS;
        const stepDueAt =
          active?.dueAt ??
          (active?.activatedAt
            ? active.activatedAt + stepHours * 3600 * 1000
            : null) ??
          d.dueAt ??
          null;
        const age = now - (d.createdAt ?? d._creationTime);
        const stepOverdue =
          d.status !== "traite" && stepDueAt != null && now > stepDueAt;
        const globalOverdue =
          d.status !== "traite" &&
          ((d.dueAt != null && now > d.dueAt) ||
            age > stepHours * 3600 * 1000 * Math.max(1, steps.length || 1));
        const overdue = stepOverdue || globalOverdue;
        let category: "en_attente" | "en_cours" | "en_retard" | "termines" =
          "en_cours";
        if (d.status === "traite") category = "termines";
        else if (overdue) category = "en_retard";
        else if (d.status === "envoye" || (active && active.stepIndex === 0))
          category = "en_attente";
        else category = "en_cours";

        const msLeft = stepDueAt != null ? stepDueAt - now : null;
        items.push({
          _id: d._id,
          publicRef: d.publicRef ?? null,
          objet: d.objet,
          fileName: d.fileName,
          status: d.status,
          senderId: d.senderId,
          senderName: d.senderName,
          recipientName: d.recipientName,
          hasCircuit: Boolean(d.hasCircuit) || steps.length > 1,
          currentStepIndex: d.currentStepIndex ?? active?.stepIndex ?? 0,
          circuitTotalSteps: d.circuitTotalSteps ?? steps.length,
          activeAssigneeName: active?.assigneeName ?? d.recipientName,
          activeDepartment: active?.assigneeDepartmentName ?? null,
          isSender: d.senderId === userId,
          isMyTurn: active?.assigneeId === userId,
          canAlert:
            (d.senderId === userId || isAdmin) &&
            d.status !== "traite" &&
            Boolean(active),
          category,
          dueAt: stepDueAt,
          globalDueAt: d.dueAt ?? null,
          stepDeadlineHours: stepHours,
          hoursLeft:
            msLeft == null
              ? null
              : Math.round((msLeft / 3600000) * 10) / 10,
          isOverdue: overdue,
          createdAt: d.createdAt ?? d._creationTime,
          updatedAt: d.updatedAt ?? d.createdAt,
        });
      }

      items.sort((a, b) => b.updatedAt - a.updatedAt);

      return {
        en_attente: items.filter((i) => i.category === "en_attente"),
        en_cours: items.filter((i) => i.category === "en_cours"),
        en_retard: items.filter((i) => i.category === "en_retard"),
        termines: items.filter((i) => i.category === "termines"),
        all: items,
      };
    } catch (e) {
      console.error("[circuitTracking]", e);
      return null;
    }
  },
});

/**
 * Alertes automatiques : échéance proche (< 12 h) ou dépassée.
 * Appelé par le cron horaire. Anti-spam via lastAutoAlertAt.
 */
export const runDeadlineAlerts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const APPROACHING_MS = 12 * 3600 * 1000;
    const COOLDOWN_APPROACHING = 12 * 3600 * 1000;
    const COOLDOWN_OVERDUE = 24 * 3600 * 1000;

    const docs = await ctx.db.query("documents").collect();
    let sent = 0;

    for (const doc of docs) {
      if (doc.archivedAt || doc.status === "traite") continue;

      let steps: Doc<"documentSteps">[] = [];
      try {
        steps = await ctx.db
          .query("documentSteps")
          .withIndex("by_document", (q) => q.eq("documentId", doc._id))
          .collect();
      } catch {
        continue;
      }
      const active = steps.find((s) => s.status === "active");
      if (!active) continue;

      const stepHours = doc.stepDeadlineHours ?? DEFAULT_STEP_DEADLINE_HOURS;
      const dueAt =
        active.dueAt ??
        (active.activatedAt
          ? active.activatedAt + stepHours * 3600 * 1000
          : doc.dueAt);
      if (dueAt == null) continue;

      const isOverdue = now > dueAt;
      const isApproaching = !isOverdue && dueAt - now <= APPROACHING_MS;
      if (!isOverdue && !isApproaching) continue;

      const kind = isOverdue ? ("overdue" as const) : ("approaching" as const);
      const cooldown = isOverdue ? COOLDOWN_OVERDUE : COOLDOWN_APPROACHING;
      if (
        doc.lastAutoAlertAt &&
        doc.lastAutoAlertKind === kind &&
        now - doc.lastAutoAlertAt < cooldown
      ) {
        continue;
      }

      const ref = doc.publicRef ?? "dossier";
      const hoursLeft = Math.max(0, Math.round((dueAt - now) / 3600000));

      try {
        if (isOverdue) {
          await pushNotification(ctx, {
            userId: active.assigneeId,
            type: "document.deadline_overdue",
            title: "Dossier en retard",
            body: `« ${doc.objet} » (${ref}) — votre étape a dépassé l'échéance. Merci de traiter et transmettre.`,
            documentId: doc._id,
          });
          if (doc.senderId !== active.assigneeId) {
            await pushNotification(ctx, {
              userId: doc.senderId,
              type: "document.deadline_overdue",
              title: "Circuit en retard",
              body: `« ${doc.objet} » (${ref}) est en retard chez ${active.assigneeName}${active.assigneeDepartmentName ? ` (${active.assigneeDepartmentName})` : ""}.`,
              documentId: doc._id,
            });
          }
        } else {
          await pushNotification(ctx, {
            userId: active.assigneeId,
            type: "document.deadline_soon",
            title: "Échéance proche",
            body: `« ${doc.objet} » (${ref}) — environ ${hoursLeft} h restantes pour votre étape.`,
            documentId: doc._id,
          });
          if (doc.senderId !== active.assigneeId) {
            await pushNotification(ctx, {
              userId: doc.senderId,
              type: "document.deadline_soon",
              title: "Échéance de circuit proche",
              body: `« ${doc.objet} » (${ref}) — ~${hoursLeft} h chez ${active.assigneeName}.`,
              documentId: doc._id,
            });
          }
        }
        await ctx.db.patch(doc._id, {
          lastAutoAlertAt: now,
          lastAutoAlertKind: kind,
        });
        sent += 1;
      } catch (e) {
        console.error("[runDeadlineAlerts]", doc._id, e);
      }
    }

    return { checked: docs.length, alertsSent: sent };
  },
});

/**
 * Gestionnaire de fichiers : recherche (identifiant, objet, nom), filtres.
 * Chacun voit ses documents (envoyé/reçu/circuit) ; le DG voit tout.
 */
export const fileManager = query({
  args: {
    search: v.optional(v.string()),
    scope: v.optional(
      v.union(
        v.literal("all"),
        v.literal("sent"),
        v.literal("received"),
        v.literal("archived"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) return [];
      const me = await ctx.db.get(userId);
      if (!me) return [];
      const isAdmin = isAdminRole(me.role);
      const scope = args.scope ?? "all";
      const q = (args.search ?? "").trim().toUpperCase();

      let docs = await ctx.db.query("documents").collect();

      // Accès
      if (!isAdmin) {
        const stepDocIds = new Set<string>();
        try {
          const allSteps = await ctx.db.query("documentSteps").collect();
          for (const s of allSteps) {
            if (s.assigneeId === userId) stepDocIds.add(String(s.documentId));
          }
        } catch {
          /* ignore */
        }
        docs = docs.filter(
          (d) =>
            d.senderId === userId ||
            d.recipientId === userId ||
            stepDocIds.has(String(d._id)),
        );
      }

      // Scope
      if (scope === "sent") {
        docs = docs.filter((d) => d.senderId === userId && !d.archivedAt);
      } else if (scope === "received") {
        docs = docs.filter((d) => d.recipientId === userId && !d.archivedAt);
      } else if (scope === "archived") {
        docs = docs.filter((d) => Boolean(d.archivedAt));
      } else {
        docs = docs.filter((d) => !d.archivedAt);
      }

      // Recherche
      if (q.length >= 1) {
        docs = docs.filter((d) => {
          const ref = (d.publicRef ?? "").toUpperCase();
          const objet = (d.objet ?? "").toUpperCase();
          const file = (d.fileName ?? "").toUpperCase();
          const sender = (d.senderName ?? "").toUpperCase();
          const recip = (d.recipientName ?? "").toUpperCase();
          return (
            ref.includes(q) ||
            objet.includes(q) ||
            file.includes(q) ||
            sender.includes(q) ||
            recip.includes(q)
          );
        });
      }

      docs.sort(
        (a, b) =>
          Number(b.updatedAt ?? b.createdAt ?? 0) -
          Number(a.updatedAt ?? a.createdAt ?? 0),
      );

      const page = docs.slice(0, 100);
      return await Promise.all(
        page.map(async (d) => {
          let fileUrl: string | null = null;
          try {
            fileUrl = await ctx.storage.getUrl(d.storageId);
          } catch {
            fileUrl = null;
          }
          return {
            _id: d._id,
            publicRef: d.publicRef ?? null,
            objet: d.objet,
            fileName: d.fileName,
            contentType: d.contentType ?? null,
            status: d.status,
            senderName: d.senderName,
            recipientName: d.recipientName,
            hasCircuit: Boolean(d.hasCircuit),
            isSender: d.senderId === userId,
            isRecipient: d.recipientId === userId,
            archivedAt: d.archivedAt ?? null,
            createdAt: d.createdAt ?? d._creationTime,
            updatedAt: d.updatedAt ?? d.createdAt,
            fileUrl,
            canArchive:
              (d.senderId === userId || d.recipientId === userId) &&
              !d.archivedAt,
            canDelete:
              (d.senderId === userId || isAdmin) && Boolean(d.archivedAt),
            canUnarchive:
              Boolean(d.archivedAt) &&
              (d.senderId === userId ||
                d.recipientId === userId ||
                isAdmin),
          };
        }),
      );
    } catch (e) {
      console.error("[fileManager]", e);
      return [];
    }
  },
});

/**
 * Détail cliquable des cartes stats (DG / chef).
 * kind: members | sent | received | open | traite | overdue
 */
export const dgDetailList = query({
  args: {
    kind: v.union(
      v.literal("members"),
      v.literal("sent"),
      v.literal("received"),
      v.literal("open"),
      v.literal("traite"),
      v.literal("overdue"),
    ),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) return { kind: args.kind, items: [] as any[] };
      const me = await ctx.db.get(userId);
      if (!me) return { kind: args.kind, items: [] as any[] };

      const isAdmin = isAdminRole(me.role);
      const isChef =
        me.departmentRole === "chef" &&
        me.departmentId &&
        (!args.departmentId ||
          String(me.departmentId) === String(args.departmentId));

      if (!isAdmin && !isChef) {
        return { kind: args.kind, items: [] as any[] };
      }

      const deptId =
        args.departmentId ??
        (isChef && !isAdmin ? me.departmentId : undefined);

      // —— Membres ——
      if (args.kind === "members") {
        let users = await ctx.db.query("users").collect();
        users = users.filter(
          (u) =>
            !u.accountStatus ||
            u.accountStatus === "valide" ||
            u.role === "admin" ||
            u.role === "root",
        );
        if (deptId) {
          users = users.filter(
            (u) => u.departmentId && String(u.departmentId) === String(deptId),
          );
        }
        const items = users
          .map((u) => ({
            type: "member" as const,
            _id: u._id,
            name: displayName(u),
            email: u.email ?? null,
            fonction: u.fonction ?? null,
            departmentRole: u.departmentRole ?? "membre",
            lastSeenAt: u.lastSeenAt ?? null,
            departmentId: u.departmentId ?? null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "fr"));
        return { kind: args.kind, items };
      }

      // —— Documents ——
      let docs = await ctx.db.query("documents").collect();
      docs = docs.filter((d) => !d.archivedAt);

      if (deptId) {
        docs = docs.filter(
          (d) =>
            (d.senderDepartmentId &&
              String(d.senderDepartmentId) === String(deptId)) ||
            (d.recipientDepartmentId &&
              String(d.recipientDepartmentId) === String(deptId)),
        );
      }

      if (args.kind === "sent" && deptId) {
        docs = docs.filter(
          (d) =>
            d.senderDepartmentId &&
            String(d.senderDepartmentId) === String(deptId),
        );
      } else if (args.kind === "sent" && !deptId) {
        // entreprise : tous
      } else if (args.kind === "received" && deptId) {
        docs = docs.filter(
          (d) =>
            d.recipientDepartmentId &&
            String(d.recipientDepartmentId) === String(deptId),
        );
      } else if (args.kind === "open") {
        docs = docs.filter((d) => d.status !== "traite");
        if (deptId) {
          docs = docs.filter(
            (d) =>
              d.recipientDepartmentId &&
              String(d.recipientDepartmentId) === String(deptId),
          );
        }
      } else if (args.kind === "traite") {
        docs = docs.filter((d) => d.status === "traite");
        if (deptId) {
          docs = docs.filter(
            (d) =>
              d.recipientDepartmentId &&
              String(d.recipientDepartmentId) === String(deptId),
          );
        }
      } else if (args.kind === "overdue") {
        const now = Date.now();
        docs = docs.filter((d) => {
          if (d.status === "traite") return false;
          const stepHours = d.stepDeadlineHours ?? DEFAULT_STEP_DEADLINE_HOURS;
          if (d.dueAt && now > d.dueAt) return true;
          const age = now - (d.createdAt ?? d._creationTime);
          return age > 48 * 3600 * 1000;
        });
        if (deptId) {
          docs = docs.filter(
            (d) =>
              d.recipientDepartmentId &&
              String(d.recipientDepartmentId) === String(deptId),
          );
        }
      }

      docs.sort(
        (a, b) =>
          Number(b.updatedAt ?? b.createdAt ?? 0) -
          Number(a.updatedAt ?? a.createdAt ?? 0),
      );

      const items = [];
      for (const d of docs.slice(0, 80)) {
        let activeName: string | null = d.recipientName;
        let activeDept: string | null = null;
        let chiefId: Id<"users"> | null = null;
        try {
          const steps = await ctx.db
            .query("documentSteps")
            .withIndex("by_document", (q) => q.eq("documentId", d._id))
            .collect();
          const active = steps.find((s) => s.status === "active");
          if (active) {
            activeName = active.assigneeName;
            activeDept = active.assigneeDepartmentName ?? null;
            const assignee = await ctx.db.get(active.assigneeId);
            if (assignee?.departmentId) {
              const chefs = (
                await ctx.db.query("users").collect()
              ).filter(
                (u) =>
                  u.departmentId &&
                  String(u.departmentId) === String(assignee.departmentId) &&
                  u.departmentRole === "chef",
              );
              if (chefs[0]) chiefId = chefs[0]._id;
            }
          }
        } catch {
          /* ignore */
        }
        items.push({
          type: "document" as const,
          _id: d._id,
          publicRef: d.publicRef ?? null,
          objet: d.objet,
          fileName: d.fileName,
          status: d.status,
          senderName: d.senderName,
          recipientName: d.recipientName,
          activeAssigneeName: activeName,
          activeDepartment: activeDept,
          hasChief: Boolean(chiefId),
          createdAt: d.createdAt ?? d._creationTime,
          updatedAt: d.updatedAt ?? d.createdAt,
        });
      }

      return { kind: args.kind, items };
    } catch (e) {
      console.error("[dgDetailList]", e);
      return { kind: args.kind, items: [] as any[] };
    }
  },
});

/**
 * DG (ou émetteur) signale au chef du département où le dossier est bloqué.
 */
export const signalChief = mutation({
  args: {
    documentId: v.id("documents"),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const me = await ctx.db.get(userId);
    if (!me) throw new Error("Compte introuvable.");
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document introuvable.");
    if (doc.status === "traite") {
      throw new Error("Ce dossier est déjà clôturé.");
    }
    if (!isAdminRole(me.role) && doc.senderId !== userId) {
      throw new Error("Seul le DG ou l'émetteur peut signaler au chef.");
    }
    if (
      doc.lastAlertAt &&
      Date.now() - doc.lastAlertAt < ALERT_COOLDOWN_MS
    ) {
      const waitH = Math.ceil(
        (ALERT_COOLDOWN_MS - (Date.now() - doc.lastAlertAt)) / 3600000,
      );
      throw new Error(
        `Signalement récent déjà envoyé. Réessayez dans ~${waitH} h.`,
      );
    }

    const steps = (
      await ctx.db
        .query("documentSteps")
        .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
        .collect()
    ).sort((a, b) => a.stepIndex - b.stepIndex);
    const active = steps.find((s) => s.status === "active");

    let targetUserId: Id<"users"> | null =
      active?.assigneeId ?? doc.recipientId ?? null;
    let targetName = active?.assigneeName ?? doc.recipientName;
    let chiefId: Id<"users"> | null = null;
    let chiefName: string | null = null;
    let deptName: string | null = active?.assigneeDepartmentName ?? null;

    // Chef via détenteur nommé, sinon via structure destinataire
    let holderDeptId = doc.recipientDepartmentId ?? null;
    if (targetUserId) {
      const holder = await ctx.db.get(targetUserId);
      if (holder?.departmentId) holderDeptId = holder.departmentId;
    }
    if (holderDeptId) {
      const dep = await ctx.db.get(holderDeptId);
      deptName = dep?.name ?? deptName;
      const chefs = (await ctx.db.query("users").collect()).filter(
        (u) =>
          u.departmentId &&
          String(u.departmentId) === String(holderDeptId) &&
          u.departmentRole === "chef",
      );
      if (chefs[0]) {
        chiefId = chefs[0]._id;
        chiefName = displayName(chefs[0]);
      }
    }

    if (!chiefId) {
      throw new Error(
        "Aucun chef de département trouvé pour relancer ce dossier.",
      );
    }

    const ref = doc.publicRef ?? "—";
    const msg =
      args.message?.trim().slice(0, 300) ||
      `Le dossier « ${doc.objet} » (${ref}) est en retard / trop long chez ${targetName}${deptName ? ` (${deptName})` : ""}. Merci de faire avancer le traitement.`;

    await pushNotification(ctx, {
      userId: chiefId,
      type: "document.chief_signal",
      title: "Signalement DG — dossier en retard",
      body: `${displayName(me)} : ${msg}`,
      documentId: args.documentId,
    });
    // Aussi la personne qui détient l'étape
    if (targetUserId && String(targetUserId) !== String(chiefId)) {
      try {
        await pushNotification(ctx, {
          userId: targetUserId,
          type: "document.status",
          title: "Relance hiérarchique",
          body: `Le DG a signalé votre dossier « ${doc.objet} » (${ref}) au chef de département.`,
          documentId: args.documentId,
        });
      } catch {}
    }

    try {
      await writeAudit(ctx, {
        action: "document.signal_chief",
        actorId: userId,
        actorName: displayName(me),
        documentId: args.documentId,
        details: `Signalement → chef ${chiefName} (${deptName ?? "—"})`,
      });
    } catch {}

    await ctx.db.patch(args.documentId, { lastAlertAt: Date.now() });
    return { ok: true as const, chiefName, deptName, targetName };
  },
});
