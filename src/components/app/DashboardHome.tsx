import React from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Building2,
  Inbox,
  Loader2,
  Megaphone,
  MessageCircle,
  Newspaper,
  Send,
  UserCheck,
  Users,
  BarChart3,
  Crown,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AppView } from "@/components/app/AppShell";
import { SmartInsights } from "./SmartInsights";
import {
  StatusBadge,
  fileIconFor,
  formatDateTime,
  initialsOf,
} from "./shared";

const ONLINE_MS = 2 * 60 * 1000;

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
  const overview = useQuery(
    api.documents.enterpriseOverview,
    me?.isAdmin || me?.isRoot ? {} : "skip",
  );

  const [selectedDeptId, setSelectedDeptId] =
    useState<Id<"departments"> | null>(null);

  // Chef : ouvrir automatiquement le tableau de bord de son département
  useEffect(() => {
    if (!me) return;
    if (me.isAdmin || me.isRoot) return;
    if (me.isChef && me.user.departmentId) {
      setSelectedDeptId(me.user.departmentId as Id<"departments">);
    }
  }, [me?.isChef, me?.isAdmin, me?.isRoot, me?.user.departmentId]);

  const canLoadDept =
    Boolean(selectedDeptId) &&
    Boolean(me?.isAdmin || me?.isRoot || me?.isChef);

  const deptDetail = useQuery(
    api.documents.departmentOverview,
    canLoadDept && selectedDeptId
      ? { departmentId: selectedDeptId }
      : "skip",
  );

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
  const isDg = Boolean(me.isAdmin || me.isRoot);
  const isChef = Boolean(me.isChef) && !isDg;

  const roleLine = me.isRoot
    ? "Super utilisateur"
    : me.isAdmin
      ? "Directeur général"
      : me.isChef
        ? `Chef de département${me.department?.name ? ` · ${me.department.name}` : ""}`
        : me.department?.name
          ? `Membre · ${me.department.name}`
          : "Membre";

  const showEnterprise = isDg && !selectedDeptId;
  const showDeptPanel = Boolean(selectedDeptId);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* —— En-tête —— */}
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          Bonjour{firstName ? `, ${firstName}` : ""}
        </h2>
        <p className="text-sm text-muted-foreground">{roleLine}</p>
      </header>

      {/* —— Action principale —— */}
      <Button onClick={onSend} size="lg" className="h-11 w-full gap-2 sm:w-auto">
        <Send className="size-4" />
        Envoyer un document
      </Button>

      {/* —— Alertes (toutes rôles, compact) —— */}
      <AlertsBlock
        isAdmin={isDg}
        pendingAccounts={me.pendingAccounts ?? 0}
        pendingJoins={pendingJoin?.length ?? 0}
        awaiting={awaiting}
        unreadMsg={unreadMsg ?? 0}
        onNavigate={onNavigate}
      />

      <SmartInsights onNavigate={onNavigate} />

      {/* ========== BLOC DG : entreprise ========== */}
      {showEnterprise ? (
        <Section
          icon={BarChart3}
          title="Entreprise"
          subtitle="Vue d'ensemble et suivi par département"
        >
          {overview === undefined ? (
            <LoadingLine label="Chargement de la vue d'ensemble…" />
          ) : overview ? (
            <EnterprisePanel
              overview={overview}
              onOpen={onOpen}
              onNavigate={onNavigate}
              onSelectDept={(id) => setSelectedDeptId(id)}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Impossible de charger la vue d&apos;ensemble.
            </p>
          )}
        </Section>
      ) : null}

      {/* ========== BLOC département (DG après clic, ou chef auto) ========== */}
      {showDeptPanel ? (
        <Section
          icon={Building2}
          title={
            isChef
              ? `Mon département${me.department?.name ? ` · ${me.department.name}` : ""}`
              : "Département"
          }
          subtitle={
            isChef
              ? "Membres, activité et documents de votre service"
              : "Détail et activité du service sélectionné"
          }
          action={
            isDg ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setSelectedDeptId(null)}
              >
                <ArrowLeft className="size-4" />
                Entreprise
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onNavigate("departments")}
              >
                Gérer
              </Button>
            )
          }
        >
          {!deptDetail ? (
            <LoadingLine label="Chargement du département…" />
          ) : (
            <DepartmentPanel
              detail={deptDetail}
              onOpen={onOpen}
              showBack={false}
            />
          )}
        </Section>
      ) : null}

      {/* ========== Mes documents (tous rôles) ========== */}
      <Section
        icon={Inbox}
        title="Mes documents"
        subtitle="Vos échanges personnels"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="À traiter"
            value={awaiting}
            hint="Reçus non traités"
            onClick={() => onNavigate("inbox")}
          />
          <StatTile
            label="Reçus"
            value={stats.received}
            hint="Non archivés"
            onClick={() => onNavigate("inbox")}
          />
          <StatTile
            label="Envoyés"
            value={stats.sent}
            hint="Vos envois"
            onClick={() => onNavigate("sent")}
          />
          <StatTile
            label="Traités"
            value={stats.done ?? 0}
            hint="Terminés"
            onClick={() => onNavigate("inbox")}
          />
        </div>
      </Section>

      {/* ========== Raccourcis ========== */}
      <Section title="Raccourcis" subtitle="Accès rapide">
        <div className="grid gap-2 sm:grid-cols-2">
          <QuickLink
            icon={Inbox}
            title="Documents reçus"
            desc="Traiter vos dossiers"
            onClick={() => onNavigate("inbox")}
          />
          <QuickLink
            icon={Send}
            title="Documents envoyés"
            desc="Suivi et circuits"
            onClick={() => onNavigate("sent")}
          />
          <QuickLink
            icon={Building2}
            title="Départements"
            desc={isChef || isDg ? "Organisation et membres" : "Consulter"}
            onClick={() => onNavigate("departments")}
          />
          <QuickLink
            icon={MessageCircle}
            title="Messages"
            desc="Messagerie interne"
            onClick={() => onNavigate("messages")}
          />
          <QuickLink
            icon={Newspaper}
            title="Actualités"
            desc="Fil interne"
            onClick={() => onNavigate("actualites")}
          />
          <QuickLink
            icon={Megaphone}
            title="Annonces"
            desc="Communications"
            onClick={() => onNavigate("announcements")}
          />
          {isDg ? (
            <QuickLink
              icon={UserCheck}
              title="Comptes"
              desc="Validation des inscrits"
              onClick={() => onNavigate("accounts")}
            />
          ) : null}
        </div>
      </Section>

      {/* ========== Derniers reçus ========== */}
      <Section
        title="Derniers reçus"
        subtitle="Ouvrir un document"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onNavigate("inbox")}
          >
            Tout voir
          </Button>
        }
      >
        {recent.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
            Aucun document reçu pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {recent.map((document) => {
              const Icon = fileIconFor(document.fileName);
              return (
                <li key={document._id}>
                  <button
                    type="button"
                    onClick={() => onOpen(document._id)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-secondary/50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {document.objet || document.fileName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {document.senderName} ·{" "}
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
      </Section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sections helpers                                                           */
/* -------------------------------------------------------------------------- */

function Section({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon?: typeof Inbox;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            {Icon ? <Icon className="size-4 text-brand" /> : null}
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function LoadingLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

function AlertsBlock({
  isAdmin,
  pendingAccounts,
  pendingJoins,
  awaiting,
  unreadMsg,
  onNavigate,
}: {
  isAdmin: boolean;
  pendingAccounts: number;
  pendingJoins: number;
  awaiting: number;
  unreadMsg: number;
  onNavigate: (view: AppView) => void;
}) {
  const items: Array<{
    key: string;
    title: string;
    subtitle: string;
    onClick: () => void;
    tone: "amber" | "blue";
    icon: typeof Inbox;
  }> = [];

  if (isAdmin && pendingAccounts > 0) {
    items.push({
      key: "accounts",
      title: `${pendingAccounts} compte${pendingAccounts > 1 ? "s" : ""} à valider`,
      subtitle: "Nouveaux inscrits",
      onClick: () => onNavigate("accounts"),
      tone: "amber",
      icon: UserCheck,
    });
  }
  if (pendingJoins > 0) {
    items.push({
      key: "joins",
      title: `${pendingJoins} demande${pendingJoins > 1 ? "s" : ""} d'adhésion`,
      subtitle: "À traiter dans Départements",
      onClick: () => onNavigate("departments"),
      tone: "amber",
      icon: Users,
    });
  }
  if (awaiting > 0) {
    items.push({
      key: "inbox",
      title: `${awaiting} document${awaiting > 1 ? "s" : ""} à traiter`,
      subtitle: "Reçus non encore traités",
      onClick: () => onNavigate("inbox"),
      tone: "blue",
      icon: Inbox,
    });
  }
  if (unreadMsg > 0) {
    items.push({
      key: "msg",
      title: `${unreadMsg} message${unreadMsg > 1 ? "s" : ""} non lu${unreadMsg > 1 ? "s" : ""}`,
      subtitle: "Messagerie",
      onClick: () => onNavigate("messages"),
      tone: "blue",
      icon: MessageCircle,
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        À faire
      </h3>
      <div className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className={
                item.tone === "amber"
                  ? "flex w-full items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left"
                  : "flex w-full items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-secondary/40"
              }
            >
              <Icon
                className={
                  item.tone === "amber"
                    ? "mt-0.5 size-4 shrink-0 text-amber-700"
                    : "mt-0.5 size-4 shrink-0 text-brand"
                }
              />
              <span className="text-sm">
                <span
                  className={
                    item.tone === "amber"
                      ? "font-medium text-amber-950"
                      : "font-medium text-foreground"
                  }
                >
                  {item.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {item.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function EnterprisePanel({
  overview,
  onOpen,
  onNavigate,
  onSelectDept,
}: {
  overview: {
    totals: {
      documents: number;
      open: number;
      overdue: number;
      traite: number;
      departments: number;
      users: number;
      pendingAccounts: number;
      pendingJoins: number;
    };
    departmentStats: Array<{
      departmentId: string;
      name: string;
      members: number;
      chiefs: number;
      sent: number;
      received: number;
      open: number;
      traite: number;
      overdue: number;
    }>;
    recent: Array<{
      _id: string;
      fileName: string;
      objet?: string;
      status: string;
      senderName: string;
      recipientName: string;
      senderDepartment: string;
      recipientDepartment: string;
      createdAt: number;
    }>;
  };
  onOpen: (id: Id<"documents">) => void;
  onNavigate: (view: AppView) => void;
  onSelectDept: (id: Id<"departments">) => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="Documents actifs"
          value={overview.totals.documents}
        />
        <Metric
          label="En cours / à traiter"
          value={overview.totals.open}
          className="border-amber-200/80 bg-amber-50/80 text-amber-900"
        />
        <Metric
          label="En retard (>48 h)"
          value={overview.totals.overdue}
          className="border-red-200/80 bg-red-50/80 text-red-900"
        />
        <Metric
          label="Traités"
          value={overview.totals.traite}
          className="border-emerald-200/80 bg-emerald-50/80 text-emerald-900"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-md bg-muted/40 px-2 py-1.5">
          <span className="text-muted-foreground">Départements</span>
          <span className="ml-1 font-semibold">
            {overview.totals.departments}
          </span>
        </div>
        <div className="rounded-md bg-muted/40 px-2 py-1.5">
          <span className="text-muted-foreground">Utilisateurs</span>
          <span className="ml-1 font-semibold">{overview.totals.users}</span>
        </div>
        <button
          type="button"
          className="rounded-md bg-muted/40 px-2 py-1.5 text-left hover:bg-muted"
          onClick={() => onNavigate("accounts")}
        >
          <span className="text-muted-foreground">Comptes à valider</span>
          <span className="ml-1 font-semibold">
            {overview.totals.pendingAccounts}
          </span>
        </button>
        <button
          type="button"
          className="rounded-md bg-muted/40 px-2 py-1.5 text-left hover:bg-muted"
          onClick={() => onNavigate("departments")}
        >
          <span className="text-muted-foreground">Adhésions</span>
          <span className="ml-1 font-semibold">
            {overview.totals.pendingJoins}
          </span>
        </button>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Suivi par département
        </h4>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Cliquez une ligne pour ouvrir le tableau de bord du service.
        </p>
        {overview.departmentStats.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucun département pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Département</th>
                  <th className="px-2 py-2 font-medium">Membres</th>
                  <th className="px-2 py-2 font-medium">Envoyés</th>
                  <th className="px-2 py-2 font-medium">Reçus</th>
                  <th className="px-2 py-2 font-medium">Ouverts</th>
                  <th className="px-2 py-2 font-medium">Traités</th>
                  <th className="px-2 py-2 font-medium">Retard</th>
                </tr>
              </thead>
              <tbody>
                {overview.departmentStats.map((row) => {
                  const canOpen =
                    row.departmentId !== "__none__" &&
                    row.departmentId.length > 10;
                  return (
                    <tr
                      key={row.departmentId}
                      className={`border-t border-border/60 ${
                        canOpen
                          ? "cursor-pointer hover:bg-brand-soft/40"
                          : "hover:bg-muted/30"
                      }`}
                      onClick={() => {
                        if (!canOpen) return;
                        onSelectDept(row.departmentId as Id<"departments">);
                      }}
                    >
                      <td className="px-3 py-2 font-medium">
                        <span
                          className={
                            canOpen
                              ? "text-brand underline-offset-2 hover:underline"
                              : ""
                          }
                        >
                          {row.name}
                        </span>
                        {row.chiefs > 0 ? (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            · {row.chiefs} chef{row.chiefs > 1 ? "s" : ""}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{row.members}</td>
                      <td className="px-2 py-2 tabular-nums">{row.sent}</td>
                      <td className="px-2 py-2 tabular-nums">{row.received}</td>
                      <td className="px-2 py-2 tabular-nums text-amber-800">
                        {row.open}
                      </td>
                      <td className="px-2 py-2 tabular-nums text-emerald-800">
                        {row.traite}
                      </td>
                      <td
                        className={`px-2 py-2 tabular-nums ${
                          row.overdue > 0 ? "font-semibold text-red-700" : ""
                        }`}
                      >
                        {row.overdue}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Derniers échanges
        </h4>
        {overview.recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun document.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border">
            {overview.recent.slice(0, 8).map((doc) => (
              <li key={doc._id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
                  onClick={() => onOpen(doc._id as Id<"documents">)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {doc.objet || doc.fileName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {doc.senderName}
                      <span className="text-muted-foreground/70">
                        {" "}
                        ({doc.senderDepartment})
                      </span>
                      {" → "}
                      {doc.recipientName}
                      <span className="text-muted-foreground/70">
                        {" "}
                        ({doc.recipientDepartment})
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge
                      status={
                        doc.status as
                          | "envoye"
                          | "consulte"
                          | "en_cours"
                          | "traite"
                      }
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatDateTime(doc.createdAt)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DepartmentPanel({
  detail,
  onOpen,
}: {
  detail: {
    department: {
      name: string;
      description: string | null;
    };
    chief: {
      name: string;
      fonction: string | null;
    } | null;
    members: Array<{
      _id: string;
      name: string;
      email: string | null;
      fonction: string | null;
      departmentRole: string;
      lastSeenAt: number | null;
    }>;
    totals: {
      members: number;
      sent: number;
      received: number;
      open: number;
      traite: number;
      overdue: number;
      circuitActive: number;
    };
    recent: Array<{
      _id: string;
      fileName: string;
      objet?: string;
      status: string;
      senderName: string;
      recipientName: string;
      direction: string;
      hasCircuit?: boolean;
      currentStepIndex: number;
      circuitTotalSteps: number;
      createdAt: number;
    }>;
  };
  onOpen: (id: Id<"documents">) => void;
  showBack?: boolean;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div>
        <h4 className="flex items-center gap-2 text-base font-semibold">
          <Building2 className="size-4 text-brand" />
          {detail.department.name}
        </h4>
        {detail.department.description ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {detail.department.description}
          </p>
        ) : null}
        {detail.chief ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Crown className="size-3.5 text-amber-600" />
            Chef · {detail.chief.name}
            {detail.chief.fonction ? ` (${detail.chief.fonction})` : ""}
          </p>
        ) : (
          <p className="mt-1 text-xs text-amber-700">Aucun chef désigné</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Membres" value={detail.totals.members} />
        <Metric label="Envoyés" value={detail.totals.sent} />
        <Metric label="Reçus" value={detail.totals.received} />
        <Metric
          label="À traiter"
          value={detail.totals.open}
          className="text-amber-800"
        />
        <Metric
          label="Traités"
          value={detail.totals.traite}
          className="text-emerald-800"
        />
        <Metric
          label="Retard"
          value={detail.totals.overdue}
          className={
            detail.totals.overdue > 0 ? "font-semibold text-red-700" : ""
          }
        />
      </div>

      {detail.totals.circuitActive > 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {detail.totals.circuitActive} document
          {detail.totals.circuitActive > 1 ? "s" : ""} en circuit chez un membre
          de ce département
        </p>
      ) : null}

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Membres ({detail.members.length})
        </h4>
        {detail.members.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun membre validé.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {detail.members.map((m) => {
              const online =
                m.lastSeenAt != null && Date.now() - m.lastSeenAt < ONLINE_MS;
              return (
                <li
                  key={m._id}
                  className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
                    {initialsOf(m.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.name}
                      {m.departmentRole === "chef" ? (
                        <span className="ml-1 text-[10px] text-amber-700">
                          Chef
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {m.fonction ?? m.email ?? "—"}
                      {" · "}
                      {online ? "En ligne" : "Hors ligne"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activité récente
        </h4>
        {detail.recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucun échange lié à ce département.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border">
            {detail.recent.map((doc) => (
              <li key={doc._id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
                  onClick={() => onOpen(doc._id as Id<"documents">)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {doc.objet || doc.fileName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {doc.direction === "envoyé"
                        ? "Envoyé"
                        : doc.direction === "reçu"
                          ? "Reçu"
                          : "Interne"}
                      {" · "}
                      {doc.senderName} → {doc.recipientName}
                      {doc.hasCircuit
                        ? ` · circuit ${doc.currentStepIndex + 1}/${doc.circuitTotalSteps || "?"}`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge
                      status={
                        doc.status as
                          | "envoye"
                          | "consulte"
                          | "en_cours"
                          | "traite"
                      }
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatDateTime(doc.createdAt)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  className = "",
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-border/80 bg-muted/30 px-3 py-2 ${className}`}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
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
