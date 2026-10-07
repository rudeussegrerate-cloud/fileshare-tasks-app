"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const SYSTEM_PROMPT = `Tu es un assistant administratif. On te fournit le contenu d'un document professionnel transmis entre services, avec l'objet de l'envoi et les tâches demandées.

Rédige EN FRANÇAIS un texte clair qui explique ce que contient le document.

Format obligatoire :

1) Une phrase d'introduction qui commence par l'une de ces formules (choisis la plus adaptée) :
   - "Ce document contient ..."
   - "Ce document explique ..."
   - "Ce document présente ..."
   - "Ce document décrit ..."
   - "Ce document concerne ..."
   Cette phrase doit résumer en une fois le type et le sujet du document (ex. : "Ce document présente le rapport trimestriel des ventes du service commercial.").

2) Ensuite, 3 à 4 points importants tirés du contenu, sous forme de puces "- " :
   - faits, chiffres, dates, décisions, demandes ou conclusions réellement présents dans le texte ;
   - phrases courtes et concrètes ;
   - ne rien inventer.

3) Une dernière ligne optionnelle si une tâche ou un objet est fourni :
   "Action attendue : ..." (reformulation brève).

Règles : ne rien inventer ; si le texte est incomplet, le préciser ; rester factuel et professionnel.`;

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

  const picked = sentences.slice(0, 4);
  if (picked.length === 0) {
    return (
      "Ce document contient un extrait de texte limité.\n\n" +
      "- " +
      cleaned.slice(0, 400)
    );
  }
  const intro =
    "Ce document contient les éléments suivants extraits de son contenu :";
  const bullets = picked.map((s) => `- ${s.slice(0, 220)}`).join("\n");
  return `${intro}\n\n${bullets}`;
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

    if (process.env.VLY_INTEGRATION_KEY) {
      try {
        const { vly } = await import("../lib/vly-integrations");
        const response = await vly.ai.completion({
          model: "gpt-4o-mini",
          temperature: 0.2,
          maxTokens: 900,
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
