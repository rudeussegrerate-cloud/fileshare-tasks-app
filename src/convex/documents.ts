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

type DbCtx = QueryCtx | MutationCtx;

const ROLES = {
  ROOT: "root",
  ADMIN: "admin",
} as const;

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

async function decorate(ctx: DbCtx, documents: Doc<"documents">[]) {
  return await Promise.all(
    documents.map(async (document) => ({
      ...document,
      objective: document.objective ?? "Objectif non précisé",
      ownerName: document.ownerName ?? null,
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
    objective: v.string(),
    task: v.string(),
    ownerName: v.optional(v.string()),
    extractedText: v.optional(v.string()),
    recipientId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const sender = await ctx.db.get(userId);
    if (!sender) throw new Error("Compte introuvable.");

    const objective = args.objective.trim();
    const task = args.task.trim();
    const ownerName = args.ownerName?.trim();
    if (objective.length < 3) {
      throw new Error("Précisez l'objectif de l'envoi.");
    }
    if (!task) throw new Error("Précisez la tâche à réaliser sur ce document.");

    const recipient = await ctx.db.get(args.recipientId);
    if (!recipient) throw new Error("Destinataire introuvable.");
    if (recipient._id === userId) {
      throw new Error("Vous ne pouvez pas vous envoyer un document à vous-même.");
    }

    const senderDepartmentId = sender.departmentId ?? null;
    const recipientDepartmentId = recipient.departmentId ?? null;
    const callerIsAdmin = isAdminRole(sender.role);

    // Chefs ne peuvent envoyer qu'aux membres de leur propre département.
    // Les DG et le super-utilisateur peuvent envoyer partout.
    if (!callerIsAdmin && senderDepartmentId !== recipientDepartmentId) {
      throw new Error(
        "Vous ne pouvez envoyer un document qu'aux membres de votre propre département.",
      );
    }

    const now = Date.now();
    const documentId = await ctx.db.insert("documents", {
      fileName: args.fileName,
      storageId: args.storageId,
      contentType: args.contentType,
      size: args.size,
      objective,
      task,
      ownerName: ownerName || undefined,
      extractedText: args.extractedText?.slice(0, 40000),
      summaryStatus: "en_attente",
      senderId: userId,
      senderName: displayName(sender),
      senderDepartmentId: sender.departmentId,
      senderDepartmentRole: sender.departmentRole,
      recipientId: recipient._id,
      recipientName: displayName(recipient),
      recipientDepartmentId: recipient.departmentId,
      recipientDepartmentRole: recipient.departmentRole,
      status: "envoye",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.ai.summarizeDocument, {
      documentId,
    });

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
      objective: document.objective ?? "Objectif non précisé",
      task: document.task,
      ownerName: document.ownerName ?? "",
      extractedText: document.extractedText ?? "",
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

/** Documents received by the signed-in person. */
export const inbox = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_recipient", (q) => q.eq("recipientId", userId))
      .collect();

    return await decorate(ctx, documents.sort(sortByDateDesc));
  },
});

/** Documents sent by the signed-in person. */
export const sent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_sender", (q) => q.eq("senderId", userId))
      .collect();

    return await decorate(ctx, documents.sort(sortByDateDesc));
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

    const now = Date.now();
    await ctx.db.patch(args.documentId, {
      status: "consulte",
      viewedAt: now,
      updatedAt: now,
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

    const now = Date.now();
    await ctx.db.patch(args.documentId, {
      status: args.status,
      updatedAt: now,
      viewedAt: document.viewedAt ?? now,
    });
    return null;
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
    const sent = await ctx.db
      .query("documents")
      .withIndex("by_sender", (q) => q.eq("senderId", userId))
      .collect();
    const departmentCount = (await ctx.db.query("departments").collect()).length;

    return {
      received: received.length,
      sent: sent.length,
      awaiting: received.filter((d) => d.status === "envoye").length,
      inProgress: received.filter((d) => d.status === "en_cours").length,
      done: received.filter((d) => d.status === "traite").length,
      departments: departmentCount,
    };
  },
});
