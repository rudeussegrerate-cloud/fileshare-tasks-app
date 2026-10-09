import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { pushNotification } from "./inAppNotifications";

function isAdminRole(role: Doc<"users">["role"]) {
  return role === "admin" || role === "root";
}

async function requireUser(ctx: {
  // QueryCtx ou MutationCtx
  db: { get: (id: Id<"users">) => Promise<Doc<"users"> | null> };
  auth: MutationCtx["auth"];
}) {
  const userId = await getAuthUserId(ctx as MutationCtx);
  if (!userId) throw new Error("Non authentifié.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Utilisateur introuvable.");
  return user as Doc<"users">;
}

/** Chef du département ou DG/root */
function canValidateMembership(
  user: Doc<"users">,
  departmentId: Id<"departments">,
) {
  if (isAdminRole(user.role)) return true;
  return (
    user.departmentRole === "chef" && user.departmentId === departmentId
  );
}

/** Chef du département (ou DG) uniquement — peut inviter dans SON département */
function canInviteToDepartment(
  user: Doc<"users">,
  departmentId: Id<"departments">,
) {
  if (isAdminRole(user.role)) return true;
  return (
    user.departmentRole === "chef" && user.departmentId === departmentId
  );
}

async function notifyDepartmentChefs(
  ctx: MutationCtx,
  departmentId: Id<"departments">,
  title: string,
  body: string,
) {
  const members = await ctx.db
    .query("users")
    .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
    .collect();
  const chefs = members.filter((m) => m.departmentRole === "chef");
  // Si aucun chef nommé, notifier les DG
  if (chefs.length === 0) {
    const all = await ctx.db.query("users").collect();
    for (const u of all) {
      if (isAdminRole(u.role) && u.accountStatus === "valide") {
        await pushNotification(ctx, {
          userId: u._id,
          type: "department.join_request",
          title,
          body,
        });
      }
    }
    return;
  }
  for (const chef of chefs) {
    await pushNotification(ctx, {
      userId: chef._id,
      type: "department.join_request",
      title,
      body,
    });
  }
}

/** Liste publique des départements (inscription). */
export const listDepartmentsPublic = query({
  args: {},
  handler: async (ctx) => {
    const deps = await ctx.db.query("departments").collect();
    const out = [];
    for (const d of deps) {
      const members = await ctx.db
        .query("users")
        .withIndex("by_department", (q) => q.eq("departmentId", d._id))
        .collect();
      out.push({
        _id: d._id,
        name: d.name,
        description: d.description ?? null,
        memberCount: members.length,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  },
});

/** Demandes d'adhésion en cours de l'utilisateur connecté */
export const myJoinRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("departmentJoinRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const out = [];
    for (const r of rows) {
      if (r.status !== "pending") continue;
      const dept = await ctx.db.get(r.departmentId);
      out.push({
        _id: r._id,
        departmentId: r.departmentId,
        departmentName: dept?.name ?? "Département",
        createdAt: r.createdAt,
      });
    }
    return out;
  },
});

/** Annuler sa propre demande d'adhésion en attente */
export const cancelMyJoinRequest = mutation({
  args: { requestId: v.id("departmentJoinRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const req = await ctx.db.get(args.requestId);
    if (!req || req.userId !== user._id) {
      throw new Error("Demande introuvable.");
    }
    if (req.status !== "pending") return null;
    await ctx.db.patch(req._id, { status: "cancelled" });
    if (user.requestedDepartmentId === req.departmentId) {
      await ctx.db.patch(user._id, { requestedDepartmentId: undefined });
    }
    return null;
  },
});

/**
 * Demande d'intégration (inscription ou profil).
 * Notifie automatiquement le(s) chef(s) du département.
 */
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

    for (const r of existing) {
      if (r.status === "pending") {
        await ctx.db.patch(r._id, { status: "cancelled" });
      }
    }

    await ctx.db.patch(user._id, { requestedDepartmentId: args.departmentId });
    const requestId = await ctx.db.insert("departmentJoinRequests", {
      userId: user._id,
      departmentId: args.departmentId,
      status: "pending",
      createdAt: Date.now(),
    });

    const who = user.name ?? user.email ?? "Un utilisateur";
    await notifyDepartmentChefs(
      ctx,
      args.departmentId,
      "Demande d'adhésion",
      `${who} souhaite rejoindre le département « ${dept.name} ». Validez ou refusez dans Départements.`,
    );

    return requestId;
  },
});

