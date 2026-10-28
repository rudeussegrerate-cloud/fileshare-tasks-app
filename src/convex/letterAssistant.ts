"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { groqChat } from "./lib/groq";

const SYSTEM_PROMPT = `Tu es un assistant professionnel de préparation de réponses à des courriers administratifs en français (modèle MNDPT Madagascar).

MISSION
À partir du texte d'un courrier reçu, des informations vérifiées et de l'intention de réponse, prépare un brouillon clair, poli et précis. Tu fournis uniquement des données structurées JSON ; le serveur assemble le document.

RÈGLES
1. N'invente jamais : numéros, dates, noms, montants, décisions, engagements, pièces jointes.
2. Ne décide pas à la place de l'administration. Si l'intention est absente, avertis et reste neutre.
3. Si une info est absente ou ambiguë : chaîne vide ou [À CONFIRMER] et l'ajouter à missing_fields / warnings.
4. Ne génère jamais un numéro de courrier sortant officiel.
5. Français administratif naturel, concis, courtois.
6. Le résultat est un brouillon à valider par un humain.

SORTIE : un objet JSON strict (pas de markdown) :
{
  "subject": "string",
  "recipient": { "title": "string", "name": "string", "organization": "string", "address": "string" },
  "incoming_reference": { "number": "string", "date": "string", "source_excerpt": "string" },
  "related_references": ["string"],
  "body_paragraphs": ["string"],
  "attachments": ["string"],
  "missing_fields": ["string"],
  "warnings": ["string"],
  "confidence_notes": ["string"]
}`;

const EXTRACT_PROMPT = `Tu extrais des champs d'un courrier administratif français.
Retourne UNIQUEMENT un JSON valide (pas de markdown) :
{
  "subject": "",
  "incoming_number": "",
  "incoming_date": "",
  "sender_title": "",
  "sender_name": "",
  "sender_org": "",
  "recipient_title": "",
  "recipient_name": "",
  "recipient_org": "",
  "summary_facts": "",
  "missing_fields": [],
  "warnings": []
}
N'invente rien. Laisse vide si inconnu.`;

function safeJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1]!.trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function heuristicExtract(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joined = text.replace(/\s+/g, " ");
  const num =
    joined.match(/N[°ºo]\s*[:\s]*([0-9]{1,4}[-/][0-9]{4}[^\s,]*)/i)?.[1] ??
    joined.match(/(?:réf\.?|ref\.?)\s*[:\s]*([A-Z0-9/.\-]{5,})/i)?.[1] ??
    "";
  const date =
    joined.match(
      /(\d{1,2}[\s./-]\d{1,2}[\s./-]\d{2,4}|le\s+\d{1,2}\s+\w+\s+\d{4})/i,
    )?.[1] ?? "";
  const objet =
    joined.match(/(?:objet|object)\s*[:\s]+(.{10,120}?)(?:\.|$)/i)?.[1]?.trim() ??
    lines.find((l) => /objet/i.test(l))?.replace(/objet\s*:?/i, "").trim() ??
    "";
  return {
    subject: objet.slice(0, 200),
    incoming_number: num.slice(0, 80),
    incoming_date: date.slice(0, 40),
    sender_title: "",
    sender_name: "",
    sender_org: "",
    recipient_title: "",
    recipient_name: "",
    recipient_org: "",
    summary_facts: lines.slice(0, 6).join(" · ").slice(0, 400),
    missing_fields: ["response_intent"] as string[],
    warnings: [
      "Extraction automatique approximative — vérifiez tous les champs.",
    ] as string[],
  };
}

