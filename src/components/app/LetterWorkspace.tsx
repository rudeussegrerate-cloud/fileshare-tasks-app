import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useAction } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  Loader2,
  Printer,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StepDots } from "./shared";

const STEPS = [
  "Source",
  "Champs",
  "Intention",
  "Brouillon",
  "Export",
];

const INTENTS = [
  "Accusé de réception",
  "Demande de complément d'information",
  "Transmission pour suite à donner",
  "Acceptation",
  "Refus",
  "Information / notification",
  "Autre (préciser ci-dessous)",
];

type Fields = {
  subject: string;
  incoming_number: string;
  incoming_date: string;
  sender_title: string;
  sender_name: string;
  sender_org: string;
  recipient_title: string;
  recipient_name: string;
  recipient_org: string;
  location_date: string;
  outgoing_reference: string;
  signatory_title: string;
  signatory_name: string;
};

type Draft = {
  subject: string;
  recipient: {
    title: string;
    name: string;
    organization: string;
    address: string;
  };
  incoming_reference: {
    number: string;
    date: string;
    source_excerpt: string;
  };
  related_references: string[];
  body_paragraphs: string[];
  attachments: string[];
  missing_fields: string[];
  warnings: string[];
  confidence_notes: string[];
  source?: string;
};

function todayLocation() {
  try {
    const d = new Date();
    const fmt = d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return `Antananarivo, le ${fmt}`;
  } catch {
    return "Antananarivo, le …";
  }
}

function emptyFields(): Fields {
  return {
    subject: "",
    incoming_number: "",
    incoming_date: "",
    sender_title: "",
    sender_name: "",
    sender_org: "",
    recipient_title: "",
    recipient_name: "",
    recipient_org: "",
    location_date: todayLocation(),
    outgoing_reference: "",
    signatory_title: "",
    signatory_name: "",
  };
}

