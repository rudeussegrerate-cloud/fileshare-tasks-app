import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

const REACTIONS = ["👍", "❤️", "👏", "🎉", "😮"] as const;

function isAdmin(role: Doc<"users">["role"] | undefined) {
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
  if (isAdmin(user.role)) return true;
  if (user.accountStatus === "valide" || !user.accountStatus) return true;
  if (user.departmentRole === "chef") return true;
  return false;
}

/** Fil Actualités — version minimale anti Server Error */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) return [];
      const me = await ctx.db.get(userId);
      if (!me) return [];

      const limit = Math.min(Math.max(Number(args.limit) || 40, 1), 50);

      let rows: any[] = [];
      try {
        rows = await ctx.db.query("announcements").collect();
      } catch (e) {
        console.error("[announcements.list] no table or collect failed", e);
        return [];
      }

      // Tri simple
      rows.sort((a, b) => {
        const tb = Number(b?.createdAt ?? 0);
        const ta = Number(a?.createdAt ?? 0);
        return tb - ta;
      });

      const admin = me.role === "admin" || me.role === "root";
      const out: any[] = [];

      for (const a of rows) {
        if (out.length >= limit) break;
        if (!a || !a._id) continue;

        try {
          const authorId = a.authorId ? String(a.authorId) : "";
          const isAuthor = authorId === String(me._id);
          const vis = a.visibility ? String(a.visibility) : "public";

          let visible = admin || isAuthor || vis === "public" || !a.visibility;
          if (!visible && vis === "private") {
            visible = Boolean(
              a.departmentId &&
                me.departmentId &&
                String(a.departmentId) === String(me.departmentId),
            );
          }
          if (!visible && vis === "custom" && Array.isArray(a.viewerIds)) {
            visible = a.viewerIds.some(
              (id: unknown) => String(id) === String(me._id),
            );
          }
          if (!visible) continue;

          // Pas de getUrl / réactions ici (évite crashs storage & tables annexes)
          out.push({
            _id: a._id,
            title: a.title != null ? String(a.title) : "",
            body: a.body != null ? String(a.body) : "",
            origin: a.origin != null ? String(a.origin) : "",
            authorName:
              a.authorName != null ? String(a.authorName) : "Utilisateur",
            authorFonction: a.authorFonction != null ? String(a.authorFonction) : null,
            authorDepartmentName:
              a.authorDepartmentName != null
                ? String(a.authorDepartmentName)
                : null,
            authorRoleLabel:
              a.authorRoleLabel != null ? String(a.authorRoleLabel) : null,
            priority: a.priority != null ? String(a.priority) : "normal",
            pinned: Boolean(a.pinned),
            visibility: vis,
            mediaType: a.mediaType != null ? String(a.mediaType) : null,
            mediaUrl: null as string | null,
            createdAt: Number(a.createdAt) || 0,
            canDelete: Boolean(isAuthor || admin),
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
          });
        } catch (rowErr) {
          console.error("[announcements.list] skip row", rowErr);
        }
      }

      return out;
    } catch (e) {
      console.error("[announcements.list] fatal", e);
      return [];
    }
  },
});

/** Conservé pour compatibilité client éventuelle */
export const engagements = query({
  args: { ids: v.array(v.id("announcements")) },
  handler: async () => {
    return {};
  },
});

export const listPotentialViewers = query({
  args: {},
  handler: async (ctx) => {
    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) return [];
      const users = await ctx.db.query("users").take(200);
      return users
        .filter(
          (u) =>
            u._id !== userId &&
            (u.accountStatus === "valide" ||
              !u.accountStatus ||
              isAdmin(u.role)),
        )
        .map((u) => ({
          _id: u._id,
          name: u.name ?? u.email ?? "Utilisateur",
          fonction: u.fonction ?? null,
          departmentId: u.departmentId ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    } catch {
      return [];
    }
  },
});

export const generateMediaUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
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
      throw new Error(
        "Votre compte doit être validé pour publier une annonce.",
      );
    }
    const title = args.title.trim().slice(0, 120);
    const body = args.body.trim().slice(0, 4000);
    const origin = args.origin.trim().slice(0, 80);
    if (title.length < 3) throw new Error("Titre trop court (3 caractères minimum).");
    if (body.length < 1 && !args.mediaStorageId) {
      throw new Error("Ajoutez un texte ou un média.");
    }
    if (origin.length < 1) {
      throw new Error("Indiquez la provenance (ex. votre département).");
    }
    if (
      args.visibility === "private" &&
      !me.departmentId &&
      !isAdmin(me.role)
    ) {
      throw new Error(
        "Rejoignez un département pour publier une annonce privée.",
      );
    }
    let viewerIds: Id<"users">[] | undefined;
    if (args.visibility === "custom") {
      const set = new Set(
        (args.viewerIds ?? []).filter((id) => id !== me._id),
      );
      if (set.size === 0) {
        throw new Error("Choisissez au moins un destinataire.");
      }
      viewerIds = [...set];
    }
    let departmentName: string | undefined;
    if (me.departmentId) {
      const dep = await ctx.db.get(me.departmentId);
      departmentName = dep?.name;
    }
    const canPin = isAdmin(me.role) || me.departmentRole === "chef";
    return await ctx.db.insert("announcements", {
      authorId: me._id,
      title,
      body: body || "(Média)",
      origin,
      authorName: me.name ?? me.email ?? "Utilisateur",
      authorFonction: me.fonction,
      authorDepartmentName: departmentName,
      authorRoleLabel: roleLabel(me),
      priority: args.priority ?? "normal",
      pinned: canPin && Boolean(args.pinned),
      visibility: args.visibility,
      departmentId:
        args.visibility === "private" ? me.departmentId : undefined,
      viewerIds,
      mediaStorageId: args.mediaStorageId,
      mediaType: args.mediaType,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const a = await ctx.db.get(args.announcementId);
    if (!a) throw new Error("Annonce introuvable.");
    if (a.authorId !== me._id && !isAdmin(me.role)) {
      throw new Error("Suppression non autorisée.");
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
    const all = await ctx.db.query("announcementReactions").collect();
    const existing = all.find(
      (r) =>
        String(r.userId) === String(me._id) &&
        String(r.announcementId) === String(args.announcementId),
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
    const body = args.body.trim().slice(0, 1000);
    if (!body) throw new Error("Commentaire vide.");
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
