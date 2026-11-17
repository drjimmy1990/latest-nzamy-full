/**
 * requestPublicSummaryModel.ts — the AI half of the open-request summary line
 * (owner decision ١٩): an n8n fast tool writes one Arabic sentence from the
 * SCRUBBED description; the deterministic post-check of requestPublicSummary.ts
 * decides what is kept.
 *
 *   POST {N8N_AI_BASE_URL}/nzamy-ai/request-summary   (X-Nzamy-Key: NZAMY_AI_KEY)
 *     body  { tool: "request-summary", input: { type_label, text }, max_chars: 100 }
 *     reply 200 { summary: "<one Arabic sentence>" }   (or { result: { summary } })
 *
 * The same helper and keys as every other AI tool (src/lib/ai/n8nClient.ts).
 * It runs only when REQUEST_SUMMARY_AI=on as well — the workflow does not exist
 * on n8n yet, and until it does every request keeps its deterministic line.
 * No points are charged: it is a system task on the client's request, not a
 * tool the client uses (reported against owner decision ١٥).
 *
 * The model is given no id, no name and no account data — only the type label
 * and the scrubbed text. Any failure (not configured, timeout, HTTP error, a
 * bad reply, a line that fails the post-check) leaves the fallback.
 *
 * Pure apart from the injected call: `node --test` runs it.
 */

import type { N8nCall, N8nOutcome } from "../ai/n8nClient.ts";
import {
  PUBLIC_SUMMARY_MAX,
  fallbackPublicSummary,
  finalizePublicSummary,
  readSummaryReply,
  summaryModelInput,
  type SummarySource,
} from "./requestPublicSummary.ts";

export const REQUEST_SUMMARY_PATH = "nzamy-ai/request-summary";
/** A fast tool; this runs after the response (next/server `after`), never in the client's wait. */
export const REQUEST_SUMMARY_TIMEOUT_MS = 8000;

export interface SummaryEnv {
  REQUEST_SUMMARY_AI?: string;
  N8N_AI_BASE_URL?: string;
  NZAMY_AI_KEY?: string;
}

/** On only when switched on AND the n8n AI base + key are set. */
export function requestSummaryModelEnabled(env: SummaryEnv): boolean {
  return (
    (env.REQUEST_SUMMARY_AI ?? "").trim().toLowerCase() === "on" &&
    Boolean(env.N8N_AI_BASE_URL?.trim()) &&
    Boolean(env.NZAMY_AI_KEY?.trim())
  );
}

export type SummaryCall = (call: Pick<N8nCall, "path" | "mode" | "body" | "timeoutMs">) => Promise<N8nOutcome>;

/**
 * The model's line after the post-check, or the fallback. `source` says which:
 * "model" / "model_scrubbed" (the post-check had to remove something) /
 * "fallback".
 */
export async function modelPublicSummary(
  src: SummarySource,
  call: SummaryCall,
): Promise<{ summary: string | null; source: "model" | "model_scrubbed" | "fallback"; detail?: string }> {
  const input = summaryModelInput(src);
  if (!input) return { summary: fallbackPublicSummary(src), source: "fallback", detail: "nothing to summarise" };
  let outcome: N8nOutcome;
  try {
    outcome = await call({
      path: REQUEST_SUMMARY_PATH,
      mode: "sync",
      body: { tool: "request-summary", input, max_chars: PUBLIC_SUMMARY_MAX },
      timeoutMs: REQUEST_SUMMARY_TIMEOUT_MS,
    });
  } catch (err) {
    return { summary: fallbackPublicSummary(src), source: "fallback", detail: String((err as Error)?.message ?? err).slice(0, 200) };
  }
  if (outcome.kind !== "result") {
    return {
      summary: fallbackPublicSummary(src),
      source: "fallback",
      detail: outcome.kind === "failed" ? `${outcome.code}: ${outcome.detail}` : "unexpected 202",
    };
  }
  return finalizePublicSummary(readSummaryReply(outcome.result), src);
}
