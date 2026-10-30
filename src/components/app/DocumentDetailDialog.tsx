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
  ExternalLink,
  Printer,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Reply,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import JSZip from "jszip";
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
import { ReplyComposer } from "./ReplyComposer";
import {
  CourrierJourneyMap,
  buildJourneyNodes,
} from "./CourrierJourneyMap";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";



/** Télécharge un fichier ou un ZIP si plusieurs pièces du même envoi. */
async function downloadCourrierFiles(
  files: Array<{ fileName: string; downloadUrl: string | null | undefined }>,
  zipBaseName: string,
) {
  const usable = files.filter((f) => f.downloadUrl);
  if (usable.length === 0) {
    toast.error("Aucun fichier téléchargeable.");
    return;
  }
  if (usable.length === 1) {
    const f = usable[0]!;
    const a = window.document.createElement("a");
    a.href = f.downloadUrl!;
    a.download = f.fileName || "document";
    a.rel = "noopener";
    a.target = "_blank";
    a.click();
    return;
  }
  toast.message("Préparation du ZIP…");
  try {
    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const f of usable) {
      const res = await fetch(f.downloadUrl!);
      if (!res.ok) throw new Error("fetch");
      const blob = await res.blob();
      let name = f.fileName || "document";
      if (usedNames.has(name)) {
        const i = name.lastIndexOf(".");
        const base = i > 0 ? name.slice(0, i) : name;
        const ext = i > 0 ? name.slice(i) : "";
        let n = 2;
        while (usedNames.has(`${base} (${n})${ext}`)) n += 1;
        name = `${base} (${n})${ext}`;
      }
      usedNames.add(name);
      zip.file(name, blob);
    }
    const out = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(out);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${zipBaseName || "courrier"}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    toast.success(`${usable.length} fichiers téléchargés (ZIP).`);
  } catch {
    toast.error("Impossible de créer le ZIP. Réessayez fichier par fichier.");
  }
}

