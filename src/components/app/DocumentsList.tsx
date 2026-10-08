import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  Archive,
  FileText,
  Inbox,
  Loader2,
  Search,
  Send,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  EmptyState,
  STATUS_META,
  StatusBadge,
  fileIconFor,
  formatBytes,
  formatDateTime,
  type DocumentStatus,
} from "./shared";

type Mode = "inbox" | "sent";

const FILTERS: Array<{ key: "all" | DocumentStatus; label: string }> = [
  { key: "all", label: "Tous" },
  { key: "envoye", label: "En attente" },
  { key: "consulte", label: "Consulté" },
  { key: "en_cours", label: "En cours" },
  { key: "traite", label: "Traité" },
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

  // Recherche côté serveur — pas de pagination cumulée pour simplifier
  const result = useQuery(
    mode === "inbox" ? api.documents.inbox : api.documents.sent,
    {
      search: query.trim() || undefined,
      status: filter === "all" ? undefined : filter,
      includeArchived: showArchived,
      limit: 50,
    },
  );

  const documents = result?.items;

  const counts = useMemo(() => {
    const base = { all: documents?.length ?? 0 } as Record<string, number>;
    for (const key of Object.keys(STATUS_META) as DocumentStatus[]) {
      base[key] = documents?.filter((d) => d.status === key).length ?? 0;
    }
    return base;
  }, [documents]);

  return (
    <div className="space-y-5">
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
              {mode === "inbox" ? "Documents reçus" : "Documents envoyés"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {mode === "inbox"
                ? "Consultez, traitez et suivez les documents qui vous sont adressés."
                : "Suivez où en sont les documents que vous avez transmis."}
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
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={mode === "inbox" ? Inbox : Send}
          title={
            showArchived
              ? "Aucun document archivé"
              : mode === "inbox"
                ? "Aucun document reçu"
                : "Aucun document envoyé"
          }
          description={
            showArchived
              ? "Les documents archivés apparaîtront ici."
              : mode === "inbox"
                ? "Les documents que vos collègues vous adressent apparaîtront ici avec leur résumé automatique."
                : "Transmettez un fichier avec la tâche à réaliser pour le voir apparaître ici."
          }
          action={
            !showArchived && onCreate ? (
              <Button onClick={onCreate} className="gap-2">
                <Send className="size-4" />
                Envoyer un document
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="space-y-2">
            {documents.map((document) => {
              const Icon = fileIconFor(document.fileName);
              const counterpart =
                mode === "inbox"
                  ? document.senderName
                  : document.recipientName;
              const department =
                mode === "inbox"
                  ? document.senderDepartmentName
                  : document.recipientDepartmentName;
              return (
                <li key={document._id}>
                  <button
                    type="button"
                    onClick={() => onOpen(document._id)}
                    className={cn(
                      "group flex w-full items-start gap-4 rounded-sm border border-border bg-card p-4 text-left transition-all hover:border-brand-sky/50",
                      document.archivedAt && "opacity-70",
                    )}
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-brand-soft text-brand">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {document.fileName}
                        </p>
                        <StatusBadge status={document.status} />
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
                        {department ? ` · ${department}` : ""} ·{" "}
                        {formatDateTime(document.createdAt)} ·{" "}
                        {formatBytes(document.size)}
                      </p>
                      {document.objet ? (
                        <p className="mt-2 line-clamp-1 text-xs leading-relaxed text-foreground/80">
                          <span className="font-medium text-brand-sky">
                            Objet :{" "}
                          </span>
                          {document.objet}
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
