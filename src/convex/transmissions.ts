import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  confidentialityValidator,
  routingModeValidator,
  transmissionStatusValidator,
} from "./schema";
import { pushNotification } from "./inAppNotifications";
import { assertRateLimit, sanitizeText } from "./lib/security";

type DbCtx = QueryCtx | MutationCtx;
const ROLES = { ROOT: "root", ADMIN: "admin" } as const;

async function requireUser(ctx: DbCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Vous devez être connecté.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Utilisateur introuvable.");
  return { userId, user };
}

function displayName(user: { name?: string | null; email?: string | null }) {
  return user.name?.trim() || user.email || "Utilisateur";
}

function isAdmin(role?: string | null) {
  return role === ROLES.ROOT || role === ROLES.ADMIN;
}

async function parentEntity(ctx: DbCtx, entityId: Id<"departments">) {
  const entity = await ctx.db.get(entityId);
  if (!entity?.parentId) return null;
  return await ctx.db.get(entity.parentId);
}

export const send = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    objet: v.string(),
    observations: v.optional(v.string()),
    tasks: v.array(v.string()),
    fromEntityId: v.id("departments"),
    toEntityIds: v.array(v.id("departments")),
    ampliationEntityIds: v.optional(v.array(v.id("departments"))),
    routingMode: routingModeValidator,
    confidentiality: v.optional(confidentialityValidator),
    referenceNumber: v.optional(v.string()),
    taskLabel: v.optional(v.string()),
    comment: v.optional(v.string()),
    toUserId: v.optional(v.id("users")),
    dueAt: v.optional(v.number()),
    existingDocumentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    await assertRateLimit(ctx, userId, "transmission.send", 30, 60_000);

    if (!user.departmentId && !isAdmin(user.role)) {
      throw new Error("Vous devez être rattaché à une entité pour transmettre.");
    }

    const fromEntity = await ctx.db.get(args.fromEntityId);
    if (!fromEntity) throw new Error("Entité émettrice introuvable.");

    if (
      !isAdmin(user.role) &&
      user.departmentId !== args.fromEntityId
    ) {
      const myDept = user.departmentId
        ? await ctx.db.get(user.departmentId)
        : null;
      if (
        !myDept ||
        (myDept._id !== args.fromEntityId &&
          myDept.parentId !== args.fromEntityId)
      ) {
        throw new Error("Vous ne pouvez transmettre qu'au nom de votre entité.");
      }
    }

    let toEntityIds = [...args.toEntityIds];
    if (args.routingMode === "hierarchique") {
      const parent = await parentEntity(ctx, args.fromEntityId);
      if (!parent) {
        throw new Error(
          "Aucun niveau supérieur : voie hiérarchique impossible depuis cette entité.",
        );
      }
      toEntityIds = [parent._id];
    }
    if (toEntityIds.length === 0) {
      throw new Error("Sélectionnez au moins une entité destinataire.");
    }

    const now = Date.now();
    const objet = sanitizeText(args.objet, 300);
    const observations = args.observations
      ? sanitizeText(args.observations, 2000)
      : undefined;
    const comment = args.comment ? sanitizeText(args.comment, 1000) : undefined;
    const taskLabel = args.taskLabel
      ? sanitizeText(args.taskLabel, 200)
      : undefined;
    const referenceNumber = args.referenceNumber
      ? sanitizeText(args.referenceNumber, 80)
      : undefined;

    let recipientId: Id<"users"> = userId;
    let recipientName = displayName(user);
    let recipientDepartmentId: Id<"departments"> | undefined = toEntityIds[0];

    if (args.toUserId) {
      const target = await ctx.db.get(args.toUserId);
      if (target) {
        recipientId = target._id;
        recipientName = displayName(target);
        recipientDepartmentId = target.departmentId ?? toEntityIds[0];
      }
    } else {
      const members = await ctx.db
        .query("users")
        .withIndex("by_department", (q) => q.eq("departmentId", toEntityIds[0]))
        .collect();
      const chef = members.find((m) => m.departmentRole === "chef");
      const pick = chef ?? members[0];
      if (pick) {
        recipientId = pick._id;
        recipientName = displayName(pick);
      }
    }

    let documentId = args.existingDocumentId;
    if (!documentId) {
      const y = new Date().getFullYear();
      const part = Math.random().toString(36).slice(2, 8).toUpperCase();
      const publicRef = `SD-${y}-${part}`;
      documentId = await ctx.db.insert("documents", {
        fileName: args.fileName,
        storageId: args.storageId,
        contentType: args.contentType,
        size: args.size,
        objet,
        observations,
        tasks: args.tasks,
        task: args.tasks.join(" · ") || undefined,
        onBehalfOfType: "internal",
        onBehalfOfUserId: userId,
        onBehalfOfName: displayName(user),
        summaryStatus: "en_attente",
        senderId: userId,
        senderName: displayName(user),
        senderDepartmentId: args.fromEntityId,
        owningEntityId: args.fromEntityId,
        confidentiality: args.confidentiality ?? "normal",
        referenceNumber,
        recipientId,
        recipientName,
        recipientDepartmentId,
        status: "envoye",
        publicRef,
        hasCircuit: false,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const existing = await ctx.db.get(documentId);
      if (!existing) throw new Error("Document introuvable.");
      await ctx.db.patch(documentId, {
        updatedAt: now,
        status: "envoye",
        recipientId,
        recipientName,
        recipientDepartmentId,
      });
    }

    const transmissionIds: Id<"transmissions">[] = [];

    for (const toEntityId of toEntityIds) {
      const toEntity = await ctx.db.get(toEntityId);
      if (!toEntity) continue;
      const tid = await ctx.db.insert("transmissions", {
        documentId,
        fromEntityId: args.fromEntityId,
        toEntityId,
        fromUserId: userId,
        fromUserName: displayName(user),
        toUserId: args.toUserId,
        toUserName: args.toUserId ? recipientName : undefined,
        routingMode: args.routingMode,
        status: "envoye",
        isAmpliation: false,
        comment,
        taskLabel,
        dueAt: args.dueAt,
        createdAt: now,
        updatedAt: now,
      });
      transmissionIds.push(tid);

      const members = await ctx.db
        .query("users")
        .withIndex("by_department", (q) => q.eq("departmentId", toEntityId))
        .collect();
      for (const m of members.slice(0, 20)) {
        await pushNotification(ctx, {
          userId: m._id,
          type: "document.received",
          title: "Nouvelle transmission",
          body: `${displayName(user)} (${fromEntity.name}) → ${toEntity.name} : ${objet}`,
          documentId,
        });
      }
    }

    for (const ampId of args.ampliationEntityIds ?? []) {
      if (toEntityIds.includes(ampId)) continue;
      const amp = await ctx.db.get(ampId);
      if (!amp) continue;
      const tid = await ctx.db.insert("transmissions", {
        documentId,
        fromEntityId: args.fromEntityId,
        toEntityId: ampId,
        fromUserId: userId,
        fromUserName: displayName(user),
        routingMode: "ampliation",
        status: "envoye",
        isAmpliation: true,
        comment: comment
          ? `Ampliation — ${comment}`
          : "Ampliation (pour information)",
        taskLabel: "Pour information",
        createdAt: now,
        updatedAt: now,
      });
      transmissionIds.push(tid);
    }

    await ctx.db.insert("auditLogs", {
      action: "transmission.sent",
      actorId: userId,
      actorName: displayName(user),
      documentId,
      details: `${args.routingMode} → ${toEntityIds.length} destinataire(s)`,
      createdAt: now,
    });

    return { documentId, transmissionIds };
  },
});

