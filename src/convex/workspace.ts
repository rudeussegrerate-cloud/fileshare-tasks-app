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
  if (isAdminRole(user.role)) {
    return { user, isAdmin: true };
  }
  const isChef =
    user.departmentRole === "chef" && user.departmentId === departmentId;
  // Chef d'une direction : peut gérer les services enfants
  let isParentChef = false;
  if (!isChef && user.departmentRole === "chef" && user.departmentId) {
    const target = await ctx.db.get(departmentId);
    if (
      target?.parentId &&
      String(target.parentId) === String(user.departmentId)
    ) {
      isParentChef = true;
    }
  }
  if (!isChef && !isParentChef) {
    throw new Error(
      "Seul le DG ou le chef de la structure (ou de la direction parente) peut faire cela.",
    );
  }
  return { user, isAdmin: false };
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
  // Réaffectation : réservée au DG (sinon il faut d'abord retirer le membre)
  if (person.departmentId && person.departmentId !== args.departmentId) {
    const actor = await requireUser(ctx);
    if (!isAdminRole(actor.role)) {
      throw new Error(
        "Cette personne est déjà affectée à une structure. Le DG peut la réaffecter, ou retirez-la d'abord.",
      );
    }
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
      // Un « root » sans email (compte fantôme) ne compte pas
      const roots = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("role"), "root"))
        .collect();
      const anyRealRoot = roots.some((r) => Boolean(r.email));
      const hasIdentity = Boolean(user.email);

      if (!anyRealRoot && hasIdentity) {
        // Premier compte réel = super utilisateur (DG / admin technique)
        patch.role = "root";
        patch.accountStatus = "valide";
        if (!user.profileCompletedAt && user.name) {
          patch.profileCompletedAt = Date.now();
        }
      } else if (!user.role) {
        patch.role = "user";
      }
    }

    // Réparer un root/admin bloqué en « en_attente »
    if (
      (user.role === "root" ||
        user.role === "admin" ||
        patch.role === "root" ||
        patch.role === "admin") &&
      (user.accountStatus === "en_attente" || user.accountStatus === "rejete")
    ) {
      patch.accountStatus = "valide";
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

/**
 * Secours : s'il n'existe aucun super utilisateur avec email,
 * le compte connecté (avec email) devient root + validé.
 * Inutile si un root réel existe déjà.
 */
export const claimBootstrapRoot = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Compte introuvable.");
    if (!user.email) {
      throw new Error("Votre compte doit avoir un email pour devenir administrateur.");
    }

    const roots = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "root"))
      .collect();
    const anyRealRoot = roots.some((r) => Boolean(r.email));

    if (anyRealRoot) {
      // Si l'appelant est déjà root/admin, s'assurer qu'il est validé
      if (user.role === "root" || user.role === "admin") {
        if (user.accountStatus !== "valide") {
          await ctx.db.patch(userId, { accountStatus: "valide" });
        }
        return { ok: true as const, role: user.role, message: "Compte admin déjà actif." };
      }
      throw new Error(
        "Un administrateur existe déjà. Demandez-lui de valider votre compte ou de vous nommer DG.",
      );
    }

    await ctx.db.patch(userId, {
      role: "root",
      accountStatus: "valide",
      profileCompletedAt: user.profileCompletedAt ?? Date.now(),
    });
    return {
      ok: true as const,
      role: "root" as const,
      message: "Vous êtes maintenant super utilisateur (admin).",
    };
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
    const isAdmin = isAdminRole(user.role);
    const canManage =
      isAdmin ||
      (user.departmentRole === "chef" &&
        args.departmentId &&
        user.departmentId === args.departmentId) ||
      // Chef sans departmentId précis : peut lister pour sa propre structure
      (user.departmentRole === "chef" && !args.departmentId);
    if (!canManage) return [];

    const users = await ctx.db.query("users").collect();
    const departments = await ctx.db.query("departments").collect();
    const depName = (id: typeof users[0]["departmentId"]) => {
      if (!id) return null;
      const d = departments.find((x) => x._id === id);
      return d ? (d.code ? `${d.code} — ${d.name}` : d.name) : null;
    };

    return users
      .filter((candidate) => candidate.accountStatus === "valide")
      .filter((candidate) => Boolean(candidate.profileCompletedAt))
      .filter((candidate) => {
        if (isAdmin) return true; // DG voit tout (réaffectation possible)
        if (!candidate.departmentId) return true;
        if (args.departmentId && candidate.departmentId === args.departmentId)
          return true;
        // Chef : aussi les membres sans structure
        return false;
      })
      .map((candidate) => ({
        _id: candidate._id,
        name: displayName(candidate),
        email: candidate.email ?? null,
        fonction: candidate.fonction ?? null,
        departmentRole: candidate.departmentRole ?? null,
        currentDepartment: depName(candidate.departmentId),
        isCurrentMember:
          Boolean(args.departmentId) &&
          candidate.departmentId === args.departmentId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
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
        code: department.code ?? null,
        kind: department.kind ?? (department.parentId ? "service" : "direction"),
        description: department.description ?? null,
        createdAt: department.createdAt,
        parentId: department.parentId ?? null,
        parentName: parent?.name ?? null,
        isSubDepartment: Boolean(department.parentId),
        childCount: children.length,
        chief: members.find((m) => m.departmentRole === "chef") ?? null,
        members,
        logoUrl,
        active: department.active !== false,
      });
    }
    // Directions / racines d'abord, puis services sous leur parent
    return result.sort((a, b) => {
      const aRoot = a.parentId ? 1 : 0;
      const bRoot = b.parentId ? 1 : 0;
      if (aRoot !== bRoot) return aRoot - bRoot;
      if (a.parentName && b.parentName && a.parentName !== b.parentName) {
        return a.parentName.localeCompare(b.parentName, "fr");
      }
      return a.name.localeCompare(b.name, "fr");
    });
  },
});

