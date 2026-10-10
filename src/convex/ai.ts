"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const SYSTEM_PROMPT = `Tu es un rédacteur administratif expert. On te donne le texte brut d'un document professionnel (courrier, note de service, rapport, PV, facture, etc.).

OBJECTIF
Rédiger une EXPLICATION claire et utile pour un destinataire pressé : il doit comprendre le document SANS l'ouvrir, en français simple.

RÈGLES ABSOLUES
1. Maximum 5 lignes au total (jamais plus).
2. Ne rien inventer : uniquement des faits présents dans le texte.
3. Pas de formules vagues (« ce document traite de divers sujets »).
4. Pas de markdown, pas de numérotation 1. 2. 3. — uniquement des tirets "- ".
5. Si le texte est trop pauvre, le dire honnêtement en une ligne puis extraire ce qui est disponible.

STRUCTURE OBLIGATOIRE
Ligne 1 : une phrase d'ouverture qui commence EXACTEMENT par l'une de ces formules :
  « Ce document contient », « Ce document explique », « Ce document présente »,
  « Ce document décrit », « Ce document concerne », « Ce document demande ».
  Puis le type de pièce + le sujet principal (qui, quoi).

Lignes 2 à 4 : 2 ou 3 points concrets (dates, montants, noms, décisions, obligations) précédés de "- ".

Ligne 5 (optionnelle) : si un objet d'envoi ou des tâches sont fournis, écrire :
  « Action attendue : … » en une seule phrase courte.

TON
Professionnel, neutre, accessible aux non-spécialistes. Phrases courtes.

EXEMPLE
Ce document présente la note de service RH sur les congés annuels 2026.
- Les demandes doivent être déposées au moins 15 jours avant le départ.
- Le formulaire F-RH-03 remplace l'ancien modèle à compter du 1er novembre.
- Les chefs de service valident les demandes dans l'outil ScanDoc.
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
