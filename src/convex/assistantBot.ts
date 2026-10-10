"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

const SITE_HELP = `
Tu es l'assistant personnel de l'utilisateur sur ScanDoc, une application d'échange de documents entre départements.

Fonctions du site :
- Accueil : aperçu des documents reçus/envoyés
- Envoyer : transmettre un fichier avec objet, "de la part de", tâches
- Reçus / Envoyés : listes et suivi des statuts (Envoyé → Consulté → En cours → Traité)
- Départements : rejoindre un département (demande validée par le chef), inviter des collègues
- Messages : discuter avec les collègues
- Paramètres : profil, sécurité, préférences
- Comptes (DG seulement) : valider les nouveaux comptes

Règles :
- Réponds en français, phrases courtes, maximum 6 lignes.
- Aide concrètement (où cliquer, quoi faire).
- Ne révèle jamais de détails techniques (erreurs serveur, tokens).
- Si tu ne sais pas : oriente vers le DG ou le chef de département.
`;

function ruleBasedReply(question: string, botName: string, mood: string): string {
  const q = question.toLowerCase();
  const greeting =
    mood === "joyeux"
      ? `😊 ${botName} est là !`
      : mood === "motivant"
        ? `💪 Allez, on avance !`
        : mood === "blagueur"
          ? `😄 ${botName} au rapport.`
          : mood === "sérieux"
            ? `${botName} :`
            : `${botName} :`;

  if (/bonjour|salut|hello|bonsoir/.test(q)) {
    return `${greeting} Comment puis-je vous aider sur ScanDoc ?`;
  }
  if (/envoyer|envoi|nouveau document|partager/.test(q)) {
    return `${greeting}\nPour envoyer un document : menu **Envoyer** → choisissez le fichier, le destinataire, l'objet, « de la part de », les tâches → Envoyer.`;
  }
  if (/reçu|inbox|reception|reçus/.test(q)) {
    return `${greeting}\nVos documents reçus sont dans **Reçus**. Ouvrez un document pour le lire, changer le statut ou télécharger le fichier.`;
  }
  if (/département|rejoindre|adhésion|groupe/.test(q)) {
    return `${greeting}\nAllez dans **Départements**. Si vous n'êtes pas encore membre, cliquez **Rejoindre** sur un département. Le chef validera votre demande.`;
  }
  if (/mot de passe|oublié|connexion|login|compte/.test(q)) {
    return `${greeting}\nSur la page de connexion : « Mot de passe oublié ? ». Sinon, contactez le DG pour la validation de votre compte.`;
  }
  if (/message|chat|discuter|écrire/.test(q)) {
    return `${greeting}\nOuvrez **Messages** dans le menu, ou cliquez un collègue dans la liste « Collègues » pour démarrer une conversation.`;
  }
  if (/statut|traité|en cours|suivi/.test(q)) {
    return `${greeting}\nStatuts d'un document : Envoyé → Consulté → En cours → Traité. Le destinataire met à jour le statut depuis le détail du document.`;
  }
  if (/paramètre|profil|déconnecter/.test(q)) {
    return `${greeting}\nTout se trouve dans **Paramètres** : profil, mot de passe, thème, et déconnexion.`;
  }
  if (/aide|perdu|où|comment|problème|bug|erreur/.test(q)) {
    return `${greeting}\nJe peux vous guider : envoi de documents, départements, messages, statuts, compte.\nPosez une question précise, par exemple « Comment rejoindre un département ? ».`;
  }
  return `${greeting}\nJe n'ai pas tout compris. Essayez : « Comment envoyer un document ? », « Comment rejoindre un département ? » ou « Où sont mes messages ? ».`;
}

/** Réponse de l'assistant (IA si dispo, sinon règles site). */
export const ask = action({
  args: {
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const message = args.message.trim().slice(0, 1000);
    if (!message) return { reply: "Écrivez votre question." };

    const profile = await ctx.runQuery(internal.bot.getProfileInternal, {
      userId,
    });
    const name = profile?.name ?? "Aide";
    const mood = profile?.mood ?? "calme";
    const personality =
      profile?.personality ?? "Aide de façon simple et patiente.";

    let reply = ruleBasedReply(message, name, mood);

        try {
      const { groqChat } = await import("./lib/groq");
      const history = await ctx.runQuery(internal.bot.listRecentInternal, {
        userId,
        limit: 6,
      });
      const historyMsgs: Array<{
        role: "user" | "assistant" | "system";
        content: string;
      }> = history.map((h: { role: string; body: string }) => ({
        role: (h.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: h.body,
      }));
      const ai = await groqChat({
        temperature: 0.4,
        maxTokens: 280,
        messages: [
          {
            role: "system",
            content: `${SITE_HELP}

Ton nom : ${name}.
Humeur : ${mood}.
Comportement : ${personality}.`,
          },
          ...historyMsgs,
          { role: "user", content: message },
        ],
      });
      if (ai) reply = ai;
    } catch (e) {
      console.error("[assistantBot.ask] Groq:", e);
    }

    await ctx.runMutation(internal.bot.saveExchange, {
      userId,
      userBody: message,
      assistantBody: reply,
    });

    return { reply };
  },
});
