import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ALL_TEMPLATES,
  createDocFromTemplate,
  createEmptyDoc,
  renderDocHtml,
  type FreeLetterDoc,
  type LetterBlock,
  type LetterTemplate,
} from "@/lib/letterEditor";
import { cn } from "@/lib/utils";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  ChevronUp,
  Download,
  FilePlus2,
  Heading,
  ImagePlus,
  LayoutTemplate,
  Minus,
  Plus,
  Printer,
  Space,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Lecture impossible"));
    r.readAsDataURL(file);
  });
}

function uid() {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Éditeur libre type CV.fr :
 * - choisir / insérer un modèle
 * - modifier librement chaque bloc
 * - ajouter, supprimer, réordonner
 * Aucune structure imposée après insertion.
 */
export function LetterWorkspace() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<FreeLetterDoc>(() => createEmptyDoc());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.92);
  const [showTemplates, setShowTemplates] = useState(true);

  const selected = doc.blocks.find((b) => b.id === selectedId) ?? null;

  const updateBlock = useCallback((id: string, patch: Partial<LetterBlock>) => {
    setDoc((d) => ({
      ...d,
      updatedAt: Date.now(),
      blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }, []);

  const insertTemplate = (tpl: LetterTemplate) => {
    const next = createDocFromTemplate(tpl);
    setDoc(next);
    setSelectedId(next.blocks[0]?.id ?? null);
    setShowTemplates(false);
    toast.success(`Modèle « ${tpl.name} » inséré — modifiable librement`);
  };

  const addBlock = (type: LetterBlock["type"]) => {
    const block: LetterBlock = {
      id: uid(),
      type,
      content:
        type === "heading"
          ? "Nouveau titre"
          : type === "paragraph"
            ? "Nouveau paragraphe"
            : type === "image"
              ? ""
              : "",
      align: "left",
      level: type === "heading" ? 2 : undefined,
    };
    setDoc((d) => {
      const idx = selectedId
        ? d.blocks.findIndex((b) => b.id === selectedId)
        : d.blocks.length - 1;
      const at = idx >= 0 ? idx + 1 : d.blocks.length;
      const blocks = [...d.blocks];
      blocks.splice(at, 0, block);
      return { ...d, blocks, updatedAt: Date.now() };
    });
    setSelectedId(block.id);
    if (type === "image") {
      window.setTimeout(() => fileRef.current?.click(), 50);
    }
  };

  const removeBlock = (id: string) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.filter((b) => b.id !== id),
      updatedAt: Date.now(),
    }));
    if (selectedId === id) setSelectedId(null);
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    setDoc((d) => {
      const i = d.blocks.findIndex((b) => b.id === id);
      if (i < 0) return d;
      const j = i + dir;
      if (j < 0 || j >= d.blocks.length) return d;
      const blocks = [...d.blocks];
      [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
      return { ...d, blocks, updatedAt: Date.now() };
    });
  };

  const onImageFile = async (file: File | null) => {
    if (!file || !selectedId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez une image");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Max 4 Mo");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateBlock(selectedId, { type: "image", content: dataUrl });
      toast.success("Image ajoutée");
    } catch {
      toast.error("Impossible de charger l'image");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openPrint = () => {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Autorisez les pop-ups");
      return;
    }
    w.document.write(renderDocHtml(doc));
    w.document.close();
  };

  const exportHtml = () => {
    downloadBlob(
      `courrier-${Date.now()}.html`,
      renderDocHtml(doc),
      "text/html;charset=utf-8",
    );
    toast.success("Document exporté");
  };

  return (
    <div className="flex h-[calc(100vh-5.5rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-border bg-muted/20 shadow-sm">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onImageFile(e.target.files?.[0] ?? null)}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="mr-1 flex min-w-0 items-center gap-2">
          <LayoutTemplate className="size-5 shrink-0 text-brand" />
          <div className="min-w-0">
            <Input
              value={doc.title}
              onChange={(e) =>
                setDoc((d) => ({ ...d, title: e.target.value, updatedAt: Date.now() }))
              }
              className="h-8 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-0"
            />
            <p className="px-1 text-[10px] text-muted-foreground">
              Éditeur libre — insérez un modèle puis modifiez tout
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant={showTemplates ? "default" : "outline"}
          onClick={() => setShowTemplates((v) => !v)}
        >
          <FilePlus2 className="mr-1.5 size-3.5" />
          Modèles
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => addBlock("paragraph")}>
          <Type className="mr-1.5 size-3.5" />
          Texte
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => addBlock("heading")}>
          <Heading className="mr-1.5 size-3.5" />
          Titre
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => addBlock("image")}>
          <ImagePlus className="mr-1.5 size-3.5" />
          Image
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => addBlock("divider")}>
          <Minus className="mr-1.5 size-3.5" />
          Ligne
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => addBlock("spacer")}>
          <Space className="mr-1.5 size-3.5" />
          Espace
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.08))}
          >
            <ZoomOut className="size-4" />
          </Button>
          <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => setZoom((z) => Math.min(1.25, z + 0.08))}
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={openPrint}>
            <Printer className="mr-1.5 size-3.5" />
            PDF
          </Button>
          <Button type="button" size="sm" onClick={exportHtml}>
            <Download className="mr-1.5 size-3.5" />
            Export
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Galerie modèles OU liste des blocs */}
        <aside className="flex w-full shrink-0 flex-col border-b border-border bg-card lg:w-[240px] lg:border-b-0 lg:border-r">
          {showTemplates ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Insérer un modèle
              </p>
              <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                Choisissez une trame de départ. Ensuite, chaque élément est librement
                modifiable, déplaçable ou supprimable.
              </p>
              <div className="space-y-2">
                {ALL_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => insertTemplate(tpl)}
                    className="w-full rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-brand/50 hover:bg-brand-soft/30"
                  >
                    <p className="text-sm font-semibold text-foreground">{tpl.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {tpl.description}
                    </p>
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setShowTemplates(false)}
              >
                Fermer les modèles
              </Button>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Blocs ({doc.blocks.length})
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px]"
                  onClick={() => setShowTemplates(true)}
                >
                  + Modèle
                </Button>
              </div>
              <ul className="space-y-1">
                {doc.blocks.map((b, i) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(b.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                        selectedId === b.id
                          ? "bg-brand text-primary-foreground"
                          : "hover:bg-muted",
                      )}
                    >
                      <span className="w-4 shrink-0 tabular-nums opacity-60">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {b.type === "heading"
                          ? "Titre"
                          : b.type === "paragraph"
                            ? "Texte"
                            : b.type === "image"
                              ? "Image"
                              : b.type === "divider"
                                ? "Ligne"
                                : "Espace"}
                        {b.content && b.type !== "divider" && b.type !== "spacer"
                          ? ` — ${b.content.slice(0, 28)}`
                          : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 w-full gap-1"
                onClick={() => addBlock("paragraph")}
              >
                <Plus className="size-3.5" />
                Ajouter un bloc
              </Button>
            </div>
          )}
        </aside>

        {/* Aperçu A4 */}
        <div
          className="min-h-0 flex-1 overflow-auto bg-[#e8edf3] p-4 md:p-8"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="mx-auto origin-top transition-transform"
            style={{
              width: 680,
              transform: `scale(${zoom})`,
              marginBottom: `${Math.max(0, (zoom - 1) * 200)}px`,
            }}
          >
            <div
              className="relative min-h-[960px] bg-white px-10 py-9 shadow-xl shadow-slate-500/20"
              onClick={(e) => e.stopPropagation()}
            >
              {doc.blocks.length === 0 ? (
                <p className="py-20 text-center text-sm text-muted-foreground">
                  Document vide — insérez un modèle ou ajoutez un bloc.
                </p>
              ) : (
                doc.blocks.map((b) => {
                  const active = selectedId === b.id;
                  if (b.type === "divider") {
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedId(b.id)}
                        className={cn(
                          "my-3 w-full border-0 border-t-2 border-slate-300 py-2",
                          active && "ring-2 ring-brand ring-offset-2",
                        )}
                      />
                    );
                  }
                  if (b.type === "spacer") {
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedId(b.id)}
                        className={cn(
                          "my-1 flex h-8 w-full items-center justify-center border border-dashed border-transparent text-[10px] text-muted-foreground hover:border-border",
                          active && "border-brand ring-2 ring-brand ring-offset-1",
                        )}
                      >
                        {active ? "Espace" : ""}
                      </button>
                    );
                  }
                  if (b.type === "image") {
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedId(b.id)}
                        className={cn(
                          "my-2 flex w-full justify-center rounded-sm p-1",
                          active && "ring-2 ring-brand ring-offset-1",
                        )}
                        style={{ textAlign: b.align || "center" }}
                      >
                        {b.content ? (
                          <img
                            src={b.content}
                            alt=""
                            className="max-h-40 max-w-full object-contain"
                          />
                        ) : (
                          <span className="flex h-24 w-full items-center justify-center border border-dashed border-slate-300 text-xs text-slate-400">
                            Cliquez pour choisir une image
                          </span>
                        )}
                      </button>
                    );
                  }
                  const isH = b.type === "heading";
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedId(b.id)}
                      className={cn(
                        "my-1 w-full rounded-sm px-1 py-0.5 text-left transition-shadow",
                        active && "bg-brand-soft/40 ring-2 ring-brand ring-offset-1",
                        !active && "hover:bg-slate-50",
                      )}
                      style={{ textAlign: b.align || "left" }}
                    >
                      <span
                        className={cn(
                          "block whitespace-pre-wrap font-serif text-slate-900",
                          isH && "font-bold",
                          isH && b.level === 1 && "text-lg",
                          isH && b.level === 2 && "text-[15px]",
                          isH && (b.level === 3 || !b.level) && "text-[13px]",
                          !isH && "text-[12.5px] leading-relaxed",
                        )}
                      >
                        {b.content || (
                          <span className="italic text-slate-400">Zone vide</span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Panneau édition du bloc sélectionné */}
        <aside className="flex w-full shrink-0 flex-col border-t border-border bg-card lg:w-[300px] lg:border-l lg:border-t-0">
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-xs font-semibold">Édition du bloc</p>
            <p className="text-[10px] text-muted-foreground">
              {selected
                ? "Modifiez le contenu librement"
                : "Sélectionnez un élément sur le document"}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!selected ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Cliquez un bloc sur l&apos;aperçu ou dans la liste. Utilisez{" "}
                <strong>Modèles</strong> pour partir d&apos;une trame, puis adaptez
                chaque zone.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-8"
                    onClick={() => moveBlock(selected.id, -1)}
                    title="Monter"
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-8"
                    onClick={() => moveBlock(selected.id, 1)}
                    title="Descendre"
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-8"
                    onClick={() => updateBlock(selected.id, { align: "left" })}
                    title="Gauche"
                  >
                    <AlignLeft className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-8"
                    onClick={() => updateBlock(selected.id, { align: "center" })}
                    title="Centre"
                  >
                    <AlignCenter className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-8"
                    onClick={() => updateBlock(selected.id, { align: "right" })}
                    title="Droite"
                  >
                    <AlignRight className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-8 text-destructive"
                    onClick={() => removeBlock(selected.id)}
                    title="Supprimer"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                {selected.type === "heading" || selected.type === "paragraph" ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Contenu</Label>
                    <Textarea
                      rows={selected.type === "paragraph" ? 10 : 4}
                      value={selected.content}
                      onChange={(e) =>
                        updateBlock(selected.id, { content: e.target.value })
                      }
                      className="text-sm"
                    />
                  </div>
                ) : null}

                {selected.type === "heading" ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Niveau de titre</Label>
                    <div className="flex gap-1">
                      {([1, 2, 3] as const).map((lv) => (
                        <Button
                          key={lv}
                          type="button"
                          size="sm"
                          variant={selected.level === lv ? "default" : "outline"}
                          onClick={() => updateBlock(selected.id, { level: lv })}
                        >
                          H{lv}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selected.type === "image" ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Image</Label>
                    {selected.content ? (
                      <img
                        src={selected.content}
                        alt=""
                        className="max-h-28 rounded border object-contain"
                      />
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      onClick={() => fileRef.current?.click()}
                    >
                      <ImagePlus className="mr-1.5 size-3.5" />
                      Choisir une image
                    </Button>
                  </div>
                ) : null}

                {(selected.type === "divider" || selected.type === "spacer") && (
                  <p className="text-xs text-muted-foreground">
                    {selected.type === "divider"
                      ? "Ligne de séparation — utilisez les flèches pour la déplacer."
                      : "Espace vertical — utilisez les flèches pour le déplacer."}
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
