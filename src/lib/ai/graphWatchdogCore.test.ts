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
  embedConcurrencyFrom,
  isEmbeddingQuotaError,
  missingVectorsFrom,
  nextFailureBackoffMs,
  nextQuotaBackoffMs,
  QUOTA_BACKOFF_MAX_MS,
  QUOTA_BACKOFF_MIN_MS,
  runGraphSyncPass,
  runSimilarityStep,
  shouldTriggerSync,
  SIMILARITY_PAGE_DEFAULT,
  similarityPageFrom,
  similarityParamsFrom,
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
  const order: string[] = [];

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
      // library_graph.edges has foreign keys on both ends: an edge written
      // before its nodes fails the whole batch on the server.
      for (const r of rows) {
        assert.ok(storedNodes.has(r.source_key), `edge source ${r.source_key} written before its node`);
        assert.ok(storedNodes.has(r.target_key), `edge target ${r.target_key} written before its node`);
      }
      storedEdges.push(...rows);
      return rows.length;
    },
    async pruneStale() {
      order.push("prune");
      return { deleted_nodes: 0, deleted_edges: 0 };
    },
    async resolveOwnerEdges() {
      order.push("owner_edges");
      return { owner_edges: 3, by_status: { resolved: 2, held_flagged: 1 }, graph_edges: 2, upserted: 2, removed: 0, status_changed: 3 };
    },
    async relinkVault() {
      order.push("relink");
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

  // The law's outline: never embedded, linked article → chapter → law, and in reading order.
  assert.equal(storedNodes.get("law:labor-law")?.is_embeddable, false);
  assert.equal(storedNodes.get("chapter:ch-5")?.is_embeddable, false);
  const link = (t: string, s: string, d: string) =>
    storedEdges.some((e) => e.edge_type === t && e.source_key === s && e.target_key === d);
  assert.ok(link("PART_OF", "article:labor-law__art-77", "chapter:ch-5"));
  assert.ok(link("PART_OF", "chapter:ch-5", "law:labor-law"));
  assert.ok(link("NEXT_ARTICLE", "article:labor-law__art-77", "article:labor-law__art-80"));

  assert.equal(summary.vaultRelinked, 1);
  assert.ok(embedApiCalls > 0);
  assert.equal(finishPayloads[0]?.status, "succeeded");

  // 20261130_40: the owner's links are re-resolved after the prune (a re-keyed
  // node's edge comes back), and the counts land in the run's details.
  assert.deepEqual(order, ["prune", "relink", "owner_edges"]);
  assert.deepEqual((finishPayloads[0]?.details as Record<string, unknown>)?.owner_edges, {
    owner_edges: 3, by_status: { resolved: 2, held_flagged: 1 }, graph_edges: 2, upserted: 2, removed: 0, status_changed: 3,
  });

  // A failing resolver never fails the graph pass: logged, retried next pass.
  mockBackend.resolveOwnerEdges = async () => {
    throw new Error("statement timeout");
  };
  const again = await runGraphSyncPass(mockBackend, {
    triggerSource: "unit_test",
    allowSmallCorpus: true,
    env: { GEMINI_EMBEDDING_API_KEY: "fake-key" },
    embedFn: async (texts) => texts.map(() => [1, 0, 0, 0]),
  });
  assert.equal(again.status, "succeeded");
  assert.deepEqual((finishPayloads.at(-1)?.details as Record<string, unknown>)?.owner_edges, { error: "statement timeout" });

  // Before the migration the backend answers null: nothing recorded.
  mockBackend.resolveOwnerEdges = async () => null;
  await runGraphSyncPass(mockBackend, { triggerSource: "unit_test", allowSmallCorpus: true, env: {}, embedFn: async (t) => t.map(() => [1, 0, 0, 0]) });
  assert.equal("owner_edges" in ((finishPayloads.at(-1)?.details as Record<string, unknown>) ?? {}), false);
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

test("GRAPH_RAG_EMBED_CONCURRENCY sends several embedding calls at once and stores every vector", async () => {
  assert.equal(embedConcurrencyFrom(undefined), 1);
  assert.equal(embedConcurrencyFrom("0"), 1);
  assert.equal(embedConcurrencyFrom("abc"), 1);
  assert.equal(embedConcurrencyFrom("6"), 6);
  assert.equal(embedConcurrencyFrom("500"), 16, "capped");

  const { backend, embedded } = quotaBackend(1050);
  const fetchLimits: number[] = [];
  const fetchMissing = backend.fetchMissingEmbeddings.bind(backend);
  backend.fetchMissingEmbeddings = async (m, after, limit) => {
    fetchLimits.push(limit);
    return fetchMissing(m, after, limit);
  };
  let inFlight = 0;
  let maxInFlight = 0;
  const callSizes: number[] = [];
  const summary = await runGraphSyncPass(backend, {
    embedOnly: true,
    env: { GEMINI_EMBEDDING_API_KEY: "fake-key", GRAPH_RAG_EMBED_CONCURRENCY: "4" },
    embedFn: async (texts) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      callSizes.push(texts.length);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return texts.map(() => [1, 0, 0, 0]);
    },
  });
  assert.equal(summary.status, "succeeded");
  assert.equal(embedded.size, 1050);
  assert.equal(summary.apiEmbedded, 1050);
  assert.equal(maxInFlight, 4, "four calls in flight per round");
  assert.ok(callSizes.every((n) => n <= 100), "each call stays within 100 texts");
  assert.ok(fetchLimits.every((n) => n <= 250), "the DB is asked for at most 250 rows at a time");
});

