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
