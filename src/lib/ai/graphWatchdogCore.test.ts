/**
 * graphWatchdogCore.test.ts — TDD suite for the Auto-Syncing Legal GraphRAG
 * Watchdog debounce, mid-wipe safety guard, SHA-256 vault relink, and
 * cursor-streamed embedding pipeline.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  FAILURE_BACKOFF_MAX_MS,
  FAILURE_BACKOFF_MIN_MS,
  isEmbeddingQuotaError,
  missingVectorsFrom,
  nextFailureBackoffMs,
  nextQuotaBackoffMs,
  QUOTA_BACKOFF_MAX_MS,
  QUOTA_BACKOFF_MIN_MS,
  runGraphSyncPass,
  shouldTriggerSync,
  type GraphWatchdogBackend,
} from "./graphWatchdogCore.ts";
import type { GraphEdgePayload, GraphNodePayload } from "./graphBuilder.ts";

test("shouldTriggerSync enforces mid-wipe guard, 3-minute quiet-window debounce, and missing-vector catchup", () => {
  const now = Date.parse("2026-11-10T20:00:00Z");

  // 1. Mid-wipe safety guard (laws < 10) blocks sync so mid-reload never prunes active graph
  const wipe = shouldTriggerSync({
    dirty: true,
    lastWriteAt: "2026-11-10T19:40:00Z",
    libraryLawsCount: 3,
    missingVectors: 0,
    hasCredentials: true,
    nowMs: now,
  });
  assert.deepEqual(wipe, { trigger: false, reason: "mid_wipe_guard" });

  // 2. Active seeding (< 180s since last write) waits for quiet window
  const seeding = shouldTriggerSync({
    dirty: true,
    lastWriteAt: "2026-11-10T19:59:00Z", // 60s ago
    libraryLawsCount: 1400,
    missingVectors: 0,
    hasCredentials: true,
    nowMs: now,
    quietWindowMs: 180_000,
  });
  assert.deepEqual(seeding, { trigger: false, reason: "quiet_window_debounce" });

  // 3. Settled dirty state (>= 180s since last write) triggers sync
  const settled = shouldTriggerSync({
    dirty: true,
    lastWriteAt: "2026-11-10T19:55:00Z", // 300s ago
    libraryLawsCount: 1400,
    missingVectors: 0,
    hasCredentials: true,
    nowMs: now,
    quietWindowMs: 180_000,
  });
  assert.deepEqual(settled, { trigger: true, reason: "dirty_settled" });

  // 4. Clean state with missing embeddings + valid API key triggers catch-up
  const catchup = shouldTriggerSync({
    dirty: false,
    lastWriteAt: null,
    libraryLawsCount: 1400,
    missingVectors: 42,
    hasCredentials: true,
    nowMs: now,
  });
  assert.deepEqual(catchup, { trigger: true, reason: "missing_embeddings" });
});

test("runGraphSyncPass builds nodes & edges across all corpora, relinks vault, deduplicates SHA-256 batches, and embeds missing", async () => {
  const storedNodes = new Map<string, GraphNodePayload>();
  const storedEdges: GraphEdgePayload[] = [];
  const embeddedNodeKeys = new Set<string>();
  let embedApiCalls = 0;
  const finishPayloads: Array<Record<string, unknown>> = [];

  const mockBackend: GraphWatchdogBackend = {
    async getStatus() {
      return {
        default_model_id: "gemini-embedding-2-768",
        library_laws_count: 15,
        embeddable_nodes: storedNodes.size,
        sync_state: { dirty: true, include_feqh_vectors: false, last_write_at: "2026-11-10T19:00:00Z" },
        models: [
          {
            model_id: "gemini-embedding-2-768",
            provider: "gemini",
            api_model: "models/gemini-embedding-2-preview",
            dimensions: 4,
            task_document: "RETRIEVAL_DOCUMENT",
            task_query: "RETRIEVAL_QUERY",
            is_default: true,
            active_vectors: 0,
          },
        ],
      };
    },
    async startRun() {
      return { ok: true, run_id: 101, started_at: "2026-11-10T20:00:00Z" };
    },
    async finishRun(payload) {
      finishPayloads.push(payload);
    },
    async *streamLawBundles() {
      yield {
        law: { slug: "labor-law", title: "نظام العمل", type: "نظام", status: "active" },
        chaptersById: new Map([["ch-5", "الباب الخامس"]]),
        articles: [
          { id: "labor-law__art-77", law_slug: "labor-law", chapter_id: "ch-5", number: "77", text: "التعويض عن الفصل غير المشروع" },
          { id: "labor-law__art-80", law_slug: "labor-law", chapter_id: "ch-5", number: "80", text: "استثناءً من حكم المادة السابعة والسبعين يجوز الفسخ" },
        ],
        regulationsByArticleId: new Map(),
        amendmentsByArticleId: new Map(),
      };
    },
    async *streamPrincipleBundles() {
      yield {
        collection: { id: "col-1", title: "مجموعة المبادئ العمالية", court: "المحكمة العليا" },
        principles: [
          {
            id: "col-1__p1",
            collection_id: "col-1",
            principle_number: "1",
            text: "التعويض يستند إلى المادة (77) من نظام العمل.",
          },
        ],
      };
    },
    async *streamDecreeBundles() {
      yield [
        {
          decree: { id: "dec-1", title: "مرسوم تعديل نظام العمل", type: "مرسوم ملكي", summary_brief: "تعديل المادة (77) من نظام العمل" },
          pages: [],
        },
      ];
    },
    async *streamFeqhBundles() {
      yield {
        book: { id: "book-1", title: "المغني", author: "ابن قدامة", type: "sharia" },
        chaptersById: new Map(),
        sectionsById: new Map(),
        blocks: [{ id: "book-1__b1", book_id: "book-1", topic: "الإجارة", matn: "عقد لازم" }],
      };
    },
    async upsertNodes(rows) {
      for (const r of rows) storedNodes.set(r.node_key, r);
      return rows.length;
    },
    async upsertEdges(rows) {
      storedEdges.push(...rows);
      return rows.length;
    },
    async pruneStale() {
      return { deleted_nodes: 0, deleted_edges: 0 };
    },
    async relinkVault() {
      // Simulate 1 cached node relinked directly from embedding_vault at $0!
      const firstEmbeddable = [...storedNodes.values()].find((n) => n.is_embeddable);
      if (firstEmbeddable) embeddedNodeKeys.add(firstEmbeddable.node_key);
      return { relinked: firstEmbeddable ? 1 : 0, pruned: 0, missing: storedNodes.size - 1 };
    },
    async fetchMissingEmbeddings(_modelId, afterKey, limit) {
      return [...storedNodes.values()]
        .filter((n) => n.is_embeddable && !embeddedNodeKeys.has(n.node_key) && n.node_key > afterKey)
        .sort((a, b) => a.node_key.localeCompare(b.node_key))
        .slice(0, limit)
        .map((n) => ({
          node_key: n.node_key,
          node_type: n.node_type,
          content_sha256: n.content_sha256,
          contextual_header: n.contextual_header,
          display_text: `${n.title}\n${n.display_text}`,
        }));
    },
    async storeEmbeddings(_modelId, rows) {
      for (const r of rows) embeddedNodeKeys.add(r.node_key);
      return rows.length;
    },
  };

  const summary = await runGraphSyncPass(mockBackend, {
    triggerSource: "unit_test",
    allowSmallCorpus: true,
    env: { GEMINI_EMBEDDING_API_KEY: "fake-key" },
    embedFn: async (texts) => {
      embedApiCalls += texts.length;
      return texts.map(() => [1, 0, 0, 0]);
    },
  });

  assert.equal(summary.status, "succeeded");
  assert.ok(storedNodes.has("article:labor-law__art-77"));
  assert.ok(storedNodes.has("article:labor-law__art-80"));
  assert.ok(storedNodes.has("principle:col-1__p1"));
  assert.ok(storedNodes.has("decree:dec-1"));
  assert.ok(storedNodes.has("feqh:book-1__b1"));
  assert.equal(storedNodes.get("feqh:book-1__b1")?.is_embeddable, false, "feqh vectors disabled by default");

  assert.ok(storedEdges.some((e) => e.edge_type === "EXEMPTS_FROM"));
  assert.ok(storedEdges.some((e) => e.edge_type === "INTERPRETS_ARTICLE"));
  assert.ok(storedEdges.some((e) => e.edge_type === "AMENDS_ARTICLE"));
  assert.ok(storedEdges.some((e) => e.edge_type === "HAS_CONCEPT"));

  assert.equal(summary.vaultRelinked, 1);
  assert.ok(embedApiCalls > 0);
  assert.equal(finishPayloads[0]?.status, "succeeded");
});

// ─── Free-tier quota resilience ───────────────────────────────────────────────

/** A backend whose graph already exists: N embeddable nodes waiting for vectors. */
function quotaBackend(nodeCount: number) {
  const pending = Array.from({ length: nodeCount }, (_, i) => ({
    node_key: `article:law__art-${String(i).padStart(4, "0")}`,
    node_type: "article",
    content_sha256: `sha-${i}`,
    contextual_header: "نظام العمل",
    display_text: `نص المادة ${i}`,
  }));
  const embedded = new Set<string>();
  const calls = { streams: 0, prune: 0, relink: 0 };
  const finishes: Array<Record<string, unknown>> = [];
  const empty = async function* () {
    calls.streams++;
  };
  const backend: GraphWatchdogBackend = {
    async getStatus() {
      return {
        default_model_id: "gemini-embedding-2-768",
        library_laws_count: 4566,
        embeddable_nodes: nodeCount,
        sync_state: { dirty: false, include_feqh_vectors: false, last_write_at: null },
        models: [
          {
            model_id: "gemini-embedding-2-768",
            provider: "gemini",
            api_model: "models/gemini-embedding-2-preview",
            dimensions: 4,
            is_default: true,
            active_vectors: embedded.size,
          },
        ],
      };
    },
    async startRun() {
      return { ok: true, run_id: 7, started_at: "2026-11-13T18:00:00Z" };
    },
    async finishRun(p) {
      finishes.push(p);
    },
    streamLawBundles: empty,
    streamPrincipleBundles: empty,
    streamDecreeBundles: empty,
    streamFeqhBundles: empty,
    async upsertNodes(rows) {
      return rows.length;
    },
    async upsertEdges(rows) {
      return rows.length;
    },
    async pruneStale() {
      calls.prune++;
      return { deleted_nodes: 0, deleted_edges: 0 };
    },
    async relinkVault() {
      calls.relink++;
      return { relinked: 0, pruned: 0, missing: pending.length - embedded.size };
    },
    async fetchMissingEmbeddings(_m, afterKey, limit) {
      return pending.filter((r) => !embedded.has(r.node_key) && r.node_key > afterKey).slice(0, limit);
    },
    async storeEmbeddings(_m, rows) {
      for (const r of rows) embedded.add(r.node_key);
      return rows.length;
    },
  };
  return { backend, embedded, calls, finishes };
}

