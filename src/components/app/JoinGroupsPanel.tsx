import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { Building2, Check, Clock, Loader2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Demande d'adhésion style « groupes Facebook » :
 * l'utilisateur demande, le chef valide.
 */
export function JoinGroupsPanel() {
  const me = useQuery(api.workspace.me);
  const departments = useQuery(api.departmentMembership.listDepartmentsPublic);
  const myRequests = useQuery(api.departmentMembership.myJoinRequests);
  const requestJoin = useMutation(api.departmentMembership.requestJoin);
  const cancelRequest = useMutation(
    api.departmentMembership.cancelMyJoinRequest,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!me || departments === undefined || myRequests === undefined) {
    return null;
  }

  // Déjà membre : pas besoin de ce panneau
  if (me.department?._id) return null;

  const pendingByDept = new Map(
    myRequests.map((r) => [r.departmentId as string, r]),
  );

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          Rejoindre un département
        </CardTitle>
        <CardDescription>
          Comme un groupe : choisissez un département, envoyez une demande. Le
          chef accepte ou refuse.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun département n&apos;a encore été créé. Contactez le DG.
          </p>
        ) : (
          <ul className="space-y-2">
            {departments.map((dept) => {
              const pending = pendingByDept.get(dept._id as string);
              const isBusy = busyId === dept._id;

              return (
                <li
                  key={dept._id}
                  className={cn(
                    "flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between",
                    pending && "border-amber-200 bg-amber-50/50",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-brand text-primary-foreground">
                      <Building2 className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{dept.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {dept.memberCount} membre
                        {dept.memberCount > 1 ? "s" : ""}
                        {dept.description ? ` · ${dept.description}` : ""}
                      </p>
                      {pending ? (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-800">
                          <Clock className="size-3" />
                          Demande envoyée — en attente du chef
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2 self-end sm:self-center">
                    {pending ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled
                          className="gap-1"
                        >
                          <Check className="size-3.5" />
                          Demande envoyée
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={async () => {
                            setBusyId(dept._id);
                            try {
                              await cancelRequest({
                                requestId: pending._id,
                              });
                              toast.message("Demande annulée");
                            } catch (e) {
                              toast.error(
                                e instanceof Error ? e.message : "Erreur",
                              );
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          {isBusy ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            "Annuler"
                          )}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={isBusy}
                        className="gap-1"
                        onClick={async () => {
                          setBusyId(dept._id);
                          try {
                            await requestJoin({
                              departmentId: dept._id as Id<"departments">,
                            });
                            toast.success(
                              "Demande envoyée au chef du département",
                            );
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : "Erreur",
                            );
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        {isBusy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          "Rejoindre"
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
