import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

type DepartmentRole = "chef" | "membre";

function displayName(user: Doc<"users">) {
  return user.name?.trim() || user.email || "Utilisateur";
}

/** The DG (`admin`) and the super utilisateur (`root`) share the DG powers. */
function isAdminRole(role: Doc<"users">["role"]) {
  return role === "admin" || role === "root";
}

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Vous devez être connecté.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Compte introuvable.");
  return user;
}

async function requireAdmin(ctx: MutationCtx) {
  const user = await requireUser(ctx);
  if (!isAdminRole(user.role)) {
    throw new Error("Seul le DG peut faire cela.");
  }
  return user;
}

async function requireRoot(ctx: MutationCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "root") {
    throw new Error("Seul le super utilisateur peut gérer les comptes de DG.");
  }
  return user;
}

/** Admin, super utilisateur, or the chef of the given department. */
async function requireManager(
  ctx: MutationCtx,
  departmentId: Id<"departments">,
) {
  const user = await requireUser(ctx);
  const isChef =
    user.departmentRole === "chef" && user.departmentId === departmentId;
  if (!isAdminRole(user.role) && !isChef) {
    throw new Error("Seul le DG ou le chef du département peut faire cela.");
  }
  return { user, isAdmin: isAdminRole(user.role) };
}

/**
 * Places an approved account into a department. A person who already belongs to
 * a department must be removed from it ("renvoyé") before joining another one.
 */
async function assignPerson(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    departmentId: Id<"departments">;
    departmentRole: DepartmentRole;
  },
) {
  const person = await ctx.db.get(args.userId);
  if (!person) throw new Error("Ce compte n'existe pas.");
  if (person.accountStatus !== "valide") {
    throw new Error(
      "Ce compte n'a pas encore été validé par le DG. Seuls les comptes validés peuvent être affectés à un département.",
    );
  }
  if (!person.profileCompletedAt) {
    throw new Error("Cette personne doit d'abord compléter ses informations.");
  }
  if (person.departmentId && person.departmentId !== args.departmentId) {
    throw new Error(
      "Cette personne est déjà affectée à un département. Renvoyez-la de son département avant de l'affecter ailleurs.",
    );
  }

  await ctx.db.patch(args.userId, {
    departmentId: args.departmentId,
    departmentRole: args.departmentRole,
  });
  return person;
}

/**
 * Read-only snapshot of the signed-in person: profile, role, department and
 * the colleagues they can send documents to.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const department = user.departmentId
      ? await ctx.db.get(user.departmentId)
      : null;

    const colleagues = user.departmentId
      ? await ctx.db
          .query("users")
          .withIndex("by_department", (q) =>
            q.eq("departmentId", user.departmentId!),
          )
          .collect()
      : [];

    const admin = isAdminRole(user.role);

    return {
      user: {
        _id: user._id,
        name: displayName(user),
        email: user.email ?? null,
        fonction: user.fonction ?? null,
        phone: user.phone ?? null,
        role: user.role ?? "user",
        departmentRole: user.departmentRole ?? null,
        departmentId: user.departmentId ?? null,
      },
      accountStatus: user.accountStatus ?? null,
      profileCompleted: Boolean(user.profileCompletedAt),
      isRoot: user.role === "root",
      isAdmin: admin,
      isChef: user.departmentRole === "chef",
      pendingAccounts: admin
        ? (
            await ctx.db
              .query("users")
              .filter((q) => q.eq(q.field("accountStatus"), "en_attente"))
              .collect()
          ).length
        : 0,
      department: department
        ? {
            _id: department._id,
            name: department.name,
            description: department.description ?? null,
          }
        : null,
      colleagues: colleagues
        .map((c) => ({
          _id: c._id,
          name: displayName(c),
          email: c.email ?? null,
          fonction: c.fonction ?? null,
          departmentRole: c.departmentRole ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

/**
 * Runs once when the workspace loads: the very first account becomes the super
 * utilisateur (root) and is approved automatically. Every following account is
 * a simple user waiting for the DG's approval.
 */
export const syncProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const patch: Partial<Doc<"users">> = {};

    if (!user.createdAt) patch.createdAt = Date.now();

    // Bootstrap: while no super utilisateur exists, the first account with a
    // real identity (an email and a name) claims that role. This also repairs
    // deployments where accounts were created before the role existed, and it
    // deliberately ignores anonymous accounts.
    if (user.role !== "root") {
      const anyRoot = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("role"), "root"))
        .first();
      const hasIdentity = Boolean(
        user.email && (user.profileCompletedAt || user.name),
      );

      if (!anyRoot && hasIdentity) {
        patch.role = "root";
        patch.accountStatus = "valide";
      } else if (!user.role) {
        patch.role = "user";
      }
    }

    // Validation DG : les nouveaux comptes restent « en_attente » jusqu'à
    // approbation. Root / DG sont validés automatiquement.
    if (!user.accountStatus && !patch.accountStatus) {
      const elevated = isAdminRole(patch.role ?? user.role);
      patch.accountStatus = elevated ? "valide" : "en_attente";
    }

    // The sign-up form already collects the person's details.
    if (!user.profileCompletedAt && user.name) {
      patch.profileCompletedAt = Date.now();
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(userId, patch);
    }
    return null;
  },
});

