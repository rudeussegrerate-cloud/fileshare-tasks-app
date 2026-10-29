import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  Clock,
  Filter,
  Inbox,
  Loader2,
  Route,
  Search,
  Send,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  EmptyState,
  StatusBadge,
  formatDateTime,
  type DocumentStatus,
} from "./shared";

type Scope = "all" | "sent" | "received";

export function TrackingView({
  onOpen,
}: {
  onOpen: (id: Id<"documents">) => void;
}) {
  const [scope, setScope] = useState<Scope>("all");
  const [q, setQ] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const rows = useQuery(api.documents.trackingOverview, {
    scope,
    limit: 80,
  });

  const filtered = useMemo(() => {
    if (!rows) return undefined;
    let list = rows;
    if (onlyOpen) list = list.filter((r) => r.status !== "traite");
    if (onlyOverdue) list = list.filter((r) => r.isOverdue);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (r) =>
          r.objet.toLowerCase().includes(needle) ||
          (r.publicRef ?? "").toLowerCase().includes(needle) ||
          r.counterpart.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [rows, onlyOpen, onlyOverdue, q]);

  const counts = useMemo(() => {
    if (!rows) return { open: 0, overdue: 0, done: 0 };
    return {
      open: rows.filter((r) => r.status !== "traite").length,
      overdue: rows.filter((r) => r.isOverdue).length,
      done: rows.filter((r) => r.status === "traite").length,
    };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Route className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Suivi
            </h2>
            <p className="text-sm text-muted-foreground">
              Tous vos courriers en cours ou classés — ouvrez un dossier pour le détail — statut, échéance, prochaine
              action.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-border bg-card px-2.5 py-1">
            Ouverts <strong className="ml-1">{counts.open}</strong>
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
            Retards <strong className="ml-1">{counts.overdue}</strong>
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-900">
            Classés <strong className="ml-1">{counts.done}</strong>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Référence, objet, personne…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "Tous"],
              ["received", "Reçus"],
              ["sent", "Envoyés"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={scope === key ? "default" : "outline"}
              onClick={() => setScope(key)}
            >
              {label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={onlyOpen ? "secondary" : "outline"}
            className="gap-1"
            onClick={() => setOnlyOpen((v) => !v)}
          >
            <Filter className="size-3.5" />
            Ouverts
          </Button>
          <Button
            type="button"
            size="sm"
            variant={onlyOverdue ? "secondary" : "outline"}
            className="gap-1"
            onClick={() => setOnlyOverdue((v) => !v)}
          >
            <Clock className="size-3.5" />
            Retards
          </Button>
        </div>
      </div>

      {filtered === undefined ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Route}
          title="Aucun courrier à suivre"
          description="Les envois et réceptions actifs apparaîtront ici avec leur statut."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="hidden grid-cols-[1fr_1.2fr_1fr_auto_auto] gap-2 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Réf. / sens</span>
            <span>Objet</span>
            <span>Interlocuteur</span>
            <span>Statut</span>
            <span>Échéance</span>
          </div>
          <ul className="divide-y divide-border">
            {filtered.map((row) => (
              <li key={`${row.direction}-${row._id}`}>
                <button
                  type="button"
                  onClick={() => onOpen(row._id as Id<"documents">)}
                  className={cn(
                    "grid w-full grid-cols-1 gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40 md:grid-cols-[1fr_1.2fr_1fr_auto_auto] md:items-center",
                    row.isOverdue && "bg-amber-50/50",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.direction === "received" ? (
                        <Inbox className="size-3.5 text-brand" />
                      ) : (
                        <Send className="size-3.5 text-muted-foreground" />
                      )}
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {row.publicRef || "—"}
                      </span>
                      {row.urgent ? (
                        <Badge
                          variant="outline"
                          className="border-red-300 bg-red-50 text-[10px] text-red-700"
                        >
                          Urgent
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground md:hidden">
                      {row.direction === "received" ? "Reçu" : "Envoyé"} ·{" "}
                      {formatDateTime(row.updatedAt)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {row.objet}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.nextAction}
                    </p>
                  </div>
                  <p className="truncate text-sm text-foreground/90">
                    {row.counterpart}
                  </p>
                  <div>
                    <StatusBadge
                      asRecipient={row.direction === "received"}
                      status={
                        (["envoye", "consulte", "en_cours", "en_retard", "traite"].includes(
                          row.status,
                        )
                          ? row.status
                          : "envoye") as DocumentStatus
                      }
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.dueAt ? (
                      <span
                        className={cn(
                          row.isOverdue && "font-medium text-amber-800",
                        )}
                      >
                        {formatDateTime(row.dueAt)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
