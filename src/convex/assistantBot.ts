"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

const SITE_HELP = `
Tu es un assistant personnel chaleureux sur ScanDoc, mais tu peux AUSSI discuter librement pour tenir compagnie.

Priorités :
1. Si la question concerne ScanDoc (documents, départements, messages, actualités, compte) → guide clairement (menus exacts).
2. Si la question est générale, personnelle, ou pour discuter → réponds naturellement, avec empathie et un peu d'humour selon l'humeur configurée. Tu peux parler de motivation, organisation, culture générale, etc.
3. Reste respectueux. Pas de conseils médicaux/juridiques dangereux. Pas de secrets techniques (tokens, erreurs serveur).
4. Français simple, 2 à 8 lignes max. Montre de l'émotion légère (encouragement, curiosité).
5. Tu as un nom, une humeur et un comportement fournis par l'utilisateur — respecte-les.
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
    return `' + name + ' Comment puis-je vous aider sur ScanDoc ?`;
  }
  if (/envoyer|envoi|nouveau document|partager/.test(q)) {
    return `' + name + '\nPour envoyer un document : menu **Envoyer** → choisissez le fichier, le destinataire, l'objet, « de la part de », les tâches → Envoyer.`;
  }
  if (/reçu|inbox|reception|reçus/.test(q)) {
    return `' + name + '\nVos documents reçus sont dans **Reçus**. Ouvrez un document pour le lire, changer le statut ou télécharger le fichier.`;
  }
  if (/département|rejoindre|adhésion|groupe/.test(q)) {
    return `' + name + '\nAllez dans **Départements**. Si vous n'êtes pas encore membre, cliquez **Rejoindre** sur un département. Le chef validera votre demande.`;
  }
  if (/mot de passe|oublié|connexion|login|compte/.test(q)) {
    return `' + name + '\nSur la page de connexion : « Mot de passe oublié ? ». Sinon, contactez le DG pour la validation de votre compte.`;
  }
  if (/message|chat|discuter|écrire/.test(q)) {
    return `' + name + '\nOuvrez **Messages** dans le menu, ou cliquez un collègue dans la liste « Collègues » pour démarrer une conversation.`;
  }
  if (/statut|traité|en cours|suivi/.test(q)) {
    return `' + name + '\nStatuts d'un document : Envoyé → Consulté → En cours → Traité. Le destinataire met à jour le statut depuis le détail du document.`;
  }
  if (/paramètre|profil|déconnecter/.test(q)) {
    return `' + name + '\nTout se trouve dans **Paramètres** : profil, mot de passe, thème, et déconnexion.`;
  }
  if (/actualité|annonce|fil|news/.test(q)) {
    return `' + name + '\nLes annonces sont dans **Actualités** (menu). Vous pouvez publier (publique, privée ou personnalisée) et réagir avec des emoji.`;
  }
  if (/photo|image|scan|résumé|expliquer/.test(q)) {
    return `' + name + '\nQuand vous envoyez une photo ou un scan, ScanDoc tente de **décrire ou résumer** le contenu automatiquement pour le destinataire.`;
  }
  if (/aide|perdu|où|comment|problème|bug|erreur/.test(q)) {
    return `' + name + '\nJe suis là 👋 Indiquez ce que vous voulez faire : envoyer un document, lire les actualités, écrire à un collègue, rejoindre un groupe…\nExemple : « Comment envoyer un document ? »`;
  }
  // Conversation libre : répondre de façon ouverte (l'IA Groq prendra le relais si dispo)
  return "";
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
    if (!reply) {
      reply =
        name +
        " ici 😊 Je suis content de discuter avec vous. Dites-m'en plus — même si ce n'est pas lié à ScanDoc, je reste là.";
    }

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
        role: (h.role === "user" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: h.body,
      }));
      const ai = await groqChat({
        temperature: 0.55,
        maxTokens: 320,
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