/**
 * The DG creates a department. Its chef is chosen among existing approved
 * accounts (the selection is optional and can be made later).
 */

/** Crée les directions MNDPT (fiche de transmission) si absentes — réservé admin/root. */
export const seedMndptDepartments = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const me = await ctx.db.get(userId);
    if (!me || (me.role !== "admin" && me.role !== "root")) {
      throw new Error("Réservé au DG / super utilisateur.");
    }

    /**
     * Arborescence officielle MNDPT (directions + services).
     * parentCode null = racine sous le ministère.
     */
    type Node = {
      code: string;
      name: string;
      kind:
        | "direction"
        | "service"
        | "organisme"
        | "cabinet"
        | "sg"
        | "interregion"
        | "cellule"
        | "autre";
      parentCode: string | null;
    };

    const nodes: Node[] = [
      // Rattachement Ministre
      { code: "CABINET", name: "Cabinet du Ministre", kind: "cabinet", parentCode: null },
      { code: "DCP", name: "Direction de la Communication et du Partenariat", kind: "direction", parentCode: null },
      { code: "DCP-SICM", name: "Service de l'Information, Communication et Multimédia", kind: "service", parentCode: "DCP" },
      { code: "DCP-SCIRP", name: "Service de la Communication Interne et des Relations Publiques", kind: "service", parentCode: "DCP" },
      { code: "DCP-SP", name: "Service du Partenariat", kind: "service", parentCode: "DCP" },
      { code: "PRMP", name: "Personne Responsable des Marchés Publics", kind: "direction", parentCode: null },
      { code: "CAC", name: "Cellule Anti-Corruption", kind: "cellule", parentCode: null },
      { code: "SAI", name: "Service de l'Audit Interne", kind: "service", parentCode: null },

      // Organismes sous tutelle
      { code: "PAOMA", name: "Paositra Malagasy (PAOMA)", kind: "organisme", parentCode: null },
      { code: "ARTEC", name: "Autorité de Régulation des Technologies de Communication", kind: "organisme", parentCode: null },
      { code: "ARSP", name: "Autorité de Régulation du Secteur Postal", kind: "organisme", parentCode: null },
      { code: "INDP", name: "Institut National de Digitalisation et des Postes", kind: "organisme", parentCode: null },

      // SG
      { code: "SG", name: "Secrétariat Général", kind: "sg", parentCode: null },
      { code: "SSP", name: "Service de Secrétariat Particulier", kind: "service", parentCode: "SG" },
      { code: "SAG", name: "Service des Affaires Générales", kind: "service", parentCode: "SG" },
      { code: "SCE", name: "Service de la Conservation de l'Environnement", kind: "service", parentCode: "SG" },

      // DGDN
      { code: "DGDN", name: "Direction Générale du Développement Numérique", kind: "direction", parentCode: "SG" },
      { code: "DTD", name: "Direction de la Transformation Digitale", kind: "direction", parentCode: "DGDN" },
      { code: "DTD-SCTD", name: "Service de la Coordination de la Transformation Digitale", kind: "service", parentCode: "DTD" },
      { code: "DTD-SAUN", name: "Service de l'Appropriation et de l'Usage du Numérique", kind: "service", parentCode: "DTD" },
      { code: "DEG", name: "Direction de l'E-Gouvernance", kind: "direction", parentCode: "DGDN" },
      { code: "DEG-SOS", name: "Service des Orientations Stratégiques", kind: "service", parentCode: "DEG" },
      { code: "DEG-SPC", name: "Service de la Planification et de la Coordination", kind: "service", parentCode: "DEG" },

      // DGOVT
      { code: "DGOVT", name: "Direction Générale des Opérations et de la Vulgarisation des TICs", kind: "direction", parentCode: "SG" },
      { code: "DIN", name: "Direction de l'Intégration du Numérique", kind: "direction", parentCode: "DGOVT" },
      { code: "DIN-SAIT", name: "Service d'Appui à l'Intégration des TICs", kind: "service", parentCode: "DIN" },
      { code: "DIN-STAT", name: "Service de la Statistique", kind: "service", parentCode: "DIN" },
      { code: "DIN-SNSF", name: "Service des Normes et Standards de Formation des TICs", kind: "service", parentCode: "DIN" },
      { code: "DCC", name: "Direction de la Conduite du Changement", kind: "direction", parentCode: "DGOVT" },
      { code: "DCC-SCCC", name: "Service de la Coordination de la Conduite de Changement", kind: "service", parentCode: "DCC" },
      { code: "DCC-SAI", name: "Service d'Appui Institutionnel", kind: "service", parentCode: "DCC" },
      { code: "DP", name: "Direction des Projets", kind: "direction", parentCode: "DGOVT" },
      { code: "DP-SEC", name: "Service d'Étude et de Conception", kind: "service", parentCode: "DP" },
      { code: "DP-SCSE", name: "Service de Coordination et de Suivi-Évaluation", kind: "service", parentCode: "DP" },

      // Directions transversales SG
      { code: "DRSP", name: "Direction de la Régulation du Secteur Postal", kind: "direction", parentCode: "SG" },
      { code: "DRSP-SRSOP", name: "Service Régulation et Suivi des Opérateurs Postaux", kind: "service", parentCode: "DRSP" },
      { code: "DRSP-SDRF", name: "Service Détection et Répression des Fraudes", kind: "service", parentCode: "DRSP" },
      { code: "DRSP-SPCESP", name: "Service Promotion, Coordination, Études du Secteur Postal", kind: "service", parentCode: "DRSP" },
      { code: "DSI", name: "Direction des Systèmes d'Information", kind: "direction", parentCode: "SG" },
      { code: "DSI-SDAGBD", name: "Service de Développement des Applicatifs et de Gestion des bases de données", kind: "service", parentCode: "DSI" },
      { code: "DSI-SARM", name: "Service de l'Administration des Réseaux et de Maintenance", kind: "service", parentCode: "DSI" },
      { code: "DAJ", name: "Direction des Affaires Juridiques", kind: "direction", parentCode: "SG" },
      { code: "DAJ-SL", name: "Service de la Législation", kind: "service", parentCode: "DAJ" },
      { code: "DAJ-SC", name: "Service du Contentieux", kind: "service", parentCode: "DAJ" },
      { code: "DAF", name: "Direction Administrative et Financière", kind: "direction", parentCode: "SG" },
      { code: "DAF-SPSE", name: "Service de la Programmation et de Suivi-Évaluation", kind: "service", parentCode: "DAF" },
      { code: "DAF-SAEB", name: "Service d'Appui à l'Exécution Budgétaire", kind: "service", parentCode: "DAF" },
      { code: "DAF-SCPT", name: "Service de la Comptabilité", kind: "service", parentCode: "DAF" },
      { code: "DRH", name: "Direction des Ressources Humaines", kind: "direction", parentCode: "SG" },
      { code: "DRH-SAS", name: "Service des Affaires Sociales", kind: "service", parentCode: "DRH" },
      { code: "DRH-SFGC", name: "Service de la Formation et de la Gestion des Carrières", kind: "service", parentCode: "DRH" },
      { code: "DRH-SMS", name: "Service Médico-Sanitaire", kind: "service", parentCode: "DRH" },
      { code: "DLP", name: "Direction de la Logistique et des Patrimoines", kind: "direction", parentCode: "SG" },
      { code: "DLP-SPAT", name: "Service du Patrimoine", kind: "service", parentCode: "DLP" },
      { code: "DLP-SCM", name: "Service de la Comptabilité Matière", kind: "service", parentCode: "DLP" },
      { code: "DLP-SLOG", name: "Service de la Logistique", kind: "service", parentCode: "DLP" },

      // DIR INTER
      { code: "DIR-ANT", name: "Direction Interrégionale Antsiranana", kind: "interregion", parentCode: "SG" },
      { code: "DIR-TOA", name: "Direction Interrégionale Toamasina", kind: "interregion", parentCode: "SG" },
      { code: "DIR-MAH", name: "Direction Interrégionale Mahajanga", kind: "interregion", parentCode: "SG" },
      { code: "DIR-TANA", name: "Direction Interrégionale Antananarivo", kind: "interregion", parentCode: "SG" },
      { code: "DIR-FIA", name: "Direction Interrégionale Fianarantsoa", kind: "interregion", parentCode: "SG" },
      { code: "DIR-TOL", name: "Direction Interrégionale Toliara", kind: "interregion", parentCode: "SG" },
    ];

    // Ajouter 3 services standards sous chaque DIR
    for (const dir of [
      "DIR-ANT",
      "DIR-TOA",
      "DIR-MAH",
      "DIR-TANA",
      "DIR-FIA",
      "DIR-TOL",
    ]) {
      nodes.push(
        {
          code: `${dir}-ST`,
          name: "Service Technique",
          kind: "service",
          parentCode: dir,
        },
        {
          code: `${dir}-SRDC`,
          name: "Service des Relations avec les Directions Centrales",
          kind: "service",
          parentCode: dir,
        },
        {
          code: `${dir}-SBR`,
          name: "Service du Bureau Régional",
          kind: "service",
          parentCode: dir,
        },
      );
    }

    const existing = await ctx.db.query("departments").collect();
    const byCode = new Map<string, (typeof existing)[0]>();
    const byName = new Map<string, (typeof existing)[0]>();
    for (const d of existing) {
      if (d.code) byCode.set(d.code.toUpperCase(), d);
      byName.set(d.name.trim().toUpperCase(), d);
    }

    const idByCode = new Map<string, typeof existing[0]["_id"]>();
    let created = 0;
    let updated = 0;
    const now = Date.now();

    // Plusieurs passes pour résoudre les parents
    for (let pass = 0; pass < 4; pass++) {
      for (const n of nodes) {
        const code = n.code.toUpperCase();
        let row = byCode.get(code) ?? byName.get(n.name.trim().toUpperCase());
        let parentId: typeof existing[0]["_id"] | undefined;
        if (n.parentCode) {
          const p =
            idByCode.get(n.parentCode.toUpperCase()) ??
            byCode.get(n.parentCode.toUpperCase())?._id;
          if (!p) continue; // parent pas encore créé
          parentId = p;
        }

        if (row) {
          idByCode.set(code, row._id);
          byCode.set(code, row);
          const patch: Record<string, unknown> = {};
          if (row.code !== code) patch.code = code;
          if (row.kind !== n.kind) patch.kind = n.kind;
          if (parentId && row.parentId !== parentId) patch.parentId = parentId;
          if (row.name !== n.name) patch.name = n.name;
          if (Object.keys(patch).length) {
            await ctx.db.patch(row._id, patch);
            updated += 1;
            row = { ...row, ...patch } as typeof row;
            byCode.set(code, row);
          }
          continue;
        }

        const id = await ctx.db.insert("departments", {
          name: n.name,
          code,
          kind: n.kind,
          parentId,
          createdBy: userId,
          createdAt: now,
        });
        idByCode.set(code, id);
        created += 1;
        const fake = {
          _id: id,
          name: n.name,
          code,
          kind: n.kind,
          parentId,
          createdBy: userId,
          createdAt: now,
        } as (typeof existing)[0];
        byCode.set(code, fake);
        byName.set(n.name.trim().toUpperCase(), fake);
      }
    }

    return { created, updated, total: nodes.length };
  },
});


