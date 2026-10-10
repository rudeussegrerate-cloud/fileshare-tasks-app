import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import {
  Building2,
  Inbox,
  Loader2,
  Megaphone,
  MessageCircle,
  Newspaper,
  Send,
  UserCheck,
  Users,
} from "lucide-react";
import type { AppView } from "@/components/app/AppShell";
import { SmartInsights } from "./SmartInsights";
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
  onNavigate: (view: AppView) => void;
}) {
  const me = useQuery(api.workspace.me);
  const stats = useQuery(api.documents.stats);
  const inbox = useQuery(api.documents.inboxAll);
  const unreadMsg = useQuery(api.chat.unreadTotal);
  const pendingJoin = useQuery(
    api.departmentMembership.listPendingRequests,
    me?.isChef || me?.isAdmin ? {} : "skip",
  );

  if (!me || !stats || !inbox) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const inboxList = Array.isArray(inbox) ? inbox : [];
  const recent = inboxList.slice(0, 5);
  const awaiting = stats.awaiting ?? 0;
  const firstName = me.user.name?.split(" ")[0] ?? "";

  const roleLine = me.isRoot
    ? "Super utilisateur — accès complet"
    : me.isAdmin
      ? "Directeur général — validation des comptes et organisation"
      : me.isChef
        ? `Chef de département${me.department?.name ? ` · ${me.department.name}` : ""}`
        : me.department?.name
          ? `Membre · ${me.department.name}`
          : "Membre — hors département";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Accueil personnalisé */}
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          Bonjour{firstName ? `, ${firstName}` : ""}
        </h2>
        <p className="text-sm text-muted-foreground">{roleLine}</p>
        <p className="text-xs text-muted-foreground">
          ScanDoc centralise l&apos;envoi de documents, les tâches, les
          départements et les annonces internes.
        </p>
      </div>

      {/* Action principale */}
      <Button onClick={onSend} size="lg" className="h-12 w-full gap-2 text-base">
        <Send className="size-5" />
        Envoyer un document
      </Button>

      <SmartInsights onNavigate={onNavigate} />

      {/* Alertes prioritaires */}
      <div className="space-y-2">
        {me.isAdmin && me.pendingAccounts > 0 ? (
          <AlertCard
            icon={UserCheck}
            title={`${me.pendingAccounts} compte${me.pendingAccounts > 1 ? "s" : ""} à valider`}
            subtitle="Nouveaux inscrits en attente de validation DG"
            onClick={() => onNavigate("accounts")}
            tone="amber"
          />
        ) : null}
        {(pendingJoin?.length ?? 0) > 0 ? (
          <AlertCard
            icon={Users}
            title={`${pendingJoin!.length} demande${pendingJoin!.length > 1 ? "s" : ""} d'adhésion`}
            subtitle="À traiter dans Départements"
            onClick={() => onNavigate("departments")}
            tone="amber"
          />
        ) : null}
        {awaiting > 0 ? (
          <AlertCard
            icon={Inbox}
            title={`${awaiting} document${awaiting > 1 ? "s" : ""} à traiter`}
            subtitle="Reçus non encore marqués comme traités"
            onClick={() => onNavigate("inbox")}
            tone="blue"
          />
        ) : null}
        {(unreadMsg ?? 0) > 0 ? (
          <AlertCard
            icon={MessageCircle}
            title={`${unreadMsg} message${(unreadMsg ?? 0) > 1 ? "s" : ""} non lu${(unreadMsg ?? 0) > 1 ? "s" : ""}`}
            subtitle="Messagerie interne"
            onClick={() => onNavigate("messages")}
            tone="blue"
          />
        ) : null}
      </div>

      {/* Vue d'ensemble chiffres */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Vue d&apos;ensemble</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="À traiter"
            value={awaiting}
            hint="Documents reçus en cours"
            onClick={() => onNavigate("inbox")}
          />
          <StatTile
            label="Reçus"
            value={stats.received}
            hint="Total non archivés"
            onClick={() => onNavigate("inbox")}
          />
          <StatTile
            label="Envoyés"
            value={stats.sent}
            hint="Vos envois"
            onClick={() => onNavigate("sent")}
          />
          <StatTile
            label="Messages"
            value={unreadMsg ?? 0}
            hint="Non lus"
            onClick={() => onNavigate("messages")}
          />
        </div>
      </section>

      {/* Raccourcis organisés */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Accès rapides</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <QuickLink
            icon={Inbox}
            title="Documents reçus"
            desc="Traiter les pièces qui vous sont adressées"
            onClick={() => onNavigate("inbox")}
          />
          <QuickLink
            icon={Send}
            title="Documents envoyés"
            desc="Suivre le statut de vos envois"
            onClick={() => onNavigate("sent")}
          />
          <QuickLink
            icon={Building2}
            title="Départements"
            desc="Organisation, membres, invitations"
            onClick={() => onNavigate("departments")}
          />
          <QuickLink
            icon={Newspaper}
            title="Actualités"
            desc="Fil des annonces internes"
            onClick={() => onNavigate("actualites")}
          />
          <QuickLink
            icon={Megaphone}
            title="Publier une annonce"
            desc="Informer un ou plusieurs services"
            onClick={() => onNavigate("announcements")}
          />
          <QuickLink
            icon={MessageCircle}
            title="Messages"
            desc="Écrire à un collègue"
            onClick={() => onNavigate("messages")}
          />
          {me.isAdmin ? (
            <QuickLink
              icon={UserCheck}
              title="Comptes utilisateurs"
              desc="Valider, rejeter, promouvoir"
              onClick={() => onNavigate("accounts")}
            />
          ) : null}
        </div>
      </section>

      {/* Derniers reçus */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Derniers documents reçus</h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => onNavigate("inbox")}
          >
            Tout voir
          </Button>
        </div>
        {recent.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Aucun document reçu pour le moment.
              <br />
              <span className="text-xs">
                Les envois de vos collègues apparaîtront ici.
              </span>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {recent.map((doc) => {
              const Icon = fileIconFor(doc.fileName);
              return (
                <li key={doc._id}>
                  <button
                    type="button"
                    onClick={() => onOpen(doc._id)}
                    className="flex w-full items-start gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition hover:border-brand/30 hover:bg-secondary/40"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Icon className="size-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {doc.objet || doc.fileName}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        De {doc.senderName ?? "—"} · {formatDateTime(doc._creationTime)}
                      </span>
                    </span>
                    <StatusBadge status={doc.status} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Légende des rôles */}
      <Card className="border-dashed">
        <CardContent className="space-y-2 py-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Qui fait quoi ?</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong className="text-foreground">Membre</strong> — envoie /
              reçoit des documents, commente les annonces
            </li>
            <li>
              <strong className="text-foreground">Chef de département</strong> —
              valide les adhésions, gère les membres et le logo du service
            </li>
            <li>
              <strong className="text-foreground">Directeur général</strong> —
              valide les comptes, crée les départements, voit l&apos;audit
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function AlertCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
  tone,
}: {
  icon: typeof Inbox;
  title: string;
  subtitle: string;
  onClick: () => void;
  tone: "amber" | "blue";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        tone === "amber"
          ? "flex w-full items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-left"
          : "flex w-full items-start gap-3 rounded-xl border border-brand/20 bg-brand-soft/60 px-4 py-3 text-left"
      }
    >
      <Icon
        className={
          tone === "amber"
            ? "mt-0.5 size-4 shrink-0 text-amber-700"
            : "mt-0.5 size-4 shrink-0 text-brand"
        }
      />
      <span className="text-sm">
        <span
          className={
            tone === "amber"
              ? "font-medium text-amber-950"
              : "font-medium text-foreground"
          }
        >
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function StatTile({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border/60 bg-card p-3 text-left transition hover:border-brand/30"
    >
      <p className="text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="text-xs font-medium text-foreground">{label}</p>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </button>
  );
}

function QuickLink({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof Inbox;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition hover:border-brand/30 hover:bg-secondary/30"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}
