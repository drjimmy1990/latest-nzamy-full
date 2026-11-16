/**
 * graphCallLog.test.ts — the graph call log (20261121_10): rows hold counts
 * and timings only (never the embedding, the question or a user), writing
 * never throws, and the explorer's live numbers parse safely.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  graphCallRowFromTrace,
  graphMissLabel,
  livePercent,
  logGraphCall,
  parseExplorerLiveStats,
  withGraphCallLog,
  type GraphCallLogClient,
} from "./graphCallLog.ts";
import { parseExplorerRequest } from "./graphExplorerCore.ts";
import type { RetrieveTrace } from "./retrieval.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const EMBEDDING = "[0.0123,-0.0456,0.0789]";

function trace(over: Partial<RetrieveTrace> = {}): RetrieveTrace {
  return {
    path: "graph",
    graphFn: "graph_rag_retrieve_scoped",
    graphMs: 412.6,
    graphMiss: null,
    seeds: ["law:labor:77"],
    routing: { section: "07", source: "vote", confident: true, laws: ["labor"] },
    graphArgs: {
      p_tsqueries: ["فصل & تعسفي"],
      p_query_embedding: EMBEDDING,
      p_model_id: "gemini-embedding-2-768",
      p_law_slug: "labor",
      p_limit_laws: 10,
      p_limit_principles: 4,
      p_limit_decrees: 0,
      p_limit_feqh: 2,
      p_enable_graph_hop: true,
      p_scope: "auto",
      p_seed_keys: ["law:labor:77"],
    },
    ...over,
  };
}

function recorder(behaviour: "ok" | "error" | "throw" | "reject" = "ok") {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client: GraphCallLogClient = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      if (behaviour === "throw") throw new Error("boom");
      if (behaviour === "reject") return Promise.reject(new Error("network"));
      return Promise.resolve({ error: behaviour === "error" ? { code: "PGRST202", message: "missing" } : null });
    },
  };
  return { client, calls };
}

test("a row from the trace holds counts and timings, never the embedding, the search text or the law", () => {
  const row = graphCallRowFromTrace("ai_run", trace());
  assert.deepEqual(row, {
    source: "ai_run",
    path: "graph",
    graph_fn: "graph_rag_retrieve_scoped",
    graph_ms: 413,
    graph_miss: null,
    seed_count: 1,
    vector_used: true,
    scope: "auto",
    decrees: false,
    feqh: true,
    size: null,
    links: true,
    route_section: "07",
    route_source: "vote",
    route_confident: true,
  });
  const json = JSON.stringify(row);
  for (const secret of [EMBEDDING, "0.0123", "فصل", "labor:77", "gemini"]) {
    assert.ok(!json.includes(secret), `the row must not carry ${secret}`);
  }
});

test("a fallback keeps its reason; a call the graph never got has no time and no vector", () => {
  const miss = graphCallRowFromTrace("graph_api", trace({ path: "keyword", graphMiss: "timeout", graphMs: 2500 }));
  assert.equal(miss.path, "keyword");
  assert.equal(miss.graph_miss, "timeout");
  assert.equal(miss.source, "graph_api");

  const none = graphCallRowFromTrace("ai_run", {
    path: "keyword",
    graphFn: null,
    graphMs: null,
    graphMiss: null,
    seeds: [],
    routing: null,
    graphArgs: null,
  });
  assert.equal(none.graph_ms, null);
  assert.equal(none.vector_used, false);
  assert.equal(none.scope, null);
  assert.equal(none.route_section, null);
  assert.equal(none.route_confident, null);
});

test("long or odd values are cut: miss reason to 40, function name to 60", () => {
  const row = graphCallRowFromTrace("ai_run", trace({ graphMiss: "x".repeat(300), graphFn: "f".repeat(300), graphMs: -5 }));
  assert.equal(row.graph_miss?.length, 40);
  assert.equal(row.graph_fn?.length, 60);
  assert.equal(row.graph_ms, 0);
});

test("logGraphCall writes graph_rag_log_call and never throws", async () => {
  const ok = recorder("ok");
  assert.equal(await logGraphCall(ok.client, graphCallRowFromTrace("ai_run", trace())), true);
  assert.equal(ok.calls[0].fn, "graph_rag_log_call");
  assert.ok(!JSON.stringify(ok.calls[0].args).includes(EMBEDDING));

  for (const b of ["error", "throw", "reject"] as const) {
    const r = recorder(b);
    assert.equal(await logGraphCall(r.client, graphCallRowFromTrace("ai_run", trace())), false, b);
  }
});

test("withGraphCallLog: off stays off, the caller's own hook still runs, and a broken log changes nothing", async () => {
  const r = recorder("ok");
  assert.equal(withGraphCallLog(undefined, r.client, "ai_run"), undefined);
  const off = { useGraph: false };
  assert.equal(withGraphCallLog(off, r.client, "ai_run"), off);

  const seen: RetrieveTrace[] = [];
  const opts = withGraphCallLog({ useGraph: true, queryEmbedding: EMBEDDING, onTrace: (t) => seen.push(t) }, r.client, "ai_run");
  assert.equal(opts?.queryEmbedding, EMBEDDING, "the retrieval still gets its embedding");
  opts?.onTrace?.(trace());
  assert.equal(seen.length, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].args.p_row && (r.calls[0].args.p_row as { source: string }).source, "ai_run");

  // A throwing earlier hook and a throwing / rejecting client: the trace call itself never throws.
  for (const b of ["throw", "reject"] as const) {
    const bad = recorder(b);
    const o = withGraphCallLog(
      {
        useGraph: true,
        onTrace: () => {
          throw new Error("caller hook");
        },
      },
      bad.client,
      "graph_api",
    );
    assert.doesNotThrow(() => o?.onTrace?.(trace()));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(bad.calls.length, 1, `${b}: the log was still attempted`);
  }
});

test("parseExplorerLiveStats defaults every field and keeps lab failures' options", () => {
  const empty = parseExplorerLiveStats(null);
  assert.equal(empty.hours, 24);
  assert.equal(empty.customer.total, 0);
  assert.deepEqual(empty.customer.by_reason, {});
  assert.equal(empty.customer.graph_ms_p95, null);
  assert.deepEqual(empty.lab.recent_failures, []);

  const s = parseExplorerLiveStats({
    hours: 168,
    logging_since: "2026-11-16T10:00:00Z",
    customer: {
      total: 10,
      graph: 8,
      keyword: 2,
      vector_used: 9,
      by_reason: { timeout: 1, no_hits: 1, junk: "x", neg: -3 },
      by_source: { ai_run: 9, graph_api: 1 },
      graph_ms_p50: 371.4,
      graph_ms_p95: "637.2",
      graph_ms_max: 738,
    },
    lab: {
      total: 4,
      failed: 1,
      timeouts: 1,
      recent_failures: [{ at: "2026-11-15T19:32:29Z", miss: "57014", ms: 4001, scope: "all", decrees: true, feqh: true, size: "3", links: true }],
    },
  });
  assert.equal(s.hours, 168);
  assert.deepEqual(s.customer.by_reason, { timeout: 1, no_hits: 1 });
  assert.equal(s.customer.graph_ms_p50, 371);
  assert.equal(s.customer.graph_ms_p95, 637);
  assert.equal(s.lab.recent_failures[0].miss, "57014");
  assert.equal(s.lab.recent_failures[0].feqh, true);
  assert.equal(s.lab.recent_failures[0].scope, "all");
  assert.equal(s.lab.recent_failures[0].vector_used, false);
});

test("labels and percentages", () => {
  assert.equal(graphMissLabel("timeout"), "تجاوز مهلة المساعد (ثانيتان ونصف)");
  assert.equal(graphMissLabel("57014"), "تجاوز مهلة قاعدة البيانات");
  assert.equal(graphMissLabel("no_hits"), "لم يجد الجراف نتيجة");
  assert.equal(graphMissLabel("PGRST301"), "خطأ (PGRST301)");
  assert.equal(livePercent(8, 10), "80٪");
  assert.equal(livePercent(1, 0), "—");
});

test("parseExplorerRequest: live clamps its window to 1–720 hours", () => {
  const p = (q: string) => parseExplorerRequest(new URLSearchParams(q));
  assert.deepEqual(p("action=live"), { ok: true, value: { action: "live", hours: 24 } });
  assert.deepEqual(p("action=live&hours=168"), { ok: true, value: { action: "live", hours: 168 } });
  assert.deepEqual(p("action=live&hours=99999"), { ok: true, value: { action: "live", hours: 720 } });
  assert.deepEqual(p("action=live&hours=0"), { ok: true, value: { action: "live", hours: 1 } });
});

test("every graph caller logs, the lab logs its options and failures, and none awaits the log", () => {
  const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
  const runs = read("src/app/api/v1/ai/runs/route.ts");
  assert.ok(runs.includes('withGraphCallLog(opts ?? { useGraph: true }, admin, "ai_run")'));
  const service = read("src/lib/ai/graphService.ts");
  assert.ok(service.includes('withGraphCallLog(options, client, "graph_api")'));
  const route = read("src/app/api/v1/admin/graph-explorer/route.ts");
  assert.ok(route.includes('void logGraphCall(admin, labRow("error"'), "a lab failure is logged before the error answer");
  assert.ok(route.includes('void logGraphCall(admin, labRow("graph"'), "a lab success is logged");
  assert.ok(route.includes('admin.rpc("graph_rag_explore_live_stats", { p_hours: req.hours })'));
  assert.ok(route.includes("missing(LIVE_MIGRATION)"));
  for (const src of [runs, service, route]) assert.ok(!/await\s+logGraphCall/.test(src), "the answer never waits for its log row");
});

test("20261121_10: no question, user or embedding column; service_role only; 30-day retention", () => {
  const sql = readFileSync(join(ROOT, "supabase", "migrations", "20261121_10_library_graph_call_log.sql"), "utf8").replace(/\r\n/g, "\n");
  const table = sql.slice(sql.indexOf("create table if not exists library_graph.call_log"), sql.indexOf("create index"));
  for (const col of ["question", "user_id", "embedding", "query", "text"]) {
    assert.ok(!new RegExp(`\\n\\s+${col}\\s`).test(table), `call_log must not have a ${col} column`);
  }
  assert.ok(sql.includes("alter table library_graph.call_log enable row level security;"));
  assert.ok(sql.includes("revoke all on table library_graph.call_log from public, anon, authenticated;"));
  assert.ok(sql.includes("revoke all on function public.graph_rag_log_call(jsonb) from public, anon, authenticated;"));
  assert.ok(sql.includes("revoke all on function public.graph_rag_explore_live_stats(integer) from public, anon, authenticated;"));
  assert.ok(sql.includes("interval '30 days'"));
  assert.ok(sql.includes("raise notice '20261121_10 verify: OK'"));
  assert.ok(/^begin;$/m.test(sql) && /^commit;$/m.test(sql));
  const verify = readFileSync(join(ROOT, "supabase", "migrations", "_verify.sql"), "utf8");
  assert.ok(verify.includes("-- >>> verify:library_graph_call_log"));
});
