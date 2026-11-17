/**
 * The AI pre-check adapter (decision ٢٠) — Gemini. Server-only.
 *
 * Privacy (decision ٢١):
 *   - the image is sent INLINE in the request (generateContent inline_data),
 *     never through the Files API, so no copy is kept on the provider side to
 *     delete afterwards; the row records provider_copy = 'inline_not_stored';
 *   - the key must belong to a PAID (billing-enabled) Gemini API project:
 *     Google does not use paid-tier API data to train its models, but it may
 *     use free-tier data. That is an owner/ops decision, and the reason the
 *     check also needs LAWYER_LICENCE_AI=on (providerConfig.ts).
 * Off (switch or key missing) → 'skipped' → the photo goes to a human.
 */

import { LICENCE_PROMPT, parseModelAnswer, type ExtractedLicence } from "./aiLicenceCheck.ts";

export type GeminiOutcome =
  | { kind: "skipped" }
  | { kind: "read"; extracted: ExtractedLicence }
  | { kind: "error"; detail: string };

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export async function readLicenceWithGemini(input: {
  enabled: boolean;
  apiKey: string | undefined;
  model: string;
  bytes: ArrayBuffer;
  mime: string;
  fetchImpl?: typeof fetch;
}): Promise<GeminiOutcome> {
  if (!input.enabled || !input.apiKey) return { kind: "skipped" };
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(input.model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": input.apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: LICENCE_PROMPT },
              { inline_data: { mime_type: input.mime, data: Buffer.from(input.bytes).toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 400 },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return { kind: "error", detail: `http_${res.status}` };
    const body = (await res.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } | null;
    const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const extracted = parseModelAnswer(text);
    return extracted ? { kind: "read", extracted } : { kind: "error", detail: "unparsable_answer" };
  } catch (err) {
    return { kind: "error", detail: err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network" };
  }
}