/** Chef / DG : demandes en attente */
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

/** Chef / DG accepte ou refuse une demande d'adhésion. */
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
    if (!canValidateMembership(reviewer, request.departmentId)) {
      throw new Error("Seul le chef du département ou le DG peut valider l'adhésion.");
    }

    const person = await ctx.db.get(request.userId);
    if (!person) throw new Error("Utilisateur introuvable.");
    const dept = await ctx.db.get(request.departmentId);

    await ctx.db.patch(request._id, {
      status: args.accept ? "accepted" : "rejected",
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
    });

    if (!args.accept) {
      if (person.requestedDepartmentId === request.departmentId) {
        await ctx.db.patch(person._id, { requestedDepartmentId: undefined });
      }
      await pushNotification(ctx, {
        userId: person._id,
        type: "department.join_rejected",
        title: "Demande refusée",
        body: `Votre demande pour rejoindre « ${dept?.name ?? "le département"} » a été refusée.`,
      });
      return null;
    }

    if (person.accountStatus === "valide") {
      if (person.departmentId && person.departmentId !== request.departmentId) {
        throw new Error("Cette personne est déjà dans un autre département.");
      }
      await ctx.db.patch(person._id, {
        departmentId: request.departmentId,
        departmentRole: "membre",
        requestedDepartmentId: undefined,
      });
      await pushNotification(ctx, {
        userId: person._id,
        type: "department.join_accepted",
        title: "Adhésion acceptée",
        body: `Vous avez rejoint le département « ${dept?.name ?? ""} ».`,
      });
    } else {
      await ctx.db.patch(person._id, {
        requestedDepartmentId: request.departmentId,
      });
      await pushNotification(ctx, {
        userId: person._id,
        type: "department.join_accepted",
        title: "Adhésion pré-acceptée",
        body: `Le chef a accepté votre demande pour « ${dept?.name ?? ""} ». L'accès complet suivra la validation du compte par le DG.`,
      });
    }
    return null;
  },
});

/**
 * Seul le chef du département (ou le DG) peut inviter quelqu'un
 * dans ce département.
 */
export const inviteByEmail = mutation({
  args: {
    departmentId: v.id("departments"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const inviter = await requireUser(ctx);
    if (!canInviteToDepartment(inviter, args.departmentId)) {
      throw new Error(
        "Seul le chef de ce département (ou le DG) peut envoyer une invitation.",
      );
    }
    if (inviter.accountStatus !== "valide" && !isAdminRole(inviter.role)) {
      throw new Error("Votre compte doit être validé pour inviter.");
    }

    const email = args.email.trim().toLowerCase();
    if (!email.includes("@") || email.length < 5) {
      throw new Error("Adresse email invalide.");
    }

    const dept = await ctx.db.get(args.departmentId);
    if (!dept) throw new Error("Département introuvable.");

    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();

    // Uniquement comptes existants + validés par le DG
    if (!existingUser) {
      throw new Error(
        "Aucun compte ScanDoc pour cet email. La personne doit d'abord s'inscrire et être validée par le DG.",
      );
    }
    if (existingUser.accountStatus !== "valide") {
      throw new Error(
        "Ce compte n'est pas encore validé par le DG. Impossible de l'inviter.",
      );
    }
    if (existingUser.departmentId === args.departmentId) {
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

    const invitationId = await ctx.db.insert("departmentInvitations", {
      departmentId: args.departmentId,
      inviteeEmail: email,
      inviteeUserId: existingUser._id,
      invitedBy: inviter._id,
      status: "pending",
      createdAt: Date.now(),
    });

    const inviterName = inviter.name ?? inviter.email ?? "Un collègue";
    await pushNotification(ctx, {
      userId: existingUser._id,
      type: "department.invitation",
      title: "Invitation à un département",
      body: `${inviterName} vous invite à rejoindre « ${dept.name} ». Répondez depuis votre espace.`,
    });

    return invitationId;
  },
});

/** Comptes validés invitables (pas déjà dans ce département) */
export const listInvitableUsers = query({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, args) => {
    const inviter = await requireUser(ctx);
    if (!canInviteToDepartment(inviter, args.departmentId)) return [];
    const users = await ctx.db.query("users").collect();
    return users
      .filter(
        (u) =>
          u.accountStatus === "valide" &&
          u.departmentId !== args.departmentId &&
          u._id !== inviter._id &&
          Boolean(u.email),
      )
      .map((u) => ({
        _id: u._id,
        name: u.name?.trim() || u.email || "Utilisateur",
        email: u.email as string,
        fonction: u.fonction ?? null,
        departmentId: u.departmentId ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

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
        invitedByName: inviter?.name ?? inviter?.email ?? "Collègue",
        createdAt: inv.createdAt,
      });
    }
    return out;
  },
});

/**
 * L'invité accepte → crée une demande d'adhésion pour le chef (pas d'entrée directe).
 */
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

    // Déjà membre
    if (user.departmentId === inv.departmentId) return null;

    const dept = await ctx.db.get(inv.departmentId);

    // Créer (ou réutiliser) une demande pending pour le chef
    const existing = await ctx.db
      .query("departmentJoinRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const alreadyPending = existing.find(
      (r) => r.status === "pending" && r.departmentId === inv.departmentId,
    );
    if (!alreadyPending) {
      for (const r of existing) {
        if (r.status === "pending") {
          await ctx.db.patch(r._id, { status: "cancelled" });
        }
      }
      await ctx.db.insert("departmentJoinRequests", {
        userId: user._id,
        departmentId: inv.departmentId,
        status: "pending",
        createdAt: Date.now(),
      });
    }

    await ctx.db.patch(user._id, {
      requestedDepartmentId: inv.departmentId,
    });

    const who = user.name ?? user.email ?? "Un utilisateur";
    await notifyDepartmentChefs(
      ctx,
      inv.departmentId,
      "Demande d'adhésion (invitation)",
      `${who} a accepté une invitation pour « ${dept?.name ?? "le département"} ». Validez ou refusez l'adhésion.`,
    );

    return null;
  },
});

