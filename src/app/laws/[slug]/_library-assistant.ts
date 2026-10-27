/**
 * The library assistant's one call (plan §5 L5): the chat in the law page
 * (LibraryAI) and its «اشرح لي» window (ArticleExplainModal) both POST
 * /api/v1/ai/runs with tool `library-assistant`. The server checks the library
 * gate and the tier, charges 5 points, searches the library, and answers only
 * from what it found, with the citations resolved to titles and links.
 *
 * The answer to show is always the server's: its reply and citations, or the
 * refusal it gave. Nothing here invents a reply.
 */
import { libraryAiRefusal, type LibraryAiAction } from "./_ai-reply.ts";

export interface LibraryAnswer {
  text: string;
  /** The server's citations (CitedAnswer.asCitations reads them). */
  citations: unknown[];
  action?: LibraryAiAction;
}

export const LIBRARY_AI_SOON =
  "الذكاء الاصطناعي قيد التفعيل وقريباً سيتوفر.\nحالياً يمكنك تصفح المواد والاستعانة بالفهرس والمبادئ والسوابق.";
const FALLBACK = "تعذّر الاتصال بالخادم — حاول مرة أخرى";

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export async function askLibrary(
  input: { message: string; articleId?: string | null },
  currentPath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LibraryAnswer> {
  let res: Response;
  try {
    res = await fetchImpl("/api/v1/ai/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "library-assistant",
        input: { message: input.message, article_id: input.articleId ?? null },
        idempotencyKey: newKey(),
      }),
    });
  } catch {
    return { text: FALLBACK, citations: [] };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const output = (json.output ?? null) as Record<string, unknown> | null;

  if (res.ok && typeof output?.reply === "string" && output.reply.trim()) {
    return { text: output.reply, citations: Array.isArray(json.citations) ? json.citations : [] };
  }
  // Signed out, or a tier below Pro: say what to do (the assistant's own wording).
  if (res.status === 401 || (res.status === 403 && json.code === "library_tier")) {
    const refusal = libraryAiRefusal(res.status, currentPath);
    if (refusal) return { text: refusal.text, citations: [], action: refusal.action };
  }
  // Switched off or not wired yet: the page's existing «قيد التفعيل».
  if (res.status === 423 || json.code === "not_ready") return { text: LIBRARY_AI_SOON, citations: [] };
  if (typeof json.error === "string" && json.error) return { text: json.error, citations: [] };
  const refusal = libraryAiRefusal(res.status, currentPath);
  return { text: refusal?.text ?? FALLBACK, citations: [], action: refusal?.action };
}
