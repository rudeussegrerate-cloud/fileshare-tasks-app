import React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
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
  Bell,
  X,
  Crown,
} from "lucide-react";
import { MndptLoader } from "@/components/MndptLoader";
import { useEffect, useState } from "react";
import type { AppView } from "@/components/app/AppShell";
import {
  StatusBadge,
  fileIconFor,
  formatDateTime,
  initialsOf,
} from "./shared";
import { structureRecipient, structureSender } from "./shared";

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
      <MndptLoader size="section" />
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
    <div className="mx-auto max-w-3xl space-y-6" data-scandoc-tour="home-stats">
      {/* —— En-tête —— */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-2xl font-semibold tracking-tight">
            Bonjour{firstName ? `, ${firstName}` : ""}
          </h2>
          <p className="text-sm text-muted-foreground">{roleLine}</p>
        </div>
        <Button onClick={onSend} className="h-10 gap-2" data-scandoc-tour="home-actions">
          <Send className="size-4" />
          Nouvel envoi
        </Button>
      </header>

      {/* —— Alertes (toutes rôles, compact) —— */}
      <AlertsBlock
        isAdmin={isDg}
        pendingAccounts={me.pendingAccounts ?? 0}
        pendingJoins={pendingJoin?.length ?? 0}
        awaiting={awaiting}
        unreadMsg={unreadMsg ?? 0}
        onNavigate={onNavigate}
      />

      
      {/* ========== BLOC DG : entreprise ========== */}
      {showEnterprise ? (
        <Section
          icon={BarChart3}
          title="Entreprise"
          subtitle="Vue d'ensemble et suivi par département"
        >
          {overview === undefined ? (
            <MndptLoader size="section" />
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
              ? "Membres et courriers de votre structure"
              : "Courriers et membres de la structure"
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
            <MndptLoader size="section" />
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
        title="Mes courriers"
        subtitle="Courriers qui vous concernent"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="À traiter"
            value={awaiting}
            hint="Courriers non classés"
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
            <Section title="Accès rapide">
        <div className="grid gap-2 sm:grid-cols-2">
          <QuickLink
            icon={Inbox}
            title="Courriers reçus"
            desc="À traiter dans votre structure"
            onClick={() => onNavigate("inbox")}
          />
          <QuickLink
            icon={Send}
            title="Courriers envoyés"
            desc="Courriers émis"
            onClick={() => onNavigate("sent")}
          />
          <QuickLink
            icon={Building2}
            title="Structures"
            desc="Directions et services"
            onClick={() => onNavigate("departments")}
          />
          {isDg ? (
            <QuickLink
              icon={UserCheck}
              title="Comptes"
              desc="Validation des inscriptions"
              onClick={() => onNavigate("accounts")}
            />
          ) : null}
        </div>
      </Section>


      {/* ========== Derniers reçus ========== */}
      <Section
        title="Derniers reçus"
        subtitle="Ouvrir un courrier"
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
            Aucun courrier reçu pour le moment.
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
                        {structureSender(document)} ·{" "}
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
      title: `${awaiting} courrier${awaiting > 1 ? "s" : ""} à traiter`,
      subtitle: "Courriers reçus non classés",
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

type DrillKind =
  | "members"
  | "sent"
  | "received"
  | "open"
  | "traite"
  | "overdue";

const DRILL_LABELS: Record<DrillKind, string> = {
  members: "Membres",
  sent: "Envoyés",
  received: "Reçus",
  open: "À traiter",
  traite: "Traités",
  overdue: "En retard",
};

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
  const [drill, setDrill] = useState<DrillKind | null>(null);
  const detailData = useQuery(
    api.documents.dgDetailList,
    drill ? { kind: drill } : "skip",
  );
  const signalChief = useMutation(api.documents.signalChief);
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="Documents actifs"
          value={overview.totals.documents}
          onClick={() => setDrill("open")}
        />
        <Metric
          label="En cours / à traiter"
          value={overview.totals.open}
          className="border-amber-200/80 bg-amber-50/80 text-amber-900"
          onClick={() => setDrill("open")}
        />
        <Metric
          label="En retard (>48 h)"
          value={overview.totals.overdue}
          className="border-red-200/80 bg-red-50/80 text-red-900"
          onClick={() => setDrill("overdue")}
        />
        <Metric
          label="Traités"
          value={overview.totals.traite}
          className="border-emerald-200/80 bg-emerald-50/80 text-emerald-900"
          onClick={() => setDrill("traite")}
        />
      </div>

      {drill ? (
        <div className="rounded-xl border border-brand/20 bg-brand-soft/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">
              Détail · {DRILL_LABELS[drill]}
            </h4>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1"
              onClick={() => setDrill(null)}
            >
              <X className="size-3.5" />
              Fermer
            </Button>
          </div>
          {detailData === undefined ? (
            <MndptLoader size="inline" />
          ) : !detailData.items.length ? (
            <p className="text-xs text-muted-foreground">Aucun élément.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {detailData.items.map((item: any) => (
                <li
                  key={item._id}
                  className="rounded-lg border border-border bg-card px-3 py-2"
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => onOpen(item._id as Id<"documents">)}
                  >
                    <p className="text-sm font-medium">
                      {item.objet || item.fileName || item.name}
                    </p>
                    {item.publicRef ? (
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {item.publicRef}
                      </p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      {item.senderName || item.senderDepartment
                        ? `${item.senderDepartment || item.senderName} → ${item.recipientDepartment || item.recipientName}`
                        : item.fonction || item.email || ""}
                      {item.activeAssigneeName
                        ? ` · chez ${item.activeAssigneeName}`
                        : ""}
                    </p>
                  </button>
                  {(drill === "overdue" || drill === "open") &&
                  item.type === "document" &&
                  item.status !== "traite" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 gap-1 text-xs"
                      disabled={busyId === item._id}
                      onClick={async () => {
                        setBusyId(item._id);
                        try {
                          const res = await signalChief({
                            documentId: item._id as Id<"documents">,
                          });
                          toast.success(
                            `Signalé au chef ${res.chiefName ?? ""}`,
                          );
                        } catch (e) {
                          toast.error(
                            e instanceof Error
                              ? e.message
                              : "Signalement impossible",
                          );
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    >
                      <Bell className="size-3" />
                      Signaler au chef
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* Synthèse organisation — compacte */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1">
          {overview.totals.departments} structures
        </span>
        <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1">
          {overview.totals.users} utilisateurs
        </span>
        {overview.totals.pendingAccounts > 0 ? (
          <button
            type="button"
            className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900"
            onClick={() => onNavigate("accounts")}
          >
            {overview.totals.pendingAccounts} compte
            {overview.totals.pendingAccounts > 1 ? "s" : ""} à valider
          </button>
        ) : null}
        {overview.totals.pendingJoins > 0 ? (
          <button
            type="button"
            className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-900"
            onClick={() => onNavigate("departments")}
          >
            {overview.totals.pendingJoins} adhésion
            {overview.totals.pendingJoins > 1 ? "s" : ""}
          </button>
        ) : null}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Structures à suivre
          </h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => onNavigate("org3d")}
          >
            Organigramme
          </Button>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Priorité aux courriers ouverts ou en retard. Toucher une ligne pour le détail.
        </p>
        {overview.departmentStats.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucune structure pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
            {[...overview.departmentStats]
              .filter((r) => r.departmentId !== "__none__")
              .sort(
                (a, b) =>
                  b.overdue - a.overdue ||
                  b.open - a.open ||
                  a.name.localeCompare(b.name, "fr"),
              )
              .slice(0, 10)
              .map((row) => {
                const canOpen = row.departmentId.length > 10;
                return (
                  <li key={row.departmentId}>
                    <button
                      type="button"
                      disabled={!canOpen}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 disabled:opacity-60"
                      onClick={() => {
                        if (!canOpen) return;
                        onSelectDept(
                          row.departmentId as Id<"departments">,
                        );
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {row.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {row.members} membre
                          {row.members !== 1 ? "s" : ""}
                          {row.chiefs > 0
                            ? ` · ${row.chiefs} chef${row.chiefs > 1 ? "s" : ""}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2 text-center text-[10px]">
                        <span
                          className={
                            row.open > 0
                              ? "font-semibold text-amber-800"
                              : "text-muted-foreground"
                          }
                        >
                          {row.open}
                          <span className="block font-normal text-muted-foreground">
                            ouv.
                          </span>
                        </span>
                        <span
                          className={
                            row.overdue > 0
                              ? "font-semibold text-red-700"
                              : "text-muted-foreground"
                          }
                        >
                          {row.overdue}
                          <span className="block font-normal text-muted-foreground">
                            retard
                          </span>
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Derniers courriers
        </h4>
        {overview.recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun courrier.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border">
            {overview.recent.slice(0, 5).map((doc) => (
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
                      {doc.senderDepartment || "Structure"}
                      {" → "}
                      {doc.recipientDepartment || doc.recipientName || "Structure"}
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
      _id?: string;
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
  const [drill, setDrill] = useState<DrillKind | null>(null);
  const deptId = detail.department._id as Id<"departments"> | undefined;
  const detailData = useQuery(
    api.documents.dgDetailList,
    drill && deptId
      ? { kind: drill, departmentId: deptId }
      : drill
        ? { kind: drill }
        : "skip",
  );
  const signalChief = useMutation(api.documents.signalChief);
  const [busyId, setBusyId] = useState<string | null>(null);

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
        <Metric
          label="Membres"
          value={detail.totals.members}
          onClick={() => setDrill("members")}
        />
        <Metric
          label="Envoyés"
          value={detail.totals.sent}
          onClick={() => setDrill("sent")}
        />
        <Metric
          label="Reçus"
          value={detail.totals.received}
          onClick={() => setDrill("received")}
        />
        <Metric
          label="À traiter"
          value={detail.totals.open}
          className="text-amber-800"
          onClick={() => setDrill("open")}
        />
        <Metric
          label="Traités"
          value={detail.totals.traite}
          className="text-emerald-800"
          onClick={() => setDrill("traite")}
        />
        <Metric
          label="Retard"
          value={detail.totals.overdue}
          className={
            detail.totals.overdue > 0 ? "font-semibold text-red-700" : ""
          }
          onClick={() => setDrill("overdue")}
        />
      </div>

      {detail.totals.circuitActive > 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {detail.totals.circuitActive} courrier
          {detail.totals.circuitActive > 1 ? "s" : ""} en circuit chez un membre
          de ce département
        </p>
      ) : null}

      {drill ? (
        <div className="rounded-xl border border-brand/20 bg-brand-soft/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">
              Détail · {DRILL_LABELS[drill]}
            </h4>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1"
              onClick={() => setDrill(null)}
            >
              <X className="size-3.5" />
              Fermer
            </Button>
          </div>
          {detailData === undefined ? (
            <MndptLoader size="inline" />
          ) : !detailData.items.length ? (
            <p className="text-xs text-muted-foreground">Aucun élément.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {detailData.items.map((item: any) =>
                item.type === "member" ? (
                  <li
                    key={item._id}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {item.fonction ?? item.email ?? "—"}
                      {item.departmentRole === "chef" ? " · Chef" : ""}
                    </span>
                  </li>
                ) : (
                  <li
                    key={item._id}
                    className="rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => onOpen(item._id as Id<"documents">)}
                    >
                      <p className="text-sm font-medium">
                        {item.objet || item.fileName}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {item.publicRef ?? "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {(item as { senderDepartment?: string }).senderDepartment ||
                          item.senderName}{" "}
                        →{" "}
                        {(item as { recipientDepartment?: string }).recipientDepartment ||
                          item.recipientName}
                        {item.activeAssigneeName
                          ? ` · chez ${item.activeAssigneeName}`
                          : ""}
                      </p>
                    </button>
                    {(drill === "overdue" || drill === "open") &&
                    item.status !== "traite" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 gap-1 text-xs"
                        disabled={busyId === item._id}
                        onClick={async () => {
                          setBusyId(item._id);
                          try {
                            const res = await signalChief({
                              documentId: item._id as Id<"documents">,
                            });
                            toast.success(
                              `Signalé au chef ${res.chiefName ?? ""} (${res.deptName ?? ""})`,
                            );
                          } catch (e) {
                            toast.error(
                              e instanceof Error
                                ? e.message
                                : "Signalement impossible",
                            );
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        <Bell className="size-3" />
                        Signaler au chef
                      </Button>
                    ) : null}
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
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
                      {structureSender(doc as any)} → {structureRecipient(doc as any)}
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
  onClick,
}: {
  label: string;
  value: number;
  className?: string;
  onClick?: () => void;
}) {
  const cls = `rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-left transition ${className} ${
    onClick
      ? "cursor-pointer hover:border-brand/40 hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      : ""
  }`;
  const inner = (
    <>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {onClick ? (
        <p className="mt-0.5 text-[10px] text-brand">Voir le détail →</p>
      ) : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
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