export const setStatus = mutation({
  args: {
    transmissionId: v.id("transmissions"),
    status: transmissionStatusValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    const tr = await ctx.db.get(args.transmissionId);
    if (!tr) throw new Error("Transmission introuvable.");

    const canAct =
      isAdmin(user.role) ||
      user.departmentId === tr.toEntityId ||
      tr.toUserId === userId;

    if (!canAct) {
      throw new Error("Vous n'êtes pas habilité à traiter cette transmission.");
    }

    let status = args.status;
    if (tr.isAmpliation && status === "traite") status = "lu";

    const now = Date.now();
    await ctx.db.patch(args.transmissionId, {
      status,
      updatedAt: now,
      actedAt: now,
      actedBy: userId,
      comment: args.note ? sanitizeText(args.note, 1000) : tr.comment,
    });

    const doc = await ctx.db.get(tr.documentId);
    if (doc) {
      const map: Record<string, "envoye" | "consulte" | "en_cours" | "traite"> =
        {
          envoye: "envoye",
          recu: "consulte",
          lu: "consulte",
          traite: "traite",
          retourne: "en_cours",
          transmis: "en_cours",
          brouillon: "envoye",
        };
      await ctx.db.patch(tr.documentId, {
        status: map[status] ?? doc.status,
        updatedAt: now,
        viewedAt:
          status === "lu" || status === "recu" ? now : doc.viewedAt,
      });
    }

    await pushNotification(ctx, {
      userId: tr.fromUserId,
      type: "document.status",
      title: "Transmission mise à jour",
      body: `${displayName(user)} a marqué la transmission « ${status} ».`,
      documentId: tr.documentId,
    });

    return { ok: true };
  },
});

