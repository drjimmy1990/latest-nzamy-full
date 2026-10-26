/**
 * n8nClient.ts — the one call from the app to an n8n AI workflow (plan §2.1,
 * §2.2). Header Auth: `X-Nzamy-Key: <NZAMY_AI_KEY>`, which n8n's Webhook node
 * checks before any node runs.
 *
 *   fast tool → n8n answers on the same connection with «Respond to Webhook»
 *               200 {result}; the app waits up to FAST_TIMEOUT_MS.
 *   job tool  → n8n answers 202 {accepted, run_id} at once and sends the
 *               result to /api/v1/ai/callback later.
 *
 * Anything else — not configured, a network error, a timeout, another status,
 * a body that is not JSON — is a failure, and the caller refunds the run.
 *
 * Pure: the fetch is injected, so `node --test` runs it.
 */

export type N8nOutcome =
  | { kind: "result"; result: unknown }
  | { kind: "accepted" }
  | { kind: "failed"; code: "n8n_unconfigured" | "n8n_unreachable" | "timeout" | "n8n_http" | "bad_reply"; detail: string };

export interface N8nCall {
  baseUrl: string | undefined;
  key: string | undefined;
  path: string;
  mode: "sync" | "async";
  body: unknown;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export async function callN8n(call: N8nCall): Promise<N8nOutcome> {
  const base = call.baseUrl?.trim();
  const key = call.key?.trim();
  if (!base || !key) return { kind: "failed", code: "n8n_unconfigured", detail: "N8N_AI_BASE_URL or NZAMY_AI_KEY is unset" };
  const url = `${base.replace(/\/+$/, "")}/${call.path.replace(/^\/+/, "")}`;
  const doFetch = call.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nzamy-Key": key },
      body: JSON.stringify(call.body),
      signal: AbortSignal.timeout(call.timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { kind: "failed", code: "timeout", detail: `no answer within ${call.timeoutMs} ms` };
    }
    return { kind: "failed", code: "n8n_unreachable", detail: String((err as Error)?.message ?? err).slice(0, 200) };
  }

  if (call.mode === "async") {
    // The 202 is all a job tool's webhook says; its body is not needed.
    await res.body?.cancel().catch(() => {});
    return res.status === 202 ? { kind: "accepted" } : { kind: "failed", code: "n8n_http", detail: `HTTP ${res.status}` };
  }

  if (res.status !== 200) {
    await res.body?.cancel().catch(() => {});
    return { kind: "failed", code: "n8n_http", detail: `HTTP ${res.status}` };
  }
  try {
    return { kind: "result", result: await res.json() };
  } catch {
    return { kind: "failed", code: "bad_reply", detail: "the reply is not JSON" };
  }
}
