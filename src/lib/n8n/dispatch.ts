import type { WebhookPayload } from "./payload";

/**
 * Resolve the n8n webhook path from the event + the request's new status.
 * Matches the webhook paths on the "NZAMY · Service Requests" workflow:
 *   /new-request · /request-assigned · /request-completed
 * A status_changed event only notifies on the transitions that have a branch
 * (assigned, completed); other status changes return null (no dispatch).
 */
function resolvePath(event: string, status: string | undefined): string | null {
  if (event === "service_request.created") return "new-request";
  if (event === "service_request.completed") return "request-completed";
  if (event === "service_request.status_changed") {
    if (status === "assigned") return "request-assigned";
    if (status === "completed") return "request-completed";
    return null;
  }
  return null;
}

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
  const path = resolvePath(event, payload.entity?.status);
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

/**
 * Best-effort verification event to n8n (provider/lawyer/firm approved or
 * rejected). Same inert-until-configured + never-throw contract as
 * dispatchToN8n. Posts to `${base}/verification` — the n8n side must expose a
 * matching webhook (or N8N_WEBHOOK_BASE_URL stays unset and this is inert).
 * Called server-side from the admin verifications PATCH route.
 */
export async function dispatchVerificationToN8n(payload: {
  userId: string;
  name?: string;
  type?: string;
  status: "verified" | "rejected";
}): Promise<{ delivered: boolean }> {
  const base = process.env.N8N_WEBHOOK_BASE_URL;
  if (!base) return { delivered: false };
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/verification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "X-Webhook-Secret": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    return { delivered: res.ok };
  } catch (err) {
    console.error("[dispatchVerificationToN8n] failed:", (err as Error).message);
    return { delivered: false };
  }
}
