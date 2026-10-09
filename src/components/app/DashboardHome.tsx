import { ActivityFeed } from "./ActivityFeed";
import { JoinGroupsPanel } from "./JoinGroupsPanel";
import { MembershipPanel } from "./MembershipPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Inbox,
  Loader2,
  Send,
  Upload,
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
  const sent = useQuery(api.documents.sentAll);

  if (!me || !stats || !inbox || !sent) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const inboxList = Array.isArray(inbox) ? inbox : [];
  const sentList = Array.isArray(sent) ? sent : [];
  const recentReceived = inboxList.slice(0, 5);
  const recentSent = sentList.slice(0, 5);
  const firstName = (me.user.name ?? "Bonjour").split(" ")[0];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* 1. Accueil */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Bonjour, {firstName}
          </h2>
          <p className="text-sm text-muted-foreground">
            {me.department?.name
              ? `Département ${me.department.name}`
              : "Espace documents ScanDoc"}
          </p>
        </div>
        <Button onClick={onSend} className="gap-2 self-start">
          <Upload className="size-4" />
          Envoyer un document
        </Button>
      </div>

      {/* 2. Alertes uniquement si nécessaire */}
      {me.isAdmin && me.pendingAccounts > 0 ? (
        <button
          type="button"
          onClick={() => onNavigate("accounts")}
          className="flex w-full items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:bg-amber-100/80"
        >
          <UserCheck className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-medium text-amber-950">
              {me.pendingAccounts} compte
              {me.pendingAccounts > 1 ? "s" : ""} à valider
            </p>
            <p className="text-xs text-amber-800">
              Touchez pour examiner les demandes
            </p>
          </div>
        </button>
      ) : null}

      {!me.department && !me.isAdmin ? (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <div className="text-sm">
            <p className="font-medium text-amber-950">
              Pas encore de département
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              Le chef ou le DG doit valider votre adhésion pour envoyer et
              recevoir des documents.
            </p>
          </div>
        </div>
      ) : null}

      {/* Demandes / invitations (seulement si contenu) */}
      <JoinGroupsPanel />
      <MembershipPanel showInviteForm={false} />

      {/* 3. Chiffres clés — 3 max, cliquables */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onNavigate("inbox")}
          className="rounded-md border border-border bg-card p-4 text-left transition hover:border-brand/40 hover:shadow-sm"
        >
          <p className="text-2xl font-semibold tabular-nums">{stats.received}</p>
          <p className="mt-1 text-xs text-muted-foreground">Reçus</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("sent")}
          className="rounded-md border border-border bg-card p-4 text-left transition hover:border-brand/40 hover:shadow-sm"
        >
          <p className="text-2xl font-semibold tabular-nums">{stats.sent}</p>
          <p className="mt-1 text-xs text-muted-foreground">Envoyés</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("inbox")}
          className="rounded-md border border-border bg-card p-4 text-left transition hover:border-brand/40 hover:shadow-sm"
        >
          <p className="text-2xl font-semibold tabular-nums text-amber-700">
            {stats.awaiting}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">À traiter</p>
        </button>
      </div>

      {/* 4. Documents récents — 2 colonnes claires */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Inbox className="size-4 text-muted-foreground" />
              Derniers reçus
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onNavigate("inbox")}
            >
              Tout voir
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {recentReceived.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Aucun document reçu
              </p>
            ) : (
              recentReceived.map((doc) => (
                <button
                  key={doc._id}
                  type="button"
                  onClick={() => onOpen(doc._id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/60"
                >
                  <span className="text-lg">{fileIconFor(doc.contentType)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {doc.objet || doc.fileName}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {doc.senderName} · {formatDateTime(doc._creationTime)}
                    </p>
                  </div>
                  <StatusBadge status={doc.status} />
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Send className="size-4 text-muted-foreground" />
              Derniers envoyés
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onNavigate("sent")}
            >
              Tout voir
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {recentSent.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Aucun document envoyé
              </p>
            ) : (
              recentSent.map((doc) => (
                <button
                  key={doc._id}
                  type="button"
                  onClick={() => onOpen(doc._id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/60"
                >
                  <span className="text-lg">{fileIconFor(doc.contentType)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {doc.objet || doc.fileName}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatDateTime(doc._creationTime)}
                    </p>
                  </div>
                  <StatusBadge status={doc.status} />
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. Activité (secondaire) */}
      <ActivityFeed onOpen={onOpen} />
    </div>
  );
}
