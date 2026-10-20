import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

/**
 * Délai avant d'abandonner un chargement d'auth bloqué.
 * Ne doit PAS être trop court : mobile / cold start Convex peuvent dépasser 8 s.
 */
const AUTH_LOADING_TIMEOUT_MS = 45_000;
/** Si authentifié mais profil introuvable longtemps → session invalide */
const PROFILE_NULL_TIMEOUT_MS = 20_000;

/** Nettoie uniquement les clés OAuth / code temporaires (pas les JWT si session saine). */
function clearOAuthTempStorage() {
  try {
    sessionStorage.removeItem("scandoc_auth_code");
    sessionStorage.removeItem("scandoc_auth_code_lock");
    sessionStorage.removeItem("scandoc_oauth_redirect");
  } catch {
    /* ignore */
  }
}

/** Nettoyage complet des jetons Convex Auth (uniquement si session réellement corrompue). */
function clearAuthTokens() {
  clearOAuthTempStorage();
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.includes("__convexAuth") ||
        k.includes("JWT") ||
        k.includes("refreshToken") ||
        k.includes("verifier") ||
        (k.includes("convex") && k.includes("auth"))
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
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const clearingRef = useRef(false);

  // Profil : authentifié mais la query user n'a pas encore répondu
  const waitingProfile = isAuthenticated && user === undefined;
  const isLoading = isAuthLoading || waitingProfile;

  // Chargement prolongé : on arrête le spinner, MAIS on ne déconnecte
  // que si on n'est jamais passé authentifié (token bloqué / réseau).
  useEffect(() => {
    if (!isLoading) {
      setAuthTimedOut(false);
      clearingRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      setAuthTimedOut(true);
      // Uniquement si Convex Auth n'a pas confirmé la session
      if (!isAuthenticated && !clearingRef.current) {
        clearingRef.current = true;
        clearAuthTokens();
      }
    }, AUTH_LOADING_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [isLoading, isAuthenticated]);

  // Authentifié côté client mais aucun user en base après un délai → session invalide
  useEffect(() => {
    if (isAuthLoading) return;
    if (!(isAuthenticated && user === null)) return;

    const t = window.setTimeout(() => {
      if (clearingRef.current) return;
      clearingRef.current = true;
      clearAuthTokens();
      void signOut().catch(() => {
        /* ignore */
      });
    }, PROFILE_NULL_TIMEOUT_MS);

    return () => window.clearTimeout(t);
  }, [isAuthLoading, isAuthenticated, user, signOut]);

  return {
    isLoading: isLoading && !authTimedOut,
    authTimedOut: authTimedOut && isLoading && !isAuthenticated,
    isAuthenticated,
    user: user === undefined ? null : user,
    signIn,
    signOut,
  };
}