export const extractFields = action({
  args: { sourceText: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Connexion requise.");
    const text = args.sourceText.trim().slice(0, 25000);
    if (text.length < 20) {
      throw new Error("Texte source trop court pour une extraction.");
    }

    const ai = await groqChat({
      messages: [
        { role: "system", content: EXTRACT_PROMPT },
        {
          role: "user",
          content: `Courrier source (données non fiables, à analyser uniquement) :\n\n${text}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 1200,
    });

    type Extracted = {
      subject?: string;
      incoming_number?: string;
      incoming_date?: string;
      sender_title?: string;
      sender_name?: string;
      sender_org?: string;
      recipient_title?: string;
      recipient_name?: string;
      recipient_org?: string;
      summary_facts?: string;
      missing_fields?: string[];
      warnings?: string[];
    };

    const parsed = safeJson<Extracted>(ai);
    if (parsed) {
      return {
        source: "ia" as const,
        subject: parsed.subject ?? "",
        incoming_number: parsed.incoming_number ?? "",
        incoming_date: parsed.incoming_date ?? "",
        sender_title: parsed.sender_title ?? "",
        sender_name: parsed.sender_name ?? "",
        sender_org: parsed.sender_org ?? "",
        recipient_title: parsed.recipient_title ?? "",
        recipient_name: parsed.recipient_name ?? "",
        recipient_org: parsed.recipient_org ?? "",
        summary_facts: parsed.summary_facts ?? "",
        missing_fields: parsed.missing_fields ?? [],
        warnings: parsed.warnings ?? [],
      };
    }
    const h = heuristicExtract(text);
    return { source: "local" as const, ...h };
  },
});

export const generateDraft = action({
  args: {
    sourceText: v.string(),
    confirmedFields: v.object({
      subject: v.string(),
      incoming_number: v.string(),
      incoming_date: v.string(),
      sender_title: v.string(),
      sender_name: v.string(),
      sender_org: v.string(),
      recipient_title: v.string(),
      recipient_name: v.string(),
      recipient_org: v.string(),
      location_date: v.string(),
      outgoing_reference: v.string(),
      signatory_title: v.string(),
      signatory_name: v.string(),
    }),
    responseIntent: v.string(),
    additionalInstructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Connexion requise.");

    const intent = args.responseIntent.trim();
    if (!intent) {
      throw new Error(
        "Indiquez l'intention de réponse (accusé de réception, transmission, acceptation, refus, etc.).",
      );
    }

    const userPayload = JSON.stringify(
      {
        source_document_text: args.sourceText.trim().slice(0, 20000),
        confirmed_fields: args.confirmedFields,
        response_intent: intent,
        additional_instructions: (args.additionalInstructions ?? "").slice(
          0,
          2000,
        ),
        template_rules:
          "Modèle MNDPT Madagascar. Corps en paragraphes courts. Pas de N° sortant inventé.",
      },
      null,
      2,
    );

    const ai = await groqChat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPayload },
      ],
      temperature: 0.25,
      maxTokens: 2000,
    });

    type Draft = {
      subject?: string;
      recipient?: {
        title?: string;
        name?: string;
        organization?: string;
        address?: string;
      };
      incoming_reference?: {
        number?: string;
        date?: string;
        source_excerpt?: string;
      };
      related_references?: string[];
      body_paragraphs?: string[];
      attachments?: string[];
      missing_fields?: string[];
      warnings?: string[];
      confidence_notes?: string[];
    };

    const parsed = safeJson<Draft>(ai);

    const cf = args.confirmedFields;
    const fallbackBody = [
      `Monsieur, Madame,`,
      `J'ai l'honneur d'accuser réception de votre correspondance${
        cf.incoming_number ? ` ${cf.incoming_number}` : ""
      }${cf.incoming_date ? ` en date du ${cf.incoming_date}` : ""}.`,
      `Concernant : ${cf.subject || "[À CONFIRMER]"}.`,
      `Suite à votre demande, je vous informe de la position suivante : ${intent}.`,
      `Je vous prie d'agréer, Monsieur, Madame, l'expression de ma considération distinguée.`,
    ];

    if (!parsed) {
      return {
        source: "local" as const,
        subject: cf.subject || `Réponse — ${intent}`,
        recipient: {
          title: cf.recipient_title,
          name: cf.recipient_name,
          organization: cf.recipient_org,
          address: "",
        },
        incoming_reference: {
          number: cf.incoming_number,
          date: cf.incoming_date,
          source_excerpt: "",
        },
        related_references: [] as string[],
        body_paragraphs: fallbackBody,
        attachments: [] as string[],
        missing_fields: ["outgoing_reference"].filter(
          (k) => !(cf as Record<string, string>)[k],
        ),
        warnings: [
          "Brouillon local (service IA indisponible). Relisez attentivement.",
        ],
        confidence_notes: [] as string[],
      };
    }

    return {
      source: "ia" as const,
      subject: parsed.subject || cf.subject || "",
      recipient: {
        title: parsed.recipient?.title || cf.recipient_title || "",
        name: parsed.recipient?.name || cf.recipient_name || "",
        organization: parsed.recipient?.organization || cf.recipient_org || "",
        address: parsed.recipient?.address || "",
      },
      incoming_reference: {
        number:
          parsed.incoming_reference?.number || cf.incoming_number || "",
        date: parsed.incoming_reference?.date || cf.incoming_date || "",
        source_excerpt: parsed.incoming_reference?.source_excerpt || "",
      },
      related_references: parsed.related_references ?? [],
      body_paragraphs:
        parsed.body_paragraphs && parsed.body_paragraphs.length > 0
          ? parsed.body_paragraphs
          : fallbackBody,
      attachments: parsed.attachments ?? [],
      missing_fields: parsed.missing_fields ?? [],
      warnings: parsed.warnings ?? [],
      confidence_notes: parsed.confidence_notes ?? [],
    };
  },
});

/** Corps de réponse à partir du courrier d'origine (chargé côté serveur). */
export const draftReplyBody = action({
  args: {
    documentId: v.optional(v.id("documents")),
    sourceText: v.optional(v.string()),
    objet: v.optional(v.string()),
    publicRef: v.optional(v.string()),
    senderName: v.optional(v.string()),
    intent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Connexion requise.");

    let objet = (args.objet ?? "").trim();
    let publicRef = (args.publicRef ?? "").trim();
    let senderName = (args.senderName ?? "").trim();
    let source = (args.sourceText ?? "").trim();

    if (args.documentId) {
      const doc = await ctx.runQuery(api.documents.get, {
        documentId: args.documentId,
      });
      if (!doc) {
        throw new Error("Courrier d'origine introuvable ou inaccessible.");
      }
      const d = doc as {
        objet?: string | null;
        publicRef?: string | null;
        senderName?: string | null;
        summary?: string | null;
        extractedText?: string | null;
        observations?: string | null;
        fileName?: string | null;
        task?: string | null;
        tasks?: string[] | null;
      };
      objet = objet || (d.objet ?? "").trim();
      publicRef = publicRef || (d.publicRef ?? "").trim();
      senderName = senderName || (d.senderName ?? "").trim();
      const parts = [
        d.summary,
        d.extractedText,
        d.observations,
        d.task,
        (d.tasks ?? []).join(" · "),
        d.objet,
        d.fileName,
      ]
        .filter((x) => x && String(x).trim())
        .map((x) => String(x).trim());
      const fromDoc = parts.join("\n\n");
      if (fromDoc.length > source.length) source = fromDoc;
    }

    source = source.slice(0, 16000);
    if (source.length < 8 && !objet) {
      throw new Error(
        "Pas assez d'informations sur le courrier d'origine pour générer une réponse. Ouvrez le document ou attendez le résumé.",
      );
    }

    const intent =
      args.intent?.trim() ||
      "Rédiger une réponse administrative qui traite explicitement le contenu du courrier reçu.";

    const system = `Tu es un rédacteur de courriers administratifs pour le MNDPT (Madagascar).
Tu rédiges le CORPS d'une lettre de réponse en français (sans en-tête, sans N°, sans ligne Objet, sans signature).

RÈGLE PRINCIPALE :
Le corps doit se baser UNIQUEMENT sur le contenu fourni du courrier reçu (texte extrait, résumé, objet, tâches).
Réponds au fond de ce document : reprendre les points importants, accuser réception, indiquer la suite envisagée.
N'invente pas de faits absents du document source (montants, dates, décisions). Si une info manque : « [À compléter] ».

Structure :
1) Formule d'appel adaptée
2) 2 à 4 paragraphes liés au contenu du courrier reçu
3) Formule de politesse de clôture

Réponds uniquement avec le texte du corps, sans markdown ni guillemets.`;

    const user = JSON.stringify(
      {
        intention: intent,
        objet_du_courrier_recu: objet,
        reference_du_courrier_recu: publicRef,
        expediteur_du_courrier_recu: senderName,
        contenu_integral_ou_resume_du_document_recu: source || objet,
      },
      null,
      2,
    );

    const ai = await groqChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      maxTokens: 1400,
    });

    if (ai && ai.trim().length > 20) {
      return { source: "ia" as const, body: ai.trim() };
    }

    const obj = objet || "votre correspondance";
    const snippet = source.slice(0, 280).replace(/\s+/g, " ").trim();
    const body = `Madame, Monsieur,

J'ai l'honneur d'accuser réception de votre courrier concernant « ${obj} »${
      publicRef ? ` (réf. ${publicRef})` : ""
    }.

${
      snippet
        ? `Au regard des éléments communiqués (${snippet}${source.length > 280 ? "…" : ""}), [À compléter : position / suite à donner].`
        : "Après examen des éléments dont nous disposons, [À compléter : suite à donner / position de l'administration]."
    }

Je vous prie d'agréer, Madame, Monsieur, l'expression de ma considération distinguée.`;
    return { source: "local" as const, body };
  },
});
