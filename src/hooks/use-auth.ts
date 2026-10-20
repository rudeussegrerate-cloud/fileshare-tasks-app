import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

/** Au-delà de ce délai, on abandonne le chargement et on nettoie la session. */
const AUTH_TIMEOUT_MS = 8_000;

/** Préfixes / clés liées à Convex Auth dans localStorage */
function clearStaleAuthStorage() {
  try {
    sessionStorage.removeItem("scandoc_auth_code");
    sessionStorage.removeItem("scandoc_auth_code_lock");
    sessionStorage.removeItem("scandoc_oauth_redirect");
  } catch {
    /* ignore */
  }
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Jetons / refresh Convex Auth (namespace = URL Convex)
      if (
        k.includes("__convexAuth") ||
        k.includes("JWT") ||
        k.includes("refresh") ||
        k.includes("verifier") ||
        k.includes("convex.cloud") ||
        k.includes("cool-cheetah")
      ) {
        keys.push(k);
      }
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();
  const [timedOut, setTimedOut] = useState(false);
  const clearingRef = useRef(false);

  // Profil : authentifié mais la query user n'a pas encore répondu
  const waitingProfile = isAuthenticated && user === undefined;
  const isLoading = isAuthLoading || waitingProfile;

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => {
      setTimedOut(true);
      // Session corrompue / token invalide → nettoyer pour débloquer le site
      if (!clearingRef.current) {
        clearingRef.current = true;
        clearStaleAuthStorage();
        void signOut().catch(() => {
          /* ignore */
        });
      }
    }, AUTH_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [isLoading, signOut]);

  // Authentifié côté client mais aucun user en base → session invalide
  useEffect(() => {
    if (isAuthLoading) return;
    if (isAuthenticated && user === null) {
      clearStaleAuthStorage();
      void signOut().catch(() => {
        /* ignore */
      });
    }
  }, [isAuthLoading, isAuthenticated, user, signOut]);

  return {
    isLoading: isLoading && !timedOut,
    authTimedOut: timedOut && isLoading,
    isAuthenticated: timedOut ? false : isAuthenticated,
    user: user === undefined ? null : user,
    signIn,
    signOut,
  };
}
