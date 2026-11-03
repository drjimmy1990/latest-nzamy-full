/**
 * caseGraphService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for /api/v1/lawyer/case-graph/[caseId] (Phase 1,
 * public.case_graphs).
 *
 * "use client" free deliberately: CaseGraphView's own node/edge types
 * (GraphNode/GraphEdge in ./‌../../app/dashboard/business/kanban/_graph-model)
 * are exactly what round-trips here, so this module stays untyped-JSON on
 * purpose rather than importing that model and coupling two unrelated
 * directories — the canvas already treats persistence as "hand me whatever
 * you have and I'll hand it back."
 */

"use client";

import { apiGet } from "@/lib/services/api";
import { isDemoMode } from "@/lib/runtimeMode";
import { GraphSaveError, canonicalJson, kindForStatus } from "./caseGraphAutosave";

export interface CaseGraphData {
  nodes: unknown[];
  edges: unknown[];
  viewport: Record<string, unknown>;
  updatedAt: string;
}

/**
 * Saves of one case run one after another, and a read waits for them: when
 * the fullscreen board closes it flushes its last change while the inline
 * board mounts and reads — without this the read could win and show (then
 * autosave) the board as it was before that change.
 */
const inflight = new Map<string, Promise<void>>();

/**
 * CODE-F24: the version of the saved board this page last read or wrote —
 * the row's `updated_at`, kept as the exact string the server sent (never
 * through `new Date()`, which drops the microseconds and would make every
 * save a conflict). `null` = we read it and there is no row yet. A save
 * sends it; the server writes only if the row is still at that version.
 * Read when a queued save actually runs, so saves in a row chain correctly.
 */
const versions = new Map<string, string | null>();

/** `null` = no saved graph for this case yet — a real, common state, not a failure. */
export async function getCaseGraph(caseId: string): Promise<CaseGraphData | null> {
  const pending = inflight.get(caseId);
  if (pending) await pending.catch(() => undefined);
  const res = await apiGet<{ data: CaseGraphData | null }>(`/api/v1/lawyer/case-graph/${encodeURIComponent(caseId)}`);
  const data = res?.data ?? null;
  versions.set(caseId, data ? data.updatedAt : null);
  return data;
}

type GraphBody = { nodes: unknown[]; edges: unknown[]; viewport: Record<string, unknown> };

async function putGraph(caseId: string, body: GraphBody): Promise<void> {
  // Same rule as apiMutate (owner decision ١١٥): demo mode never writes.
  if (isDemoMode) {
    throw new GraphSaveError("وضع العرض التجريبي محلي بالكامل: لا يُرسَل أي حفظ أو تعديل إلى الخادم.", "fatal");
  }
  const url = `/api/v1/lawyer/case-graph/${encodeURIComponent(caseId)}`;
  const base = versions.has(caseId) ? versions.get(caseId) : undefined;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      credentials: "same-origin",
      cache: "no-store",
      // `baseUpdatedAt` left out (undefined) only if this page never read the
      // board — then the server falls back to the old unconditional write.
      body: JSON.stringify({ ...body, baseUpdatedAt: base }),
    });
  } catch {
    throw new GraphSaveError("تعذّر الاتصال بالخادم.", "retryable");
  }
  const json = (await response.json().catch(() => null)) as { updatedAt?: string; error?: string } | null;
  if (response.ok) {
    if (typeof json?.updatedAt === "string") versions.set(caseId, json.updatedAt);
    return;
  }
  if (response.status === 409) {
    // A save whose answer was lost (timeout, dropped connection) did land, so
    // its retry finds a newer version — its own. If the server holds exactly
    // what we are sending, that is not a conflict: take the version, done.
    const current = await apiGet<{ data: CaseGraphData | null }>(url).catch(() => null);
    const saved = current?.data;
    if (saved && canonicalJson({ nodes: saved.nodes, edges: saved.edges, viewport: saved.viewport })
        === canonicalJson(body)) {
      versions.set(caseId, saved.updatedAt);
      return;
    }
  }
  throw new GraphSaveError(json?.error || `API error: ${response.status}`, kindForStatus(response.status));
}

/**
 * Full replace of the saved graph, if the saved board is still the version
 * this page last saw. Throws a GraphSaveError (kind: retryable / conflict /
 * fatal) — the caller (caseGraphAutosave) turns that into a status and a
 * retry, never swallows it: a canvas that silently stops saving is the exact
 * defect this table exists to end.
 */
export async function saveCaseGraph(
  caseId: string,
  graph: { nodes: unknown[]; edges: unknown[]; viewport?: Record<string, unknown> },
): Promise<void> {
  const previous = inflight.get(caseId) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(() => putGraph(caseId, {
      nodes: graph.nodes,
      edges: graph.edges,
      viewport: graph.viewport ?? {},
    }));
  inflight.set(caseId, run);
  try {
    await run;
  } finally {
    if (inflight.get(caseId) === run) inflight.delete(caseId);
  }
}