test("isEmbeddingQuotaError recognises Gemini/OpenAI rate-limit and quota failures only", () => {
  assert.equal(isEmbeddingQuotaError(new Error('Embedding HTTP 429: {"error":{"status":"RESOURCE_EXHAUSTED"}}')), true);
  assert.equal(isEmbeddingQuotaError(new Error("You exceeded your current quota, please check your plan")), true);
  assert.equal(isEmbeddingQuotaError("RESOURCE_EXHAUSTED"), true);
  assert.equal(isEmbeddingQuotaError(new Error("Embedding HTTP 400: invalid argument")), false);
  assert.equal(isEmbeddingQuotaError(new Error("library.laws read failed: timeout")), false);
  assert.equal(isEmbeddingQuotaError(null), false);
});

test("nextQuotaBackoffMs starts at 15 minutes, doubles, and caps at 6 hours", () => {
  assert.equal(QUOTA_BACKOFF_MIN_MS, 15 * 60_000);
  assert.equal(QUOTA_BACKOFF_MAX_MS, 6 * 60 * 60_000);
  assert.equal(nextQuotaBackoffMs(0), QUOTA_BACKOFF_MIN_MS);
  assert.equal(nextQuotaBackoffMs(QUOTA_BACKOFF_MIN_MS), 30 * 60_000);
  assert.equal(nextQuotaBackoffMs(4 * 60 * 60_000), QUOTA_BACKOFF_MAX_MS);
  assert.equal(nextQuotaBackoffMs(QUOTA_BACKOFF_MAX_MS), QUOTA_BACKOFF_MAX_MS);
});

