import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  enrichGraphRagStatusPayload,
  isMissingGraphRagSchema,
  parseAdminGraphRagAction,
} from "./adminGraphRagCore.ts";

const ROUTE_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "app",
  "api",
  "v1",
  "admin",
  "graph-rag",
  "route.ts",
);

test("parseAdminGraphRagAction validates switch_model, trigger_sync, and set_feqh_vectors strictly", () => {
  assert.deepEqual(
    parseAdminGraphRagAction({ action: "switch_model", modelId: "gemini-embedding-2-768" }),
    { ok: true, value: { action: "switch_model", modelId: "gemini-embedding-2-768" } },
  );
  assert.deepEqual(parseAdminGraphRagAction({ action: "trigger_sync" }), {
    ok: true,
    value: { action: "trigger_sync" },
  });
  assert.deepEqual(parseAdminGraphRagAction({ action: "set_feqh_vectors", enabled: true }), {
    ok: true,
    value: { action: "set_feqh_vectors", enabled: true },
  });

  // Reject malformed payloads
  assert.equal(parseAdminGraphRagAction(null).ok, false);
  assert.equal(parseAdminGraphRagAction({ action: "unknown" }).ok, false);
  assert.equal(parseAdminGraphRagAction({ action: "switch_model", modelId: "" }).ok, false);
  assert.equal(
    parseAdminGraphRagAction({ action: "switch_model", modelId: "bad; drop table" }).ok,
    false,
  );
  assert.equal(
    parseAdminGraphRagAction({ action: "set_feqh_vectors", enabled: "yes" }).ok,
    false,
  );
});

test("isMissingGraphRagSchema detects unapplied migration codes without masking real errors", () => {
  assert.equal(isMissingGraphRagSchema("42883", "function public.graph_rag_status() does not exist"), true);
  assert.equal(isMissingGraphRagSchema("PGRST202", "Could not find the function public.graph_rag_status"), true);
  assert.equal(isMissingGraphRagSchema("42P01", "relation does not exist"), true);
  assert.equal(isMissingGraphRagSchema("42501", "permission denied"), false);
  assert.equal(isMissingGraphRagSchema("XX000", "internal error"), false);
});

test("enrichGraphRagStatusPayload marks provider credential readiness without leaking secret keys", () => {
  const fakeSecret = "AIzaSy_FAKE_SECRET_DO_NOT_LEAK_999999";
  const env = {
    GEMINI_EMBEDDING_API_KEY: fakeSecret,
    OPENAI_API_KEY: "",
  };

  // Fallback when schema is missing before migration runs
  const fallback = enrichGraphRagStatusPayload(null, env);
  assert.equal(fallback.schemaMissing, true);
  assert.ok(Array.isArray(fallback.models) && fallback.models.length >= 6);
  const geminiDefault = fallback.models.find((m) => m.model_id === "gemini-embedding-2-768");
  const openaiModel = fallback.models.find((m) => m.model_id === "openai-3-large-1536");
  assert.equal(geminiDefault?.credentialsConfigured, true);
  assert.equal(openaiModel?.credentialsConfigured, false);
  assert.equal(JSON.stringify(fallback).includes(fakeSecret), false, "API key must never appear in payload");

  // Live DB payload enrichment
  const live = enrichGraphRagStatusPayload(
    {
      default_model_id: "gemini-embedding-2-768",
      library_laws_count: 423,
      vault_total_vectors: 18500,
      embeddable_nodes: 18500,
      node_counts: { article: 14200, principle: 1900, decree: 150, feqh: 42000, concept: 32 },
      edge_counts: { EXEMPTS_FROM: 410, CITES_ARTICLE: 3200, HAS_CONCEPT: 8900 },
      sync_state: {
        dirty: false,
        dirty_tables: [],
        last_sync_status: "succeeded",
        last_synced_at: "2026-11-10T20:00:00Z",
        include_feqh_vectors: false,
      },
      models: [
        {
          model_id: "gemini-embedding-2-768",
          provider: "gemini",
          api_model: "models/gemini-embedding-2-preview",
          dimensions: 768,
          is_default: true,
          is_active: true,
          active_vectors: 18500,
          vault_vectors: 18500,
        },
      ],
      recent_runs: [],
    },
    env,
  );
  assert.equal(live.schemaMissing, false);
  assert.equal(live.default_model_id, "gemini-embedding-2-768");
  assert.equal(live.active_provider_ready, true);
  assert.equal(live.models[0]?.credentialsConfigured, true);
  assert.equal(JSON.stringify(live).includes(fakeSecret), false);
});

test("admin/graph-rag route enforces requireStaff, private no-store headers, and logAdminAction on all 3 arms", () => {
  assert.equal(existsSync(ROUTE_PATH), true, "src/app/api/v1/admin/graph-rag/route.ts must exist");
  const src = readFileSync(ROUTE_PATH, "utf8");
  assert.ok(src.includes('await requireStaff("read")'));
  assert.ok(src.includes('await requireStaff("settings.write")'));
  assert.ok(src.includes('"Cache-Control": "private, no-store"'));
  assert.ok(src.includes('admin.rpc("graph_rag_status")'));
  assert.ok(src.includes('admin.rpc("graph_rag_set_default_model"'));
  assert.ok(src.includes('admin.rpc("graph_rag_sync_control"'));
  assert.ok(src.includes('"graph_rag_model_switched"'));
  assert.ok(src.includes('"graph_rag_sync_triggered"'));
  assert.ok(src.includes('"graph_rag_feqh_vectors_toggled"'));
});
