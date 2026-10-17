import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

type DbCtx = QueryCtx | MutationCtx;
const ROLES = { ROOT: "root", ADMIN: "admin" } as const;

async function requireAdmin(ctx: DbCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Vous devez être connecté.");
  const user = await ctx.db.get(userId);
  if (!user || (user.role !== ROLES.ADMIN && user.role !== ROLES.ROOT)) {
    throw new Error("Réservé au DG / administrateur.");
  }
  return { userId, user };
}

type EntityKind =
  | "direction"
  | "service"
  | "organisme"
  | "cabinet"
  | "sg"
  | "interregion"
  | "cellule"
  | "autre";

type SeedNode = {
  code: string;
  name: string;
  kind: EntityKind;
  children?: SeedNode[];
};

/**
 * Organigramme MNDPT (classement hiérarchique pour le N° de courrier).
 * Chemin : MNDPT / SG / … / direction émettrice
 * Ex. DTD → N°071-2026/MNDPT/SG/DGDN/DTD
 */
const MNDPT_TREE: SeedNode[] = [
  // —— Organismes sous tutelle (rattachement ministériel) ——
  { code: "PAOMA", name: "PAOSITRA Malagasy", kind: "organisme" },
  {
    code: "ARTEC",
    name: "Autorité de Régulation des Technologies de Communication",
    kind: "organisme",
  },
  {
    code: "ARSP",
    name: "Autorité de Régulation du Secteur Postal",
    kind: "organisme",
  },
  {
    code: "INDP",
    name: "Institut National de Digitalisation des Postes",
    kind: "organisme",
  },

  // —— Cabinet du Ministre ——
  {
    code: "CAB",
    name: "Cabinet du Ministre",
    kind: "cabinet",
    children: [
      {
        code: "DCP",
        name: "Direction de la Communication et du Partenariat",
        kind: "direction",
      },
      {
        code: "PRMP",
        name: "Personne Responsable des Marchés Publics",
        kind: "cellule",
      },
      { code: "CAC", name: "Cellule Anti-Corruption", kind: "cellule" },
      { code: "SAI", name: "Service de l'Audit Interne", kind: "service" },
    ],
  },

  // —— Secrétariat Général ——
  {
    code: "SG",
    name: "Secrétariat Général",
    kind: "sg",
    children: [
      {
        code: "SCE",
        name: "Service de la Conservation de l'Environnement",
        kind: "service",
      },
      {
        code: "SSP",
        name: "Service de Secrétariat Particulier",
        kind: "service",
        children: [
          { code: "SAG", name: "Service Administratif Général", kind: "service" },
        ],
      },

      // Directions générales
      {
        code: "DGDN",
        name: "Direction Générale du Développement Numérique",
        kind: "direction",
        children: [
          {
            code: "DTD",
            name: "Direction de la Transformation Digitale",
            kind: "direction",
          },
          {
            code: "DEG",
            name: "Direction de l'E-Gouvernance",
            kind: "direction",
          },
          {
            code: "DAF",
            name: "Direction Administrative et Financière",
            kind: "direction",
          },
          {
            code: "DRH",
            name: "Direction des Ressources Humaines",
            kind: "direction",
          },
          {
            code: "DAJ",
            name: "Direction des Affaires Juridiques",
            kind: "direction",
          },
          {
            code: "DRSP",
            name: "Direction de la Régulation du Secteur Postal",
            kind: "direction",
          },
          {
            code: "DSI",
            name: "Direction du Système d'Information",
            kind: "direction",
          },
          {
            code: "DLP",
            name: "Direction de la Logistique et des Patrimoines",
            kind: "direction",
          },
          {
            code: "DIR-INTER",
            name: "Direction Interrégionales",
            kind: "interregion",
          },
          {
            code: "DIN",
            name: "Direction de l'Intégration du Numérique",
            kind: "direction",
          },
          {
            code: "DCC",
            name: "Direction en Conduite du Changement",
            kind: "direction",
          },
          {
            code: "DP",
            name: "Direction des Projets",
            kind: "direction",
          },
        ],
      },
      {
        code: "DGOVT",
        name: "Direction Générale des Opérations de la Vulgarisation des TICs",
        kind: "direction",
      },
    ],
  },
];


async function insertNode(
  ctx: MutationCtx,
  node: SeedNode,
  parentId: Id<"departments"> | undefined,
  createdBy: Id<"users">,
  now: number,
): Promise<Id<"departments">[]> {
  const existing = await ctx.db
    .query("departments")
    .withIndex("by_code", (q) => q.eq("code", node.code))
    .first();
  let id: Id<"departments">;
  if (existing) {
    id = existing._id;
    await ctx.db.patch(id, { name: node.name, kind: node.kind, parentId });
  } else {
    id = await ctx.db.insert("departments", {
      name: node.name,
      code: node.code,
      kind: node.kind,
      description: `Entité MNDPT — ${node.kind}`,
      createdBy,
      createdAt: now,
      parentId,
    });
  }
  const ids = [id];
  for (const child of node.children ?? []) {
    ids.push(...(await insertNode(ctx, child, id, createdBy, now)));
  }
  return ids;
}

export const seedMndptTree = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireAdmin(ctx);
    const now = Date.now();
    const all: Id<"departments">[] = [];
    for (const root of MNDPT_TREE) {
      all.push(...(await insertNode(ctx, root, undefined, userId, now)));
    }
    return { count: all.length };
  },
});

export const listTree = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db.query("departments").collect();
    const byId = new Map(all.map((d) => [d._id, d]));
    return all
      .map((d) => {
        let depth = 0;
        let p = d.parentId ? byId.get(d.parentId) : null;
        while (p && depth < 8) {
          depth += 1;
          p = p.parentId ? byId.get(p.parentId) : null;
        }
        const parent = d.parentId ? byId.get(d.parentId) : null;
        return {
          _id: d._id,
          name: d.name,
          code: d.code ?? null,
          kind: d.kind ?? "autre",
          parentId: d.parentId ?? null,
          parentName: parent?.name ?? null,
          depth,
        };
      })
      .sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.name.localeCompare(b.name, "fr");
      });
  },
});

export const resolveGroup = query({
  args: {
    group: v.union(
      v.literal("interregions"),
      v.literal("directions"),
      v.literal("services"),
      v.literal("organismes"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db.query("departments").collect();
    const kindMap = {
      interregions: "interregion",
      directions: "direction",
      services: "service",
      organismes: "organisme",
    } as const;
    const kind = kindMap[args.group];
    return all
      .filter((d) => d.kind === kind)
      .map((d) => ({ _id: d._id, name: d.name, code: d.code ?? null }));
  },
});
