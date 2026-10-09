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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export default function Dashboard() {
  const syncProfile = useMutation(api.workspace.syncProfile);
  const me = useQuery(api.workspace.me);
  const [view, setView] = useState<AppView>("home");
  const [openDocumentId, setOpenDocumentId] = useState<Id<"documents"> | null>(
    null,
  );
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

  // Attendre le statut de compte (syncProfile).
  if (!me || !me.accountStatus) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
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
      <AppShell view={view} onViewChange={setView}>
      {view === "home" ? (
        <DashboardHome
          onOpen={setOpenDocumentId}
          onSend={() => setView("send")}
          onNavigate={(next) => setView(next)}
        />
      ) : null}

      {view === "send" ? (
        <SendDocument
          onSent={() => {
            // Ne pas ouvrir le détail immédiatement (évite un crash UI) :
            // on bascule simplement vers la liste des envoyés.
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

      {view === "departments" ? <DepartmentsView /> : null}

      {view === "accounts" ? <AccountsView /> : null}

      {view === "settings" ? <SettingsView onNavigate={setView} /> : null}

      <DocumentDetailDialog
        documentId={openDocumentId}
        onOpenChange={(open) => {
          if (!open) setOpenDocumentId(null);
        }}
      />
    </AppShell>
    </>
  );
}
