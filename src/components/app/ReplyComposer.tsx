import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  exportAsPdf,
  exportAsWord,
  wrapLetterHtml,
} from "@/lib/letterEditor";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Download,
  Italic,
  List,
  ListOrdered,
  Loader2,
  PanelLeft,
  Plus,
  Printer,
  Reply,
  Send,
  Trash2,
  Underline,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Field = {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  locked?: boolean;
};

type ParentInfo = {
  documentId: Id<"documents">;
  objet?: string | null;
  publicRef?: string | null;
  fileName?: string | null;
  senderId?: Id<"users"> | null;
  senderName?: string | null;
};

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CORE_FIELD_IDS = [
  "hierarchie",
  "lieuDate",
  "emetteurQualite",
  "destinataire",
  "numero",
  "objet",
  "reference",
  "piecesJointes",
  "corps",
  "signature",
] as const;

function buildLetterHtml(fields: Field[]): string {
  const get = (id: string) =>
    fields.find((f) => f.id === id)?.value.trim() ?? "";
  const hierarchie = get("hierarchie");
  const lieuDate = get("lieuDate");
  const emetteurQualite = get("emetteurQualite");
  const destinataire = get("destinataire");
  const numero = get("numero");
  const objet = get("objet");
  const reference = get("reference");
  const pieces = get("piecesJointes");
  const corps = get("corps");
  const signature = get("signature");
  const custom = fields.filter((f) => !CORE_FIELD_IDS.includes(f.id as (typeof CORE_FIELD_IDS)[number]));

  const hierLines = hierarchie
    ? hierarchie
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map(
          (l) =>
            `<div style="font-size:10px;letter-spacing:0.04em;text-transform:uppercase;margin:2px 0">${esc(l)}</div>
             <div style="border-top:1px solid #333;width:72%;margin:2px 0 6px"></div>`,
        )
        .join("")
    : "";

  const corpsHtml = corps
    ? corps
        .split(/\n{2,}/)
        .map((p) => `<p style="text-align:justify;margin:0 0 0.7em">${esc(p).replace(/\n/g, "<br/>")}</p>`)
        .join("")
    : `<p><br/></p>`;

  const customHtml = custom
    .filter((f) => f.label.trim() || f.value.trim())
    .map(
      (f) =>
        `<p style="margin:0 0 0.35em"><strong>${esc(f.label || "Champ")} :</strong> ${esc(f.value).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("\n");

  return `
<div style="text-align:center;margin:0 0 10px">
  <div style="font-size:11px;font-weight:700;letter-spacing:0.06em">REPOBLIKAN'I MADAGASIKARA</div>
  <div style="font-size:10px;font-style:italic;margin-top:2px">Fitiavana – Tanindrazana – Fandrosoana</div>
</div>

<table style="width:100%;border-collapse:collapse;margin-bottom:14px">
  <tr>
    <td style="width:42%;vertical-align:top;padding-right:10px">
      <div style="font-size:22px;font-weight:800;letter-spacing:0.08em;line-height:1">MNDPT</div>
      <div style="font-size:8px;text-transform:uppercase;margin-top:2px;line-height:1.25;max-width:180px">
        Ministère du Développement Numérique, des Postes et des Télécommunications
      </div>
      <div style="margin-top:12px">${hierLines}</div>
    </td>
    <td style="width:58%;vertical-align:top;text-align:right">
      <p style="margin:0 0 16px">${esc(lieuDate) || "Antananarivo, le …"}</p>
      <p style="margin:0 0 6px;font-weight:600">${esc(emetteurQualite) || "Le Directeur de …"}</p>
      <p style="margin:0 0 6px">à</p>
      <p style="margin:0;text-align:right;line-height:1.45">${esc(destinataire).replace(/\n/g, "<br/>") || "Destinataire"}</p>
    </td>
  </tr>
</table>

${numero ? `<p style="margin:14px 0 8px"><strong>N°</strong>${esc(numero)}</p>` : ""}
<p style="margin:0 0 4px"><strong>Objet :</strong> ${esc(objet) || "…"}</p>
${reference ? `<p style="margin:0 0 4px"><strong>Réf :</strong> ${esc(reference)}</p>` : ""}
${pieces ? `<p style="margin:0 0 4px"><strong>Pièces jointes :</strong> ${esc(pieces)}</p>` : ""}
${customHtml}
<p style="margin:16px 0 0"></p>
${corpsHtml}
<p style="margin:28px 0 0;text-align:right;line-height:1.5">${esc(signature).replace(/\n/g, "<br/>") || ""}</p>
`.trim();
}

function defaultFields(
  parent: ParentInfo,
  myName: string,
  myFonction?: string | null,
  myDept?: string | null,
): Field[] {
  const today = format(new Date(), "d MMMM yyyy", { locale: fr });
  const year = new Date().getFullYear();
  const emetteur =
    myFonction?.trim() ||
    (myDept ? `Le responsable — ${myDept}` : "Le Directeur de la Transformation Digitale");
  return [
    {
      id: "hierarchie",
      label: "Hiérarchie (une ligne = un niveau)",
      value: "SECRÉTARIAT GÉNÉRAL\nDIRECTION GÉNÉRALE DU DÉVELOPPEMENT NUMÉRIQUE\nDIRECTION DE LA TRANSFORMATION DIGITALE",
      multiline: true,
    },
    {
      id: "lieuDate",
      label: "Lieu et date",
      value: `Antananarivo, le ${today}`,
    },
    {
      id: "emetteurQualite",
      label: "Qualité de l'émetteur (ex. Le Directeur de …)",
      value: emetteur,
    },
    {
      id: "destinataire",
      label: "Destinataire (bloc adresse)",
      value: parent.senderName?.trim()
        ? `${parent.senderName.trim()}\n`
        : "Monsieur / Madame …\n…\nANTANANARIVO",
      multiline: true,
    },
    {
      id: "numero",
      label: "N° du courrier de réponse",
      value: `…-${year}/MNDPT/SG/DGDN/DTD`,
    },
    {
      id: "objet",
      label: "Objet",
      value: parent.objet?.trim()
        ? `Réponse à : ${parent.objet.trim()}`
        : "Réponse à votre correspondance",
    },
    {
      id: "reference",
      label: "Réf.",
      value: parent.publicRef?.trim()
        ? `Votre correspondance ${parent.publicRef.trim()}`
        : "",
    },
    {
      id: "piecesJointes",
      label: "Pièces jointes",
      value: "",
    },
    {
      id: "corps",
      label: "Corps du message",
      value:
        "Madame, Monsieur,\n\nJ'ai l'honneur de vous informer que…\n\nJe vous prie d'agréer, Madame, Monsieur, l'expression de ma considération distinguée.",
      multiline: true,
    },
    {
      id: "signature",
      label: "Signature (qualité + nom)",
      value: `${emetteur}\n\n${myName || "[Nom]"}`,
      multiline: true,
    },
  ];
}

export function ReplyComposer({
  parent,
  open,
  onOpenChange,
  onSent,
}: {
  parent: ParentInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}) {
  const me = useQuery(api.workspace.me);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const sendDocument = useMutation(api.documents.send);

  const editorRef = useRef<HTMLDivElement>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [editorDirty, setEditorDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"fields" | "preview">("preview");
  const [showFields, setShowFields] = useState(false);
  const [zoom, setZoom] = useState(1);

  const myName = me?.user?.name?.trim() || me?.user?.email || "";

  useEffect(() => {
    if (!open || !parent) return;
    setFields(
      defaultFields(
        parent,
        myName,
        me?.user?.fonction ?? null,
        me?.department?.name ?? null,
      ),
    );
    setEditorDirty(false);
    setActiveTab("fields");
  }, [open, parent?.documentId, myName, me?.user?.fonction, me?.department?.name]);

  const letterTitle = useMemo(() => {
    const o = fields.find((f) => f.id === "objet")?.value?.trim();
    return o || "Réponse";
  }, [fields]);

  const syncEditorFromFields = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = buildLetterHtml(fields);
    setEditorDirty(false);
  }, [fields]);

  useEffect(() => {
    if (!open) return;
    if (editorDirty) return;
    // slight delay so dialog mounts the editor
    const t = window.setTimeout(() => syncEditorFromFields(), 50);
    return () => window.clearTimeout(t);
  }, [open, fields, editorDirty, syncEditorFromFields]);

  const updateField = (id: string, value: string) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, value } : f)),
    );
    setEditorDirty(false);
  };

  const updateFieldLabel = (id: string, label: string) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, label } : f)),
    );
    setEditorDirty(false);
  };

  const addField = () => {
    const id = `custom_${Date.now()}`;
    setFields((prev) => [
      ...prev,
      { id, label: "Nouveau champ", value: "", multiline: false },
    ]);
    setEditorDirty(false);
  };

  const removeField = (id: string) => {
    if (
      CORE_FIELD_IDS.includes(id as (typeof CORE_FIELD_IDS)[number])
    ) {
      toast.error("Ce champ fait partie du modèle de base.");
      return;
    }
    setFields((prev) => prev.filter((f) => f.id !== id));
    setEditorDirty(false);
  };

  const getBodyHtml = () => editorRef.current?.innerHTML ?? buildLetterHtml(fields);

  const exec = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setEditorDirty(true);
  }, []);

  const handlePrint = () => {
    try {
      exportAsPdf(letterTitle, getBodyHtml());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impression impossible");
    }
  };

  const handleDownloadWord = () => {
    try {
      exportAsWord(letterTitle, getBodyHtml());
      toast.success("Fichier Word téléchargé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Téléchargement impossible");
    }
  };

  const handleSend = async () => {
    if (!parent?.senderId) {
      toast.error("Expéditeur d'origine introuvable — envoi impossible.");
      return;
    }
    const html = getBodyHtml();
    if (!html.replace(/<[^>]+>/g, "").trim()) {
      toast.error("Le document de réponse est vide.");
      return;
    }
    setSending(true);
    try {
      const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word"
 xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/><title>${letterTitle.replace(/</g, "")}</title>
<style>
  body{font-family:Georgia,"Times New Roman",serif;font-size:12pt;line-height:1.5}
  p{margin:0 0 8pt}
  @page{size:A4;margin:2cm}
</style>
</head><body>${html}</body></html>`;
      const blob = new Blob(["\ufeff", wordHtml], {
        type: "application/msword;charset=utf-8",
      });
      const safeName =
        letterTitle
          .replace(/[^\w\s\-àâäéèêëïîôùûüç]/gi, "")
          .trim()
          .slice(0, 40) || "Reponse";
      const file = new File([blob], `${safeName}.doc`, {
        type: "application/msword",
      });

      const uploadUrl = await generateUploadUrl({});
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Échec de l'envoi du fichier.");
      const { storageId } = (await res.json()) as {
        storageId: Id<"_storage">;
      };

      await sendDocument({
        storageId,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        objet: letterTitle,
        observations: undefined,
        tasks: ["Prise de connaissance"],
        recipientId: parent.senderId,
        parentCourrierId: parent.documentId,
        referenceText:
          parent.publicRef ||
          fields.find((f) => f.id === "reference")?.value ||
          undefined,
        mailKind: "envoi",
        onBehalfOfType: "internal",
        requiresResponse: false,
      });

      toast.success("Réponse envoyée à l'expéditeur d'origine.");
      onOpenChange(false);
      onSent?.();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Envoi de la réponse impossible.",
      );
    } finally {
      setSending(false);
    }
  };

  if (!parent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(96vh,920px)] w-[min(1280px,98vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Reply className="size-4 text-brand" />
            Rédiger une réponse
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Éditez le document comme dans un traitement de texte. Les champs à
            gauche préremplissent le modèle si besoin.
          </p>
        </DialogHeader>

        {/* Barre d'outils type Word */}
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5">
          <Button
            type="button"
            size="sm"
            variant={showFields ? "secondary" : "ghost"}
            className="gap-1.5"
            onClick={() => setShowFields((v) => !v)}
          >
            <PanelLeft className="size-3.5" />
            Champs
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="Gras"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("bold")}
          >
            <Bold className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="Italique"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("italic")}
          >
            <Italic className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="Souligné"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("underline")}
          >
            <Underline className="size-3.5" />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="Aligner à gauche"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("justifyLeft")}
          >
            <AlignLeft className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="Centrer"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("justifyCenter")}
          >
            <AlignCenter className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="Aligner à droite"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("justifyRight")}
          >
            <AlignRight className="size-3.5" />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="Liste"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("insertUnorderedList")}
          >
            <List className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="Liste numérotée"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("insertOrderedList")}
          >
            <ListOrdered className="size-3.5" />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="Zoom −"
            onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))}
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            title="Zoom +"
            onClick={() => setZoom((z) => Math.min(1.4, Math.round((z + 0.1) * 10) / 10))}
          >
            <ZoomIn className="size-3.5" />
          </Button>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handlePrint}
            >
              <Printer className="size-3.5" />
              Imprimer / PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleDownloadWord}
            >
              <Download className="size-3.5" />
              Word
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Panneau champs (optionnel) */}
          {showFields ? (
            <div className="flex w-full max-w-[320px] shrink-0 flex-col border-r border-border bg-card sm:max-w-[360px]">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <p className="text-xs font-semibold">Champs du modèle</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    setEditorDirty(false);
                    window.setTimeout(() => syncEditorFromFields(), 10);
                  }}
                >
                  Appliquer au document
                </Button>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {fields.map((f) => (
                  <div
                    key={f.id}
                    className="space-y-1 rounded-lg border border-border/80 p-2"
                  >
                    <div className="flex items-center gap-1">
                      <Input
                        value={f.label}
                        onChange={(e) => updateFieldLabel(f.id, e.target.value)}
                        className="h-7 text-[11px] font-medium"
                      />
                      {!CORE_FIELD_IDS.includes(
                        f.id as (typeof CORE_FIELD_IDS)[number],
                      ) ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 shrink-0 text-destructive"
                          onClick={() => removeField(f.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      ) : null}
                    </div>
                    {f.multiline ? (
                      <Textarea
                        rows={f.id === "corps" ? 4 : 2}
                        value={f.value}
                        onChange={(e) => updateField(f.id, e.target.value)}
                        className="resize-y text-xs"
                      />
                    ) : (
                      <Input
                        value={f.value}
                        onChange={(e) => updateField(f.id, e.target.value)}
                        className="h-8 text-xs"
                      />
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={addField}
                >
                  <Plus className="size-3.5" />
                  Ajouter un champ
                </Button>
              </div>
            </div>
          ) : null}

          {/* Zone document — éditeur principal */}
          <div className="min-h-0 flex-1 overflow-auto bg-[#c5cdd8] p-4 sm:p-6">
            <div
              className="mx-auto origin-top transition-transform"
              style={{
                width: "210mm",
                transform: `scale(${zoom})`,
                marginBottom: zoom < 1 ? undefined : `${(zoom - 1) * 40}mm`,
              }}
            >
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => setEditorDirty(true)}
                className="min-h-[297mm] w-[210mm] bg-white px-[18mm] py-[20mm] text-[13px] leading-relaxed text-black shadow-xl outline-none focus:ring-2 focus:ring-brand/40"
                style={{
                  fontFamily: 'Georgia, "Times New Roman", Times, serif',
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            {editorDirty
              ? "Document modifié manuellement"
              : "Document généré depuis le modèle — cliquez pour écrire"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sending}
              onClick={() => onOpenChange(false)}
            >
              Fermer
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={sending || !parent.senderId}
              onClick={() => void handleSend()}
            >
              {sending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Envoyer la réponse
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
