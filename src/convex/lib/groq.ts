/**
 * Client Groq (API compatible OpenAI) — texte + vision.
 * Clé : GROQ_API_KEY dans Convex.
 */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export const GROQ_MODEL = "llama-3.3-70b-versatile";
/** Modèle vision Groq pour décrire / résumer des images */
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

export async function groqChat(options: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? GROQ_MODEL,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 400,
      messages: options.messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[groq]", res.status, body.slice(0, 500));
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

/** Analyse d'image (photo / scan) via modèle vision Groq. */
export async function groqDescribeImage(options: {
  imageUrl: string;
  system: string;
  userText: string;
  maxTokens?: number;
}): Promise<string | null> {
  return groqChat({
    model: GROQ_VISION_MODEL,
    temperature: 0.25,
    maxTokens: options.maxTokens ?? 400,
    messages: [
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
  });
}
