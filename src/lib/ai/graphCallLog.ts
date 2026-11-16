/**
 * graphCallLog.ts — one row per graph call, so the explorer's status tab can
 * show how often customers get a graph answer and why it falls back
 * (20261121_10: library_graph.call_log, public.graph_rag_log_call).
 *
 * What a row holds: where the call came from, which path answered, the
 * graph's time and miss reason, the seed count, and the lab's options. Never
 * the question, never a user id, never the embedding (`graphArgs` carries it:
 * only booleans and limits are read from it).
 *
 * Writing never throws and is never awaited on an answer's path: a missing
 * function (before 20261121_10) or a slow database costs nothing but the row.
 *
 * Pure relative `.ts` imports so `node --test` executes it natively.
 */

import type { RetrieveGraphOptions, RetrieveTrace } from "./retrieval.ts";

export type GraphCallSource = "ai_run" | "graph_api" | "lab";

export interface GraphCallRow {
  source: GraphCallSource;
  path: "graph" | "keyword" | "error";
  graph_fn: string | null;
  graph_ms: number | null;
  graph_miss: string | null;
  seed_count: number;
  vector_used: boolean;
  scope: string | null;
  decrees: boolean;
  feqh: boolean;
  size: string | null;
  links: boolean;
  route_section: string | null;
  route_source: string | null;
  route_confident: boolean | null;
}

/** The smallest client shape the writer needs (the Supabase service client fits). */
export interface GraphCallLogClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { code?: string; message?: string } | null }>;
}

