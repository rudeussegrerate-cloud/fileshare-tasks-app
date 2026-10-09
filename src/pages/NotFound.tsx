import { Button } from "@/components/ui/button";
import { FileQuestion, Home, RefreshCw } from "lucide-react";
import { Link } from "react-router";

type Props = {
  /** Mode erreur runtime (crash) vs page introuvable */
  kind?: "notfound" | "error";
  message?: string;
  onRetry?: () => void;
};

export default function NotFound({
  kind = "notfound",
  message,
  onRetry,
}: Props) {
  const isError = kind === "error";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="relative w-full max-w-md text-center">
        {/* Halo décoratif léger (sans blur GPU) */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-40 w-40 -translate-x-1/2 -translate-y-1/4 rounded-full bg-brand-soft"
        />

        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <FileQuestion className="size-10 text-brand" strokeWidth={1.5} />
        </div>

        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-brand">
          {isError ? "Oups" : "404"}
        </p>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {isError
            ? "Une erreur inattendue est survenue"
            : "Page introuvable"}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {isError
            ? message
              ? "Quelque chose s’est mal passé. Vous pouvez recharger la page ou revenir à l’accueil."
              : "Nous avons rencontré un problème temporaire. Rechargez la page ou retournez à l’accueil."
            : "La page que vous cherchez n’existe pas ou a été déplacée. Pas d’inquiétude, on vous ramène."}
        </p>

        

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {isError && onRetry ? (
            <Button onClick={onRetry} className="gap-2">
              <RefreshCw className="size-4" />
              Recharger
            </Button>
          ) : (
            <Button asChild className="gap-2">
              <Link to="/">
                <Home className="size-4" />
                Connexion
              </Link>
            </Button>
          )}

          {isError ? (
            <Button asChild variant="outline" className="gap-2">
              <Link to="/">
                <Home className="size-4" />
                Accueil
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="gap-2">
              <Link to="/dashboard">Tableau de bord</Link>
            </Button>
          )}
        </div>

        <p className="mt-10 text-xs text-muted-foreground/70">
          ScanDoc · Partage de documents professionnel
        </p>
      </div>
    </div>
  );
}
