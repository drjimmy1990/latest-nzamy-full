/**
 * graphSchemaContract.test.ts — TDD static & security contract for the
 * `library_graph` Legal GraphRAG migration, `_verify.sql`, and RLS test harness.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const MIGRATION_PATH = join(ROOT, "supabase", "migrations", "20261110_10_library_graph_rag.sql");
const VERIFY_PATH = join(ROOT, "supabase", "migrations", "_verify.sql");
const RLS_TEST_PATH = join(ROOT, "supabase", "tests", "rls", "library_graph_rag.test.sql");

const GRAPH_TABLES = [
  "embedding_models",
  "embedding_vault",
  "nodes",
  "node_embeddings",
  "edges",
  "sync_state",
  "sync_runs",
] as const;

const PUBLIC_RPCS = [
  "graph_rag_status",
  "graph_rag_set_default_model",
  "graph_rag_upsert_nodes",
  "graph_rag_upsert_edges",
  "graph_rag_prune_stale",
  "graph_rag_relink_vault",
  "graph_rag_missing_embeddings",
  "graph_rag_store_embeddings",
  "graph_rag_sync_control",
  "graph_rag_retrieve",
] as const;

test("20261110_10_library_graph_rag.sql exists and follows Nzamy transaction & SQL editor conventions", () => {
  assert.ok(existsSync(MIGRATION_PATH), "migration 20261110_10_library_graph_rag.sql must exist");
  const sql = readFileSync(MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n");

  assert.equal((sql.match(/^begin;$/gm) ?? []).length, 1, "exactly one top-level begin;");
  assert.equal((sql.match(/^commit;$/gm) ?? []).length, 1, "exactly one top-level commit;");
  assert.match(sql, /notify pgrst, 'reload schema';/);

  const afterCommit = sql.slice(sql.lastIndexOf("commit;"));
  assert.match(afterCommit, /\bas ok\s*;/, "final statement after commit must return `as ok` for SQL editor verification");
});

test("library_graph enforces strict server-only privileges, RLS on all tables, and ZERO foreign keys to library.*", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  // 1. Zero foreign keys into library.* (protects 2026-10-04_library_clean_wipe.sql TRUNCATE without CASCADE)
  assert.equal(
    /references\s+library\./i.test(sql),
    false,
    "library_graph must NEVER declare SQL FOREIGN KEY REFERENCES into library.*",
  );

  // 2. Schema lockdown
  assert.match(sql, /create extension if not exists vector with schema extensions;/i);
  assert.match(sql, /create schema if not exists library_graph;/i);
  assert.match(sql, /revoke all on schema library_graph from public, anon, authenticated/i);
  assert.match(sql, /grant usage on schema library_graph to service_role;/i);

  // 3. Every table has RLS enabled and anon/authenticated revoked
  for (const tbl of GRAPH_TABLES) {
    assert.match(
      sql,
      new RegExp(`alter table library_graph\\.${tbl}\\s+enable row level security;`, "i"),
      `RLS must be enabled on library_graph.${tbl}`,
    );
  }

  // 4. Default optimal model is gemini-embedding-2-768 (768 dims) + multi-provider catalog
  assert.match(sql, /'gemini-embedding-2-768'/);
  assert.match(sql, /'models\/gemini-embedding-2-preview'/);
  assert.match(sql, /'openai-3-large-1536'/);
  assert.match(sql, /'openai-3-large-3072'/);
  assert.match(sql, /'voyage-3-large-1024'/);
  assert.match(sql, /'cohere-embed-v4-1024'/);
  assert.match(sql, /'jina-embeddings-v3-1024'/);
  assert.match(sql, /'bge-m3-1024'/);

  // 5. Dimension-agnostic halfvec + Partial Expression HNSW index + internal helpers + public PostgREST RPCs
  assert.match(sql, /embedding\s+extensions\.halfvec\s+not null/i);
  assert.match(sql, /using hnsw \(\(embedding::extensions\.halfvec\(768\)\) extensions\.halfvec_cosine_ops\)/i);
  for (const fn of ["ensure_model_hnsw_index", "mark_library_dirty", "fold_tashkeel"]) {
    assert.match(sql, new RegExp(`create or replace function library_graph\\.${fn}\\b`, "i"), `missing helper ${fn}`);
  }
  for (const rpc of PUBLIC_RPCS) {
    assert.match(sql, new RegExp(`create or replace function public\\.${rpc}\\b`, "i"), `missing PostgREST RPC ${rpc}`);
  }
});

test("_verify.sql and RLS harness cover library_graph_rag including clean-wipe survival", () => {
  const verify = readFileSync(VERIFY_PATH, "utf8");
  assert.match(verify, /^-- >>> verify:library_graph_rag$/m);
  assert.match(verify, /^-- <<< verify:library_graph_rag$/m);

  assert.ok(existsSync(RLS_TEST_PATH), "supabase/tests/rls/library_graph_rag.test.sql must exist");
  const rls = readFileSync(RLS_TEST_PATH, "utf8");
  assert.match(rls, /truncate table library\.article_amendments/i, "RLS test must verify clean-wipe TRUNCATE survival");
  assert.match(rls, /graph_rag_relink_vault/i, "RLS test must verify zero-cost vault relinking after reload");
});

// ─── 20261115_10: graph depth ────────────────────────────────────────────────

const DEPTH_PATH = join(ROOT, "supabase", "migrations", "20261115_10_library_graph_depth.sql");
const RETRIEVE_SIG =
  "public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)";

function sqlList(sql: string, constraint: string): string[] {
  const at = sql.indexOf(`add constraint ${constraint}`);
  assert.ok(at >= 0, `${constraint} is added`);
  const body = sql.slice(at, sql.indexOf(";", at));
  return [...body.matchAll(/'([A-Za-z_]+)'/g)].map((m) => m[1]);
}

test("20261115_10 is one transaction, keeps the retrieve signature and readiness check, ends with `as ok`", () => {
  assert.ok(existsSync(DEPTH_PATH), "migration 20261115_10_library_graph_depth.sql must exist");
  const sql = readFileSync(DEPTH_PATH, "utf8").replace(/\r\n/g, "\n");

  assert.equal((sql.match(/^begin;$/gm) ?? []).length, 1, "exactly one top-level begin;");
  assert.equal((sql.match(/^commit;$/gm) ?? []).length, 1, "exactly one top-level commit;");
  assert.match(sql.slice(sql.lastIndexOf("commit;")), /\bas ok\s*;/);

  // The function bodies only: the verify block names the forbidden calls in its own checks.
  const bodies = sql.slice(sql.indexOf("-- ── 2."), sql.indexOf("-- ── Verify"));
  assert.ok(bodies.length > 1000, "function section found");
  assert.match(
    bodies,
    /create or replace function public\.graph_rag_retrieve\(\s*p_tsqueries\s+text\[\][^)]*p_enable_graph_hop boolean default true\s*\)/,
    "retrieve keeps its nine-argument signature",
  );
  assert.ok(sql.includes(RETRIEVE_SIG), "the verify block checks the same signature");
  assert.match(bodies, /last_synced_at is not null and s\.dirty = false/, "retrieve keeps the readiness check");
  assert.match(bodies, /hop2_scored/);
  assert.doesNotMatch(bodies, /pg_catalog\.(greatest|least)\(|halfvec_dims\(/);
  assert.doesNotMatch(sql, /grant execute .* to (anon|authenticated)/i, "no new grants to clients");
});

test("20261115_10 type lists are the explorer's, minus what 20261116_10 added", async () => {
  const { EXPLORER_EDGE_TYPES, EXPLORER_NODE_TYPES } = await import("./graphExplorerCore.ts");
  const sql = readFileSync(DEPTH_PATH, "utf8").replace(/\r\n/g, "\n");
  const later = new Set<string>(["term", "SUBJECT_TO", "PENALIZES", "DEFINES_TERM", "SIMILAR_TO", "REPLACED_BY", "IMPLEMENTED_BY"]);

  const nodes = sqlList(sql, "nodes_node_type_check");
  assert.deepEqual([...nodes].sort(), EXPLORER_NODE_TYPES.filter((t) => !later.has(t)).sort());
  assert.deepEqual(sqlList(sql, "node_embeddings_node_type_check").sort(), [...nodes].sort());
  assert.deepEqual(sqlList(sql, "edges_edge_type_check").sort(), EXPLORER_EDGE_TYPES.filter((t) => !later.has(t)).sort());

  const verify = readFileSync(VERIFY_PATH, "utf8");
  assert.match(verify, /^-- >>> verify:library_graph_depth$/m);
  assert.match(verify, /^-- <<< verify:library_graph_depth$/m);
  assert.ok(existsSync(join(ROOT, "supabase", "tests", "rls", "library_graph_depth.test.sql")));
});

// ─── 20261116_10: more link types ─────────────────────────────────────────────

const LINKS_PATH = join(ROOT, "supabase", "migrations", "20261116_10_library_graph_links.sql");

test("20261116_10 is one transaction, keeps the retrieve signature, adds a service_role-only builder, ends with `as ok`", () => {
  assert.ok(existsSync(LINKS_PATH), "migration 20261116_10_library_graph_links.sql must exist");
  const sql = readFileSync(LINKS_PATH, "utf8").replace(/\r\n/g, "\n");

  assert.equal((sql.match(/^begin;$/gm) ?? []).length, 1, "exactly one top-level begin;");
  assert.equal((sql.match(/^commit;$/gm) ?? []).length, 1, "exactly one top-level commit;");
  assert.match(sql.slice(sql.lastIndexOf("commit;")), /\bas ok\s*;/);

  const bodies = sql.slice(sql.indexOf("-- ── 2."), sql.indexOf("-- ── Verify"));
  assert.ok(bodies.length > 1000, "function section found");
  assert.match(
    bodies,
    /create or replace function public\.graph_rag_retrieve\(\s*p_tsqueries\s+text\[\][^)]*p_enable_graph_hop boolean default true\s*\)/,
    "retrieve keeps its nine-argument signature",
  );
  assert.ok(sql.includes(RETRIEVE_SIG), "the verify block checks the same signature");
  assert.match(bodies, /last_synced_at is not null and s\.dirty = false/, "retrieve keeps the readiness check");
  assert.match(bodies, /hop2_scored/);
  assert.match(bodies, /term_candidates/);
  assert.match(bodies, /penalty_candidates/);
  assert.doesNotMatch(bodies, /pg_catalog\.(greatest|least)\(|halfvec_dims\(/);
  assert.doesNotMatch(sql, /grant execute .* to (anon|authenticated)/i, "no grants to clients");
  assert.match(sql, /revoke all on function public\.graph_rag_build_similarity\(text, integer, jsonb\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.graph_rag_build_similarity\(text, integer, jsonb\) to service_role;/);
  assert.match(sql, /revoke all on table library_graph\.similarity_state from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /references\s+library\./i, "no foreign key into library.*");
});

test("20261116_10 routes inside graph_rag_retrieve_scoped; graph_rag_retrieve stays one nine-argument wrapper", () => {
  const sql = readFileSync(LINKS_PATH, "utf8").replace(/\r\n/g, "\n");
  const SCOPED_SIG = "public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text)";
  const ROUTE_SIG = "library_graph.route_factor(text, text, text, text, boolean, text[])";

  // One definition per name: a second graph_rag_retrieve signature would make PostgREST calls ambiguous (PGRST203).
  assert.equal((sql.match(/create or replace function public\.graph_rag_retrieve\(/g) ?? []).length, 1);
  assert.equal((sql.match(/create or replace function public\.graph_rag_retrieve_scoped\(/g) ?? []).length, 1);
  assert.match(sql, /p_enable_graph_hop boolean default true,\s*p_scope\s+text\s+default 'auto'\s*\)/);

  const wrapperAt = sql.indexOf("create or replace function public.graph_rag_retrieve(");
  const wrapper = sql.slice(wrapperAt, sql.indexOf("$$;", sql.indexOf("as $$", wrapperAt)));
  assert.match(wrapper, /return public\.graph_rag_retrieve_scoped\([\s\S]*'auto'\s*\)/, "the wrapper routes with 'auto'");

  const scopedAt = sql.indexOf("create or replace function public.graph_rag_retrieve_scoped(");
  const scoped = sql.slice(scopedAt, wrapperAt);
  assert.match(scoped, /last_synced_at is not null and s\.dirty = false/, "the readiness check moved with the body");
  for (const cte of ["q_pinned", "vote_top", "q_route", "route_laws", "rrf_primary", "hop2_scored", "'routing'"]) {
    assert.ok(scoped.includes(cte), `scoped retrieve has ${cte}`);
  }
  assert.equal((scoped.match(/library_graph\.route_factor\(/g) ?? []).length, 3, "primary, hop 1 and hop 2 are routed");
  assert.match(scoped, /'IMPLEMENTED_BY'\s+then case when e\.target_key = ts\.node_key then 0\.50 else 0\.15 end/);

  for (const sig of [SCOPED_SIG, ROUTE_SIG, RETRIEVE_SIG]) {
    assert.ok(sql.includes(`revoke all on function ${sig} from public, anon, authenticated;`), `${sig} revoked from clients`);
    assert.ok(sql.includes(`grant execute on function ${sig} to service_role;`), `${sig} granted to service_role`);
  }
});

test("20261116_10 type lists equal the explorer's node and edge types", async () => {
  const { EXPLORER_EDGE_TYPES, EXPLORER_NODE_TYPES } = await import("./graphExplorerCore.ts");
  const sql = readFileSync(LINKS_PATH, "utf8").replace(/\r\n/g, "\n");

  const nodes = sqlList(sql, "nodes_node_type_check");
  assert.deepEqual([...nodes].sort(), [...EXPLORER_NODE_TYPES].sort());
  assert.deepEqual(sqlList(sql, "node_embeddings_node_type_check").sort(), [...nodes].sort());
  assert.deepEqual(sqlList(sql, "edges_edge_type_check").sort(), [...EXPLORER_EDGE_TYPES].sort());
  assert.deepEqual(sqlList(sql, "edges_origin_check").sort(), ["auto_similarity", "auto_watchdog", "owner_curated"]);

  const verify = readFileSync(VERIFY_PATH, "utf8");
  assert.match(verify, /^-- >>> verify:library_graph_links\r?$/m);
  assert.match(verify, /^-- <<< verify:library_graph_links\r?$/m);
  assert.ok(existsSync(join(ROOT, "supabase", "tests", "rls", "library_graph_links.test.sql")));
});

test("the builder's GraphNodeType / GraphEdgeType lists match the explorer's", async () => {
  const src = readFileSync(join(ROOT, "src", "lib", "ai", "graphBuilder.ts"), "utf8");
  const { EXPLORER_EDGE_TYPES, EXPLORER_NODE_TYPES } = await import("./graphExplorerCore.ts");
  const union = (name: string) => {
    const at = src.indexOf(`export type ${name} =`);
    assert.ok(at >= 0, `${name} found`);
    return [...src.slice(at, src.indexOf(";", at)).matchAll(/"([A-Za-z_]+)"/g)].map((m) => m[1]).sort();
  };
  assert.deepEqual(union("GraphNodeType"), [...EXPLORER_NODE_TYPES].sort());
  assert.deepEqual(union("GraphEdgeType"), [...EXPLORER_EDGE_TYPES].sort());
});
