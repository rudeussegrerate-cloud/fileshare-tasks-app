import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
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

function canPost(user: Doc<"users">) {
  return user.accountStatus === "valide" || isAdmin(user.role);
}

function canView(
  a: any,
  me: Doc<"users">,
): boolean {
  if (a.authorId === me._id) return true;
  if (isAdmin(me.role)) return true;
  const vis = a.visibility ?? "public";
  if (vis === "public") return true;
  if (vis === "private") {
    return !!(a.departmentId && me.departmentId && a.departmentId === me.departmentId);
  }
  if (vis === "custom") {
    const ids: string[] = Array.isArray(a.viewerIds) ? a.viewerIds : [];
    return ids.includes(me._id);
  }
  return true;
}

export const generateMediaUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Liste des annonces — version minimale stable */
export const listFeed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const me = await ctx.db.get(userId);
    if (!me) return [];

    const limit = Math.min(args.limit ?? 40, 80);
    const rows = await ctx.db.query("announcements").collect();

    rows.sort((a: any, b: any) => {
      const pin = Number(!!b.pinned) - Number(!!a.pinned);
      if (pin !== 0) return pin;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });

    const result = [];
    for (const a of rows as any[]) {
      if (!canView(a, me)) continue;

      result.push({
        _id: a._id,
        title: String(a.title ?? ""),
        body: String(a.body ?? ""),
        origin: String(a.origin ?? ""),
        authorId: a.authorId,
        authorName: String(a.authorName ?? "Utilisateur"),
        authorFonction: a.authorFonction ?? null,
        authorDepartmentName: a.authorDepartmentName ?? null,
        authorRoleLabel: a.authorRoleLabel ?? null,
        priority: a.priority ?? "normal",
        pinned: !!a.pinned,
        visibility: a.visibility ?? "public",
        visibilityLabel:
          (a.visibility ?? "public") === "public"
            ? "Publique"
            : (a.visibility ?? "") === "private"
              ? "Privée — mon département"
              : "Personnalisée",
        viewerCount: Array.isArray(a.viewerIds) ? a.viewerIds.length : null,
        mediaType: a.mediaType ?? null,
        mediaUrl: null as string | null,
        createdAt: a.createdAt ?? 0,
        reactionCounts: {} as Record<string, number>,
        reactionTotal: 0,
        myReaction: null as string | null,
        comments: [] as Array<{
          _id: string;
          authorName: string;
          body: string;
          createdAt: number;
          isMine: boolean;
        }>,
        commentCount: 0,
        canDelete: a.authorId === userId || isAdmin(me.role),
      });

      if (result.length >= limit) break;
    }

    // Enrichir réactions / commentaires / média sans faire échouer la liste
    try {
      const reactions = await ctx.db.query("announcementReactions").collect();
      const comments = await ctx.db.query("announcementComments").collect();
      for (const item of result) {
        const id = item._id;
        const rs = reactions.filter((r: any) => r.announcementId === id);
        const counts: Record<string, number> = {};
        let my: string | null = null;
        for (const r of rs as any[]) {
          counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
          if (r.userId === userId) my = r.emoji;
        }
        item.reactionCounts = counts;
        item.reactionTotal = rs.length;
        item.myReaction = my;
        const cs = comments
          .filter((c: any) => c.announcementId === id)
          .sort((x: any, y: any) => x.createdAt - y.createdAt);
        item.comments = cs.map((c: any) => ({
          _id: c._id,
          authorName: c.authorName,
          body: c.body,
          createdAt: c.createdAt,
          isMine: c.authorId === userId,
        }));
        item.commentCount = cs.length;
      }
    } catch (e) {
      console.error("[announcements.list] enrich", e);
    }

    // Médias
    try {
      for (const item of result) {
        const row = (rows as any[]).find((r) => r._id === item._id);
        if (row?.mediaStorageId) {
          item.mediaUrl = await ctx.storage.getUrl(row.mediaStorageId);
          item.mediaType = row.mediaType ?? item.mediaType;
        }
      }
    } catch (e) {
      console.error("[announcements.list] media", e);
    }

    return result;
  },
});

