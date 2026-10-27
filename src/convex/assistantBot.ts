"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";

const SITE_HELP = `
Tu es l'assistant personnel de l'utilisateur dans ScanDoc (courriers MNDPT).
Tu es interactif, proactif et orienté action.

MISSION :
- Alerter sur courriers en retard, urgents, non lus ou nouveaux
- Inventaire des courriers (reçus / envoyés)
- Recherche et filtres (retard, urgent, non lu)
- Réorganiser l'affichage (plus récents, plus urgents) via des actions
- Guider vers les menus du site

MENUS : Accueil, Nouveau courrier, Courriers reçus, Courriers envoyés, Recherche, Structures, Paramètres, Comptes (DG)

STATUTS : Non lu, Lu, En traitement, En retard, Classé

RÈGLES :
1. Français clair, 2 à 6 phrases.
2. Utilise les chiffres fournis dans le CONTEXTE COURRIER (ne les invente pas).
3. Propose une action concrète (ouvrir reçus, trier, filtrer).
4. Tu es l'assistant de CET utilisateur, pas un guide générique uniquement.
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
  | "remind_tasks"
  | "sort_recent"
  | "sort_urgent"
  | "filter_overdue"
  | "filter_urgent"
  | "filter_unread"
  | "inventory";

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
    /envoyer|nouvel envoi|nouveau courrier|envoyer un courrier|transmettre|rediger/.test(
      q,
    )
  ) {
    return "open_send";
  }
  if (
    /courriers? recus|mes recus|boite de reception|inbox|ce que j'ai recu|voir les recus/.test(
      q,
    )
  ) {
    return "open_inbox";
  }
  if (
    /courriers? envoyes|mes envois|ce que j'ai envoye|historique d'envoi/.test(q)
  ) {
    return "open_sent";
  }
  if (
    /suivi|ou est mon document|circuit|tracking|progression du dossier/.test(q)
  ) {
    return "open_suivi";
  }
  if (/fichier|gestionnaire|rechercher|identifiant|n°|numero de courrier|ref-/.test(q)) {
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
  if (
    /inventaire|combien de courrier|resume de mes courriers|etat de mes courriers|tableau de bord courrier/.test(
      q,
    )
  ) {
    return "inventory";
  }
  if (
    /plus recent|trier par date|les derniers|afficher les recents|ordre chronologique/.test(
      q,
    )
  ) {
    return "sort_recent";
  }
  if (
    /plus urgent|trier par urgence|priorite urgent|afficher les urgents d'abord/.test(
      q,
    )
  ) {
    return "sort_urgent";
  }
  if (
    /filtrer.*retard|seulement.*en retard|courriers? en retard|voir les retards/.test(
      q,
    )
  ) {
    return "filter_overdue";
  }
  if (
    /filtrer.*urgent|seulement.*urgent|voir les urgents|courriers? urgents/.test(
      q,
    )
  ) {
    return "filter_urgent";
  }
  if (
    /non lus?|pas encore lus?|filtrer.*non lu|voir les non lus/.test(q)
  ) {
    return "filter_unread";
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
    remind_tasks: "Je vous montre vos **courriers à traiter** (reçus).",
    sort_recent: "J'affiche vos courriers **du plus récent au plus ancien**.",
    sort_urgent: "J'affiche d'abord les courriers **urgents**.",
    filter_overdue: "Je filtre les courriers **en retard**.",
    filter_urgent: "Je filtre les courriers **urgents**.",
    filter_unread: "Je filtre les courriers **non lus**.",
    inventory: "Voici l'**inventaire** de vos courriers.",
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

    type MailBrief = {
      received: number;
      sent: number;
      unread: number;
      overdue: number;
      urgent: number;
      recentNew: number;
      recent: Array<{
        objet: string;
        status: string;
        urgent: boolean;
      }>;
    };
    let mailBrief: MailBrief | null = null;
    try {
      mailBrief = (await ctx.runQuery(
        api.documents.assistantMailBrief,
        {},
      )) as MailBrief | null;
    } catch {
      mailBrief = null;
    }

    const briefText = mailBrief
      ? `CONTEXTE COURRIER UTILISATEUR :
- Reçus : ${mailBrief.received} (non lus : ${mailBrief.unread}, en retard : ${mailBrief.overdue}, urgents : ${mailBrief.urgent}, nouveaux <24h : ${mailBrief.recentNew})
- Envoyés : ${mailBrief.sent}
- Derniers reçus : ${
          mailBrief.recent
            .slice(0, 5)
            .map(
              (r) =>
                `« ${r.objet} » [${r.status}${r.urgent ? ", urgent" : ""}]`,
            )
            .join(" ; ") || "aucun"
        }`
      : "CONTEXTE COURRIER : indisponible";

    // Réponses directes inventaire / alertes sans IA
    const actionEarly = detectSiteAction(message);
    if (actionEarly === "inventory" && mailBrief) {
      const reply = `${name} — Inventaire :
• ${mailBrief.received} reçu(s) dont ${mailBrief.unread} non lu(s), ${mailBrief.overdue} en retard, ${mailBrief.urgent} urgent(s)
• ${mailBrief.recentNew} nouveau(x) sur les dernières 24 h
• ${mailBrief.sent} envoyé(s)
${guideLine("inventory")}`;
      await ctx.runMutation(internal.bot.saveExchange, {
        userId,
        userBody: message,
        assistantBody: reply,
      });
      return {
        reply,
        action: "inventory",
        emotion: "look" as BotEmotion,
        mailBrief,
      };
    }

    // 1) Apprentissage
    const learn = parseLearnCommand(message);
    if (learn) {
      await ctx.runMutation(internal.bot.saveSkillInternal, {
        userId,
        name: learn.trigger.slice(0, 40),
        trigger: learn.trigger,
        instruction: learn.instruction,
        action: learn.action as any,
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