export const createDepartment = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    chiefId: v.optional(v.id("users")),
    code: v.optional(v.string()),
    kind: v.optional(
      v.union(
        v.literal("direction"),
        v.literal("service"),
        v.literal("organisme"),
        v.literal("cabinet"),
        v.literal("sg"),
        v.literal("interregion"),
        v.literal("cellule"),
        v.literal("autre"),
      ),
    ),
    parentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Le nom de la structure est obligatoire.");
    const code = args.code?.trim().toUpperCase() || undefined;
    if (code) {
      const clash = await ctx.db
        .query("departments")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (clash) throw new Error(`Le code « ${code} » est déjà utilisé.`);
    }
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent) throw new Error("Structure parente introuvable.");
    }

    const departmentId = await ctx.db.insert("departments", {
      name,
      code,
      kind: args.kind ?? (args.parentId ? "service" : "direction"),
      description: args.description?.trim() || undefined,
      parentId: args.parentId,
      active: true,
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
        "Seul le chef de cette direction (ou le DG) peut créer un service.",
      );
    }

    const name = args.name.trim();
    if (!name) throw new Error("Le nom du service est obligatoire.");

    const departmentId = await ctx.db.insert("departments", {
      name,
      description: args.description?.trim() || undefined,
      createdBy: user._id,
      createdAt: Date.now(),
      parentId: args.parentId,
      kind: "service",
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


/** DG : modifier nom, code, type, description. */
export const updateDepartment = mutation({
  args: {
    departmentId: v.id("departments"),
    name: v.string(),
    code: v.optional(v.string()),
    kind: v.optional(
      v.union(
        v.literal("direction"),
        v.literal("service"),
        v.literal("organisme"),
        v.literal("cabinet"),
        v.literal("sg"),
        v.literal("interregion"),
        v.literal("cellule"),
        v.literal("autre"),
      ),
    ),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const dep = await ctx.db.get(args.departmentId);
    if (!dep) throw new Error("Structure introuvable.");
    const name = args.name.trim();
    if (!name) throw new Error("Le nom est obligatoire.");
    const code = args.code?.trim().toUpperCase() || undefined;
    if (code && code !== (dep.code ?? "").toUpperCase()) {
      const clash = await ctx.db
        .query("departments")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (clash && clash._id !== args.departmentId) {
        throw new Error(`Le code « ${code} » est déjà utilisé.`);
      }
    }
    await ctx.db.patch(args.departmentId, {
      name,
      code,
      kind: args.kind ?? dep.kind,
      description: args.description?.trim() || undefined,
    });
    return args.departmentId;
  },
});

/** DG : rattacher à un autre parent (hiérarchie). */
export const moveDepartment = mutation({
  args: {
    departmentId: v.id("departments"),
    parentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const dep = await ctx.db.get(args.departmentId);
    if (!dep) throw new Error("Structure introuvable.");
    if (args.parentId) {
      if (args.parentId === args.departmentId) {
        throw new Error("Une structure ne peut pas être son propre parent.");
      }
      const parent = await ctx.db.get(args.parentId);
      if (!parent) throw new Error("Parent introuvable.");
      // Anti-cycle
      let walkId: Id<"departments"> | undefined = args.parentId;
      for (let guard = 0; walkId && guard < 20; guard++) {
        if (walkId === args.departmentId) {
          throw new Error(
            "Déplacement impossible : cela créerait une boucle dans la hiérarchie.",
          );
        }
        const walkNode: Doc<"departments"> | null = await ctx.db.get(walkId);
        walkId = walkNode?.parentId;
      }
    }
    if (args.parentId) {
      await ctx.db.patch(args.departmentId, { parentId: args.parentId });
    } else {
      // Racine : retirer parentId du document
      await ctx.db.replace(args.departmentId, {
        name: dep.name,
        code: dep.code,
        kind: dep.kind,
        description: dep.description,
        createdBy: dep.createdBy,
        createdAt: dep.createdAt,
        logoStorageId: dep.logoStorageId,
        active: dep.active,
      });
    }
    return args.departmentId;
  },
});

/** DG : activer / désactiver (masqué à l'envoi si inactif). */
export const setDepartmentActive = mutation({
  args: {
    departmentId: v.id("departments"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const dep = await ctx.db.get(args.departmentId);
    if (!dep) throw new Error("Structure introuvable.");
    await ctx.db.patch(args.departmentId, { active: args.active });
    return args.departmentId;
  },
});

/** The DG deletes a department; its members simply become unassigned. */

/** DG : structures dont le parent n'existe plus → racine. */
export const repairDepartmentOrphans = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("departments").collect();
    const ids = new Set(all.map((d) => String(d._id)));
    let fixed = 0;
    for (const d of all) {
      if (d.parentId && !ids.has(String(d.parentId))) {
        await ctx.db.replace(d._id, {
          name: d.name,
          code: d.code,
          kind: d.kind,
          description: d.description,
          createdBy: d.createdBy,
          createdAt: d.createdAt,
          logoStorageId: d.logoStorageId,
          active: d.active,
        });
        fixed += 1;
      }
    }
    return { fixed };
  },
});


