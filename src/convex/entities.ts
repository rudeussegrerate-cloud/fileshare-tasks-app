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

const MNDPT_TREE: SeedNode[] = [
  { code: "CAB", name: "Cabinet du Ministre", kind: "cabinet" },
  {
    code: "SG",
    name: "Secrétariat Général",
    kind: "sg",
    children: [
      {
        code: "DAF",
        name: "Direction des Affaires Financières",
        kind: "direction",
        children: [
          { code: "DAF-COMPTA", name: "Service de la Comptabilité", kind: "service" },
          { code: "DAF-BUDGET", name: "Service du Budget", kind: "service" },
        ],
      },
      {
        code: "DRH",
        name: "Direction des Ressources Humaines",
        kind: "direction",
        children: [
          { code: "DRH-CARR", name: "Service Formation et Gestion des Carrières", kind: "service" },
          { code: "DRH-PERS", name: "Service du Personnel", kind: "service" },
        ],
      },
      {
        code: "DTD",
        name: "Direction Technique",
        kind: "direction",
        children: [
          { code: "DTD-ETUDES", name: "Service des Études", kind: "service" },
        ],
      },
      { code: "DSI", name: "Direction des Systèmes d'Information", kind: "direction" },
      { code: "DIR1", name: "Direction Interrégionale 1", kind: "interregion" },
      { code: "DIR2", name: "Direction Interrégionale 2", kind: "interregion" },
      { code: "DIR3", name: "Direction Interrégionale 3", kind: "interregion" },
    ],
  },
  { code: "PAOMA", name: "PAOMA (organisme sous tutelle)", kind: "organisme" },
  { code: "ARTEC", name: "ARTEC (organisme sous tutelle)", kind: "organisme" },
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
