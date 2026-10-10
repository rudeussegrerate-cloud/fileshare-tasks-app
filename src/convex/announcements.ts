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

function canView(
  a: Doc<"announcements">,
  me: Doc<"users">,
): boolean {
  if (String(a.authorId) === String(me._id)) return true;
  if (isAdmin(me.role)) return true;
  const vis = a.visibility ?? "public";
  if (vis === "public" || !vis) return true;
  if (vis === "private") {
    return Boolean(
      a.departmentId &&
        me.departmentId &&
        String(a.departmentId) === String(me.departmentId),
    );
  }
  if (vis === "custom") {
    const ids = a.viewerIds ?? [];
    return ids.some((id) => String(id) === String(me._id));
  }
  return true;
}

/**
 * Fil Actualités — ultra simple, jamais d'exception.
 */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) return [];
      const me = await ctx.db.get(userId);
      if (!me) return [];

      const limit = Math.min(Math.max(args.limit ?? 40, 1), 50);

      // Index by_created si dispo, sinon order système
      let rows: Doc<"announcements">[] = [];
      try {
        rows = await ctx.db
          .query("announcements")
          .withIndex("by_created")
          .order("desc")
          .take(limit * 3);
      } catch {
        try {
          rows = await ctx.db
            .query("announcements")
            .order("desc")
            .take(limit * 3);
        } catch {
          return [];
        }
      }

      const out = [];
      for (const a of rows) {
        try {
          if (!canView(a, me)) continue;

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
            title: a.title ?? "",
            body: a.body ?? "",
            origin: a.origin ?? "",
            authorId: a.authorId,
            authorName: a.authorName ?? "Utilisateur",
            authorFonction: a.authorFonction ?? null,
            authorDepartmentName: a.authorDepartmentName ?? null,
            authorRoleLabel: a.authorRoleLabel ?? null,
            priority: a.priority ?? "normal",
            pinned: Boolean(a.pinned),
            visibility: a.visibility ?? "public",
            visibilityLabel:
              (a.visibility ?? "public") === "public"
                ? "Publique"
                : a.visibility === "private"
                  ? "Privée"
                  : "Personnalisée",
            mediaType: a.mediaType ?? null,
            mediaUrl,
            createdAt: a.createdAt ?? a._creationTime,
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
            canDelete:
              String(a.authorId) === String(me._id) || isAdmin(me.role),
          });
          if (out.length >= limit) break;
        } catch {
          /* skip row */
        }
      }

      // Enrichir réactions/commentaires en best-effort (après les posts)
      for (const item of out) {
        try {
          const rs = await ctx.db
            .query("announcementReactions")
            .withIndex("by_announcement", (q) =>
              q.eq("announcementId", item._id as Id<"announcements">),
            )
            .collect();
          const counts: Record<string, number> = {};
          let total = 0;
          let mine: string | null = null;
          for (const r of rs) {
            counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
            total += 1;
            if (String(r.userId) === String(userId)) mine = r.emoji;
          }
          item.reactionCounts = counts;
          item.reactionTotal = total;
          item.myReaction = mine;
        } catch {
          /* keep zeros */
        }
        try {
          const cs = await ctx.db
            .query("announcementComments")
            .withIndex("by_announcement", (q) =>
              q.eq("announcementId", item._id as Id<"announcements">),
            )
            .take(30);
          item.comments = cs.map((c) => ({
            _id: c._id,
            authorName: c.authorName,
            body: c.body,
            createdAt: c.createdAt,
            isMine: String(c.authorId) === String(userId),
          }));
          item.commentCount = cs.length;
        } catch {
          /* keep empty */
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

    // Notifications limitées (max 40) — ne fait jamais échouer la publication
    try {
      const { pushNotification } = await import("./inAppNotifications");
      const authorLabel = me.name ?? "Un collègue";
      const users = await ctx.db.query("users").take(80);
      let n = 0;
      for (const u of users) {
        if (n >= 40) break;
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
    try {
      const rs = await ctx.db
        .query("announcementReactions")
        .withIndex("by_announcement", (q) =>
          q.eq("announcementId", args.announcementId),
        )
        .collect();
      for (const r of rs) await ctx.db.delete(r._id);
      const cs = await ctx.db
        .query("announcementComments")
        .withIndex("by_announcement", (q) =>
          q.eq("announcementId", args.announcementId),
        )
        .collect();
      for (const c of cs) await ctx.db.delete(c._id);
    } catch {
      /* ignore */
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
