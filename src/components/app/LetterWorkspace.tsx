import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import {
  LETTER_VARIABLE_META,
  MNDPT_FIXED,
  type BlankLetterModel,
  type CanvasExtraElement,
  type LetterVariableKey,
  createBlankMndptLetter,
  formatOutgoingRef,
  renderMndptLetterHtml,
} from "@/lib/mndptLetterTemplate";
import { cn } from "@/lib/utils";
import { useAction } from "convex/react";
import {
  Download,
  FilePlus2,
  ImagePlus,
  Loader2,
  Plus,
  Printer,
  Sparkles,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Selectable = LetterVariableKey | "logo" | "seal" | "extra_image" | string | null;

const INTENTS = [
  "Accusé de réception",
  "Demande de complément d'information",
  "Transmission pour suite à donner",
  "Acceptation",
  "Refus",
  "Information / notification",
];

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
    r.onerror = () => reject(new Error("Lecture fichier impossible"));
    r.readAsDataURL(file);
  });
}

/** Zone à compléter (style « rouge » du modèle papier) */
function FillSlot({
  selected,
  empty,
  label,
  onSelect,
  className,
  children,
}: {
  selected: boolean;
  empty?: boolean;
  label: string;
  onSelect: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={cn(
        "group relative w-full rounded-sm text-left transition-all",
        empty
          ? "border border-dashed border-red-400/90 bg-red-50/50 hover:border-red-500 hover:bg-red-50"
          : "border border-transparent hover:border-red-200 hover:bg-red-50/30",
        selected && "ring-2 ring-red-500 ring-offset-1",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute -top-2 left-1 z-[1] rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
          selected && "opacity-100",
        )}
      >
        {label}
      </span>
      {children}
    </button>
  );
}

function FixedBlock({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative rounded-sm border border-transparent bg-slate-50/60",
        className,
      )}
      title="Élément fixe du modèle — généré automatiquement"
    >
      <span className="pointer-events-none absolute right-1 top-0.5 rounded bg-slate-200 px-1 text-[8px] font-medium uppercase text-slate-600">
        Auto
      </span>
      {children}
    </div>
  );
}

