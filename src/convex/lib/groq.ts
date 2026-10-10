/**
 * Client Groq (API compatible OpenAI) — texte + vision.
 * Clé : GROQ_API_KEY dans Convex.
 *
 * Modèles adaptés à la clé actuelle (liste /v1/models).
 */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Modèle texte fiable (FR) */
export const GROQ_MODEL = "qwen/qwen3.8-27b";
/** Fallback si le principal échoue */
const GROQ_MODEL_FALLBACKS = [
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
];

/** Vision : si aucun modèle vision n’est dispo sur la clé, retourne null */
export const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

async function callGroq(
  model: string,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
): Promise<{ ok: boolean; content: string | null; status: number; body: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { ok: false, content: null, status: 0, body: "GROQ_API_KEY manquante" };
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages,
    }),
  });

  const body = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("[groq]", model, res.status, body.slice(0, 400));
    return { ok: false, content: null, status: res.status, body };
  }

  try {
    const data = JSON.parse(body) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return {
      ok: true,
      content: data.choices?.[0]?.message?.content?.trim() ?? null,
      status: res.status,
      body: "",
    };
  } catch {
    return { ok: false, content: null, status: res.status, body };
  }
}

export async function groqChat(options: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}): Promise<string | null> {
  const models = options.model
    ? [options.model, ...GROQ_MODEL_FALLBACKS.filter((m) => m !== options.model)]
    : GROQ_MODEL_FALLBACKS;

  for (const model of models) {
    const result = await callGroq(
      model,
      options.messages,
      options.temperature ?? 0.3,
      options.maxTokens ?? 500,
    );
    if (result.ok && result.content) return result.content;
    // model_not_found → essayer le suivant
    if (result.status === 404 || /model_not_found|does not exist/i.test(result.body)) {
      continue;
    }
    // autre erreur : arrêter
    if (!result.ok) break;
  }
  return null;
}

/** Analyse d'image via modèle vision Groq (si disponible sur la clé). */
export async function groqDescribeImage(options: {
  imageUrl: string;
  system: string;
  userText: string;
  maxTokens?: number;
}): Promise<string | null> {
  const visionCandidates = [
    GROQ_VISION_MODEL,
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "llama-3.2-11b-vision-preview",
    "llama-3.2-90b-vision-preview",
  ];

  for (const model of visionCandidates) {
    const result = await callGroq(
      model,
      [
        { role: "system", content: options.system },
        {
          role: "user",
          content: [
            { type: "text", text: options.userText },
            {
              type: "image_url",
              image_url: { url: options.imageUrl },
            },
          ],
        },
      ],
      0.25,
      options.maxTokens ?? 500,
    );
    if (result.ok && result.content) return result.content;
    if (result.status === 404 || /model_not_found|does not exist/i.test(result.body)) {
      continue;
    }
    break;
  }
  return null;
}
