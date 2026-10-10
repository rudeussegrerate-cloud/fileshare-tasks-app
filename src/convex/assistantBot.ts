"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

const SITE_HELP = `
Tu es un assistant personnel sur ScanDoc. Tu guides l'utilisateur et tu peux discuter librement.

Priorités :
1. ScanDoc (documents, départements, messages, actualités) → menus exacts.
2. Discussion libre → empathie, français simple.
3. Pas de secrets techniques (tokens, erreurs serveur).
4. 2 à 8 lignes max.
5. Respecte le nom, l'humeur et le comportement fournis.
6. Si une automatisation apprise correspond, applique-la clairement.
`;

function ruleBasedReply(
  question: string,
  botName: string,
  mood: string,
): string {
  const q = question.toLowerCase();
  const prefix =
    mood === "joyeux"
      ? `😊 ${botName} :`
      : mood === "motivant"
        ? `💪 ${botName} :`
        : mood === "blagueur"
          ? `😄 ${botName} :`
          : `${botName} :`;

  if (/bonjour|salut|hello|bonsoir/.test(q)) {
    return `${prefix} Bonjour ! Comment puis-je vous aider sur ScanDoc ?`;
  }
  if (/envoyer|envoi|nouveau document|partager/.test(q)) {
    return `${prefix}\nPour envoyer un document : menu **Envoyer un document** → fichier, destinataire, objet, « de la part de », tâches → Envoyer.`;
  }
  if (/reçu|inbox|reception|reçus/.test(q)) {
    return `${prefix}\nVos documents reçus sont dans **Documents reçus**. Ouvrez un document pour le lire, changer le statut ou l'imprimer.`;
  }
  if (/département|rejoindre|adhésion|groupe/.test(q)) {
    return `${prefix}\nAllez dans **Départements & groupes**. Demandez à rejoindre : le chef validera.`;
  }
  if (/mot de passe|oublié|connexion|login|compte/.test(q)) {
    return `${prefix}\nPage de connexion → « Mot de passe oublié ? ». Pour un compte bloqué, contactez le DG.`;
  }
  if (/message|chat|discuter|écrire/.test(q)) {
    return `${prefix}\nOuvrez **Messagerie**, ou un collègue en ligne, pour démarrer une conversation.`;
  }
  if (/apprendre|automatis|mode apprentissage|enseigne/.test(q)) {
    return `${prefix}\nMode apprentissage : dites par exemple\n« Apprends : quand je dis *mes reçus*, ouvre les documents reçus »\nou créez une tâche dans les paramètres du bot.`;
  }
  if (/aide|perdu|comment|problème/.test(q)) {
    return `${prefix}\nJe peux vous guider (envoyer, reçus, départements, messages) ou exécuter une tâche que vous m'avez apprise.`;
  }
  return "";
}

/** Parse « Apprends : quand je dis X, fais Y » */
function parseLearnCommand(message: string): {
  trigger: string;
  instruction: string;
  action:
    | "reply"
    | "open_inbox"
    | "open_send"
    | "open_messages"
    | "open_actualites"
    | "open_departments"
    | "remind_tasks";
} | null {
  const m = message.trim();
  const re =
    /^(?:apprends?|enseigne|automatise)\s*[:：]?\s*(?:quand\s+je\s+dis\s+)?[«"']?(.+?)[»"']?\s*(?:,|\s+→\s+|\s+->\s+|\s+alors\s+|\s+fais\s+|\s+:\s+)(.+)$/i;
  const hit = m.match(re);
  if (!hit) return null;
  const trigger = hit[1]!.trim().slice(0, 120);
  const instruction = hit[2]!.trim().slice(0, 800);
  if (trigger.length < 2 || instruction.length < 2) return null;

  const low = instruction.toLowerCase();
  let action:
    | "reply"
    | "open_inbox"
    | "open_send"
    | "open_messages"
    | "open_actualites"
    | "open_departments"
    | "remind_tasks" = "reply";
  if (/reçus|inbox|documents reçus/.test(low)) action = "open_inbox";
  else if (/envoyer|nouvel envoi/.test(low)) action = "open_send";
  else if (/message|messagerie/.test(low)) action = "open_messages";
  else if (/actualité|annonce/.test(low)) action = "open_actualites";
  else if (/département/.test(low)) action = "open_departments";
  else if (/tâche|rappel|à traiter/.test(low)) action = "remind_tasks";

  return { trigger, instruction, action };
}

export const ask = action({
  args: {
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié.");
    const message = args.message.trim().slice(0, 1000);
    if (!message) return { reply: "Écrivez votre question.", action: null };

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
      profile?.personality ?? "Aide de façon simple et patiente.";

    // 1) Apprentissage explicite
    const learn = parseLearnCommand(message);
    if (learn) {
      await ctx.runMutation(internal.bot.saveSkillInternal, {
        userId,
        name: learn.trigger.slice(0, 40),
        trigger: learn.trigger,
        instruction: learn.instruction,
        action: learn.action,
      });
      const reply: string = `${name} : J'ai appris la tâche « ${learn.trigger} ». Quand vous la mentionnerez, j'exécuterai : ${learn.instruction}`;
      await ctx.runMutation(internal.bot.saveExchange, {
        userId,
        userBody: message,
        assistantBody: reply,
      });
      return { reply, action: null as string | null, learned: true };
    }

    // 2) Automatisation déjà apprise
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
      const reply: string = `${name} : ${skill.instruction}`;
      await ctx.runMutation(internal.bot.saveExchange, {
        userId,
        userBody: message,
        assistantBody: reply,
      });
      return {
        reply,
        action: (skill.action as string | undefined) ?? "reply",
        learned: false,
      };
    }

    // 3) Règles site + IA
    let reply: string = ruleBasedReply(message, name, mood);
    if (!reply) {
      reply = `${name} ici 😊 Dites-m'en plus — même hors ScanDoc, je reste disponible. Pour m'apprendre une tâche : « Apprends : quand je dis X, fais Y ».`;
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
      const ai = await groqChat({
        temperature: 0.5,
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

    return { reply, action: null as string | null, learned: false };
  },
});
