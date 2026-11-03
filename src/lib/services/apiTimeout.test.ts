/**
 * apiTimeout.test.ts — the opt-in timeout on apiMutate (owner handoff
 * 2026-10-30, CODE-F23). Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/apiTimeout.test.ts
 *
 * Pins: without `timeoutMs` nothing changes (no signal is passed, a slow
 * answer is still waited for); with it, a stalled request ends in
 * ApiTimeoutError — an UNCERTAIN outcome, not a failure — and the request is
 * sent exactly once (no retry of a write behind the caller's back).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ApiTimeoutError, apiMutate } from "./api.ts";

type FetchArgs = { input: unknown; init: RequestInit | undefined };

function withFetch(impl: (args: FetchArgs) => Promise<Response>) {
  const calls: FetchArgs[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: unknown, init?: RequestInit) => {
    const args = { input, init };
    calls.push(args);
    return impl(args);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

/** A server that never answers, but honours an abort like real fetch does. */
const stalled = ({ init }: FetchArgs) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });

test("with timeoutMs, a stalled write ends in ApiTimeoutError (uncertain) after one attempt", async () => {
  const f = withFetch(stalled);
  try {
    await assert.rejects(
      apiMutate("/api/v1/lawyer/finance", "PATCH", { a: 1 }, { timeoutMs: 30 }),
      (err: unknown) => err instanceof ApiTimeoutError && err.uncertain === true && /لا نعرف/.test(err.message),
    );
    assert.equal(f.calls.length, 1, "a timed-out write is never re-sent automatically");
  } finally {
    f.restore();
  }
});

test("without timeoutMs the call is unchanged: no signal, and a slow answer is still waited for", async () => {
  const f = withFetch(
    () => new Promise((resolve) => setTimeout(() => resolve(new Response('{"ok":true}', { status: 200 })), 40)),
  );
  try {
    const out = await apiMutate<{ ok: boolean }>("/x", "POST", {});
    assert.deepEqual(out, { ok: true });
    assert.equal(f.calls[0].init?.signal, undefined);
  } finally {
    f.restore();
  }
});

test("an answer inside the deadline returns normally, and a server error is still a plain Error", async () => {
  const ok = withFetch(async () => new Response('{"data":1}', { status: 200 }));
  try {
    assert.deepEqual(await apiMutate("/x", "POST", {}, { timeoutMs: 1000 }), { data: 1 });
  } finally {
    ok.restore();
  }
  const bad = withFetch(async () => new Response('{"error":"Forbidden"}', { status: 403 }));
  try {
    await assert.rejects(
      apiMutate("/x", "POST", {}, { timeoutMs: 1000 }),
      (err: unknown) => err instanceof Error && !(err instanceof ApiTimeoutError) && err.message === "Forbidden",
    );
  } finally {
    bad.restore();
  }
});
