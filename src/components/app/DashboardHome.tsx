import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  AlertTriangle,
  CheckCircle2,
  Clock,
  Crown,
} from "lucide-react";
import { useState } from "react";
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
  const deptDetail = useQuery(
    api.documents.departmentOverview,
    me?.isAdmin || me?.isRoot
      ? selectedDeptId
        ? { departmentId: selectedDeptId }
        : "skip"
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

      {/* Vue d'ensemble DG */}
      {me.isAdmin && overview ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <BarChart3 className="size-4 text-brand" />
                Vue d&apos;ensemble de l&apos;entreprise
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tous les échanges et le suivi par département
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Documents actifs</p>
              <p className="text-xl font-semibold tabular-nums">{overview.totals.documents}</p>
            </div>
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-amber-800/80">En cours / à traiter</p>
              <p className="text-xl font-semibold tabular-nums text-amber-900">{overview.totals.open}</p>
            </div>
            <div className="rounded-lg border border-red-200/80 bg-red-50/80 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-red-800/80">En retard (&gt;48 h)</p>
              <p className="text-xl font-semibold tabular-nums text-red-900">{overview.totals.overdue}</p>
            </div>
            <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-emerald-800/80">Traités</p>
              <p className="text-xl font-semibold tabular-nums text-emerald-900">{overview.totals.traite}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-md bg-muted/40 px-2 py-1.5">
              <span className="text-muted-foreground">Départements</span>
              <span className="ml-1 font-semibold">{overview.totals.departments}</span>
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
              <span className="ml-1 font-semibold">{overview.totals.pendingAccounts}</span>
            </button>
            <button
              type="button"
              className="rounded-md bg-muted/40 px-2 py-1.5 text-left hover:bg-muted"
              onClick={() => onNavigate("departments")}
            >
              <span className="text-muted-foreground">Adhésions en attente</span>
              <span className="ml-1 font-semibold">{overview.totals.pendingJoins}</span>
            </button>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Suivi par département
            </h4>
            {overview.departmentStats.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun département pour le moment.</p>
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
                            setSelectedDeptId(
                              row.departmentId as Id<"departments">,
                            );
                          }}
                          title={
                            canOpen
                              ? "Ouvrir le tableau de bord de ce département"
                              : undefined
                          }
                        >
                          <td className="px-3 py-2 font-medium text-foreground">
                            <span className={canOpen ? "text-brand underline-offset-2 hover:underline" : ""}>
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
                          <td className="px-2 py-2 tabular-nums text-amber-800">{row.open}</td>
                          <td className="px-2 py-2 tabular-nums text-emerald-800">{row.traite}</td>
                          <td className={`px-2 py-2 tabular-nums ${row.overdue > 0 ? "font-semibold text-red-700" : ""}`}>
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
              Derniers échanges (tous départements)
            </h4>
            {overview.recent.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun document échangé.</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border">
                {overview.recent.slice(0, 12).map((doc) => (
                  <li key={doc._id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
                      onClick={() => onOpen(doc._id as Id<"documents">)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {doc.objet || doc.fileName}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {doc.senderName}
                          <span className="text-muted-foreground/70"> ({doc.senderDepartment})</span>
                          {" → "}
                          {doc.recipientName}
                          <span className="text-muted-foreground/70"> ({doc.recipientDepartment})</span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <StatusBadge status={doc.status as "envoye" | "consulte" | "en_cours" | "traite"} />
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
        </section>
      ) : me.isAdmin && overview === undefined ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Chargement de la vue d&apos;ensemble…
        </div>
      ) : null}

      {/* Détail département (clic ligne tableau DG) */}
      {me.isAdmin && selectedDeptId ? (
        <section className="space-y-3 rounded-xl border border-brand/30 bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigate("departments")}
            >
              Gérer les départements
            </Button>
          </div>

          {!deptDetail ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Chargement du département…
            </div>
          ) : (
            <>
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <Building2 className="size-4 text-brand" />
                  {deptDetail.department.name}
                </h3>
                {deptDetail.department.description ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {deptDetail.department.description}
                  </p>
                ) : null}
                {deptDetail.chief ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Crown className="size-3.5 text-amber-600" />
                    Chef · {deptDetail.chief.name}
                    {deptDetail.chief.fonction
                      ? ` (${deptDetail.chief.fonction})`
                      : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-amber-700">
                    Aucun chef désigné
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: "Membres", value: deptDetail.totals.members },
                  { label: "Envoyés", value: deptDetail.totals.sent },
                  { label: "Reçus", value: deptDetail.totals.received },
                  {
                    label: "À traiter",
                    value: deptDetail.totals.open,
                    tone: "text-amber-800",
                  },
                  {
                    label: "Traités",
                    value: deptDetail.totals.traite,
                    tone: "text-emerald-800",
                  },
                  {
                    label: "Retard",
                    value: deptDetail.totals.overdue,
                    tone:
                      deptDetail.totals.overdue > 0
                        ? "text-red-700 font-semibold"
                        : "",
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {c.label}
                    </p>
                    <p
                      className={`text-xl font-semibold tabular-nums ${c.tone ?? ""}`}
                    >
                      {c.value}
                    </p>
                  </div>
                ))}
              </div>

              {deptDetail.totals.circuitActive > 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {deptDetail.totals.circuitActive} document
                  {deptDetail.totals.circuitActive > 1 ? "s" : ""} en circuit
                  actuellement chez un membre de ce département
                </p>
              ) : null}

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Membres ({deptDetail.members.length})
                </h4>
                {deptDetail.members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucun membre validé.
                  </p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {deptDetail.members.map((m) => {
                      const online =
                        m.lastSeenAt != null &&
                        Date.now() - m.lastSeenAt < ONLINE_MS;
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
                {deptDetail.recent.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucun échange lié à ce département.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60 rounded-lg border border-border">
                    {deptDetail.recent.map((doc) => (
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
            </>
          )}
        </section>
      ) : null}

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