/** Each person fills in their own details before joining a department. */
export const completeProfile = mutation({
  args: {
    name: v.string(),
    fonction: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (name.length < 3) {
      throw new Error("Indiquez votre nom complet.");
    }

    await ctx.db.patch(user._id, {
      name,
      fonction: args.fonction?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      profileCompletedAt: user.profileCompletedAt ?? Date.now(),
    });
    return null;
  },
});

/**
 * Accounts the caller is allowed to place in a department: approved people who
 * are either unassigned or already in the target department (so an existing
 * member can be promoted to chef).
 */
export const listAssignablePeople = query({
  args: { departmentId: v.optional(v.id("departments")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const canManage =
      isAdminRole(user.role) ||
      (user.departmentRole === "chef" && user.departmentId === args.departmentId);
    if (!canManage) return [];

    const users = await ctx.db.query("users").collect();
    return users
      // Only accounts the DG has approved can be placed in a department.
      .filter((candidate) => candidate.accountStatus === "valide")
      .filter((candidate) => Boolean(candidate.profileCompletedAt))
      // A person already in another department is filtered out here; the
      // mutation refuses them too, so the rule holds even outside the UI.
      .filter(
        (candidate) =>
          !candidate.departmentId ||
          candidate.departmentId === args.departmentId,
      )
      .map((candidate) => ({
        _id: candidate._id,
        name: displayName(candidate),
        email: candidate.email ?? null,
        fonction: candidate.fonction ?? null,
        departmentRole: candidate.departmentRole ?? null,
        isCurrentMember: candidate.departmentId === args.departmentId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Every department with its chief and members. Used both by the recipient
 * picker (department first, then member) and by the management screens.
 */
export const listDepartments = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const departments = await ctx.db.query("departments").collect();
    const users = await ctx.db.query("users").collect();

    const result = [];
    for (const department of departments) {
      const members = users
        .filter(
          (u) =>
            u.departmentId === department._id &&
            (u.accountStatus === "valide" || !u.accountStatus),
        )
        .map((u) => ({
          _id: u._id,
          name: displayName(u),
          email: u.email ?? null,
          fonction: u.fonction ?? null,
          departmentRole: u.departmentRole ?? "membre",
          accountStatus: (u.accountStatus as string) ?? "en_attente",
          lastSeenAt: u.lastSeenAt ?? null,
        }))
        .sort((a, b) => {
          if (a.departmentRole !== b.departmentRole) {
            return a.departmentRole === "chef" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

      const children = departments.filter(
        (d) => d.parentId === department._id,
      );

      const parent = department.parentId
        ? departments.find((d) => d._id === department.parentId)
        : null;

      let logoUrl: string | null = null;
      if (department.logoStorageId) {
        try {
          logoUrl = await ctx.storage.getUrl(department.logoStorageId);
        } catch {
          logoUrl = null;
        }
      }

      result.push({
        _id: department._id,
        name: department.name,
        description: department.description ?? null,
        createdAt: department.createdAt,
        parentId: department.parentId ?? null,
        parentName: parent?.name ?? null,
        isSubDepartment: Boolean(department.parentId),
        childCount: children.length,
        chief: members.find((m) => m.departmentRole === "chef") ?? null,
        members,
        logoUrl,
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * The DG creates a department. Its chef is chosen among existing approved
 * accounts (the selection is optional and can be made later).
 */
export const createDepartment = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    chiefId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Le nom du département est obligatoire.");

    const departmentId = await ctx.db.insert("departments", {
      name,
      description: args.description?.trim() || undefined,
      createdBy: admin._id,
      createdAt: Date.now(),
    });

    if (args.chiefId) {
      await assignPerson(ctx, {
        userId: args.chiefId,
        departmentId,
        departmentRole: "chef",
      });
    }

    return departmentId;
  },
});

/**
 * Sous-département : le chef du département parent (ou le DG) peut en créer un.
 */
export const createSubDepartment = mutation({
  args: {
    parentId: v.id("departments"),
    name: v.string(),
    description: v.optional(v.string()),
    chiefId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const parent = await ctx.db.get(args.parentId);
    if (!parent) throw new Error("Département parent introuvable.");

    const isParentChef =
      user.departmentId === args.parentId && user.departmentRole === "chef";
    if (!isAdminRole(user.role) && !isParentChef) {
      throw new Error(
        "Seul le chef de ce département (ou le DG) peut créer un sous-département.",
      );
    }

    const name = args.name.trim();
    if (!name) throw new Error("Le nom du sous-département est obligatoire.");

    const departmentId = await ctx.db.insert("departments", {
      name,
      description: args.description?.trim() || undefined,
      createdBy: user._id,
      createdAt: Date.now(),
      parentId: args.parentId,
    });

    if (args.chiefId) {
      await assignPerson(ctx, {
        userId: args.chiefId,
        departmentId,
        departmentRole: "chef",
      });
    }

    return departmentId;
  },
});

/** The DG appoints (or replaces) the chef from existing approved accounts. */
export const addChief = mutation({
  args: {
    departmentId: v.id("departments"),
    chiefId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    // Demote the previous chef of that department back to member.
    const members = await ctx.db
      .query("users")
      .withIndex("by_department", (q) =>
        q.eq("departmentId", args.departmentId),
      )
      .collect();
    for (const member of members) {
      if (member.departmentRole === "chef") {
        await ctx.db.patch(member._id, { departmentRole: "membre" });
      }
    }

    await assignPerson(ctx, {
      userId: args.chiefId,
      departmentId: args.departmentId,
      departmentRole: "chef",
    });
    return null;
  },
});

/** The DG or the department chef adds an approved account as a member. */
export const addMember = mutation({
  args: {
    departmentId: v.id("departments"),
    memberId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireManager(ctx, args.departmentId);

    const person = await ctx.db.get(args.memberId);
    if (
      person?.departmentRole === "chef" &&
      person.departmentId !== args.departmentId
    ) {
      throw new Error("Cette personne est déjà chef d'un autre département.");
    }

    await assignPerson(ctx, {
      userId: args.memberId,
      departmentId: args.departmentId,
      departmentRole: "membre",
    });
    return null;
  },
});

/** Remove someone from their department (DG, or the chef of that department). */
export const removeMember = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Membre introuvable.");
    if (!target.departmentId) return null;

    const isAdmin = isAdminRole(caller.role);
    const isOwnChef =
      caller.departmentRole === "chef" &&
      caller.departmentId === target.departmentId;
    if (!isAdmin && !isOwnChef) {
      throw new Error("Vous n'avez pas la permission de retirer ce membre.");
    }
    if (!isAdmin && target.departmentRole === "chef") {
      throw new Error("Un chef ne peut pas retirer un autre chef.");
    }

    await ctx.db.patch(args.userId, {
      departmentId: undefined,
      departmentRole: undefined,
    });
    return null;
  },
});

/** The DG deletes a department; its members simply become unassigned. */
export const deleteDepartment = mutation({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const members = await ctx.db
      .query("users")
      .withIndex("by_department", (q) =>
        q.eq("departmentId", args.departmentId),
      )
      .collect();
    for (const member of members) {
      await ctx.db.patch(member._id, {
        departmentId: undefined,
        departmentRole: undefined,
      });
    }

    await ctx.db.delete(args.departmentId);
    return null;
  },
});

/**
 * Every account with its approval status and role, pending ones first.
 * Available to the DG and to the super utilisateur.
 */
export const listAccounts = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    if (!isAdminRole(viewer.role)) {
      throw new Error("Seul le DG peut consulter les comptes.");
    }

    const users = await ctx.db.query("users").collect();
    const departments = await ctx.db.query("departments").collect();
    const departmentNames = new Map(departments.map((d) => [d._id, d.name]));

    const rank: Record<string, number> = {
      en_attente: 0,
      valide: 1,
      rejete: 2,
    };

    return users
      .filter((candidate) => candidate._id !== viewer._id)
      .map((candidate) => {
        const accountStatus = candidate.accountStatus ?? "en_attente";
        return {
          _id: candidate._id,
          name: displayName(candidate),
          email: candidate.email ?? null,
          fonction: candidate.fonction ?? null,
          phone: candidate.phone ?? null,
          role: candidate.role ?? "user",
          accountStatus,
          departmentName: candidate.departmentId
            ? (departmentNames.get(candidate.departmentId) ?? null)
            : null,
          createdAt: candidate.createdAt ?? candidate._creationTime,
        };
      })
      .sort((a, b) => {
        if (a.accountStatus !== b.accountStatus) {
          return (rank[a.accountStatus] ?? 9) - (rank[b.accountStatus] ?? 9);
        }
        return b.createdAt - a.createdAt;
      });
  },
});

async function reviewAccount(
  ctx: MutationCtx,
  reviewer: Doc<"users">,
  userId: Id<"users">,
  status: "valide" | "rejete",
) {
  if (userId === reviewer._id) {
    throw new Error("Vous ne pouvez pas modifier votre propre compte.");
  }

  const target = await ctx.db.get(userId);
  if (!target) throw new Error("Compte introuvable.");
  if (isAdminRole(target.role)) {
    throw new Error(
      "Le compte d'un DG ne peut pas être validé ou rejeté directement.",
    );
  }

  const patch: Record<string, unknown> = {
    accountStatus: status,
    reviewedBy: reviewer._id,
    reviewedAt: Date.now(),
  };
  if (status === "rejete") {
    patch.departmentId = undefined;
    patch.departmentRole = undefined;
    patch.requestedDepartmentId = undefined;
  } else if (status === "valide" && target.requestedDepartmentId && !target.departmentId) {
    // Si le chef a déjà accepté la demande, rattacher maintenant
    const requests = await ctx.db
      .query("departmentJoinRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const accepted = requests.find(
      (r) =>
        r.departmentId === target.requestedDepartmentId &&
        r.status === "accepted",
    );
    if (accepted) {
      patch.departmentId = target.requestedDepartmentId;
      patch.departmentRole = "membre";
      patch.requestedDepartmentId = undefined;
    }
  }
  await ctx.db.patch(userId, patch as any);
  return null;
}

/** Approve a pending account so it can be chosen in a department. */
export const validateAccount = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    return await reviewAccount(ctx, admin, args.userId, "valide");
  },
});

