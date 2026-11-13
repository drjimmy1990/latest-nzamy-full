import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGraphRetrieveRequest, searchLegalGraphWith } from "./graphService.ts";

const ROUTE_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "app",
  "api",
  "v1",
  "ai",
  "graph-retrieve",
  "route.ts",
);

test("parseGraphRetrieveRequest accepts colloquial question, explicit queries, or both, and clamps limits", () => {
  const fromQuestion = parseGraphRetrieveRequest({
    question: "طردوني من الشركة بدون سبب",
    limits: { laws: 10, principles: 4, decrees: 2, feqh: 2 },
    law_slug: "labor-law",
  });
  assert.equal(fromQuestion.ok, true);
  if (fromQuestion.ok) {
    assert.equal(fromQuestion.value.question, "طردوني من الشركة بدون سبب");
    assert.equal(fromQuestion.value.lawSlug, "labor-law");
    assert.equal(fromQuestion.value.limits.laws, 10);
    assert.equal(fromQuestion.value.limits.decrees, 2);
  }

  // Clamps excessive limits to safe upper bounds
  const clamped = parseGraphRetrieveRequest({
    queries: ["فصل تعسفي"],
    limits: { laws: 999, principles: 999, decrees: 999, feqh: 999 },
  });
  assert.equal(clamped.ok, true);
  if (clamped.ok) {
    assert.ok(clamped.value.limits.laws <= 25);
    assert.ok(clamped.value.limits.principles <= 15);
    assert.ok(clamped.value.limits.decrees! <= 10);
    assert.ok(clamped.value.limits.feqh! <= 10);
  }

  // Rejects empty payloads
  assert.equal(parseGraphRetrieveRequest({}).ok, false);
  assert.equal(parseGraphRetrieveRequest(null).ok, false);
});

test("searchLegalGraphWith embeds question, invokes retrieveLibrary with useGraph, and optionally reranks", async () => {
  let receivedOpts: Record<string, unknown> | undefined;
  const out = await searchLegalGraphWith(
    {} as never,
    {
      question: "ما تعويض الفصل غير المشروع؟",
      queries: ["فصل غير مشروع المادة 77"],
      limits: { laws: 6, principles: 3, decrees: 1, feqh: 1 },
    },
    {
      embedQuery: async () => "[0.5,0.5,0.5,0.5]",
      retrieve: async (_admin, queries, limits, pin, _budget, opts) => {
        receivedOpts = { queries, limits, pin, opts };
        return {
          sources: [
            { sid: "S1", kind: "article", title: "نظام العمل — المادة 77", text: "نص المادة 77" },
            { sid: "S2", kind: "article", title: "نظام العمل — المادة 80 (استثناء نظامي مرتبط)", text: "نص المادة 80" },
          ],
          map: {
            S1: { kind: "article", id: "labor-law__art-77", title: "نظام العمل — المادة 77", url: "/laws/labor-law#labor-law__art-77" },
            S2: { kind: "article", id: "labor-law__art-80", title: "نظام العمل — المادة 80", url: "/laws/labor-law#labor-law__art-80" },
          },
        };
      },
      rerank: async (_q, docs) => [1, 0].slice(0, docs.length),
      enabled: true,
    },
  );

  assert.ok(receivedOpts);
  assert.equal((receivedOpts?.opts as { useGraph?: boolean })?.useGraph, true);
  assert.equal((receivedOpts?.opts as { queryEmbedding?: string })?.queryEmbedding, "[0.5,0.5,0.5,0.5]");
  // Reranker flipped S2 ahead of S1 and re-numbered S1..S2 cleanly with matching citation map!
  assert.equal(out.sources[0]?.sid, "S1");
  assert.equal(out.map.S1?.id, "labor-law__art-80");
  assert.equal(out.sources[1]?.sid, "S2");
  assert.equal(out.map.S2?.id, "labor-law__art-77");
});

test("searchLegalGraphWith with the switch off never embeds and never asks for the graph", async () => {
  let embedded = false;
  let receivedOpts: unknown = "unset";
  await searchLegalGraphWith(
    {} as never,
    { question: "ما تعويض الفصل غير المشروع؟", queries: ["فصل غير مشروع"], limits: { laws: 6, principles: 3 } },
    {
      enabled: false,
      embedQuery: async () => {
        embedded = true;
        return "[1]";
      },
      retrieve: async (_admin, _q, _l, _p, _b, opts) => {
        receivedOpts = opts;
        return { sources: [], map: {} };
      },
    },
  );
  assert.equal(embedded, false);
  assert.equal(receivedOpts, undefined);
});

test("POST /api/v1/ai/graph-retrieve enforces X-Nzamy-Key timing-safe auth for n8n & internal services", () => {
  assert.equal(existsSync(ROUTE_PATH), true, "src/app/api/v1/ai/graph-retrieve/route.ts must exist");
  const src = readFileSync(ROUTE_PATH, "utf8");
  assert.ok(src.includes("cronSecretMatches("));
  assert.ok(src.includes("NZAMY_AI_CALLBACK_KEY"));
  assert.ok(src.includes("searchLegalGraph("));
});