export function LetterWorkspace() {
  const extractFields = useAction(api.letterAssistant.extractFields);
  const generateDraft = useAction(api.letterAssistant.generateDraft);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<
    "logo" | "seal" | "extra_image" | "extra_el" | null
  >(null);
  const [extraElId, setExtraElId] = useState<string | null>(null);

  const [model, setModel] = useState<BlankLetterModel>(() =>
    createBlankMndptLetter(),
  );
  const [selected, setSelected] = useState<Selectable>(null);
  const [zoom, setZoom] = useState(0.88);
  const [panel, setPanel] = useState<"edit" | "ai" | "media" | "export">("edit");
  const [sourceText, setSourceText] = useState("");
  const [intent, setIntent] = useState(INTENTS[0]!);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);

  const v = model.variables;

  const setVar = useCallback((key: LetterVariableKey, value: string) => {
    setModel((m) => ({
      ...m,
      variables: { ...m.variables, [key]: value },
    }));
  }, []);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!v.location_date.trim()) m.push("Date");
    if (!v.sender_title.trim()) m.push("Émetteur");
    if (!v.recipient_block.trim()) m.push("Destinataire");
    if (!v.subject.trim()) m.push("Objet");
    if (!v.body.trim() || v.body.includes("[À COMPLÉTER")) m.push("Corps");
    return m;
  }, [v]);

  const newBlank = () => {
    setModel(createBlankMndptLetter());
    setSelected(null);
    setSourceText("");
    toast.success("Modèle vierge officiel MNDPT");
  };

  const pickImage = (target: typeof uploadTarget, elId?: string) => {
    setUploadTarget(target);
    setExtraElId(elId ?? null);
    fileRef.current?.click();
  };

  const onFile = async (file: File | null) => {
    if (!file || !uploadTarget) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez une image (PNG, JPG…).");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Image trop lourde (max 4 Mo).");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (uploadTarget === "logo") {
        setModel((m) => ({
          ...m,
          assets: { ...m.assets, logoUrl: dataUrl },
        }));
        toast.success("Logo MNDPT mis à jour");
      } else if (uploadTarget === "seal") {
        setModel((m) => ({
          ...m,
          assets: { ...m.assets, sealUrl: dataUrl },
        }));
        toast.success("Emblème mis à jour");
      } else if (uploadTarget === "extra_image") {
        setModel((m) => ({
          ...m,
          assets: { ...m.assets, extraImageUrl: dataUrl },
        }));
        toast.success("Image ajoutée");
      } else if (uploadTarget === "extra_el" && extraElId) {
        setModel((m) => ({
          ...m,
          extras: m.extras.map((el) =>
            el.id === extraElId
              ? { ...el, type: "image", content: dataUrl }
              : el,
          ),
        }));
        toast.success("Élément image mis à jour");
      }
    } catch {
      toast.error("Impossible de charger l'image");
    } finally {
      setUploadTarget(null);
      setExtraElId(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addTextElement = () => {
    const id = `el-${Date.now()}`;
    const el: CanvasExtraElement = {
      id,
      type: "text",
      label: "Texte",
      content: "Nouveau texte",
    };
    setModel((m) => ({ ...m, extras: [...m.extras, el] }));
    setSelected(id);
    setPanel("edit");
  };

  const addImageElement = () => {
    const id = `el-${Date.now()}`;
    const el: CanvasExtraElement = {
      id,
      type: "image",
      label: "Image",
      content: "",
    };
    setModel((m) => ({ ...m, extras: [...m.extras, el] }));
    setSelected(id);
    pickImage("extra_el", id);
  };

  const removeExtra = (id: string) => {
    setModel((m) => ({
      ...m,
      extras: m.extras.filter((e) => e.id !== id),
    }));
    if (selected === id) setSelected(null);
  };

  const runExtract = async () => {
    if (sourceText.trim().length < 20) {
      toast.error("Collez le texte du courrier reçu.");
      return;
    }
    setBusy(true);
    try {
      const res = await extractFields({ sourceText });
      setModel((m) => {
        const vars = { ...m.variables };
        if (res.subject) vars.subject = res.subject;
        if (res.incoming_number || res.incoming_date) {
          vars.incoming_reference = [res.incoming_number, res.incoming_date]
            .filter(Boolean)
            .join(" — ");
        }
        const dest = [res.recipient_title, res.recipient_name, res.recipient_org]
          .filter(Boolean)
          .join("\n");
        if (dest) vars.recipient_block = dest;
        return { ...m, variables: vars };
      });
      setPanel("edit");
      toast.success("Zones à compléter préremplies");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Extraction impossible");
    } finally {
      setBusy(false);
    }
  };

  const runGenerate = async () => {
    setBusy(true);
    try {
      const res = await generateDraft({
        sourceText: sourceText || v.subject || "Sans texte source",
        confirmedFields: {
          subject: v.subject,
          incoming_number: v.incoming_reference,
          incoming_date: "",
          sender_title: v.sender_title,
          sender_name: "",
          sender_org: v.direction_line,
          recipient_title: "",
          recipient_name: "",
          recipient_org: v.recipient_block,
          location_date: v.location_date,
          outgoing_reference: formatOutgoingRef(v),
          signatory_title: v.signatory_title,
          signatory_name: v.signatory_name,
        },
        responseIntent: intent,
        additionalInstructions: instructions || undefined,
      });
      setModel((m) => ({
        ...m,
        variables: {
          ...m.variables,
          subject: res.subject || m.variables.subject,
          body: res.body_paragraphs.join("\n\n"),
          recipient_block:
            [
              res.recipient.title,
              res.recipient.name,
              res.recipient.organization,
              res.recipient.address,
            ]
              .filter(Boolean)
              .join("\n") || m.variables.recipient_block,
          incoming_reference:
            [res.incoming_reference.number, res.incoming_reference.date]
              .filter(Boolean)
              .join(" — ") || m.variables.incoming_reference,
        },
      }));
      setSelected("body");
      setPanel("edit");
      toast.success("Corps généré sur le modèle");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Génération impossible");
    } finally {
      setBusy(false);
    }
  };

  const openPrint = () => {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Autorisez les pop-ups");
      return;
    }
    w.document.write(renderMndptLetterHtml(model));
    w.document.close();
  };

  const exportHtml = () => {
    if (missing.length) {
      if (
        !window.confirm(
          `Zones incomplètes : ${missing.join(", ")}. Exporter quand même ?`,
        )
      )
        return;
    }
    downloadBlob(
      `courrier-mndpt-${Date.now()}.html`,
      renderMndptLetterHtml(model),
      "text/html;charset=utf-8",
    );
    toast.success("HTML téléchargé");
  };

  const selectedExtra = model.extras.find((e) => e.id === selected);

  const editorPanel = () => {
    if (selected === "logo" || selected === "seal" || selected === "extra_image") {
      const title =
        selected === "logo"
          ? "Logo MNDPT"
          : selected === "seal"
            ? "Emblème République"
            : "Image libre";
      return (
        <div className="space-y-3 text-xs">
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-muted-foreground">
            Remplacez l&apos;image par un fichier officiel (PNG/JPG).
          </p>
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => pickImage(selected)}
          >
            <ImagePlus className="mr-2 size-3.5" />
            Choisir une image
          </Button>
        </div>
      );
    }
    if (selectedExtra) {
      return (
        <div className="space-y-3">
          <Label className="text-sm">{selectedExtra.label}</Label>
          {selectedExtra.type === "text" ? (
            <Textarea
              rows={5}
              value={selectedExtra.content}
              onChange={(e) =>
                setModel((m) => ({
                  ...m,
                  extras: m.extras.map((el) =>
                    el.id === selectedExtra.id
                      ? { ...el, content: e.target.value }
                      : el,
                  ),
                }))
              }
            />
          ) : (
            <div className="space-y-2">
              {selectedExtra.content ? (
                <img
                  src={selectedExtra.content}
                  alt=""
                  className="max-h-32 rounded border object-contain"
                />
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => pickImage("extra_el", selectedExtra.id)}
              >
                <ImagePlus className="mr-2 size-3.5" />
                Changer l&apos;image
              </Button>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="w-full"
            onClick={() => removeExtra(selectedExtra.id)}
          >
            <Trash2 className="mr-2 size-3.5" />
            Supprimer l&apos;élément
          </Button>
        </div>
      );
    }
    if (!selected || !(selected in LETTER_VARIABLE_META)) {
      return (
        <p className="text-xs text-muted-foreground">
          Cliquez une zone <span className="text-red-600">pointillée rouge</span>{" "}
          pour la compléter. Les blocs « Auto » restent fixes.
        </p>
      );
    }
    const key = selected as LetterVariableKey;
    const meta = LETTER_VARIABLE_META[key];
    const multiline =
      key === "body" ||
      key === "recipient_block" ||
      key === "attachments" ||
      key === "extra_refs" ||
      key === "subject";
    return (
      <div className="space-y-2">
        <Label className="text-sm">
          {meta.label}
          {meta.required ? <span className="text-destructive"> *</span> : null}
        </Label>
        <p className="text-[11px] text-muted-foreground">{meta.hint}</p>
        {multiline ? (
          <Textarea
            rows={key === "body" ? 12 : 4}
            className={cn(key === "body" && "font-serif text-sm leading-relaxed")}
            value={v[key]}
            onChange={(e) => setVar(key, e.target.value)}
            autoFocus
          />
        ) : (
          <Input
            value={v[key]}
            onChange={(e) => setVar(key, e.target.value)}
            autoFocus
          />
        )}
        {key === "outgoing_number" || key === "outgoing_path" ? (
          <p className="text-[11px] text-muted-foreground">
            Aperçu N° : <strong>{formatOutgoingRef(v)}</strong>
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-5.5rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="mr-1 min-w-0">
          <p className="truncate text-sm font-semibold">Canevas — modèle MNDPT</p>
          <p className="truncate text-[10px] text-muted-foreground">
            Rouge = à compléter · Auto = fixe
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={newBlank}>
          <FilePlus2 className="mr-1.5 size-3.5" />
          Vierge
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addTextElement}
        >
          <Type className="mr-1.5 size-3.5" />
          Texte
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addImageElement}
        >
          <ImagePlus className="mr-1.5 size-3.5" />
          Image
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
            onClick={() => setZoom((z) => Math.min(1.2, z + 0.08))}
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
        {/* Canvas */}
        <div
          className="min-h-0 flex-1 overflow-auto bg-[#dfe6ee] p-4 md:p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="mx-auto origin-top transition-transform"
            style={{
              width: 680,
              transform: `scale(${zoom})`,
              marginBottom: `${Math.max(0, (zoom - 1) * 220)}px`,
            }}
          >
            <div
              className="relative bg-white px-9 py-7 shadow-xl shadow-slate-500/20"
              style={{ minHeight: 960 }}
              onClick={(e) => e.stopPropagation()}
            >
              {missing.length > 0 ? (
                <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-900">
                  À compléter : {missing.join(" · ")}
                </div>
              ) : null}

              {/* Emblème centré */}
              <button
                type="button"
                className={cn(
                  "mx-auto mb-2 flex flex-col items-center rounded-sm p-1",
                  selected === "seal" && "ring-2 ring-brand",
                )}
                onClick={() => setSelected("seal")}
              >
                {model.assets.sealUrl ? (
                  <img
                    src={model.assets.sealUrl}
                    alt=""
                    className="h-14 w-14 object-contain"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-300 text-[8px] text-slate-400">
                    Emblème
                  </div>
                )}
                <FixedBlock className="mt-1 px-2 py-0.5 text-center">
                  <div className="text-[9px] font-bold tracking-wide">
                    {MNDPT_FIXED.republicMalagasy}
                  </div>
                  <div className="text-[7px] text-slate-500">
                    {MNDPT_FIXED.republicMotto}
                  </div>
                </FixedBlock>
              </button>

              {/* Deux colonnes : gauche institution / droite date + destinataire */}
              <div className="mb-4 grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <button
                    type="button"
                    className={cn(
                      "block",
                      selected === "logo" && "ring-2 ring-brand rounded",
                    )}
                    onClick={() => setSelected("logo")}
                  >
                    {model.assets.logoUrl ? (
                      <img
                        src={model.assets.logoUrl}
                        alt="MNDPT"
                        className="h-12 max-w-[160px] object-contain object-left"
                      />
                    ) : (
                      <div className="text-xl font-black tracking-wide">
                        {MNDPT_FIXED.logoText}
                      </div>
                    )}
                  </button>
                  <FixedBlock className="px-1 py-1">
                    <p className="text-[7px] leading-tight text-slate-500">
                      {MNDPT_FIXED.logoSub}
                    </p>
                    <p className="mt-2 text-[9px] font-semibold uppercase tracking-wide">
                      {MNDPT_FIXED.secretariat}
                    </p>
                    <p className="text-[9px] font-semibold uppercase tracking-wide">
                      {MNDPT_FIXED.directionGenerale}
                    </p>
                  </FixedBlock>
                  <FillSlot
                    selected={selected === "direction_line"}
                    empty={!v.direction_line.trim()}
                    label="Direction"
                    onSelect={() => setSelected("direction_line")}
                    className="px-1 py-1"
                  >
                    <p className="text-[9px] font-bold uppercase tracking-wide">
                      {v.direction_line || "DIRECTION …"}
                    </p>
                  </FillSlot>
                </div>

                <div className="space-y-2 text-right text-[12px]">
                  <FillSlot
                    selected={selected === "location_date"}
                    empty={!v.location_date.trim()}
                    label="Date"
                    onSelect={() => setSelected("location_date")}
                    className="px-2 py-1"
                  >
                    <p>{v.location_date || "Antananarivo, le …"}</p>
                  </FillSlot>
                  <FillSlot
                    selected={selected === "sender_title"}
                    empty={!v.sender_title.trim()}
                    label="Émetteur"
                    onSelect={() => setSelected("sender_title")}
                    className="px-2 py-1"
                  >
                    <p>{v.sender_title || "Le Directeur de …"}</p>
                  </FillSlot>
                  <p className="pr-2 text-slate-500">à</p>
                  <FillSlot
                    selected={selected === "recipient_block"}
                    empty={!v.recipient_block.trim()}
                    label="Destinataire"
                    onSelect={() => setSelected("recipient_block")}
                    className="min-h-[70px] px-2 py-1"
                  >
                    <p className="whitespace-pre-line">
                      {v.recipient_block ||
                        "Monsieur le Directeur…\nOrganisme\nAdresse"}
                    </p>
                  </FillSlot>
                </div>
              </div>

              {/* N° objet réf */}
              <div className="mb-3 space-y-1.5 text-[12px]">
                <div className="flex flex-wrap gap-2">
                  <FillSlot
                    selected={selected === "outgoing_number"}
                    empty={!v.outgoing_number.trim()}
                    label="N°"
                    onSelect={() => setSelected("outgoing_number")}
                    className="flex-1 px-2 py-1"
                  >
                    <p className="font-semibold">{formatOutgoingRef(v)}</p>
                  </FillSlot>
                  <FillSlot
                    selected={selected === "outgoing_path"}
                    empty={!v.outgoing_path.trim()}
                    label="Chemin"
                    onSelect={() => setSelected("outgoing_path")}
                    className="px-2 py-1"
                  >
                    <p className="text-[10px] text-slate-600">
                      {v.outgoing_path || "MNDPT/SG/…"}
                    </p>
                  </FillSlot>
                </div>
                <FillSlot
                  selected={selected === "subject"}
                  empty={!v.subject.trim()}
                  label="Objet"
                  onSelect={() => setSelected("subject")}
                  className="px-2 py-1"
                >
                  <p>
                    <span className="font-semibold">Objet :</span>{" "}
                    {v.subject || "…"}
                  </p>
                </FillSlot>
                <FillSlot
                  selected={selected === "incoming_reference"}
                  empty={!v.incoming_reference.trim()}
                  label="Réf."
                  onSelect={() => setSelected("incoming_reference")}
                  className="px-2 py-1"
                >
                  <p>
                    <span className="font-semibold">Réf. :</span>{" "}
                    {v.incoming_reference || "…"}
                  </p>
                </FillSlot>
                <FillSlot
                  selected={selected === "extra_refs"}
                  empty={!v.extra_refs.trim()}
                  label="Mandats"
                  onSelect={() => setSelected("extra_refs")}
                  className="px-2 py-1"
                >
                  <p className="whitespace-pre-line">
                    {v.extra_refs || "N° Mandat / autres références…"}
                  </p>
                </FillSlot>
                <FillSlot
                  selected={selected === "attachments"}
                  empty={!v.attachments.trim()}
                  label="P.J."
                  onSelect={() => setSelected("attachments")}
                  className="px-2 py-1"
                >
                  <p>
                    <span className="font-semibold">Pièces jointes :</span>{" "}
                    {v.attachments || "…"}
                  </p>
                </FillSlot>
              </div>

              <FillSlot
                selected={selected === "body"}
                empty={!v.body.trim() || v.body.includes("[À COMPLÉTER")}
                label="Corps"
                onSelect={() => setSelected("body")}
                className="mb-4 min-h-[240px] px-2 py-2"
              >
                <div className="whitespace-pre-line font-serif text-[13px] leading-relaxed">
                  {v.body}
                </div>
              </FillSlot>

              {/* Extras utilisateur */}
              {model.extras.map((el) => (
                <button
                  key={el.id}
                  type="button"
                  onClick={() => setSelected(el.id)}
                  className={cn(
                    "mb-2 w-full rounded border border-dashed border-violet-300 bg-violet-50/40 p-2 text-left",
                    selected === el.id && "ring-2 ring-violet-500",
                  )}
                >
                  {el.type === "image" && el.content ? (
                    <img
                      src={el.content}
                      alt=""
                      className="max-h-36 object-contain"
                    />
                  ) : (
                    <p className="whitespace-pre-line text-[12px]">{el.content}</p>
                  )}
                </button>
              ))}

              {model.assets.extraImageUrl ? (
                <button
                  type="button"
                  className={cn(
                    "mb-3 block",
                    selected === "extra_image" && "ring-2 ring-brand",
                  )}
                  onClick={() => setSelected("extra_image")}
                >
                  <img
                    src={model.assets.extraImageUrl}
                    alt=""
                    className="max-h-40 object-contain"
                  />
                </button>
              ) : null}

              <div className="ml-auto max-w-[240px] space-y-2 text-right">
                <FillSlot
                  selected={selected === "signatory_title"}
                  empty={!v.signatory_title.trim()}
                  label="Signature"
                  onSelect={() => setSelected("signatory_title")}
                  className="px-2 py-1"
                >
                  <p className="text-[12px] font-medium">
                    {v.signatory_title || v.sender_title || "Fonction…"}
                  </p>
                </FillSlot>
                <FillSlot
                  selected={selected === "signatory_name"}
                  empty={!v.signatory_name.trim()}
                  label="Nom"
                  onSelect={() => setSelected("signatory_name")}
                  className="mt-10 px-2 py-1"
                >
                  <p className="text-[12px]">{v.signatory_name || " "}</p>
                </FillSlot>
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <aside className="flex w-full shrink-0 flex-col border-t border-border bg-card lg:w-[300px] lg:border-l lg:border-t-0">
          <div className="flex border-b border-border">
            {(
              [
                ["edit", "Édition"],
                ["ai", "IA"],
                ["media", "Médias"],
                ["export", "Export"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPanel(id)}
                className={cn(
                  "flex-1 px-1 py-2.5 text-[11px] font-medium",
                  panel === id
                    ? "border-b-2 border-brand text-brand"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {panel === "edit" ? editorPanel() : null}

            {panel === "ai" ? (
              <div className="space-y-3 text-xs">
                <p className="text-muted-foreground">
                  L&apos;IA complète les zones rouges (objet, corps…). Pas
                  l&apos;en-tête fixe.
                </p>
                <Textarea
                  rows={5}
                  className="font-mono text-xs"
                  placeholder="Coller le courrier reçu…"
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={busy || sourceText.trim().length < 20}
                  onClick={() => void runExtract()}
                >
                  {busy ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-3.5" />
                  )}
                  Extraire les champs
                </Button>
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                >
                  {INTENTS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
                <Textarea
                  rows={2}
                  placeholder="Consignes…"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void runGenerate()}
                >
                  {busy ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-3.5" />
                  )}
                  Générer le corps
                </Button>
              </div>
            ) : null}

            {panel === "media" ? (
              <div className="space-y-2 text-xs">
                <p className="text-muted-foreground">
                  Logos, emblème, images et textes additionnels.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSelected("logo");
                    pickImage("logo");
                  }}
                >
                  Logo MNDPT
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSelected("seal");
                    pickImage("seal");
                  }}
                >
                  Emblème République
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={addImageElement}
                >
                  <Plus className="mr-1 size-3.5" />
                  Ajouter une image
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={addTextElement}
                >
                  <Plus className="mr-1 size-3.5" />
                  Ajouter un texte
                </Button>
                {model.extras.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {model.extras.map((el) => (
                      <li
                        key={el.id}
                        className="flex items-center justify-between rounded border border-border px-2 py-1"
                      >
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => {
                            setSelected(el.id);
                            setPanel("edit");
                          }}
                        >
                          {el.label} ({el.type})
                        </button>
                        <button type="button" onClick={() => removeExtra(el.id)}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {panel === "export" ? (
              <div className="space-y-3 text-xs">
                {missing.length ? (
                  <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-red-900">
                    {missing.join(", ")}
                  </div>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-800"
                  >
                    Prêt
                  </Badge>
                )}
                <Button type="button" size="sm" className="w-full" onClick={openPrint}>
                  <Printer className="mr-2 size-3.5" />
                  Imprimer / PDF
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={exportHtml}
                >
                  <Download className="mr-2 size-3.5" />
                  HTML
                </Button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
