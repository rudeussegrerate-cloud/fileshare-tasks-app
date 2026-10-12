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

/** Fil Actualités — stable, avec likes/commentaires en mémoire. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) return [];
      const me = await ctx.db.get(userId);
      if (!me) return [];

      const limit = Math.min(Math.max(args.limit ?? 40, 1), 80);

      let all: Doc<"announcements">[] = [];
      try {
        all = await ctx.db.query("announcements").collect();
      } catch (e) {
        console.error("[announcements.list] collect", e);
        return [];
      }

      all.sort((a, b) => {
        const ta = Number(a.createdAt ?? a._creationTime ?? 0);
        const tb = Number(b.createdAt ?? b._creationTime ?? 0);
        return tb - ta;
      });

      // Précharger engagements (sans index = pas d'erreur de schéma)
      let allReactions: Doc<"announcementReactions">[] = [];
      let allComments: Doc<"announcementComments">[] = [];
      try {
        allReactions = await ctx.db.query("announcementReactions").collect();
      } catch {
        allReactions = [];
      }
      try {
        allComments = await ctx.db.query("announcementComments").collect();
      } catch {
        allComments = [];
      }

      const out: Array<{
        _id: string;
        title: string;
        body: string;
        origin: string;
        authorId: string;
        authorName: string;
        authorFonction: string | null;
        authorDepartmentName: string | null;
        authorRoleLabel: string | null;
        priority: string;
        pinned: boolean;
        visibility: string;
        visibilityLabel: string;
        mediaType: string | null;
        mediaUrl: string | null;
        createdAt: number;
        reactionCounts: Record<string, number>;
        reactionTotal: number;
        myReaction: string | null;
        comments: Array<{
          _id: string;
          authorName: string;
          body: string;
          createdAt: number;
          isMine: boolean;
        }>;
        commentCount: number;
        canDelete: boolean;
      }> = [];

      for (const a of all) {
        if (out.length >= limit) break;
        try {
          const isAuthor = String(a.authorId) === String(me._id);
          const admin = isAdmin(me.role);
          const vis = a.visibility ?? "public";

          let visible = isAuthor || admin || vis === "public" || !a.visibility;
          if (!visible && vis === "private") {
            visible = Boolean(
              a.departmentId &&
                me.departmentId &&
                String(a.departmentId) === String(me.departmentId),
            );
          }
          if (!visible && vis === "custom") {
            visible = (a.viewerIds ?? []).some(
              (id) => String(id) === String(me._id),
            );
          }
          if (!visible) continue;

          let mediaUrl: string | null = null;
          if (a.mediaStorageId) {
            try {
              mediaUrl = await ctx.storage.getUrl(a.mediaStorageId);
            } catch {
              mediaUrl = null;
            }
          }

          const aid = String(a._id);
          const rs = allReactions.filter(
            (r) => String(r.announcementId) === aid,
          );
          const counts: Record<string, number> = {};
          let total = 0;
          let mine: string | null = null;
          for (const r of rs) {
            counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
            total += 1;
            if (String(r.userId) === String(userId)) mine = r.emoji;
          }

          const cs = allComments
            .filter((c) => String(c.announcementId) === aid)
            .sort(
              (x, y) => Number(x.createdAt ?? 0) - Number(y.createdAt ?? 0),
            )
            .slice(-50);

          out.push({
            _id: aid,
            title: String(a.title ?? ""),
            body: String(a.body ?? ""),
            origin: String(a.origin ?? ""),
            authorId: String(a.authorId),
            authorName: String(a.authorName ?? "Utilisateur"),
            authorFonction: a.authorFonction ?? null,
            authorDepartmentName: a.authorDepartmentName ?? null,
            authorRoleLabel: a.authorRoleLabel ?? null,
            priority: a.priority ?? "normal",
            pinned: Boolean(a.pinned),
            visibility: vis,
            visibilityLabel:
              vis === "public"
                ? "Publique"
                : vis === "private"
                  ? "Privée"
                  : "Personnalisée",
            mediaType: a.mediaType ?? null,
            mediaUrl,
            createdAt: Number(a.createdAt ?? a._creationTime ?? 0),
            reactionCounts: counts,
            reactionTotal: total,
            myReaction: mine,
            comments: cs.map((c) => ({
              _id: String(c._id),
              authorName: String(c.authorName ?? "Utilisateur"),
              body: String(c.body ?? ""),
              createdAt: Number(c.createdAt ?? 0),
              isMine: String(c.authorId) === String(userId),
            })),
            commentCount: cs.length,
            canDelete: isAuthor || admin,
          });
        } catch {
          /* ignore row */
        }
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
    if (title.length < 3) {
      throw new Error("Titre trop court (3 caractères minimum).");
    }
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

    const id = await ctx.db.insert("announcements", {
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

    try {
      const { pushNotification } = await import("./inAppNotifications");
      const authorLabel = me.name ?? "Un collègue";
      const users = await ctx.db.query("users").take(60);
      let n = 0;
      for (const u of users) {
        if (n >= 30) break;
        if (u._id === me._id) continue;
        if (
          u.accountStatus &&
          u.accountStatus !== "valide" &&
          !isAdmin(u.role)
        ) {
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
        n += 1;
      }
    } catch (e) {
      console.error("[announcements.create] notify", e);
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
