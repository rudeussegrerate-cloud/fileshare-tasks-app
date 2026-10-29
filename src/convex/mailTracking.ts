import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { pushNotification } from "./inAppNotifications";

type Ctx = QueryCtx | MutationCtx;

async function requireUser(ctx: Ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Non authentifié.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Utilisateur introuvable.");
  return user as Doc<"users">;
}

function displayName(u: {
  name?: string | null;
  email?: string | null;
}) {
  return (u.name || u.email || "Utilisateur").trim();
}

function isAdmin(role?: string | null) {
  return role === "admin" || role === "root";
}

async function writeAudit(
  ctx: MutationCtx,
  params: {
    action: string;
    actorId: Id<"users">;
    actorName: string;
    documentId: Id<"documents">;
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

async function deptLabel(
  ctx: Ctx,
  departmentId?: Id<"departments"> | null,
) {
  if (!departmentId) return null;
  const d = await ctx.db.get(departmentId);
  if (!d) return null;
  const code = (d.code ?? "").trim();
  const name = (d.name ?? "").trim();
  if (code && name) {
    if (name.toUpperCase().startsWith(code.toUpperCase())) return name;
    return `${code} — ${name}`;
  }
  return name || code || null;
}

async function loadSteps(ctx: Ctx, documentId: Id<"documents">) {
  const steps = await ctx.db
    .query("documentSteps")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  steps.sort((a, b) => a.stepIndex - b.stepIndex);
  return steps;
}

async function ensureCanAccessDoc(
  ctx: Ctx,
  user: Doc<"users">,
  doc: Doc<"documents">,
) {
  if (isAdmin(user.role)) return true;
  if (doc.senderId === user._id) return true;
  if (doc.recipientId === user._id) return true;
  const steps = await loadSteps(ctx, doc._id);
  if (steps.some((s) => s.assigneeId === user._id)) return true;
  return false;
}

/** Personnes validées pour un transfert (hors soi). */
export const listTransferTargets = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const users = await ctx.db.query("users").collect();
    return users
      .filter(
        (u) =>
          u.accountStatus === "valide" &&
          u._id !== userId &&
          Boolean(u.profileCompletedAt || u.name),
      )
      .map((u) => ({
        _id: u._id,
        name: displayName(u),
        fonction: u.fonction ?? null,
        email: u.email ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  },
});

/** Fiche de suivi complète (expéditeur + intervenants). */
export const getTracking = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    if (!(await ensureCanAccessDoc(ctx, user, doc))) return null;

    const steps = await loadSteps(ctx, doc._id);
    const active =
      steps.find((s) => s.status === "active") ??
      steps.find((s) => s.status === "waiting") ??
      null;

    const timeline: Array<{
      at: number;
      type: string;
      title: string;
      actor: string;
      fonction?: string | null;
      service?: string | null;
      detail?: string | null;
    }> = [];

    timeline.push({
      at: doc.createdAt ?? doc._creationTime,
      type: "envoi",
      title: "Courrier créé et envoyé",
      actor: doc.senderName,
      service: await deptLabel(ctx, doc.senderDepartmentId),
      detail: doc.objet,
    });

    for (const s of steps) {
      if (s.receivedAt) {
        timeline.push({
          at: s.receivedAt,
          type: "reception",
          title: "Réception confirmée",
          actor: s.assigneeName,
          fonction: s.assigneeFonction ?? null,
          service: s.assigneeDepartmentName ?? null,
        });
      }
      if (s.startedAt) {
        timeline.push({
          at: s.startedAt,
          type: "prise_en_charge",
          title: "Prise en charge",
          actor: s.assigneeName,
          fonction: s.assigneeFonction ?? null,
          service: s.assigneeDepartmentName ?? null,
        });
      }
      if (s.completedAt) {
        timeline.push({
          at: s.completedAt,
          type: "part_traitee",
          title: "Part marquée comme traitée",
          actor: s.assigneeName,
          fonction: s.assigneeFonction ?? null,
          service: s.assigneeDepartmentName ?? null,
          detail: s.note ?? null,
        });
      }
      if (s.transferredAt) {
        timeline.push({
          at: s.transferredAt,
          type: "transfert",
          title: `Transfert vers ${s.transferredToName ?? "un destinataire"}`,
          actor: s.assigneeName,
          fonction: s.assigneeFonction ?? null,
          service: s.assigneeDepartmentName ?? null,
          detail: s.transferNote ?? null,
        });
      }
    }

    if (doc.closedAt) {
      timeline.push({
        at: doc.closedAt,
        type: "classement",
        title: "Courrier classé définitivement — suivi terminé",
        actor: doc.closedByName ?? "—",
        fonction: doc.closedByFonction ?? null,
        service: doc.closedByDepartment ?? null,
      });
    }

    try {
      const logs = await ctx.db
        .query("auditLogs")
        .withIndex("by_document", (q) => q.eq("documentId", doc._id))
        .collect();
      for (const log of logs) {
        if (
          log.action === "document.sent" ||
          log.action.startsWith("tracking.")
        ) {
          /* already covered or will add from tracking */
        }
      }
    } catch {
      /* */
    }

    timeline.sort((a, b) => a.at - b.at);

    const isClosed = doc.status === "traite" && Boolean(doc.closedAt);
    const myStep = steps.find(
      (s) => s.assigneeId === userId && (s.status === "active" || s.status === "waiting"),
    );
    const myDoneStep = steps.find(
      (s) => s.assigneeId === userId && s.status === "done",
    );

    return {
      documentId: doc._id,
      publicRef: doc.publicRef ?? null,
      objet: doc.objet,
      status: doc.status,
      isClosed,
      senderId: doc.senderId,
      senderName: doc.senderName,
      recipientId: doc.recipientId ?? null,
      recipientName: doc.recipientName,
      currentHolder: active
        ? {
            userId: active.assigneeId,
            name: active.assigneeName,
            fonction: active.assigneeFonction ?? null,
            service: active.assigneeDepartmentName ?? null,
            stepStatus: active.status,
            receivedAt: active.receivedAt ?? null,
            startedAt: active.startedAt ?? null,
          }
        : isClosed
          ? null
          : {
              userId: doc.recipientId ?? null,
              name: doc.recipientName,
              fonction: null,
              service: await deptLabel(ctx, doc.recipientDepartmentId),
              stepStatus: "active" as const,
              receivedAt: null,
              startedAt: null,
            },
      closed: isClosed
        ? {
            at: doc.closedAt!,
            byName: doc.closedByName ?? null,
            byFonction: doc.closedByFonction ?? null,
            byDepartment: doc.closedByDepartment ?? null,
          }
        : null,
      dueAt: doc.dueAt ?? null,
      createdAt: doc.createdAt ?? doc._creationTime,
      timeline,
      steps: steps.map((s) => ({
        stepIndex: s.stepIndex,
        assigneeId: s.assigneeId,
        assigneeName: s.assigneeName,
        assigneeFonction: s.assigneeFonction ?? null,
        service: s.assigneeDepartmentName ?? null,
        status: s.status,
        receivedAt: s.receivedAt ?? null,
        startedAt: s.startedAt ?? null,
        completedAt: s.completedAt ?? null,
        transferredAt: s.transferredAt ?? null,
        transferredToName: s.transferredToName ?? null,
      })),
      permissions: {
        isSender: doc.senderId === userId,
        isCurrentHolder: Boolean(
          myStep || (doc.recipientId === userId && !isClosed),
        ),
        canReceive: Boolean(
          myStep && !myStep.receivedAt && myStep.status !== "done",
        ),
        canTakeCharge: Boolean(
          myStep &&
            myStep.receivedAt &&
            !myStep.startedAt &&
            myStep.status === "active",
        ),
        canCompletePart: Boolean(
          myStep && myStep.status === "active",
        ),
        canTransfer: Boolean(
          !isClosed &&
            (doc.recipientId === userId ||
              (myStep &&
                (myStep.status === "done" || myStep.status === "active"))),
        ),
        canClassify: Boolean(
          !isClosed && (doc.senderId === userId || isAdmin(user.role)),
        ),
      },
    };
  },
});

