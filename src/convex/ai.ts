"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const SYSTEM_PROMPT = `Tu es un assistant administratif spécialisé dans l'analyse de documents professionnels.
On te fournit le contenu d'un document transmis entre services d'une entreprise, l'objet de l'envoi et les tâches demandées au destinataire.

Ta mission : expliquer CE QUE CONTIENT le document, de façon claire, précise et utile, EN FRANÇAIS.
Le destinataire doit comprendre le fond du document SANS avoir à tout lire.

Structure obligatoire (utilise exactement ces titres) :

Nature du document :
- Type (lettre, rapport, facture, note, contrat, etc.) et sujet principal.

Contenu détaillé :
- 5 à 8 puces ("- ") qui décrivent les informations concrètes présentes : faits, montants, dates, personnes, décisions, demandes, conclusions, annexes mentionnées, etc.
- Sois factuel et spécifique (chiffres, noms, délais quand ils sont dans le texte).

Points importants :
- 2 à 4 puces sur ce qui mérite particulièrement l'attention du destinataire.

Action attendue :
- Reformule l'objet et/ou les tâches demandées en une ou deux phrases.

Règles :
- Ne rien inventer. Si une info n'est pas dans le texte, ne l'affirme pas.
- Si le contenu est incomplet ou partiel, le préciser et ne résumer que ce qui est présent.
- Langage professionnel, simple et direct.`;

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

  const picked = sentences.slice(0, 8);
  if (picked.length === 0) {
    return (
      "Nature du document :\n- Contenu textuel partiel.\n\nContenu détaillé :\n- " +
      cleaned.slice(0, 500)
    );
  }
  const bullets = picked.map((s) => `- ${s.slice(0, 280)}`).join("\n");
  return (
    "Nature du document :\n- Extrait automatique du contenu (IA indisponible).\n\n" +
    "Contenu détaillé :\n" +
    bullets
  );
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