export const forward = mutation({
  args: {
    transmissionId: v.id("transmissions"),
    toEntityId: v.id("departments"),
    routingMode: v.optional(routingModeValidator),
    comment: v.optional(v.string()),
    taskLabel: v.optional(v.string()),
    toUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    const tr = await ctx.db.get(args.transmissionId);
    if (!tr) throw new Error("Transmission introuvable.");

    if (
      !isAdmin(user.role) &&
      user.departmentId !== tr.toEntityId &&
      tr.toUserId !== userId
    ) {
      throw new Error("Seule l'entité destinataire peut transmettre plus loin.");
    }

    const now = Date.now();
    await ctx.db.patch(args.transmissionId, {
      status: "transmis",
      updatedAt: now,
      actedAt: now,
      actedBy: userId,
    });

    const fromEntityId = tr.toEntityId;
    let toEntityId = args.toEntityId;
    const mode = args.routingMode ?? "direct";
    if (mode === "hierarchique") {
      const parent = await parentEntity(ctx, fromEntityId);
      if (!parent) throw new Error("Pas de niveau supérieur.");
      toEntityId = parent._id;
    }

    const newId = await ctx.db.insert("transmissions", {
      documentId: tr.documentId,
      fromEntityId,
      toEntityId,
      fromUserId: userId,
      fromUserName: displayName(user),
      toUserId: args.toUserId,
      routingMode: mode,
      status: "envoye",
      isAmpliation: false,
      comment: args.comment ? sanitizeText(args.comment, 1000) : undefined,
      taskLabel: args.taskLabel
        ? sanitizeText(args.taskLabel, 200)
        : tr.taskLabel,
      parentTransmissionId: args.transmissionId,
      createdAt: now,
      updatedAt: now,
    });

    return { transmissionId: newId };
  },
});

export const inbox = query({
  args: {
    status: v.optional(transmissionStatusValidator),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    if (!user.departmentId && !isAdmin(user.role)) return [];

    let rows;
    if (isAdmin(user.role) && !user.departmentId) {
      rows = await ctx.db.query("transmissions").order("desc").take(100);
    } else {
      const entityId = user.departmentId!;
      rows = await ctx.db
        .query("transmissions")
        .withIndex("by_to_entity", (q) => q.eq("toEntityId", entityId))
        .order("desc")
        .take(80);
    }

    const filtered = args.status
      ? rows.filter((r) => r.status === args.status)
      : rows;

    const enriched = [];
    for (const r of filtered) {
      const doc = await ctx.db.get(r.documentId);
      const fromEntity = await ctx.db.get(r.fromEntityId);
      const toEntity = await ctx.db.get(r.toEntityId);
      if (!doc) continue;
      enriched.push({
        ...r,
        objet: doc.objet,
        fileName: doc.fileName,
        publicRef: doc.publicRef,
        referenceNumber: doc.referenceNumber,
        confidentiality: doc.confidentiality ?? "normal",
        fromEntityName: fromEntity?.name ?? "—",
        toEntityName: toEntity?.name ?? "—",
        fromEntityCode: fromEntity?.code,
        toEntityCode: toEntity?.code,
      });
    }
    return enriched;
  },
});

export const sent = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireUser(ctx);
    if (!user.departmentId && !isAdmin(user.role)) return [];

    const entityId = user.departmentId;
    let rows;
    if (entityId) {
      rows = await ctx.db
        .query("transmissions")
        .withIndex("by_from_entity", (q) => q.eq("fromEntityId", entityId))
        .order("desc")
        .take(80);
    } else {
      rows = await ctx.db.query("transmissions").order("desc").take(100);
    }

    const enriched = [];
    for (const r of rows) {
      const doc = await ctx.db.get(r.documentId);
      const fromEntity = await ctx.db.get(r.fromEntityId);
      const toEntity = await ctx.db.get(r.toEntityId);
      if (!doc) continue;
      enriched.push({
        ...r,
        objet: doc.objet,
        fileName: doc.fileName,
        publicRef: doc.publicRef,
        fromEntityName: fromEntity?.name ?? "—",
        toEntityName: toEntity?.name ?? "—",
      });
    }
    return enriched;
  },
});

export const history = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("transmissions")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    rows.sort((a, b) => a.createdAt - b.createdAt);
    const out = [];
    for (const r of rows) {
      const fromEntity = await ctx.db.get(r.fromEntityId);
      const toEntity = await ctx.db.get(r.toEntityId);
      out.push({
        ...r,
        fromEntityName: fromEntity?.name ?? "—",
        toEntityName: toEntity?.name ?? "—",
        fromEntityCode: fromEntity?.code,
        toEntityCode: toEntity?.code,
      });
    }
    return out;
  },
});
