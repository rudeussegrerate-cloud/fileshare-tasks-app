"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const SYSTEM_PROMPT = `Tu es un assistant administratif. On te donne le texte d'un document professionnel (courrier interne, note, rapport, etc.).

Ta mission : EXPLIQUER ce que contient le document, en français, de façon claire et utile pour le destinataire.

Règles strictes :
- Maximum 5 lignes au total (pas plus).
- Ne pas faire un résumé vague : expliquer concrètement de quoi parle le document.
- Ne rien inventer. Si une info n'est pas dans le texte, ne pas l'affirmer.
- Style simple, professionnel, phrases courtes.

Structure obligatoire (respecte cet ordre) :

Ligne 1 : une phrase qui commence par "Ce document contient", "Ce document explique", "Ce document présente", "Ce document décrit" ou "Ce document concerne", suivie du type et du sujet principal.

Lignes 2 à 4 : 2 à 3 points importants (faits, chiffres, dates, demandes, décisions) précédés de "- ".

Ligne 5 (si objet ou tâches fournis) : "Action attendue : ..." en une phrase courte.

Exemple de sortie attendue :
Ce document présente la note de service sur les nouvelles procédures de congés du service RH.
- Les demandes doivent être déposées 15 jours à l'avance.
- Le formulaire F-RH-03 remplace l'ancien modèle.
- Application à compter du 1er novembre.
Action attendue : Pour information et application.`;

/** Fallback used when the AI is unavailable: an extractive digest. */
function extractiveSummary(text: string) {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/[•·]/g, "\n- ")
    .trim();
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);

  const picked = sentences.slice(0, 3);
  if (picked.length === 0) {
    return (
      "Ce document contient un extrait de texte limité.\n- " +
      cleaned.slice(0, 280)
    );
  }
  const intro =
    "Ce document contient les éléments suivants tirés de son contenu :";
  const bullets = picked.map((s) => `- ${s.slice(0, 160)}`).join("\n");
  return `${intro}\n${bullets}`;
}

/**
 * Builds the automatic summary of a document so the receiver does not have to
 * read everything. Uses the AI integration when a document contains readable
 * text, and falls back to an extractive digest otherwise.
 */
export const summarizeDocument = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const document = await ctx.runQuery(internal.documents.getForSummary, {
      documentId: args.documentId,
    });
    if (!document) return null;

    const text = (document.extractedText ?? "").trim();
    if (text.length < 40) {
      await ctx.runMutation(internal.documents.setSummary, {
        documentId: args.documentId,
        summaryStatus: "indisponible",
        summary:
          "Résumé automatique indisponible : ce fichier ne contient pas de texte exploitable (image ou scan non lisible). Le destinataire peut ouvrir le document joint.",
      });
      return null;
    }

    const excerpt = text.slice(0, 12000);

    // 1) Groq (prioritaire) — clé GROQ_API_KEY
    try {
      const { groqChat } = await import("./lib/groq");
      const summary = await groqChat({
        temperature: 0.2,
        maxTokens: 350,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Fichier : ${document.fileName}
Objet de l'envoi : ${document.objet || "(non précisé)"}
Tâches demandées au destinataire : ${document.task || "(non précisées)"}

Contenu du document à analyser :
${excerpt}`,
          },
        ],
      });
      if (summary) {
        await ctx.runMutation(internal.documents.setSummary, {
          documentId: args.documentId,
          summary,
          summaryStatus: "pret",
          summarySource: "ia",
        });
        return null;
      }
    } catch (error) {
      console.error("[summarizeDocument] Groq indisponible:", error);
    }

    // 2) Fallback Vly si configuré
    if (process.env.VLY_INTEGRATION_KEY) {
      try {
        const { vly } = await import("../lib/vly-integrations");
        const response = await vly.ai.completion({
          model: "gpt-4o-mini",
          temperature: 0.2,
          maxTokens: 350,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Fichier : ${document.fileName}
Objet de l'envoi : ${document.objet || "(non précisé)"}
Tâches demandées au destinataire : ${document.task || "(non précisées)"}

Contenu du document à analyser :
${excerpt}`,
            },
          ],
        });

        const summary = response.success
          ? response.data?.choices?.[0]?.message?.content?.trim()
          : undefined;

        if (summary) {
          await ctx.runMutation(internal.documents.setSummary, {
            documentId: args.documentId,
            summary,
            summaryStatus: "pret",
            summarySource: "ia",
          });
          return null;
        }
      } catch (error) {
        console.error("[summarizeDocument] AI indisponible:", error);
      }
    }

    await ctx.runMutation(internal.documents.setSummary, {
      documentId: args.documentId,
      summary: extractiveSummary(text),
      summaryStatus: "pret",
      summarySource: "extrait",
    });
    return null;
  },
});
