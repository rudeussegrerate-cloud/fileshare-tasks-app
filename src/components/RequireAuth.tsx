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

export function RequireAuth({
  children,
  title = "Connexion requise",
  description = "Cette page est réservée aux utilisateurs connectés.",
  redirectImmediately = false,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  redirectImmediately?: boolean;
}) {
  const { isLoading, isAuthenticated, authTimedOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Attente OAuth uniquement s'il y a vraiment un code en cours
  const [oauthWait, setOauthWait] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      if (sessionStorage.getItem("scandoc_auth_code")) return true;
    } catch {
      /* ignore */
    }
    const q = window.location.search || "";
    return q.includes("code=");
  });

  useEffect(() => {
    if (!oauthWait) return;
    const t = window.setTimeout(() => {
      setOauthWait(false);
      try {
        sessionStorage.removeItem("scandoc_auth_code");
        sessionStorage.removeItem("scandoc_auth_code_lock");
      } catch {
        /* ignore */
      }
    }, 20_000);
    return () => window.clearTimeout(t);
  }, [oauthWait]);

  useEffect(() => {
    if (isAuthenticated) {
      setOauthWait(false);
      try {
        sessionStorage.removeItem("scandoc_auth_code");
        sessionStorage.removeItem("scandoc_auth_code_lock");
      } catch {
        /* ignore */
      }
    }
  }, [isAuthenticated]);

  // Timeout auth → page login (évite le spinner infini)
  if (authTimedOut) {
    return <Navigate to="/auth?reason=timeout" replace />;
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
              Se connecter
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return children;
}