async function getOrCreateActiveStep(
  ctx: MutationCtx,
  doc: Doc<"documents">,
  user: Doc<"users">,
) {
  const steps = await loadSteps(ctx, doc._id);
  let mine = steps.find(
    (s) =>
      s.assigneeId === user._id &&
      (s.status === "active" || s.status === "waiting"),
  );
  if (mine) return mine;

  // Legacy: no steps yet — bootstrap for current recipient
  if (doc.recipientId === user._id && doc.status !== "traite") {
    const idx = steps.length;
    const id = await ctx.db.insert("documentSteps", {
      documentId: doc._id,
      stepIndex: idx,
      assigneeId: user._id,
      assigneeName: displayName(user),
      assigneeFonction: user.fonction ?? undefined,
      assigneeDepartmentName:
        (await deptLabel(ctx, user.departmentId)) ?? undefined,
      assigneeDepartmentId: user.departmentId,
      status: "active",
      activatedAt: Date.now(),
      createdAt: Date.now(),
      dueAt: doc.dueAt,
    });
    return (await ctx.db.get(id))!;
  }
  return null;
}

export const receiveCourrier = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Courrier introuvable.");
    if (doc.closedAt || doc.status === "traite") {
      throw new Error("Ce courrier est déjà classé.");
    }
    const step = await getOrCreateActiveStep(ctx, doc, user);
    if (!step) throw new Error("Vous n'êtes pas le responsable actuel.");
    if (step.receivedAt) return args.documentId;

    const now = Date.now();
    await ctx.db.patch(step._id, {
      receivedAt: now,
      status: "active",
      activatedAt: step.activatedAt ?? now,
    });
    if (doc.status === "envoye") {
      await ctx.db.patch(doc._id, {
        status: "consulte",
        viewedAt: doc.viewedAt ?? now,
        updatedAt: now,
      });
    }
    const who = displayName(user);
    await writeAudit(ctx, {
      action: "tracking.received",
      actorId: user._id,
      actorName: who,
      documentId: doc._id,
      details: "Réception confirmée",
    });
    if (doc.senderId !== user._id) {
      await pushNotification(ctx, {
        userId: doc.senderId,
        type: "document.status",
        title: "Réception confirmée",
        body: `${who} a réceptionné le courrier « ${doc.objet} ».`,
        documentId: doc._id,
      });
    }
    return args.documentId;
  },
});

