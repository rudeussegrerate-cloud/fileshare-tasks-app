import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Clock3,
  FileText,
  LogOut,
  RefreshCw,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import { useNavigate } from "react-router";

type BlockedStatus = "en_attente" | "rejete";

/**
 * Shown to a signed-in person whose account the DG has not approved (yet).
 * The `me` query is reactive, so this screen disappears on its own as soon as
 * the DG validates the account.
 */
export function AccountStatusScreen({
  status,
  name,
  email,
  fonction,
}: {
  status: BlockedStatus;
  name: string;
  email: string | null;
  fonction: string | null;
}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const pending = status === "en_attente";
  const Icon = pending ? Clock3 : ShieldX;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-deep via-brand to-brand-sky/70 px-4 py-12">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="relative w-full max-w-lg">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 text-white">
            <FileText className="size-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-white">
              ScanDoc
            </span>
            <span className="block text-[10px] uppercase tracking-wide text-white/60">
              Fichiers inter-départements
            </span>
          </span>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader>
            <div
              className={cn(
                "flex size-11 items-center justify-center rounded-xl",
                pending
                  ? "bg-amber-50 text-amber-600"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              <Icon className="size-5" />
            </div>
            <CardTitle className="mt-3 text-xl">
              {pending
                ? "Compte en attente de validation"
                : "Demande de compte refusée"}
            </CardTitle>
            <CardDescription>
              {pending
                ? "Votre compte a bien été créé. Le DG doit maintenant l'approuver avant que vous puissiez être affecté à un département et échanger des documents."
                : "Le DG n'a pas approuvé cette demande. Contactez-le si vous pensez qu'il s'agit d'une erreur, il peut revenir sur sa décision."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="rounded-xl border border-border bg-brand-soft/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Votre demande
              </p>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Nom</dt>
                  <dd className="text-right font-medium">{name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="truncate text-right font-medium">
                    {email ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Fonction</dt>
                  <dd className="text-right font-medium">
                    {fonction ?? "Non renseignée"}
                  </dd>
                </div>
              </dl>
            </div>

            {pending ? (
              <div className="flex items-start gap-2 rounded-lg border border-brand-sky/25 bg-brand-soft/60 px-3 py-2 text-xs text-muted-foreground">
                <RefreshCw className="mt-0.5 size-3.5 shrink-0 text-brand-sky" />
                <p>
                  Cette page se met à jour automatiquement : dès que le DG
                  valide votre compte, votre espace de travail s'ouvre.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                <p>
                  Si le DG vous valide plus tard, votre accès sera rétabli
                  automatiquement avec le même compte.
                </p>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="size-4" />
              Se déconnecter
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