function buildPrintableHtml(
  fields: Fields,
  draft: Draft,
  bodyText: string,
): string {
  const body = bodyText
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px;text-align:justify;">${escapeHtml(p)}</p>`)
    .join("");
  const dest = [
    draft.recipient.title || fields.recipient_title,
    draft.recipient.name || fields.recipient_name,
    draft.recipient.organization || fields.recipient_org,
    draft.recipient.address,
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br/>");
  const refIn = [
    draft.incoming_reference.number || fields.incoming_number,
    draft.incoming_reference.date || fields.incoming_date,
  ]
    .filter(Boolean)
    .join(" — ");

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
<title>${escapeHtml(draft.subject || fields.subject || "Brouillon courrier")}</title>
<style>
  body{font-family:Times New Roman,serif;max-width:700px;margin:24px auto;padding:16px;color:#111;line-height:1.45}
  .head{text-align:center;border-bottom:1px solid #ccc;padding-bottom:12px;margin-bottom:20px}
  .head .inst{font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  .meta{display:flex;justify-content:space-between;gap:16px;margin-bottom:20px;font-size:14px}
  .right{text-align:right}
  .obj{margin:16px 0;font-size:14px}
  .sig{margin-top:36px;text-align:right;font-size:14px}
  .warn{background:#fff7ed;border:1px solid #fdba74;padding:8px 12px;font-size:12px;margin-bottom:16px}
  @media print{.no-print{display:none}}
</style></head><body>
<div class="head">
  <div class="inst">République de Madagascar</div>
  <div class="inst" style="font-weight:700;margin-top:4px">Ministère du Numérique, de la Poste et des Télécommunications</div>
  <div style="font-size:11px;margin-top:6px;color:#444">Modèle MNDPT — brouillon (à valider avant usage officiel)</div>
</div>
${
  draft.warnings?.length
    ? `<div class="warn no-print"><strong>À vérifier :</strong> ${escapeHtml(draft.warnings.join(" · "))}</div>`
    : ""
}
<div class="meta">
  <div>
    <div><strong>N°</strong> ${escapeHtml(fields.outgoing_reference || "[À CONFIRMER]")}</div>
    ${refIn ? `<div style="margin-top:6px"><strong>Réf.</strong> ${escapeHtml(refIn)}</div>` : ""}
  </div>
  <div class="right">${escapeHtml(fields.location_date)}</div>
</div>
<div style="margin-bottom:16px;font-size:14px">${dest || "<em>Destinataire [À CONFIRMER]</em>"}</div>
<div class="obj"><strong>Objet :</strong> ${escapeHtml(draft.subject || fields.subject || "[À CONFIRMER]")}</div>
${body}
<div class="sig">
  <div>${escapeHtml(fields.signatory_title || "[Fonction du signataire]")}</div>
  <div style="margin-top:28px">${escapeHtml(fields.signatory_name || "")}</div>
</div>
</body></html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function LetterWorkspace() {
  const extractFields = useAction(api.letterAssistant.extractFields);
  const generateDraft = useAction(api.letterAssistant.generateDraft);

  const [step, setStep] = useState(0);
  const [sourceText, setSourceText] = useState("");
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [intent, setIntent] = useState("");
  const [intentOther, setIntentOther] = useState("");
  const [instructions, setInstructions] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bodyEdit, setBodyEdit] = useState("");
  const [busy, setBusy] = useState(false);
  const [extractMeta, setExtractMeta] = useState<string | null>(null);

  const resolvedIntent =
    intent === "Autre (préciser ci-dessous)"
      ? intentOther.trim()
      : intent.trim();

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (draft?.warnings) w.push(...draft.warnings);
    if (!fields.outgoing_reference.trim())
      w.push("N° sortant non renseigné (saisie manuelle).");
    if (!fields.signatory_title.trim())
      w.push("Fonction du signataire manquante.");
    if (draft?.missing_fields?.length)
      w.push(`Champs à confirmer : ${draft.missing_fields.join(", ")}`);
    return w;
  }, [draft, fields]);

  const setField = (key: keyof Fields, value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
  };

  const runExtract = async () => {
    if (sourceText.trim().length < 20) {
      toast.error("Collez ou saisissez le texte du courrier reçu.");
      return;
    }
    setBusy(true);
    try {
      const res = await extractFields({ sourceText });
      setFields((f) => ({
        ...f,
        subject: res.subject || f.subject,
        incoming_number: res.incoming_number || f.incoming_number,
        incoming_date: res.incoming_date || f.incoming_date,
        sender_title: res.sender_title || f.sender_title,
        sender_name: res.sender_name || f.sender_name,
        sender_org: res.sender_org || f.sender_org,
        recipient_title: res.recipient_title || f.recipient_title,
        recipient_name: res.recipient_name || f.recipient_name,
        recipient_org: res.recipient_org || f.recipient_org,
      }));
      setExtractMeta(
        res.source === "ia"
          ? "Extraction assistée par IA — vérifiez chaque champ."
          : "Extraction locale — vérifiez chaque champ.",
      );
      if (res.warnings?.length) toast.message(res.warnings[0]);
      setStep(1);
      toast.success("Champs proposés. Vérifiez avant de continuer.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Extraction impossible.");
    } finally {
      setBusy(false);
    }
  };

  const runGenerate = async () => {
    if (!resolvedIntent) {
      toast.error("Choisissez ou précisez l'intention de réponse.");
      return;
    }
    setBusy(true);
    try {
      const res = await generateDraft({
        sourceText,
        confirmedFields: fields,
        responseIntent: resolvedIntent,
        additionalInstructions: instructions || undefined,
      });
      setDraft(res);
      setBodyEdit(res.body_paragraphs.join("\n\n"));
      setFields((f) => ({
        ...f,
        subject: res.subject || f.subject,
      }));
      setStep(3);
      toast.success(
        res.source === "ia"
          ? "Brouillon généré — relisez avant export."
          : "Brouillon local généré — relisez attentivement.",
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Génération impossible.");
    } finally {
      setBusy(false);
    }
  };

  const openPreview = () => {
    if (!draft) return;
    const html = buildPrintableHtml(fields, draft, bodyEdit);
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Autorisez les fenêtres pop-up pour l'aperçu.");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const exportHtml = () => {
    if (!draft) return;
    if (warnings.length) {
      const ok = window.confirm(
        "Des champs sont incomplets ou à confirmer.\nExporter quand même le brouillon ?",
      );
      if (!ok) return;
    }
    const html = buildPrintableHtml(fields, draft, bodyEdit);
    downloadBlob(
      `brouillon-courrier-mndpt-${Date.now()}.html`,
      html,
      "text/html;charset=utf-8",
    );
    toast.success("Fichier HTML téléchargé (ouvrez-le puis Imprimer → PDF).");
  };

  const exportText = () => {
    if (!draft) return;
    const text = [
      "=== BROUILLON COURRIER MNDPT (à valider) ===",
      fields.location_date,
      `N° : ${fields.outgoing_reference || "[À CONFIRMER]"}`,
      `Réf. : ${fields.incoming_number || "—"} ${fields.incoming_date || ""}`,
      `Objet : ${draft.subject || fields.subject}`,
      "",
      bodyEdit,
      "",
      fields.signatory_title,
      fields.signatory_name,
    ].join("\n");
    downloadBlob(
      `brouillon-courrier-${Date.now()}.txt`,
      text,
      "text/plain;charset=utf-8",
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Espace de travail — Assistant de rédaction
        </h2>
        <p className="text-xs text-muted-foreground">
          Modèle MNDPT par défaut. L&apos;IA propose un brouillon ; vous
          vérifiez, corrigez et exportez. Aucun envoi automatique.
        </p>
      </div>

      <Card className="border-border/80">
        <CardContent className="space-y-5 pt-6">
          <StepDots steps={STEPS} current={step} />

          {step === 0 ? (
            <div className="space-y-4">
              <div className="rounded-md border border-brand/20 bg-brand-soft/40 px-3 py-2 text-xs">
                <strong>Modèle :</strong> Courrier administratif MNDPT
                (Madagascar). Les logos officiels seront intégrés dès que le
                fichier DOCX source sera fourni.
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">Courrier reçu (texte)</Label>
                <Textarea
                  id="source"
                  rows={12}
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder="Collez ici le texte du courrier auquel vous répondez…"
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Vous pouvez coller un texte extrait d&apos;un PDF ou d&apos;un
                  scan. Vérifiez toujours les champs à l&apos;étape suivante.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || sourceText.trim().length < 20}
                  onClick={() => {
                    setFields(emptyFields());
                    setStep(1);
                  }}
                >
                  Saisie manuelle seule
                </Button>
                <Button
                  type="button"
                  disabled={busy || sourceText.trim().length < 20}
                  onClick={() => void runExtract()}
                >
                  {busy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-4" />
                  )}
                  Analyser et préremplir
                </Button>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              {extractMeta ? (
                <p className="text-xs text-muted-foreground">{extractMeta}</p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["subject", "Objet"],
                    ["incoming_number", "Réf. / N° entrant"],
                    ["incoming_date", "Date du courrier reçu"],
                    ["sender_org", "Expéditeur (organisme)"],
                    ["sender_title", "Qualité expéditeur"],
                    ["sender_name", "Nom expéditeur"],
                    ["recipient_org", "Destinataire (organisme)"],
                    ["recipient_title", "Qualité destinataire"],
                    ["recipient_name", "Nom destinataire"],
                    ["location_date", "Lieu et date"],
                    ["outgoing_reference", "N° sortant (manuel)"],
                    ["signatory_title", "Fonction du signataire"],
                    ["signatory_name", "Nom du signataire"],
                  ] as Array<[keyof Fields, string]>
                ).map(([key, label]) => (
                  <div
                    key={key}
                    className={cn(
                      "space-y-1",
                      key === "subject" || key === "location_date"
                        ? "sm:col-span-2"
                        : "",
                    )}
                  >
                    <Label htmlFor={key}>{label}</Label>
                    <Input
                      id={key}
                      value={fields[key]}
                      onChange={(e) => setField(key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(0)}>
                  <ArrowLeft className="mr-2 size-4" />
                  Retour
                </Button>
                <Button type="button" onClick={() => setStep(2)}>
                  Continuer
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                L&apos;intention de réponse est <strong>obligatoire</strong> :
                l&apos;IA ne doit pas décider à votre place.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {INTENTS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setIntent(item)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      intent === item
                        ? "border-brand bg-brand-soft"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
              {intent === "Autre (préciser ci-dessous)" ? (
                <Textarea
                  rows={2}
                  value={intentOther}
                  onChange={(e) => setIntentOther(e.target.value)}
                  placeholder="Décrivez précisément la position à communiquer…"
                />
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="instr">Consignes complémentaires (optionnel)</Label>
                <Textarea
                  id="instr"
                  rows={3}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>
              <div className="flex justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 size-4" />
                  Retour
                </Button>
                <Button
                  type="button"
                  disabled={busy || !resolvedIntent}
                  onClick={() => void runGenerate()}
                >
                  {busy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-4" />
                  )}
                  Générer le brouillon
                </Button>
              </div>
            </div>
          ) : null}

          {step === 3 && draft ? (
            <div className="space-y-4">
              {warnings.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  <strong>À vérifier avant usage officiel :</strong>
                  <ul className="mt-1 list-inside list-disc">
                    {warnings.slice(0, 6).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label>Objet du brouillon</Label>
                <Input
                  value={draft.subject}
                  onChange={(e) =>
                    setDraft({ ...draft, subject: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Corps du courrier (éditable)</Label>
                <Textarea
                  rows={14}
                  value={bodyEdit}
                  onChange={(e) => setBodyEdit(e.target.value)}
                  className="font-serif text-sm leading-relaxed"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-[10px]">
                  Source : {draft.source === "ia" ? "IA" : "local"}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Intention : {resolvedIntent}
                </Badge>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 size-4" />
                  Intention
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void runGenerate()}
                  >
                    Régénérer
                  </Button>
                  <Button type="button" onClick={() => setStep(4)}>
                    Export
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 && draft ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
                <p className="font-medium">Prêt à exporter le brouillon</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ce fichier n&apos;est pas un acte officiel tant qu&apos;il n&apos;a
                  pas été validé et signé hors de l&apos;application. Pour un PDF :
                  ouvrez le HTML → Imprimer → Enregistrer au format PDF.
                </p>
              </div>
              {warnings.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                  {warnings.slice(0, 4).join(" · ")}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={openPreview}>
                  <Printer className="mr-2 size-4" />
                  Aperçu
                </Button>
                <Button type="button" onClick={exportHtml}>
                  <Download className="mr-2 size-4" />
                  Télécharger HTML
                </Button>
                <Button type="button" variant="outline" onClick={exportText}>
                  <FileText className="mr-2 size-4" />
                  Télécharger texte
                </Button>
              </div>
              <div className="flex justify-between gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setStep(3)}>
                  <ArrowLeft className="mr-2 size-4" />
                  Brouillon
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setStep(0);
                    setSourceText("");
                    setFields(emptyFields());
                    setIntent("");
                    setIntentOther("");
                    setInstructions("");
                    setDraft(null);
                    setBodyEdit("");
                    setExtractMeta(null);
                  }}
                >
                  Nouveau brouillon
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
