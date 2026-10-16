/**
 * Vue admin : organigramme (liste mobile + 3D desktop) et circulation des documents.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  Box,
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  Network,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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

type Stats = { open: number; traite: number; members: number; name: string };

export function Org3DView() {
  const me = useQuery(api.workspace.me);
  const departments = useQuery(api.workspace.listDepartments);
  const overview = useQuery(
    api.documents.enterpriseOverview,
    me?.isAdmin || me?.isRoot ? {} : "skip",
  );

  const [rotY, setRotY] = useState(-12);
  const [rotX, setRotX] = useState(22);
  const [tab, setTab] = useState<"org" | "docs">("org");
  const [viewMode, setViewMode] = useState<"list" | "3d">("list");
  const [isNarrow, setIsNarrow] = useState(true);
  const drag = useRef<{ x: number; y: number; ry: number; rx: number } | null>(
    null,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => {
      setIsNarrow(mq.matches);
      setViewMode(mq.matches ? "list" : "3d");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

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
    const map = new Map<string, Stats>();
    const rows =
      (overview as { departmentStats?: Array<Record<string, unknown>> } | null)
        ?.departmentStats ?? [];
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
    return map;
  }, [overview]);

  if (me === undefined || departments === undefined) {
    return <MndptLoader size="section" />;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-4 text-center">
        <Network className="mx-auto size-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Organigramme</h2>
        <p className="text-sm text-muted-foreground">
          Réservé au directeur général.
        </p>
      </div>
    );
  }

  const ovTotals = (
    overview as {
      totals?: {
        open?: number;
        traite?: number;
        byStatus?: Record<string, number>;
      };
    } | null
  )?.totals;
  const totals = {
    open: ovTotals?.open ?? 0,
    traite: ovTotals?.traite ?? 0,
    depts: departments.length,
  };

  return (
    <div
      className="mx-auto w-full max-w-5xl space-y-4 px-1 sm:space-y-5 sm:px-0"
      data-scandoc-tour="org-3d"
    >
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight sm:text-xl">
          <Box className="size-5 shrink-0 text-brand" />
          Organisation & circulation
        </h2>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Structures MNDPT et dossiers en cours.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        <Kpi label="Structures" value={totals.depts} />
        <Kpi label="Ouverts" value={totals.open} accent />
        <Kpi label="Traités" value={totals.traite} />
      </div>

      <div className="flex flex-wrap gap-2">
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
      </div>

      {tab === "org" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              className="h-8 text-xs"
              onClick={() => setViewMode("list")}
            >
              Liste
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "3d" ? "secondary" : "ghost"}
              className="h-8 text-xs"
              onClick={() => setViewMode("3d")}
            >
              Vue 3D
            </Button>
            {viewMode === "3d" ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto h-8 gap-1 text-xs"
                onClick={() => {
                  setRotY(-12);
                  setRotX(22);
                }}
              >
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            ) : null}
          </div>

          {viewMode === "list" ? (
            <div className="rounded-sm border border-border bg-card">
              <div className="border-b border-border bg-muted/30 px-3 py-2 text-xs font-semibold">
                MNDPT — arborescence
              </div>
              <ul className="max-h-[min(70vh,560px)] overflow-y-auto p-2">
                {roots.map((root) => (
                  <TreeRow
                    key={root._id}
                    dept={root}
                    tree={tree}
                    stats={perDeptStats}
                    depth={0}
                  />
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                {isNarrow
                  ? "Glissez un doigt pour pivoter. Préférez la liste sur petit écran si besoin."
                  : "Faites glisser pour pivoter la vue 3D."}
              </p>
              <div
                className="relative h-[min(55vh,420px)] w-full touch-none overflow-hidden rounded-lg border border-border bg-gradient-to-b from-slate-100 to-slate-200/80 dark:from-slate-900 dark:to-slate-950 sm:h-[min(70vh,520px)]"
                style={{ perspective: isNarrow ? "600px" : "900px" }}
                onPointerDown={(e) => {
                  drag.current = {
                    x: e.clientX,
                    y: e.clientY,
                    ry: rotY,
                    rx: rotX,
                  };
                  (e.currentTarget as HTMLElement).setPointerCapture(
                    e.pointerId,
                  );
                }}
                onPointerMove={(e) => {
                  if (!drag.current) return;
                  const dx = e.clientX - drag.current.x;
                  const dy = e.clientY - drag.current.y;
                  setRotY(drag.current.ry + dx * 0.4);
                  setRotX(
                    Math.min(50, Math.max(6, drag.current.rx - dy * 0.3)),
                  );
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
              >
                <div
                  className="absolute left-1/2 top-[45%] origin-center"
                  style={{
                    transform: `translate(-50%, -50%) scale(${isNarrow ? 0.72 : 1}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
                    transformStyle: "preserve-3d",
                    width: isNarrow ? "280px" : "max-content",
                    maxWidth: isNarrow ? "92vw" : undefined,
                  }}
                >
                  <div
                    className="mx-auto mb-4 w-fit rounded-md border border-brand/40 bg-brand px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground shadow-lg sm:mb-6 sm:px-4 sm:py-2 sm:text-sm"
                    style={{ transform: "translateZ(36px)" }}
                  >
                    MNDPT
                  </div>

                  <div
                    className={cn(
                      "flex justify-center gap-2",
                      isNarrow ? "flex-col items-center" : "flex-wrap",
                    )}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    {roots.slice(0, isNarrow ? 8 : 16).map((root, i) => (
                      <OrgNode
                        key={root._id}
                        dept={root}
                        children={tree.get(String(root._id)) ?? []}
                        tree={tree}
                        depth={0}
                        index={i}
                        stats={perDeptStats.get(String(root._id))}
                        compact={isNarrow}
                      />
                    ))}
                  </div>
                  {isNarrow && roots.length > 8 ? (
                    <p className="mt-3 text-center text-[10px] text-muted-foreground">
                      +{roots.length - 8} structures — voir en mode Liste
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-sm border border-border bg-card p-2.5 sm:p-3">
            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
              Légende
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground sm:text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-brand" /> Direction
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-sky-500" /> Service
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-amber-500" /> Ouverts
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
        "rounded-sm border px-2 py-2 text-center sm:px-3 sm:py-2.5",
        accent ? "border-amber-300/60 bg-amber-50/80" : "border-border bg-card",
      )}
    >
      <p className="text-base font-semibold tabular-nums sm:text-lg">{value}</p>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground sm:text-[10px]">
        {label}
      </p>
    </div>
  );
}

function TreeRow({
  dept,
  tree,
  stats,
  depth,
}: {
  dept: Dept;
  tree: Map<string | "root", Dept[]>;
  stats: Map<string, Stats>;
  depth: number;
}) {
  const kids = tree.get(String(dept._id)) ?? [];
  const [open, setOpen] = useState(depth < 1);
  const s = stats.get(String(dept._id));
  const isService = dept.kind === "service";

  return (
    <li>
      <button
        type="button"
        onClick={() => kids.length > 0 && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted/50",
          isService && "text-muted-foreground",
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <span className="mt-0.5 size-4 shrink-0 text-muted-foreground">
          {kids.length > 0 ? (
            open ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )
          ) : (
            <span className="block size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-semibold">
            {dept.code ?? "—"}
            <span className="font-normal text-muted-foreground">
              {" "}
              — {dept.name}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            <span>{s?.members ?? dept.members?.length ?? 0} pers.</span>
            {(s?.open ?? 0) > 0 ? (
              <Badge
                variant="secondary"
                className="h-4 bg-amber-100 px-1 text-[9px] text-amber-900"
              >
                {s!.open} ouv.
              </Badge>
            ) : null}
          </span>
        </span>
      </button>
      {open && kids.length > 0 ? (
        <ul>
          {kids.map((c) => (
            <TreeRow
              key={c._id}
              dept={c}
              tree={tree}
              stats={stats}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function OrgNode({
  dept,
  children,
  tree,
  depth,
  index,
  stats,
  compact,
}: {
  dept: Dept;
  children: Dept[];
  tree: Map<string | "root", Dept[]>;
  depth: number;
  index: number;
  stats?: Stats;
  compact?: boolean;
}) {
  const isService = dept.kind === "service";
  const z = 20 - depth * 6;
  const open = stats?.open ?? 0;
  const maxChildren = compact ? (depth === 0 ? 4 : 3) : depth === 0 ? 10 : 6;

  return (
    <div
      className="flex flex-col items-center gap-1.5"
      style={{
        transform: `translateZ(${z}px)`,
        transformStyle: "preserve-3d",
      }}
    >
      <div
        className={cn(
          "relative rounded-md border px-2 py-1.5 text-center shadow-md",
          compact ? "min-w-[6.5rem] max-w-[8rem]" : "min-w-[7.5rem] max-w-[10rem]",
          isService
            ? "border-sky-400/50 bg-sky-50 dark:bg-sky-950/40"
            : "border-brand/30 bg-card",
        )}
        style={{ transform: `rotateY(${(index % 5) * 2 - 4}deg)` }}
      >
        <p className="truncate text-[10px] font-bold tracking-wide sm:text-[11px]">
          {dept.code ?? dept.name.slice(0, 12)}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[9px] leading-tight text-muted-foreground sm:text-[10px]">
          {dept.name}
        </p>
        <div className="mt-1 flex items-center justify-center gap-1 text-[8px] text-muted-foreground sm:text-[9px]">
          <span>{stats?.members ?? dept.members?.length ?? 0} p.</span>
          {open > 0 ? (
            <Badge
              variant="secondary"
              className="h-3.5 bg-amber-100 px-1 text-[8px] text-amber-900"
            >
              {open}
            </Badge>
          ) : null}
        </div>
      </div>

      {children.length > 0 && depth < (compact ? 1 : 2) ? (
        <div
          className={cn(
            "flex justify-center gap-1.5 border-t border-dashed border-slate-400/40 pt-1.5",
            compact ? "flex-col items-center" : "flex-wrap",
          )}
          style={{ transformStyle: "preserve-3d" }}
        >
          {children.slice(0, maxChildren).map((child, i) => (
            <OrgNode
              key={child._id}
              dept={child}
              children={tree.get(String(child._id)) ?? []}
              tree={tree}
              depth={depth + 1}
              index={i}
              stats={undefined}
              compact={compact}
            />
          ))}
          {children.length > maxChildren ? (
            <p className="text-center text-[9px] text-muted-foreground">
              +{children.length - maxChildren}
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
  stats: Map<string, Stats>;
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

  const byStatus = (
    overview as { totals?: { byStatus?: Record<string, number> } } | null
  )?.totals?.byStatus;

  return (
    <div className="space-y-3 sm:space-y-4">
      {byStatus ? (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
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
              className="rounded-sm border border-border bg-card px-2 py-2 text-center sm:px-3"
            >
              <p className="text-sm font-semibold tabular-nums sm:text-base">
                {byStatus[k] ?? 0}
              </p>
              <p className="text-[9px] text-muted-foreground sm:text-[10px]">
                {label}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {rows.map((r) => (
          <div
            key={r.id}
            className="rounded-sm border border-border bg-card px-3 py-2"
          >
            <p className="font-mono text-xs font-semibold">{r.code}</p>
            <p className="truncate text-[11px] text-muted-foreground">{r.name}</p>
            <div className="mt-1.5 flex gap-3 text-[11px]">
              <span>{r.members} pers.</span>
              <span className={r.open > 0 ? "font-semibold text-amber-700" : ""}>
                {r.open} ouv.
              </span>
              <span>{r.traite} traités</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-sm border border-border sm:block">
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
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 font-mono text-xs font-semibold">
                  {r.code}
                </td>
                <td className="max-w-[12rem] truncate px-3 py-2 text-xs">
                  {r.name}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {r.members}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {r.open > 0 ? (
                    <span className="font-semibold text-amber-700">{r.open}</span>
                  ) : (
                    0
                  )}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  {r.traite}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        « Ouverts » = envoyé, consulté ou en cours (hors archivés).
      </p>
    </div>
  );
}
