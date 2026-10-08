import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Inbox,
  Loader2,
  Send,
  Sparkles,
  UserCheck,
} from "lucide-react";
import {
  StatusBadge,
  fileIconFor,
  formatDateTime,
} from "./shared";

type StatCard = {
  label: string;
  value: number;
  icon: typeof Inbox;
  tone: string;
};

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

  const cards: StatCard[] = [
    {
      label: "Documents reçus",
      value: stats.received,
      icon: Inbox,
      tone: "bg-brand-soft text-brand",
    },
    {
      label: "Documents envoyés",
      value: stats.sent,
      icon: Send,
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "En attente de traitement",
      value: stats.awaiting,
      icon: Sparkles,
      tone: "bg-amber-50 text-amber-600",
    },
    {
      label: "Départements",
      value: stats.departments,
      icon: Building2,
      tone: "bg-indigo-50 text-indigo-600",
    },
  ];

  const inboxList = Array.isArray(inbox) ? inbox : [];
  const sentList = Array.isArray(sent) ? sent : [];
  const recentReceived = inboxList.slice(0, 4);
  const recentSent = sentList.slice(0, 4);

  // Tracking of the documents *this* person sent, not what they received.
  const sentAwaiting = sentList.filter((d) => d.status === "envoye").length;
  const sentInProgress = sentList.filter((d) => d.status === "en_cours").length;
  const sentDone = sentList.filter((d) => d.status === "traite").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Tableau de bord
          </h2>
          <p className="text-xs text-muted-foreground">
            Vue d'ensemble de vos échanges de documents entre départements.
          </p>
        </div>
        <Button onClick={onSend} className="gap-2">
          <Send className="size-4" />
          Envoyer un document
        </Button>
      </div>

      {me.isAdmin && me.pendingAccounts > 0 ? (
        <div className="flex items-start gap-3 rounded-sm border border-amber-200 bg-amber-50 px-4 py-3">
          <UserCheck className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">
              {me.pendingAccounts} demande
              {me.pendingAccounts > 1 ? "s" : ""} de compte en attente
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              Validez les nouveaux comptes pour qu'ils puissent rejoindre un
              département.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 border-amber-300 bg-white/70 text-amber-900"
              onClick={() => onNavigate("accounts")}
            >
              Examiner les demandes
            </Button>
          </div>
        </div>
      ) : null}

      {!me.department ? (
        <div className="flex items-start gap-3 rounded-sm border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">
              Vous n'êtes rattaché à aucun département
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              {me.isAdmin
                ? "Créez les départements et nommez leurs chefs pour lancer les échanges."
                : "Demandez au DG ou au chef de votre département de vous ajouter pour pouvoir envoyer et recevoir des documents."}
            </p>
            {me.isAdmin ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 border-amber-300 bg-white/70 text-amber-900"
                onClick={() => onNavigate("departments")}
              >
                Gérer les départements
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="border-border/80 ">
              <CardContent className="flex items-center gap-4 pt-6">
                <div
                  className={cn(
                    "flex size-11 items-center justify-center rounded-sm",
                    card.tone,
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight">
                    {card.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/80  lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Documents récents reçus</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-brand-sky"
              onClick={() => onNavigate("inbox")}
            >
              Tout voir
            </Button>
          </CardHeader>
          <CardContent>
            {recentReceived.length === 0 ? (
              <p className="rounded-sm border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Aucun document reçu pour l'instant.
              </p>
            ) : (
              <ul className="space-y-2">
                {recentReceived.map((document) => {
                  const Icon = fileIconFor(document.fileName);
                  return (
                    <li key={document._id}>
                      <button
                        type="button"
                        onClick={() => onOpen(document._id)}
                        className="flex w-full items-center gap-3 rounded-sm border border-border/70 bg-card px-3 py-2.5 text-left transition-colors hover:border-brand-sky/50"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-brand-soft text-brand">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {document.fileName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            De {document.senderName} ·{" "}
                            {formatDateTime(document.createdAt)}
                          </span>
                        </span>
                        <StatusBadge status={document.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/80 ">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Actions rapides</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start gap-2" onClick={onSend}>
                <Send className="size-4" />
                Envoyer un document
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => onNavigate("inbox")}
              >
                <Inbox className="size-4" />
                Mes documents reçus
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => onNavigate("sent")}
              >
                <CheckCircle2 className="size-4" />
                Suivre mes envois
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => onNavigate("departments")}
              >
                <Building2 className="size-4" />
                {me.isAdmin ? "Gérer les départements" : "Voir les départements"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80 ">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Suivi de mes envois</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Pas encore consultés
                </span>
                <span className="font-semibold">{sentAwaiting}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">En cours</span>
                <span className="font-semibold">{sentInProgress}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Traités</span>
                <span className="font-semibold text-emerald-600">
                  {sentDone}
                </span>
              </div>
              {recentSent.slice(0, 3).map((document) => (
                <button
                  key={document._id}
                  type="button"
                  onClick={() => onOpen(document._id)}
                  className="flex w-full items-center justify-between gap-2 rounded-sm border border-border/60 px-3 py-2 text-left text-xs transition-colors hover:border-brand-sky/50"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {document.fileName}
                  </span>
                  <StatusBadge status={document.status} />
                </button>
              ))}
              {recentSent.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aucun envoi pour l'instant.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
