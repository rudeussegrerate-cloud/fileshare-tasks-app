import { ProfileForm } from "@/components/app/ProfileForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import {
  Building2,
  Crown,
  Loader2,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router";
import { initialsOf } from "./shared";

export function SettingsView() {
  const me = useQuery(api.workspace.me);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  if (!me) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const roleLabel = me.isRoot
    ? "Super utilisateur (root)"
    : me.isAdmin
      ? "Directeur Général (admin principal)"
      : me.isChef
        ? "Chef de département"
        : "Membre";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Paramètres</h2>
        <p className="text-xs text-muted-foreground">
          Vos informations personnelles et votre rôle dans l'organisation.
        </p>
      </div>

      <Card className="border-border/80 shadow-none">
        <CardHeader>
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-brand text-lg font-semibold text-primary-foreground">
              {initialsOf(me.user.name)}
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">
                {me.user.name}
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <Mail className="size-3.5" />
                  {me.user.email ?? "—"}
                </span>
                {me.user.phone ? (
                  <span className="flex items-center gap-1.5">
                    <Phone className="size-3.5" />
                    {me.user.phone}
                  </span>
                ) : null}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              Rôle global
            </p>
            <p className="mt-2 text-sm font-medium">{roleLabel}</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <UserRound className="size-3.5" />
              Fonction
            </p>
            <p className="mt-2 text-sm font-medium">
              {me.user.fonction ?? "Non renseignée"}
            </p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Building2 className="size-3.5" />
              Département
            </p>
            <div className="mt-2 flex items-center gap-2">
              <p className="text-sm font-medium">
                {me.department?.name ?? "Non rattaché"}
              </p>
              {me.user.departmentRole === "chef" ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-200 bg-amber-50 text-[10px] text-amber-700"
                >
                  <Crown className="size-3" />
                  Chef
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="rounded-xl border border-border p-4 sm:col-span-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Collègues du département
            </p>
            {me.colleagues.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Aucun collègue pour l'instant.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {me.colleagues.map((colleague) => (
                  <span
                    key={colleague._id}
                    className="rounded-full border border-border bg-card px-3 py-1 text-xs"
                  >
                    {colleague.name}
                    {colleague.fonction ? ` · ${colleague.fonction}` : ""}
                    {colleague.departmentRole === "chef" ? " · chef" : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Mes informations</CardTitle>
          <CardDescription>
            Ce sont ces informations que le DG et les chefs voient lorsqu'ils
            vous rattachent à un département.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initialName={me.user.name}
            initialFonction={me.user.fonction ?? ""}
            initialPhone={me.user.phone ?? ""}
            submitLabel="Mettre à jour"
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Session</CardTitle>
          <CardDescription>
            Vous êtes connecté avec votre adresse email professionnelle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="gap-2 text-destructive hover:text-destructive"
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
  );
}
