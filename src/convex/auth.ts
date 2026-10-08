// Adding Google OAuth provider alongside existing password + email OTP + anonymous.

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { emailOtp } from "./auth/emailOtp";

/**
 * Classic email + password sign-up / sign-in.
 *
 * The details collected at sign-up are stored on the user document. The
 * account's approval status is deliberately NOT taken from the client: it is
 * decided server-side in `workspace.syncProfile` so nobody can sign themselves
 * up as already approved.
 */
const passwordProvider = Password({
  profile(params) {
    const email = String(params.email ?? "")
      .trim()
      .toLowerCase();
    const name = typeof params.name === "string" ? params.name.trim() : "";
    const fonction =
      typeof params.fonction === "string" ? params.fonction.trim() : "";
    const phone = typeof params.phone === "string" ? params.phone.trim() : "";

    return {
      email,
      ...(name ? { name } : {}),
      ...(fonction ? { fonction } : {}),
      ...(phone ? { phone } : {}),
    };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    passwordProvider,
    emailOtp,
    Anonymous,
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name ?? undefined,
          email: profile.email ?? undefined,
          image: profile.picture ?? undefined,
        };
      },
    }),
  ],
});
