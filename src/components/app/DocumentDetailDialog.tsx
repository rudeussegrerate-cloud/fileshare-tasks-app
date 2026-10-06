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
  ArrowRight,
  Download,
  FileText,
  Loader2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useRef } from "react";
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
  const markViewed = useMutation(api.documents.markViewed);
  const setStatus = useMutation(api.documents.setStatus);
  const viewedRef = useRef<Id<"documents"> | null>(null);

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

  const documentOrNull = document;
  const Icon = documentOrNull ? (fileIconFor(documentOrNull.fileName) as React.ComponentType<{ className?: string }>) : FileText;

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
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
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

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-foreground">
                {documentOrNull.senderName}
              </span>
              <span className="text-xs text-muted-foreground">
                {documentOrNull.senderDepartmentName ?? "—"}
              </span>
              <ArrowRight className="size-4 text-muted-foreground" />
              <span className="font-medium text-foreground">
                {documentOrNull.recipientName}
              </span>
              <span className="text-xs text-muted-foreground">
                {documentOrNull.recipientDepartmentName ?? "—"}
              </span>
              <StatusBadge status={documentOrNull.status} className="ml-auto" />
            </div>

            <Separator />

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tâche demandée au destinataire
              </h4>
              <div className="mt-2 rounded-lg border-l-4 border-brand-sky bg-brand-soft/70 px-4 py-3 text-sm leading-relaxed text-foreground">
                {documentOrNull.task}
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
              <div className="mt-2 rounded-lg border border-border bg-card px-4 py-3">
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
              </p>
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
                  Télécharger le fichier
                </Button>
              ) : null}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