/** Alias stable pour les clients existants */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Délègue la même logique minimaliste
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const me = await ctx.db.get(userId);
    if (!me) return [];
    const limit = Math.min(args.limit ?? 40, 80);
    const rows = await ctx.db.query("announcements").collect();
    rows.sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const out: any[] = [];
    for (const a of rows as any[]) {
      if (a.authorId !== me._id && me.role !== "admin" && me.role !== "root") {
        const vis = a.visibility ?? "public";
        if (vis === "private" && a.departmentId !== me.departmentId) continue;
        if (vis === "custom") {
          const ids = Array.isArray(a.viewerIds) ? a.viewerIds : [];
          if (!ids.includes(me._id)) continue;
        }
      }
      let mediaUrl: string | null = null;
      if (a.mediaStorageId) {
        try {
          mediaUrl = await ctx.storage.getUrl(a.mediaStorageId);
        } catch {
          mediaUrl = null;
        }
      }
      out.push({
        _id: a._id,
        title: String(a.title ?? ""),
        body: String(a.body ?? ""),
        origin: String(a.origin ?? ""),
        authorId: a.authorId,
        authorName: String(a.authorName ?? "Utilisateur"),
        authorFonction: a.authorFonction ?? null,
        authorDepartmentName: a.authorDepartmentName ?? null,
        authorRoleLabel: a.authorRoleLabel ?? null,
        priority: a.priority ?? "normal",
        pinned: !!a.pinned,
        visibility: a.visibility ?? "public",
        visibilityLabel: "Publique",
        viewerCount: null,
        mediaType: a.mediaType ?? null,
        mediaUrl,
        createdAt: a.createdAt ?? 0,
        reactionCounts: {},
        reactionTotal: 0,
        myReaction: null,
        comments: [],
        commentCount: 0,
        canDelete: a.authorId === userId || me.role === "admin" || me.role === "root",
      });
      if (out.length >= limit) break;
    }
    // Enrichir réactions + commentaires
    try {
      const reactions = await ctx.db.query("announcementReactions").collect();
      const comments = await ctx.db.query("announcementComments").collect();
      for (const item of out) {
        const rs = reactions.filter((r: any) => r.announcementId === item._id);
        const counts: Record<string, number> = {};
        let my: string | null = null;
        for (const r of rs as any[]) {
          counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
          if (r.userId === userId) my = r.emoji;
        }
        item.reactionCounts = counts;
        item.reactionTotal = rs.length;
        item.myReaction = my;
        const cs = comments
          .filter((c: any) => c.announcementId === item._id)
          .sort((x: any, y: any) => x.createdAt - y.createdAt);
        item.comments = cs.map((c: any) => ({
          _id: c._id,
          authorName: c.authorName,
          body: c.body,
          createdAt: c.createdAt,
          isMine: c.authorId === userId,
        }));
        item.commentCount = cs.length;
      }
    } catch (e) {
      console.error("[list enrich]", e);
    }
    return out;
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

    const title = args.title.trim().slice(0, 120);
    const body = args.body.trim().slice(0, 4000);
    const origin = args.origin.trim().slice(0, 80);
    if (title.length < 3) throw new Error("Titre trop court.");
    if (body.length < 2 && !args.mediaStorageId) {
      throw new Error("Ajoutez un message ou un média.");
    }
    if (origin.length < 2) {
      throw new Error("Indiquez la provenance de l'annonce.");
    }

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
      } else if (args.visibility === "custom" && viewerIds?.includes(u._id)) {
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
    const reactions = await ctx.db.query("announcementReactions").collect();
    for (const r of reactions) {
      if (r.announcementId === args.announcementId) await ctx.db.delete(r._id);
    }
    const comments = await ctx.db.query("announcementComments").collect();
    for (const c of comments) {
      if (c.announcementId === args.announcementId) await ctx.db.delete(c._id);
    }
    if ((a as any).mediaStorageId) {
      try {
        await ctx.storage.delete((a as any).mediaStorageId);
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
    if (!canView(a, me)) throw new Error("Vous n'avez pas accès à cette annonce.");

    const all = await ctx.db.query("announcementReactions").collect();
    const existing = all.find(
      (r) => r.userId === me._id && r.announcementId === args.announcementId,
    );

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
    if (!canView(a, me)) throw new Error("Vous n'avez pas accès à cette annonce.");
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
