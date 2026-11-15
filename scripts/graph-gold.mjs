#!/usr/bin/env node
/**
 * scripts/graph-gold.mjs — GraphRAG gold-set measure and switch-on gate. READ-ONLY.
 *
 *   npm run graph:gold                       # all questions of docs/graph-rag/gold-set.json
 *   npm run graph:gold -- --only=labor-01,civil-06 --repeat=3 --no-n8n
 *
 * For each question it does what a live AI run does, then measures it:
 *   1. the search phrases from n8n «lib-queries» (as the AI tools get them;
 *      --no-n8n, or n8n unreachable: the explorer's own word picker);
 *   2. the question's vector (same 2.5 s budget as a live run);
 *   3. retrieveLibrary with the graph (the AI path: named articles become
 *      seeds, then the graph, falling back to the keyword search on a miss),
 *      and retrieveLibrary without it (the keyword search alone);
 *   4. the exact graph call of step 3 again in each routing scope (auto,
 *      section, all), timed, --repeat times.
 * The expected articles are found on the server by law slug and number
 * (every version, every law copy; by law title when no slug exists).
 *
 * Prints Recall@K and Hit@K for graph vs keyword, the graph's p50/p95 per
 * scope, and GO / NO-GO against the 2,500 ms gate.
 *
 * Cold vs warm: the AI path's graph call is each question's FIRST, so the
 * database reads its pages from disk (cold) — what a new question costs a
 * live user. The scope replays repeat it at once (warm). The verdict needs
 * both under the gate and no AI-path timeout. Run it after a quiet spell: a
 * second run right away is all warm and looks better than live. Writes the full report as
 * JSON (path printed at the end; --out=<file> to choose it).
 *
 * Writes nothing to the database. Works with NZAMY_GRAPH_RAG on or off: it
 * asks the graph itself. Costs: one n8n lib-queries call and one embedding
 * per question.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { hasEmbeddingCredentials, resolveEmbeddingModelProfile } from "../src/lib/ai/embeddingClient.ts";
import { deriveLabQueries } from "../src/lib/ai/graphExplorerCore.ts";
import {
  expectNumbers,
  formatGoldReport,
  gateVerdict,
  GOLD_GATE_MS,
  hitRate,
  idsWithPhrase,
  meanRecall,
  parseGoldSet,
  scoreAnswer,
  summarizeTimings,
} from "../src/lib/ai/graphGoldCore.ts";
import { embedQueryWithin } from "../src/lib/ai/graphRagSwitch.ts";
import { callN8n } from "../src/lib/ai/n8nClient.ts";
import { cleanQueries, retrieveLibrary } from "../src/lib/ai/retrieval.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadDotEnvFile(filepath) {
  if (!existsSync(filepath)) return;
  for (const rawLine of readFileSync(filepath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
const args = process.argv.slice(2);
// --env-file=<path>: read the environment from another checkout's file first.
const envFileArg = args.find((a) => a.startsWith("--env-file="));
if (envFileArg) loadDotEnvFile(resolve(envFileArg.slice("--env-file=".length)));
loadDotEnvFile(join(ROOT, ".env.local"));
loadDotEnvFile(join(ROOT, ".env"));

const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const goldPath = resolve(ROOT, opt("file", "docs/graph-rag/gold-set.json"));
const only = new Set(String(opt("only", "")).split(",").map((s) => s.trim()).filter(Boolean));
const repeat = Math.max(1, Math.min(10, Number(opt("repeat", "1")) || 1));
const useN8n = !flag("no-n8n");
const SCOPES = ["auto", "section", "all"];
// The AI tools' usual counts (tools.ts): K articles, 4 principles.
const PRINCIPLES = 4;
// Scope replays get more than the gate, so a slow call is measured, not cut.
const REPLAY_TIMEOUT_MS = 10_000;

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!supabaseUrl || !serviceKey) {
  console.error("[graph-gold] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local).");
  process.exit(2);
}
const admin = createSupabaseClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const gold = parseGoldSet(JSON.parse(readFileSync(goldPath, "utf8")));
const items = gold.items.filter((i) => only.size === 0 || only.has(i.id));
if (items.length === 0) {
  console.error("[graph-gold] no question matches --only.");
  process.exit(2);
}
const K = Number(opt("k", String(gold.k))) || gold.k;

/**
 * Every article id an expectation accepts: all versions, all law copies (by
 * title when no slug exists), whose text holds one of its phrases.
 */