/** Invitations en cours du département (membres voient les leurs ; chef voit tout). */
export const listSentInvitations = query({
  args: { departmentId: v.optional(v.id("departments")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    let depId = args.departmentId ?? user.departmentId;
    if (!depId) return [];
    if (!canInviteToDepartment(user, depId)) return [];

    const rows = await ctx.db
      .query("departmentInvitations")
      .withIndex("by_department", (q) => q.eq("departmentId", depId!))
      .collect();

    const isChef = canValidateMembership(user, depId);
    return rows
      .filter((r) => r.status === "pending")
      .filter((r) => isChef || r.invitedBy === user._id)
      .map((r) => ({
        _id: r._id,
        email: r.inviteeEmail,
        createdAt: r.createdAt,
        invitedByMe: r.invitedBy === user._id,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const cancelInvitation = mutation({
  args: { invitationId: v.id("departmentInvitations") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const inv = await ctx.db.get(args.invitationId);
    if (!inv || inv.status !== "pending") return null;
    const allowed =
      inv.invitedBy === user._id ||
      canValidateMembership(user, inv.departmentId);
    if (!allowed) throw new Error("Non autorisé.");
    await ctx.db.patch(inv._id, {
      status: "cancelled",
      respondedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Fil d'activité du département (style Facebook adapté au travail).
 */
export const departmentActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const me = await ctx.db.get(userId);
    if (!me || me.accountStatus !== "valide") return [];

    const limit = Math.min(args.limit ?? 20, 40);
    const docs = await ctx.db.query("documents").order("desc").take(80);
    const events: Array<{
      id: string;
      kind: "document";
      title: string;
      body: string;
      createdAt: number;
      documentId?: Id<"documents">;
    }> = [];

    for (const d of docs) {
      // Visibles si expéditeur/destinataire dans mon département, ou moi, ou admin
      const sender = await ctx.db.get(d.senderId);
      const recipient = await ctx.db.get(d.recipientId);
      const sameDept =
        me.departmentId &&
        (sender?.departmentId === me.departmentId ||
          recipient?.departmentId === me.departmentId);
      const involved =
        d.senderId === userId || d.recipientId === userId || isAdminRole(me.role);
      if (!sameDept && !involved) continue;

      events.push({
        id: `doc-${d._id}`,
        kind: "document",
        title: d.objet || d.fileName,
        body: `${d.senderName} → ${recipient?.name ?? "destinataire"} · ${
          Array.isArray(d.tasks) ? d.tasks.slice(0, 2).join(", ") : d.task ?? ""
        }`,
        createdAt: d._creationTime,
        documentId: d._id,
      });
      if (events.length >= limit) break;
    }

    return events;
  },
});