/** Reject (or un-validate) an account. */
export const rejectAccount = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    return await reviewAccount(ctx, admin, args.userId, "rejete");
  },
});

/** SUPER UTILISATEUR ONLY — nominate an approved account as DG. */
export const promoteToDirector = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const root = await requireRoot(ctx);

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Compte introuvable.");
    if (target.role === "root") {
      throw new Error("Ce compte est déjà le super utilisateur.");
    }
    if (target.accountStatus !== "valide") {
      throw new Error(
        "Seul un compte validé peut être nommé DG. Validez-le d'abord.",
      );
    }

    await ctx.db.patch(args.userId, {
      role: "admin",
      reviewedBy: root._id,
      reviewedAt: Date.now(),
    });
    return null;
  },
});

/** SUPER UTILISATEUR ONLY — revoke a DG back to a simple account. */
export const revokeDirector = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const root = await requireRoot(ctx);

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Compte introuvable.");
    if (target.role === "root") {
      throw new Error("Le compte du super utilisateur ne peut pas être révoqué.");
    }
    if (target.role !== "admin") {
      throw new Error("Ce compte n'est pas un DG.");
    }

    await ctx.db.patch(args.userId, {
      role: "user",
      reviewedBy: root._id,
      reviewedAt: Date.now(),
    });
    return null;
  },
});


