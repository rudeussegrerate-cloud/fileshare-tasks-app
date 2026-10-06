"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const SYSTEM_PROMPT = `Tu es un assistant administratif. On te fournit le contenu d'un document transmis entre deux services d'une entreprise, ainsi que la tâche demandée au destinataire.
Rédige un résumé clair et fidèle EN FRANÇAIS (120 mots maximum) qui aide le destinataire à comprendre l'essentiel SANS lire tout le document.
Structure attendue :
- 3 à 5 points clés (puces avec "- ")
- puis une courte phrase "Action attendue : ..." qui reformule la tâche.
Ne rien inventer. Si le contenu est incomplet, résume uniquement ce qui est présent.`;

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
    return cleaned.slice(0, 280);
  }
  return picked.map((s) => `- ${s.slice(0, 220)}`).join("\n");
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
          maxTokens: 400,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Fichier : ${document.fileName}\nTâche demandée au destinataire : ${document.task}\n\nContenu :\n${excerpt}`,
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
