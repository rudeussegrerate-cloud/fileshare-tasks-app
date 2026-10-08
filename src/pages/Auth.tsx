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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, ArrowRight, FileText, Loader2, ShieldCheck } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/exists|already|duplicate/i.test(message)) {
    return "Un compte existe déjà avec cette adresse email.";
  }
  if (/invalid|secret|credentials/i.test(message)) {
    return "Email ou mot de passe incorrect.";
  }
  if (/password/i.test(message)) {
    return "Le mot de passe doit contenir au moins 8 caractères.";
  }
  return "Une erreur est survenue. Réessayez.";
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** "main" | "forgot" (demander le code) | "reset" (code + nouveau MDP) */
  const [authView, setAuthView] = useState<"main" | "forgot" | "reset">(
    "main",
  );
  const [resetEmail, setResetEmail] = useState("");
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleForgotRequest = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setInfo(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    try {
      await signIn("password", { email, flow: "reset" });
      setResetEmail(email);
      setAuthView("reset");
      setInfo(
        "Un code à 8 chiffres a été envoyé à votre adresse email. Il expire dans 15 minutes.",
      );
    } catch (err) {
      console.error("Password reset request error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      // Erreur technique (email non configuré, réseau…) : afficher clairement
      if (
        /email|configur|impossible|send|network|fetch|api/i.test(msg)
      ) {
        setError(
          msg.includes("configur")
            ? "Le service d'envoi d'emails n'est pas configuré. Contactez l'administrateur."
            : "Impossible d'envoyer le code. Réessayez plus tard ou contactez l'administrateur.",
        );
      } else {
        // Message neutre pour ne pas indiquer si l'email existe
        setInfo(
          "Si un compte existe pour cet email, un code a été envoyé. Vérifiez aussi vos spams.",
        );
        setResetEmail(email);
        setAuthView("reset");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetConfirm = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const code = String(formData.get("code") ?? "").trim();
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");
    if (newPassword.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      setIsLoading(false);
      return;
    }
    if (newPassword !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      setIsLoading(false);
      return;
    }
    try {
      await signIn("password", {
        email: resetEmail,
        code,
        newPassword,
        flow: "reset-verification",
      });
      setInfo("Mot de passe mis à jour. Vous pouvez vous connecter.");
      setAuthView("main");
      setResetEmail("");
    } catch (err) {
      console.error("Password reset confirm error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Code invalide ou expiré. Réessayez.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      // redirectTo : page après retour OAuth (chemin relatif à SITE_URL)
      await signIn("google", { redirectTo: redirect });
    } catch (err) {
      console.error("Google sign-in error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Connexion Google impossible. Réessayez.",
      );
      setGoogleLoading(false);
    }
  };

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    try {
      await signIn("password", {
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        flow: "signIn",
      });
      navigate(redirect);
    } catch (signInError) {
      console.error("Sign in error:", signInError);
      setError(friendlyError(signInError));
      setIsLoading(false);
    }
  };

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setIsLoading(true);
    try {
      await signIn("password", {
        email: String(formData.get("email") ?? "").trim(),
        password,
        flow: "signUp",
        name: String(formData.get("name") ?? "").trim(),
        fonction: String(formData.get("fonction") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
      });
      toast.success("Compte créé", {
        description:
          "Votre demande a été transmise au DG. Vous serez notifié dès sa validation.",
      });
      navigate(redirect);
    } catch (signUpError) {
      console.error("Sign up error:", signUpError);
      setError(friendlyError(signUpError));
      setIsLoading(false);
    }
  };

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

      <div className="relative w-full max-w-md">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-white/70 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-3.5" />
          Retour à l'accueil
        </Link>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-brand text-primary-foreground shadow-sm">
                <FileText className="size-6" />
              </span>
            </div>
            <CardTitle className="text-xl">ScanDoc</CardTitle>
            <CardDescription>
              Connectez-vous ou créez votre compte pour accéder à l'espace de
              travail.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error ? (
              <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {info}
              </p>
            ) : null}

            {authView === "forgot" ? (
              <form onSubmit={handleForgotRequest} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Adresse email du compte</Label>
                  <Input
                    id="forgot-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="prenom.nom@entreprise.com"
                    disabled={isLoading}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Nous enverrons un code à usage unique (valable 15 min). Aucune
                  information n’indique si l’email existe ou non.
                </p>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Envoi…
                    </>
                  ) : (
                    "Envoyer le code"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setAuthView("main");
                    setError(null);
                    setInfo(null);
                  }}
                >
                  Retour à la connexion
                </Button>
              </form>
            ) : null}

            {authView === "reset" ? (
              <form onSubmit={handleResetConfirm} className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Code envoyé à <strong>{resetEmail}</strong>
                </p>
                <div className="space-y-2">
                  <Label htmlFor="reset-code">Code reçu par email</Label>
                  <Input
                    id="reset-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="8 chiffres"
                    disabled={isLoading}
                    required
                    minLength={6}
                    maxLength={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-new">Nouveau mot de passe</Label>
                  <Input
                    id="reset-new"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Au moins 8 caractères"
                    disabled={isLoading}
                    required
                    minLength={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-confirm">Confirmer le mot de passe</Label>
                  <Input
                    id="reset-confirm"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    disabled={isLoading}
                    required
                    minLength={8}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Mise à jour…
                    </>
                  ) : (
                    "Changer le mot de passe"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setAuthView("forgot");
                    setError(null);
                  }}
                >
                  Renvoyer un code
                </Button>
              </form>
            ) : null}

            {authView !== "main" ? null : (
              <>
            <Button
              type="button"
              variant="outline"
              className="mb-4 w-full gap-2"
              disabled={isLoading || googleLoading || authLoading}
              onClick={() => void handleGoogleSignIn()}
            >
              {googleLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              Continuer avec Google
            </Button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  ou avec email
                </span>
              </div>
            </div>

            <Tabs defaultValue="signIn">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signIn">Se connecter</TabsTrigger>
                <TabsTrigger value="signUp">Créer un compte</TabsTrigger>
              </TabsList>

              <TabsContent value="signIn" className="mt-5">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Adresse email</Label>
                    <Input
                      id="signin-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="prenom.nom@entreprise.com"
                      disabled={isLoading}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="signin-password">Mot de passe</Label>
                      <button
                        type="button"
                        className="text-xs font-medium text-brand hover:underline"
                        onClick={() => {
                          setAuthView("forgot");
                          setError(null);
                          setInfo(null);
                        }}
                      >
                        Mot de passe oublié ?
                      </button>
                    </div>
                    <Input
                      id="signin-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      disabled={isLoading}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Connexion…
                      </>
                    ) : (
                      <>
                        Se connecter
                        <ArrowRight className="ml-2 size-4" />
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signUp" className="mt-5">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nom complet</Label>
                    <Input
                      id="signup-name"
                      name="name"
                      placeholder="Ex : Awa Diop"
                      disabled={isLoading}
                      required
                      minLength={3}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="signup-fonction">Fonction</Label>
                      <Input
                        id="signup-fonction"
                        name="fonction"
                        placeholder="Ex : Comptable"
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-phone">Téléphone</Label>
                      <Input
                        id="signup-phone"
                        name="phone"
                        placeholder="Ex : +228 90 00 00 00"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Adresse email</Label>
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="prenom.nom@entreprise.com"
                      disabled={isLoading}
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Mot de passe</Label>
                      <Input
                        id="signup-password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="8 caractères minimum"
                        disabled={isLoading}
                        required
                        minLength={8}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-confirmation">Confirmation</Label>
                      <Input
                        id="signup-confirmation"
                        name="confirmation"
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        disabled={isLoading}
                        required
                        minLength={8}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Création…
                      </>
                    ) : (
                      <>
                        Créer mon compte
                        <ArrowRight className="ml-2 size-4" />
                      </>
                    )}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Après inscription, le DG doit valider votre compte avant
                    l'accès à l'espace de travail.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
              </>
            )}
          </CardContent>

          <div className="flex items-center justify-center gap-1.5 rounded-b-lg border-t bg-muted px-6 py-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Accès réservé au personnel de l'entreprise
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
