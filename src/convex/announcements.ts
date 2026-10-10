import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { pushNotification } from "./inAppNotifications";
import { assertRateLimit, sanitizeText, writeAudit } from "./lib/security";

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

function canPost(user: Doc<"users">) {
  return user.accountStatus === "valide" || isAdmin(user.role);
}

function canViewAnnouncement(
  a: Doc<"announcements">,
  me: Doc<"users">,
): boolean {
  if (a.authorId === me._id || isAdmin(me.role)) return true;
  const visibility = a.visibility ?? "public";
  if (visibility === "public") return true;
  if (visibility === "private") {
    if (!a.departmentId || !me.departmentId) return false;
    return a.departmentId === me.departmentId;
  }
  return (a.viewerIds ?? []).includes(me._id);
}

export const generateMediaUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    try {
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
    for (const a of rows) {
      if (!canViewAnnouncement(a, me)) continue;

      let reactions: Doc<"announcementReactions">[] = [];
      try {
        reactions = await ctx.db
          .query("announcementReactions")
          .withIndex("by_announcement", (q) => q.eq("announcementId", a._id))
          .collect();
      } catch {
        const allR = await ctx.db.query("announcementReactions").collect();
        reactions = allR.filter((r) => r.announcementId === a._id);
      }

      const counts: Record<string, number> = {};
      let myReaction: string | null = null;
      for (const r of reactions) {
        counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
        if (r.userId === userId) myReaction = r.emoji;
      }

      let comments: Doc<"announcementComments">[] = [];
      try {
        comments = await ctx.db
          .query("announcementComments")
          .withIndex("by_announcement", (q) => q.eq("announcementId", a._id))
          .collect();
      } catch {
        const allC = await ctx.db.query("announcementComments").collect();
        comments = allC.filter((c) => c.announcementId === a._id);
      }
      comments.sort((x, y) => x.createdAt - y.createdAt);

      const visibility = a.visibility ?? "public";
      let mediaUrl: string | null = null;
      if (a.mediaStorageId) {
        mediaUrl = await ctx.storage.getUrl(a.mediaStorageId);
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
        visibility,
        visibilityLabel:
          visibility === "public"
            ? "Publique — tous les départements"
            : visibility === "private"
              ? "Privée — mon département"
              : "Personnalisée — personnes choisies",
        viewerCount:
          visibility === "custom" ? (a.viewerIds?.length ?? 0) : null,
        mediaType: a.mediaType ?? null,
        mediaUrl,
        createdAt: a.createdAt,
        reactionCounts: counts,
        reactionTotal: reactions.length,
        myReaction,
        comments: comments.map((c) => ({
          _id: c._id,
          authorName: c.authorName,
          body: c.body,
          createdAt: c.createdAt,
          isMine: c.authorId === userId,
        })),
        commentCount: comments.length,
        canDelete: a.authorId === userId || isAdmin(me.role),
      });
      if (out.length >= limit) break;
    }
    return out;
    } catch (e) {
      console.error("[announcements.list]", e);
      return [];
    }
  },
});

