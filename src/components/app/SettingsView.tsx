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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  Bell,
  Building2,
  ChevronRight,
  Crown,
  FileText,
  HelpCircle,
  Inbox,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Moon,
  Phone,
  Send,
  Settings2,
  Shield,
  ShieldCheck,
  Sun,
  Upload,
  UserCheck,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { AppView } from "./AppShell";
import { initialsOf } from "./shared";

type View = AppView;

function getTheme(): "light" | "dark" | "system" {
  const stored = localStorage.getItem("scandoc-theme");
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function applyTheme(theme: "light" | "dark" | "system") {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", dark);
  localStorage.setItem("scandoc-theme", theme);
}

function getNotifPref(): boolean {
  return localStorage.getItem("scandoc-notif") !== "off";
}

export function SettingsView({
  onNavigate,
}: {
  onNavigate?: (view: View) => void;
}) {
  const me = useQuery(api.workspace.me);
  const stats = useQuery(api.documents.stats);
  const { signOut, signIn } = useAuth();
  const navigate = useNavigate();

  const [theme, setTheme] = useState<"light" | "dark" | "system">(getTheme);
  const [notif, setNotif] = useState(getNotifPref);
  const [pwdStep, setPwdStep] = useState<"idle" | "code-sent">("idle");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdCode, setPwdCode] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  if (!me) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const roleLabel = me.isRoot
    ? "Super utilisateur"
    : me.isAdmin
      ? "Directeur Général"
      : me.isChef
        ? "Chef de département"
        : "Membre";

  const accountLabel =
    me.accountStatus === "valide"
      ? "Compte validé"
      : me.accountStatus === "rejete"
        ? "Compte rejeté"
        : me.accountStatus === "en_attente"
          ? "En attente de validation"
          : "—";

  const go = (view: View) => onNavigate?.(view);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Paramètres</h2>
        <p className="text-sm text-muted-foreground">
          Gérez votre compte, vos préférences et les options selon vos droits.
        </p>
      </div>

      {/* —— Profil —— */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-sm bg-brand text-lg font-semibold text-primary-foreground">
              {initialsOf(me.user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-base">
                {me.user.name}
              </CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
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
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1 text-xs">
                  <ShieldCheck className="size-3" />
                  {roleLabel}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    me.accountStatus === "valide" &&
                      "border-emerald-300 bg-emerald-50 text-emerald-800",
                    me.accountStatus === "en_attente" &&
                      "border-amber-300 bg-amber-50 text-amber-800",
                    me.accountStatus === "rejete" &&
                      "border-red-300 bg-red-50 text-red-800",
                  )}
                >
                  {accountLabel}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <InfoBlock
            icon={UserRound}
            label="Fonction"
            value={me.user.fonction ?? "Non renseignée"}
          />
          <InfoBlock
            icon={Building2}
            label="Département"
            value={me.department?.name ?? "Non rattaché"}
            extra={
              me.user.departmentRole === "chef" ? (
                <Badge
                  variant="outline"
                  className="ml-1 gap-1 border-amber-200 bg-amber-50 text-[10px] text-amber-700"
                >
                  <Crown className="size-3" />
                  Chef
                </Badge>
              ) : null
            }
          />
          <InfoBlock
            icon={Shield}
            label="Rôle"
            value={roleLabel}
          />
        </CardContent>
      </Card>

      {/* —— Modifier le profil —— */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4" />
            Mes informations
          </CardTitle>
          <CardDescription>
            Nom, fonction et téléphone visibles par le DG et les chefs de
            département.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initialName={me.user.name ?? ""}
            initialFonction={me.user.fonction ?? ""}
            initialPhone={me.user.phone ?? ""}
            submitLabel="Enregistrer les modifications"
          />
        </CardContent>
      </Card>

      {/* —— Préférences —— */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4" />
            Préférences d&apos;affichage
          </CardTitle>
          <CardDescription>
            Réglages enregistrés sur cet appareil.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Thème</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "light", label: "Clair", icon: Sun },
                  { id: "dark", label: "Sombre", icon: Moon },
                  { id: "system", label: "Système", icon: Settings2 },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTheme(opt.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-sm border px-3 py-2 text-sm font-medium",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-secondary",
                    )}
                  >
                    <Icon className="size-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Rappels locaux</p>
                <p className="text-xs text-muted-foreground">
                  Afficher un rappel sur cet appareil lorsqu&apos;un document
                  est en attente (navigateur).
                </p>
              </div>
            </div>
            <Switch
              checked={notif}
              onCheckedChange={(v) => {
                setNotif(v);
                localStorage.setItem("scandoc-notif", v ? "on" : "off");
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* —— Documents (tous) —— */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />
            Documents
          </CardTitle>
          <CardDescription>
            Accès rapide à vos documents et statistiques.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats ? (
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Reçus" value={stats.received} />
              <Stat label="Envoyés" value={stats.sent} />
              <Stat label="En attente" value={stats.awaiting} />
              <Stat label="Traités" value={stats.done} />
            </div>
          ) : null}
          <ActionRow
            icon={Upload}
            title="Nouveau document"
            description="Envoyer un fichier à un collègue"
            onClick={() => go("send")}
          />
          <ActionRow
            icon={Inbox}
            title="Documents reçus"
            description="Consulter et traiter vos documents"
            onClick={() => go("inbox")}
          />
          <ActionRow
            icon={Send}
            title="Documents envoyés"
            description="Suivre l'état de vos envois"
            onClick={() => go("sent")}
          />
        </CardContent>
      </Card>

      {/* —— Département (si rattaché ou chef) —— */}
      {(me.department || me.isChef) && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4" />
              Mon département
            </CardTitle>
            <CardDescription>
              {me.department?.name ?? "Département"}
              {me.isChef ? " — vous en êtes le chef" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {me.colleagues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun collègue pour l&apos;instant.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {me.colleagues.map((c) => (
                  <span
                    key={c._id}
                    className="rounded-sm border border-border bg-card px-3 py-1.5 text-xs"
                  >
                    {c.name}
                    {c.fonction ? ` · ${c.fonction}` : ""}
                    {c.departmentRole === "chef" ? " · chef" : ""}
                  </span>
                ))}
              </div>
            )}
            {(me.isChef || me.isAdmin) && (
              <ActionRow
                icon={Users}
                title="Gérer le département"
                description={
                  me.isAdmin
                    ? "Créer, modifier les départements et nommer les chefs"
                    : "Voir les membres et l'organisation du département"
                }
                onClick={() => go("departments")}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* —— Administration (DG / root) —— */}
      {(me.isAdmin || me.isRoot) && (
        <Card className="border-border border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="size-4" />
              Administration
            </CardTitle>
            <CardDescription>
              Options réservées au Directeur Général
              {me.isRoot ? " et au super utilisateur" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ActionRow
              icon={UserCheck}
              title="Comptes utilisateurs"
              description="Valider, rejeter ou consulter les demandes d'accès"
              onClick={() => go("accounts")}
            />
            <ActionRow
              icon={Building2}
              title="Départements"
              description="Créer les départements et désigner les chefs"
              onClick={() => go("departments")}
            />
            {stats ? (
              <p className="pt-1 text-xs text-muted-foreground">
                Organisation : {stats.departments} département
                {stats.departments > 1 ? "s" : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* —— Super utilisateur —— */}
      {me.isRoot && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="size-4" />
              Super administration
            </CardTitle>
            <CardDescription>
              Vous êtes au-dessus du DG. Vous pouvez gérer l&apos;ensemble des
              comptes, y compris les administrateurs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ActionRow
              icon={UserCheck}
              title="Tous les comptes"
              description="Supervision globale des utilisateurs de la plateforme"
              onClick={() => go("accounts")}
            />
            <p className="text-xs text-muted-foreground">
              Les actions critiques (validation de comptes, structure des
              départements) passent par les menus Comptes et Départements.
            </p>
          </CardContent>
        </Card>
      )}

      {/* —— Aide —— */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="size-4" />
            Aide & informations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Envoyer un document :</strong>{" "}
            choisissez le fichier, le destinataire, l&apos;objet, la personne
            « de la part de », puis les tâches.
          </p>
          <p>
            <strong className="text-foreground">Statuts :</strong> Envoyé →
            Consulté → En cours → Traité. Le destinataire met à jour le statut.
          </p>
          {(me.isChef || me.isAdmin) && (
            <p>
              <strong className="text-foreground">Chefs / DG :</strong> un chef
              envoie dans son département ; le DG peut envoyer partout et
              valider les comptes.
            </p>
          )}
        </CardContent>
      </Card>

      {/* —— Compte & sécurité —— */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" />
            Compte & sécurité
          </CardTitle>
          <CardDescription>
            Email de connexion :{" "}
            <span className="font-medium text-foreground">
              {me.user.email ?? "—"}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-sm border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">Changer le mot de passe</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Un code à usage unique est envoyé par email (valable 15 min).
            </p>

            {pwdStep === "idle" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 gap-2"
                disabled={pwdBusy || !me.user.email}
                onClick={async () => {
                  if (!me.user.email) return;
                  setPwdBusy(true);
                  try {
                    await signIn("password", {
                      email: me.user.email,
                      flow: "reset",
                    });
                    setPwdStep("code-sent");
                    toast.success("Code envoyé à votre adresse email.");
                  } catch {
                    // Message neutre
                    setPwdStep("code-sent");
                    toast.message(
                      "Si un compte existe, un code a été envoyé par email.",
                    );
                  } finally {
                    setPwdBusy(false);
                  }
                }}
              >
                {pwdBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Mail className="size-3.5" />
                )}
                Recevoir un code de réinitialisation
              </Button>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="settings-code">Code reçu</Label>
                  <Input
                    id="settings-code"
                    value={pwdCode}
                    onChange={(e) => setPwdCode(e.target.value)}
                    inputMode="numeric"
                    placeholder="8 chiffres"
                    maxLength={8}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="settings-new">Nouveau mot de passe</Label>
                  <Input
                    id="settings-new"
                    type="password"
                    value={pwdNew}
                    onChange={(e) => setPwdNew(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Au moins 8 caractères"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="settings-confirm">Confirmation</Label>
                  <Input
                    id="settings-confirm"
                    type="password"
                    value={pwdConfirm}
                    onChange={(e) => setPwdConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pwdBusy}
                    onClick={async () => {
                      if (!me.user.email) return;
                      if (pwdNew.length < 8) {
                        toast.error(
                          "Le mot de passe doit contenir au moins 8 caractères.",
                        );
                        return;
                      }
                      if (pwdNew !== pwdConfirm) {
                        toast.error(
                          "Les deux mots de passe ne correspondent pas.",
                        );
                        return;
                      }
                      setPwdBusy(true);
                      try {
                        await signIn("password", {
                          email: me.user.email,
                          code: pwdCode.trim(),
                          newPassword: pwdNew,
                          flow: "reset-verification",
                        });
                        toast.success("Mot de passe mis à jour.");
                        setPwdStep("idle");
                        setPwdCode("");
                        setPwdNew("");
                        setPwdConfirm("");
                      } catch (err) {
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : "Code invalide ou expiré.",
                        );
                      } finally {
                        setPwdBusy(false);
                      }
                    }}
                  >
                    {pwdBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : null}
                    Enregistrer le nouveau mot de passe
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPwdStep("idle");
                      setPwdCode("");
                      setPwdNew("");
                      setPwdConfirm("");
                    }}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Session active · {me.user.email ?? "compte"}
            </p>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoBlock({
  icon: Icon,
  label,
  value,
  extra,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-border p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <p className="text-sm font-medium">{value}</p>
        {extra}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-border bg-card px-3 py-2 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-sm border border-border bg-card px-3 py-3 text-left hover:bg-secondary"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-brand-soft text-brand">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">
          {title}
        </span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
