import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import {
  LETTER_VARIABLE_META,
  MNDPT_FIXED,
  MNDPT_TEMPLATE_ID,
  type BlankLetterModel,
  type LetterVariableKey,
  createBlankMndptLetter,
  renderMndptLetterHtml,
} from "@/lib/mndptLetterTemplate";
import { cn } from "@/lib/utils";
import { useAction } from "convex/react";
import {
  Download,
  FilePlus2,
  Loader2,
  Printer,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type Selectable =
  | LetterVariableKey
  | "fixed_header"
  | null;

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

/** Zone cliquable sur le canvas */
function CanvasSlot({
  id,
  selected,
  locked,
  empty,
  label,
  onSelect,
  className,
  children,
}: {
  id: Selectable;
  selected: boolean;
  locked?: boolean;
  empty?: boolean;
  label?: string;
  onSelect: (id: Selectable) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
      className={cn(
        "group relative w-full rounded-sm text-left transition-all",
        locked
          ? "cursor-default border border-transparent bg-slate-50/80"
          : empty
            ? "border border-dashed border-sky-300/80 bg-sky-50/40 hover:border-sky-500 hover:bg-sky-50"
            : "border border-transparent hover:border-sky-200 hover:bg-sky-50/30",
        selected && !locked && "ring-2 ring-brand ring-offset-1",
        selected && locked && "ring-1 ring-slate-300",
        className,
      )}
    >
      {!locked && (
        <span
          className={cn(
            "pointer-events-none absolute -top-2 left-1 z-[1] rounded bg-brand px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
            selected && "opacity-100",
          )}
        >
          {label ?? "Modifier"}
        </span>
      )}
      {locked && (
        <span className="pointer-events-none absolute right-1 top-1 rounded bg-slate-200/90 px-1 py-0.5 text-[8px] font-medium uppercase text-slate-600">
          Fixe
        </span>
      )}
      {children}
    </button>
  );
}

export function LetterWorkspace() {
  const extractFields = useAction(api.letterAssistant.extractFields);
  const generateDraft = useAction(api.letterAssistant.generateDraft);

  const [model, setModel] = useState<BlankLetterModel>(() =>
    createBlankMndptLetter(),
  );
  const [selected, setSelected] = useState<Selectable>(null);
  const [zoom, setZoom] = useState(0.92);
  const [panel, setPanel] = useState<"edit" | "ai" | "export">("edit");
  const [sourceText, setSourceText] = useState("");
  const [intent, setIntent] = useState(INTENTS[0]!);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);

  const v = model.variables;

  const setVar = useCallback(
    (key: LetterVariableKey, value: string) => {
      setModel((m) => ({
        ...m,
        variables: { ...m.variables, [key]: value },
      }));
    },
    [],
  );

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!v.subject.trim()) m.push("Objet");
    if (!v.recipient_block.trim()) m.push("Destinataire");
    if (!v.body.trim() || v.body.includes("[À COMPLÉTER")) m.push("Corps");
    if (!v.signatory_title.trim()) m.push("Signataire");
    return m;
  }, [v]);

  const newBlank = () => {
    setModel(createBlankMndptLetter());
    setSelected(null);
    setSourceText("");
    setPanel("edit");
    toast.success("Nouveau modèle vierge MNDPT");
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
      toast.success("Champs mis à jour sur le canevas");
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
          sender_title: "",
          sender_name: "",
          sender_org: "",
          recipient_title: "",
          recipient_name: "",
          recipient_org: v.recipient_block,
          location_date: v.location_date,
          outgoing_reference: v.outgoing_reference,
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
      toast.success("Texte placé sur le modèle");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Génération impossible");
    } finally {
      setBusy(false);
    }
  };

  const openPrint = () => {
    const html = renderMndptLetterHtml(model);
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Autorisez les pop-ups");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const exportHtml = () => {
    if (missing.length) {
      if (
        !window.confirm(
          `Incomplet : ${missing.join(", ")}. Exporter le brouillon ?`,
        )
      )
        return;
    }
    downloadBlob(
      `courrier-mndpt-${Date.now()}.html`,
      renderMndptLetterHtml(model),
      "text/html;charset=utf-8",
    );
    toast.success("Export HTML — utilisez Imprimer → PDF");
  };

  /** Panneau de droite selon la sélection */
  const editorPanel = () => {
    if (selected === "fixed_header") {
      return (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Éléments fixes</p>
          <p>
            République, ministère, secrétariat et zones logo ne sont pas
            modifiables. Ils font partie du modèle officiel MNDPT.
          </p>
          <ul className="list-inside list-disc">
            <li>{MNDPT_FIXED.republic}</li>
            <li>{MNDPT_FIXED.ministry}</li>
            <li>{MNDPT_FIXED.headerNote}</li>
          </ul>
        </div>
      );
    }
    if (!selected) {
      return (
        <p className="text-xs text-muted-foreground">
          Cliquez une zone pointillée sur le document pour la modifier — comme
          sur Canva.
        </p>
      );
    }
    const meta = LETTER_VARIABLE_META[selected];
    const multiline =
      selected === "body" ||
      selected === "recipient_block" ||
      selected === "attachments";
    return (
      <div className="space-y-2">
        <Label className="text-sm">
          {meta.label}
          {meta.required ? <span className="text-destructive"> *</span> : null}
        </Label>
        <p className="text-[11px] text-muted-foreground">{meta.hint}</p>
        {multiline ? (
          <Textarea
            rows={selected === "body" ? 14 : 4}
            className={cn(
              "text-sm",
              selected === "body" && "font-serif leading-relaxed",
            )}
            value={v[selected]}
            onChange={(e) => setVar(selected, e.target.value)}
            autoFocus
          />
        ) : (
          <Input
            value={v[selected]}
            onChange={(e) => setVar(selected, e.target.value)}
            autoFocus
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-5.5rem)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm">
      {/* Barre type Canva */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="mr-2 min-w-0">
          <p className="truncate text-sm font-semibold">Canevas courrier</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {MNDPT_TEMPLATE_ID} · modèle fixe + zones éditables
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={newBlank}>
          <FilePlus2 className="mr-1.5 size-3.5" />
          Vierge
        </Button>
        <Button
          type="button"
          size="sm"
          variant={panel === "ai" ? "default" : "outline"}
          onClick={() => setPanel("ai")}
        >
          <Sparkles className="mr-1.5 size-3.5" />
          IA
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => setZoom((z) => Math.max(0.55, z - 0.08))}
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
        {/* Canevas central */}
        <div
          className="min-h-0 flex-1 overflow-auto bg-[#e8edf3] p-4 md:p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="mx-auto origin-top transition-transform"
            style={{
              width: 640,
              transform: `scale(${zoom})`,
              marginBottom: `${(zoom - 1) * 200}px`,
            }}
          >
            {/* Page A4-like */}
            <div
              className="relative bg-white px-10 py-8 shadow-xl shadow-slate-400/25"
              style={{ minHeight: 900 }}
              onClick={(e) => e.stopPropagation()}
            >
              {missing.length > 0 ? (
                <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
                  Zones vides : {missing.join(" · ")}
                </div>
              ) : null}

              {/* En-tête FIXE */}
              <CanvasSlot
                id="fixed_header"
                selected={selected === "fixed_header"}
                locked
                onSelect={setSelected}
                className="mb-4"
              >
                <div className="grid grid-cols-3 gap-2 border-b-2 border-slate-800 pb-3">
                  <div className="flex min-h-[72px] items-center justify-center border border-dashed border-slate-300 text-[9px] text-slate-500">
                    {MNDPT_FIXED.leftLogoLabel}
                  </div>
                  <div className="text-center text-[10px] uppercase leading-snug tracking-wide">
                    <div>{MNDPT_FIXED.republic}</div>
                    <div className="mt-1 text-[11px] font-bold leading-tight">
                      {MNDPT_FIXED.ministry}
                    </div>
                    <div className="mt-1 normal-case tracking-normal text-slate-600">
                      {MNDPT_FIXED.headerNote}
                    </div>
                  </div>
                  <div className="flex min-h-[72px] items-center justify-center border border-dashed border-slate-300 text-[9px] text-slate-500">
                    {MNDPT_FIXED.centerEmblemLabel}
                  </div>
                </div>
              </CanvasSlot>

              {/* Service émetteur */}
              <CanvasSlot
                id="sender_service"
                selected={selected === "sender_service"}
                empty={!v.sender_service.trim()}
                label="Service"
                onSelect={setSelected}
                className="mb-3 px-1 py-1"
              >
                <p className="text-center text-[11px] font-semibold text-slate-700">
                  {v.sender_service.trim() || "Service / direction émettrice"}
                </p>
              </CanvasSlot>

              {/* N° + date */}
              <div className="mb-4 flex gap-3">
                <CanvasSlot
                  id="outgoing_reference"
                  selected={selected === "outgoing_reference"}
                  empty={!v.outgoing_reference.trim()}
                  label="N°"
                  onSelect={setSelected}
                  className="flex-1 px-2 py-1.5"
                >
                  <p className="text-[12px]">
                    <span className="font-semibold">N°</span>{" "}
                    {v.outgoing_reference || (
                      <span className="text-slate-400">………………</span>
                    )}
                  </p>
                </CanvasSlot>
                <CanvasSlot
                  id="location_date"
                  selected={selected === "location_date"}
                  empty={!v.location_date.trim()}
                  label="Date"
                  onSelect={setSelected}
                  className="flex-1 px-2 py-1.5 text-right"
                >
                  <p className="text-[12px]">
                    {v.location_date || (
                      <span className="text-slate-400">Lieu, le …</span>
                    )}
                  </p>
                </CanvasSlot>
              </div>

              <CanvasSlot
                id="incoming_reference"
                selected={selected === "incoming_reference"}
                empty={!v.incoming_reference.trim()}
                label="Réf."
                onSelect={setSelected}
                className="mb-3 px-2 py-1.5"
              >
                <p className="text-[12px]">
                  <span className="font-semibold">Réf.</span>{" "}
                  {v.incoming_reference || (
                    <span className="text-slate-400">
                      (courrier reçu, optionnel)
                    </span>
                  )}
                </p>
              </CanvasSlot>

              <CanvasSlot
                id="recipient_block"
                selected={selected === "recipient_block"}
                empty={!v.recipient_block.trim()}
                label="Destinataire"
                onSelect={setSelected}
                className="mb-4 min-h-[72px] px-2 py-2"
              >
                <p className="whitespace-pre-line text-[12px] leading-relaxed">
                  {v.recipient_block.trim() || (
                    <span className="text-slate-400">
                      Cliquez pour saisir le destinataire
                      {"\n"}(qualité, nom, organisme)
                    </span>
                  )}
                </p>
              </CanvasSlot>

              <CanvasSlot
                id="subject"
                selected={selected === "subject"}
                empty={!v.subject.trim()}
                label="Objet"
                onSelect={setSelected}
                className="mb-4 px-2 py-2"
              >
                <p className="text-[12px]">
                  <span className="font-semibold">Objet :</span>{" "}
                  {v.subject.trim() || (
                    <span className="text-slate-400">À compléter</span>
                  )}
                </p>
              </CanvasSlot>

              <CanvasSlot
                id="body"
                selected={selected === "body"}
                empty={
                  !v.body.trim() || v.body.includes("[À COMPLÉTER")
                }
                label="Corps"
                onSelect={setSelected}
                className="mb-4 min-h-[220px] px-2 py-2"
              >
                <div className="whitespace-pre-line font-serif text-[13px] leading-relaxed text-slate-900">
                  {v.body}
                </div>
              </CanvasSlot>

              <CanvasSlot
                id="attachments"
                selected={selected === "attachments"}
                empty={!v.attachments.trim()}
                label="P.J."
                onSelect={setSelected}
                className="mb-6 px-2 py-1.5"
              >
                <p className="text-[12px]">
                  <span className="font-semibold">P.J. :</span>{" "}
                  {v.attachments.trim() || (
                    <span className="text-slate-400">Aucune</span>
                  )}
                </p>
              </CanvasSlot>

              <div className="ml-auto max-w-[220px] space-y-2 text-right">
                <CanvasSlot
                  id="signatory_title"
                  selected={selected === "signatory_title"}
                  empty={!v.signatory_title.trim()}
                  label="Fonction"
                  onSelect={setSelected}
                  className="px-2 py-1.5"
                >
                  <p className="text-[12px] font-medium">
                    {v.signatory_title.trim() || (
                      <span className="text-slate-400">
                        Fonction du signataire
                      </span>
                    )}
                  </p>
                </CanvasSlot>
                <CanvasSlot
                  id="signatory_name"
                  selected={selected === "signatory_name"}
                  empty={!v.signatory_name.trim()}
                  label="Nom"
                  onSelect={setSelected}
                  className="mt-8 px-2 py-1.5"
                >
                  <p className="text-[12px]">
                    {v.signatory_name.trim() || (
                      <span className="text-slate-400">Nom (optionnel)</span>
                    )}
                  </p>
                </CanvasSlot>
              </div>
            </div>
          </div>
        </div>

        {/* Panneau latéral */}
        <aside className="flex w-full shrink-0 flex-col border-t border-border bg-card lg:w-[320px] lg:border-l lg:border-t-0">
          <div className="flex border-b border-border">
            {(
              [
                ["edit", "Édition"],
                ["ai", "Assistant"],
                ["export", "Export"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPanel(id)}
                className={cn(
                  "flex-1 px-2 py-2.5 text-xs font-medium",
                  panel === id
                    ? "border-b-2 border-brand text-brand"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {panel === "edit" ? editorPanel() : null}

            {panel === "ai" ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  L&apos;IA remplit les zones du canevas. L&apos;en-tête fixe
                  reste intact.
                </p>
                <div className="space-y-1">
                  <Label className="text-xs">Courrier reçu (texte)</Label>
                  <Textarea
                    rows={6}
                    className="font-mono text-xs"
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                  />
                </div>
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
                  Extraire → canevas
                </Button>
                <div className="space-y-1 border-t border-border pt-3">
                  <Label className="text-xs">Intention de réponse</Label>
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
                    className="text-xs"
                    placeholder="Consignes (optionnel)"
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
                    Rédiger le corps
                  </Button>
                </div>
              </div>
            ) : null}

            {panel === "export" ? (
              <div className="space-y-3 text-xs">
                <p className="text-muted-foreground">
                  {MNDPT_FIXED.disclaimer}
                </p>
                {missing.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-950">
                    Incomplet : {missing.join(", ")}
                  </div>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-800"
                  >
                    Prêt à exporter
                  </Badge>
                )}
                <Button
                  type="button"
                  className="w-full"
                  size="sm"
                  onClick={openPrint}
                >
                  <Printer className="mr-2 size-3.5" />
                  Aperçu / Imprimer PDF
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  size="sm"
                  onClick={exportHtml}
                >
                  <Download className="mr-2 size-3.5" />
                  Télécharger HTML
                </Button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
