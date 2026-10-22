import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { useAuth } from "@/hooks/use-auth";
import loginBackdrop from "@/assets/login-backdrop.jpg";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/Logo";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function extractAuthDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  let message = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") message = parsed;
    else if (parsed && typeof parsed === "object") {
      message = String(
        (parsed as { message?: string; code?: string }).message ||
          (parsed as { code?: string }).code ||
          raw,
      );
    }
  } catch {
    /* pas du JSON */
  }
  const lines = message
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const uncaught = lines.find((l) => /Uncaught Error:/i.test(l));
  if (uncaught) {
    return uncaught.replace(/^.*Uncaught Error:\s*/i, "").trim();
  }
  const useful = [...lines]
    .reverse()
    .find(
      (l) =>
        !l.startsWith("[CONVEX") &&
        !/^Called by/i.test(l) &&
        !/^Server Error$/i.test(l) &&
        l.length > 3,
    );
  return useful || message;
}

function friendlyError(
  error: unknown,
  context: "signIn" | "signUp" | "reset" | "google" | "generic" = "generic",
) {
  const message = extractAuthDetail(error);

  // Ne jamais afficher le message technique brut
  if (
    /exists|already|duplicate|taken|Account already|email.*used|already registered/i.test(
      message,
    )
  ) {
    return "Un compte existe déjà avec cette adresse email. Connectez-vous ou utilisez « Mot de passe oublié ».";
  }
  if (
    /invalid.?secret|invalid.?account|invalid.?password|credentials|incorrect|wrong password|mismatch|unauthorized|failed to authenticate|could not verify|not found|no account/i.test(
      message,
    )
  ) {
    if (context === "signUp") {
      return "Impossible de créer le compte. L'email est peut-être déjà utilisé, ou le mot de passe est refusé.";
    }
    if (context === "reset") {
      return "Code invalide ou expiré, ou compte introuvable.";
    }
    return "Email ou mot de passe incorrect.";
  }
  if (/password.*(short|least|length|weak|\b8\b)/i.test(message)) {
    return "Le mot de passe doit contenir au moins 8 caractères.";
  }
  if (/majuscule|minuscule|chiffre|uppercase|lowercase|digit|number/i.test(message)) {
    return "Le mot de passe doit contenir une majuscule, une minuscule et un chiffre.";
  }
  if (/network|fetch|timeout|Failed to fetch|Load failed/i.test(message)) {
    return "Problème de connexion. Vérifiez votre réseau et réessayez.";
  }
  if (/rate|too many|limit/i.test(message)) {
    return "Trop de tentatives. Attendez un moment puis réessayez.";
  }
  if (/code|otp|expired|verification/i.test(message)) {
    return "Code invalide ou expiré. Demandez un nouveau code.";
  }
  if (/configur|email.*(send|service)|OTP|impossible d.envoyer/i.test(message)) {
    return "L'envoi d'email n'est pas disponible. Contactez l'administrateur.";
  }

  // Par défaut selon le contexte (évite le message trop vague à la connexion)
  if (context === "signIn") {
    return "Email ou mot de passe incorrect.";
  }
  if (context === "signUp") {
    return "Inscription impossible. Réessayez ou contactez l'administrateur.";
  }
  if (context === "reset") {
    return "Réinitialisation impossible. Vérifiez le code ou demandez-en un nouveau.";
  }
  if (context === "google") {
    if (/redirect|uri|mismatch|invalid.?client|unauthorized.?client|client.?id|client.?secret/i.test(message)) {
      return "Configuration Google incomplète : vérifiez AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET dans Convex et l'URI de redirection dans Google Cloud (…/api/auth/callback/google).";
    }
    if (/exists|already|linking|Account/i.test(message)) {
      return "Ce compte Google est déjà lié ou l'email existe. Essayez la connexion email.";
    }
    if (/500|Internal|Server Error|Failed to fetch|NetworkError|fetch/i.test(message)) {
      return "Le serveur d'authentification Google a échoué (souvent des clés manquantes sur Convex). Réessayez ou utilisez email / mot de passe.";
    }
    // Afficher un extrait utile si le serveur a renvoyé un détail
    const short = message.replace(/\s+/g, " ").trim().slice(0, 160);
    if (short && short.length > 8 && !/^error$/i.test(short)) {
      return `Connexion Google impossible : ${short}`;
    }
    return "Connexion Google impossible. Réessayez ou utilisez l'email / mot de passe.";
  }
  return "Une erreur est survenue. Vérifiez vos informations et réessayez.";
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** "main" | "forgot" (demander le code) | "reset" (code + nouveau MDP) */
  const [authView, setAuthView] = useState<"main" | "forgot" | "reset">(
    "main",
  );
  const [resetEmail, setResetEmail] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [cguAccepted, setCguAccepted] = useState(false);
  const [pwdDraft, setPwdDraft] = useState("");
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showSignUpConfirm, setShowSignUpConfirm] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Message si redirection après timeout de session
  useEffect(() => {
    try {
      const reason = new URLSearchParams(window.location.search).get("reason");
      if (reason === "timeout") {
        setError(
          "La session précédente était bloquée et a été réinitialisée. Connectez-vous à nouveau.",
        );
      }
    } catch {
      /* ignore */
    }
  }, []);
  const [requestedDepartmentId, setRequestedDepartmentId] = useState<string>("");
  const departments = useQuery(api.departmentMembership.listDepartmentsPublic);
  const requestJoin = useMutation(api.departmentMembership.requestJoin);

  // Afficher les erreurs renvoyées par Google (?error=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const oauthErr = params.get("error");
      const desc = params.get("error_description");
      if (oauthErr) {
        setError(
          oauthErr === "access_denied"
            ? "Connexion Google refusée. Si l'app est en mode test, ajoutez votre email comme utilisateur de test dans Google Cloud."
            : `Google : ${desc || oauthErr}`,
        );
        params.delete("error");
        params.delete("error_description");
        const url = new URL(window.location.href);
        url.search = params.toString();
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      let dest = redirect;
      try {
        const saved = sessionStorage.getItem("scandoc_oauth_redirect");
        if (saved) {
          dest = saved;
          sessionStorage.removeItem("scandoc_oauth_redirect");
        }
      } catch {
        /* ignore */
      }
      navigate(dest);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  // Finaliser OAuth Google : échanger ?code= contre une session
  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    let code: string | null = null;
    try {
      code = sessionStorage.getItem("scandoc_auth_code");
    } catch {
      /* ignore */
    }
    if (!code) {
      try {
        code = new URLSearchParams(window.location.search).get("code");
      } catch {
        /* ignore */
      }
    }
    if (!code) return;

    // Éviter double échange (StrictMode / ConvexAuthProvider)
    const lockKey = "scandoc_auth_code_lock";
    try {
      if (sessionStorage.getItem(lockKey) === code) return;
      sessionStorage.setItem(lockKey, code);
    } catch {
      /* ignore */
    }

    let cancelled = false;
    (async () => {
      setGoogleLoading(true);
      setError(null);
      setInfo("Finalisation de la connexion Google…");
      try {
        const result = await signIn(undefined as unknown as string, { code });
        // tokens null → pas d'exception, mais session absente
        if (!result || result.signingIn === false) {
          throw new Error(
            "Le serveur a refusé le code Google (verifier invalide, code expiré ou secret OAuth incorrect).",
          );
        }
        try {
          sessionStorage.removeItem("scandoc_auth_code");
          sessionStorage.removeItem(lockKey);
        } catch {
          /* ignore */
        }
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has("code")) {
            url.searchParams.delete("code");
            window.history.replaceState({}, "", url.pathname + url.search + url.hash);
          }
        } catch {
          /* ignore */
        }
        setInfo(null);
      } catch (err) {
        console.error("OAuth code exchange failed:", err);
        if (!cancelled) {
          setInfo(null);
          setError(
            friendlyError(err, "google") +
              " Vérifiez AUTH_GOOGLE_SECRET et SITE_URL dans Convex, puis réessayez en navigation privée.",
          );
          try {
            sessionStorage.removeItem("scandoc_auth_code");
            sessionStorage.removeItem(lockKey);
          } catch {
            /* ignore */
          }
        }
      } finally {
        if (!cancelled) setGoogleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, signIn]);

  const handleForgotRequest = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setInfo(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    try {
      await signIn("password", { email, flow: "reset" });
      setResetEmail(email);
      setAuthView("reset");
      setInfo(
        "Un code à 8 chiffres a été envoyé à votre adresse email. Il expire dans 15 minutes.",
      );
    } catch (err) {
      console.error("Password reset request error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /configur|impossible|EMAIL|service email|non configur|Envoi du code|OTP|send_otp/i.test(
          msg,
        )
      ) {
        setError(
          "L'envoi d'email n'est pas configuré sur le serveur. Contactez l'administrateur pour réinitialiser votre mot de passe.",
        );
      } else if (/network|fetch|timeout/i.test(msg)) {
        setError("Problème de réseau. Vérifiez votre connexion et réessayez.");
      } else {
        // Ne pas révéler si l'email existe
        setInfo(
          "Si un compte existe et que l'email est configuré, un code a été envoyé (vérifiez les spams, valable 15 min). Sinon, contactez l'administrateur.",
        );
        setResetEmail(email);
        setAuthView("reset");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetConfirm = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const code = String(formData.get("code") ?? "").trim();
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");
    if (newPassword.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      setIsLoading(false);
      return;
    }
    if (newPassword !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      setIsLoading(false);
      return;
    }
    try {
      await signIn("password", {
        email: resetEmail.trim().toLowerCase(),
        code,
        newPassword,
        flow: "reset-verification",
      });
      toast.success("Mot de passe mis à jour", {
        description: "Vous êtes connecté avec votre nouveau mot de passe.",
      });
      // Si la session est ouverte, le useEffect redirige vers le tableau de bord
      setInfo("Mot de passe mis à jour.");
      setAuthView("main");
      setResetEmail("");
      navigate(redirect);
    } catch (err) {
      console.error("Password reset confirm error:", err);
      setError(friendlyError(err, "reset"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      /**
       * Toujours revenir sur /auth avec ?code=...
       * La page Auth finalise la session puis envoie vers /dashboard
       * (ou l'écran « en attente de validation »).
       * SITE_URL Convex = https://rudeussegrerate-cloud.github.io/fileshare-tasks-app
       */
      let dest = redirect.startsWith("/") ? redirect : `/${redirect}`;
      if (!dest || dest === "/") dest = "/dashboard";
      try {
        sessionStorage.setItem("scandoc_oauth_redirect", dest);
      } catch {
        /* ignore */
      }
      await signIn("google", { redirectTo: "/auth" });
    } catch (err) {
      console.error("Google sign-in error:", err);
      setError(friendlyError(err, "google"));
      setGoogleLoading(false);
    }
  };

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    try {
      await signIn("password", {
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        flow: "signIn",
      });
      navigate(redirect);
    } catch (signInError) {
      console.error("Sign in error:", signInError);
      setError(friendlyError(signInError, "signIn"));
      setIsLoading(false);
    }
  };

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(
        "Le mot de passe doit contenir une majuscule, une minuscule et un chiffre.",
      );
      return;
    }
    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (!cguAccepted) {
      setError("Vous devez accepter les conditions d'utilisation pour créer un compte.");
      return;
    }

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const name = String(formData.get("name") ?? "").trim();
    const fonction = String(formData.get("fonction") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    if (!name) {
      setError("Indiquez votre nom complet.");
      return;
    }
    if (!email || !email.includes("@")) {
      setError("Indiquez une adresse email valide.");
      return;
    }

    setIsLoading(true);
    try {
      await signIn("password", {
        email,
        password,
        flow: "signUp",
        name,
        ...(fonction ? { fonction } : {}),
        ...(phone ? { phone } : {}),
      });
      if (requestedDepartmentId) {
        try {
          await requestJoin({
            departmentId: requestedDepartmentId as Id<"departments">,
          });
        } catch (joinErr) {
          console.warn("Demande département:", joinErr);
        }
      }
      toast.success("Compte créé", {
        description: requestedDepartmentId
          ? "Compte créé. Après validation par le DG, vous serez rattaché automatiquement à la direction choisie (sans service)."
          : "Votre demande a été transmise au DG. Vous serez notifié dès sa validation.",
      });
      navigate(redirect);
    } catch (signUpError) {
      console.error("Sign up error:", signUpError);
      const detail = extractAuthDetail(signUpError);
      // Si le compte existe déjà : proposer la connexion
      if (/exists|already|duplicate|taken/i.test(detail)) {
        setError(
          "Un compte existe déjà avec cet email. Utilisez « Se connecter » ou « Mot de passe oublié ».",
        );
      } else {
        setError(friendlyError(signUpError, "signUp"));
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#1b1440] text-white">
      <img
        src={loginBackdrop}
        alt=""
        className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-[#0a0828]/70 via-[#0a0828]/45 to-[#0a0828]/55"
        aria-hidden
      />

      <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-12 lg:grid-cols-[1.1fr_minmax(0,440px)] lg:gap-16 lg:px-10">
        <div className="hidden lg:block">
          <BrandLogo className="[&_span]:text-white [&_.text-muted-foreground]:text-white/75" />
          <p className="mt-12 text-[15px] font-medium uppercase tracking-[0.06em] text-white/85">
            MNDPT · Échange de documents
          </p>
          <p className="mt-3 max-w-[16ch] text-[clamp(2rem,4.5vw,3.75rem)] font-semibold leading-[1.05] tracking-tight text-white drop-shadow-lg">
            Votre espace de travail documentaire, en un seul endroit.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {["Courriers", "Circuits", "Structures", "Suivi"].map((chip) => (
              <li
                key={chip}
                className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm"
              >
                {chip}
              </li>
            ))}
          </ul>
        </div>

        <section
          className="w-full rounded-[28px] border border-white/40 bg-[#1e1750]/92 p-6 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.55)] backdrop-blur-sm sm:p-9"
          aria-labelledby="scandoc-auth-title"
        >
          <div className="mb-6 lg:hidden">
            <BrandLogo className="[&_span]:text-white [&_.text-muted-foreground]:text-white/75" />
          </div>
          <h1
            id="scandoc-auth-title"
            className="text-[1.85rem] font-bold tracking-tight text-white drop-shadow-sm"
          >
            Connexion
          </h1>
          <p className="mb-6 text-sm font-medium text-white/95">
            Accédez à ScanDoc avec votre compte professionnel MNDPT.
          </p>
          <div className="auth-glass-form">

            {error ? (
              <p className="mb-3 rounded-md border border-red-300/40 bg-red-500/25 px-3 py-2 text-sm text-red-50">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="mb-3 rounded-md border border-emerald-300/40 bg-emerald-500/25 px-3 py-2 text-sm text-emerald-50">
                {info}
              </p>
            ) : null}

            {authView === "forgot" ? (
              <form onSubmit={handleForgotRequest} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Adresse email du compte</Label>
                  <Input
                    id="forgot-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    disabled={isLoading}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Nous enverrons un code à usage unique (valable 15 min). Aucune
                  information n’indique si l’email existe ou non.
                </p>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Envoi…
                    </>
                  ) : (
                    "Envoyer le code"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setAuthView("main");
                    setError(null);
                    setInfo(null);
                  }}
                >
                  Retour à la connexion
                </Button>
              </form>
            ) : null}

            {authView === "reset" ? (
              <form onSubmit={handleResetConfirm} className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Code envoyé à <strong>{resetEmail}</strong>
                </p>
                <div className="space-y-2">
                  <Label htmlFor="reset-code">Code reçu par email</Label>
                  <Input
                    id="reset-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    disabled={isLoading}
                    required
                    minLength={6}
                    maxLength={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-new">Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="reset-new"
                      name="newPassword"
                      type={showResetPassword ? "text" : "password"}
                      autoComplete="new-password"
                      disabled={isLoading}
                      required
                      minLength={8}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                      aria-label={
                        showResetPassword
                          ? "Masquer le mot de passe"
                          : "Afficher le mot de passe"
                      }
                      onClick={() => setShowResetPassword((v) => !v)}
                      tabIndex={-1}
                    >
                      {showResetPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-confirm">Confirmer le mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="reset-confirm"
                      name="confirmPassword"
                      type={showResetConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      disabled={isLoading}
                      required
                      minLength={8}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                      aria-label={
                        showResetConfirm
                          ? "Masquer le mot de passe"
                          : "Afficher le mot de passe"
                      }
                      onClick={() => setShowResetConfirm((v) => !v)}
                      tabIndex={-1}
                    >
                      {showResetConfirm ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Mise à jour…
                    </>
                  ) : (
                    "Changer le mot de passe"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setAuthView("forgot");
                    setError(null);
                  }}
                >
                  Renvoyer un code
                </Button>
              </form>
            ) : null}

            {authView !== "main" ? null : (
              <>
            <Button
              type="button"
              variant="outline"
              className="mb-4 w-full gap-2"
              disabled={isLoading || googleLoading || authLoading}
              onClick={() => void handleGoogleSignIn()}
            >
              {googleLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              Continuer avec Google
            </Button>

            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/35" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wide">
                <span className="bg-[#1e1750] px-3 font-semibold text-white/90">
                  ou avec email
                </span>
              </div>
            </div>

            <Tabs defaultValue="signIn">
              <TabsList className="auth-tabs grid h-12 w-full grid-cols-2 gap-1 rounded-full border border-white/25 bg-white/10 p-1">
                <TabsTrigger
                  value="signIn"
                  className="rounded-full text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#1a1238] data-[state=inactive]:text-white/90"
                >
                  Se connecter
                </TabsTrigger>
                <TabsTrigger
                  value="signUp"
                  className="rounded-full text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-[#1a1238] data-[state=inactive]:text-white/90"
                >
                  Créer un compte
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signIn" className="mt-5">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Adresse email</Label>
                    <Input
                      id="signin-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      disabled={isLoading}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Mot de passe</Label>
                    <div className="relative">
                      <Input
                        id="signin-password"
                        name="password"
                        type={showSignInPassword ? "text" : "password"}
                        autoComplete="current-password"
                        disabled={isLoading}
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                        aria-label={
                          showSignInPassword
                            ? "Masquer le mot de passe"
                            : "Afficher le mot de passe"
                        }
                        onClick={() => setShowSignInPassword((v) => !v)}
                        tabIndex={-1}
                      >
                        {showSignInPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="mt-1 text-sm font-bold text-white underline underline-offset-4 hover:text-white/90"
                      onClick={() => {
                        setAuthView("forgot");
                        setError(null);
                        setInfo(null);
                      }}
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Connexion…
                      </>
                    ) : (
                      <>
                        S&apos;authentifier
                        <ArrowRight className="ml-2 size-4" />
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signUp" className="mt-5">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nom complet</Label>
                    <Input
                      id="signup-name"
                      name="name"
                      disabled={isLoading}
                      required
                      minLength={3}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="signup-fonction">Fonction</Label>
                      <Input
                        id="signup-fonction"
                        name="fonction"
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-phone">WhatsApp</Label>
                      <Input
                        id="signup-phone"
                        name="phone"
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-department">Direction souhaitée</Label>
                      <select
                        id="signup-department"
                        className="auth-dept-select flex h-12 w-full rounded-xl border-2 border-white/55 bg-white px-3 py-2 text-sm font-semibold text-[#1a1238] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        value={requestedDepartmentId}
                        onChange={(e) => setRequestedDepartmentId(e.target.value)}
                        disabled={isLoading}
                      >
                        <option value="" className="bg-white text-[#1a1238]">
                          — Choisir une direction (optionnel) —
                        </option>
                        {(departments ?? []).map((d) => (
                          <option
                            key={d._id}
                            value={d._id}
                            className="bg-white text-[#1a1238]"
                          >
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-muted-foreground">
                        Demande d&apos;intégration à la direction (pas un service).
                        Le chef de direction acceptera ou refusera.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Adresse email</Label>
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      disabled={isLoading}
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Mot de passe</Label>
                      <div className="relative">
                        <Input
                          id="signup-password"
                          name="password"
                          type={showSignUpPassword ? "text" : "password"}
                          autoComplete="new-password"
                          disabled={isLoading}
                          required
                          minLength={8}
                          value={pwdDraft}
                          onChange={(e) => setPwdDraft(e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                          aria-label={
                            showSignUpPassword
                              ? "Masquer le mot de passe"
                              : "Afficher le mot de passe"
                          }
                          onClick={() => setShowSignUpPassword((v) => !v)}
                          tabIndex={-1}
                        >
                          {showSignUpPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
                      <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
                        {[
                          { ok: pwdDraft.length >= 8, label: "Au moins 8 caractères" },
                          { ok: /[a-z]/.test(pwdDraft), label: "Une lettre minuscule" },
                          { ok: /[A-Z]/.test(pwdDraft), label: "Une lettre majuscule" },
                          { ok: /[0-9]/.test(pwdDraft), label: "Un chiffre" },
                        ].map((r) => (
                          <li
                            key={r.label}
                            className={
                              r.ok
                                ? "flex items-center gap-1.5 font-medium text-emerald-300"
                                : "flex items-center gap-1.5 text-white/70"
                            }
                          >
                            <span aria-hidden>{r.ok ? "✓" : "○"}</span>
                            {r.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-confirmation">Confirmation</Label>
                      <div className="relative">
                        <Input
                          id="signup-confirmation"
                          name="confirmation"
                          type={showSignUpConfirm ? "text" : "password"}
                          autoComplete="new-password"
                          disabled={isLoading}
                          required
                          minLength={8}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                          aria-label={
                            showSignUpConfirm
                              ? "Masquer le mot de passe"
                              : "Afficher le mot de passe"
                          }
                          onClick={() => setShowSignUpConfirm((v) => !v)}
                          tabIndex={-1}
                        >
                          {showSignUpConfirm ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0"
                      checked={cguAccepted}
                      onChange={(e) => setCguAccepted(e.target.checked)}
                    />
                    <span>
                      J&apos;accepte les{" "}
                      <a href="#cgu" className="font-medium text-foreground underline">
                        conditions d&apos;utilisation
                      </a>{" "}
                      et la politique de confidentialité de ScanDoc (données
                      professionnelles, usage interne uniquement).
                    </span>
                  </label>
                  <Button type="submit" className="w-full" disabled={isLoading || !cguAccepted}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Création…
                      </>
                    ) : (
                      <>
                        Créer un compte
                        <ArrowRight className="ml-2 size-4" />
                      </>
                    )}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Après inscription, le DG doit valider votre compte avant
                    l&apos;accès à l&apos;espace de travail.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
              </>
            )}
          
          </div>
        </section>
      </main>
    </div>
  );

}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
