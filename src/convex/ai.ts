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
Professionnel, neutre, accessible aux non-spécialistes. Phrases courtes.`;

const IMAGE_PROMPT = `Tu analyses une image ou une photo jointe à un envoi professionnel (ScanDoc).

OBJECTIF
- S'il y a du TEXTE lisible (scan de courrier, capture d'écran, photo de document) : explique le contenu comme un document (max 5 lignes).
- S'il n'y a PAS de texte lisible : DÉCRIS précisément ce que montre la photo (lieu, personnes, objets, documents visibles, ambiance), max 5 lignes.

RÈGLES
1. Français simple, phrases courtes.
2. Ne pas inventer de noms, dates ou montants illisibles.
3. Ligne 1 commence par « Cette image montre », « Cette photo présente », « Ce scan contient » ou « Ce document photographié présente ».
4. Points concrets avec "- " si utile.
5. Si objet/tâches fournis : terminer par « Action attendue : … ».`;

function extractiveSummary(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
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
  return (
    "Ce document contient les éléments suivants tirés de son contenu :\n" +
    picked.map((s) => `- ${s.slice(0, 160)}`).join("\n")
  );
}

function isImageMime(mime: string) {
  const m = mime.toLowerCase().split(";")[0]!.trim();
  return m.startsWith("image/");
}

export const summarizeDocument = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const document = await ctx.runQuery(internal.documents.getForSummary, {
      documentId: args.documentId,
    });
    if (!document) return null;

    const text = (document.extractedText ?? "").trim();
    const contentType = document.contentType ?? "";
    const meta = `Fichier : ${document.fileName}
Objet de l'envoi : ${document.objet || "(non précisé)"}
Tâches demandées : ${document.task || "(non précisées)"}`;

    // —— Image / photo : vision AI si pas assez de texte ——
    if (isImageMime(contentType) && text.length < 40) {
      if (document.fileUrl) {
        try {
          const { groqDescribeImage } = await import("./lib/groq");
          const summary = await groqDescribeImage({
            imageUrl: document.fileUrl,
            system: IMAGE_PROMPT,
            userText: `${meta}\n\nAnalyse cette image et fournis l'explication demandée.`,
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
        } catch (e) {
          console.error("[summarizeDocument] vision:", e);
        }
      }
      await ctx.runMutation(internal.documents.setSummary, {
        documentId: args.documentId,
        summaryStatus: "indisponible",
        summary:
          "Cette image n'a pas pu être analysée automatiquement (OCR/vision). Ouvrez le fichier joint pour le consulter.",
      });
      return null;
    }

    if (text.length < 40) {
      await ctx.runMutation(internal.documents.setSummary, {
        documentId: args.documentId,
        summaryStatus: "indisponible",
        summary:
          "Résumé automatique indisponible : ce fichier ne contient pas de texte exploitable. Le destinataire peut ouvrir le document joint.",
      });
      return null;
    }

    const excerpt = text.slice(0, 12000);
    const userContent = `${meta}\n\nContenu du document à analyser :\n${excerpt}`;

    try {
      const { groqChat } = await import("./lib/groq");
      const summary = await groqChat({
        temperature: 0.2,
        maxTokens: 350,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
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
      console.error("[summarizeDocument] Groq:", error);
    }

    if (process.env.VLY_INTEGRATION_KEY) {
      try {
        const { vly } = await import("../lib/vly-integrations");
        const response = await vly.ai.completion({
          model: "gpt-4o-mini",
          temperature: 0.2,
          maxTokens: 350,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
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
        console.error("[summarizeDocument] Vly:", error);
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
