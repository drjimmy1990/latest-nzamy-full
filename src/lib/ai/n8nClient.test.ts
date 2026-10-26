/**
 * n8nClient.test.ts — the app → n8n call: the key header, the two answer
 * shapes, and every other answer read as a failure.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/n8nClient.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { callN8n, type N8nCall } from "./n8nClient.ts";

const base = (over: Partial<N8nCall> = {}): N8nCall => ({
  baseUrl: "https://n8n.test/webhook/",
  key: "k-secret",
  path: "/nzamy-ai/echo-fast",
  mode: "sync",
  body: { run_id: "r" },
  timeoutMs: 1000,
  ...over,
});

const reply = (status: number, body: string) => async () => new Response(body, { status });

test("sends the key header to base + path, and returns a fast result", async () => {
  let url = "";
  let headers: Record<string, string> = {};
  const r = await callN8n(
    base({
      fetchImpl: (async (u: string, init: RequestInit) => {
        url = u;
        headers = init.headers as Record<string, string>;
        return new Response('{"run_id":"r","status":"succeeded"}', { status: 200 });
      }) as never,
    }),
  );
  assert.equal(url, "https://n8n.test/webhook/nzamy-ai/echo-fast");
  assert.equal(headers["X-Nzamy-Key"], "k-secret");
  assert.deepEqual(r, { kind: "result", result: { run_id: "r", status: "succeeded" } });
});

test("unset configuration never calls out", async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return new Response("{}");
  }) as never;
  for (const over of [{ baseUrl: undefined }, { key: "" }, { key: "  " }]) {
    const r = await callN8n(base({ ...over, fetchImpl }));
    assert.equal(r.kind === "failed" && r.code, "n8n_unconfigured");
  }
  assert.equal(called, false);
});

test("a job tool needs exactly 202", async () => {
  assert.deepEqual(await callN8n(base({ mode: "async", fetchImpl: reply(202, "{}") as never })), { kind: "accepted" });
  const r = await callN8n(base({ mode: "async", fetchImpl: reply(200, "{}") as never }));
  assert.equal(r.kind === "failed" && r.code, "n8n_http");
});

test("a fast tool: another status, a non-JSON body, a network error and a timeout all fail", async () => {
  const codes: string[] = [];
  for (const fetchImpl of [
    reply(403, "Authorization data is wrong!"),
    reply(200, "<html>"),
    async () => {
      throw new TypeError("fetch failed");
    },
    async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    },
  ]) {
    const r = await callN8n(base({ fetchImpl: fetchImpl as never }));
    codes.push(r.kind === "failed" ? r.code : r.kind);
  }
  assert.deepEqual(codes, ["n8n_http", "bad_reply", "n8n_unreachable", "timeout"]);
});