/** URL d'upload pour le logo d'un département (chef ou admin). */
export const generateDepartmentLogoUploadUrl = mutation({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Utilisateur introuvable.");
    const dept = await ctx.db.get(args.departmentId);
    if (!dept) throw new Error("Département introuvable.");
    const isChef =
      user.departmentId === args.departmentId &&
      user.departmentRole === "chef";
    const isAdmin = user.role === "admin" || user.role === "root";
    if (!isChef && !isAdmin) {
      throw new Error("Seul le chef de département peut changer le logo.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const setDepartmentLogo = mutation({
  args: {
    departmentId: v.id("departments"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Utilisateur introuvable.");
    const dept = await ctx.db.get(args.departmentId);
    if (!dept) throw new Error("Département introuvable.");
    const isChef =
      user.departmentId === args.departmentId &&
      user.departmentRole === "chef";
    const isAdmin = user.role === "admin" || user.role === "root";
    if (!isChef && !isAdmin) {
      throw new Error("Seul le chef de département peut changer le logo.");
    }
    if (dept.logoStorageId) {
      try {
        await ctx.storage.delete(dept.logoStorageId);
      } catch {
        /* ignore */
      }
    }
    await ctx.db.patch(args.departmentId, { logoStorageId: args.storageId });
    return null;
  },
});

export const clearDepartmentLogo = mutation({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Utilisateur introuvable.");
    const dept = await ctx.db.get(args.departmentId);
    if (!dept) throw new Error("Département introuvable.");
    const isChef =
      user.departmentId === args.departmentId &&
      user.departmentRole === "chef";
    const isAdmin = user.role === "admin" || user.role === "root";
    if (!isChef && !isAdmin) {
      throw new Error("Seul le chef de département peut changer le logo.");
    }
    if (dept.logoStorageId) {
      try {
        await ctx.storage.delete(dept.logoStorageId);
      } catch {
        /* ignore */
      }
    }
    await ctx.db.patch(args.departmentId, { logoStorageId: undefined });
    return null;
  },
});
