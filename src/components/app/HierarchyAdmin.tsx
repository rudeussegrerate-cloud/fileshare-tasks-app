import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Save,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const KINDS = [
  { value: "direction", label: "Direction" },
  { value: "service", label: "Service" },
  { value: "sg", label: "Secrétariat général" },
  { value: "cabinet", label: "Cabinet" },
  { value: "organisme", label: "Organisme" },
  { value: "interregion", label: "Interrégion" },
  { value: "cellule", label: "Cellule" },
  { value: "autre", label: "Autre" },
] as const;

type Kind = (typeof KINDS)[number]["value"];

type DeptRow = {
  _id: Id<"departments">;
  name: string;
  code: string | null;
  kind: string | null;
  parentId: Id<"departments"> | null;
  active: boolean;
  childCount: number;
};

/**
 * Gestion hiérarchique MNDPT — réservée au DG.
 * Arbre + créer / modifier / déplacer / activer-désactiver.
 */
export function HierarchyAdmin() {
  const departments = useQuery(api.workspace.listDepartments);
  const createDepartment = useMutation(api.workspace.createDepartment);
  const updateDepartment = useMutation(api.workspace.updateDepartment);
  const moveDepartment = useMutation(api.workspace.moveDepartment);
  const setDepartmentActive = useMutation(api.workspace.setDepartmentActive);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<Id<"departments"> | null>(null);
  const [busy, setBusy] = useState(false);

  // Formulaire édition / création
  const [mode, setMode] = useState<"edit" | "create">("edit");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<Kind>("direction");
  const [parentId, setParentId] = useState<string>("");
  const [description, setDescription] = useState("");

  const rows: DeptRow[] = useMemo(() => {
    if (!departments) return [];
    return departments.map((d) => ({
      _id: d._id,
      name: d.name,
      code: d.code ?? null,
      kind: d.kind ?? null,
      parentId: d.parentId ?? null,
      active: d.active !== false,
      childCount: d.childCount ?? 0,
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

  const loadEdit = (r: DeptRow) => {
    setMode("edit");
    setSelectedId(r._id);
    setName(r.name);
    setCode(r.code ?? "");
    setKind((r.kind as Kind) || "direction");
    setParentId(r.parentId ? String(r.parentId) : "");
    setDescription("");
  };

  const startCreate = (under?: DeptRow | null) => {
    setMode("create");
    setSelectedId(null);
    setName("");
    setCode("");
    setKind(under ? "service" : "direction");
    setParentId(under ? String(under._id) : "");
    setDescription("");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Le nom est obligatoire.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        await createDepartment({
          name: name.trim(),
          code: code.trim() || undefined,
          kind,
          parentId: parentId
            ? (parentId as Id<"departments">)
            : undefined,
          description: description.trim() || undefined,
        });
        toast.success("Structure créée.");
        startCreate(
          parentId
            ? rows.find((r) => String(r._id) === parentId) ?? null
            : null,
        );
      } else if (selectedId) {
        await updateDepartment({
          departmentId: selectedId,
          name: name.trim(),
          code: code.trim() || undefined,
          kind,
          description: description.trim() || undefined,
        });
        const nextParent = parentId
          ? (parentId as Id<"departments">)
          : undefined;
        const currentParent = selected?.parentId ?? undefined;
        if (String(nextParent ?? "") !== String(currentParent ?? "")) {
          await moveDepartment({
            departmentId: selectedId,
            parentId: nextParent,
          });
        }
        toast.success("Structure mise à jour.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (r: DeptRow) => {
    setBusy(true);
    try {
      await setDepartmentActive({
        departmentId: r._id,
        active: !r.active,
      });
      toast.success(r.active ? "Structure désactivée." : "Structure activée.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  };

  const renderTree = (parentKey: string | "root", depth: number) => {
    const children = byParent.get(parentKey) ?? [];
    if (children.length === 0) return null;
    return (
      <ul className={cn(depth > 0 && "ml-3 border-l border-border pl-2")}>
        {children.map((r) => {
          const hasKids = (byParent.get(String(r._id)) ?? []).length > 0;
          const isOpen = expanded[String(r._id)] ?? depth < 2;
          const isSel = selectedId === r._id;
          return (
            <li key={r._id} className="py-0.5">
              <div
                className={cn(
                  "flex items-center gap-1 rounded-sm px-1.5 py-1 text-sm",
                  isSel && "bg-brand-soft",
                  !r.active && "opacity-50",
                )}
              >
                <button
                  type="button"
                  className="size-6 shrink-0 text-muted-foreground"
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [String(r._id)]: !isOpen,
                    }))
                  }
                  aria-label={isOpen ? "Replier" : "Déplier"}
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
                  onClick={() => loadEdit(r)}
                >
                  <span className="font-medium">
                    {r.code ? `${r.code} — ` : ""}
                    {r.name}
                  </span>
                  <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                    {r.kind ?? ""}
                  </span>
                </button>
                <button
                  type="button"
                  className="shrink-0 text-[10px] text-brand"
                  title="Ajouter un enfant"
                  onClick={() => startCreate(r)}
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              {hasKids && isOpen ? renderTree(String(r._id), depth + 1) : null}
            </li>
          );
        })}
      </ul>
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
    <div className="space-y-4 rounded-sm border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Hiérarchie organisationnelle</h3>
          <p className="text-xs text-muted-foreground">
            Classement des directions et services (N° de courrier). Réservé au
            DG.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => startCreate(null)}
        >
          <Plus className="size-4" />
          Racine
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="max-h-80 overflow-y-auto rounded-sm border border-border p-2">
          {rows.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              Aucune structure. Utilisez « Installer arbre MNDPT » ou créez une
              racine.
            </p>
          ) : (
            renderTree("root", 0)
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {mode === "create" ? "Nouvelle structure" : "Modifier la structure"}
          </p>
          <div className="space-y-1.5">
            <Label>Nom *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="font-mono"
                placeholder="DTD"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select
                className="flex h-10 w-full rounded-sm border border-input bg-background px-3 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Rattaché à (parent)</Label>
            <select
              className="flex h-10 w-full rounded-sm border border-input bg-background px-3 text-sm"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">— Aucun (niveau racine) —</option>
              {rows
                .filter((r) => r._id !== selectedId)
                .map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.code ? `${r.code} — ` : ""}
                    {r.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Enregistrer
            </Button>
            {mode === "edit" && selected ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void toggleActive(selected)}
              >
                {selected.active ? "Désactiver" : "Réactiver"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
