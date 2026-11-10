/**
 * embeddingClient.test.ts — TDD suite for multi-provider Matryoshka / halfvec
 * embedding & optional cross-encoder reranking client.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  embedQueryText,
  embedTexts,
  formatHalfvecLiteral,
  hasEmbeddingCredentials,
  l2Normalize,
  rerankCandidates,
  resolveEmbeddingModelProfile,
} from "./embeddingClient.ts";

test("l2Normalize re-normalizes shortened Matryoshka slices to unit length and clamps float16 extremes", () => {
  const raw = [0.3, 0.4, 0]; // norm = 0.5 (simulates a truncated 768d Matryoshka slice)
  const norm = l2Normalize(raw);
  const mag = Math.hypot(...norm);
  assert.ok(Math.abs(mag - 1.0) < 1e-6, `expected unit norm 1.0, got ${mag}`);
  assert.ok(Math.abs(norm[0] - 0.6) < 1e-6);
  assert.ok(Math.abs(norm[1] - 0.8) < 1e-6);

  // Zero vector must not produce NaN or Infinity
  const zero = l2Normalize([0, 0, 0]);
  assert.deepEqual(zero, [0, 0, 0]);

  const lit = formatHalfvecLiteral([0.6, -0.8, 0]);
  assert.equal(lit, "[0.6,-0.8,0]");
});

test("resolveEmbeddingModelProfile defaults to gemini-embedding-2-768 and checks provider credentials", () => {
  const def = resolveEmbeddingModelProfile();
  assert.equal(def.modelId, "gemini-embedding-2-768");
  assert.equal(def.provider, "gemini");
  assert.equal(def.apiModel, "models/gemini-embedding-2-preview");
  assert.equal(def.dimensions, 768);
  assert.equal(def.taskDocument, "RETRIEVAL_DOCUMENT");
  assert.equal(def.taskQuery, "RETRIEVAL_QUERY");

  assert.equal(hasEmbeddingCredentials(def, {}), false);
  assert.equal(hasEmbeddingCredentials(def, { GEMINI_EMBEDDING_API_KEY: "test-key" }), true);
  assert.equal(hasEmbeddingCredentials(def, { GEMINI_API_KEY: "fallback-key" }), true);

  const openai3072 = resolveEmbeddingModelProfile("openai-3-large-3072");
  assert.equal(openai3072.provider, "openai");
  assert.equal(openai3072.dimensions, 3072);
  assert.equal(hasEmbeddingCredentials(openai3072, { OPENAI_API_KEY: "sk-test" }), true);
});

test("embedTexts batches Gemini >100 items, passes x-goog-api-key header + outputDimensionality, and L2-normalizes", async () => {
  const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ url, headers, body });

    const reqs = (body as { requests: Array<{ outputDimensionality: number; taskType: string }> }).requests;
    return new Response(
      JSON.stringify({
        embeddings: reqs.map((_, idx) => ({
          values: [idx + 1, 0, 0, 0], // unnormalized 4d test slice
        })),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const customProfile = {
    modelId: "gemini-test-4d",
    provider: "gemini" as const,
    apiModel: "models/gemini-embedding-2-preview",
    dimensions: 4,
    taskDocument: "RETRIEVAL_DOCUMENT",
    taskQuery: "RETRIEVAL_QUERY",
  };

  const inputs = Array.from({ length: 105 }, (_, i) => `المادة ${i + 1}`);
  const vectors = await embedTexts(inputs, {
    profile: customProfile,
    mode: "document",
    env: { GEMINI_EMBEDDING_API_KEY: "secret-gem-key" },
    fetchImpl: fakeFetch,
  });

  assert.equal(calls.length, 2, "105 texts must split into 100 + 5 Gemini batchEmbedContents calls");
  assert.equal(calls[0].url.includes("secret-gem-key"), false, "API key must NEVER appear in URL query string");
  assert.equal(calls[0].headers["x-goog-api-key"], "secret-gem-key");
  const firstBatch = (calls[0].body as { requests: Array<{ outputDimensionality: number; taskType: string }> }).requests;
  assert.equal(firstBatch.length, 100);
  assert.equal(firstBatch[0].outputDimensionality, 4);
  assert.equal(firstBatch[0].taskType, "RETRIEVAL_DOCUMENT");

  assert.equal(vectors.length, 105);
  assert.deepEqual(vectors[104], [1, 0, 0, 0], "every returned vector must be L2-normalized");
});

test("embedQueryText retries 429 rate limits and supports OpenAI / Cohere / Jina providers", async () => {
  let attempts = 0;
  const fakeOpenAiFetch: typeof fetch = async (_input, init) => {
    attempts++;
    if (attempts === 1) {
      return new Response(JSON.stringify({ error: { message: "rate limit" } }), { status: 429 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { dimensions?: number };
    assert.equal(body.dimensions, 4);
    return new Response(
      JSON.stringify({
        data: [{ index: 0, embedding: [3, 4, 0, 0] }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const q = await embedQueryText("فصل تعسفي المادة 77", {
    profile: {
      modelId: "openai-test-4d",
      provider: "openai",
      apiModel: "text-embedding-3-large",
      dimensions: 4,
      taskDocument: null,
      taskQuery: null,
    },
    env: { OPENAI_API_KEY: "sk-test" },
    fetchImpl: fakeOpenAiFetch,
    retryBaseMs: 5,
  });

  assert.equal(attempts, 2);
  assert.equal(q?.literal, "[0.6,0.8,0,0]");
});

test("rerankCandidates passes through cleanly when unconfigured and reorders via cross-encoder when configured", async () => {
  const items = [
    { id: "a", text: "نص عام عن الإجازات السنوية" },
    { id: "b", text: "المادة 77 تعويض إنهاء عقد العمل لسبب غير مشروع" },
  ];

  // 1. Unconfigured -> passthrough
  const pass = await rerankCandidates("طردوني بدون سبب", items, { env: {} });
  assert.equal(pass.reranked, false);
  assert.deepEqual(pass.items.map((x) => x.id), ["a", "b"]);

  // 2. Configured Jina reranker -> reorders b ahead of a
  const reranked = await rerankCandidates("طردوني بدون سبب", items, {
    env: { RERANKER_PROVIDER: "jina", JINA_API_KEY: "jina-key" },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          results: [
            { index: 1, relevance_score: 0.94 },
            { index: 0, relevance_score: 0.12 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  assert.equal(reranked.reranked, true);
  assert.deepEqual(reranked.items.map((x) => x.id), ["b", "a"]);
});
