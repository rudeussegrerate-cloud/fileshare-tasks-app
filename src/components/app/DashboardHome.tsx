import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import {
  Inbox,
  Loader2,
  Send,
  UserCheck,
} from "lucide-react";
import {
  StatusBadge,
  fileIconFor,
  formatDateTime,
} from "./shared";

export function DashboardHome({
  onOpen,
  onSend,
  onNavigate,
}: {
  onOpen: (id: Id<"documents">) => void;
  onSend: () => void;
  onNavigate: (view: "inbox" | "sent" | "departments" | "accounts") => void;
}) {
  const me = useQuery(api.workspace.me);
  const stats = useQuery(api.documents.stats);
  const inbox = useQuery(api.documents.inboxAll);

  if (!me || !stats || !inbox) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const inboxList = Array.isArray(inbox) ? inbox : [];
  const recent = inboxList.slice(0, 5);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Accueil */}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Bonjour{me.user.name ? `, ${me.user.name.split(" ")[0]}` : ""}
        </h2>
        <p className="text-sm text-muted-foreground">
          {me.department?.name
            ? me.department.name
            : "Espace documents"}
        </p>
      </div>

      {/* Action principale */}
      <Button onClick={onSend} size="lg" className="h-12 w-full gap-2 text-base">
        <Send className="size-5" />
        Envoyer un document
      </Button>

      {/* Alertes admin */}
      {me.isAdmin && me.pendingAccounts > 0 ? (
        <button
          type="button"
          onClick={() => onNavigate("accounts")}
          className="flex w-full items-start gap-3 rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-left"
        >
          <UserCheck className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span className="text-sm">
            <span className="font-medium text-amber-900">
              {me.pendingAccounts} compte
              {me.pendingAccounts > 1 ? "s" : ""} en attente
            </span>
            <span className="mt-0.5 block text-xs text-amber-800">
              Appuyez pour valider
            </span>
          </span>
        </button>
      ) : null}

      {/* Chiffres simples */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onNavigate("inbox")}
          className="rounded-sm border border-border bg-card p-3 text-center hover:bg-secondary"
        >
          <p className="text-2xl font-semibold tabular-nums">{stats.received}</p>
          <p className="text-xs text-muted-foreground">Reçus</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("sent")}
          className="rounded-sm border border-border bg-card p-3 text-center hover:bg-secondary"
        >
          <p className="text-2xl font-semibold tabular-nums">{stats.sent}</p>
          <p className="text-xs text-muted-foreground">Envoyés</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("inbox")}
          className="rounded-sm border border-border bg-card p-3 text-center hover:bg-secondary"
        >
          <p className="text-2xl font-semibold tabular-nums text-amber-600">
            {stats.awaiting}
          </p>
          <p className="text-xs text-muted-foreground">À traiter</p>
        </button>
      </div>

      {/* Derniers reçus */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Derniers reçus</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onNavigate("inbox")}
          >
            Tout voir
          </Button>
        </div>

        {recent.length === 0 ? (
          <Card className="border-border">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Aucun document reçu pour le moment
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-sm border border-border bg-card">
            {recent.map((document) => {
              const Icon = fileIconFor(document.fileName);
              return (
                <li key={document._id}>
                  <button
                    type="button"
                    onClick={() => onOpen(document._id)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-secondary/60"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-brand-soft text-brand">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {document.objet || document.fileName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {document.senderName} · {formatDateTime(document.createdAt)}
                      </span>
                    </span>
                    <StatusBadge status={document.status} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