test("with concurrency, a quota error in one call keeps the round's other vectors and pauses", async () => {
  const { backend, embedded } = quotaBackend(400);
  let call = 0;
  const summary = await runGraphSyncPass(backend, {
    embedOnly: true,
    env: { GEMINI_EMBEDDING_API_KEY: "fake-key" },
    embedConcurrency: 4,
    embedFn: async (texts) => {
      call++;
      if (call === 2) throw new Error('Embedding HTTP 429: {"error":{"status":"RESOURCE_EXHAUSTED"}}');
      return texts.map(() => [1, 0, 0, 0]);
    },
  });
  assert.equal(summary.status, "succeeded");
  assert.equal(summary.quotaPaused, true);
  assert.equal(embedded.size, 300, "the three calls that succeeded are stored");
  assert.equal(summary.apiEmbedded, 300);
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

// ─── 20261116 batch: terms, penalties, repeals, vector links ──────────────────

test("a pass writes term nodes, DEFINES_TERM, law-level PENALIZES and SUPERSEDES_LAW, each after its nodes", async () => {
  const storedNodes = new Map<string, GraphNodePayload>();
  const storedEdges: GraphEdgePayload[] = [];
  const backend: GraphWatchdogBackend = {
    async getStatus() {
      return {
        default_model_id: "m",
        library_laws_count: 15,
        embeddable_nodes: 0,
        sync_state: { dirty: true, include_feqh_vectors: false, last_write_at: "2026-11-16T09:00:00Z" },
        models: [{ model_id: "m", provider: "gemini", api_model: "x", dimensions: 4, task_document: "D", task_query: "Q", is_default: true, active_vectors: 0 }],
      };
    },
    async startRun() {
      return { ok: true, run_id: 7, started_at: "2026-11-16T10:00:00Z" };
    },
    async finishRun() {},
    async *streamLawBundles() {
      yield {
        law: { slug: "old-labor", title: "نظام العمل والعمال", type: "نظام", status: "repealed" },
        chaptersById: new Map(),
        articles: [{ id: "old-labor__art-1", law_slug: "old-labor", number: "1", text: "حكم قديم" }],
        regulationsByArticleId: new Map(),
        amendmentsByArticleId: new Map(),
      };
      yield {
        law: { slug: "labor-law", title: "نظام العمل", type: "نظام", status: "active" },
        chaptersById: new Map(),
        articles: [
          {
            id: "labor-law__art-1",
            law_slug: "labor-law",
            number: "1",
            text: [
              "يقصد بالألفاظ الآتية المعاني المبينة أمامها:",
              "العامل: كل شخص طبيعي يعمل لمصلحة صاحب عمل وتحت إدارته أو إشرافه مقابل أجر.",
            ].join("\n"),
          },
          { id: "labor-law__art-230", law_slug: "labor-law", number: "230", text: "يعاقب كل من يخالف أحكام هذا النظام بغرامة لا تزيد على خمسين ألف ريال" },
          {
            id: "labor-law__art-245",
            law_slug: "labor-law",
            number: "245",
            text: "يلغي هذا النظام نظام العمل والعمال الصادر بالمرسوم الملكي رقم (م/21) وتاريخ 6/9/1389هـ",
          },
        ],
        regulationsByArticleId: new Map(),
        amendmentsByArticleId: new Map(),
      };
    },
    async *streamPrincipleBundles() {},
    async *streamDecreeBundles() {},
    async *streamFeqhBundles() {},
    async upsertNodes(rows) {
      for (const r of rows) storedNodes.set(r.node_key, r);
      return rows.length;
    },
    async upsertEdges(rows) {
      for (const r of rows) {
        assert.ok(storedNodes.has(r.source_key), `edge source ${r.source_key} written before its node`);
        assert.ok(storedNodes.has(r.target_key), `edge target ${r.target_key} written before its node`);
      }
      storedEdges.push(...rows);
      return rows.length;
    },
    async pruneStale() {
      return { deleted_nodes: 0, deleted_edges: 0 };
    },
    async relinkVault() {
      return { relinked: 0, pruned: 0, missing: 0 };
    },
    async fetchMissingEmbeddings() {
      return [];
    },
    async storeEmbeddings() {
      return 0;
    },
  };

  const summary = await runGraphSyncPass(backend, { triggerSource: "unit_test", allowSmallCorpus: true, skipEmbedding: true, env: {} });
  assert.equal(summary.status, "succeeded", summary.errorMessage);

  const term = storedNodes.get("term:العامل");
  assert.ok(term, "the defined term has a node");
  assert.equal(term.node_type, "term");
  assert.equal(term.is_embeddable, true);
  const link = (t: string, s: string, d: string) =>
    storedEdges.some((e) => e.edge_type === t && e.source_key === s && e.target_key === d);
  assert.ok(link("DEFINES_TERM", "article:labor-law__art-1", "term:العامل"));
  assert.ok(link("PENALIZES", "article:labor-law__art-230", "law:labor-law"));
  assert.ok(link("SUPERSEDES_LAW", "law:labor-law", "law:old-labor"));
  assert.ok(!storedEdges.some((e) => e.edge_type === "PENALIZES" && e.source_key !== "article:labor-law__art-230"));
});

test("similarityParamsFrom keeps only thresholds strictly between 0 and 1; similarityPageFrom clamps", () => {
  assert.deepEqual(
    similarityParamsFrom({
      GRAPH_RAG_SIMILAR_ARTICLE_MIN: "0.82",
      GRAPH_RAG_SIMILAR_PRINCIPLE_MIN: "1",
      GRAPH_RAG_REPLACED_SUCCESSOR_MIN: "abc",
      GRAPH_RAG_REPLACED_ANY_MIN: " ",
    }),
    { article_min: 0.82 },
  );
  assert.deepEqual(similarityParamsFrom({}), {});
  assert.equal(similarityPageFrom(undefined), SIMILARITY_PAGE_DEFAULT);
  assert.equal(similarityPageFrom("40"), 40);
  assert.equal(similarityPageFrom("9999"), 500);
  assert.equal(similarityPageFrom("-3"), SIMILARITY_PAGE_DEFAULT);
});

test("runSimilarityStep pages until a short page, the time budget, or a stop", async () => {
  const pages = [150, 150, 40];
  const calls: Array<[string, number, object]> = [];
  const backend = {
    async buildSimilarity(modelId: string, limit: number, params: object) {
      calls.push([modelId, limit, params]);
      const processed = pages.shift() ?? 0;
      return { processed, similar: processed * 2, replaced: 1 };
    },
  };
  const done = await runSimilarityStep(backend, { modelId: "m", timeBudgetMs: 60_000, params: { article_min: 0.9 } });
  assert.deepEqual(done, { processed: 340, similar: 680, replaced: 3, done: true, calls: 3 });
  assert.deepEqual(calls[0], ["m", SIMILARITY_PAGE_DEFAULT, { article_min: 0.9 }]);

  // The budget is spent after the first full page: not done, resumes next time.
  let t = 0;
  const slow = { async buildSimilarity() { t += 30_000; return { processed: 10, similar: 0, replaced: 0 }; } };
  const partial = await runSimilarityStep(slow, { modelId: "m", timeBudgetMs: 25_000, pageSize: 10, now: () => t });
  assert.equal(partial.done, false);
  assert.equal(partial.calls, 1);

  const stopped = await runSimilarityStep(slow, { modelId: "m", timeBudgetMs: 25_000, shouldStop: () => true });
  assert.equal(stopped.calls, 0);

  // An older backend without the RPC: nothing to do.
  assert.equal((await runSimilarityStep({}, { modelId: "m", timeBudgetMs: 1 })).done, true);
});

test("a pass writes each law's section, the library's IMPLEMENTED_BY links and every collection's routing labels", async () => {
  const storedNodes = new Map<string, GraphNodePayload>();
  const storedEdges: GraphEdgePayload[] = [];
  const law = (slug: string, title: string, section: string) => ({ slug, title, type: "نظام", status: "active", section_code: section });
  const backend: GraphWatchdogBackend = {
    async getStatus() {
      return {
        default_model_id: "m",
        library_laws_count: 15,
        embeddable_nodes: 0,
        sync_state: { dirty: true, include_feqh_vectors: false, last_write_at: "2026-11-16T09:00:00Z" },
        models: [{ model_id: "m", provider: "gemini", api_model: "x", dimensions: 4, task_document: "D", task_query: "Q", is_default: true, active_vectors: 0 }],
      };
    },
    async startRun() {
      return { ok: true, run_id: 8, started_at: "2026-11-16T10:00:00Z" };
    },
    async finishRun() {},
    async *streamLawBundles() {
      yield {
        law: law("labor-law", "نظام العمل", "06"),
        chaptersById: new Map(),
        articles: [
          { id: "labor-law__art-1", law_slug: "labor-law", number: "1", text: "أحكام عامة" },
          { id: "labor-law__art-2", law_slug: "labor-law", number: "2", text: "ساعات العمل" },
        ],
        regulationsByArticleId: new Map([
          [
            "labor-law__art-2",
            [
              { article_id: "labor-law__art-2", text: "تفصيل ساعات العمل", ref: "اللائحة التنفيذية لنظام العمل", reg_num: "5" },
              { article_id: "labor-law__art-2", text: "فقرة", ref: "اللائحة التنفيذية لنظام العمل", reg_num: "5/2" },
            ],
          ],
        ]),
        amendmentsByArticleId: new Map(),
      };
      yield {
        law: law("labor-reg", "اللائحة التنفيذية لنظام العمل", "06"),
        chaptersById: new Map(),
        articles: [{ id: "labor-reg__art-5", law_slug: "labor-reg", number: "5", text: "تفصيل ساعات العمل" }],
        regulationsByArticleId: new Map(),
        amendmentsByArticleId: new Map(),
      };
      yield {
        law: law("bank-law", "نظام مراقبة البنوك", "08"),
        chaptersById: new Map(),
        articles: [{ id: "bank-law__art-1", law_slug: "bank-law", number: "1", text: "البنوك" }],
        regulationsByArticleId: new Map(),
        amendmentsByArticleId: new Map(),
      };
    },
    async *streamPrincipleBundles() {
      yield {
        collection: { id: "bankc", title: "مبادئ تسوية المنازعات المصرفية", court: "لجنة تسوية المنازعات المصرفية", track: "semi" },
        principles: [{ id: "bp1", collection_id: "bankc", text: "يلتزم البنك بالعقد" }],
      };
      // One collection over two pages (the real backend pages by 250): its
      // laws are learned from both pages together — each page alone has one
      // citation, below the two a law needs.
      const labc = { id: "labc", title: "مدونة المبادئ العمالية", court: "الهيئة العليا لتسوية الخلافات العمالية", track: "ordinary" };
      yield {
        collection: labc,
        principles: [
          { id: "lp1", collection_id: "labc", text: "استناداً إلى المادة 2 من نظام العمل" },
          { id: "lp3", collection_id: "labc", text: "مبدأ بلا إحالة" },
        ],
      };
      yield {
        collection: labc,
        principles: [{ id: "lp2", collection_id: "labc", text: "وفقاً للمادة 2 من نظام العمل" }],
      };
      yield {
        collection: { id: "bogc", title: "مجموعة الأحكام والمبادئ التجارية لعام 1437هـ", court: "ديوان المظالم", track: "admin" },
        principles: [{ id: "gp1", collection_id: "bogc", text: "مبدأ تجاري" }],
      };
    },
    async *streamDecreeBundles() {},
    async *streamFeqhBundles() {},
    async upsertNodes(rows) {
      for (const r of rows) storedNodes.set(r.node_key, r);
      return rows.length;
    },
    async upsertEdges(rows) {
      for (const r of rows) {
        assert.ok(storedNodes.has(r.source_key), `edge source ${r.source_key} written before its node`);
        assert.ok(storedNodes.has(r.target_key), `edge target ${r.target_key} written before its node`);
      }
      storedEdges.push(...rows);
      return rows.length;
    },
    async pruneStale() {
      return { deleted_nodes: 0, deleted_edges: 0 };
    },
    async relinkVault() {
      return { relinked: 0, pruned: 0, missing: 0 };
    },
    async fetchMissingEmbeddings() {
      return [];
    },
    async storeEmbeddings() {
      return 0;
    },
  };

  const summary = await runGraphSyncPass(backend, { triggerSource: "unit_test", allowSmallCorpus: true, skipEmbedding: true, env: {} });
  assert.equal(summary.status, "succeeded", summary.errorMessage);

  assert.equal(storedNodes.get("law:labor-law")?.metadata.section_code, "06");
  assert.equal(storedNodes.get("law:bank-law")?.metadata.section_code, "08");

  const implemented = storedEdges.filter((e) => e.edge_type === "IMPLEMENTED_BY");
  assert.deepEqual(
    implemented.map((e) => [e.source_key, e.target_key]),
    [["article:labor-law__art-2", "article:labor-reg__art-5"]],
    "one link per whole regulation article; the paragraph «5/2» is not one",
  );

  const meta = (k: string) => storedNodes.get(k)?.metadata ?? {};
  assert.equal(meta("principle:bp1").track_class, "semi");
  assert.deepEqual(meta("principle:bp1").committee_families, ["banking"]);
  assert.deepEqual(meta("principle:bp1").governing_laws, ["bank-law"], "the banking committee applies the banking law");
  assert.equal(meta("principle:lp3").track_class, "ordinary");
  for (const k of ["principle:lp1", "principle:lp2", "principle:lp3"]) {
    assert.deepEqual(meta(k).governing_laws, ["labor-law"], `${k}: learned from the whole collection's citations, on every principle`);
  }
  assert.equal(meta("principle:gp1").track_class, "admin");
  assert.equal(meta("principle:gp1").subject_section, "04");
  assert.equal(meta("principle:gp1").governing_laws, undefined);
});

test("runSimilarityStep refreshes the replacements once first; a failed refresh does not stop the links", async () => {
  let refreshes = 0;
  const pages = [10, 3];
  const backend = {
    async refreshReplacements() {
      refreshes++;
      return { changed_laws: 1, reset: 4 };
    },
    async buildSimilarity() {
      return { processed: pages.shift() ?? 0, similar: 0, replaced: 1 };
    },
  };
  const step = await runSimilarityStep(backend, { modelId: "m", timeBudgetMs: 60_000, pageSize: 10 });
  assert.equal(refreshes, 1, "once per step, not once per page");
  assert.equal(step.refreshed, 4);
  assert.equal(step.calls, 2);

  const quiet = await runSimilarityStep(
    { async refreshReplacements() { return { changed_laws: 0, reset: 0 }; }, async buildSimilarity() { return { processed: 0, similar: 0, replaced: 0 }; } },
    { modelId: "m", timeBudgetMs: 1 },
  );
  assert.equal(quiet.refreshed, undefined, "nothing reset: nothing to report");

  const failing = await runSimilarityStep(
    { async refreshReplacements(): Promise<{ changed_laws: number; reset: number }> { throw new Error("timeout"); }, async buildSimilarity() { return { processed: 2, similar: 1, replaced: 0 }; } },
    { modelId: "m", timeBudgetMs: 60_000 },
  );
  assert.equal(failing.refreshError, "timeout");
  assert.equal(failing.processed, 2, "the similarity pages still ran");
});

test("a pass turns the owner's links into SUPERSEDES_LAW and AMENDS_ARTICLE edges, and skips what names no single law", async () => {
  const storedNodes = new Map<string, GraphNodePayload>();
  const storedEdges: GraphEdgePayload[] = [];
  const finished: Array<Record<string, unknown>> = [];
  const bundle = (law: Record<string, unknown>, numbers: string[]) => ({
    law: { type: "نظام", section_code: "00", ...law } as never,
    chaptersById: new Map(),
    articles: numbers.map((n) => ({ id: `${law.slug}__art-${n}`, law_slug: law.slug as string, number: n, text: `نص المادة ${n}` })),
    regulationsByArticleId: new Map(),
    amendmentsByArticleId: new Map(),
  });
  const backend: GraphWatchdogBackend = {
    async getStatus() {
      return {
        default_model_id: "m",
        library_laws_count: 2,
        embeddable_nodes: 0,
        sync_state: { dirty: true, include_feqh_vectors: false, last_write_at: "2026-11-18T09:00:00Z" },
        models: [{ model_id: "m", provider: "gemini", api_model: "x", dimensions: 4, task_document: "D", task_query: "Q", is_default: true, active_vectors: 0 }],
      };
    },
    async startRun() {
      return { ok: true, run_id: 9, started_at: "2026-11-18T10:00:00Z" };
    },
    async finishRun(p) {
      finished.push(p);
    },
    async *streamLawBundles() {
      yield bundle({ slug: "old-notary", title: "لائحة كتاب العدل", status: "repealed",
        owner_links: [{ kind: "repealed_by", name: "نظام التوثيق" }, { kind: "related", name: "نظام آخر" }] }, ["1"]);
      yield bundle({ slug: "notary", title: "نظام التوثيق", status: "active" }, ["1", "3"]);
    },
    async *streamPrincipleBundles() {},
    async *streamDecreeBundles() {
      yield [{
        decree: {
          id: "d1", title: "مرسوم ملكي بتعديل نظام التوثيق", type: "royal", summary: "تعديل المادة الثالثة",
          owner_links: [
            { kind: "affects", slug: "notary", articles: ["3"] },
            { kind: "affects", name: "نظام لا وجود له", articles: ["1"] },
          ],
        },
        pages: [],
      }];
    },
    async *streamFeqhBundles() {},
    async upsertNodes(rows) {
      for (const r of rows) storedNodes.set(r.node_key, r);
      return rows.length;
    },
    async upsertEdges(rows) {
      for (const r of rows) {
        assert.ok(storedNodes.has(r.source_key), `edge source ${r.source_key} written before its node`);
        assert.ok(storedNodes.has(r.target_key), `edge target ${r.target_key} written before its node`);
      }
      storedEdges.push(...rows);
      return rows.length;
    },
    async pruneStale() {
      return { deleted_nodes: 0, deleted_edges: 0 };
    },
    async relinkVault() {
      return { relinked: 0, pruned: 0, missing: 0 };
    },
    async fetchMissingEmbeddings() {
      return [];
    },
    async storeEmbeddings() {
      return 0;
    },
  };

  const summary = await runGraphSyncPass(backend, { triggerSource: "unit_test", allowSmallCorpus: true, skipEmbedding: true, env: {} });
  assert.equal(summary.status, "succeeded", summary.errorMessage);

  const owner = storedEdges.filter((e) => (e.metadata as Record<string, unknown> | undefined)?.source === "owner_links");
  assert.deepEqual(
    owner.map((e) => [e.edge_type, e.source_key, e.target_key]).sort(),
    [
      ["AMENDS_ARTICLE", "decree:d1", "article:notary__art-3"],
      ["SUPERSEDES_LAW", "law:notary", "law:old-notary"],
    ],
    "the successor replaces the repealed law; the decree amends article 3; the unknown law and the related link make no edge",
  );
  // The reading is kept in the run's details for the explorer's status tab (20261119_10).
  const details = finished[0]?.details as Record<string, unknown> | undefined;
  const stats = details?.owner_links as Record<string, unknown> | undefined;
  assert.ok(stats, "finishRun details carry owner_links");
  assert.equal(stats.links, 4, "two law links + two decree links read");
  assert.equal(stats.edges, 2);
  assert.equal(stats.notFound, 1, "the decree's unknown law");
});
