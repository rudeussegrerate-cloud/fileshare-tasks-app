import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

function isAdminRole(role: Doc<"users">["role"]) {
  return role === "admin" || role === "root";
}

async function requireUser(ctx: { db: any; auth: any }) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Non authentifié.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Utilisateur introuvable.");
  return user as Doc<"users">;
}

async function canManageDepartment(
  user: Doc<"users">,
  departmentId: Id<"departments">,
) {
  if (isAdminRole(user.role)) return true;
  return (
    user.departmentRole === "chef" && user.departmentId === departmentId
  );
}

/** Liste publique des départements (inscription). */
export const listDepartmentsPublic = query({
  args: {},
  handler: async (ctx) => {
    const deps = await ctx.db.query("departments").collect();
    return deps
      .map((d) => ({ _id: d._id, name: d.name, description: d.description ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  },
});

/** Demande d'intégration (après inscription ou depuis le profil). */
export const requestJoin = mutation({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.departmentId === args.departmentId) {
      throw new Error("Vous êtes déjà dans ce département.");
    }
    if (user.departmentId) {
      throw new Error(
        "Vous appartenez déjà à un département. Contactez le DG pour un changement.",
      );
    }
    const dept = await ctx.db.get(args.departmentId);
    if (!dept) throw new Error("Département introuvable.");

    const existing = await ctx.db
      .query("departmentJoinRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const pending = existing.find(
      (r) => r.status === "pending" && r.departmentId === args.departmentId,
    );
    if (pending) return pending._id;

    // Annuler les autres demandes pending
    for (const r of existing) {
      if (r.status === "pending") {
        await ctx.db.patch(r._id, { status: "cancelled" });
      }
    }

    await ctx.db.patch(user._id, { requestedDepartmentId: args.departmentId });
    return await ctx.db.insert("departmentJoinRequests", {
      userId: user._id,
      departmentId: args.departmentId,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/** Chef / DG : liste des demandes en attente pour un département (ou tous si DG). */
export const listPendingRequests = query({
  args: { departmentId: v.optional(v.id("departments")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    let departmentIds: Id<"departments">[] = [];
    if (isAdminRole(user.role)) {
      if (args.departmentId) departmentIds = [args.departmentId];
      else {
        const all = await ctx.db.query("departments").collect();
        departmentIds = all.map((d) => d._id);
      }
    } else if (user.departmentRole === "chef" && user.departmentId) {
      departmentIds = [user.departmentId];
    } else {
      return [];
    }

    const results: Array<{
      _id: Id<"departmentJoinRequests">;
      departmentId: Id<"departments">;
      departmentName: string;
      userId: Id<"users">;
      name: string;
      email: string | null;
      fonction: string | null;
      accountStatus: string | null;
      createdAt: number;
    }> = [];

    for (const depId of departmentIds) {
      const dept = await ctx.db.get(depId);
      if (!dept) continue;
      const rows = await ctx.db
        .query("departmentJoinRequests")
        .withIndex("by_department", (q) => q.eq("departmentId", depId))
        .collect();
      for (const r of rows) {
        if (r.status !== "pending") continue;
        const u = await ctx.db.get(r.userId);
        if (!u) continue;
        results.push({
          _id: r._id,
          departmentId: depId,
          departmentName: dept.name,
          userId: u._id,
          name: u.name ?? u.email ?? "Sans nom",
          email: u.email ?? null,
          fonction: u.fonction ?? null,
          accountStatus: u.accountStatus ?? null,
          createdAt: r.createdAt,
        });
      }
    }
    return results.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Chef / DG accepte ou refuse une demande. */
export const reviewRequest = mutation({
  args: {
    requestId: v.id("departmentJoinRequests"),
    accept: v.boolean(),
  },
  handler: async (ctx, args) => {
    const reviewer = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "pending") {
      throw new Error("Demande introuvable ou déjà traitée.");
    }
    if (!(await canManageDepartment(reviewer, request.departmentId))) {
      throw new Error("Seul le chef du département ou le DG peut décider.");
    }

    const person = await ctx.db.get(request.userId);
    if (!person) throw new Error("Utilisateur introuvable.");

    await ctx.db.patch(request._id, {
      status: args.accept ? "accepted" : "rejected",
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
    });

    if (!args.accept) {
      if (person.requestedDepartmentId === request.departmentId) {
        await ctx.db.patch(person._id, { requestedDepartmentId: undefined });
      }
      return null;
    }

    // Acceptation : rattacher si le compte est validé (sinon on conserve la demande acceptée + requested)
    if (person.accountStatus === "valide") {
      if (person.departmentId && person.departmentId !== request.departmentId) {
        throw new Error("Cette personne est déjà dans un autre département.");
      }
      await ctx.db.patch(person._id, {
        departmentId: request.departmentId,
        departmentRole: "membre",
        requestedDepartmentId: undefined,
      });
    } else {
      await ctx.db.patch(person._id, {
        requestedDepartmentId: request.departmentId,
      });
    }
    return null;
  },
});

/** Chef invite un utilisateur par email. */
export const inviteByEmail = mutation({
  args: {
    departmentId: v.id("departments"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const inviter = await requireUser(ctx);
    if (!(await canManageDepartment(inviter, args.departmentId))) {
      throw new Error("Seul le chef ou le DG peut inviter.");
    }
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Adresse email invalide.");

    const dept = await ctx.db.get(args.departmentId);
    if (!dept) throw new Error("Département introuvable.");

    // Utilisateur existant ?
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();

    if (existingUser?.departmentId === args.departmentId) {
      throw new Error("Cette personne est déjà dans le département.");
    }

    const pendingSame = await ctx.db
      .query("departmentInvitations")
      .withIndex("by_email", (q) => q.eq("inviteeEmail", email))
      .collect();
    if (
      pendingSame.some(
        (i) => i.status === "pending" && i.departmentId === args.departmentId,
      )
    ) {
      throw new Error("Une invitation est déjà en attente pour cet email.");
    }

    return await ctx.db.insert("departmentInvitations", {
      departmentId: args.departmentId,
      inviteeEmail: email,
      inviteeUserId: existingUser?._id,
      invitedBy: inviter._id,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/** Invitations reçues par l'utilisateur connecté. */
export const myInvitations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user?.email) return [];
    const email = user.email.toLowerCase();
    const byEmail = await ctx.db
      .query("departmentInvitations")
      .withIndex("by_email", (q) => q.eq("inviteeEmail", email))
      .collect();
    const pending = byEmail.filter((i) => i.status === "pending");
    const out = [];
    for (const inv of pending) {
      const dept = await ctx.db.get(inv.departmentId);
      const inviter = await ctx.db.get(inv.invitedBy);
      out.push({
        _id: inv._id,
        departmentId: inv.departmentId,
        departmentName: dept?.name ?? "Département",
        invitedByName: inviter?.name ?? inviter?.email ?? "Chef",
        createdAt: inv.createdAt,
      });
    }
    return out;
  },
});

/** Accepter ou refuser une invitation. */
export const respondInvitation = mutation({
  args: {
    invitationId: v.id("departmentInvitations"),
    accept: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const inv = await ctx.db.get(args.invitationId);
    if (!inv || inv.status !== "pending") {
      throw new Error("Invitation introuvable ou déjà traitée.");
    }
    const email = (user.email ?? "").toLowerCase();
    if (inv.inviteeEmail !== email && inv.inviteeUserId !== user._id) {
      throw new Error("Cette invitation ne vous est pas destinée.");
    }

    await ctx.db.patch(inv._id, {
      status: args.accept ? "accepted" : "rejected",
      respondedAt: Date.now(),
      inviteeUserId: user._id,
    });

    if (!args.accept) return null;

    if (user.departmentId && user.departmentId !== inv.departmentId) {
      throw new Error(
        "Vous êtes déjà dans un autre département. Contactez le DG.",
      );
    }

    if (user.accountStatus !== "valide") {
      // Garde la demande : rattachement dès validation DG
      await ctx.db.patch(user._id, {
        requestedDepartmentId: inv.departmentId,
      });
      return null;
    }

    await ctx.db.patch(user._id, {
      departmentId: inv.departmentId,
      departmentRole: "membre",
      requestedDepartmentId: undefined,
    });
    return null;
  },
});

/** Invitations envoyées pour un département (chef). */
export const listSentInvitations = query({
  args: { departmentId: v.optional(v.id("departments")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    let depId = args.departmentId;
    if (!depId && user.departmentRole === "chef") {
      depId = user.departmentId;
    }
    if (!depId) return [];
    if (!(await canManageDepartment(user, depId))) return [];

    const rows = await ctx.db
      .query("departmentInvitations")
      .withIndex("by_department", (q) => q.eq("departmentId", depId!))
      .collect();
    return rows
      .filter((r) => r.status === "pending")
      .map((r) => ({
        _id: r._id,
        email: r.inviteeEmail,
        createdAt: r.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Annuler une invitation. */
export const cancelInvitation = mutation({
  args: { invitationId: v.id("departmentInvitations") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const inv = await ctx.db.get(args.invitationId);
    if (!inv || inv.status !== "pending") return null;
    if (!(await canManageDepartment(user, inv.departmentId))) {
      throw new Error("Non autorisé.");
    }
    await ctx.db.patch(inv._id, { status: "cancelled", respondedAt: Date.now() });
    return null;
  },
});
