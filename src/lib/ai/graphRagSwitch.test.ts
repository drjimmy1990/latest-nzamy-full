import test from "node:test";
import assert from "node:assert/strict";
import { embedQueryWithin, graphRagEnabled } from "./graphRagSwitch.ts";

test("the GraphRAG switch is on only for NZAMY_GRAPH_RAG=on", () => {
  assert.equal(graphRagEnabled({}), false);
  assert.equal(graphRagEnabled({ NZAMY_GRAPH_RAG: "" }), false);
  assert.equal(graphRagEnabled({ NZAMY_GRAPH_RAG: "off" }), false);
  assert.equal(graphRagEnabled({ NZAMY_GRAPH_RAG: "true" }), false);
  assert.equal(graphRagEnabled({ NZAMY_GRAPH_RAG: "on" }), true);
  assert.equal(graphRagEnabled({ NZAMY_GRAPH_RAG: " ON " }), true);
});

test("the query embedding answers null past its deadline, on an error, and asks for no retries", async () => {
  let opts: unknown = null;
  const slow = (async (_q: string, o: unknown) => {
    opts = o;
    return new Promise(() => {});
  }) as never;
  const started = Date.now();
  assert.equal(await embedQueryWithin("سؤال", 50, slow), null);
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(opts, { timeoutMs: 50, maxRetries: 0 });

  const failing = (async () => {
    throw new Error("Embedding HTTP 429");
  }) as never;
  assert.equal(await embedQueryWithin("سؤال", 50, failing), null);

  const ok = (async () => ({ modelId: "m", dimensions: 2, vector: [1, 0], literal: "[1,0]" })) as never;
  assert.deepEqual(await embedQueryWithin("سؤال", 50, ok), { modelId: "m", literal: "[1,0]" });
});
