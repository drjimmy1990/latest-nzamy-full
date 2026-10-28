/**
 * The assistant page's one call (plan §5 L4): POST /api/v1/ai/runs with tool
 * `assistant`. The server keeps the conversation: it hands back a
 * conversationId on the first message, reads the earlier turns itself for the
 * next ones, charges the first message for up to five (D3), and answers each
 * one only from the library texts it found.
 *
 * Nothing here invents a reply: the text is the server's answer or the
 * server's refusal.
 */

export interface AssistantAnswer {
  ok: boolean;
  text: string;
  citations: unknown[];
  /** Present once the server has started (or continued) a conversation. */
  conversationId?: string;
  chargedPoints?: number;
  /** The server's code on a refusal (conversation_full, no_sources…). */
  code?: string;
}

const FALLBACK = "تعذّر الاتصال بالخادم — حاول مرة أخرى";

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export async function askAssistant(
  input: { message: string; context: string; conversationId: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<AssistantAnswer> {
  let res: Response;
  try {
    res = await fetchImpl("/api/v1/ai/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "assistant",
        input: { message: input.message, context: input.context },
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        idempotencyKey: newKey(),
      }),
    });
  } catch {
    return { ok: false, text: FALLBACK, citations: [] };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const output = (json.output ?? null) as Record<string, unknown> | null;
  const conversationId = typeof json.conversationId === "string" ? json.conversationId : undefined;
  const code = typeof json.code === "string" ? json.code : undefined;

  if (res.ok && typeof output?.reply === "string" && output.reply.trim()) {
    return {
      ok: true,
      text: output.reply,
      citations: Array.isArray(json.citations) ? json.citations : [],
      conversationId,
      chargedPoints: typeof json.chargedPoints === "number" ? json.chargedPoints : 0,
    };
  }
  if (res.status === 401) return { ok: false, text: "سجّل الدخول لاستخدام المستشار الذكي", citations: [], code };
  return { ok: false, text: typeof json.error === "string" && json.error ? json.error : FALLBACK, citations: [], conversationId, code };
}