export const takeCharge = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Courrier introuvable.");
    if (doc.closedAt || doc.status === "traite") {
      throw new Error("Ce courrier est déjà classé.");
    }
    const step = await getOrCreateActiveStep(ctx, doc, user);
    if (!step) throw new Error("Vous n'êtes pas le responsable actuel.");
    const now = Date.now();
    await ctx.db.patch(step._id, {
      receivedAt: step.receivedAt ?? now,
      startedAt: now,
      status: "active",
      activatedAt: step.activatedAt ?? now,
    });
    await ctx.db.patch(doc._id, {
      status: "en_cours",
      updatedAt: now,
      viewedAt: doc.viewedAt ?? now,
    });
    const who = displayName(user);
    await writeAudit(ctx, {
      action: "tracking.take_charge",
      actorId: user._id,
      actorName: who,
      documentId: doc._id,
      details: "Prise en charge",
    });
    return args.documentId;
  },
});

/** Termine UNIQUEMENT la part de l'intervenant — ne classe pas le dossier. */
export const completeMyPart = mutation({
  args: {
    documentId: v.id("documents"),
    note: v.optional(v.string()),
    /** Version modifiée jointe en même temps que la fin de part */
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Courrier introuvable.");
    if (doc.closedAt || doc.status === "traite") {
      throw new Error("Ce courrier est déjà classé.");
    }
    const step = await getOrCreateActiveStep(ctx, doc, user);
    if (!step) throw new Error("Vous n'êtes pas le responsable actuel.");
    if (step.status === "done") {
      throw new Error("Votre part est déjà marquée comme traitée.");
    }
    const now = Date.now();
    await ctx.db.patch(step._id, {
      status: "done",
      completedAt: now,
      actedAt: now,
      receivedAt: step.receivedAt ?? now,
      startedAt: step.startedAt ?? step.receivedAt ?? now,
      note: args.note?.trim().slice(0, 500) || step.note,
    });

    if (args.storageId && args.fileName) {
      await ctx.db.patch(doc._id, {
        storageId: args.storageId,
        fileName: args.fileName,
        contentType: args.contentType,
        size: args.size,
        revisionCount: (doc.revisionCount ?? 0) + 1,
        lastRevisedAt: now,
        lastRevisedByName: displayName(user),
      });
      await ctx.db.insert("documentRevisions", {
        documentId: doc._id,
        storageId: args.storageId,
        fileName: args.fileName,
        contentType: args.contentType,
        size: args.size,
        uploadedBy: user._id,
        uploadedByName: displayName(user),
        stepIndex: step.stepIndex,
        note: args.note?.trim().slice(0, 500) || "Version jointe à la fin de part",
        createdAt: now,
      });
    }

    // Activer l'étape suivante du circuit prédéfini (si encore en waiting)
    const allSteps = await loadSteps(ctx, doc._id);
    const nextWaiting = allSteps.find(
      (s) =>
        s.stepIndex > step.stepIndex &&
        s.status === "waiting" &&
        !s.completedAt,
    );
    if (nextWaiting) {
      await ctx.db.patch(nextWaiting._id, {
        status: "active",
        activatedAt: now,
        dueAt: now + 24 * 3600 * 1000,
      });
      await ctx.db.patch(doc._id, {
        recipientId: nextWaiting.assigneeId,
        recipientName: nextWaiting.assigneeName,
        recipientDepartmentId: nextWaiting.assigneeDepartmentId,
        status: "en_cours",
        currentStepIndex: nextWaiting.stepIndex,
        dueAt: now + 24 * 3600 * 1000,
        // L'urgence reste pour le prochain titulaire si le dossier était urgent
        updatedAt: now,
      });
      await pushNotification(ctx, {
        userId: nextWaiting.assigneeId,
        type: "document.received",
        title: "Circuit — à votre tour",
        body: `Le courrier « ${doc.objet} » vous est transmis (étape ${nextWaiting.stepIndex + 1}).`,
        documentId: doc._id,
      });
    } else {
      // Dernière part du circuit terminée : plus urgent, en attente de classement émetteur
      await ctx.db.patch(doc._id, {
        status: "en_cours",
        urgent: false,
        updatedAt: now,
      });
    }
    const who = displayName(user);
    await writeAudit(ctx, {
      action: "tracking.part_done",
      actorId: user._id,
      actorName: who,
      documentId: doc._id,
      details: "Part traitée — suivi toujours ouvert",
    });
    if (doc.senderId !== user._id) {
      await pushNotification(ctx, {
        userId: doc.senderId,
        type: "document.status",
        title: "Part traitée",
        body: `${who} a marqué sa part comme traitée sur « ${doc.objet} ». Le suivi reste ouvert.`,
        documentId: doc._id,
      });
    }
    return args.documentId;
  },
});

