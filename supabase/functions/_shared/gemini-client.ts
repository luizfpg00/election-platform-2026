// Shared Gemini API Client (copied from LifeNutriHub)

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export function getGeminiApiKey(): string {
  const key = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!key) throw new Error("GOOGLE_GEMINI_API_KEY not configured");
  return key;
}

export async function callGeminiJSON(
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    max_tokens?: number;
  }
): Promise<Record<string, unknown>> {
  const apiKey = getGeminiApiKey();
  const model = body.model.startsWith("google/") ? body.model.replace("google/", "") : body.model;

  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, model, stream: false }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  return response.json();
}
