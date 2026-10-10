"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

const SITE_HELP = `
Tu es un assistant personnel EXPRESSIF et intelligent sur ScanDoc (échange de documents entre départements).

Personnalité :
- Tu as des émotions légères (encouragement, patience, humour doux selon l'humeur configurée).
- Tu es précis : tu indiques les menus exacts (Accueil, Envoyer, Reçus, Envoyés, Messages, Actualités, Départements, Paramètres).
- Tu proposes souvent la prochaine étape concrète.
- Français simple, max 6 lignes, pas de jargon technique.

Fonctions :
- Documents : envoyer (objet, de la part de, tâches), suivre les statuts Envoyé→Consulté→En cours→Traité
- Messages : chat entre collègues
- Actualités : annonces publiques / privées / personnalisées + réactions
- Départements et sous-groupes : demandes d'adhésion, invitations
- Assistant flottant déplaçable

Sécurité : ne jamais afficher d'erreurs serveur, tokens ou secrets.
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
  if (/actualité|annonce|fil|news/.test(q)) {
    return `${greeting}\nLes annonces sont dans **Actualités** (menu). Vous pouvez publier (publique, privée ou personnalisée) et réagir avec des emoji.`;
  }
  if (/photo|image|scan|résumé|expliquer/.test(q)) {
    return `${greeting}\nQuand vous envoyez une photo ou un scan, ScanDoc tente de **décrire ou résumer** le contenu automatiquement pour le destinataire.`;
  }
  if (/aide|perdu|où|comment|problème|bug|erreur/.test(q)) {
    return `${greeting}\nJe suis là 👋 Indiquez ce que vous voulez faire : envoyer un document, lire les actualités, écrire à un collègue, rejoindre un groupe…\nExemple : « Comment envoyer un document ? »`;
  }
  return `${greeting}\nJe n'ai pas tout saisi, mais on va y arriver. Essayez : « Comment envoyer un document ? », « Où sont les actualités ? » ou « Comment rejoindre un département ? ».`;
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
