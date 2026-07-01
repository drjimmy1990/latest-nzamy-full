import type { WebhookPayload } from "./payload";

/** Maps a namespaced RequestEvent → the n8n webhook path segment. */
const EVENT_PATH: Record<string, string> = {
  "service_request.created": "new-request",
  "service_request.status_changed": "request-status", // n8n branches on entity.status
  "service_request.completed": "request-completed",
};

/**
 * Best-effort outbound POST to n8n. Never throws — a dispatch failure must not
 * break the parent write (same contract as recordEvent in src/lib/events.ts).
 * Returns { delivered: false } and makes NO network call when
 * N8N_WEBHOOK_BASE_URL is unset (the default), so this is inert until n8n is
 * actually wired. Mirrors the live outbound pattern in
 * src/app/api/ai/library-chat/route.ts (fetch + X-Webhook-Secret).
 */
export async function dispatchToN8n(
  event: string,
  payload: WebhookPayload,
): Promise<{ delivered: boolean }> {
  const base = process.env.N8N_WEBHOOK_BASE_URL;
  if (!base) return { delivered: false };
  const path = EVENT_PATH[event];
  if (!path) return { delivered: false };
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "X-Webhook-Secret": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
      // Don't hang a request handler on a slow n8n.
      signal: AbortSignal.timeout(5000),
    });
    return { delivered: res.ok };
  } catch (err) {
    console.error("[dispatchToN8n] failed:", event, (err as Error).message);
    return { delivered: false };
  }
}
