import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Move,
  Plus,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DeptRow = {
  _id: Id<"departments">;
  name: string;
  code: string | null;
  kind: string | null;
  parentId: Id<"departments"> | null;
  active: boolean;
};

/**
 * Gestion hiérarchie MNDPT — arbre vertical cliquable (style explorateur).
 * Orphelins (parent manquant) affichés à la racine.
 */
export function HierarchyAdmin() {
  const departments = useQuery(api.workspace.listDepartments);
  const createDepartment = useMutation(api.workspace.createDepartment);
  const updateDepartment = useMutation(api.workspace.updateDepartment);
  const moveDepartment = useMutation(api.workspace.moveDepartment);
  const setDepartmentActive = useMutation(api.workspace.setDepartmentActive);
  const seedMndptTree = useMutation(api.entities.seedMndptTree);
  const repairOrphans = useMutation(api.workspace.repairDepartmentOrphans);

  const [selectedId, setSelectedId] = useState<Id<"departments"> | null>(null);
  const [movingId, setMovingId] = useState<Id<"departments"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<Id<"departments"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const rows: DeptRow[] = useMemo(() => {
    if (!departments) return [];
    return departments.map((d) => ({
      _id: d._id,
      name: d.name,
      code: d.code ?? null,
      kind: d.kind ?? null,
      parentId: d.parentId ?? null,
      active: d.active !== false,
    }));
  }, [departments]);

  const idSet = useMemo(
    () => new Set(rows.map((r) => String(r._id))),
    [rows],
  );

  const byParent = useMemo(() => {
    const map = new Map<string | "root", DeptRow[]>();
    for (const r of rows) {
      // Parent manquant → racine (évite nœuds invisibles)
      const parentOk =
        r.parentId && idSet.has(String(r.parentId))
          ? String(r.parentId)
          : "root";
      const list = map.get(parentOk) ?? [];
      list.push(r);
      map.set(parentOk, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        (a.code ?? a.name).localeCompare(b.code ?? b.name, "fr"),
      );
    }
    return map;
  }, [rows, idSet]);

  const selected = rows.find((r) => r._id === selectedId) ?? null;

  const pathOf = (id: Id<"departments"> | null): string => {
    if (!id) return "MNDPT";
    const codes: string[] = [];
    let cur: Id<"departments"> | null = id;
    let guard = 0;
    const byId = new Map(rows.map((r) => [String(r._id), r]));
    while (cur && guard < 12) {
      guard += 1;
      const n = byId.get(String(cur));
      if (!n) break;
      if (n.code) codes.unshift(n.code);
      else codes.unshift(n.name.slice(0, 12));
      cur = n.parentId && idSet.has(String(n.parentId)) ? n.parentId : null;
    }
    return codes.length ? `MNDPT/${codes.join("/")}` : "MNDPT";
  };

  const addChild = async (parent: DeptRow | null) => {
    const label = window.prompt(
      parent
        ? `Nom sous « ${parent.code ?? parent.name} » :`
        : "Nom de la structure racine :",
      parent ? "Nouveau service" : "Nouvelle direction",
    );
    if (!label?.trim()) return;
    const code = window.prompt("Code (sigle, optionnel) — ex. DTD :", "") ?? "";
    setBusy(true);
    try {
      const id = await createDepartment({
        name: label.trim(),
        code: code.trim() || undefined,
        kind: parent
          ? parent.kind === "direction" || parent.kind === "sg"
            ? "direction"
            : "service"
          : "direction",
        parentId: parent?._id,
      });
      setSelectedId(id);
      if (parent) {
        setCollapsed((c) => ({ ...c, [String(parent._id)]: false }));
      }
      toast.success("Structure créée.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  };

  const startMove = () => {
    if (!selectedId) {
      toast.message("Sélectionnez d'abord une ligne.");
      return;
    }
    setMovingId(selectedId);
    toast.message("Cliquez la structure parente cible, ou « Racine ».");
  };

  const finishMove = async (newParentId: Id<"departments"> | null) => {
    if (!movingId) return;
    if (newParentId === movingId) {
      toast.error("Impossible de se rattacher à soi-même.");
      return;
    }
    setBusy(true);
    try {
      await moveDepartment({
        departmentId: movingId,
        parentId: newParentId ?? undefined,
      });
      toast.success("Hiérarchie mise à jour.");
      setSelectedId(movingId);
      setMovingId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du déplacement");
    } finally {
      setBusy(false);
    }
  };

  const onRowClick = (r: DeptRow) => {
    if (movingId) {
      void finishMove(r._id);
      return;
    }
    setSelectedId(r._id);
  };

  const saveRename = async () => {
    if (!editingId || !editName.trim()) return;
    setBusy(true);
    try {
      await updateDepartment({
        departmentId: editingId,
        name: editName.trim(),
        code: editCode.trim() || undefined,
      });
      setEditingId(null);
      toast.success("Modifié.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await setDepartmentActive({
        departmentId: selected._id,
        active: !selected.active,
      });
      toast.success(selected.active ? "Masqué à l'envoi." : "Réactivé.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  };

  const runSeed = async () => {
    if (
      !window.confirm(
        "Réinstaller l'arbre officiel MNDPT (codes + parents) ? Les structures existantes seront mises à jour par code.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await seedMndptTree({});
      toast.success(
        `Arbre MNDPT installé (${typeof r === "object" && r && "count" in r ? (r as { count: number }).count : "ok"}).`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du seed");
    } finally {
      setBusy(false);
    }
  };

  const runRepair = async () => {
    setBusy(true);
    try {
      const r = await repairOrphans({});
      toast.success(
        r && typeof r === "object" && "fixed" in r
          ? `${(r as { fixed: number }).fixed} structure(s) orpheline(s) placée(s) à la racine.`
          : "Réparation terminée.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  };

  const renderRows = (parentKey: string | "root", depth: number) => {
    const children = byParent.get(parentKey) ?? [];
    return children.map((r) => {
      const kids = byParent.get(String(r._id)) ?? [];
      const hasKids = kids.length > 0;
      const isOpen = !collapsed[String(r._id)];
      const isSel = selectedId === r._id;
      const isMoving = movingId === r._id;
      const isDrop = Boolean(movingId) && movingId !== r._id;

      return (
        <div key={r._id}>
          <div
            className={cn(
              "flex items-center gap-1 rounded-sm border px-1.5 py-1.5 text-sm transition-colors",
              isSel && !movingId && "border-brand bg-brand-soft",
              isMoving && "border-dashed border-amber-600 bg-amber-50",
              isDrop && "border-emerald-500 hover:bg-emerald-50",
              !isSel && !isMoving && !isDrop && "border-transparent hover:bg-muted/50",
              !r.active && "opacity-45",
            )}
            style={{ paddingLeft: 8 + depth * 16 }}
          >
            <button
              type="button"
              className="size-6 shrink-0 text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                if (!hasKids) return;
                setCollapsed((c) => ({
                  ...c,
                  [String(r._id)]: !c[String(r._id)],
                }));
              }}
            >
              {hasKids ? (
                isOpen ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )
              ) : (
                <span className="inline-block size-4" />
              )}
            </button>
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => onRowClick(r)}
              onDoubleClick={() => {
                setEditingId(r._id);
                setEditName(r.name);
                setEditCode(r.code ?? "");
              }}
            >
              {editingId === r._id ? (
                <span
                  className="flex flex-wrap items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Input
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                    className="h-7 w-16 font-mono text-xs"
                    placeholder="Code"
                  />
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-7 min-w-[8rem] flex-1 text-xs"
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() => void saveRename()}
                  >
                    OK
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setEditingId(null)}
                  >
                    Annuler
                  </Button>
                </span>
              ) : (
                <>
                  <span className="font-mono text-xs font-bold text-brand">
                    {r.code ?? "—"}
                  </span>
                  <span className="ml-1.5 font-medium">{r.name}</span>
                  {r.kind ? (
                    <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                      {r.kind}
                    </span>
                  ) : null}
                </>
              )}
            </button>
            <button
              type="button"
              className="shrink-0 rounded p-1 text-brand hover:bg-brand-soft"
              title="Ajouter un enfant"
              onClick={(e) => {
                e.stopPropagation();
                void addChild(r);
              }}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {hasKids && isOpen ? renderRows(String(r._id), depth + 1) : null}
        </div>
      );
    });
  };

  if (departments === undefined) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-sm border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Hiérarchie des structures</h3>
          <p className="text-[11px] text-muted-foreground">
            Clic = sélection · Double-clic = renommer · + = créer dessous ·
            Déplacer = rattacher à un parent
          </p>
        </div>
        {busy ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={busy}
          onClick={() => void addChild(null)}
        >
          <Plus className="size-4" />
          Racine
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={busy || !selected}
          onClick={() => void addChild(selected)}
        >
          <Plus className="size-4" />
          Sous la sélection
        </Button>
        <Button
          type="button"
          size="sm"
          variant={movingId ? "default" : "outline"}
          className="gap-1.5"
          disabled={busy || !selected}
          onClick={startMove}
        >
          <Move className="size-4" />
          Déplacer
        </Button>
        {movingId ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void finishMove(null)}
            >
              Mettre à la racine
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMovingId(null)}
            >
              <X className="size-4" />
            </Button>
          </>
        ) : null}
        {selected && !movingId ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void toggleActive()}
          >
            {selected.active ? "Masquer" : "Réactiver"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void runSeed()}
        >
          Installer arbre MNDPT
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void runRepair()}
        >
          Réparer orphelins
        </Button>
      </div>

      {movingId ? (
        <p className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Mode déplacement : cliquez la ligne <strong>parente</strong>, ou
          « Mettre à la racine ».
        </p>
      ) : null}

      {selected ? (
        <p className="rounded-sm border border-border bg-muted/30 px-3 py-2 font-mono text-[11px]">
          Chemin N° : {pathOf(selected._id)}
        </p>
      ) : null}

      <div className="max-h-[min(70vh,480px)] overflow-auto rounded-md border border-border bg-background p-2">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Aucune structure — cliquez « Installer arbre MNDPT » ou « Racine ».
          </p>
        ) : (
          renderRows("root", 0)
        )}
      </div>
    </div>
  );
}
