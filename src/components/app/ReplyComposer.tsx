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
  Download,
  FileText,
  Loader2,
  Plus,
  Printer,
  Reply,
  Send,
  Trash2,
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

function buildLetterHtml(fields: Field[]): string {
  const get = (id: string) =>
    fields.find((f) => f.id === id)?.value.trim() ?? "";
  const lieuDate = get("lieuDate");
  const destinataire = get("destinataire");
  const objet = get("objet");
  const reference = get("reference");
  const corps = get("corps");
  const signature = get("signature");
  const custom = fields.filter(
    (f) =>
      !["lieuDate", "destinataire", "objet", "reference", "corps", "signature"].includes(
        f.id,
      ),
  );

  const corpsHtml = corps
    ? corps
        .split(/\n{2,}/)
        .map(
          (p) =>
            `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`,
        )
        .join("")
    : `<p><br/></p>`;

  const customHtml = custom
    .filter((f) => f.label.trim() || f.value.trim())
    .map(
      (f) =>
        `<p><strong>${esc(f.label || "Champ")} :</strong> ${esc(f.value).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("\n");

  return `
<p style="text-align:center;font-weight:700;margin:0 0 4px">REPOBLIKAN'I MADAGASIKARA</p>
<p style="text-align:center;font-size:12px;margin:0 0 8px"><em>Fitiavana – Tanindrazana – Fandrosoana</em></p>
<p style="text-align:center;font-weight:700;font-size:12px;margin:0 0 16px">MINISTÈRE DU DÉVELOPPEMENT NUMÉRIQUE, DES POSTES ET DES TÉLÉCOMMUNICATIONS</p>
<hr style="border:none;border-top:1px solid #999;margin:12px 0"/>
<p style="text-align:right">${esc(lieuDate) || "…"}</p>
<p><br/></p>
<p>${esc(destinataire).replace(/\n/g, "<br/>") || "Destinataire"}</p>
<p><br/></p>
${reference ? `<p><strong>Réf. :</strong> ${esc(reference)}</p>` : ""}
<p><strong>Objet :</strong> ${esc(objet) || "…"}</p>
${customHtml}
<p><br/></p>
${corpsHtml}
<p><br/></p>
<p style="text-align:right">${esc(signature).replace(/\n/g, "<br/>") || ""}</p>
`.trim();
}

function defaultFields(parent: ParentInfo, myName: string): Field[] {
  const today = format(new Date(), "d MMMM yyyy", { locale: fr });
  return [
    {
      id: "lieuDate",
      label: "Lieu et date",
      value: `Antananarivo, le ${today}`,
    },
    {
      id: "destinataire",
      label: "Destinataire",
      value: parent.senderName?.trim() || "—",
      multiline: true,
    },
    {
      id: "objet",
      label: "Objet",
      value: parent.objet?.trim()
        ? `Réponse à : ${parent.objet.trim()}`
        : "Réponse",
    },
    {
      id: "reference",
      label: "Référence du courrier d'origine",
      value: parent.publicRef?.trim() || "",
    },
    {
      id: "corps",
      label: "Corps du message",
      value:
        "Madame, Monsieur,\n\nSuite à votre courrier, je vous informe que…\n\nJe vous prie d'agréer, Madame, Monsieur, l'expression de ma considération distinguée.",
      multiline: true,
    },
    {
      id: "signature",
      label: "Signature",
      value: myName || "",
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
  const [activeTab, setActiveTab] = useState<"fields" | "preview">("fields");

  const myName = me?.user?.name?.trim() || me?.user?.email || "";

  useEffect(() => {
    if (!open || !parent) return;
    setFields(defaultFields(parent, myName));
    setEditorDirty(false);
    setActiveTab("fields");
  }, [open, parent?.documentId, myName]);

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
      ["lieuDate", "destinataire", "objet", "reference", "corps", "signature"].includes(
        id,
      )
    ) {
      toast.error("Ce champ fait partie du modèle de base.");
      return;
    }
    setFields((prev) => prev.filter((f) => f.id !== id));
    setEditorDirty(false);
  };

  const getBodyHtml = () => editorRef.current?.innerHTML ?? buildLetterHtml(fields);

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
      <DialogContent className="flex max-h-[92vh] w-[min(1100px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Reply className="size-4 text-brand" />
            Rédiger une réponse
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Document généré automatiquement — modifiez les champs ou le texte
            directement dans l&apos;aperçu, puis imprimez, téléchargez ou
            envoyez.
          </p>
        </DialogHeader>

        <div className="flex shrink-0 gap-1 border-b border-border px-4 py-2 sm:hidden">
          <Button
            type="button"
            size="sm"
            variant={activeTab === "fields" ? "default" : "ghost"}
            onClick={() => setActiveTab("fields")}
          >
            Champs
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === "preview" ? "default" : "ghost"}
            onClick={() => {
              setActiveTab("preview");
              window.setTimeout(() => syncEditorFromFields(), 30);
            }}
          >
            Aperçu
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
          {/* Champs */}
          <div
            className={cn(
              "min-h-0 space-y-3 overflow-y-auto border-border p-4 lg:border-r",
              activeTab !== "fields" && "hidden lg:block",
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">
              Champs du formulaire (modifiables · vous pouvez en ajouter)
            </p>
            {fields.map((f) => (
              <div key={f.id} className="space-y-1.5 rounded-lg border border-border/80 bg-card p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={f.label}
                    onChange={(e) => updateFieldLabel(f.id, e.target.value)}
                    className="h-8 text-xs font-medium"
                    aria-label="Libellé du champ"
                  />
                  {!["lieuDate", "destinataire", "objet", "reference", "corps", "signature"].includes(
                    f.id,
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
                {f.multiline ? (
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
              className="gap-1.5"
              onClick={addField}
            >
              <Plus className="size-3.5" />
              Ajouter un champ
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="ml-2 gap-1.5"
              onClick={() => {
                setEditorDirty(false);
                window.setTimeout(() => syncEditorFromFields(), 10);
                setActiveTab("preview");
              }}
            >
              Mettre à jour l&apos;aperçu
            </Button>
          </div>

          {/* Aperçu éditable */}
          <div
            className={cn(
              "flex min-h-0 flex-col overflow-hidden bg-[#e8edf3] p-3",
              activeTab !== "preview" && "hidden lg:flex",
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Aperçu A4 — cliquez dans le document pour écrire / modifier
              </p>
              {editorDirty ? (
                <span className="text-[10px] text-amber-700">
                  Édité manuellement
                </span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => setEditorDirty(true)}
                className="mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white px-[14mm] py-[16mm] text-[13px] leading-relaxed shadow-md outline-none focus:ring-2 focus:ring-brand/30"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handlePrint}
            >
              <Printer className="size-3.5" />
              Imprimer / PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleDownloadWord}
            >
              <Download className="size-3.5" />
              Télécharger Word
            </Button>
          </div>
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
