import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState } from "react";

const AUTH_TIMEOUT_MS = 12_000;

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();
  const [timedOut, setTimedOut] = useState(false);

  const waitingProfile = isAuthenticated && user === undefined;
  const isLoading = isAuthLoading || waitingProfile;

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setTimedOut(true), AUTH_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [isLoading]);

  return {
    isLoading: isLoading && !timedOut,
    authTimedOut: timedOut && isLoading,
    isAuthenticated,
    user: user === undefined ? null : user,
    signIn,
    signOut,
  };
}
