/**
 * Client minimal Groq (API compatible OpenAI).
 * Clé : variable d'environnement Convex GROQ_API_KEY
 */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Modèle rapide et gratuit sur le free tier Groq — bon pour le français */
export const GROQ_MODEL = "llama-3.3-70b-versatile";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
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
    console.error("[groq]", res.status, body.slice(0, 400));
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}
