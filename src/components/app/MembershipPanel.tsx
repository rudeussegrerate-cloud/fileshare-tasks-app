import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Mail, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Invitations + demandes d'adhésion.
 * - Tout membre peut inviter
 * - Seul le chef / DG valide les adhésions
 */
export function MembershipPanel() {
  const me = useQuery(api.workspace.me);
  const pending = useQuery(api.departmentMembership.listPendingRequests, {});
  const myInvites = useQuery(api.departmentMembership.myInvitations);
  const review = useMutation(api.departmentMembership.reviewRequest);
  const respond = useMutation(api.departmentMembership.respondInvitation);
  const invite = useMutation(api.departmentMembership.inviteByEmail);
  const cancelInv = useMutation(api.departmentMembership.cancelInvitation);
  const sent = useQuery(
    api.departmentMembership.listSentInvitations,
    me?.department?._id
      ? { departmentId: me.department._id as Id<"departments"> }
      : "skip",
  );

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const isMember = Boolean(me?.department?._id);
  const canValidate = Boolean(me?.isChef || me?.isAdmin || me?.isRoot);
  const canInvite = isMember || Boolean(me?.isAdmin || me?.isRoot);

  if (!me) return null;

  return (
    <div className="space-y-4">
      {(myInvites?.length ?? 0) > 0 ? (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Invitations reçues</CardTitle>
            <CardDescription>
              Acceptez pour demander l&apos;adhésion — le chef du département
              validera ensuite.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {myInvites!.map((inv) => (
              <div
                key={inv._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{inv.departmentName}</p>
                  <p className="text-xs text-muted-foreground">
                    Invité par {inv.invitedByName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await respond({ invitationId: inv._id, accept: true });
                        toast.success(
                          "Invitation acceptée — en attente du chef",
                        );
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Erreur",
                        );
                      }
                    }}
                  >
                    Accepter
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await respond({
                          invitationId: inv._id,
                          accept: false,
                        });
                        toast.message("Invitation refusée");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Erreur",
                        );
                      }
                    }}
                  >
                    Refuser
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {canValidate && (pending?.length ?? 0) > 0 ? (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="size-4" />
              Demandes d&apos;adhésion
            </CardTitle>
            <CardDescription>
              Validez ou refusez les personnes qui souhaitent rejoindre le
              département (inscription ou invitation).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending!.map((r) => (
              <div
                key={r._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.email}
                    {r.fonction ? ` · ${r.fonction}` : ""}
                    {" · "}
                    {r.departmentName}
                    {r.accountStatus !== "valide"
                      ? " · compte en attente DG"
                      : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await review({ requestId: r._id, accept: true });
                        toast.success("Adhésion acceptée");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Erreur",
                        );
                      }
                    }}
                  >
                    Accepter
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await review({ requestId: r._id, accept: false });
                        toast.message("Demande refusée");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Erreur",
                        );
                      }
                    }}
                  >
                    Refuser
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {canInvite && me.department?._id ? (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4" />
              Inviter dans {me.department.name}
            </CardTitle>
            <CardDescription>
              Tout membre peut inviter. Le chef validera l&apos;adhésion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!email.trim() || !me.department?._id) return;
                setBusy(true);
                try {
                  await invite({
                    departmentId: me.department._id,
                    email: email.trim(),
                  });
                  toast.success("Invitation envoyée");
                  setEmail("");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Erreur");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Input
                type="email"
                placeholder="prenom.nom@entreprise.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" disabled={busy} className="shrink-0">
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Inviter"
                )}
              </Button>
            </form>
            {(sent?.length ?? 0) > 0 ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {sent!.map((s) => (
                  <li
                    key={s._id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>
                      {s.email} · en attente
                      {s.invitedByMe ? " (vous)" : ""}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async () => {
                        try {
                          await cancelInv({ invitationId: s._id });
                          toast.message("Invitation annulée");
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Erreur",
                          );
                        }
                      }}
                    >
                      Annuler
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
