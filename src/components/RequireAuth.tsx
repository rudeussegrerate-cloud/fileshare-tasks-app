import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Lock } from "lucide-react";
import { MndptLoader } from "@/components/MndptLoader";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";

/**
 * Wraps a route that requires a signed-in user.
 *
 * Signed-out visitors used to be bounced straight to `/auth`, which left them
 * on a bare sign-in form with no idea which page they had asked for or why they
 * were moved. The block is now stated on the page they landed on, and sign-in
 * still returns them to it via `returnTo`. Pass `redirectImmediately` for a
 * route where the bounce really is the better experience.
 */
export function RequireAuth({
  children,
  title = "Connexion requise",
  description = "Cette page est réservée aux utilisateurs connectés.",
  redirectImmediately = false,
}: {
  children: ReactNode;
  /** Headline on the blocked screen. */
  title?: string;
  /** Says what the visitor gets by signing in. */
  description?: string;
  /** Skip the explanation and go straight to `/auth`. */
  redirectImmediately?: boolean;
}) {
  const { isLoading, isAuthenticated, authTimedOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Après Google OAuth, le token peut mettre un instant à être pris en compte.
  // Évite de renvoyer vers /auth trop tôt (perte de session).
  const [oauthWait, setOauthWait] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (sessionStorage.getItem("scandoc_auth_code")) return true;
    } catch {
      /* ignore */
    }
    const ref = document.referrer || "";
    const q = window.location.search || "";
    const h = window.location.hash || "";
    return (
      ref.includes("accounts.google.com") ||
      ref.includes("convex.site") ||
      q.includes("code=") ||
      h.includes("token") ||
      h.includes("access_token")
    );
  });
  useEffect(() => {
    if (!oauthWait) return;
    // Laisser jusqu'à 12s pour échanger le code contre une session
    const t = window.setTimeout(() => setOauthWait(false), 12_000);
    return () => window.clearTimeout(t);
  }, [oauthWait]);
  useEffect(() => {
    if (isAuthenticated) {
      setOauthWait(false);
      try {
        sessionStorage.removeItem("scandoc_auth_code");
      } catch {
        /* ignore */
      }
    }
  }, [isAuthenticated]);

  if (authTimedOut) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-lg font-semibold text-foreground">Connexion difficile</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Le serveur met trop de temps à répondre. Vérifiez votre réseau puis réessayez.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={() => window.location.reload()}>Réessayer</Button>
          <Button type="button" variant="outline" onClick={() => navigate("/auth", { replace: true })}>
            Page de connexion
          </Button>
        </div>
      </main>
    );
  }

  if (isLoading || (oauthWait && !isAuthenticated)) {
    return (
      <main className="bg-background">
        <MndptLoader size="full" />
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    const signInHref = `/auth?returnTo=${encodeURIComponent(returnTo)}`;

    if (redirectImmediately) {
      return <Navigate to={signInHref} replace />;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
                <Lock className="size-5 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Vous reviendrez automatiquement sur cette page après connexion.
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button className="w-full" onClick={() => navigate(signInHref)}>
              Sign in
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/")}
            >
              Back to home
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return children;
}
