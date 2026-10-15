import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWithTimeout, LOADER_REQUEST_TIMEOUT_MS } from "./fetchWithTimeout.ts";

/** A fetch that never answers until its signal aborts — the 2026-10-15 hang. */
const hangingFetch: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  });

test("a request that never answers fails after the deadline instead of hanging", async () => {
  const started = Date.now();
  await assert.rejects(fetchWithTimeout(50, hangingFetch)("https://example.test"), (e: Error) =>
    e.name === "TimeoutError");
  assert.ok(Date.now() - started < 2_000);
});

test("a caller's own abort still works", async () => {
  const ctrl = new AbortController();
  const p = fetchWithTimeout(60_000, hangingFetch)("https://example.test", { signal: ctrl.signal });
  ctrl.abort(new Error("caller stop"));
  await assert.rejects(p, /caller stop/);
});

test("a fast answer passes through with the request options intact", async () => {
  let seen: RequestInit | undefined;
  const okFetch: typeof fetch = async (_input, init) => {
    seen = init;
    return new Response("ok");
  };
  const res = await fetchWithTimeout(1_000, okFetch)("https://example.test", { method: "POST", headers: { a: "1" } });
  assert.equal(await res.text(), "ok");
  assert.equal(seen?.method, "POST");
  assert.ok(seen?.signal instanceof AbortSignal);
});

test("the loader default is two minutes; a bad timeout is refused", () => {
  assert.equal(LOADER_REQUEST_TIMEOUT_MS, 120_000);
  assert.throws(() => fetchWithTimeout(0), /bad timeout/);
});
