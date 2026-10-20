import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArchiveRestore,
  Download,
  Printer,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  STATUS_META,
  STATUS_ORDER,
  StatusBadge,
  FileThumb,
  formatBytes,
  formatDateTime,
  structureRecipient,
  structureSender,
  type DocumentStatus,
  PREDEFINED_TASKS,
} from "./shared";
import { CircuitPathMap } from "./CircuitPathMap";
import { Checkbox } from "@/components/ui/checkbox";

export function DocumentDetailDialog({
  documentId,
  onOpenChange,
  onReply,
}: {
  documentId: Id<"documents"> | null;
  onOpenChange: (open: boolean) => void;
  /** Ouvre le formulaire d'envoi en mode réponse à ce courrier */
  onReply?: (parent: {
    documentId: Id<"documents">;
    publicRef?: string | null;
    objet: string;
    senderDepartmentId?: Id<"departments"> | null;
  }) => void;
}) {
  const courrier = useQuery(
    api.documents.get,
    documentId ? { documentId } : "skip",
  );
  const auditLogs = useQuery(
    api.documents.auditTrail,
    documentId ? { documentId } : "skip",
  );
  const markViewed = useMutation(api.documents.markViewed);
  const setStatus = useMutation(api.documents.setStatus);
  const completeStep = useMutation(api.documents.completeStep);
  const [stepNote, setStepNote] = useState("");

  const archiveDoc = useMutation(api.documents.archive);
  const unarchiveDoc = useMutation(api.documents.unarchive);
  const removeDoc = useMutation(api.documents.remove);
  const retrySummary = useMutation(api.documents.retrySummary);

  const printCourrier = () => {
    if (!documentOrNull) return;
    const w = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
    if (!w) {
      toast.error("Autorisez les pop-ups pour imprimer.");
      return;
    }
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const tasks = Array.isArray(documentOrNull.tasks)
      ? documentOrNull.tasks.join(", ")
      : documentOrNull.task ?? "—";
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>${esc(documentOrNull.objet || documentOrNull.fileName)}</title>
<style>
  body{font-family:Georgia,serif;max-width:720px;margin:24px auto;padding:0 16px;color:#222;line-height:1.45}
  h1{font-size:1.35rem;margin:0 0 8px}
  .meta{font-size:0.85rem;color:#555;margin-bottom:16px}
  .box{border:1px solid #ccc;border-radius:8px;padding:12px 14px;margin:12px 0;background:#faf8f4}
  .label{font-size:0.7rem;text-transform:uppercase;letter-spacing:0.04em;color:#666;margin-bottom:4px}
  pre{white-space:pre-wrap;font-family:inherit;margin:0}
  @media print{body{margin:0}}
</style></head><body>
<h1>${esc(documentOrNull.objet || documentOrNull.fileName)}</h1>
<div class="meta">ScanDoc · Fiche courrier</div>
<div class="box"><div class="label">Fichier</div>${esc(documentOrNull.fileName)}</div>
<div class="box"><div class="label">De</div>${esc(structureSender(documentOrNull))} → ${esc(structureRecipient(documentOrNull))}</div>
<div class="box"><div class="label">Tâches</div>${esc(String(tasks))}</div>
<div class="box"><div class="label">Statut</div>${esc(documentOrNull.status ?? "—")}</div>
<div class="box"><div class="label">Résumé / explication</div><pre>${esc(documentOrNull.summary ?? "Aucun résumé.")}</pre></div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`);
    w.document.close();
  };
  const viewedRef = useRef<Id<"documents"> | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [busy, setBusy] = useState(false);

  // Opening a courrier counts as consulting it for the sender.
  useEffect(() => {
    if (!courrier?.isRecipient && !courrier?.canUpdateStatus) return;
    if (courrier.status !== "envoye") return;
    if (viewedRef.current === courrier._id) return;
    viewedRef.current = courrier._id;
    void markViewed({ documentId: courrier._id }).catch(() => {
      /* ne bloque pas l'ouverture */
    });
  }, [courrier, markViewed]);

  const handleStatus = async (status: DocumentStatus) => {
    if (!documentId) return;
    try {
      const res = await setStatus({ documentId, status });
      if (res && typeof res === "object" && "outcome" in res) {
        if (res.outcome === "circuit_complete") {
          toast.success("Courrier classé — l'émetteur est notifié");
        } else if (res.outcome === "step_advanced") {
          toast.success(
            `Votre étape est terminée → transmis à ${(res as { nextAssignee?: string }).nextAssignee ?? "la suite"}`,
          );
        } else {
          toast.success(
          status === "consulte"
            ? "Courrier marqué comme lu"
            : status === "en_cours"
              ? "Courrier en traitement"
              : status === "traite"
                ? "Courrier classé"
                : `État : ${STATUS_META[status].label}`,
        );
        }
      } else {
        toast.success(
          status === "consulte"
            ? "Courrier marqué comme lu"
            : status === "en_cours"
              ? "Courrier en traitement"
              : status === "traite"
                ? "Courrier classé"
                : `État : ${STATUS_META[status].label}`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible de changer le statut.",
      );
    }
  };

  const handleArchive = async () => {
    if (!documentId) return;
    setBusy(true);
    try {
      await archiveDoc({ documentId });
      toast.success("Courrier archivé");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible d'archiver.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUnarchive = async () => {
    if (!documentId) return;
    setBusy(true);
    try {
      await unarchiveDoc({ documentId });
      toast.success("Courrier désarchivé");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible de désarchiver.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!documentId) return;
    if (
      !window.confirm(
        "Supprimer définitivement ce courrier ? Cette action est irréversible.",
      )
    )
      return;
    setBusy(true);
    try {
      await removeDoc({ documentId });
      toast.success("Courrier supprimé définitivement");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible de supprimer.",
      );
    } finally {
      setBusy(false);
    }
  };

  const documentOrNull = courrier;
  // Ne pas utiliser React.ComponentType sans import React (crash runtime).
  const showThumb = Boolean(documentOrNull);

  return (
    <Dialog open={documentId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {documentOrNull === undefined ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : documentOrNull === null ? (
          <div className="space-y-3 py-10 text-center">
            <p className="font-medium text-foreground">Courrier inaccessible</p>
            <p className="text-sm text-muted-foreground">
              Ce dossier n&apos;existe plus ou vous n&apos;y avez pas accès.
            </p>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                {documentOrNull ? (
                  <FileThumb
                    fileName={documentOrNull.fileName}
                    contentType={documentOrNull.contentType}
                    fileUrl={(documentOrNull as { fileUrl?: string | null }).fileUrl ?? (documentOrNull as { downloadUrl?: string | null }).downloadUrl}
                    size="lg"
                  />
                ) : null}
                <div className="min-w-0">
                  <DialogTitle className="truncate text-lg">
                    {documentOrNull.fileName}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5">
                    {formatBytes(documentOrNull.size)} · {formatDateTime(documentOrNull.createdAt)}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {formatDateTime(documentOrNull.createdAt)} · {formatBytes(documentOrNull.size)}
              </p>
              <StatusBadge
                status={
                  (["envoye", "consulte", "en_cours", "traite"].includes(
                    documentOrNull.status,
                  )
                    ? documentOrNull.status
                    : "envoye") as DocumentStatus
                }
              />
            </div>

            {documentOrNull.requiresResponse ? (
              <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                Une <strong>réponse</strong> est attendue pour ce courrier.
              </p>
            ) : null}
            {documentOrNull.canReply && onReply ? (
              <Button
                type="button"
                className="w-full gap-2"
                onClick={() => {
                  onReply({
                    documentId: documentOrNull._id,
                    publicRef: documentOrNull.publicRef,
                    objet: documentOrNull.objet || documentOrNull.fileName,
                    senderDepartmentId:
                      (
                        documentOrNull as {
                          senderDepartmentId?: Id<"departments"> | null;
                        }
                      ).senderDepartmentId ?? null,
                  });
                  onOpenChange(false);
                }}
              >
                Répondre à ce courrier
              </Button>
            ) : null}
            {documentOrNull.referenceText ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Réf. :</span>{" "}
                {documentOrNull.referenceText}
              </p>
            ) : null}
            {documentOrNull.publicRef ? (
              <section className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  N° du courrier
                </p>
                <p className="font-mono text-sm font-semibold tracking-wide text-foreground">
                  {documentOrNull.publicRef}
                </p>
                {(documentOrNull.revisionCount ?? 0) > 0 ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {documentOrNull.revisionCount} version(s) jointe(s)
                    {documentOrNull.lastRevisedByName
                      ? ` · dernier : ${documentOrNull.lastRevisedByName}`
                      : ""}
                  </p>
                ) : null}
              </section>
            ) : null}

            {!documentOrNull.isSender &&
            documentOrNull.relativeTracking ? (
              <section className="rounded-lg border border-brand/20 bg-brand-soft/40 p-3 text-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Votre suivi (relatif)
                </p>
                <p className="mt-1">
                  <span className="text-muted-foreground">Recevoir de · </span>
                  <span className="font-medium">
                    {documentOrNull.relativeTracking.receiveFrom}
                  </span>
                </p>
                {documentOrNull.relativeTracking.sendTo ? (
                  <p>
                    <span className="text-muted-foreground">Puis transmettre à · </span>
                    <span className="font-medium">
                      {documentOrNull.relativeTracking.sendTo}
                    </span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Vous êtes la dernière étape : votre validation clôture le circuit.
                  </p>
                )}
                <p className="mt-2 text-xs">
                  {documentOrNull.relativeTracking.isMyTurn
                    ? "C'est votre tour de traiter ce courrier."
                    : documentOrNull.relativeTracking.waitingForPrevious
                      ? "En attente de la personne précédente."
                      : documentOrNull.relativeTracking.myStatus === "done"
                        ? "Vous avez déjà validé votre étape."
                        : "En attente dans le circuit."}
                </p>
              </section>
            ) : null}

            <Separator />


            <section className="space-y-2 rounded-sm border border-border bg-card px-4 py-3 text-sm">
              {documentOrNull.observations ? (
                <p>
                  <span className="text-muted-foreground">Observations : </span>
                  <span className="font-medium whitespace-pre-wrap">{documentOrNull.observations}</span>
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">Expéditeur : </span>
                <span className="font-medium">{structureSender(documentOrNull)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Destinataire : </span>
                <span className="font-medium">{structureRecipient(documentOrNull)}</span>
              </p>
            </section>

            {Array.isArray(
              (documentOrNull as { customFields?: { label: string; value: string }[] })
                .customFields,
            ) &&
            (
              (documentOrNull as { customFields?: { label: string; value: string }[] })
                .customFields?.length ?? 0
            ) > 0 ? (
              <section className="space-y-2 rounded-sm border border-border bg-card px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Champs complémentaires
                </p>
                <ul className="space-y-1">
                  {(
                    documentOrNull as {
                      customFields: { label: string; value: string }[];
                    }
                  ).customFields.map((f, i) => (
                    <li key={i}>
                      <span className="text-muted-foreground">{f.label} : </span>
                      <span className="font-medium">{f.value}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {(documentOrNull as { mailKind?: string }).mailKind ===
            "transmission" ? (
              <p className="rounded-sm border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                <strong>Transmission</strong> — courrier papier enregistré
                (sans N° de sortie). Réf. :{" "}
                {(documentOrNull as { referenceText?: string }).referenceText ||
                  "—"}
              </p>
            ) : null}

            {documentOrNull.objet ? (
              <section className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Objet
                </p>
                <p className="rounded-sm border border-border bg-card px-4 py-3 text-sm leading-relaxed">
                  <span className="text-muted-foreground" data-scandoc-tour="doc-objet">Objet : </span>
                  {documentOrNull.objet}
                </p>
              </section>
            ) : null}

            {documentOrNull.onBehalfOfName ? (
              <section className="space-y-2 rounded-sm border border-border bg-card px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  De la part de
                </p>
                <p>
                  <span className="text-muted-foreground">Nom : </span>
                  <span className="font-medium">{documentOrNull.onBehalfOfName}</span>
                </p>
                {documentOrNull.onBehalfOfFunction ? (
                  <p>
                    <span className="text-muted-foreground">Fonction : </span>
                    <span className="font-medium">{documentOrNull.onBehalfOfFunction}</span>
                  </p>
                ) : null}
                {documentOrNull.onBehalfOfDepartment ? (
                  <p>
                    <span className="text-muted-foreground">Département : </span>
                    <span className="font-medium">{documentOrNull.onBehalfOfDepartment}</span>
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tâches
              </p>
              <div className="flex flex-wrap gap-2">
                {(documentOrNull.tasks && documentOrNull.tasks.length > 0
                  ? documentOrNull.tasks
                  : documentOrNull.task
                    ? [documentOrNull.task]
                    : []
                ).map((t: string) => (
                  <Badge
                    key={t}
                    variant="outline"
                    className="border-brand-sky/30 bg-brand-soft text-xs font-medium text-brand-sky"
                  >
                    {t}
                  </Badge>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-brand-sky" />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Résumé automatique
                </h4>
                {documentOrNull.summaryStatus === "pret" && documentOrNull.summarySource ? (
                  <Badge
                    variant="outline"
                    className="border-brand-sky/30 bg-brand-soft text-[10px] font-medium text-brand-sky"
                  >
                    {documentOrNull.summarySource === "ia" ? "IA" : "extrait du texte"}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 rounded-sm border border-border bg-card px-4 py-3">
                {documentOrNull.summaryStatus === "en_attente" ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Génération du résumé en cours…
                  </p>
                ) : (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                    {documentOrNull.summary ?? "Aucun résumé disponible."}
                  </p>
                )}
                {documentOrNull.summaryStatus !== "en_attente" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3 gap-1.5"
                    onClick={async () => {
                      try {
                        await retrySummary({
                          documentId: documentOrNull._id,
                        });
                        toast.success("Nouveau résumé demandé");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Impossible de relancer",
                        );
                      }
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                    Relancer le résumé IA
                  </Button>
                ) : null}
              </div>
            </section>

                        {documentOrNull.canReply && onReply ? (
              <div className="rounded-sm border border-brand/30 bg-brand-soft/40 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Répondre au nom de votre structure. Le N° d&apos;origine sera
                  repris en référence.
                </p>
                <Button
                  type="button"
                  className="w-full gap-2 sm:w-auto"
                  onClick={() => {
                    onReply({
                      documentId: documentOrNull._id,
                      publicRef: documentOrNull.publicRef,
                      objet: documentOrNull.objet || documentOrNull.fileName,
                      senderDepartmentId:
                        (documentOrNull as { senderDepartmentId?: Id<"departments"> | null })
                          .senderDepartmentId ?? null,
                    });
                    onOpenChange(false);
                  }}
                >
                  Répondre à ce courrier
                </Button>
              </div>
            ) : null}

            {documentOrNull.canUpdateStatus || documentOrNull.isRecipient ? (
              <section className="space-y-3">
                {documentOrNull.isSender && documentOrNull.hasCircuit && Array.isArray(documentOrNull.steps) && documentOrNull.steps.length > 0 ? (
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Circuit de traitement ({(documentOrNull.currentStepIndex ?? 0) + 1}/
                      {documentOrNull.circuitTotalSteps ?? documentOrNull.steps.length})
                    </h4>
                    <ol className="mt-2 space-y-1.5">
                      {documentOrNull.steps.map((s: {
                        stepIndex: number;
                        assigneeName: string;
                        status: string;
                        note?: string | null;
                        isMine?: boolean;
                      }) => (
                        <li
                          key={s.stepIndex}
                          className={cn(
                            "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                            s.status === "active" && "bg-brand-soft/60",
                            s.status === "done" && "opacity-80",
                          )}
                        >
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                            {s.stepIndex + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{s.assigneeName}</span>
                            {s.isMine ? (
                              <span className="ml-1 text-[10px] text-brand">(vous)</span>
                            ) : null}
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {s.status === "waiting"
                                ? "En attente"
                                : s.status === "active"
                                  ? "À traiter maintenant"
                                  : s.status === "done"
                                    ? "Validé"
                                    : "Refusé"}
                              {s.note ? ` — ${s.note}` : ""}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>
                    {documentOrNull.canActOnStep ? (
                      <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                        <p className="text-xs text-muted-foreground">
                          C&apos;est votre tour. Validez pour passer à l&apos;étape suivante,
                          ou refusez pour signaler un problème.
                        </p>
                        <textarea
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          rows={2}
                          placeholder="Note optionnelle (avis, réserve…)"
                          value={stepNote}
                          onChange={(e) => setStepNote(e.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="gap-1.5"
                            disabled={busy}
                            onClick={async () => {
                              if (!documentId) return;
                              setBusy(true);
                              try {
                                const res = await completeStep({
                                  documentId,
                                  decision: "done",
                                  note: stepNote.trim() || undefined,
                                });
                                setStepNote("");
                                if (res?.done) {
                                  toast.success("Circuit terminé — courrier traité");
                                } else if (res?.advanced) {
                                  toast.success(
                                    `Étape validée → ${res.nextAssignee ?? "suivant"}`,
                                  );
                                } else {
                                  toast.success("Étape validée");
                                }
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : "Erreur",
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <CheckCircle2 className="size-3.5" />
                            Valider mon étape
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={async () => {
                              if (!documentId) return;
                              setBusy(true);
                              try {
                                await completeStep({
                                  documentId,
                                  decision: "rejected",
                                  note: stepNote.trim() || undefined,
                                });
                                setStepNote("");
                                toast.message("Étape refusée — expéditeur notifié");
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : "Erreur",
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Refuser
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span data-scandoc-tour="doc-status">
                    Traitement du courrier
                  </span>
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  Indiquez où en est le traitement de ce courrier. L&apos;émetteur
                  voit ces mises à jour.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      {
                        status: "consulte" as DocumentStatus,
                        title: "Marquer lu",
                        desc: "Prise de connaissance",
                      },
                      {
                        status: "en_cours" as DocumentStatus,
                        title: "En traitement",
                        desc: "Vous traitez ou préparez une réponse",
                      },
                      {
                        status: "traite" as DocumentStatus,
                        title: "Classer",
                        desc: "Affaire terminée de votre côté",
                      },
                    ] as const
                  ).map((item) => {
                    const active = documentOrNull.status === item.status;
                    const Icon = STATUS_META[item.status].icon;
                    return (
                      <button
                        key={item.status}
                        type="button"
                        onClick={() => void handleStatus(item.status)}
                        className={cn(
                          "rounded-sm border px-3 py-3 text-left transition-all",
                          active
                            ? "border-brand bg-brand-soft shadow-sm"
                            : "border-border bg-card hover:border-brand-sky/50",
                        )}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          <Icon className="size-3.5 shrink-0" />
                          {item.title}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {item.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : (
              <section className="space-y-3">
                {documentOrNull.isSender && documentOrNull.hasCircuit && Array.isArray(documentOrNull.steps) && documentOrNull.steps.length > 0 ? (
                  <div data-scandoc-tour="doc-circuit-map">
                    <CircuitPathMap
                      steps={documentOrNull.steps}
                      currentStepIndex={documentOrNull.currentStepIndex ?? 0}
                      publicRef={documentOrNull.publicRef}
                      isFullyTreated={
                        Boolean(documentOrNull.isFullyTreated) ||
                        documentOrNull.status === "traite"
                      }
                    />
                  </div>
                ) : null}

                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Suivi du courrier
                </h4>
                <ol className="mt-3 space-y-2">
                  {STATUS_ORDER.map((status, index) => {
                    const reached =
                      STATUS_ORDER.indexOf(documentOrNull.status) >= index;
                    return (
                      <li
                        key={status}
                        className="flex items-center gap-2 text-sm"
                      >
                        <CheckCircle2
                          className={cn(
                            "size-4",
                            reached ? "text-emerald-500" : "text-muted-foreground/40",
                          )}
                        />
                        <span
                          className={cn(
                            reached ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {STATUS_META[status].label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {documentOrNull.isRecipient
                  ? `Envoyé par ${structureSender(documentOrNull)}`
                  : `Envoyé à ${structureRecipient(documentOrNull)}`}{" "}
                le {formatDateTime(documentOrNull.createdAt)}
                {documentOrNull.archivedAt
                  ? ` · Archivé le ${formatDateTime(documentOrNull.archivedAt)}`
                  : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {documentOrNull.downloadUrl ? (
                  <Button
                    className="gap-2"
                    variant="outline"
                    onClick={() => {
                      if (!documentOrNull.downloadUrl) return;
                      const anchor = window.document.createElement("a");
                      anchor.href = documentOrNull.downloadUrl;
                      anchor.download = documentOrNull.fileName ?? "";
                      window.document.body.appendChild(anchor);
                      anchor.click();
                      window.document.body.removeChild(anchor);
                    }}
                  >
                    <Download className="size-4" />
                    Télécharger
                  </Button>
                ) : null}

                {documentOrNull.archivedAt ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={busy}
                      onClick={handleUnarchive}
                    >
                      <ArchiveRestore className="size-3.5" />
                      Désarchiver
                    </Button>
                    {documentOrNull.isSender ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-1.5"
                        disabled={busy}
                        onClick={handleDelete}
                      >
                        <Trash2 className="size-3.5" />
                        Supprimer
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={handleArchive}
                  >
                    <Archive className="size-3.5" />
                    Archiver
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowAudit((v) => !v)}
                >
                  <History className="size-3.5" />
                  Historique
                </Button>
              </div>
            </div>

            {showAudit ? (
              <section className="rounded-sm border border-border bg-muted/30 p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Journal d'audit
                </h4>
                {!auditLogs || auditLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucune entrée pour le moment.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {auditLogs.map((log) => (
                      <li
                        key={log._id}
                        className="flex flex-wrap items-baseline gap-x-2 text-xs"
                      >
                        <span className="font-medium text-foreground">
                          {log.actorName}
                        </span>
                        <span className="text-muted-foreground">
                          {log.details ?? log.action}
                        </span>
                        <span className="text-muted-foreground/70">
                          · {formatDateTime(log.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
