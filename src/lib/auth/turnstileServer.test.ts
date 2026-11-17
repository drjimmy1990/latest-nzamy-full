import assert from "node:assert/strict";
import test from "node:test";
import { SITEVERIFY_URL, turnstilePolicy, verifyTurnstileToken } from "./turnstileServer.ts";

test("turnstilePolicy: verify with a secret; skip only outside production", () => {
  assert.equal(turnstilePolicy("s3cret", "production"), "verify");
  assert.equal(turnstilePolicy("s3cret", "development"), "verify");
  assert.equal(turnstilePolicy("", "production"), "misconfigured");
  assert.equal(turnstilePolicy(undefined, "production"), "misconfigured");
  assert.equal(turnstilePolicy("  ", "production"), "misconfigured");
  assert.equal(turnstilePolicy(undefined, "development"), "skip");
  assert.equal(turnstilePolicy(undefined, "test"), "skip");
});

function fakeFetch(answer: { ok?: boolean; json?: unknown; throws?: boolean }) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const impl = async (url: string, init: { method: string; body: URLSearchParams }) => {
    calls.push({ url, body: init.body });
    if (answer.throws) throw new Error("network");
    return { ok: answer.ok ?? true, json: async () => answer.json };
  };
  return { impl, calls };
}

test("verifyTurnstileToken: true only on success:true, sends secret/response/remoteip", async () => {
  const f = fakeFetch({ json: { success: true } });
  assert.equal(await verifyTurnstileToken({ secret: "s", token: "t", remoteIp: "203.0.113.5", fetchImpl: f.impl }), true);
  assert.equal(f.calls[0].url, SITEVERIFY_URL);
  assert.equal(f.calls[0].body.get("secret"), "s");
  assert.equal(f.calls[0].body.get("response"), "t");
  assert.equal(f.calls[0].body.get("remoteip"), "203.0.113.5");
});

test("verifyTurnstileToken: no token → false without calling Cloudflare", async () => {
  const f = fakeFetch({ json: { success: true } });
  assert.equal(await verifyTurnstileToken({ secret: "s", token: "", fetchImpl: f.impl }), false);
  assert.equal(await verifyTurnstileToken({ secret: "s", token: null, fetchImpl: f.impl }), false);
  assert.equal(f.calls.length, 0);
});

test("verifyTurnstileToken: failure, HTTP error, malformed answer, network error → false", async () => {
  for (const a of [{ json: { success: false } }, { ok: false, json: { success: true } }, { json: null }, { json: { success: "true" } }, { throws: true }]) {
    const f = fakeFetch(a);
    assert.equal(await verifyTurnstileToken({ secret: "s", token: "t", fetchImpl: f.impl }), false, JSON.stringify(a));
  }
});

test("verifyTurnstileToken: an unknown peer is not sent as remoteip", async () => {
  const f = fakeFetch({ json: { success: true } });
  await verifyTurnstileToken({ secret: "s", token: "t", remoteIp: "unknown", fetchImpl: f.impl });
  assert.equal(f.calls[0].body.has("remoteip"), false);
});