export function DocumentDetailDialog({
  documentId,
  onOpenChange,
}: {
  documentId: Id<"documents"> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const courrier = useQuery(
    api.documents.get,
    documentId ? { documentId } : "skip",
  );
  const markViewed = useMutation(api.documents.markViewed);
  const setStatus = useMutation(api.documents.setStatus);
  const archiveDoc = useMutation(api.documents.archive);
  const unarchiveDoc = useMutation(api.documents.unarchive);
  const removeDoc = useMutation(api.documents.remove);
  const retrySummary = useMutation(api.documents.retrySummary);
  const tracking = useQuery(
    api.mailTracking.getTracking,
    documentId ? { documentId } : "skip",
  );
  const transferTargets = useQuery(api.mailTracking.listTransferTargets);
  const receiveCourrier = useMutation(api.mailTracking.receiveCourrier);
  const takeCharge = useMutation(api.mailTracking.takeCharge);
  const completeMyPart = useMutation(api.mailTracking.completeMyPart);
  const transferToPerson = useMutation(api.mailTracking.transferToPerson);
  const classifyDefinitively = useMutation(
    api.mailTracking.classifyDefinitively,
  );
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferUserId, setTransferUserId] = useState("");
  const [transferUserLabel, setTransferUserLabel] = useState("");
  const [transferQuery, setTransferQuery] = useState("");
  const [transferSuggestOpen, setTransferSuggestOpen] = useState(false);
  const [transferNote, setTransferNote] = useState("");
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const traiterFileRef = useRef<HTMLInputElement>(null);
  const [traiterBusy, setTraiterBusy] = useState(false);

  const [viewer, setViewer] = useState<{
    url: string;
    kind: "pdf" | "image" | "other";
  } | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  const openDocumentViewer = async () => {
    const url =
      documentOrNull?.downloadUrl ||
      (documentOrNull as { fileUrl?: string | null } | null)?.fileUrl;
    if (!url || !documentOrNull) return;
    const name = documentOrNull.fileName ?? "document";
    const type = (documentOrNull.contentType ?? "").toLowerCase();
    const isPdf =
      type.includes("pdf") || name.toLowerCase().endsWith(".pdf");
    const isImage =
      type.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);

    setViewerLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const mime =
        blob.type && blob.type !== "application/octet-stream"
          ? blob.type
          : documentOrNull.contentType ||
            (isPdf
              ? "application/pdf"
              : isImage
                ? "image/jpeg"
                : "application/octet-stream");
      const viewBlob = new Blob([await blob.arrayBuffer()], { type: mime });
      if (viewer?.url) {
        try {
          URL.revokeObjectURL(viewer.url);
        } catch {
          /* ignore */
        }
      }
      const objectUrl = URL.createObjectURL(viewBlob);
      setViewer({
        url: objectUrl,
        kind: isPdf ? "pdf" : isImage ? "image" : "other",
      });
    } catch {
      toast.error(
        "Impossible d'afficher le fichier ici. Utilisez Télécharger.",
      );
    } finally {
      setViewerLoading(false);
    }
  };

  // Libérer l'URL blob à la fermeture
  useEffect(() => {
    return () => {
      if (viewer?.url) {
        try {
          URL.revokeObjectURL(viewer.url);
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer?.url]);


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
<div class="meta">Mailaka · Fiche courrier</div>
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
    <>
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
                  <button
                    type="button"
                    className="shrink-0 rounded-md text-left transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    onClick={() => void openDocumentViewer()}
                    title="Visualiser le document"
                  >
                    <FileThumb
                      fileName={documentOrNull.fileName}
                      contentType={documentOrNull.contentType}
                      fileUrl={
                        // Jamais d'URL PDF ici (téléchargement auto mobile)
                        (documentOrNull.contentType ?? "")
                          .toLowerCase()
                          .includes("pdf") ||
                        (documentOrNull.fileName ?? "")
                          .toLowerCase()
                          .endsWith(".pdf")
                          ? null
                          : ((documentOrNull as { fileUrl?: string | null })
                              .fileUrl ??
                            (documentOrNull as { downloadUrl?: string | null })
                              .downloadUrl)
                      }
                      size="lg"
                    />
                  </button>
                ) : null}
                <div className="min-w-0">
                  <DialogTitle className="truncate text-lg">
                    <button
                      type="button"
                      className="truncate text-left hover:underline focus-visible:outline-none"
                      onClick={() => void openDocumentViewer()}
                      title="Visualiser le document"
                    >
                      {documentOrNull.fileName}
                    </button>
                  </DialogTitle>
                  <DialogDescription className="mt-0.5">
                    {formatBytes(documentOrNull.size)} · {formatDateTime(documentOrNull.createdAt)}
                    {documentOrNull.parentCourrierId ? (
                      <span className="ml-2 text-brand">· Réponse à un courrier</span>
                    ) : null}
                    {(documentOrNull as { urgent?: boolean }).urgent && documentOrNull.status !== "traite" ? (
                      <span className="ml-2 inline-flex rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                        Urgent
                      </span>
                    ) : null}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>


            {viewerLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Chargement du document…
              </div>
            ) : null}
            {viewer ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Aperçu
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (viewer.url) {
                        try {
                          URL.revokeObjectURL(viewer.url);
                        } catch {
                          /* ignore */
                        }
                      }
                      setViewer(null);
                    }}
                  >
                    Fermer l&apos;aperçu
                  </Button>
                </div>
                <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                  {viewer.kind === "image" ? (
                    <img
                      src={viewer.url}
                      alt={documentOrNull.fileName}
                      className="mx-auto max-h-[70vh] w-auto max-w-full object-contain"
                    />
                  ) : viewer.kind === "pdf" ? (
                    <iframe
                      src={viewer.url}
                      title={documentOrNull.fileName}
                      className="h-[min(70vh,32rem)] w-full border-0 bg-white"
                    />
                  ) : (
                    <div className="space-y-3 p-6 text-center text-sm">
                      <p className="text-muted-foreground">
                        Aperçu non disponible pour ce type de fichier.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const a = window.document.createElement("a");
                          a.href = viewer.url;
                          a.download = documentOrNull.fileName ?? "document";
                          a.click();
                        }}
                      >
                        Télécharger
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {formatDateTime(documentOrNull.createdAt)} · {formatBytes(documentOrNull.size)}
              </p>
              <StatusBadge
                status={
                  (["envoye", "consulte", "en_cours", "en_retard", "traite"].includes(
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

            <Separator />


            <section className="space-y-2 rounded-sm border border-border bg-card px-4 py-3 text-sm">
              {documentOrNull.observations ? (
                <p>
                  <span className="text-muted-foreground">Observations : </span>
                  <span className="font-medium whitespace-pre-wrap">{documentOrNull.observations}</span>
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">Ce courrier vient de </span>
                <span className="font-medium">{structureSender(documentOrNull)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Il est adressé à </span>
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

            {/* Une seule zone d'actions : Suivi du dossier (plus de doublons Marquer lu / Classer) */}

            {tracking ? (
              <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Suivi du dossier
                    </h4>
                    <p className="mt-1 text-sm text-foreground">
                      {tracking.isClosed ? (
                        <span className="font-medium text-emerald-700">
                          Classé — suivi terminé
                        </span>
                      ) : (
                        <>
                          En ce moment, le dossier est chez{" "}
                          <span className="font-medium">
                            {tracking.currentHolder?.name ?? "—"}
                          </span>
                          {tracking.currentHolder?.fonction
                            ? `, ${tracking.currentHolder.fonction}`
                            : ""}
                          {tracking.currentHolder?.service
                            ? ` (${tracking.currentHolder.service})`
                            : ""}
                        </>
                      )}
                    </p>
                    {tracking.publicRef ? (
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {tracking.publicRef}
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3 gap-2"
                      onClick={() => setJourneyOpen(true)}
                    >
                      Suivre le document
                    </Button>
                  </div>
                </div>

                {!tracking.isClosed && tracking.permissions ? (
                  <div className="flex flex-wrap gap-2">
                    {tracking.permissions.canReceive && !tracking.permissions.canCompletePart ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={trackingBusy}
                        onClick={async () => {
                          setTrackingBusy(true);
                          try {
                            await receiveCourrier({
                              documentId: documentOrNull!._id,
                            });
                            toast.success("Réception confirmée");
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Erreur",
                            );
                          } finally {
                            setTrackingBusy(false);
                          }
                        }}
                      >
                        Réceptionner
                      </Button>
                    ) : null}
                    {tracking.permissions.canCompletePart ? (
                      <>
                        <input
                          ref={traiterFileRef}
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !documentOrNull) return;
                            setTraiterBusy(true);
                            setTrackingBusy(true);
                            try {
                              const uploadUrl = await generateUploadUrl({});
                              const res = await fetch(uploadUrl, {
                                method: "POST",
                                headers: {
                                  "Content-Type":
                                    file.type || "application/octet-stream",
                                },
                                body: file,
                              });
                              if (!res.ok)
                                throw new Error("Échec du téléversement.");
                              const json = (await res.json()) as {
                                storageId: string;
                              };
                              await completeMyPart({
                                documentId: documentOrNull._id,
                                storageId: json.storageId as Id<"_storage">,
                                fileName: file.name,
                                contentType: file.type || undefined,
                                size: file.size,
                              });
                              toast.success(
                                "Part traitée avec la nouvelle version.",
                              );
                            } catch (err) {
                              toast.error(
                                err instanceof Error
                                  ? err.message
                                  : "Erreur",
                              );
                            } finally {
                              setTraiterBusy(false);
                              setTrackingBusy(false);
                              if (traiterFileRef.current)
                                traiterFileRef.current.value = "";
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={trackingBusy || traiterBusy}
                          onClick={async () => {
                            setTrackingBusy(true);
                            try {
                              await completeMyPart({
                                documentId: documentOrNull!._id,
                              });
                              toast.success(
                                "Votre part est traitée. Le classement définitif est réservé à l'émetteur.",
                              );
                            } catch (e) {
                              toast.error(
                                e instanceof Error ? e.message : "Erreur",
                              );
                            } finally {
                              setTrackingBusy(false);
                            }
                          }}
                        >
                          Traiter ma part
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={trackingBusy || traiterBusy}
                          onClick={() => traiterFileRef.current?.click()}
                        >
                          Traiter + joindre un fichier
                        </Button>
                      </>
                    ) : null}
                    {tracking.permissions.canTransfer ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={trackingBusy}
                        onClick={() => setTransferOpen((v) => !v)}
                      >
                        Transmettre à une personne
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {transferOpen && !tracking.isClosed ? (
                  <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                    <Label>Destinataire du transfert</Label>
                    <div className="relative">
                      <Input
                        value={
                          transferUserId && !transferSuggestOpen
                            ? transferUserLabel
                            : transferQuery
                        }
                        onChange={(e) => {
                          setTransferUserId("");
                          setTransferUserLabel("");
                          setTransferQuery(e.target.value);
                          setTransferSuggestOpen(true);
                        }}
                        onFocus={() => setTransferSuggestOpen(true)}
                        onBlur={() =>
                          setTimeout(() => setTransferSuggestOpen(false), 150)
                        }
                        placeholder="Rechercher une personne…"
                        autoComplete="off"
                      />
                      {transferSuggestOpen ? (
                        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-lg">
                          {(transferTargets ?? [])
                            .filter((u: {
                              _id: string;
                              name: string;
                              fonction: string | null;
                              email?: string | null;
                            }) => {
                              const q = transferQuery.trim().toLowerCase();
                              if (!q) return true;
                              const hay = `${u.name} ${u.fonction ?? ""} ${u.email ?? ""}`.toLowerCase();
                              return q
                                .split(/\s+/)
                                .filter(Boolean)
                                .every((tok) => hay.includes(tok));
                            })
                            .slice(0, 12)
                            .map((u: {
                              _id: string;
                              name: string;
                              fonction: string | null;
                            }) => {
                              const label = u.fonction
                                ? `${u.name} · ${u.fonction}`
                                : u.name;
                              const initial = (u.name || "?").charAt(0).toUpperCase();
                              return (
                                <li key={u._id}>
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/70"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      setTransferUserId(u._id);
                                      setTransferUserLabel(label);
                                      setTransferQuery("");
                                      setTransferSuggestOpen(false);
                                    }}
                                  >
                                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand">
                                      {initial}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium text-foreground">
                                        {u.name}
                                      </span>
                                      {u.fonction ? (
                                        <span className="block truncate text-xs text-muted-foreground">
                                          {u.fonction}
                                        </span>
                                      ) : null}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          {(transferTargets ?? []).length === 0 ? (
                            <li className="px-3 py-2 text-sm text-muted-foreground">
                              Aucune personne disponible
                            </li>
                          ) : null}
                        </ul>
                      ) : null}
                    </div>
                    {transferUserId ? (
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                          {(transferUserLabel || "?").charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {transferUserLabel}
                        </span>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setTransferUserId("");
                            setTransferUserLabel("");
                            setTransferQuery("");
                          }}
                        >
                          Retirer
                        </button>
                      </div>
                    ) : null}
                    <Textarea
                      rows={2}
                      placeholder="Instruction (optionnel)"
                      value={transferNote}
                      onChange={(e) => setTransferNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!transferUserId || trackingBusy}
                        onClick={async () => {
                          setTrackingBusy(true);
                          try {
                            await transferToPerson({
                              documentId: documentOrNull!._id,
                              toUserId: transferUserId as Id<"users">,
                              note: transferNote || undefined,
                            });
                            toast.success("Courrier transmis");
                            setTransferOpen(false);
                            setTransferUserId("");
                            setTransferUserLabel("");
                            setTransferQuery("");
                            setTransferNote("");
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Erreur",
                            );
                          } finally {
                            setTrackingBusy(false);
                          }
                        }}
                      >
                        Confirmer le transfert
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setTransferOpen(false);
                          setTransferUserId("");
                          setTransferUserLabel("");
                          setTransferQuery("");
                        }}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : null}

                {tracking.timeline && tracking.timeline.length > 0 ? (
                  <ol className="relative max-h-56 space-y-0 overflow-y-auto border-l border-border pl-4">
                    {tracking.timeline.map((ev: { at: number; title: string; actor: string; fonction?: string | null; service?: string | null; detail?: string | null; type: string }, idx: number) => (
                      <li
                        key={`${ev.at}-${ev.type}-${idx}`}
                        className="relative pb-3 last:pb-0"
                      >
                        <span className="absolute -left-[1.15rem] top-1.5 size-2.5 rounded-full border-2 border-brand bg-card" />
                        <p className="text-sm font-medium text-foreground">
                          {ev.title}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {formatDateTime(ev.at)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ev.actor}
                          {ev.fonction ? ` · ${ev.fonction}` : ""}
                          {ev.service ? ` · ${ev.service}` : ""}
                          {ev.detail ? ` — ${ev.detail}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : null}

                {tracking.closed ? (
                  <p className="text-xs text-emerald-800">
                    Classé définitivement par {tracking.closed.byName}
                    {tracking.closed.byFonction
                      ? `, ${tracking.closed.byFonction}`
                      : ""}
                    {tracking.closed.byDepartment
                      ? ` (${tracking.closed.byDepartment})`
                      : ""}{" "}
                    le {formatDateTime(tracking.closed.at)}
                  </p>
                ) : null}
              </section>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {documentOrNull.isRecipient
                  ? `Reçu de ${structureSender(documentOrNull)}`
                  : `Envoyé à ${structureRecipient(documentOrNull)}`}{" "}
                le {formatDateTime(documentOrNull.createdAt)}
                {documentOrNull.archivedAt
                  ? ` · Archivé le ${formatDateTime(documentOrNull.archivedAt)}`
                  : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                    {documentOrNull.canReply ? (
                    <Button
                      className="gap-2"
                      onClick={() => setReplyOpen(true)}
                    >
                      <Reply className="size-4" />
                      Répondre
                    </Button>
                  ) : null}
                  {documentOrNull.downloadUrl ||
                  ((documentOrNull as { relatedFiles?: { downloadUrl?: string | null }[] }).relatedFiles?.some(
                    (f) => f.downloadUrl,
                  )) ? (
                    <Button
                      className="gap-2"
                      variant="outline"
                      onClick={() => {
                        const related = (
                          documentOrNull as {
                            relatedFiles?: Array<{
                              fileName: string;
                              downloadUrl: string | null;
                            }>;
                          }
                        ).relatedFiles;
                        void downloadCourrierFiles(
                          related && related.length > 0
                            ? related
                            : [
                                {
                                  fileName: documentOrNull.fileName ?? "document",
                                  downloadUrl: documentOrNull.downloadUrl,
                                },
                              ],
                          String(
                            documentOrNull.publicRef ||
                              documentOrNull.objet ||
                              "courrier",
                          )
                            .replace(/[^\w\-]+/g, "_")
                            .slice(0, 40),
                        );
                      }}
                    >
                      <Download className="size-4" />
                      {(documentOrNull as { relatedFiles?: unknown[] }).relatedFiles &&
                      ((documentOrNull as { relatedFiles: unknown[] }).relatedFiles.length > 1)
                        ? "Télécharger tout (ZIP)"
                        : "Télécharger"}
                    </Button>
                  ) : null}
                  {tracking &&
                  !tracking.isClosed &&
                  tracking.permissions?.canClassify ? (
                    <Button
                      className="gap-2 border-emerald-300 text-emerald-800"
                      variant="outline"
                      disabled={trackingBusy}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "Classer définitivement ce courrier ? Le suivi sera terminé.",
                          )
                        )
                          return;
                        setTrackingBusy(true);
                        try {
                          await classifyDefinitively({
                            documentId: documentOrNull!._id,
                          });
                          toast.success("Courrier classé — suivi terminé");
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Erreur",
                          );
                        } finally {
                          setTrackingBusy(false);
                        }
                      }}
                    >
                      Classer définitivement
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

              </div>
            </div>

            
          </>
        )}
      </DialogContent>
    </Dialog>

      <Dialog open={journeyOpen} onOpenChange={setJourneyOpen}>
        <DialogContent className="max-h-[95vh] w-[min(96vw,56rem)] max-w-5xl overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Parcours du document</DialogTitle>
            <DialogDescription>
              Déplacement du courrier d&apos;une personne / d&apos;un service à
              l&apos;autre. La pastille indique où il se trouve maintenant.
            </DialogDescription>
          </DialogHeader>
          {tracking ? (
            <CourrierJourneyMap nodes={buildJourneyNodes(tracking)} />
          ) : (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          )}
          {tracking?.currentHolder && !tracking.isClosed ? (
            <p className="text-center text-sm text-muted-foreground">
              En ce moment chez{" "}
              <span className="font-medium text-foreground">
                {tracking.currentHolder.name}
              </span>
              {tracking.currentHolder.service
                ? ` (${tracking.currentHolder.service})`
                : ""}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      <ReplyComposer
        open={replyOpen}
        onOpenChange={setReplyOpen}
        parent={
          documentOrNull && documentOrNull.canReply
            ? {
                documentId: documentOrNull._id,
                objet: documentOrNull.objet,
                publicRef: documentOrNull.publicRef,
                fileName: documentOrNull.fileName,
                senderId:
                  (documentOrNull as { senderId?: Id<"users"> }).senderId ??
                  null,
                senderName:
                  (documentOrNull as { senderName?: string }).senderName ??
                  null,
                summary:
                  (documentOrNull as { summary?: string | null }).summary ??
                  null,
                extractedText:
                  (documentOrNull as { extractedText?: string | null })
                    .extractedText ?? null,
                observations:
                  (documentOrNull as { observations?: string | null })
                    .observations ?? null,
              }
            : null
        }
      />
</>
  );
}
