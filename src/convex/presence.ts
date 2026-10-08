import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Seuil : en ligne si activité dans les 2 dernières minutes */
export const ONLINE_MS = 2 * 60 * 1000;

/**
 * Heartbeat appelé régulièrement par le client connecté.
 */
export const heartbeat = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    await ctx.db.patch(userId, { lastSeenAt: Date.now() });
    return null;
  },
});

/**
 * Indique si un utilisateur est considéré en ligne.
 */
export const isOnline = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user?.lastSeenAt) return false;
    return Date.now() - user.lastSeenAt < ONLINE_MS;
  },
});

/**
 * Statut de présence pour une liste d'utilisateurs (collègues, listes).
 */
export const statusFor = query({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const result: Record<string, boolean> = {};
    for (const id of args.userIds) {
      const user = await ctx.db.get(id);
      result[id] =
        Boolean(user?.lastSeenAt) && now - (user!.lastSeenAt as number) < ONLINE_MS;
    }
    return result;
  },
});