async function resolveExpect(e) {
  let slugs = [];
  if (e.laws.length) {
    const { data, error } = await admin.schema("library").from("laws").select("slug").in("slug", e.laws);
    if (error) throw new Error(`laws by slug: ${error.code} ${error.message}`);
    slugs = (data ?? []).map((r) => r.slug);
  }
  if (slugs.length === 0 && e.law_title) {
    const { data, error } = await admin.schema("library").from("laws").select("slug").eq("title", e.law_title).limit(5);
    if (error) throw new Error(`laws by title: ${error.code} ${error.message}`);
    slugs = (data ?? []).map((r) => r.slug);
  }
  if (slugs.length === 0) return new Set();
  const { data, error } = await admin
    .schema("library")
    .from("articles")
    .select("id, text, original_text")
    .in("law_slug", slugs)
    .in("number", expectNumbers(e))
    .limit(50);
  if (error) throw new Error(`articles: ${error.code} ${error.message}`);
  return idsWithPhrase(data ?? [], e.must_contain);
}

async function searchPhrases(question) {
  if (useN8n) {
    const runId = randomUUID();
    const asked = await callN8n({
      baseUrl: process.env.N8N_AI_BASE_URL,
      key: process.env.NZAMY_AI_KEY,
      path: "nzamy-ai/lib-queries",
      mode: "sync",
      body: { v: 1, run_id: runId, tool: "lib-queries", input: { text: question } },
      timeoutMs: 15_000,
    });
    const reply = asked.kind === "result" && asked.result && typeof asked.result === "object" ? asked.result : null;
    const queries = reply && reply.status === "succeeded" && reply.output ? cleanQueries(reply.output.queries) : [];
    if (queries.length) return { queries, source: "n8n" };
  }
  return { queries: cleanQueries(deriveLabQueries(question, [])), source: "derived" };
}

const articleIdsOf = (out) => Object.values(out.map).filter((s) => s.kind === "article").map((s) => s.id);

async function timedRpc(fn, rpcArgs) {
  const started = Date.now();
  const call = admin.rpc(fn, rpcArgs).abortSignal(AbortSignal.timeout(REPLAY_TIMEOUT_MS));
  try {
    const { data, error } = await call;
    const ms = Date.now() - started;
    return { ms, ok: !error && data && data.ready === true, error: error ? error.code || "error" : data?.ready === true ? null : "not_ready" };
  } catch {
    return { ms: Date.now() - started, ok: false, error: "timeout" };
  }
}

const profile = resolveEmbeddingModelProfile();
const canEmbed = hasEmbeddingCredentials(profile);
console.log(
  `[graph-gold] ${items.length} questions · K=${K} · repeat ${repeat} · phrases ${useN8n ? "n8n (fallback: derived)" : "derived"} · vectors ${canEmbed ? profile.modelId : "OFF (no credentials)"}`,
);

const rows = [];
const report = [];
const unresolved = [];
const scopeMs = Object.fromEntries(SCOPES.map((s) => [s, []]));
const scopeFail = Object.fromEntries(SCOPES.map((s) => [s, 0]));
const aiGraphMs = [];
let aiTimeouts = 0;

