import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/**
 * Envoi d'un code OTP pour la réinitialisation du mot de passe.
 * Ordre : 1) Freebuff OTP (EMAIL_API_KEY)  2) VLY email (VLY_INTEGRATION_KEY)
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
    return generateRandomString(random, "0123456789", 8);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const appName =
      process.env.VLY_APP_NAME || "ScanDoc — réinitialisation du mot de passe";

    // 1) Freebuff OTP API
    const emailApiKey = process.env.EMAIL_API_KEY;
    if (emailApiKey) {
      const res = await fetch("https://auth.freebuff.app/send_otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": emailApiKey,
        },
        body: JSON.stringify({ to: email, otp: token, appName }),
      });
      if (res.ok) return;
      const body = await res.text().catch(() => "");
      console.error("[password-reset] Freebuff OTP échoué:", res.status, body);
    } else {
      console.warn("[password-reset] EMAIL_API_KEY absent");
    }

    // 2) Fallback VLY email
    const vlyKey = process.env.VLY_INTEGRATION_KEY;
    if (vlyKey) {
      try {
        const { createVlyIntegrations } = await import("@vly-ai/integrations");
        const vly = createVlyIntegrations({ deploymentToken: vlyKey });
        const result = await vly.email.send({
          to: email,
          subject: `[ScanDoc] Code de réinitialisation : ${token}`,
          text: [
            `Votre code de réinitialisation ScanDoc est : ${token}`,
            ``,
            `Il est valable 15 minutes.`,
            `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
          ].join("\n"),
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">
              <h2 style="color:#1e40af">Réinitialisation du mot de passe</h2>
              <p>Votre code ScanDoc :</p>
              <p style="font-size:28px;font-weight:700;letter-spacing:4px">${token}</p>
              <p style="color:#6b7280;font-size:13px">Valable 15 minutes. Ignorez ce message si vous n'êtes pas à l'origine de la demande.</p>
            </div>
          `,
        });
        if (result && (result as { success?: boolean }).success !== false) {
          return;
        }
        console.error("[password-reset] VLY email résultat:", result);
      } catch (err) {
        console.error("[password-reset] VLY email échoué:", err);
      }
    } else {
      console.warn("[password-reset] VLY_INTEGRATION_KEY absent");
    }

    // Mode secours dev / diagnostic (ne jamais activer en prod publique sans contrôle)
    if (process.env.DEBUG_OTP === "1") {
      console.warn("[password-reset] DEBUG_OTP code pour", email, "→", token);
      return;
    }

    throw new Error(
      "Envoi du code impossible : service email non configuré. Contactez l'administrateur.",
    );
  },
});