export const listPotentialViewers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const users = await ctx.db.query("users").collect();
    return users
      .filter(
        (u) =>
          u._id !== userId &&
          (u.accountStatus === "valide" || isAdmin(u.role)),
      )
      .map((u) => ({
        _id: u._id,
        name: u.name ?? u.email ?? "Utilisateur",
        fonction: u.fonction ?? null,
        departmentId: u.departmentId ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
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
    visibility: v.union(
      v.literal("public"),
      v.literal("private"),
      v.literal("custom"),
    ),
    viewerIds: v.optional(v.array(v.id("users"))),
    mediaStorageId: v.optional(v.id("_storage")),
    mediaType: v.optional(v.union(v.literal("image"), v.literal("video"))),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!canPost(me)) {
      throw new Error("Votre compte doit être validé pour publier une annonce.");
    }

    await assertRateLimit(ctx, {
      userId: me._id,
      action: "announcement.create",
      maxPerWindow: 15,
      windowMs: 30 * 60 * 1000,
    });
    const title = sanitizeText(args.title, 120);
    const body = sanitizeText(args.body, 4000);
    const origin = sanitizeText(args.origin, 80);
    if (title.length < 3) throw new Error("Titre trop court.");
    if (body.length < 2 && !args.mediaStorageId) {
      throw new Error("Ajoutez un message ou un média.");
    }
    if (origin.length < 2) throw new Error("Indiquez la provenance de l'annonce.");

    if (args.visibility === "private" && !me.departmentId && !isAdmin(me.role)) {
      throw new Error(
        "Vous devez appartenir à un département pour une annonce privée.",
      );
    }

    let viewerIds: Id<"users">[] | undefined;
    if (args.visibility === "custom") {
      const set = new Set((args.viewerIds ?? []).filter((id) => id !== me._id));
      if (set.size === 0) {
        throw new Error(
          "Choisissez au moins une personne pour une annonce personnalisée.",
        );
      }
      viewerIds = [...set];
    }

    let departmentName: string | undefined;
    if (me.departmentId) {
      const dep = await ctx.db.get(me.departmentId);
      departmentName = dep?.name;
    }

    const canPin = isAdmin(me.role) || me.departmentRole === "chef";
    const pinned = canPin && Boolean(args.pinned);

    if (args.mediaStorageId && !args.mediaType) {
      throw new Error("Type de média manquant.");
    }

    const id = await ctx.db.insert("announcements", {
      authorId: me._id,
      title,
      body: body || "(Média joint)",
      origin,
      authorName: me.name ?? me.email ?? "Utilisateur",
      authorFonction: me.fonction,
      authorDepartmentName: departmentName,
      authorRoleLabel: roleLabel(me),
      priority: args.priority ?? "normal",
      pinned,
      visibility: args.visibility,
      departmentId:
        args.visibility === "private" ? me.departmentId : undefined,
      viewerIds,
      mediaStorageId: args.mediaStorageId,
      mediaType: args.mediaType,
      createdAt: Date.now(),
    });

    const authorLabel = me.name ?? "Un collègue";
    const users = await ctx.db.query("users").collect();
    for (const u of users) {
      if (u._id === me._id) continue;
      if (u.accountStatus && u.accountStatus !== "valide" && !isAdmin(u.role)) {
        continue;
      }
      let ok = false;
      if (args.visibility === "public") ok = true;
      else if (
        args.visibility === "private" &&
        me.departmentId &&
        u.departmentId === me.departmentId
      ) {
        ok = true;
      } else if (
        args.visibility === "custom" &&
        viewerIds?.includes(u._id)
      ) {
        ok = true;
      }
      if (!ok) continue;
      await pushNotification(ctx, {
        userId: u._id,
        type: "announcement.new",
        title: "Nouvelle annonce",
        body: `${authorLabel} · ${title}`,
      });
    }

    await writeAudit(ctx, {
      action: "announcement.create",
      actorId: me._id,
      actorName: me.name ?? me.email ?? "Utilisateur",
      details: title,
    });
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
    const comments = await ctx.db
      .query("announcementComments")
      .withIndex("by_announcement", (q) =>
        q.eq("announcementId", args.announcementId),
      )
      .collect();
    for (const c of comments) await ctx.db.delete(c._id);
    if (a.mediaStorageId) {
      try {
        await ctx.storage.delete(a.mediaStorageId);
      } catch {
        /* ignore */
      }
    }
    await ctx.db.delete(args.announcementId);
    return null;
  },
});

export const react = mutation({
  args: {
    announcementId: v.id("announcements"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!(REACTIONS as readonly string[]).includes(args.emoji)) {
      throw new Error("Réaction non autorisée.");
    }
    const a = await ctx.db.get(args.announcementId);
    if (!a) throw new Error("Annonce introuvable.");
    if (!canViewAnnouncement(a, me)) {
      throw new Error("Vous n'avez pas accès à cette annonce.");
    }

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
      await ctx.db.patch(existing._id, {
        emoji: args.emoji,
        createdAt: Date.now(),
      });
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

export const addComment = mutation({
  args: {
    announcementId: v.id("announcements"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const a = await ctx.db.get(args.announcementId);
    if (!a) throw new Error("Annonce introuvable.");
    if (!canViewAnnouncement(a, me)) {
      throw new Error("Vous n'avez pas accès à cette annonce.");
    }
    const body = args.body.trim().slice(0, 1000);
    if (body.length < 1) throw new Error("Commentaire vide.");
    return await ctx.db.insert("announcementComments", {
      announcementId: args.announcementId,
      authorId: me._id,
      authorName: me.name ?? me.email ?? "Utilisateur",
      body,
      createdAt: Date.now(),
    });
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id("announcementComments") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const c = await ctx.db.get(args.commentId);
    if (!c) throw new Error("Commentaire introuvable.");
    if (c.authorId !== me._id && !isAdmin(me.role)) {
      throw new Error("Suppression non autorisée.");
    }
    await ctx.db.delete(args.commentId);
    return null;
  },
});