function shortText(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function positiveNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function routingFields(routing: unknown): Pick<GraphCallRow, "route_section" | "route_source" | "route_confident"> {
  if (!routing || typeof routing !== "object" || Array.isArray(routing)) {
    return { route_section: null, route_source: null, route_confident: null };
  }
  const r = routing as Record<string, unknown>;
  return {
    route_section: shortText(r.section, 10),
    route_source: shortText(r.source, 10),
    route_confident: typeof r.confident === "boolean" ? r.confident : null,
  };
}

/** A log row from retrieval's trace. Reads only booleans and limits from `graphArgs`. */
export function graphCallRowFromTrace(source: GraphCallSource, trace: RetrieveTrace): GraphCallRow {
  const args = trace.graphArgs ?? {};
  return {
    source,
    path: trace.path === "graph" ? "graph" : "keyword",
    graph_fn: shortText(trace.graphFn, 60),
    graph_ms: typeof trace.graphMs === "number" && Number.isFinite(trace.graphMs) ? Math.max(0, Math.round(trace.graphMs)) : null,
    graph_miss: shortText(trace.graphMiss, 40),
    seed_count: Array.isArray(trace.seeds) ? trace.seeds.length : 0,
    vector_used: typeof args.p_query_embedding === "string" && args.p_query_embedding.length > 0,
    scope: shortText(args.p_scope, 20) ?? (trace.graphFn ? "auto" : null),
    decrees: positiveNumber(args.p_limit_decrees),
    feqh: positiveNumber(args.p_limit_feqh),
    size: null,
    links: args.p_enable_graph_hop !== false,
    ...routingFields(trace.routing),
  };
}

/** Writes one row. Never throws; resolves false when the row was not kept. */
export async function logGraphCall(client: GraphCallLogClient, row: GraphCallRow): Promise<boolean> {
  try {
    const { error } = await client.rpc("graph_rag_log_call", { p_row: row });
    return !error;
  } catch {
    return false;
  }
}

/**
 * The retrieval options with a trace hook that logs the call, keeping any
 * hook the caller already set (graph:gold). Undefined stays undefined: with
 * the graph off nothing is asked, so nothing is logged.
 */
export function withGraphCallLog(
  options: RetrieveGraphOptions | undefined,
  client: GraphCallLogClient,
  source: GraphCallSource,
): RetrieveGraphOptions | undefined {
  if (!options?.useGraph) return options;
  const previous = options.onTrace;
  return {
    ...options,
    onTrace: (trace) => {
      try {
        previous?.(trace);
      } catch {
        /* measurement only */
      }
      // Not awaited: the answer never waits for its log row.
      void logGraphCall(client, graphCallRowFromTrace(source, trace));
    },
  };
}

// ─── The explorer's live numbers (graph_rag_explore_live_stats) ───────────────

export interface LiveLabFailure {
  at: string | null;
  miss: string | null;
  ms: number | null;
  scope: string | null;
  decrees: boolean;
  feqh: boolean;
  size: string | null;
  links: boolean;
  vector_used: boolean;
  seed_count: number;
}

export interface ExplorerLiveStats {
  hours: number;
  logging_since: string | null;
  customer: {
    total: number;
    graph: number;
    keyword: number;
    vector_used: number;
    by_reason: Record<string, number>;
    by_source: Record<string, number>;
    graph_ms_p50: number | null;
    graph_ms_p95: number | null;
    graph_ms_max: number | null;
  };
  lab: {
    total: number;
    failed: number;
    timeouts: number;
    graph_ms_p95: number | null;
    recent_failures: LiveLabFailure[];
  };
}

/** The window choices the status tab offers, in hours. */
export const LIVE_WINDOWS = [24, 168] as const;

function liveObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function liveCount(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function liveMs(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function liveCounts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(liveObj(v) ?? {})) {
    const c = liveCount(n);
    if (c > 0) out[k.slice(0, 40)] = c;
  }
  return out;
}

/** Reads graph_rag_explore_live_stats(); every field defaults, so a partial answer never breaks the tab. */
export function parseExplorerLiveStats(raw: unknown): ExplorerLiveStats {
  const r = liveObj(raw) ?? {};
  const c = liveObj(r.customer) ?? {};
  const l = liveObj(r.lab) ?? {};
  const failures = Array.isArray(l.recent_failures) ? l.recent_failures : [];
  return {
    hours: liveCount(r.hours) || 24,
    logging_since: typeof r.logging_since === "string" ? r.logging_since : null,
    customer: {
      total: liveCount(c.total),
      graph: liveCount(c.graph),
      keyword: liveCount(c.keyword),
      vector_used: liveCount(c.vector_used),
      by_reason: liveCounts(c.by_reason),
      by_source: liveCounts(c.by_source),
      graph_ms_p50: liveMs(c.graph_ms_p50),
      graph_ms_p95: liveMs(c.graph_ms_p95),
      graph_ms_max: liveMs(c.graph_ms_max),
    },
    lab: {
      total: liveCount(l.total),
      failed: liveCount(l.failed),
      timeouts: liveCount(l.timeouts),
      graph_ms_p95: liveMs(l.graph_ms_p95),
      recent_failures: failures.slice(0, 10).map((f) => {
        const o = liveObj(f) ?? {};
        return {
          at: typeof o.at === "string" ? o.at : null,
          miss: typeof o.miss === "string" ? o.miss.slice(0, 40) : null,
          ms: liveMs(o.ms),
          scope: typeof o.scope === "string" ? o.scope.slice(0, 20) : null,
          decrees: o.decrees === true,
          feqh: o.feqh === true,
          size: typeof o.size === "string" ? o.size.slice(0, 10) : null,
          links: o.links !== false,
          vector_used: o.vector_used === true,
          seed_count: liveCount(o.seed_count),
        };
      }),
    },
  };
}

/** Arabic for why the graph did not answer (retrieval.ts trace, the lab's error codes). */
export function graphMissLabel(miss: string): string {
  switch (miss) {
    case "timeout":
      return "تجاوز مهلة المساعد (ثانيتان ونصف)";
    case "57014":
      return "تجاوز مهلة قاعدة البيانات";
    case "not_ready":
      return "الجراف يُعاد بناؤه";
    case "no_hits":
      return "لم يجد الجراف نتيجة";
    case "error":
      return "خطأ";
    default:
      return `خطأ (${miss})`;
  }
}

/** A share as a whole percent, «—» with nothing to divide. */
export function livePercent(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}٪` : "—";
}
