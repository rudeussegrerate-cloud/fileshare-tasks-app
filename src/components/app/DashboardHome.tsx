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
  MailKindBadge,
  FileThumb,
  formatDateTime,
  initialsOf,
  structureRecipient,
  structureSender,
  UrgentBadge,
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
        ? `Chef de structure${me.department?.name ? ` · ${me.department.name}` : ""}`
        : me.department?.name
          ? `Membre · ${me.department.name}`
          : "Membre";

  /** Pilotage structure / ministère : chefs + DG uniquement */
  const isManager = isDg || isChef;
  const showEnterprise = isDg && !selectedDeptId;
  const showDeptPanel = Boolean(selectedDeptId) && isManager;

  return (
    <div className="space-y-6" data-scandoc-tour="home-stats">
      <header className="sc-dash-hero flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4c3ec7]">
            Tableau de bord
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-[#0f0a24]">
            Bonjour{firstName ? `, ${firstName}` : ""}
          </h2>
          <p className="text-sm font-medium text-[#3d3858]">{roleLine}</p>
        </div>
        <Button
          onClick={onSend}
          className="h-11 gap-2 rounded-xl bg-[#4c3ec7] px-5 font-semibold text-white shadow-md hover:bg-[#3b2f9e]"
          data-scandoc-tour="home-actions"
        >
          <Send className="size-4" />
          Nouveau courrier
        </Button>
      </header>

      {isManager ? (
        <AlertsBlock
          isAdmin={isDg}
          pendingAccounts={me.pendingAccounts ?? 0}
          pendingJoins={pendingJoin?.length ?? 0}
          awaiting={awaiting}
          unreadMsg={0}
          onNavigate={onNavigate}
        />
      ) : null}

      {showEnterprise ? (
        <Section
          icon={BarChart3}
          title="Vue d'ensemble"
          subtitle="Pilotage des courriers (personne → personne) et des directions"
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

      {showDeptPanel ? (
        <Section
          icon={Building2}
          title={
            isChef
              ? `Ma structure${me.department?.name ? ` · ${me.department.name}` : ""}`
              : "Structure"
          }
          subtitle="Courriers et membres de la structure"
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
                Vue d&apos;ensemble
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

      <Section
        icon={Inbox}
        title="Mes courriers"
        subtitle={
          isManager
            ? "Activité courrier liée à votre rôle"
            : "Vos courriers reçus et à traiter"
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile
            label="À traiter"
            value={awaiting}
            hint="Reçus non classés"
            onClick={() => onNavigate("inbox")}
          />
          <StatTile
            label="Reçus"
            value={inboxList.length}
            hint="Liste complète"
            onClick={() => onNavigate("inbox")}
          />
          <StatTile
            label="Rédiger"
            value="→"
            hint="Nouveau courrier"
            onClick={onSend}
          />
        </div>
      </Section>

      <Section title="Derniers reçus" subtitle="Ouvrir un courrier">
        {recent.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            Aucun courrier reçu pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-[#ebe7f5] overflow-hidden rounded-xl border border-[#e4dff2] bg-white">
            {recent.map((courrier) => {
              const objet =
                (courrier.objet && String(courrier.objet).trim()) ||
                courrier.fileName;
              const sender =
                (courrier as { senderName?: string }).senderName?.trim() ||
                structureSender(courrier);
              const isUrgent = Boolean(
                (courrier as { urgent?: boolean }).urgent &&
                  courrier.status !== "traite",
              );
              return (
                <li key={courrier._id}>
                  <button
                    type="button"
                    onClick={() => onOpen(courrier._id)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-secondary/50"
                  >
                    <FileThumb
                      fileName={courrier.fileName}
                      contentType={(courrier as { contentType?: string }).contentType}
                      fileUrl={(courrier as { fileUrl?: string | null }).fileUrl}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {objet}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        De {sender}
                        {(courrier as { senderDepartmentName?: string | null })
                          .senderDepartmentName
                          ? ` · ${(courrier as { senderDepartmentName?: string }).senderDepartmentName}`
                          : ""}
                        {" · "}
                        {formatDateTime(courrier.createdAt)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {isUrgent ? <UrgentBadge /> : null}
                      <span className="flex items-center gap-1">
                        <MailKindBadge
                          kind={(courrier as { mailKind?: string }).mailKind}
                        />
                        <StatusBadge
                          status={courrier.status}
                          asRecipient
                        />
                      </span>
                    </span>
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
    <section className="sc-dash-card space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight text-[#0f0a24]">
            {Icon ? <Icon className="size-4 text-brand" /> : null}
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs font-medium text-[#3d3858]">{subtitle}</p>
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
                  ? "flex w-full items-start gap-3 rounded-xl border border-brand/25 bg-brand-soft px-4 py-3 text-left"
                  : "flex w-full items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-brand-soft/40"
              }
            >
              <Icon
                className={
                  item.tone === "amber"
                    ? "mt-0.5 size-4 shrink-0 text-brand-deep"
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="Courriers actifs"
          value={overview.totals.documents}
          onClick={() => setDrill("open")}
        />
        <Metric
          label="En cours / à traiter"
          value={overview.totals.open}
          className="border-brand/20 bg-brand-soft text-brand-deep"
          onClick={() => setDrill("open")}
        />
        <Metric
          label="En retard (>24 h)"
          value={overview.totals.overdue}
          className="border-red-200/80 bg-red-50/80 text-red-900"
          onClick={() => setDrill("overdue")}
        />
        <Metric
          label="Classés"
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
                        ? `${item.senderName || item.senderDepartment || "—"} → ${item.recipientName || item.recipientDepartment || "—"}`
                        : item.fonction || item.email || ""}
                      {item.activeAssigneeName
                        ? ` · chez ${item.activeAssigneeName}`
                        : ""}
                    </p>
                  </button>
                  {(drill === "overdue" || drill === "open") &&
                  item.type === "courrier" &&
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
            onClick={() => onNavigate("departments")}
          >
            Organigramme
          </Button>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Courriers non classés ou en retard (plus de 24 h) par direction. Toucher une ligne pour le détail.
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
                      {doc.senderName || doc.senderDepartment || "—"}
                      {" → "}
                      {doc.recipientName || doc.recipientDepartment || "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge
                      status={
                        doc.status as
                          | "envoye"
                          | "consulte"
                          | "en_cours"
                          | "en_retard"
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
          label="Classés"
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
          {detail.totals.circuitActive > 1 ? "s" : ""} en cours dans la structure
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
                          | "en_retard"
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
  const cls = `rounded-xl border border-[#e4dff2] bg-white px-3.5 py-3 text-left shadow-sm transition ${className} ${
    onClick
      ? "cursor-pointer hover:border-[#5b4cdb]/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b4cdb]/30"
      : ""
  }`;
  const inner = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#5b5678]">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums text-[#1a1238]">{value}</p>
      {onClick ? (
        <p className="mt-0.5 text-[10px] font-medium text-[#5b4cdb]">Voir le détail →</p>
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
  value: number | string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-[#ddd6f3] bg-[#faf9fd] p-3.5 text-left shadow-sm transition hover:border-[#5b4cdb]/40 hover:bg-[#efeaff]"
    >
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-brand-deep">
        {value}
      </p>
      <p className="text-xs font-medium text-foreground">{label}</p>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </button>
  );
}

