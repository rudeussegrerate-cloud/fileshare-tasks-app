import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Building2,
  Check,
  Clock3,
  Crown,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  ShieldX,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, formatDay, initialsOf } from "./shared";

type StatusFilter = "en_attente" | "valide" | "rejete";

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "en_attente", label: "En attente" },
  { key: "valide", label: "Validés" },
  { key: "rejete", label: "Rejetés" },
];

function statusLabel(status: string) {
  if (status === "valide") return "Validé";
  if (status === "rejete") return "Rejeté";
  return "En attente";
}

export function AccountsView() {
  const me = useQuery(api.workspace.me);
  const accounts = useQuery(api.workspace.listAccounts);
  const validateAccount = useMutation(api.workspace.validateAccount);
  const rejectAccount = useMutation(api.workspace.rejectAccount);
  const promoteToDirector = useMutation(api.workspace.promoteToDirector);
  const revokeDirector = useMutation(api.workspace.revokeDirector);
  const [filter, setFilter] = useState<StatusFilter>("en_attente");
  const [pendingReject, setPendingReject] = useState<{
    id: Id<"users">;
    name: string;
  } | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<{
    id: Id<"users">;
    name: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<Id<"users"> | null>(null);

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = {
      en_attente: 0,
      valide: 0,
      rejete: 0,
    };
    for (const account of accounts ?? []) {
      base[account.accountStatus] += 1;
    }
    return base;
  }, [accounts]);

  const visible = useMemo(
    () => (accounts ?? []).filter((account) => account.accountStatus === filter),
    [accounts, filter],
  );

  if (!me || !accounts) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!me.isAdmin) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Accès réservé au DG"
        description="Seul le DG et le super utilisateur peuvent gérer les comptes."
      />
    );
  }

  const run = async (
    action: () => Promise<unknown>,
    success: string,
    fallbackError: string,
    userId: Id<"users">,
  ) => {
    setBusyId(userId);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallbackError);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <UserRound className="size-4" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Comptes</h2>
          <p className="text-xs text-muted-foreground">
            Validez ou rejetez les demandes. Seuls les comptes validés peuvent
            rejoindre un département.
          </p>
        </div>
      </div>

      {me.isRoot ? (
        <div className="flex items-start gap-2 rounded-lg border border-brand-sky/25 bg-brand-soft/60 px-4 py-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-sky" />
          <p>
            En tant que <span className="font-medium text-foreground">super
            utilisateur</span>, vous désignez qui est DG : nommez un compte
            validé comme DG, ou révoquez le DG en place. Le DG gère ensuite les
            départements et les chefs.
          </p>
        </div>
      ) : null}

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
            <span className="ml-1.5 opacity-70">{counts[entry.key]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={
            filter === "en_attente"
              ? Clock3
              : filter === "valide"
                ? UserRound
                : ShieldX
          }
          title={
            filter === "en_attente"
              ? "Aucune demande en attente"
              : filter === "valide"
                ? "Aucun compte validé"
                : "Aucun compte rejeté"
          }
          description={
            filter === "en_attente"
              ? "Les nouvelles inscriptions apparaîtront ici pour validation."
              : "Rien à afficher dans cette catégorie pour le moment."
          }
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((account) => {
            const busy = busyId === account._id;
            const isDirectorRole = account.role === "admin";
            const isRootRole = account.role === "root";

            return (
              <li key={account._id}>
                <Card className="border-border/80 shadow-none">
                  <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center">
                    <span
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                        account.accountStatus === "valide"
                          ? "bg-emerald-50 text-emerald-700"
                          : account.accountStatus === "en_attente"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {initialsOf(account.name)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {account.name}
                        </p>
                        {isRootRole ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-brand-sky/40 bg-brand-soft text-[10px] font-medium text-brand-sky"
                          >
                            <ShieldCheck className="size-3" />
                            Super utilisateur
                          </Badge>
                        ) : null}
                        {isDirectorRole ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-brand/30 bg-brand-soft text-[10px] font-medium text-brand"
                          >
                            <Crown className="size-3" />
                            DG
                          </Badge>
                        ) : null}
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-medium",
                            account.accountStatus === "valide" &&
                              "border-emerald-200 bg-emerald-50 text-emerald-700",
                            account.accountStatus === "en_attente" &&
                              "border-amber-200 bg-amber-50 text-amber-700",
                            account.accountStatus === "rejete" &&
                              "border-destructive/30 bg-destructive/5 text-destructive",
                          )}
                        >
                          {statusLabel(account.accountStatus)}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {account.fonction ?? "Fonction non renseignée"}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Mail className="size-3.5" />
                          {account.email ?? "—"}
                        </span>
                        {account.phone ? (
                          <span className="flex items-center gap-1.5">
                            <Phone className="size-3.5" />
                            {account.phone}
                          </span>
                        ) : null}
                        {account.departmentName ? (
                          <span className="flex items-center gap-1.5">
                            <Building2 className="size-3.5" />
                            {account.departmentName}
                          </span>
                        ) : null}
                        <span>Inscrit le {formatDay(account.createdAt)}</span>
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {/* A DG account is never validated/rejected directly:
                          revoke it first, then review it. */}
                      {!isDirectorRole && !isRootRole ? (
                        <>
                          {account.accountStatus !== "valide" ? (
                            <Button
                              size="sm"
                              className="gap-1.5"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => validateAccount({ userId: account._id }),
                                  `Compte validé : ${account.name}`,
                                  "Validation impossible.",
                                  account._id,
                                )
                              }
                            >
                              {busy ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Check className="size-3.5" />
                              )}
                              Valider
                            </Button>
                          ) : null}
                          {account.accountStatus !== "rejete" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-destructive hover:text-destructive"
                              disabled={busy}
                              onClick={() =>
                                setPendingReject({
                                  id: account._id,
                                  name: account.name,
                                })
                              }
                            >
                              <ShieldX className="size-3.5" />
                              Rejeter
                            </Button>
                          ) : null}
                          {me.isRoot && account.accountStatus === "valide" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () =>
                                    promoteToDirector({ userId: account._id }),
                                  `${account.name} est désormais DG.`,
                                  "Nomination impossible.",
                                  account._id,
                                )
                              }
                            >
                              <Crown className="size-3.5" />
                              Nommer DG
                            </Button>
                          ) : null}
                        </>
                      ) : null}

                      {me.isRoot && isDirectorRole ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-destructive hover:text-destructive"
                          disabled={busy}
                          onClick={() =>
                            setPendingRevoke({
                              id: account._id,
                              name: account.name,
                            })
                          }
                        >
                          <ShieldX className="size-3.5" />
                          Révoquer le DG
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog
        open={pendingReject !== null}
        onOpenChange={(open) => {
          if (!open) setPendingReject(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Rejeter la demande de {pendingReject?.name} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette personne ne pourra pas être affectée à un département et ne
              pourra plus accéder à l'espace de travail. Si elle était déjà
              affectée, son poste dans le département est libéré. Vous pouvez
              revenir sur cette décision à tout moment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingReject) return;
                const target = pendingReject;
                setPendingReject(null);
                void run(
                  () => rejectAccount({ userId: target.id }),
                  `Compte rejeté : ${target.name}`,
                  "Rejet impossible.",
                  target.id,
                );
              }}
            >
              Rejeter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Révoquer le DG {pendingRevoke?.name} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ce compte redevient un simple membre : il perd la gestion des
              départements, des chefs et des comptes. Son affectation à un
              département est conservée pour l'instant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingRevoke) return;
                const target = pendingRevoke;
                setPendingRevoke(null);
                void run(
                  () => revokeDirector({ userId: target.id }),
                  `${target.name} n'est plus DG.`,
                  "Révocation impossible.",
                  target.id,
                );
              }}
            >
              Révoquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
