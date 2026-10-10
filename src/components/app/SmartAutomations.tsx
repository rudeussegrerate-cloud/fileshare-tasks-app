import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Badges navigateur + rappels discrets (messages, tâches, notifs).
 */
export function SmartAutomations() {
  const me = useQuery(api.workspace.me);
  const unread = useQuery(api.chat.unreadTotal);
  const notifCount = useQuery(api.inAppNotifications.unreadCount);
  const stats = useQuery(api.documents.stats);
  const pending = useQuery(
    api.departmentMembership.listPendingRequests,
    me?.isChef || me?.isAdmin ? {} : "skip",
  );
  const did = useRef(false);
  const prevUnread = useRef<number | null>(null);

  // Titre d'onglet style Messenger : "(3) ScanDoc"
  useEffect(() => {
    if (typeof document === "undefined") return;
    const total =
      (unread ?? 0) + (notifCount ?? 0) + (stats?.awaiting ?? 0);
    document.title =
      total > 0 ? `(${total > 99 ? "99+" : total}) ScanDoc` : "ScanDoc";
  }, [unread, notifCount, stats?.awaiting]);

  // Nouveau message pendant la session
  useEffect(() => {
    if (unread === undefined) return;
    if (prevUnread.current !== null && unread > prevUnread.current) {
      const delta = unread - prevUnread.current;
      toast.message(
        delta === 1 ? "Nouveau message" : `${delta} nouveaux messages`,
        {
          description: "Ouvrez Messages pour répondre.",
        },
      );
    }
    prevUnread.current = unread;
  }, [unread]);

  // Rappels à la connexion
  useEffect(() => {
    if (!me || me.accountStatus !== "valide" || did.current) return;
    did.current = true;

    const t = window.setTimeout(() => {
      if ((unread ?? 0) > 0) {
        toast.message("Messages non lus", {
          description: `Vous avez ${unread} message${(unread ?? 0) > 1 ? "s" : ""} en attente.`,
        });
      }
      if ((stats?.awaiting ?? 0) > 0) {
        toast.message("Documents à traiter", {
          description: `${stats!.awaiting} document${stats!.awaiting > 1 ? "s" : ""} en attente dans Reçus.`,
        });
      }
      if ((notifCount ?? 0) > 0) {
        toast.message("Notifications", {
          description: `${notifCount} notification${(notifCount ?? 0) > 1 ? "s" : ""} non lue${(notifCount ?? 0) > 1 ? "s" : ""}.`,
        });
      }
      if ((pending?.length ?? 0) > 0) {
        toast.message("Demandes d'adhésion", {
          description: `${pending!.length} demande${pending!.length > 1 ? "s" : ""} à traiter.`,
        });
      }
      if (me.isAdmin && me.pendingAccounts > 0) {
        toast.message("Comptes à valider", {
          description: `${me.pendingAccounts} compte${me.pendingAccounts > 1 ? "s" : ""}.`,
        });
      }
    }, 1200);

    return () => window.clearTimeout(t);
  }, [me, unread, pending, stats, notifCount]);

  return null;
}
