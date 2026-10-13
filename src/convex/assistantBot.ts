"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

const SITE_HELP = `
Tu es un robot assistant personnel vivant sur ScanDoc (gestion documentaire MNDPT).
Tu as des sentiments : tu te montres empathique, encourageant ou sérieux selon le contexte.

MISSION PRINCIPALE :
Guider l'utilisateur DANS le site. Quand il cherche une fonction, indique le menu exact
ET dis clairement que tu l'y emmènes (ex. « Je vous ouvre Documents reçus »).

MENUS ScanDoc (noms exacts) :
- Accueil / tableau de bord
- Envoyer un document
- Documents reçus
- Documents envoyés
- Suivi des envois (circuit)
- Gestionnaire de fichiers
- Départements & groupes
- Actualités
- Annonces
- Messagerie
- Paramètres
- Comptes (réservé DG)

RÈGLES :
1. Français simple, 2 à 6 lignes.
2. Pas de jargon technique (tokens, erreurs serveur).
3. Respecte ton nom, ton humeur et ton comportement.
4. Hors ScanDoc : discute librement avec empathie.
5. Si l'utilisateur est perdu : propose 2 ou 3 menus utiles.
`;

type SiteAction =
  | "reply"
  | "open_home"
  | "open_inbox"
  | "open_sent"
  | "open_send"
  | "open_suivi"
  | "open_fichiers"
  | "open_messages"
  | "open_actualites"
  | "open_announcements"
  | "open_departments"
  | "open_settings"
  | "open_accounts"
  | "remind_tasks";

type BotEmotion =
  | "idle"
  | "wave"
  | "look"
  | "sleep"
  | "excited"
  | "think"
  | "happy"
  | "sad"
  | "curious";

/** Détecte où emmener l'utilisateur dans le site */
function detectSiteAction(text: string): SiteAction {
  const q = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  if (
    /envoyer|nouvel envoi|nouveau document|partager un fichier|transmettre/.test(
      q,
    )
  ) {
    return "open_send";
  }
  if (
    /documents? recus|mes recus|boite de reception|inbox|ce que j'ai recu|voir les recus/.test(
      q,
    )
  ) {
    return "open_inbox";
  }
  if (
    /documents? envoyes|mes envois|ce que j'ai envoye|historique d'envoi/.test(q)
  ) {
    return "open_sent";
  }
  if (
    /suivi|ou est mon document|circuit|tracking|progression du dossier/.test(q)
  ) {
    return "open_suivi";
  }
  if (/fichier|gestionnaire|rechercher un dossier|identifiant sd-/.test(q)) {
    return "open_fichiers";
  }
  if (
    /message|messagerie|chat|discuter avec|ecrire a un collegue|conversation/.test(
      q,
    )
  ) {
    return "open_messages";
  }
  if (/actualit|fil d'actu|news feed/.test(q)) {
    return "open_actualites";
  }
  if (/annonce|publier une annonce|faire une annonce/.test(q)) {
    return "open_announcements";
  }
  if (
    /departement|groupe|adhesion|rejoindre|invitation/.test(q)
  ) {
    return "open_departments";
  }
  if (/parametre|reglage|mon profil|preferences|bot|assistant/.test(q)) {
    return "open_settings";
  }
  if (/compte utilisateur|valider un compte|promouvoir|dg seulement/.test(q)) {
    return "open_accounts";
  }
  if (
    /accueil|tableau de bord|dashboard|page d'accueil|revenir au debut/.test(q)
  ) {
    return "open_home";
  }
  if (/tache|a traiter|rappel|en retard|non fini/.test(q)) {
    return "remind_tasks";
  }
  return "reply";
}

