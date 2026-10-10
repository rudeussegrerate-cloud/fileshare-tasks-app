import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Petites automatisations UX : rappels discrets à la connexion.
 */
export function SmartAutomations() {
  const me = useQuery(api.workspace.me);
  const unread = useQuery(api.chat.unreadTotal);
  const pending = useQuery(
    api.departmentMembership.listPendingRequests,
    me?.isChef || me?.isAdmin ? {} : "skip",
  );
  const did = useRef(false);

  useEffect(() => {
    if (!me || me.accountStatus !== "valide" || did.current) return;
    did.current = true;

    const t = window.setTimeout(() => {
      if ((unread ?? 0) > 0) {
        toast.message("Messages non lus", {
          description: `Vous avez ${unread} message${(unread ?? 0) > 1 ? "s" : ""} en attente.`,
        });
      }
      if ((pending?.length ?? 0) > 0) {
        toast.message("Demandes d'adhésion", {
          description: `${pending!.length} demande${pending!.length > 1 ? "s" : ""} à traiter.`,
        });
      }
      if (me.isAdmin && me.pendingAccounts > 0) {
        toast.message("Comptes à valider", {
          description: `${me.pendingAccounts} nouveau${me.pendingAccounts > 1 ? "x" : ""} compte${me.pendingAccounts > 1 ? "s" : ""}.`,
        });
      }
    }, 1500);

    return () => window.clearTimeout(t);
  }, [me, unread, pending]);

  return null;
}