test("embedOnly catch-up never re-streams the library: it only embeds the missing vectors", async () => {
  const { backend, embedded, calls } = quotaBackend(250);
  const summary = await runGraphSyncPass(backend, {
    embedOnly: true,
    env: { GEMINI_EMBEDDING_API_KEY: "fake-key" },
    embedFn: async (texts) => texts.map(() => [1, 0, 0, 0]),
  });
  assert.equal(summary.status, "succeeded");
  assert.equal(calls.streams, 0, "no library table is streamed in catch-up mode");
  assert.equal(calls.prune, 0, "nothing is pruned in catch-up mode");
  assert.equal(embedded.size, 250);
  assert.equal(summary.apiEmbedded, 250);
  assert.equal(summary.quotaPaused, undefined);
});

test("a quota error mid-embedding keeps the vectors already stored and pauses instead of failing", async () => {
  const { backend, embedded, finishes } = quotaBackend(300);
  let call = 0;
  const summary = await runGraphSyncPass(backend, {
    embedOnly: true,
    env: { GEMINI_EMBEDDING_API_KEY: "fake-key" },
    embedFn: async (texts) => {
      call++;
      if (call === 3) throw new Error('Embedding HTTP 429: {"error":{"status":"RESOURCE_EXHAUSTED"}}');
      return texts.map(() => [1, 0, 0, 0]);
    },
  });
  assert.equal(summary.status, "succeeded", "the graph is fine; only the vectors are paused");
  assert.equal(summary.quotaPaused, true);
  assert.equal(embedded.size, 200, "the first two batches stay stored");
  assert.equal(summary.apiEmbedded, 200);
  assert.equal(finishes[0]?.status, "succeeded");
  assert.match(String(finishes[0]?.error_message ?? ""), /quota/i);
});

