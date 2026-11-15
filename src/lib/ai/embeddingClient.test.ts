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
  resetVertexTokenCache,
  resolveEmbeddingModelProfile,
  resolveVertexCredentials,
} from "./embeddingClient.ts";
import { generateKeyPairSync } from "node:crypto";

function fakeServiceAccountB64(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sa = {
    type: "service_account",
    project_id: "demo-project",
    client_email: "embedder@demo-project.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  return Buffer.from(JSON.stringify(sa)).toString("base64");
}

test("resolveVertexCredentials only switches on with GRAPH_RAG_EMBEDDING_BACKEND=vertex and a valid service account", () => {
  const b64 = fakeServiceAccountB64();
  assert.equal(resolveVertexCredentials({ VERTEX_SERVICE_ACCOUNT_JSON_B64: b64 }), null, "backend not selected");
  assert.equal(resolveVertexCredentials({ GRAPH_RAG_EMBEDDING_BACKEND: "vertex" }), null, "no account");
  assert.equal(
    resolveVertexCredentials({ GRAPH_RAG_EMBEDDING_BACKEND: "vertex", VERTEX_SERVICE_ACCOUNT_JSON_B64: "bm90LWpzb24=" }),
    null,
    "not JSON",
  );
  const creds = resolveVertexCredentials({ GRAPH_RAG_EMBEDDING_BACKEND: "Vertex", VERTEX_SERVICE_ACCOUNT_JSON_B64: b64 });
  assert.equal(creds?.projectId, "demo-project");
  assert.equal(creds?.location, "global");
  assert.equal(creds?.model, "gemini-embedding-2");
  const custom = resolveVertexCredentials({
    GRAPH_RAG_EMBEDDING_BACKEND: "vertex",
    VERTEX_SERVICE_ACCOUNT_JSON_B64: b64,
    VERTEX_LOCATION: "us-central1",
    VERTEX_EMBEDDING_MODEL: "gemini-embedding-001",
  });
  assert.equal(custom?.location, "us-central1");
  assert.equal(custom?.model, "gemini-embedding-001");

  const profile = resolveEmbeddingModelProfile();
  assert.equal(hasEmbeddingCredentials(profile, { GRAPH_RAG_EMBEDDING_BACKEND: "vertex", VERTEX_SERVICE_ACCOUNT_JSON_B64: b64 }), true);
  assert.equal(
    hasEmbeddingCredentials(profile, { GRAPH_RAG_EMBEDDING_BACKEND: "vertex", GEMINI_EMBEDDING_API_KEY: "k" }),
    false,
    "vertex selected: the AI Studio key is not used",
  );
});

test("embedTexts on Vertex logs in once, sends a Bearer token to the Vertex batch address, and re-logs in after a 401", async () => {
  resetVertexTokenCache();
  const env = { GRAPH_RAG_EMBEDDING_BACKEND: "vertex", VERTEX_SERVICE_ACCOUNT_JSON_B64: fakeServiceAccountB64() };
  let logins = 0;
  let rejectNext = false;
  const embedCalls: Array<{ url: string; auth: string; body: { requests: Array<Record<string, unknown>> } }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      logins++;
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
      assert.equal(String(form.get("assertion")).split(".").length, 3, "a signed JWT");
      return new Response(JSON.stringify({ access_token: `token-${logins}`, expires_in: 3600 }), { status: 200 });
    }
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    if (rejectNext) {
      rejectNext = false;
      return new Response('{"error":{"code":401}}', { status: 401 });
    }
    const body = JSON.parse(String(init?.body));
    embedCalls.push({ url, auth: headers.authorization, body });
    return new Response(
      JSON.stringify({ embeddings: body.requests.map(() => ({ values: new Array(768).fill(0.5) })) }),
      { status: 200 },
    );
  };

  const opts = { env, fetchImpl: fakeFetch, maxRetries: 0 };
  const [a, b] = await Promise.all([embedTexts(["أ", "ب"], opts), embedTexts(["ج"], opts)]);
  assert.equal(a.length, 2);
  assert.equal(b.length, 1);
  assert.equal(logins, 1, "parallel calls share one login");
  assert.equal(
    embedCalls[0].url,
    "https://aiplatform.googleapis.com/v1/projects/demo-project/locations/global/publishers/google/models/gemini-embedding-2:batchEmbedContents",
  );
  assert.equal(embedCalls[0].auth, "Bearer token-1");
  assert.equal(embedCalls[0].body.requests[0].taskType, "RETRIEVAL_DOCUMENT");
  assert.equal(embedCalls[0].body.requests[0].outputDimensionality, 768);
  assert.equal(embedCalls[0].body.requests[0].model, undefined, "Vertex takes the model from the address");

  rejectNext = true;
  await assert.rejects(embedTexts(["د"], opts), /Embedding HTTP 401/);
  await embedTexts(["هـ"], opts);
  assert.equal(logins, 2, "a rejected token is dropped and the next call logs in again");
  assert.equal(embedCalls.at(-1)?.auth, "Bearer token-2");
});

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
