import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { pushNotification } from "./inAppNotifications";

async function requireUser(ctx: MutationCtx | { db: any; auth: any }) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Non authentifié.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Utilisateur introuvable.");
  return user as Doc<"users">;
}

function orderedPair(
  a: Id<"users">,
  b: Id<"users">,
): [Id<"users">, Id<"users">] {
  return a < b ? [a, b] : [b, a];
}

async function findConversation(
  ctx: { db: MutationCtx["db"] },
  a: Id<"users">,
  b: Id<"users">,
) {
  const [participantA, participantB] = orderedPair(a, b);
  return await ctx.db
    .query("conversations")
    .withIndex("by_pair", (q) =>
      q.eq("participantA", participantA).eq("participantB", participantB),
    )
    .first();
}

/** Liste des conversations de l'utilisateur (plus récentes d'abord). */
export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const asA = await ctx.db
      .query("conversations")
      .withIndex("by_a", (q) => q.eq("participantA", userId))
      .collect();
    const asB = await ctx.db
      .query("conversations")
      .withIndex("by_b", (q) => q.eq("participantB", userId))
      .collect();
    const all = [...asA, ...asB].sort(
      (x, y) => y.lastMessageAt - x.lastMessageAt,
    );

    const out = [];
    for (const c of all) {
      const otherId =
        c.participantA === userId ? c.participantB : c.participantA;
      const other = await ctx.db.get(otherId);
      if (!other) continue;

      // Messages non lus reçus
      const msgs = await ctx.db
        .query("chatMessages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", c._id))
        .collect();
      const unread = msgs.filter(
        (m) => m.senderId !== userId && !m.readAt,
      ).length;

      out.push({
        _id: c._id,
        otherUserId: otherId,
        otherName: other.name ?? other.email ?? "Utilisateur",
        otherEmail: other.email ?? null,
        otherOnline:
          typeof other.lastSeenAt === "number" &&
          Date.now() - other.lastSeenAt < 2 * 60 * 1000,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview ?? "",
        unread,
      });
    }
    return out;
  },
});

/** Ouvre ou crée une conversation avec un collègue. */
export const openConversation = mutation({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (args.otherUserId === me._id) {
      throw new Error("Vous ne pouvez pas discuter avec vous-même.");
    }
    const other = await ctx.db.get(args.otherUserId);
    if (!other || other.accountStatus !== "valide") {
      throw new Error("Utilisateur introuvable ou non validé.");
    }
    const existing = await findConversation(ctx, me._id, args.otherUserId);
    if (existing) return existing._id;

    const [participantA, participantB] = orderedPair(me._id, args.otherUserId);
    return await ctx.db.insert("conversations", {
      participantA,
      participantB,
      lastMessageAt: Date.now(),
      lastMessagePreview: "",
    });
  },
});

export const listMessages = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) return [];
    if (conv.participantA !== userId && conv.participantB !== userId) {
      return [];
    }
    const limit = Math.min(args.limit ?? 80, 150);
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-limit)
      .map((m) => ({
        _id: m._id,
        body: m.body,
        senderId: m.senderId,
        createdAt: m.createdAt,
        isMine: m.senderId === userId,
        readAt: m.readAt ?? null,
      }));
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation introuvable.");
    if (conv.participantA !== me._id && conv.participantB !== me._id) {
      throw new Error("Non autorisé.");
    }
    const body = args.body.trim().slice(0, 2000);
    if (!body) throw new Error("Message vide.");

    const msgId = await ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      senderId: me._id,
      body,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.conversationId, {
      lastMessageAt: Date.now(),
      lastMessagePreview: body.slice(0, 120),
      lastSenderId: me._id,
    });

    const otherId =
      conv.participantA === me._id ? conv.participantB : conv.participantA;
    await pushNotification(ctx, {
      userId: otherId,
      type: "chat.message",
      title: "Nouveau message",
      body: `${me.name ?? "Quelqu'un"} : ${body.slice(0, 80)}`,
    });

    return msgId;
  },
});

export const markRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) return null;
    if (conv.participantA !== me._id && conv.participantB !== me._id) {
      return null;
    }
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    const now = Date.now();
    for (const m of rows) {
      if (m.senderId !== me._id && !m.readAt) {
        await ctx.db.patch(m._id, { readAt: now });
      }
    }
    return null;
  },
});

export const unreadTotal = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const asA = await ctx.db
      .query("conversations")
      .withIndex("by_a", (q) => q.eq("participantA", userId))
      .collect();
    const asB = await ctx.db
      .query("conversations")
      .withIndex("by_b", (q) => q.eq("participantB", userId))
      .collect();
    let total = 0;
    for (const c of [...asA, ...asB]) {
      const msgs = await ctx.db
        .query("chatMessages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", c._id))
        .collect();
      total += msgs.filter((m) => m.senderId !== userId && !m.readAt).length;
    }
    return total;
  },
});
