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
        Boolean(user?.lastSeenAt) &&
        now - (user!.lastSeenAt as number) < ONLINE_MS;
    }
    return result;
  },
});

/**
 * Annuaire de présence type Facebook : tous les comptes validés visibles
 * par un utilisateur connecté (avec indicateur en ligne).
 */
export const onlineDirectory = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const me = await ctx.db.get(userId);
    if (!me || me.accountStatus !== "valide") return [];

    const now = Date.now();
    const users = await ctx.db.query("users").collect();
    const rows = [];
    for (const u of users) {
      if (u.accountStatus !== "valide") continue;
      if (!u.name && !u.email) continue;
      if (u.isAnonymous) continue;
      const department = u.departmentId
        ? await ctx.db.get(u.departmentId)
        : null;
      const online =
        Boolean(u.lastSeenAt) && now - (u.lastSeenAt as number) < ONLINE_MS;
      rows.push({
        _id: u._id,
        name: u.name ?? u.email ?? "Utilisateur",
        email: u.email ?? null,
        fonction: u.fonction ?? null,
        departmentName: department?.name ?? null,
        departmentRole: u.departmentRole ?? null,
        online,
        lastSeenAt: u.lastSeenAt ?? null,
        isSelf: u._id === userId,
      });
    }
    // En ligne d'abord, puis alpha
    rows.sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.name.localeCompare(b.name, "fr");
    });
    return rows;
  },
});
