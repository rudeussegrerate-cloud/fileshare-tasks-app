import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const MOODS = ["joyeux", "calme", "motivant", "sérieux", "blagueur"] as const;
const COLORS = ["navy", "teal", "amber", "rose", "violet"] as const;

export const getMyBot = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db
      .query("botProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (profile) {
      const avatarUrl = profile.avatarStorageId
        ? await ctx.storage.getUrl(profile.avatarStorageId)
        : null;
      return { ...profile, avatarUrl };
    }
    return {
      _id: null as null,
      userId,
      name: "Aide",
      mood: "calme",
      personality: "Patient, clair, encourageant. Explique les étapes une par une.",
      color: "navy",
      gender: "neutral" as const,
      avatarUrl: null as string | null,
      createdAt: 0,
      updatedAt: 0,
      isDefault: true as const,
    };
  },
});

export const saveMyBot = mutation({
  args: {
    name: v.string(),
    mood: v.string(),
    personality: v.string(),
    color: v.string(),
    gender: v.optional(
      v.union(v.literal("male"), v.literal("female"), v.literal("neutral")),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const name = args.name.trim().slice(0, 24) || "Aide";
    const mood = (MOODS as readonly string[]).includes(args.mood)
      ? args.mood
      : "calme";
    const color = (COLORS as readonly string[]).includes(args.color)
      ? args.color
      : "navy";
    const personality = args.personality.trim().slice(0, 300) ||
      "Patient et clair.";
    const gender = args.gender ?? "neutral";

    const existing = await ctx.db
      .query("botProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        mood,
        personality,
        color,
        gender,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("botProfiles", {
      userId,
      name,
      mood,
      personality,
      color,
      gender,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listMessages = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const limit = Math.min(args.limit ?? 40, 80);
    const rows = await ctx.db
      .query("botMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-limit)
      .map((m) => ({
        _id: m._id,
        role: m.role,
        body: m.body,
        createdAt: m.createdAt,
      }));
  },
});

export const clearHistory = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const rows = await ctx.db
      .query("botMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return null;
  },
});


export const getProfileInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("botProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const listRecentInternal = internalQuery({
  args: { userId: v.id("users"), limit: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("botMessages")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-args.limit);
  },
});

export const saveExchange = internalMutation({
  args: {
    userId: v.id("users"),
    userBody: v.string(),
    assistantBody: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("botMessages", {
      userId: args.userId,
      role: "user",
      body: args.userBody,
      createdAt: now,
    });
    await ctx.db.insert("botMessages", {
      userId: args.userId,
      role: "assistant",
      body: args.assistantBody,
      createdAt: now + 1,
    });
    return null;
  },
});


export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    return await ctx.storage.generateUploadUrl();
  },
});

export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const existing = await ctx.db
      .query("botProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();
    if (existing) {
      if (existing.avatarStorageId) {
        try {
          await ctx.storage.delete(existing.avatarStorageId);
        } catch {
          /* ignore */
        }
      }
      await ctx.db.patch(existing._id, {
        avatarStorageId: args.storageId,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("botProfiles", {
      userId,
      name: "Aide",
      mood: "calme",
      personality: "Patient et clair.",
      color: "navy",
      avatarStorageId: args.storageId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const clearAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const existing = await ctx.db
      .query("botProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!existing?.avatarStorageId) return null;
    try {
      await ctx.storage.delete(existing.avatarStorageId);
    } catch {
      /* ignore */
    }
    await ctx.db.patch(existing._id, {
      avatarStorageId: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/* ——— Mode apprentissage / automatisations ——— */

export const listMySkills = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("botSkills")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const saveSkill = mutation({
  args: {
    skillId: v.optional(v.id("botSkills")),
    name: v.string(),
    trigger: v.string(),
    instruction: v.string(),
    action: v.optional(
      v.union(
        v.literal("reply"),
        v.literal("open_inbox"),
        v.literal("open_send"),
        v.literal("open_messages"),
        v.literal("open_actualites"),
        v.literal("open_departments"),
        v.literal("remind_tasks"),
      ),
    ),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const name = args.name.trim().slice(0, 60);
    const trigger = args.trigger.trim().toLowerCase().slice(0, 120);
    const instruction = args.instruction.trim().slice(0, 800);
    if (name.length < 2) throw new Error("Nom trop court.");
    if (trigger.length < 2) throw new Error("Déclencheur trop court.");
    if (instruction.length < 2) throw new Error("Instruction trop courte.");
    const now = Date.now();
    if (args.skillId) {
      const existing = await ctx.db.get(args.skillId);
      if (!existing || existing.userId !== userId) {
        throw new Error("Tâche introuvable.");
      }
      await ctx.db.patch(args.skillId, {
        name,
        trigger,
        instruction,
        action: args.action ?? existing.action ?? "reply",
        enabled: args.enabled ?? existing.enabled,
        updatedAt: now,
      });
      return args.skillId;
    }
    return await ctx.db.insert("botSkills", {
      userId,
      name,
      trigger,
      instruction,
      action: args.action ?? "reply",
      enabled: args.enabled ?? true,
      useCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteSkill = mutation({
  args: { skillId: v.id("botSkills") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const existing = await ctx.db.get(args.skillId);
    if (!existing || existing.userId !== userId) {
      throw new Error("Tâche introuvable.");
    }
    await ctx.db.delete(args.skillId);
    return null;
  },
});

export const matchSkill = internalQuery({
  args: { userId: v.id("users"), message: v.string() },
  handler: async (ctx, args) => {
    const msg = args.message.trim().toLowerCase();
    if (msg.length < 2) return null;
    const skills = await ctx.db
      .query("botSkills")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const enabled = skills.filter((s) => s.enabled);
    // Match si le déclencheur est contenu dans le message (ou inversement)
    let best: (typeof enabled)[0] | null = null;
    let bestScore = 0;
    for (const s of enabled) {
      const t = s.trigger.toLowerCase();
      if (!t) continue;
      if (msg.includes(t) || t.includes(msg)) {
        const score = t.length;
        if (score > bestScore) {
          best = s;
          bestScore = score;
        }
      }
    }
    return best;
  },
});

export const bumpSkillUse = internalMutation({
  args: { skillId: v.id("botSkills") },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.skillId);
    if (!s) return null;
    await ctx.db.patch(args.skillId, {
      useCount: (s.useCount ?? 0) + 1,
      updatedAt: Date.now(),
    });
    return null;
  },
});


export const saveSkillInternal = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    trigger: v.string(),
    instruction: v.string(),
    action: v.optional(
      v.union(
        v.literal("reply"),
        v.literal("open_inbox"),
        v.literal("open_send"),
        v.literal("open_messages"),
        v.literal("open_actualites"),
        v.literal("open_departments"),
        v.literal("remind_tasks"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const trigger = args.trigger.trim().toLowerCase().slice(0, 120);
    const existing = await ctx.db
      .query("botSkills")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const same = existing.find((s) => s.trigger === trigger);
    if (same) {
      await ctx.db.patch(same._id, {
        name: args.name.slice(0, 60),
        instruction: args.instruction.slice(0, 800),
        action: args.action ?? "reply",
        enabled: true,
        updatedAt: now,
      });
      return same._id;
    }
    return await ctx.db.insert("botSkills", {
      userId: args.userId,
      name: args.name.slice(0, 60),
      trigger,
      instruction: args.instruction.slice(0, 800),
      action: args.action ?? "reply",
      enabled: true,
      useCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});