export const deleteDepartment = mutation({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const dept = await ctx.db.get(args.departmentId);
    if (!dept) throw new Error("Structure introuvable.");

    const isAdmin = isAdminRole(user.role);
    const isParentChef =
      Boolean(dept.parentId) &&
      user.departmentId === dept.parentId &&
      user.departmentRole === "chef";
    const isCreator =
      Boolean(dept.parentId) && dept.createdBy === user._id;

    // Direction (sans parent) : DG uniquement
    // Service (avec parent) : DG, chef de la direction parente, ou créateur
    if (!dept.parentId) {
      if (!isAdmin) {
        throw new Error("Seul le DG peut supprimer une direction.");
      }
    } else if (!isAdmin && !isParentChef && !isCreator) {
      throw new Error(
        "Seul le chef de la direction (ou le DG) peut supprimer ce service.",
      );
    }

    // Interdire si des services enfants existent encore
    const all = await ctx.db.query("departments").collect();
    const hasChildren = all.some(
      (d) => d.parentId && String(d.parentId) === String(args.departmentId),
    );
    if (hasChildren) {
      throw new Error(
        "Supprimez d'abord les services rattachés à cette structure.",
      );
    }

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
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const viewer = await ctx.db.get(userId);
    if (!viewer || !isAdminRole(viewer.role)) {
      return [];
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
/** DG / root — valider tous les comptes en attente (anciens utilisateurs). */
export const validateAllPendingAccounts = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const reviewer = await ctx.db.get(userId);
    if (!reviewer || !isAdminRole(reviewer.role)) {
      throw new Error("Réservé au DG ou super utilisateur.");
    }
    const users = await ctx.db.query("users").collect();
    let count = 0;
    for (const u of users) {
      if (u._id === reviewer._id) continue;
      if (isAdminRole(u.role)) continue;
      const status = u.accountStatus ?? "en_attente";
      if (status !== "en_attente") continue;
      await reviewAccount(ctx, reviewer, u._id, "valide");
      count += 1;
    }
    return { validated: count };
  },
});


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

