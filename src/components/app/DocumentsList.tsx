import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  Archive,
  Download,
  FileText,
  Inbox,
  Loader2,
  Search,
  Send,
} from "lucide-react";
import { MndptLoader } from "@/components/MndptLoader";
import { useMemo, useState } from "react";
import {
  EmptyState,
  STATUS_META,
  StatusBadge,
  fileIconFor,
  formatBytes,
  formatDateTime,
  structureRecipient,
  structureSender,
  type DocumentStatus,
} from "./shared";

type Mode = "inbox" | "sent";

function isImageFile(name: string, contentType?: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name);
}

function isPdfFile(name: string, contentType?: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("pdf")) return true;
  return /\.pdf$/i.test(name);
}

/** Miniature type aperçu document (image réelle ou carte PDF). */
function FileThumb({
  fileName,
  contentType,
  fileUrl,
}: {
  fileName: string;
  contentType?: string | null;
  fileUrl?: string | null;
}) {
  if (fileUrl && isImageFile(fileName, contentType)) {
    return (
      <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted shadow-sm">
        <img
          src={fileUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  if (fileUrl && isPdfFile(fileName, contentType)) {
    return (
      <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-white shadow-sm">
        <iframe
          src={`${fileUrl}#page=1&view=FitH`}
          title=""
          className="pointer-events-none absolute -left-2 -top-1 h-[120%] w-[140%] origin-top-left scale-[0.55] border-0"
          tabIndex={-1}
        />
        <span className="absolute bottom-0.5 left-0.5 rounded bg-red-600 px-1 text-[8px] font-bold text-white">
          PDF
        </span>
      </div>
    );
  }
  const Icon = fileIconFor(fileName);
  return (
    <div className="flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border border-border bg-white p-1 shadow-sm">
      <div className="h-7 w-9 rounded-sm border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 p-0.5">
        <div className="space-y-0.5">
          <div className="h-0.5 w-full rounded bg-slate-300" />
          <div className="h-0.5 w-4/5 rounded bg-slate-200" />
          <div className="h-0.5 w-full rounded bg-slate-200" />
          <div className="h-0.5 w-3/5 rounded bg-slate-200" />
        </div>
      </div>
      <Icon className="size-3 text-brand" />
    </div>
  );
}

const FILTERS: Array<{ key: "all" | DocumentStatus; label: string }> = [
  { key: "all", label: "Tous" },
  { key: "envoye", label: "Envoyé" },
  { key: "consulte", label: "Consulté" },
  { key: "en_cours", label: "En cours" },
  { key: "traite", label: "Classé" },
];

export function DocumentsList({
  mode,
  onOpen,
  onCreate,
}: {
  mode: Mode;
  onOpen: (id: Id<"documents">) => void;
  onCreate?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | DocumentStatus>("all");
  const [showArchived, setShowArchived] = useState(false);

  // Liste complète (sans filtre statut) pour compteurs + filtre local fiable
  const result = useQuery(
    mode === "inbox" ? api.documents.inbox : api.documents.sent,
    {
      search: query.trim() || undefined,
      includeArchived: showArchived,
      limit: 80,
    },
  );

  const allDocuments = Array.isArray(result) ? result : undefined;

  const counts = useMemo(() => {
    const base = { all: allDocuments?.length ?? 0 } as Record<string, number>;
    for (const key of Object.keys(STATUS_META) as DocumentStatus[]) {
      base[key] =
        allDocuments?.filter((d) => d.status === key).length ?? 0;
    }
    return base;
  }, [allDocuments]);

  const documents = useMemo(() => {
    if (!allDocuments) return undefined;
    if (filter === "all") return allDocuments;
    return allDocuments.filter((d) => d.status === filter);
  }, [allDocuments, filter]);

  const exportCsv = () => {
    if (!documents || documents.length === 0) {
      toast.error("Aucun courrier à exporter.");
      return;
    }
    try {
      const headers = [
        "Fichier",
        "Objet",
        "Statut",
        "Expéditeur",
        "Destinataire",
        "Tâches",
        "Date",
        "Taille (octets)",
      ];
      const rows = documents.map((d) => {
        const anyD = d as Record<string, unknown>;
        const created =
          typeof anyD.createdAt === "number"
            ? (anyD.createdAt as number)
            : typeof anyD._creationTime === "number"
              ? (anyD._creationTime as number)
              : Date.now();
        return [
          String(anyD.fileName ?? ""),
          String(anyD.objet ?? ""),
          String(anyD.publicRef ?? ""),
          String(anyD.status ?? ""),
          String(anyD.senderName ?? ""),
          String(anyD.recipientName ?? ""),
          Array.isArray(anyD.tasks)
            ? (anyD.tasks as string[]).join(" | ")
            : String(anyD.task ?? ""),
          new Date(created).toLocaleString("fr-FR"),
          anyD.size != null ? String(anyD.size) : "",
        ];
      });
      const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
      const csv = [headers, ...rows]
        .map((r) => r.map(esc).join(";"))
        .join("\r\n");
      const blob = new Blob(["\ufeff" + csv], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scandoc-${mode}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 400);
      toast.success(`Export CSV : ${documents.length} ligne(s)`);
    } catch (e) {
      console.error(e);
      toast.error("Export impossible sur cet appareil.");
    }
  };


  return (
    <div className="space-y-5" data-scandoc-tour="docs-list">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-sm bg-brand-soft text-brand">
            {mode === "inbox" ? (
              <Inbox className="size-4" />
            ) : (
              <Send className="size-4" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {mode === "inbox" ? "Courriers reçus" : "Courriers envoyés"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {mode === "inbox"
                ? "Courriers adressés à votre structure — consultez, répondez ou classez."
                : "Courriers que vous avez émis — suivez leur état."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher (objet, tâche, nom…)"
              className="pl-9"
              data-scandoc-tour="docs-filters"
            />
          </div>
          <Button
            type="button"
            variant={showArchived ? "default" : "outline"}
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => setShowArchived((v) => !v)}
            title={showArchived ? "Masquer les archives" : "Afficher les archives"}
          >
            <Archive className="size-3.5" />
            <span className="hidden sm:inline">Archives</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={exportCsv}
            disabled={!documents || documents.length === 0}
            title="Exporter en CSV"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setFilter(entry.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === entry.key
                ? "border-brand bg-brand text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-brand-sky/40 hover:text-foreground",
            )}
          >
            {entry.label}
            <span className="ml-1.5 opacity-70">{counts[entry.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {documents === undefined ? (
        <MndptLoader size="section" />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={mode === "inbox" ? Inbox : Send}
          title={
            showArchived
              ? "Aucun courrier archivé"
              : mode === "inbox"
                ? "Aucun courrier reçu"
                : "Aucun courrier envoyé"
          }
          description={
            showArchived
              ? "Les courriers archivés apparaîtront ici."
              : mode === "inbox"
                ? "Les courriers destinés à votre structure apparaîtront ici."
                : "Transmettez un fichier avec la tâche à réaliser pour le voir apparaître ici."
          }
          action={
            !showArchived && onCreate ? (
              <Button onClick={onCreate} className="gap-2">
                <Send className="size-4" />
                Nouveau courrier
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="space-y-2">
            {documents.map((document) => {
              const counterpart =
                mode === "inbox"
                  ? structureSender(document)
                  : structureRecipient(document);
              const title =
                (document.objet && document.objet.trim()) || document.fileName;
              const fileUrl = (document as { fileUrl?: string | null }).fileUrl;
              return (
                <li key={document._id}>
                  <button
                    type="button"
                    onClick={() => onOpen(document._id)}
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-sm border border-border bg-card p-3 text-left transition-all hover:border-brand-sky/50 sm:gap-4 sm:p-4",
                      document.archivedAt && "opacity-70",
                    )}
                  >
                    <FileThumb
                      fileName={document.fileName}
                      contentType={document.contentType}
                      fileUrl={fileUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {title}
                        </p>
                        <StatusBadge
                          status={
                            (["envoye", "consulte", "en_cours", "traite"].includes(
                              String(document.status),
                            )
                              ? document.status
                              : "envoye") as "envoye" | "consulte" | "en_cours" | "traite"
                          }
                        />
                        {document.archivedAt ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-border text-[10px] font-medium text-muted-foreground"
                          >
                            <Archive className="size-3" />
                            Archivé
                          </Badge>
                        ) : null}
                        {document.summaryStatus === "en_attente" ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-border text-[10px] font-medium text-muted-foreground"
                          >
                            <Loader2 className="size-3 animate-spin" />
                            résumé…
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {mode === "inbox" ? "De" : "À"} {counterpart}
                        {" · "}
                        {formatDateTime(document.createdAt)} ·{" "}
                        {formatBytes(document.size)}
                      </p>
                      {document.publicRef ? (
                        <p className="text-[11px] font-mono text-muted-foreground">
                          {document.publicRef}
                        </p>
                      ) : null}
                      {document.objet ? (
                        <p className="mt-2 line-clamp-1 text-xs leading-relaxed text-foreground/80">
                          <span className="font-medium text-brand-sky">
                            Objet :{" "}
                          </span>
                          {document.objet}
                        </p>
                      ) : null}
                      {mode === "sent" && document.hasCircuit ? (
                        <p className="mt-1 text-xs font-medium text-amber-900">
                          {document.status === "traite"
                            ? "Circuit terminé"
                            : `📍 Chez ${structureRecipient(document)} · étape ${(document.currentStepIndex ?? 0) + 1}/${
                                document.circuitTotalSteps ?? "?"
                              }`}
                        </p>
                      ) : null}
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/80">
                        <span className="font-medium text-brand-sky">
                          Tâches :{" "}
                        </span>
                        {document.tasks && document.tasks.length > 0
                          ? document.tasks.join(" · ")
                          : (document.task ?? "—")}
                      </p>
                      {document.summary ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground italic">
                          {document.summary}
                        </p>
                      ) : null}
                    </div>
                    <FileText className="mt-1 size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-brand-sky" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