export const transferToPerson = mutation({
  args: {
    documentId: v.id("documents"),
    toUserId: v.id("users"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Courrier introuvable.");
    if (doc.closedAt || doc.status === "traite") {
      throw new Error("Ce courrier est déjà classé.");
    }
    if (args.toUserId === user._id) {
      throw new Error("Choisissez une autre personne.");
    }
    const toUser = await ctx.db.get(args.toUserId);
    if (!toUser || toUser.accountStatus !== "valide") {
      throw new Error("Destinataire introuvable ou non validé.");
    }

    const steps = await loadSteps(ctx, doc._id);
    let current =
      steps.find(
        (s) =>
          s.assigneeId === user._id &&
          (s.status === "active" || s.status === "waiting" || s.status === "done"),
      ) ?? null;

    if (!current && doc.recipientId === user._id) {
      current = await getOrCreateActiveStep(ctx, doc, user);
    }
    if (!current) {
      throw new Error("Vous n'êtes pas autorisé à transmettre ce courrier.");
    }

    const now = Date.now();
    const note = args.note?.trim().slice(0, 500);

    // Si part pas encore done, on enregistre le transfert sans forcer "done"
    await ctx.db.patch(current._id, {
      transferredToId: toUser._id,
      transferredToName: displayName(toUser),
      transferNote: note,
      transferredAt: now,
      actedAt: now,
    });

    const nextIndex =
      steps.reduce((m, s) => Math.max(m, s.stepIndex), -1) + 1;
    await ctx.db.insert("documentSteps", {
      documentId: doc._id,
      stepIndex: nextIndex,
      assigneeId: toUser._id,
      assigneeName: displayName(toUser),
      assigneeFonction: toUser.fonction ?? undefined,
      assigneeDepartmentName:
        (await deptLabel(ctx, toUser.departmentId)) ?? undefined,
      assigneeDepartmentId: toUser.departmentId,
      status: "active",
      activatedAt: now,
      createdAt: now,
      dueAt: now + 24 * 3600 * 1000,
      taskLabel: note,
    });

    await ctx.db.patch(doc._id, {
      recipientId: toUser._id,
      recipientName: displayName(toUser),
      recipientDepartmentId: toUser.departmentId,
      status: "en_cours",
      currentStepIndex: nextIndex,
      circuitTotalSteps: nextIndex + 1,
      hasCircuit: true,
      dueAt: now + 24 * 3600 * 1000,
      updatedAt: now,
    });

    const who = displayName(user);
    await writeAudit(ctx, {
      action: "tracking.transfer",
      actorId: user._id,
      actorName: who,
      documentId: doc._id,
      details: `Transfert vers ${displayName(toUser)}`,
      metadata: { toUserId: toUser._id, note },
    });

    await pushNotification(ctx, {
      userId: toUser._id,
      type: "document.received",
      title: "Courrier transmis",
      body: `${who} vous a transmis « ${doc.objet} ».`,
      documentId: doc._id,
    });
    if (doc.senderId !== user._id && doc.senderId !== toUser._id) {
      await pushNotification(ctx, {
        userId: doc.senderId,
        type: "document.status",
        title: "Courrier transmis",
        body: `${who} a transmis « ${doc.objet} » à ${displayName(toUser)}.`,
        documentId: doc._id,
      });
    }
    return args.documentId;
  },
});

/** Clôture définitive — seule action qui termine le suivi global. */
export const classifyDefinitively = mutation({
  args: {
    documentId: v.id("documents"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Courrier introuvable.");
    if (doc.closedAt || doc.status === "traite") {
      throw new Error("Ce courrier est déjà classé.");
    }

    const steps = await loadSteps(ctx, doc._id);
    const isSender = doc.senderId === user._id;
    const admin = isAdmin(user.role);
    if (!isSender && !admin) {
      throw new Error(
        "Seul l'émetteur initial ou un administrateur peut classer définitivement ce courrier.",
      );
    }
    const pendingSteps = steps.filter(
      (s) => s.status === "active" || s.status === "waiting",
    );
    // Circuit incomplet : l'émetteur peut forcer ; message clair si étapes restantes
    if (pendingSteps.length > 0 && !admin && isSender) {
      // autorisé pour l'émetteur (comme demandé) — on journalise
    } else if (pendingSteps.length > 0 && !admin && !isSender) {
      throw new Error(
        "Le circuit n'est pas terminé : toutes les parts doivent être traitées avant le classement.",
      );
    }

    const now = Date.now();
    const service = await deptLabel(ctx, user.departmentId);
    await ctx.db.patch(doc._id, {
      status: "traite",
      urgent: false,
      closedAt: now,
      closedByUserId: user._id,
      closedByName: displayName(user),
      closedByFonction: user.fonction ?? undefined,
      closedByDepartment: service ?? undefined,
      updatedAt: now,
    });

    // Clôturer les étapes actives restantes
    for (const s of steps) {
      if (s.status === "active" || s.status === "waiting") {
        await ctx.db.patch(s._id, {
          status: "done",
          completedAt: s.completedAt ?? now,
          actedAt: now,
        });
      }
    }

    const who = displayName(user);
    await writeAudit(ctx, {
      action: "tracking.classified",
      actorId: user._id,
      actorName: who,
      documentId: doc._id,
      details: args.note?.trim() || "Classement définitif — suivi terminé",
    });

    const notifyIds = new Set<string>([String(doc.senderId)]);
    for (const s of steps) notifyIds.add(String(s.assigneeId));
    notifyIds.delete(String(user._id));
    for (const id of notifyIds) {
      await pushNotification(ctx, {
        userId: id as Id<"users">,
        type: "document.status",
        title: "Courrier classé",
        body: `« ${doc.objet} » a été classé définitivement par ${who}. Suivi terminé.`,
        documentId: doc._id,
      });
    }
    return args.documentId;
  },
});
