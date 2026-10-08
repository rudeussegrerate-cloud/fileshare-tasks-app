import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Journal d'audit global — réservé au DG / root.
 * Les écritures sont faites côté documents.ts (et autres mutations).
 */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "root" && user.role !== "admin")) {
      return [];
    }
    const limit = Math.min(args.limit ?? 80, 200);
    return await ctx.db
      .query("auditLogs")
      .withIndex("by_created")
      .order("desc")
      .take(limit);
  },
});
