// Auth providers: password (+ reset), email OTP, anonymous, Google OAuth.

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { emailOtp } from "./auth/emailOtp";
import { passwordResetEmail } from "./auth/passwordReset";

/**
 * Classic email + password sign-up / sign-in, with secure password reset via OTP.
 */
const passwordProvider = Password({
  reset: passwordResetEmail,
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
  validatePasswordRequirements(password: string) {
    if (password.length < 8) {
      throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
    }
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
