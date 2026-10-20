import { useAuth } from "@/hooks/use-auth";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/** Déconnexion après inactivité prolongée (onglet visible). */
const TIMEOUT_MS = 45 * 60 * 1000;
const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

export function InactivityLogout() {
  const { isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const clear = () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const arm = () => {
      clear();
      // Ne pas compter l'inactivité si l'onglet est en arrière-plan
      if (document.visibilityState === "hidden") return;
      timer.current = window.setTimeout(() => {
        void (async () => {
          try {
            await signOut();
          } catch {
            /* ignore */
          }
          toast.message("Session fermée", {
            description:
              "Déconnexion après une longue période sans activité. Reconnectez-vous.",
          });
          navigate("/auth", { replace: true });
        })();
      }, TIMEOUT_MS);
    };

    arm();
    for (const ev of EVENTS) {
      window.addEventListener(ev, arm, { passive: true });
    }
    const onVis = () => {
      if (document.visibilityState === "visible") arm();
      else clear();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clear();
      for (const ev of EVENTS) {
        window.removeEventListener(ev, arm);
      }
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isAuthenticated, signOut, navigate]);

  return null;
}
