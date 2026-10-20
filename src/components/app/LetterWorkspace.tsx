import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import {
  LETTER_VARIABLE_META,
  MNDPT_FIXED,
  MNDPT_TEMPLATE_ID,
  type BlankLetterModel,
  createBlankMndptLetter,
  renderMndptLetterHtml,
} from "@/lib/mndptLetterTemplate";
import { cn } from "@/lib/utils";
import { useAction } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Eye,
  FileText,
  Loader2,
  Printer,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StepDots } from "./shared";

const STEPS = ["Modèle", "Compléter", "Assistant", "Aperçu"];

const INTENTS = [
  "Accusé de réception",
  "Demande de complément d'information",
  "Transmission pour suite à donner",
  "Acceptation",
  "Refus",
  "Information / notification",
  "Autre (préciser)",
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

function setVar(
  model: BlankLetterModel,
  key: keyof BlankLetterModel["variables"],
  value: string,
): BlankLetterModel {
  return {
    ...model,
    variables: { ...model.variables, [key]: value },
  };
}

export function LetterWorkspace() {
  const extractFields = useAction(api.letterAssistant.extractFields);
  const generateDraft = useAction(api.letterAssistant.generateDraft);

  const [step, setStep] = useState(0);
  const [model, setModel] = useState<BlankLetterModel>(() =>
    createBlankMndptLetter(),
  );
  const [sourceText, setSourceText] = useState("");
  const [intent, setIntent] = useState("");
  const [intentOther, setIntentOther] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFixedInfo, setShowFixedInfo] = useState(true);

  const resolvedIntent =
    intent === "Autre (préciser)" ? intentOther.trim() : intent.trim();

  const missing = useMemo(() => {
    const v = model.variables;
    const m: string[] = [];
    if (!v.subject.trim()) m.push("Objet");
    if (!v.recipient_block.trim()) m.push("Destinataire");
    if (!v.body.trim() || v.body.includes("[À COMPLÉTER")) m.push("Corps");
    if (!v.signatory_title.trim()) m.push("Fonction du signataire");
    return m;
  }, [model.variables]);

  const startBlank = () => {
    setModel(createBlankMndptLetter());
    setSourceText("");
    setIntent("");
    setIntentOther("");
    setInstructions("");
    setStep(1);
    toast.success("Modèle vierge MNDPT prêt à compléter.");
  };

  const runExtract = async () => {
    if (sourceText.trim().length < 20) {
      toast.error("Collez d'abord le texte du courrier reçu.");
      return;
    }
    setBusy(true);
    try {
      const res = await extractFields({ sourceText });
      setModel((m) => {
        let next = { ...m };
        const v = { ...m.variables };
        if (res.subject) v.subject = res.subject;
        if (res.incoming_number || res.incoming_date) {
          v.incoming_reference = [res.incoming_number, res.incoming_date]
            .filter(Boolean)
            .join(" — ");
        }
        const dest = [
          res.recipient_title,
          res.recipient_name,
          res.recipient_org,
        ]
          .filter(Boolean)
          .join("\n");
        if (dest) v.recipient_block = dest;
        next = { ...m, variables: v };
        return next;
      });
      setStep(1);
      toast.success("Champs proposés à partir du courrier — vérifiez-les.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Extraction impossible.");
    } finally {
      setBusy(false);
    }
  };

  const runGenerate = async () => {
    if (!resolvedIntent) {
      toast.error("Choisissez l'intention de réponse.");
      return;
    }
    setBusy(true);
    try {
      const v = model.variables;
      const res = await generateDraft({
        sourceText: sourceText || v.subject || "Courrier sans texte source",
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
        responseIntent: resolvedIntent,
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
          attachments: res.attachments?.join(", ") || m.variables.attachments,
        },
      }));
      if (res.warnings?.length) toast.message(res.warnings[0]);
      setStep(1);
      toast.success("Brouillon intégré au modèle — relisez les champs.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Génération impossible.");
    } finally {
      setBusy(false);
    }
  };

  const openPreview = () => {
    const html = renderMndptLetterHtml(model);
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Autorisez les fenêtres pop-up.");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const exportHtml = () => {
    if (missing.length) {
      const ok = window.confirm(
        `Champs incomplets : ${missing.join(", ")}.\nExporter quand même ?`,
      );
      if (!ok) return;
    }
    downloadBlob(
      `courrier-mndpt-${Date.now()}.html`,
      renderMndptLetterHtml(model),
      "text/html;charset=utf-8",
    );
    toast.success("HTML téléchargé — Imprimer → PDF pour un fichier PDF.");
  };

  const exportText = () => {
    const v = model.variables;
    const f = model.fixed;
    const text = [
      f.republic,
      f.ministry,
      f.headerNote,
      v.sender_service,
      "",
      `N° ${v.outgoing_reference || "…"}`,
      v.incoming_reference ? `Réf. ${v.incoming_reference}` : "",
      v.location_date,
      "",
      v.recipient_block,
      "",
      `Objet : ${v.subject}`,
      "",
      v.body,
      "",
      v.attachments ? `P.J. : ${v.attachments}` : "",
      "",
      v.signatory_title,
      v.signatory_name,
      "",
      `— ${f.disclaimer}`,
    ]
      .filter((l) => l !== undefined)
      .join("\n");
    downloadBlob(
      `courrier-mndpt-${Date.now()}.txt`,
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
          Un <strong>modèle MNDPT fixe</strong> (en-tête institutionnel) + des
          champs à compléter. L&apos;IA aide au texte, sans modifier le modèle.
        </p>
      </div>

      <Card className="border-border/80">
        <CardContent className="space-y-5 pt-6">
          <StepDots steps={STEPS} current={step} />

          {/* ——— Étape 0 : modèle ——— */}
          {step === 0 ? (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-brand/30 bg-brand-soft/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {MNDPT_FIXED.modelLabel}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Identifiant : {MNDPT_TEMPLATE_ID} · Éléments fixes non
                      modifiables par l&apos;IA
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    Par défaut
                  </Badge>
                </div>

                <div className="mt-4 grid gap-2 rounded-md border border-border bg-card p-3 text-center text-[10px] uppercase tracking-wide text-muted-foreground sm:grid-cols-3">
                  <div className="rounded border border-dashed border-border px-2 py-4">
                    {MNDPT_FIXED.leftLogoLabel}
                  </div>
                  <div className="space-y-1 px-2 py-2 normal-case tracking-normal">
                    <div className="text-[10px] uppercase">
                      {MNDPT_FIXED.republic}
                    </div>
                    <div className="text-[11px] font-semibold leading-snug">
                      {MNDPT_FIXED.ministry}
                    </div>
                    <div className="text-[10px]">{MNDPT_FIXED.headerNote}</div>
                  </div>
                  <div className="rounded border border-dashed border-border px-2 py-4">
                    {MNDPT_FIXED.centerEmblemLabel}
                  </div>
                </div>

                <button
                  type="button"
                  className="mt-3 text-left text-[11px] text-brand underline-offset-2 hover:underline"
                  onClick={() => setShowFixedInfo((v) => !v)}
                >
                  {showFixedInfo ? "Masquer" : "Voir"} ce qui ne change jamais
                </button>
                {showFixedInfo ? (
                  <ul className="mt-2 list-inside list-disc text-[11px] text-muted-foreground">
                    <li>République / Ministère / Secrétariat général</li>
                    <li>Zones logo MNDPT et emblème (fichiers officiels à venir)</li>
                    <li>Structure de page : N°, date, destinataire, objet, corps, signature</li>
                    <li>
                      L&apos;IA ne redessine pas l&apos;en-tête et n&apos;invente
                      pas de N° officiel
                    </li>
                  </ul>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={startBlank}>
                  Générer un modèle vierge
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Ensuite : complétez les champs, ou utilisez l&apos;assistant
                pour préremplir à partir d&apos;un courrier reçu.
              </p>
            </div>
          ) : null}

          {/* ——— Étape 1 : compléter ——— */}
          {step === 1 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-brand text-primary-foreground">
                  Modèle MNDPT
                </Badge>
                {missing.length > 0 ? (
                  <span className="text-[11px] text-amber-700">
                    À compléter : {missing.join(", ")}
                  </span>
                ) : (
                  <span className="text-[11px] text-emerald-700">
                    Champs indispensables renseignés
                  </span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    "location_date",
                    "outgoing_reference",
                    "incoming_reference",
                    "sender_service",
                    "subject",
                    "signatory_title",
                    "signatory_name",
                    "attachments",
                  ] as const
                ).map((key) => {
                  const meta = LETTER_VARIABLE_META[key];
                  return (
                    <div
                      key={key}
                      className={cn(
                        "space-y-1",
                        key === "subject" ? "sm:col-span-2" : "",
                      )}
                    >
                      <Label htmlFor={key}>
                        {meta.label}
                        {meta.required ? (
                          <span className="text-destructive"> *</span>
                        ) : null}
                      </Label>
                      <Input
                        id={key}
                        value={model.variables[key]}
                        onChange={(e) =>
                          setModel((m) => setVar(m, key, e.target.value))
                        }
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {meta.hint}
                      </p>
                    </div>
                  );
                })}

                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="recipient_block">
                    {LETTER_VARIABLE_META.recipient_block.label}
                    <span className="text-destructive"> *</span>
                  </Label>
                  <Textarea
                    id="recipient_block"
                    rows={3}
                    value={model.variables.recipient_block}
                    onChange={(e) =>
                      setModel((m) =>
                        setVar(m, "recipient_block", e.target.value),
                      )
                    }
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="body">
                    {LETTER_VARIABLE_META.body.label}
                    <span className="text-destructive"> *</span>
                  </Label>
                  <Textarea
                    id="body"
                    rows={12}
                    className="font-serif text-sm leading-relaxed"
                    value={model.variables.body}
                    onChange={(e) =>
                      setModel((m) => setVar(m, "body", e.target.value))
                    }
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(0)}>
                  <ArrowLeft className="mr-2 size-4" />
                  Modèle
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(2)}
                  >
                    <Sparkles className="mr-2 size-4" />
                    Aide IA
                  </Button>
                  <Button type="button" onClick={() => setStep(3)}>
                    Aperçu / export
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {/* ——— Étape 2 : assistant IA (optionnel) ——— */}
          {step === 2 ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                L&apos;assistant préremplit les <strong>champs variables</strong>{" "}
                du modèle. L&apos;en-tête institutionnel reste inchangé.
              </p>
              <div className="space-y-2">
                <Label>Texte du courrier reçu (optionnel)</Label>
                <Textarea
                  rows={8}
                  className="font-mono text-sm"
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder="Collez le courrier auquel vous répondez…"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || sourceText.trim().length < 20}
                  onClick={() => void runExtract()}
                >
                  {busy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-4" />
                  )}
                  Extraire les champs
                </Button>
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <Label>Intention de réponse (pour rédiger le corps)</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {INTENTS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setIntent(item)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-sm",
                        intent === item
                          ? "border-brand bg-brand-soft"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {intent === "Autre (préciser)" ? (
                  <Textarea
                    rows={2}
                    value={intentOther}
                    onChange={(e) => setIntentOther(e.target.value)}
                  />
                ) : null}
                <Textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Consignes complémentaires (optionnel)"
                />
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
                  Rédiger le corps dans le modèle
                </Button>
              </div>

              <div className="flex justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 size-4" />
                  Compléter
                </Button>
                <Button type="button" onClick={() => setStep(3)}>
                  Aperçu
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            </div>
          ) : null}

          {/* ——— Étape 3 : aperçu / export ——— */}
          {step === 3 ? (
            <div className="space-y-4">
              {missing.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  Champs encore vides : {missing.join(", ")}. Vous pouvez
                  exporter un brouillon, mais pas l&apos;utiliser comme acte
                  officiel.
                </div>
              ) : null}

              <div className="overflow-hidden rounded-md border border-border bg-muted/20">
                <div className="border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                  Aperçu du modèle (en-tête fixe + vos champs)
                </div>
                <iframe
                  title="Aperçu courrier MNDPT"
                  className="h-[420px] w-full bg-white"
                  srcDoc={renderMndptLetterHtml(model)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={openPreview}>
                  <Eye className="mr-2 size-4" />
                  Ouvrir
                </Button>
                <Button type="button" variant="outline" onClick={openPreview}>
                  <Printer className="mr-2 size-4" />
                  Imprimer / PDF
                </Button>
                <Button type="button" onClick={exportHtml}>
                  <Download className="mr-2 size-4" />
                  HTML
                </Button>
                <Button type="button" variant="outline" onClick={exportText}>
                  <FileText className="mr-2 size-4" />
                  Texte
                </Button>
              </div>

              <div className="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 size-4" />
                  Modifier les champs
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setModel(createBlankMndptLetter());
                    setSourceText("");
                    setIntent("");
                    setStep(0);
                  }}
                >
                  Nouveau modèle vierge
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
