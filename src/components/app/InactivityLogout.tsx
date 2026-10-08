import { useAuth } from "@/hooks/use-auth";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/** Déconnexion après 30 minutes sans interaction. */
const TIMEOUT_MS = 30 * 60 * 1000;
const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

export function InactivityLogout() {
  const { isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const reset = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void (async () => {
          await signOut();
          toast.message("Session expirée", {
            description: "Déconnexion après 30 minutes d'inactivité.",
          });
          navigate("/auth", { replace: true });
        })();
      }, TIMEOUT_MS);
    };

    reset();
    for (const ev of EVENTS) {
      window.addEventListener(ev, reset, { passive: true });
    }
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      for (const ev of EVENTS) {
        window.removeEventListener(ev, reset);
      }
    };
  }, [isAuthenticated, signOut, navigate]);

  return null;
}
