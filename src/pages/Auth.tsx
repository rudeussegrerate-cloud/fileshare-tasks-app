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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

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
                    <Label htmlFor="signin-password">Mot de passe</Label>
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
                    Votre compte sera examiné par le DG avant de pouvoir être
                    rattaché à un département.
                  </p>
                </form>
              </TabsContent>
            </Tabs>

            {error ? (
              <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
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
