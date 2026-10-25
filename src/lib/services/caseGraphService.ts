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

import { apiGet, apiMutate } from "@/lib/services/api";

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

/** `null` = no saved graph for this case yet — a real, common state, not a failure. */
export async function getCaseGraph(caseId: string): Promise<CaseGraphData | null> {
  const pending = inflight.get(caseId);
  if (pending) await pending.catch(() => undefined);
  const res = await apiGet<{ data: CaseGraphData | null }>(`/api/v1/lawyer/case-graph/${encodeURIComponent(caseId)}`);
  return res?.data ?? null;
}

/**
 * Full replace of the saved graph. Throws on failure — the caller (an
 * autosave loop) is responsible for turning that into a "تعذّر الحفظ" status,
 * not for swallowing it: a canvas that silently stops saving is the exact
 * defect this table exists to end.
 */
export async function saveCaseGraph(
  caseId: string,
  graph: { nodes: unknown[]; edges: unknown[]; viewport?: Record<string, unknown> },
): Promise<void> {
  const previous = inflight.get(caseId) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(() => apiMutate(`/api/v1/lawyer/case-graph/${encodeURIComponent(caseId)}`, "PUT", {
      nodes: graph.nodes,
      edges: graph.edges,
      viewport: graph.viewport ?? {},
    }))
    .then(() => undefined);
  inflight.set(caseId, run);
  try {
    await run;
  } finally {
    if (inflight.get(caseId) === run) inflight.delete(caseId);
  }
}
