/**
 * graphWatchdogCore.test.ts — TDD suite for the Auto-Syncing Legal GraphRAG
 * Watchdog debounce, mid-wipe safety guard, SHA-256 vault relink, and
 * cursor-streamed embedding pipeline.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
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
