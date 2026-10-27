import mndptLogo from "@/assets/mndpt-logo.jpg";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { exportAsPdf, exportAsWord } from "@/lib/letterEditor";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Bold,
  CheckCircle2,
  Download,
  Italic,
  List,
  ListOrdered,
  Loader2,
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
};

type ParentInfo = {
  documentId: Id<"documents">;
  objet?: string | null;
  publicRef?: string | null;
  fileName?: string | null;
  senderId?: Id<"users"> | null;
  senderName?: string | null;
};

const CORE_FIELD_IDS = [
  "logoUrl",
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

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildLetterHtml(fields: Field[], defaultLogoSrc: string): string {
  const get = (id: string) =>
    fields.find((f) => f.id === id)?.value.trim() ?? "";
  const logoUrl = get("logoUrl") || defaultLogoSrc;
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
  const custom = fields.filter(
    (f) => !CORE_FIELD_IDS.includes(f.id as (typeof CORE_FIELD_IDS)[number]),
  );

  const hierLines = hierarchie
    ? hierarchie
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map(
          (l) =>
            `<div style="font-size:9.5px;letter-spacing:0.05em;text-transform:uppercase;margin:3px 0 1px;font-weight:600">${esc(l)}</div>
             <div style="border-top:1px solid #222;width:78%;margin:0 0 5px"></div>`,
        )
        .join("")
    : "";

  const corpsHtml = corps
    ? corps
        .split(/\n{2,}/)
        .map(
          (p) =>
            `<p style="text-align:justify;margin:0 0 0.75em">${esc(p).replace(/\n/g, "<br/>")}</p>`,
        )
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
<div style="text-align:center;margin:0 0 12px">
  <div style="font-size:11px;font-weight:700;letter-spacing:0.08em">REPOBLIKAN'I MADAGASIKARA</div>
  <div style="font-size:10px;font-style:italic;margin-top:2px">Fitiavana – Tanindrazana – Fandrosoana</div>
</div>

<table style="width:100%;border-collapse:collapse;margin-bottom:16px">
  <tr>
    <td style="width:44%;vertical-align:top;padding-right:12px">
      <img src="${esc(logoUrl)}" alt="MNDPT" style="height:52px;width:auto;object-fit:contain;display:block;margin-bottom:6px" />
      <div style="font-size:7.5px;text-transform:uppercase;line-height:1.3;max-width:200px;color:#333">
        Ministère du Développement Numérique, des Postes et des Télécommunications
      </div>
      <div style="margin-top:14px">${hierLines}</div>
    </td>
    <td style="width:56%;vertical-align:top;text-align:right">
      <p style="margin:0 0 18px">${esc(lieuDate) || "Antananarivo, le …"}</p>
      <p style="margin:0 0 8px;font-weight:700">${esc(emetteurQualite) || "Le Directeur de …"}</p>
      <p style="margin:0 0 8px">à</p>
      <p style="margin:0;line-height:1.45">${esc(destinataire).replace(/\n/g, "<br/>") || "Destinataire"}</p>
    </td>
  </tr>
</table>

${numero ? `<p style="margin:12px 0 8px"><strong>N°</strong>${esc(numero)}</p>` : ""}
<p style="margin:0 0 4px"><strong>Objet :</strong> ${esc(objet) || "…"}</p>
${reference ? `<p style="margin:0 0 4px"><strong>Réf :</strong> ${esc(reference)}</p>` : ""}
${pieces ? `<p style="margin:0 0 4px"><strong>Pièces jointes :</strong> ${esc(pieces)}</p>` : ""}
${customHtml}
<div style="margin-top:18px">${corpsHtml}</div>
<p style="margin:32px 0 0;text-align:right;line-height:1.55">${esc(signature).replace(/\n/g, "<br/>") || ""}</p>
`.trim();
}

function defaultFields(
  parent: ParentInfo,
  myName: string,
  myFonction?: string | null,
  myDept?: string | null,
  defaultLogoSrc?: string,
): Field[] {
  const today = format(new Date(), "d MMMM yyyy", { locale: fr });
  const year = new Date().getFullYear();
  const emetteur =
    myFonction?.trim() ||
    (myDept ? `Le responsable — ${myDept}` : "Le Directeur de la Transformation Digitale");
  return [
    {
      id: "logoUrl",
      label: "Logo (URL ou laisser le logo MNDPT par défaut)",
      value: defaultLogoSrc || "",
    },
    {
      id: "hierarchie",
      label: "Hiérarchie (une ligne = un niveau)",
      value:
        "SECRÉTARIAT GÉNÉRAL\nDIRECTION GÉNÉRALE DU DÉVELOPPEMENT NUMÉRIQUE\nDIRECTION DE LA TRANSFORMATION DIGITALE",
      multiline: true,
    },
    {
      id: "lieuDate",
      label: "Lieu et date",
      value: `Antananarivo, le ${today}`,
    },
    {
      id: "emetteurQualite",
      label: "Qualité de l'émetteur",
      value: emetteur,
    },
    {
      id: "destinataire",
      label: "Destinataire (bloc adresse)",
      value: parent.senderName?.trim()
        ? parent.senderName.trim()
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
  const setStatus = useMutation(api.documents.setStatus);

  const editorRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [fields, setFields] = useState<Field[]>([]);
  const [editorDirty, setEditorDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [zoom, setZoom] = useState(1);

  const myName = me?.user?.name?.trim() || me?.user?.email || "";
  const defaultLogoSrc = mndptLogo as string;

  useEffect(() => {
    if (!open || !parent) return;
    setStep(1);
    setEditorDirty(false);
    setZoom(1);
    setFields(
      defaultFields(
        parent,
        myName,
        me?.user?.fonction ?? null,
        me?.department?.name ?? null,
        defaultLogoSrc,
      ),
    );
  }, [
    open,
    parent?.documentId,
    myName,
    me?.user?.fonction,
    me?.department?.name,
    defaultLogoSrc,
  ]);

  const letterTitle = useMemo(() => {
    const o = fields.find((f) => f.id === "objet")?.value?.trim();
    return o || "Réponse";
  }, [fields]);

  const applyFieldsToEditor = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = buildLetterHtml(fields, defaultLogoSrc);
    setEditorDirty(false);
  }, [fields, defaultLogoSrc]);

  const goToEditor = () => {
    setStep(2);
    window.setTimeout(() => applyFieldsToEditor(), 60);
  };

  const exec = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setEditorDirty(true);
  }, []);

  const getBodyHtml = () =>
    editorRef.current?.innerHTML ?? buildLetterHtml(fields, defaultLogoSrc);

  const updateField = (id: string, value: string) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, value } : f)));
  };

  const updateFieldLabel = (id: string, label: string) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, label } : f)));
  };

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { id: `custom_${Date.now()}`, label: "Nouveau champ", value: "" },
    ]);
  };

  const removeField = (id: string) => {
    if (CORE_FIELD_IDS.includes(id as (typeof CORE_FIELD_IDS)[number])) {
      toast.error("Ce champ fait partie du modèle de base.");
      return;
    }
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

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

  const uploadAndSend = async () => {
    if (!parent?.senderId) {
      throw new Error("Expéditeur d'origine introuvable — envoi impossible.");
    }
    const html = getBodyHtml();
    if (!html.replace(/<[^>]+>/g, "").trim()) {
      throw new Error("Le document de réponse est vide.");
    }
    const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word"
 xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/><title>${letterTitle.replace(/</g, "")}</title>
<style>
  body{font-family:Georgia,"Times New Roman",serif;font-size:12pt;line-height:1.5}
  p{margin:0 0 8pt}
  img{max-width:100%}
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
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
    await sendDocument({
      storageId,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      objet: letterTitle,
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
  };

  const handleSend = async () => {
    setSending(true);
    try {
      await uploadAndSend();
      toast.success("Réponse envoyée à l'expéditeur d'origine.");
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  };

  /** Envoyer la réponse puis classer le courrier d'origine */
  const handleSendAndClassify = async () => {
    if (!parent?.documentId) return;
    setClassifying(true);
    try {
      await uploadAndSend();
      try {
        await setStatus({
          documentId: parent.documentId,
          status: "traite",
        });
      } catch (e) {
        toast.error(
          e instanceof Error
            ? `Réponse envoyée, mais classement impossible : ${e.message}`
            : "Réponse envoyée, classement impossible.",
        );
        onSent?.();
        onOpenChange(false);
        return;
      }
      toast.success("Réponse envoyée et courrier classé.");
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opération impossible.");
    } finally {
      setClassifying(false);
    }
  };

  if (!parent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(96vh,940px)] w-[min(1280px,98vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <Reply className="size-4 text-brand" />
            Rédiger une réponse
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              Étape {step} / 2 —{" "}
              {step === 1
                ? "Remplir les champs"
                : "Éditer le document généré"}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* ——— Étape 1 : champs ——— */}
        {step === 1 ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <p className="mb-4 text-sm text-muted-foreground">
                Renseignez les informations ci-dessous. Elles seront placées
                automatiquement dans le courrier officiel (logo MNDPT inclus).
                Vous pourrez encore tout corriger à l&apos;étape suivante.
              </p>
              <div className="mx-auto grid max-w-3xl gap-3">
                {fields.map((f) => (
                  <div
                    key={f.id}
                    className="space-y-1.5 rounded-xl border border-border bg-card p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={f.label}
                        onChange={(e) =>
                          updateFieldLabel(f.id, e.target.value)
                        }
                        className="h-8 text-xs font-medium"
                      />
                      {!CORE_FIELD_IDS.includes(
                        f.id as (typeof CORE_FIELD_IDS)[number],
                      ) ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0 text-destructive"
                          onClick={() => removeField(f.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                    {f.id === "logoUrl" ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <img
                          src={f.value || defaultLogoSrc}
                          alt="Logo"
                          className="h-12 w-auto rounded border border-border bg-white object-contain p-1"
                        />
                        <Input
                          value={f.value}
                          onChange={(e) => updateField(f.id, e.target.value)}
                          placeholder="URL du logo (vide = logo MNDPT)"
                          className="min-w-[200px] flex-1 text-sm"
                        />
                      </div>
                    ) : f.multiline ? (
                      <Textarea
                        rows={f.id === "corps" ? 5 : 2}
                        value={f.value}
                        onChange={(e) => updateField(f.id, e.target.value)}
                        className="resize-y text-sm"
                      />
                    ) : (
                      <Input
                        value={f.value}
                        onChange={(e) => updateField(f.id, e.target.value)}
                        className="text-sm"
                      />
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit gap-1.5"
                  onClick={addField}
                >
                  Ajouter un champ
                </Button>
              </div>
            </div>
            <div className="flex shrink-0 justify-between gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Annuler
              </Button>
              <Button type="button" className="gap-2" onClick={goToEditor}>
                Continuer
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </>
        ) : null}

        {/* ——— Étape 2 : éditeur ——— */}
        {step === 2 ? (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="size-3.5" />
                Champs
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="gap-1.5"
                onClick={() => {
                  if (
                    editorDirty &&
                    !window.confirm(
                      "Réappliquer les champs effacera les modifications manuelles dans l'éditeur. Continuer ?",
                    )
                  ) {
                    return;
                  }
                  applyFieldsToEditor();
                }}
              >
                Régénérer depuis les champs
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
                onClick={() =>
                  setZoom((z) => Math.max(0.55, Math.round((z - 0.1) * 10) / 10))
                }
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
                onClick={() =>
                  setZoom((z) => Math.min(1.35, Math.round((z + 0.1) * 10) / 10))
                }
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

            <div className="min-h-0 flex-1 overflow-auto bg-[#c5cdd8] p-4 sm:p-8">
              <div
                className="mx-auto origin-top transition-transform"
                style={{
                  width: "210mm",
                  transform: `scale(${zoom})`,
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

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-3">
              <p className="text-[11px] text-muted-foreground">
                {editorDirty
                  ? "Document corrigé manuellement"
                  : "Document généré — cliquez pour corriger les incohérences"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={sending || classifying}
                  onClick={() => onOpenChange(false)}
                >
                  Fermer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={sending || classifying || !parent.senderId}
                  onClick={() => void handleSend()}
                >
                  {sending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  Envoyer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={sending || classifying || !parent.senderId}
                  onClick={() => void handleSendAndClassify()}
                >
                  {classifying ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  Envoyer et classer
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
