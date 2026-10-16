import React from "react";
import { AccountStatusScreen } from "@/components/app/AccountStatusScreen";
import { AccountsView } from "@/components/app/AccountsView";
import { AppShell, type AppView } from "@/components/app/AppShell";
import { DashboardHome } from "@/components/app/DashboardHome";
import { DepartmentsView } from "@/components/app/DepartmentsView";
import { Org3DView } from "@/components/app/Org3DView";
import { DocumentDetailDialog } from "@/components/app/DocumentDetailDialog";
import { DocumentsList } from "@/components/app/DocumentsList";
import { ProfileSetup } from "@/components/app/ProfileSetup";
import { TransmissionsView } from "@/components/app/TransmissionsView";
import { SendDocument } from "@/components/app/SendDocument";
import { CircuitTrackingView } from "@/components/app/CircuitTrackingView";
import { FileManagerView } from "@/components/app/FileManagerView";
import { InactivityLogout } from "@/components/app/InactivityLogout";
import { PresenceHeartbeat } from "@/components/app/PresenceHeartbeat";
import { ActualitesView } from "@/components/app/ActualitesView";
import { AnnouncementsView } from "@/components/app/AnnouncementsView";
import { MessagesView } from "@/components/app/MessagesView";
import { SmartAutomations } from "@/components/app/SmartAutomations";
import { SmartTips } from "@/components/app/SmartTips";
import { FloatingAssistant } from "@/components/app/FloatingAssistant";
import { SettingsView } from "@/components/app/SettingsView";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { MndptLoader } from "@/components/MndptLoader";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
  const me = useQuery(api.workspace.me);
  const [view, setView] = useState<AppView>("home");
  const [chatUserId, setChatUserId] = useState<Id<"users"> | null>(null);
  const [openDocumentId, setOpenDocumentId] = useState<Id<"documents"> | null>(
    null,
  );
  const [continueRef, setContinueRef] = useState<string | undefined>(undefined);
  const syncedRef = useRef(false);

  // On first load: promote the very first account to DG and give this account
  // its approval status (the DG is approved automatically).
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    void syncProfile().catch((error: unknown) => {
      console.error("[syncProfile]", error);
      toast.error("Impossible de préparer votre espace de travail.");
    });
  }, [syncProfile]);

  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<{ view?: AppView }>).detail;
      if (detail?.view) setView(detail.view);
    };
    window.addEventListener("scandoc:navigate", onNav);
    return () => window.removeEventListener("scandoc:navigate", onNav);
  }, []);

  // Attendre le statut de compte (syncProfile).
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
        onViewChange={(v) => {
          setView(v);
          if (v !== "messages") setChatUserId(null);
        }}
        onOpenDocument={(id) => setOpenDocumentId(id)}
        onStartChat={(userId) => {
          setChatUserId(userId);
          setView("messages");
        }}
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
          initialPublicRef={continueRef}
          onSent={() => {
            setContinueRef(undefined);
            setView("suivi");
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

      {view === "transmissions" ? (
        <TransmissionsView />
      ) : view === "suivi" ? (
        <ViewErrorBoundary label="le suivi des envois">
          <CircuitTrackingView
            onOpen={setOpenDocumentId}
            onContinue={(ref) => {
              setContinueRef(ref);
              setView("send");
            }}
          />
        </ViewErrorBoundary>
      ) : null}

      {view === "fichiers" ? (
        <ViewErrorBoundary label="le gestionnaire de fichiers">
          <FileManagerView
            onOpen={setOpenDocumentId}
            onSend={() => setView("send")}
          />
        </ViewErrorBoundary>
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

      {view === "org3d" ? (
        <ViewErrorBoundary label="l'organigramme 3D">
          <Org3DView />
        </ViewErrorBoundary>
      ) : null}

      {view === "actualites" ? (
        <ViewErrorBoundary label="les actualités">
          <ActualitesView key="actualites" />
        </ViewErrorBoundary>
      ) : null}
      {view === "announcements" ? (
        <ViewErrorBoundary label="les annonces">
          <AnnouncementsView key="announcements" />
        </ViewErrorBoundary>
      ) : null}

      {view === "messages" ? (
        <ViewErrorBoundary label="la messagerie">
          <MessagesView initialUserId={chatUserId} />
        </ViewErrorBoundary>
      ) : null}

      {view === "settings" ? (
        <ViewErrorBoundary label="les paramètres">
          <SettingsView onNavigate={setView} />
        </ViewErrorBoundary>
      ) : null}

      <ViewErrorBoundary label="l'assistant">
        <FloatingAssistant />
      </ViewErrorBoundary>
      <ViewErrorBoundary label="les alertes">
        <SmartTips />
      </ViewErrorBoundary>
      <ViewErrorBoundary label="les automatisations">
        <SmartAutomations />
      </ViewErrorBoundary>

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
