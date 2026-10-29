import React from "react";
import { AccountStatusScreen } from "@/components/app/AccountStatusScreen";
import { AccountsView } from "@/components/app/AccountsView";
import { AppShell, type AppView } from "@/components/app/AppShell";
import { DashboardHome } from "@/components/app/DashboardHome";
import { DepartmentsView } from "@/components/app/DepartmentsView";
import { DocumentDetailDialog } from "@/components/app/DocumentDetailDialog";
import { DocumentsList } from "@/components/app/DocumentsList";
import { ProfileSetup } from "@/components/app/ProfileSetup";
import { SendDocument } from "@/components/app/SendDocument";
import { InactivityLogout } from "@/components/app/InactivityLogout";
import { PresenceHeartbeat } from "@/components/app/PresenceHeartbeat";
import { SettingsView } from "@/components/app/SettingsView";
import { TrackingView } from "@/components/app/TrackingView";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { MndptLoader } from "@/components/MndptLoader";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const FloatingAssistant = lazy(() =>
  import("@/components/app/FloatingAssistant").then((m) => ({
    default: m.FloatingAssistant,
  })),
);

class ViewErrorBoundary extends React.Component<
  { children: React.ReactNode; label: string },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message || "Erreur d'affichage" };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg rounded-lg border border-border bg-card p-6 text-center">
          <p className="font-semibold">Impossible d&apos;afficher {this.props.label}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Chargement temporairement indisponible. Touchez Réessayer, ou
            revenez plus tard si le problème continue.
          </p>
          <button
            type="button"
            className="mt-4 rounded-md bg-brand px-4 py-2 text-sm text-primary-foreground"
            onClick={() => this.setState({ error: null })}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Dashboard() {
  const syncProfile = useMutation(api.workspace.syncProfile);
  const claimBootstrapRoot = useMutation(api.workspace.claimBootstrapRoot);
  const me = useQuery(api.workspace.me);
  const [view, setView] = useState<AppView>("home");
  const [openDocumentId, setOpenDocumentId] = useState<Id<"documents"> | null>(
    null,
  );
  const syncedRef = useRef(false);
  const [meTimedOut, setMeTimedOut] = useState(false);

  // Évite le spinner infini si workspace.me ne répond jamais (token périmé)
  useEffect(() => {
    if (me !== undefined) {
      setMeTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setMeTimedOut(true), 45_000);
    return () => window.clearTimeout(t);
  }, [me]);


  // On first load: promote the very first account to DG and give this account
  // its approval status (the DG is approved automatically).
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    void (async () => {
      try {
        await syncProfile({});
        // Si aucun root réel : tenter d'élever ce compte (sans erreur visible sinon)
        try {
          await claimBootstrapRoot({});
        } catch {
          /* un root existe déjà — normal */
        }
      } catch (error: unknown) {
        console.error("[syncProfile]", error);
        toast.error("Impossible de préparer votre espace de travail.");
      }
    })();
  }, [syncProfile, claimBootstrapRoot]);

  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<{ view?: AppView }>).detail;
      if (detail?.view) setView(detail.view);
    };
    const onOpenDoc = (e: Event) => {
      const detail = (e as CustomEvent<{ documentId?: string }>).detail;
      if (detail?.documentId) {
        setView("inbox");
        setOpenDocumentId(detail.documentId as Id<"documents">);
      }
    };
    window.addEventListener("scandoc:navigate", onNav);
    window.addEventListener("scandoc:open-document", onOpenDoc);
    return () => {
      window.removeEventListener("scandoc:navigate", onNav);
      window.removeEventListener("scandoc:open-document", onOpenDoc);
    };
  }, []);

  // Attendre le statut de compte (syncProfile).
  if (meTimedOut && !me) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-lg font-semibold">Chargement trop long</p>
        <p className="max-w-md text-sm text-muted-foreground">
          La session semble bloquée. Reconnectez-vous pour continuer.
        </p>
        <button
          type="button"
          className="rounded-md bg-brand px-4 py-2 text-sm text-white"
          onClick={() => {
            try {
              localStorage.clear();
              sessionStorage.clear();
            } catch { /* ignore */ }
            const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
            window.location.href = `${base}/auth`;
          }}
        >
          Revenir à la connexion
        </button>
      </main>
    );
  }

  if (!me || !me.accountStatus) {
    return (
      <main className="bg-background">
        <MndptLoader size="full" />
      </main>
    );
  }

  // Accès bloqué tant que le DG n'a pas validé (ou si le compte est rejeté).
  if (
    !me.isAdmin &&
    (me.accountStatus === "en_attente" || me.accountStatus === "rejete")
  ) {
    return (
      <AccountStatusScreen
        status={me.accountStatus}
        name={me.user.name}
        email={me.user.email}
        fonction={me.user.fonction}
      />
    );
  }

  // Comptes sans nom (Google / OTP) : compléter le profil avant un département.
  if (!me.profileCompleted) {
    return <ProfileSetup />;
  }

  return (
    <>
      <PresenceHeartbeat />
      <InactivityLogout />
      <AppShell
        view={view}
        onViewChange={(v) => setView(v)}
        onOpenDocument={(id) => setOpenDocumentId(id)}
      >
      {view === "home" ? (
        <DashboardHome
          onOpen={setOpenDocumentId}
          onSend={() => setView("send")}
          onNavigate={(next) => setView(next)}
        />
      ) : null}

      {view === "send" ? (
        <SendDocument
          key="new"
          mode="envoi"
          onSent={() => {
            setView("sent");
          }}
          onManageDepartments={() => setView("departments")}
        />
      ) : null}

{view === "inbox" ? (
        <DocumentsList
          mode="inbox"
          onOpen={setOpenDocumentId}
          onCreate={() => setView("send")}
        />
      ) : null}

      {view === "sent" ? (
        <DocumentsList
          mode="sent"
          onOpen={setOpenDocumentId}
          onCreate={() => setView("send")}
        />
      ) : null}

      {view === "tracking" ? (
        <TrackingView onOpen={(id) => setOpenDocumentId(id)} />
      ) : null}

{view === "departments" ? (
        <ViewErrorBoundary label="les départements">
          <DepartmentsView />
        </ViewErrorBoundary>
      ) : null}

      {view === "accounts" ? (
        <ViewErrorBoundary label="les comptes">
          <AccountsView />
        </ViewErrorBoundary>
      ) : null}
{view === "settings" ? (
        <ViewErrorBoundary label="les paramètres">
          <SettingsView onNavigate={setView} />
        </ViewErrorBoundary>
      ) : null}

      <Suspense fallback={null}>
        <FloatingAssistant />
      </Suspense>

      <ViewErrorBoundary label="la fiche document">
        <DocumentDetailDialog
          documentId={openDocumentId}
          onOpenChange={(open) => {
            if (!open) setOpenDocumentId(null);
          }}
        />
      </ViewErrorBoundary>
    </AppShell>
    </>
  );
}
