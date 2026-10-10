import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { pushNotification } from "./inAppNotifications";

const REACTIONS = ["👍", "❤️", "👏", "🎉", "😮"] as const;

function isAdmin(role: Doc<"users">["role"]) {
  return role === "admin" || role === "root";
}

async function requireUser(ctx: { db: any; auth: any }) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Non authentifié.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Utilisateur introuvable.");
  return user as Doc<"users">;
}

function roleLabel(user: Doc<"users">) {
  if (user.role === "root") return "Super utilisateur";
  if (user.role === "admin") return "Directeur Général";
  if (user.departmentRole === "chef") return "Chef de département";
  return "Membre";
}

/** Qui peut publier : comptes validés (tout le personnel). */
function canPost(user: Doc<"users">) {
  return user.accountStatus === "valide" || isAdmin(user.role);
}

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const me = await ctx.db.get(userId);
    if (!me) return [];

    const limit = Math.min(args.limit ?? 40, 80);
    const rows = await ctx.db.query("announcements").collect();
    rows.sort((a, b) => {
      const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pin !== 0) return pin;
      return b.createdAt - a.createdAt;
    });

    const out = [];
    for (const a of rows.slice(0, limit)) {
      const reactions = await ctx.db
        .query("announcementReactions")
        .withIndex("by_announcement", (q) => q.eq("announcementId", a._id))
        .collect();

      const counts: Record<string, number> = {};
      let myReaction: string | null = null;
      for (const r of reactions) {
        counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
        if (r.userId === userId) myReaction = r.emoji;
      }

      out.push({
        _id: a._id,
        title: a.title,
        body: a.body,
        origin: a.origin,
        authorId: a.authorId,
        authorName: a.authorName,
        authorFonction: a.authorFonction ?? null,
        authorDepartmentName: a.authorDepartmentName ?? null,
        authorRoleLabel: a.authorRoleLabel ?? null,
        priority: a.priority ?? "normal",
        pinned: Boolean(a.pinned),
        createdAt: a.createdAt,
        reactionCounts: counts,
        reactionTotal: reactions.length,
        myReaction,
        canDelete:
          a.authorId === userId || isAdmin(me.role),
      });
    }
    return out;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    origin: v.string(),
    priority: v.optional(
      v.union(
        v.literal("normal"),
        v.literal("important"),
        v.literal("urgent"),
      ),
    ),
    pinned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!canPost(me)) {
      throw new Error("Votre compte doit être validé pour publier une annonce.");
    }

    const title = args.title.trim().slice(0, 120);
    const body = args.body.trim().slice(0, 4000);
    const origin = args.origin.trim().slice(0, 80);
    if (title.length < 3) throw new Error("Titre trop court.");
    if (body.length < 5) throw new Error("Message trop court.");
    if (origin.length < 2) throw new Error("Indiquez la provenance de l'annonce.");

    let departmentName: string | undefined;
    if (me.departmentId) {
      const dep = await ctx.db.get(me.departmentId);
      departmentName = dep?.name;
    }

    // Seuls chef / DG peuvent épingler
    const canPin = isAdmin(me.role) || me.departmentRole === "chef";
    const pinned = canPin && Boolean(args.pinned);

    const id = await ctx.db.insert("announcements", {
      authorId: me._id,
      title,
      body,
      origin,
      authorName: me.name ?? me.email ?? "Utilisateur",
      authorFonction: me.fonction,
      authorDepartmentName: departmentName,
      authorRoleLabel: roleLabel(me),
      priority: args.priority ?? "normal",
      pinned,
      createdAt: Date.now(),
    });

    // Notifier les collègues validés (sauf l'auteur)
    const users = await ctx.db.query("users").collect();
    const authorLabel = me.name ?? "Un collègue";
    for (const u of users) {
      if (u._id === me._id) continue;
      if (u.accountStatus && u.accountStatus !== "valide") continue;
      if (!u.accountStatus && !isAdmin(u.role)) continue;
      await pushNotification(ctx, {
        userId: u._id,
        type: "announcement.new",
        title: "Nouvelle annonce",
        body: `${authorLabel} · ${title}`,
      });
    }

    return id;
  },
});

export const remove = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const a = await ctx.db.get(args.announcementId);
    if (!a) throw new Error("Annonce introuvable.");
    if (a.authorId !== me._id && !isAdmin(me.role)) {
      throw new Error("Vous ne pouvez pas supprimer cette annonce.");
    }
    const reactions = await ctx.db
      .query("announcementReactions")
      .withIndex("by_announcement", (q) =>
        q.eq("announcementId", args.announcementId),
      )
      .collect();
    for (const r of reactions) await ctx.db.delete(r._id);
    await ctx.db.delete(args.announcementId);
    return null;
  },
});

/** Ajouter / changer / retirer une réaction (un emoji par utilisateur). */
export const react = mutation({
  args: {
    announcementId: v.id("announcements"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!canPost(me) && me.accountStatus !== "valide") {
      throw new Error("Compte non autorisé.");
    }
    if (!(REACTIONS as readonly string[]).includes(args.emoji)) {
      throw new Error("Réaction non autorisée.");
    }
    const a = await ctx.db.get(args.announcementId);
    if (!a) throw new Error("Annonce introuvable.");

    const existing = await ctx.db
      .query("announcementReactions")
      .withIndex("by_user_announcement", (q) =>
        q.eq("userId", me._id).eq("announcementId", args.announcementId),
      )
      .first();

    if (existing) {
      if (existing.emoji === args.emoji) {
        await ctx.db.delete(existing._id);
        return null;
      }
      await ctx.db.patch(existing._id, { emoji: args.emoji, createdAt: Date.now() });
      return existing._id;
    }

    return await ctx.db.insert("announcementReactions", {
      announcementId: args.announcementId,
      userId: me._id,
      emoji: args.emoji,
      createdAt: Date.now(),
    });
  },
});
