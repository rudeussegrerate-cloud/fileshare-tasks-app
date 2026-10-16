/**
 * Vue admin : organigramme 3D + circulation des documents par structure.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  Box,
  Building2,
  FileText,
  Network,
  RotateCcw,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { MndptLoader } from "@/components/MndptLoader";

type Dept = {
  _id: string;
  name: string;
  code?: string | null;
  kind?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  members?: Array<{ _id: string }>;
};

export function Org3DView() {
  const me = useQuery(api.workspace.me);
  const departments = useQuery(api.workspace.listDepartments);
  const overview = useQuery(
    api.documents.enterpriseOverview,
    me?.isAdmin || me?.isRoot ? {} : "skip",
  );

  const [rotY, setRotY] = useState(-18);
  const [rotX, setRotX] = useState(28);
  const [tab, setTab] = useState<"org" | "docs">("org");
  const drag = useRef<{ x: number; y: number; ry: number; rx: number } | null>(
    null,
  );

  const isAdmin = Boolean(me?.isAdmin || me?.isRoot);

  const tree = useMemo(() => {
    const list = (departments ?? []) as Dept[];
    const byParent = new Map<string | "root", Dept[]>();
    for (const d of list) {
      const key = d.parentId ? String(d.parentId) : "root";
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(d);
    }
    for (const [, arr] of byParent) {
      arr.sort((a, b) =>
        (a.code ?? a.name).localeCompare(b.code ?? b.name, "fr"),
      );
    }
    return byParent;
  }, [departments]);

  const roots = tree.get("root") ?? [];

  const perDeptStats = useMemo(() => {
    const map = new Map<
      string,
      { open: number; traite: number; members: number; name: string }
    >();
    const rows =
      (overview as { departmentStats?: Array<Record<string, unknown>> } | null)
        ?.departmentStats ?? [];
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const id = String(r.departmentId ?? "");
        if (!id || id === "__none__") continue;
        map.set(id, {
          open: Number(r.open ?? 0),
          traite: Number(r.traite ?? 0),
          members: Number(r.members ?? 0),
          name: String(r.name ?? ""),
        });
      }
    }
    return map;
  }, [overview]);

  if (me === undefined || departments === undefined) {
    return <MndptLoader size="section" />;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-4 text-center">
        <Network className="mx-auto size-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Organigramme 3D</h2>
        <p className="text-sm text-muted-foreground">
          Réservé au directeur général.
        </p>
      </div>
    );
  }

  const ovTotals = (overview as {
    totals?: { open?: number; traite?: number; byStatus?: Record<string, number> };
  } | null)?.totals;
  const totals = {
    open: ovTotals?.open ?? 0,
    traite: ovTotals?.traite ?? 0,
    depts: departments.length,
    byStatus: ovTotals?.byStatus,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5" data-scandoc-tour="org-3d">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Box className="size-5 text-brand" />
          Organisation & circulation
        </h2>
        <p className="text-sm text-muted-foreground">
          Vue d’ensemble MNDPT — structures et dossiers en cours.
        </p>
      </header>

      {/* KPI simples */}
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Structures" value={totals.depts} />
        <Kpi label="Dossiers ouverts" value={totals.open} accent />
        <Kpi label="Traités" value={totals.traite} />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "org" ? "default" : "outline"}
          className="gap-1.5"
          onClick={() => setTab("org")}
        >
          <Building2 className="size-3.5" />
          Organigramme
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "docs" ? "default" : "outline"}
          className="gap-1.5"
          onClick={() => setTab("docs")}
        >
          <FileText className="size-3.5" />
          Circulation
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto gap-1.5"
          onClick={() => {
            setRotY(-18);
            setRotX(28);
          }}
        >
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>

      {tab === "org" ? (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Faites glisser pour faire pivoter la vue 3D.
          </p>
          <div
            className="relative h-[min(70vh,520px)] overflow-hidden rounded-lg border border-border bg-gradient-to-b from-slate-100 to-slate-200/80 dark:from-slate-900 dark:to-slate-950"
            style={{ perspective: "900px" }}
            onPointerDown={(e) => {
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                ry: rotY,
                rx: rotX,
              };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const dx = e.clientX - drag.current.x;
              const dy = e.clientY - drag.current.y;
              setRotY(drag.current.ry + dx * 0.35);
              setRotX(Math.min(55, Math.max(8, drag.current.rx - dy * 0.25)));
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <div
              className="absolute left-1/2 top-1/2 origin-center"
              style={{
                transform: `translate(-50%, -42%) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
                transformStyle: "preserve-3d",
                width: "max-content",
              }}
            >
              {/* Racine ministère */}
              <div
                className="mx-auto mb-6 w-fit rounded-md border border-brand/40 bg-brand px-4 py-2 text-center text-sm font-semibold text-primary-foreground shadow-lg"
                style={{ transform: "translateZ(40px)" }}
              >
                MNDPT
              </div>

              <div
                className="flex flex-wrap justify-center gap-3"
                style={{ transformStyle: "preserve-3d" }}
              >
                {roots.map((root, i) => (
                  <OrgNode
                    key={root._id}
                    dept={root}
                    children={tree.get(String(root._id)) ?? []}
                    tree={tree}
                    depth={0}
                    index={i}
                    stats={perDeptStats.get(String(root._id))}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Légende plate lisible */}
          <div className="rounded-sm border border-border bg-card p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              Légende
            </p>
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-brand" /> Direction /
                structure
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-sky-500" /> Service
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-amber-500" /> Dossiers
                ouverts
              </span>
            </div>
          </div>
        </div>
      ) : (
        <CirculationTable
          departments={(departments ?? []) as Dept[]}
          stats={perDeptStats}
          overview={overview}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-sm border px-3 py-2.5 text-center",
        accent ? "border-amber-300/60 bg-amber-50/80" : "border-border bg-card",
      )}
    >
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function OrgNode({
  dept,
  children,
  tree,
  depth,
  index,
  stats,
}: {
  dept: Dept;
  children: Dept[];
  tree: Map<string | "root", Dept[]>;
  depth: number;
  index: number;
  stats?: { open: number; traite: number; members: number };
}) {
  const isService = dept.kind === "service";
  const z = 24 - depth * 8;
  const open = stats?.open ?? 0;

  return (
    <div
      className="flex flex-col items-center gap-2"
      style={{
        transform: `translateZ(${z}px)`,
        transformStyle: "preserve-3d",
      }}
    >
      <div
        className={cn(
          "relative min-w-[7.5rem] max-w-[10rem] rounded-md border px-2.5 py-2 text-center shadow-md",
          isService
            ? "border-sky-400/50 bg-sky-50 dark:bg-sky-950/40"
            : "border-brand/30 bg-card",
        )}
        style={{ transform: `rotateY(${(index % 5) * 2 - 4}deg)` }}
      >
        <p className="truncate text-[11px] font-bold tracking-wide">
          {dept.code ?? dept.name.slice(0, 12)}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted-foreground">
          {dept.name}
        </p>
        <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[9px] text-muted-foreground">
          <span>{stats?.members ?? dept.members?.length ?? 0} pers.</span>
          {open > 0 ? (
            <Badge
              variant="secondary"
              className="h-4 bg-amber-100 px-1 text-[9px] text-amber-900"
            >
              {open} ouv.
            </Badge>
          ) : null}
        </div>
      </div>

      {children.length > 0 && depth < 2 ? (
        <div
          className="flex flex-wrap justify-center gap-2 border-t border-dashed border-slate-400/40 pt-2"
          style={{ transformStyle: "preserve-3d" }}
        >
          {children.slice(0, depth === 0 ? 12 : 8).map((child, i) => (
            <OrgNode
              key={child._id}
              dept={child}
              children={tree.get(String(child._id)) ?? []}
              tree={tree}
              depth={depth + 1}
              index={i}
              stats={undefined}
            />
          ))}
          {children.length > (depth === 0 ? 12 : 8) ? (
            <p className="w-full text-center text-[10px] text-muted-foreground">
              +{children.length - (depth === 0 ? 12 : 8)} autres
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CirculationTable({
  departments,
  stats,
  overview,
}: {
  departments: Dept[];
  stats: Map<
    string,
    { open: number; traite: number; members: number; name: string }
  >;
  overview: unknown;
}) {
  const rows = departments
    .filter((d) => d.kind !== "service")
    .map((d) => {
      const s = stats.get(String(d._id));
      return {
        id: d._id,
        code: d.code ?? "—",
        name: d.name,
        members: s?.members ?? d.members?.length ?? 0,
        open: s?.open ?? 0,
        traite: s?.traite ?? 0,
      };
    })
    .sort((a, b) => b.open - a.open || a.code.localeCompare(b.code, "fr"));

  const byStatus =
    (overview as { totals?: { byStatus?: Record<string, number> } } | null)
      ?.totals?.byStatus;

  return (
    <div className="space-y-4">
      {byStatus ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["envoye", "Envoyés"],
              ["consulte", "Consultés"],
              ["en_cours", "En cours"],
              ["traite", "Traités"],
            ] as const
          ).map(([k, label]) => (
            <div
              key={k}
              className="rounded-sm border border-border bg-card px-3 py-2 text-center"
            >
              <p className="text-base font-semibold tabular-nums">
                {byStatus[k] ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full min-w-[320px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Structure</th>
              <th className="px-3 py-2 font-medium text-right">Pers.</th>
              <th className="px-3 py-2 font-medium text-right">Ouverts</th>
              <th className="px-3 py-2 font-medium text-right">Traités</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border/60 last:border-0"
              >
                <td className="px-3 py-2 font-mono text-xs font-semibold">
                  {r.code}
                </td>
                <td className="max-w-[12rem] truncate px-3 py-2 text-xs">
                  {r.name}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs">
                  {r.members}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs">
                  {r.open > 0 ? (
                    <span className="font-semibold text-amber-700">{r.open}</span>
                  ) : (
                    0
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs">
                  {r.traite}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Les dossiers « ouverts » regroupent les statuts envoyé, consulté et en
        cours (hors archivés).
      </p>
    </div>
  );
}
