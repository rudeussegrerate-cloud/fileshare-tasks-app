import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/**
 * Envoi d'un code OTP pour la réinitialisation sécurisée du mot de passe.
 * Réutilise l'API email Freebuff (même canal que l'OTP de connexion).
 */
export const passwordResetEmail = Email({
  id: "password-reset",
  maxAge: 60 * 15, // 15 minutes
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    // 8 chiffres → plus de combinaisons, rate-limit côté Convex Auth
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 8);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    try {
      await axios.post(
        "https://auth.freebuff.app/send_otp",
        {
          to: email,
          otp: token,
          appName:
            process.env.VLY_APP_NAME ||
            "ScanDoc — code de réinitialisation du mot de passe",
        },
        {
          headers: {
            "x-api-key": process.env.EMAIL_API_KEY ?? "",
          },
        },
      );
    } catch (error) {
      console.error("[password-reset] envoi email échoué:", error);
      throw new Error(
        "Impossible d'envoyer le code de réinitialisation. Réessayez plus tard.",
      );
    }
  },
});
