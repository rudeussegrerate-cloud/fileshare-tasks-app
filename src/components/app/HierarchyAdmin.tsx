import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Move, Plus, X } from "lucide-react";
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
 * Organigramme cliquable (style schéma UML simplifié).
 * DG : sélectionner · créer sous · déplacer · renommer.
 */
export function HierarchyAdmin() {
  const departments = useQuery(api.workspace.listDepartments);
  const createDepartment = useMutation(api.workspace.createDepartment);
  const updateDepartment = useMutation(api.workspace.updateDepartment);
  const moveDepartment = useMutation(api.workspace.moveDepartment);
  const setDepartmentActive = useMutation(api.workspace.setDepartmentActive);

  const [selectedId, setSelectedId] = useState<Id<"departments"> | null>(null);
  /** Mode déplacement : cliquer la cible (nouveau parent) */
  const [movingId, setMovingId] = useState<Id<"departments"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<Id<"departments"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");

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

  const byParent = useMemo(() => {
    const map = new Map<string | "root", DeptRow[]>();
    for (const r of rows) {
      const key = r.parentId ? String(r.parentId) : "root";
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        (a.code ?? a.name).localeCompare(b.code ?? b.name, "fr"),
      );
    }
    return map;
  }, [rows]);

  const selected = rows.find((r) => r._id === selectedId) ?? null;

  const addChild = async (parent: DeptRow | null) => {
    const label = window.prompt(
      parent
        ? `Nom du service / direction sous « ${parent.code ?? parent.name} » :`
        : "Nom de la structure racine :",
      parent ? "Nouveau service" : "Nouvelle direction",
    );
    if (!label?.trim()) return;
    const code = window.prompt(
      "Code (sigle, optionnel) — ex. DTD, DAF :",
      "",
    );
    setBusy(true);
    try {
      const id = await createDepartment({
        name: label.trim(),
        code: code?.trim() || undefined,
        kind: parent ? "service" : "direction",
        parentId: parent?._id,
      });
      setSelectedId(id);
      toast.success("Créé.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  };

  const startMove = () => {
    if (!selectedId) {
      toast.message("Cliquez d'abord une case, puis « Déplacer ».");
      return;
    }
    setMovingId(selectedId);
    toast.message("Cliquez la case qui devient le nouveau parent (ou « Racine »).");
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
      toast.success("Déplacé.");
      setMovingId(null);
      setSelectedId(movingId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du déplacement");
    } finally {
      setBusy(false);
    }
  };

  const onNodeClick = (r: DeptRow) => {
    if (movingId) {
      void finishMove(r._id);
      return;
    }
    setSelectedId(r._id);
  };

  const startRename = (r: DeptRow) => {
    setEditingId(r._id);
    setEditName(r.name);
    setEditCode(r.code ?? "");
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

  /** Une « case » style UML */
  const NodeBox = ({ r }: { r: DeptRow }) => {
    const isSel = selectedId === r._id;
    const isMoving = movingId === r._id;
    const isDropTarget = Boolean(movingId) && movingId !== r._id;

    if (editingId === r._id) {
      return (
        <div className="mx-auto w-[min(100%,200px)] space-y-1 rounded-md border-2 border-brand bg-card p-2 shadow-sm">
          <Input
            value={editCode}
            onChange={(e) => setEditCode(e.target.value.toUpperCase())}
            placeholder="Code"
            className="h-8 font-mono text-xs"
          />
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Nom"
            className="h-8 text-xs"
            autoFocus
          />
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              className="h-7 flex-1 text-xs"
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
          </div>
        </div>
      );
    }

    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onNodeClick(r)}
        onDoubleClick={() => startRename(r)}
        className={cn(
          "mx-auto block w-[min(100%,200px)] rounded-md border-2 px-3 py-2 text-center transition-all",
          "bg-card shadow-sm hover:shadow-md",
          isSel && !movingId && "border-brand bg-brand-soft ring-2 ring-brand/30",
          isMoving && "border-dashed border-amber-600 bg-amber-50 opacity-80",
          isDropTarget && "border-emerald-500 hover:bg-emerald-50",
          !r.active && "opacity-40",
          !isSel && !isMoving && !isDropTarget && "border-slate-300",
        )}
      >
        {r.code ? (
          <span className="block font-mono text-[11px] font-bold tracking-wide text-brand">
            {r.code}
          </span>
        ) : null}
        <span className="block text-xs font-semibold leading-tight text-foreground">
          {r.name}
        </span>
        {r.kind ? (
          <span className="mt-0.5 block text-[9px] uppercase text-muted-foreground">
            {r.kind}
          </span>
        ) : null}
      </button>
    );
  };

  const renderBranch = (parentKey: string | "root") => {
    const children = byParent.get(parentKey) ?? [];
    if (children.length === 0) return null;

    return (
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-6">
        {children.map((r) => {
          const kids = byParent.get(String(r._id)) ?? [];
          return (
            <div key={r._id} className="flex min-w-[140px] flex-col items-center">
              <NodeBox r={r} />
              {kids.length > 0 ? (
                <>
                  {/* Trait vertical */}
                  <div className="h-4 w-px bg-slate-400" />
                  {/* Ligne horizontale sous les enfants */}
                  <div className="relative flex w-full justify-center">
                    {kids.length > 1 ? (
                      <div className="absolute top-0 left-[10%] right-[10%] h-px bg-slate-400" />
                    ) : null}
                  </div>
                  <div className="pt-0">{renderBranch(String(r._id))}</div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  if (departments === undefined) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-sm border border-border bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Organigramme</h3>
          <p className="text-[11px] text-muted-foreground">
            Clic = sélectionner · Double-clic = renommer · Boutons ci-dessous
          </p>
        </div>
        {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {/* Barre d'actions simple */}
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
              Annuler
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
      </div>

      {movingId ? (
        <p className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Mode déplacement : cliquez la case <strong>parente</strong> cible, ou
          « Mettre à la racine ».
        </p>
      ) : null}

      {/* Canevas organigramme */}
      <div className="max-h-[min(70vh,520px)] overflow-auto rounded-md border border-slate-200 bg-white p-4">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Vide — cliquez « Racine » ou « Installer arbre MNDPT ».
          </p>
        ) : (
          <div className="min-w-max pb-4 pt-2">{renderBranch("root")}</div>
        )}
      </div>

      {selected && !movingId ? (
        <p className="text-[11px] text-muted-foreground">
          Sélection :{" "}
          <strong>
            {selected.code ? `${selected.code} — ` : ""}
            {selected.name}
          </strong>
          {" · "}
          double-clic pour renommer
        </p>
      ) : null}
    </div>
  );
}