test("skipEmbedding rebuilds the graph while the quota is paused, without calling the embedding API", async () => {
  const { backend, embedded, calls } = quotaBackend(50);
  let apiCalls = 0;
  const summary = await runGraphSyncPass(backend, {
    skipEmbedding: true,
    allowSmallCorpus: true,
    env: { GEMINI_EMBEDDING_API_KEY: "fake-key" },
    embedFn: async (texts) => {
      apiCalls++;
      return texts.map(() => [1, 0, 0, 0]);
    },
  });
  assert.equal(summary.status, "succeeded");
  assert.ok(calls.streams > 0, "the graph itself is rebuilt");
  assert.equal(calls.relink, 1, "the $0 vault relink still runs");
  assert.equal(apiCalls, 0);
  assert.equal(embedded.size, 0);
});

test("GRAPH_RAG_EMBED_BATCH_SIZE shrinks each embedding call for free-tier token-per-minute limits", async () => {
  const { backend, embedded } = quotaBackend(45);
  const callSizes: number[] = [];
  await runGraphSyncPass(backend, {
    embedOnly: true,
    env: { GEMINI_EMBEDDING_API_KEY: "fake-key", GRAPH_RAG_EMBED_BATCH_SIZE: "20" },
    embedFn: async (texts) => {
      callSizes.push(texts.length);
      return texts.map(() => [1, 0, 0, 0]);
    },
  });
  assert.deepEqual(callSizes, [20, 20, 5]);
  assert.equal(embedded.size, 45);

  // Out-of-range values fall back to safe bounds (1..100)
  const big = quotaBackend(150);
  const bigSizes: number[] = [];
  await runGraphSyncPass(big.backend, {
    embedOnly: true,
    env: { GEMINI_EMBEDDING_API_KEY: "fake-key", GRAPH_RAG_EMBED_BATCH_SIZE: "5000" },
    embedFn: async (texts) => {
      bigSizes.push(texts.length);
      return texts.map(() => [1, 0, 0, 0]);
    },
  });
  assert.deepEqual(bigSizes, [100, 50]);
});

// ─── 2026-11-14 review fixes ──────────────────────────────────────────────────

test("nextFailureBackoffMs: a failed pass waits 1 min, doubling, capped at 1 h", () => {
  assert.equal(nextFailureBackoffMs(0), FAILURE_BACKOFF_MIN_MS);
  assert.equal(nextFailureBackoffMs(FAILURE_BACKOFF_MIN_MS), 2 * FAILURE_BACKOFF_MIN_MS);
  assert.equal(nextFailureBackoffMs(FAILURE_BACKOFF_MAX_MS), FAILURE_BACKOFF_MAX_MS);
});

test("missingVectorsFrom prefers the server's missing_vectors; repealed texts are not missing", () => {
  const base = {
    default_model_id: "m",
    library_laws_count: 400,
    embeddable_nodes: 100,
    sync_state: null,
    models: [{ model_id: "m", provider: "gemini", api_model: "x", dimensions: 4, is_default: true, active_vectors: 90 }],
  };
  // 10 repealed nodes have vectors that are not "active": the old count said 10 missing forever.
  assert.equal(missingVectorsFrom({ ...base, missing_vectors: 0 }), 0);
  assert.equal(missingVectorsFrom(base), 10, "older servers: embeddable minus active");
});

test("a pass asked to stop between batches is recorded as failed, and a skipped prune is reported", async () => {
  const { backend, finishes } = quotaBackend(3);
  const stopped = await runGraphSyncPass(backend, { embedFn: async (texts) => texts.map(() => [1, 0, 0, 0]), shouldStop: () => true });
  assert.equal(stopped.status, "failed");
  assert.match(stopped.errorMessage ?? "", /shutting down/);
  assert.equal(finishes.at(-1)?.status, "failed");

  const skipping = quotaBackend(0);
  skipping.backend.pruneStale = async () => ({ deleted_nodes: 0, deleted_edges: 0, skipped: true });
  const res = await runGraphSyncPass(skipping.backend, {});
  assert.equal(res.status, "succeeded");
  assert.equal(res.pruneSkipped, true);
});