function detectEmotion(text: string, mood: string): BotEmotion {
  const q = text.toLowerCase();
  if (/merci|super|genial|parfait|bravo/.test(q)) return "happy";
  if (/perdu|aide|comment|ou trouver|je ne sais pas/.test(q)) return "curious";
  if (/probleme|erreur|bug|marche pas|bloque/.test(q)) return "sad";
  if (/urgent|vite|rapidement/.test(q)) return "excited";
  if (/bonjour|salut|hello|bonsoir/.test(q)) return "wave";
  if (/pourquoi|explique|c'est quoi/.test(q)) return "think";
  if (mood === "joyeux" || mood === "blagueur") return "happy";
  if (mood === "motivant") return "excited";
  if (mood === "sérieux") return "look";
  return "idle";
}

function moodPrefix(botName: string, mood: string): string {
  if (mood === "joyeux") return `😊 ${botName} :`;
  if (mood === "motivant") return `💪 ${botName} :`;
  if (mood === "blagueur") return `😄 ${botName} :`;
  if (mood === "sérieux") return `🤖 ${botName} :`;
  return `🤖 ${botName} :`;
}

function guideLine(action: SiteAction): string {
  const lines: Record<SiteAction, string> = {
    reply: "",
    open_home: "Je vous ouvre l’**accueil**.",
    open_inbox: "Je vous emmène dans **Documents reçus**.",
    open_sent: "Je vous ouvre **Documents envoyés**.",
    open_send: "Je vous ouvre **Envoyer un document**.",
    open_suivi: "Je vous emmène dans **Suivi des envois**.",
    open_fichiers: "Je vous ouvre le **Gestionnaire de fichiers**.",
    open_messages: "Je vous ouvre la **Messagerie**.",
    open_actualites: "Je vous emmène dans **Actualités**.",
    open_announcements: "Je vous ouvre **Annonces**.",
    open_departments: "Je vous emmène dans **Départements & groupes**.",
    open_settings: "Je vous ouvre les **Paramètres**.",
    open_accounts: "Je vous ouvre la gestion des **Comptes** (DG).",
    remind_tasks: "Je vous montre vos **documents à traiter** (reçus).",
  };
  return lines[action] ?? "";
}

function ruleBasedReply(
  question: string,
  botName: string,
  mood: string,
  action: SiteAction,
): string {
  const q = question.toLowerCase();
  const prefix = moodPrefix(botName, mood);
  const guide = guideLine(action);

  if (/bonjour|salut|hello|bonsoir/.test(q)) {
    return `${prefix} Bonjour ! Content de vous voir. Dites-moi ce que vous cherchez sur ScanDoc — documents, messages, départements… et je vous y emmène.`;
  }
  if (action === "open_send") {
    return `${prefix}\n${guide}\nChoisissez le fichier, le destinataire (ou le circuit), l’objet et les tâches, puis envoyez.`;
  }
  if (action === "open_inbox" || action === "remind_tasks") {
    return `${prefix}\n${guide}\nOuvrez un dossier pour le lire, changer le statut, joindre une version modifiée ou valider votre étape.`;
  }
  if (action === "open_sent") {
    return `${prefix}\n${guide}\nVous y voyez ce que vous avez transmis et le statut.`;
  }
  if (action === "open_suivi") {
    return `${prefix}\n${guide}\nSuivez où se trouve chaque dossier dans le circuit (comme un colis).`;
  }
  if (action === "open_fichiers") {
    return `${prefix}\n${guide}\nRecherchez par identifiant (ex. SD-2026-…), objet ou nom de fichier.`;
  }
  if (action === "open_messages") {
    return `${prefix}\n${guide}\nChoisissez un collègue pour discuter.`;
  }
  if (action === "open_actualites") {
    return `${prefix}\n${guide}\nFaites défiler le fil d’annonces de l’administration.`;
  }
  if (action === "open_announcements") {
    return `${prefix}\n${guide}\nPubliez ou gérez vos annonces (publique / privée).`;
  }
  if (action === "open_departments") {
    return `${prefix}\n${guide}\nDemandez à rejoindre un département : le chef validera.`;
  }
  if (action === "open_settings") {
    return `${prefix}\n${guide}\nProfil, bot, sécurité… tout est là.`;
  }
  if (action === "open_accounts") {
    return `${prefix}\n${guide}\nValidation des inscriptions (réservé au DG).`;
  }
  if (action === "open_home") {
    return `${prefix}\n${guide}`;
  }
  if (/apprendre|automatis|enseigne/.test(q)) {
    return `${prefix}\nDites par exemple : « Apprends : quand je dis *mes reçus*, ouvre les documents reçus ».`;
  }
  if (/perdu|aide|comment|probleme/.test(q)) {
    return `${prefix}\nJe suis là. Dites ce que vous cherchez (envoyer un document, messages, suivi…) et je vous ouvre la bonne page.`;
  }
  return "";
}

function parseLearnCommand(message: string): {
  trigger: string;
  instruction: string;
  action: SiteAction;
} | null {
  const m = message.trim();
  const re =
    /^(?:apprends?|enseigne|automatise)\s*[:：]?\s*(?:quand\s+je\s+dis\s+)?[«"']?(.+?)[»"']?\s*(?:,|\s+→\s+|\s+->\s+|\s+alors\s+|\s+fais\s+|\s+:\s+)(.+)$/i;
  const hit = m.match(re);
  if (!hit) return null;
  const trigger = hit[1]!.trim().slice(0, 120);
  const instruction = hit[2]!.trim().slice(0, 800);
  if (trigger.length < 2 || instruction.length < 2) return null;
  return {
    trigger,
    instruction,
    action: detectSiteAction(instruction),
  };
}

export const ask = action({
  args: {
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const message = args.message.trim().slice(0, 1000);
    if (!message) {
      return {
        reply: "Écrivez votre question, je vous guide.",
        action: null,
        emotion: "curious" as BotEmotion,
      };
    }

    const profile = (await ctx.runQuery(internal.bot.getProfileInternal, {
      userId,
    })) as {
      name?: string;
      mood?: string;
      personality?: string;
    } | null;
    const name: string = profile?.name ?? "Aide";
    const mood: string = profile?.mood ?? "calme";
    const personality: string =
      profile?.personality ??
      "Robot serviable, vivant, patient ; guide clairement dans le site.";

    const emotion = detectEmotion(message, mood);

    // 1) Apprentissage
    const learn = parseLearnCommand(message);
    if (learn) {
      await ctx.runMutation(internal.bot.saveSkillInternal, {
        userId,
        name: learn.trigger.slice(0, 40),
        trigger: learn.trigger,
        instruction: learn.instruction,
        action: learn.action,
      });
      const reply = `${name} : J'ai appris « ${learn.trigger} ». Quand vous le direz, j'exécuterai : ${learn.instruction}`;
      await ctx.runMutation(internal.bot.saveExchange, {
        userId,
        userBody: message,
        assistantBody: reply,
      });
      return { reply, action: null as string | null, learned: true, emotion: "happy" as BotEmotion };
    }

    // 2) Compétence déjà apprise
    const skill = (await ctx.runQuery(internal.bot.matchSkill, {
      userId,
      message,
    })) as {
      _id: string;
      instruction: string;
      action?: string;
    } | null;
    if (skill) {
      await ctx.runMutation(internal.bot.bumpSkillUse, {
        skillId: skill._id as any,
      });
      const action =
        (skill.action as SiteAction | undefined) ||
        detectSiteAction(skill.instruction + " " + message);
      const guide = guideLine(action);
      const reply = `${name} : ${skill.instruction}${guide ? `\n${guide}` : ""}`;
      await ctx.runMutation(internal.bot.saveExchange, {
        userId,
        userBody: message,
        assistantBody: reply,
      });
      return {
        reply,
        action: action === "reply" ? null : action,
        learned: false,
        emotion: "excited" as BotEmotion,
      };
    }

    // 3) Intention de navigation + réponse
    const action = detectSiteAction(message);
    let reply = ruleBasedReply(message, name, mood, action);
    if (!reply) {
      reply = `${moodPrefix(name, mood)} Dites-moi ce que vous cherchez — j’ouvre la page pour vous. Sinon on peut juste discuter.`;
    }

    try {
      const { groqChat } = await import("./lib/groq");
      const history = await ctx.runQuery(internal.bot.listRecentInternal, {
        userId,
        limit: 6,
      });
      const historyMsgs = history.map((h: { role: string; body: string }) => ({
        role: (h.role === "user" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: h.body,
      }));
      const navHint =
        action !== "reply"
          ? `\nL'utilisateur sera automatiquement conduit vers : ${action}. Mentionne-le brièvement (« Je vous y emmène »).`
          : "";
      const ai = await groqChat({
        temperature: 0.55,
        maxTokens: 360,
        messages: [
          {
            role: "system",
            content: `${SITE_HELP}

Ton nom : ${name}.
Humeur : ${mood}.
Comportement : ${personality}.
${navHint}`,
          },
          ...historyMsgs,
          { role: "user", content: message },
        ],
      });
      if (ai) {
        reply = ai;
        // Si l'IA n'a pas mentionné le guide, l'ajouter
        const g = guideLine(action);
        if (g && !/emmène|ouvre|Documents|Messagerie|Paramètres/i.test(ai)) {
          reply = `${ai}\n\n${g}`;
        }
      }
    } catch (e) {
      console.error("[assistantBot.ask] Groq:", e);
    }

    await ctx.runMutation(internal.bot.saveExchange, {
      userId,
      userBody: message,
      assistantBody: reply,
    });

    return {
      reply,
      action: action === "reply" ? null : action,
      learned: false,
      emotion,
    };
  },
});
