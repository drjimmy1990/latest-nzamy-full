/**
 * cappedRead.test.ts — `size_bytes` is written by the client, so a read of an
 * object must stop by what actually arrives, without holding the rest.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/attachments/cappedRead.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readCapped } from "./cappedRead.ts";

const CHUNK = 1024;

/** An endless object: counts what was pulled, and whether the reader let go. */
function endless() {
  const seen = { pulls: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        seen.pulls += 1;
        controller.enqueue(new Uint8Array(CHUNK));
      },
      cancel() {
        seen.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { body, seen };
}

test("an object within the cap comes back whole, and exactly at the cap is within it", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const got = await readCapped("https://s/x", 4, (async () => new Response(bytes)) as never);
  assert.ok(got.ok);
  assert.deepEqual(got.bytes, bytes);
  const none = await readCapped("https://s/x", 4, (async () => new Response(new Uint8Array())) as never);
  assert.ok(none.ok);
  assert.equal(none.bytes.length, 0);
});

test("the read stops past the cap: too_large, the stream let go, and the rest never pulled", async () => {
  const { body, seen } = endless();
  const got = await readCapped("https://s/x", 10 * CHUNK, (async () => new Response(body)) as never);
  assert.deepEqual(got, { ok: false, reason: "too_large" });
  assert.ok(seen.pulls <= 12, `pulled ${seen.pulls} chunks for a cap of 10`);
  assert.equal(seen.cancelled, true);
});

test("a Content-Length over the cap refuses before any of the body is read", async () => {
  const { body, seen } = endless();
  const res = new Response(body, { headers: { "Content-Length": String(11 * CHUNK) } });
  const got = await readCapped("https://s/x", 10 * CHUNK, (async () => res) as never);
  assert.deepEqual(got, { ok: false, reason: "too_large" });
  assert.equal(seen.pulls, 0);
  assert.equal(seen.cancelled, true);
});

test("a Content-Length that lies low does not lift the cap", async () => {
  const { body } = endless();
  const res = new Response(body, { headers: { "Content-Length": "4" } });
  assert.deepEqual(await readCapped("https://s/x", 10 * CHUNK, (async () => res) as never), { ok: false, reason: "too_large" });
});

test("a refused, broken or dropped read is failed, never too_large and never an empty file", async () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ["404", async () => new Response("no", { status: 404 })],
    ["500", async () => new Response("no", { status: 500 })],
    ["network", async () => { throw new TypeError("failed"); }],
    ["cut mid-stream", async () => new Response(new ReadableStream({ pull(c) { c.error(new Error("cut")); } }))],
  ];
  for (const [name, f] of cases) assert.deepEqual(await readCapped("https://s/x", 100, f as never), { ok: false, reason: "failed" }, name);
});

test("it asks for that URL, uncached, and holds an abort signal", async () => {
  const seen: Array<[string, RequestInit | undefined]> = [];
  await readCapped("https://s/signed?token=t", 100, (async (url: string, init?: RequestInit) => {
    seen.push([url, init]);
    return new Response("x");
  }) as never);
  assert.equal(seen[0][0], "https://s/signed?token=t");
  assert.equal(seen[0][1]?.cache, "no-store");
  assert.ok(seen[0][1]?.signal instanceof AbortSignal);
});
