import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect } from "react";

/** Envoie un heartbeat toutes les 45 s tant que l'onglet est ouvert. */
export function PresenceHeartbeat() {
  const heartbeat = useMutation(api.presence.heartbeat);

  useEffect(() => {
    let cancelled = false;
    const beat = () => {
      if (!cancelled && document.visibilityState === "visible") {
        void heartbeat().catch(() => {
          /* silencieux si non connecté */
        });
      }
    };
    beat();
    const id = window.setInterval(beat, 45_000);
    const onVis = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [heartbeat]);

  return null;
}