for (const item of items) {
  const resolved = [];
  for (const e of item.expect) {
    const ids = await resolveExpect(e);
    if (ids.size === 0) unresolved.push(`${item.id} (${e.law_title || e.laws[0]} ${e.article})`);
    resolved.push(ids);
  }

  const { queries, source } = await searchPhrases(item.question);
  const emb = canEmbed ? await embedQueryWithin(item.question) : null;
  const limits = { laws: K, principles: PRINCIPLES };
  const pin = { question: item.question };

  let trace = null;
  const gStarted = Date.now();
  const withGraph = await retrieveLibrary(admin, queries, limits, pin, undefined, {
    useGraph: true,
    queryEmbedding: emb?.literal ?? null,
    modelId: emb?.modelId ?? null,
    onTrace: (t) => (trace = t),
  });
  const gMs = Date.now() - gStarted;
  const kStarted = Date.now();
  const keywordOnly = await retrieveLibrary(admin, queries, limits, pin);
  const kMs = Date.now() - kStarted;

  if (trace?.graphMs != null) aiGraphMs.push(trace.graphMs);
  // Any failed graph call counts (a timeout, a Postgres error, a cut-off
  // request); a graph that answered with nothing, or is not ready yet, did not fail.
  if (trace?.graphMiss && trace.graphMiss !== "no_hits" && trace.graphMiss !== "not_ready") aiTimeouts++;

  // The same graph call in each scope. Before 20261117_10 the call had no
  // seeds (graph_rag_retrieve); its scoped twin takes the same arguments.
  const replays = {};
  if (trace?.graphArgs) {
    const base = { ...trace.graphArgs };
    for (const scope of SCOPES) {
      replays[scope] = [];
      for (let i = 0; i < repeat; i++) {
        const r = await timedRpc("graph_rag_retrieve_scoped", { ...base, p_scope: scope });
        replays[scope].push(r);
        if (r.ok) scopeMs[scope].push(r.ms);
        else scopeFail[scope]++;
      }
    }
  }

  const g = scoreAnswer(articleIdsOf(withGraph), resolved, K);
  const kw = scoreAnswer(articleIdsOf(keywordOnly), resolved, K);
  const row = { id: item.id, named: item.named === true, graph: g, keyword: kw, path: trace?.path ?? "keyword", graphMiss: trace?.graphMiss ?? null };
  rows.push(row);
  report.push({
    ...row,
    question: item.question,
    queries,
    queries_source: source,
    vector: Boolean(emb),
    seeds: trace?.seeds ?? [],
    graph_fn: trace?.graphFn ?? null,
    graph_ms: trace?.graphMs ?? null,
    // What the user waits for: named-article lookups, the graph (or its
    // fallback) and the source texts; graph_ms is the graph call alone.
    retrieve_ms: { ai_path_total: gMs, keyword_only: kMs },
    routing: trace?.routing ?? null,
    graph_articles: articleIdsOf(withGraph).slice(0, K),
    keyword_articles: articleIdsOf(keywordOnly).slice(0, K),
    expected: item.expect.map((e, i) => ({ ...e, resolved_ids: [...resolved[i]] })),
    scope_replays: replays,
  });
  const mark = (s) => s.ranks.map((x) => (x === null ? "✗" : `#${x}`)).join(",");
  console.log(`  ${item.id.padEnd(16)} graph ${mark(g).padEnd(8)} keyword ${mark(kw).padEnd(8)} ${row.path}${row.graphMiss ? ` (${row.graphMiss})` : ""} · graph ${trace?.graphMs ?? "—"} ms`);
}

const scopes = Object.fromEntries(SCOPES.map((s) => [s, summarizeTimings(scopeMs[s], scopeFail[s])]));
const aiGraph = summarizeTimings(aiGraphMs, aiTimeouts);
console.log("");
for (const line of formatGoldReport({ rows, k: K, scopes, aiGraph, unresolved, status: gold.status })) console.log(line);

const answered = rows.filter((r) => r.path === "graph").length;
const verdict = gateVerdict({ "ai-path": aiGraph, ...scopes }, answered);
const out = resolve(opt("out", join(tmpdir(), `nzamy-graph-gold-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)));
writeFileSync(
  out,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      gold_status: gold.status,
      gold_version: gold.version,
      k: K,
      repeat,
      gate_ms: GOLD_GATE_MS,
      verdict,
      totals: {
        recall: { graph: meanRecall(rows.map((r) => r.graph)), keyword: meanRecall(rows.map((r) => r.keyword)) },
        hit: { graph: hitRate(rows.map((r) => r.graph)), keyword: hitRate(rows.map((r) => r.keyword)) },
        graph_answered: answered,
        questions: rows.length,
      },
      timings: { ai_graph_call: aiGraph, scopes },
      unresolved,
      items: report,
    },
    null,
    2,
  ),
);
console.log(`\n[graph-gold] full report: ${out}`);
process.exit(verdict.go ? 0 : 1);
