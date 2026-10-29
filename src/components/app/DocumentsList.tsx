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
import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  STATUS_META,
  StatusBadge,
  MailKindBadge,
  FileThumb,
  formatBytes,
  formatDateTime,
  structureRecipient,
  structureSender,
  type DocumentStatus,
  UrgentBadge,
} from "./shared";

type Mode = "inbox" | "sent";

function filtersFor(mode: Mode): Array<{ key: "all" | DocumentStatus | "urgent" | "a_traiter"; label: string }> {
  if (mode === "inbox") {
    return [
      { key: "all", label: "Tous" },
      { key: "envoye", label: "Reçus" },
      { key: "a_traiter", label: "À traiter" },
      { key: "en_retard", label: "En retard" },
      { key: "urgent", label: "Urgent" },
      { key: "traite", label: "Classés" },
    ];
  }
  return [
    { key: "all", label: "Tous" },
    { key: "envoye", label: "Envoyé" },
    { key: "consulte", label: "Lu" },
    { key: "en_cours", label: "En traitement" },
    { key: "en_retard", label: "En retard" },
    { key: "urgent", label: "Urgent" },
    { key: "traite", label: "Classé" },
  ];
}

export function DocumentsList({
  mode,
  onOpen,
  onCreate,
}: {
  mode: Mode;
  onOpen: (id: Id<"documents">) => void;
  onCreate?: () => void;
}) {
  const FILTERS = filtersFor(mode);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | DocumentStatus | "urgent" | "a_traiter">("all");
  const [sortMode, setSortMode] = useState<"recent" | "urgent">("recent");
  const [showArchived, setShowArchived] = useState(false);

  // Préférences pilotées par l'assistant personnel
  useEffect(() => {
    const apply = (raw?: string | null) => {
      try {
        const prefs = JSON.parse(
          raw || localStorage.getItem("scandoc-docs-prefs") || "{}",
        ) as {
          filter?: string;
          sort?: string;
          search?: string;
          mode?: string;
        };
        if (prefs.search != null) setQuery(String(prefs.search));
        if (prefs.sort === "urgent" || prefs.sort === "recent") {
          setSortMode(prefs.sort);
        }
        if (prefs.filter === "urgent") setFilter("urgent");
        else if (
          prefs.filter &&
          ["all", "envoye", "consulte", "en_cours", "en_retard", "traite"].includes(
            prefs.filter,
          )
        ) {
          setFilter(prefs.filter as "all" | DocumentStatus);
        }
      } catch {
        /* ignore */
      }
    };
    apply(null);
    const onPrefs = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { filter?: string; sort?: string; search?: string }
        | undefined;
      if (detail) {
        try {
          localStorage.setItem(
            "scandoc-docs-prefs",
            JSON.stringify({
              ...JSON.parse(localStorage.getItem("scandoc-docs-prefs") || "{}"),
              ...detail,
            }),
          );
        } catch {
          /* ignore */
        }
      }
      apply(null);
    };
    window.addEventListener("scandoc:docs-prefs", onPrefs as EventListener);
    return () =>
      window.removeEventListener("scandoc:docs-prefs", onPrefs as EventListener);
  }, []);

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
    base.urgent =
      allDocuments?.filter(
        (d) =>
          Boolean((d as { urgent?: boolean }).urgent) && d.status !== "traite",
      ).length ?? 0;
    base.a_traiter =
      allDocuments?.filter((d) =>
        d.status === "consulte" ||
        d.status === "en_cours" ||
        d.status === "en_retard",
      ).length ?? 0;
    return base;
  }, [allDocuments]);

  const documents = useMemo(() => {
    if (!allDocuments) return undefined;
    let list = allDocuments;
    if (filter === "urgent") {
      list = list.filter(
        (d) => Boolean((d as { urgent?: boolean }).urgent) && d.status !== "traite",
      );
    } else if (filter === "a_traiter") {
      // Ouverts / en cours / retard — plus seulement « reçus » (non lus)
      list = list.filter((d) =>
        d.status === "consulte" ||
        d.status === "en_cours" ||
        d.status === "en_retard",
      );
    } else if (filter !== "all") {
      list = list.filter((d) => d.status === filter);
    }
    const sorted = [...list];
    if (sortMode === "urgent") {
      sorted.sort((a, b) => {
        const ua = a.status !== "traite" && Boolean((a as { urgent?: boolean }).urgent) ? 1 : 0;
        const ub = b.status !== "traite" && Boolean((b as { urgent?: boolean }).urgent) ? 1 : 0;
        if (ub !== ua) return ub - ua;
        return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      });
    } else {
      sorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    }
    return sorted;
  }, [allDocuments, filter, sortMode]);

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
            <h2 className="sc-page-title">
              {mode === "inbox" ? "Courriers reçus" : "Courriers envoyés"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {mode === "inbox"
                ? "Reçus = non ouverts · À traiter = ouverts (à classer)."
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
        <button
          type="button"
          onClick={() => setSortMode("recent")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            sortMode === "recent"
              ? "border-brand bg-brand text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          Plus récents
        </button>
        <button
          type="button"
          onClick={() => setSortMode("urgent")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            sortMode === "urgent"
              ? "border-brand bg-brand text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          Plus urgents
        </button>
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
                ? "Votre boîte de réception est vide."
                : "Aucun envoi pour le moment."
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
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {documents.map((document) => {
              const counterpart =
                mode === "inbox"
                  ? structureSender(document)
                  : structureRecipient(document);
              const counterpartLine =
                mode === "inbox"
                  ? counterpart && counterpart !== "—"
                    ? `Vient de ${counterpart}`
                    : "Expéditeur inconnu"
                  : counterpart && counterpart !== "—"
                    ? `Adressé à ${counterpart}`
                    : "Destinataire inconnu";
              const subject =
                (document.objet && document.objet.trim()) || document.fileName;
              const unread =
                mode === "inbox" && document.status === "envoye";
              const urgent =
                Boolean((document as { urgent?: boolean }).urgent) &&
                document.status !== "traite";
              const preview =
                (document.summary && document.summary.trim()) ||
                (document.publicRef ? `Réf. ${document.publicRef}` : "") ||
                document.fileName;
              return (
                <li key={document._id}>
                  <button
                    type="button"
                    onClick={() => onOpen(document._id)}
                    className={cn(
                      "group flex w-full items-start gap-3 px-3 py-3 text-left transition-colors sm:gap-4 sm:px-4",
                      "hover:bg-muted/50",
                      unread && "bg-brand-soft/30",
                      document.archivedAt && "opacity-60",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        unread
                          ? "bg-brand text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      {(counterpart || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={cn(
                            "truncate text-sm",
                            unread
                              ? "font-semibold text-foreground"
                              : "font-medium text-foreground",
                          )}
                        >
                          {counterpartLine}
                        </p>
                        <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {formatDateTime(document.createdAt)}
                        </time>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {urgent ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600">
                            Urgent
                          </span>
                        ) : null}
                        <p
                          className={cn(
                            "truncate text-sm",
                            unread
                              ? "font-semibold text-foreground"
                              : "text-foreground/90",
                          )}
                        >
                          {subject}
                        </p>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {preview}
                      </p>
                      <div className="mt-1.5">
                        <StatusBadge
                          asRecipient={mode === "inbox"}
                          status={
                            (["envoye", "consulte", "en_cours", "en_retard", "traite"].includes(
                              String(document.status),
                            )
                              ? document.status
                              : "envoye") as
                              | "envoye"
                              | "consulte"
                              | "en_cours"
                              | "en_retard"
                              | "traite"
                          }
                        />
                      </div>
                    </div>
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
