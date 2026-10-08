import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function requireUserId(ctx: { auth: MutationCtx["auth"] }) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Vous devez être connecté.");
  return userId;
}

/** Création interne d'une notification (appelée depuis documents.ts) */
export const create = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    body: v.string(),
    documentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      documentId: args.documentId,
      createdAt: Date.now(),
    });
    return null;
  },
});

/** Liste des notifications de l'utilisateur (récentes d'abord) */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
    const items = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return items
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },
});

/** Nombre de non lues */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const items = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return items.filter((n) => !n.readAt).length;
  },
});

/** Marquer une notification comme lue */
export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const n = await ctx.db.get(args.notificationId);
    if (!n || n.userId !== userId) throw new Error("Notification introuvable.");
    if (!n.readAt) {
      await ctx.db.patch(args.notificationId, { readAt: Date.now() });
    }
    return null;
  },
});

/** Tout marquer comme lu */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const items = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const now = Date.now();
    for (const n of items) {
      if (!n.readAt) {
        await ctx.db.patch(n._id, { readAt: now });
      }
    }
    return null;
  },
});

/** Helper pour documents.ts */
export async function pushNotification(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    type: string;
    title: string;
    body: string;
    documentId?: Id<"documents">;
  },
) {
  await ctx.db.insert("notifications", {
    userId: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    documentId: args.documentId,
    createdAt: Date.now(),
  });
}