/**
 * Réinitialise toutes les données métier → site vierge.
 * Conserve uniquement le compte DG/root qui lance l'action.
 * Confirmation obligatoire : confirm === "REINITIALISER"
 */
export const wipeSiteData = mutation({
  args: { confirm: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const me = await ctx.db.get(userId);
    if (!me) throw new Error("Utilisateur introuvable.");
    if (!isAdminRole(me.role)) {
      throw new Error("Seul le DG peut réinitialiser le site.");
    }
    if (args.confirm !== "REINITIALISER") {
      throw new Error(
        'Tapez exactement REINITIALISER pour confirmer la remise à zéro.',
      );
    }

    const counts: Record<string, number> = {};

    async function delAll(
      label: string,
      rows: Array<{ _id: Id<any> }>,
      skipId?: string,
    ) {
      let n = 0;
      for (const row of rows) {
        if (skipId && String(row._id) === skipId) continue;
        try {
          await ctx.db.delete(row._id);
          n += 1;
        } catch {
          /* ignore */
        }
      }
      counts[label] = n;
    }

    try {
      await delAll(
        "documentSteps",
        await ctx.db.query("documentSteps").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "documentRevisions",
        await ctx.db.query("documentRevisions").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      const docs = await ctx.db.query("documents").collect();
      for (const d of docs) {
        try {
          if (d.storageId) await ctx.storage.delete(d.storageId);
        } catch {
          /* ignore */
        }
      }
      await delAll("documents", docs);
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "announcementReactions",
        await ctx.db.query("announcementReactions").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "announcementComments",
        await ctx.db.query("announcementComments").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "announcements",
        await ctx.db.query("announcements").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "chatMessages",
        await ctx.db.query("chatMessages").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "conversations",
        await ctx.db.query("conversations").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "notifications",
        await ctx.db.query("notifications").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll("auditLogs", await ctx.db.query("auditLogs").collect());
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "departmentJoinRequests",
        await ctx.db.query("departmentJoinRequests").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "departmentInvitations",
        await ctx.db.query("departmentInvitations").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "botMessages",
        await ctx.db.query("botMessages").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll("botSkills", await ctx.db.query("botSkills").collect());
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "botProfiles",
        await ctx.db.query("botProfiles").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll("rateLimits", await ctx.db.query("rateLimits").collect());
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "departments",
        await ctx.db.query("departments").collect(),
      );
    } catch (e) {
      console.error(e);
    }
    try {
      await delAll(
        "users",
        await ctx.db.query("users").collect(),
        String(userId),
      );
    } catch (e) {
      console.error(e);
    }

    try {
      await ctx.db.patch(userId, {
        departmentId: undefined,
        departmentRole: undefined,
        accountStatus: "valide",
        role: me.role === "root" ? "root" : "admin",
      });
    } catch {
      /* ignore */
    }

    return { ok: true as const, counts };
  },
});
