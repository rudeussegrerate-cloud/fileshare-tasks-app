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
  fileIconFor,
  formatBytes,
  formatDateTime,
  type DocumentStatus,
} from "./shared";

export function DocumentDetailDialog({
  documentId,
  onOpenChange,
}: {
  documentId: Id<"documents"> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const document = useQuery(
    api.documents.get,
    documentId ? { documentId } : "skip",
  );
  const auditLogs = useQuery(
    api.documents.auditTrail,
    documentId ? { documentId } : "skip",
  );
  const markViewed = useMutation(api.documents.markViewed);
  const setStatus = useMutation(api.documents.setStatus);
  const archiveDoc = useMutation(api.documents.archive);
  const unarchiveDoc = useMutation(api.documents.unarchive);
  const removeDoc = useMutation(api.documents.remove);
  const retrySummary = useMutation(api.documents.retrySummary);

  const printDocument = () => {
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
<div class="meta">ScanDoc · Fiche document</div>
<div class="box"><div class="label">Fichier</div>${esc(documentOrNull.fileName)}</div>
<div class="box"><div class="label">De</div>${esc(documentOrNull.senderName ?? "—")} → ${esc(documentOrNull.recipientName ?? "—")}</div>
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

  // Opening a document counts as consulting it for the sender.
  useEffect(() => {
    if (!document?.isRecipient) return;
    if (document.status !== "envoye") return;
    if (viewedRef.current === document._id) return;
    viewedRef.current = document._id;
    void markViewed({ documentId: document._id });
  }, [document, markViewed]);

  const handleStatus = async (status: DocumentStatus) => {
    if (!documentId) return;
    try {
      await setStatus({ documentId, status });
      toast.success(`Statut mis à jour : ${STATUS_META[status].label}`);
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
      toast.success("Document archivé");
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
      toast.success("Document désarchivé");
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
        "Supprimer définitivement ce document ? Cette action est irréversible.",
      )
    )
      return;
    setBusy(true);
    try {
      await removeDoc({ documentId });
      toast.success("Document supprimé définitivement");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible de supprimer.",
      );
    } finally {
      setBusy(false);
    }
  };

  const documentOrNull = document;
  // Ne pas utiliser React.ComponentType sans import React (crash runtime).
  const Icon = documentOrNull ? fileIconFor(documentOrNull.fileName) : FileText;

  return (
    <Dialog open={documentId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {documentOrNull === undefined || documentOrNull === null ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-brand-soft text-brand">
                  <Icon className="size-5" />
                </div>
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
              <StatusBadge status={documentOrNull.status} />
            </div>

            <Separator />

            <section className="space-y-2 rounded-sm border border-border bg-card px-4 py-3 text-sm">
              <p>
                <span className="text-muted-foreground">Expéditeur : </span>
                <span className="font-medium">{documentOrNull.senderName}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Département expéditeur : </span>
                <span className="font-medium">{documentOrNull.senderDepartmentName ?? "—"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Destinataire : </span>
                <span className="font-medium">{documentOrNull.recipientName}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Département destinataire : </span>
                <span className="font-medium">{documentOrNull.recipientDepartmentName ?? "—"}</span>
              </p>
            </section>

            {documentOrNull.objet ? (
              <section className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Objet
                </p>
                <p className="rounded-sm border border-border bg-card px-4 py-3 text-sm leading-relaxed">
                  <span className="text-muted-foreground">Objet : </span>
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

            {documentOrNull.isRecipient ? (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Statut du traitement
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  L'émetteur voit ce statut en temps réel.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["consulte", "en_cours", "traite"] as DocumentStatus[]).map(
                    (status) => {
                      const active = documentOrNull.status === status;
                      const Icon = STATUS_META[status].icon;
                      return (
                        <Button
                          key={status}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          className={cn(
                            "gap-1.5",
                            active && "bg-brand text-primary-foreground",
                          )}
                          onClick={() => handleStatus(status)}
                        >
                          <Icon className="size-3.5" />
                          {STATUS_META[status].label}
                        </Button>
                      );
                    },
                  )}
                </div>
              </section>
            ) : (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Suivi du destinataire
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
                  ? `Envoyé par ${documentOrNull.senderName}`
                  : `Envoyé à ${documentOrNull.recipientName}`}{" "}
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
