/**
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ext/extRuns.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { namespacedKey, parseExtRunRequest, toExtCitations, toExtRunResponse, toExtStartReply } from "./extRuns.ts";

const RID = "req_abc";
const ok = { tool: "legal-drafter", input: { phase: "issues" }, idempotency_key: "abcdefgh12" };

test("request: the open tools (sayegh-v2 included); brief-check and unknown ones are told apart, others unknown", () => {
  assert.equal(parseExtRunRequest(ok, { needKey: true }).ok, true);
  assert.equal(parseExtRunRequest({ ...ok, tool: "sayegh-v2" }, { needKey: true }).ok, true);
  for (const tool of ["brief-check", "wargaming", ""]) {
    const r = parseExtRunRequest({ ...ok, tool }, { needKey: true });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 422);
  }
  const a = parseExtRunRequest({ ...ok, tool: "brief-check" }, { needKey: true });
  const b = parseExtRunRequest({ ...ok, tool: "wargaming" }, { needKey: true });
  assert.ok(!a.ok && !b.ok && a.error !== b.error);
});

test("request: key is required to start but not to quote; bad shapes are refused", () => {
  assert.equal(parseExtRunRequest({ ...ok, idempotency_key: "short" }, { needKey: true }).ok, false);
  assert.equal(parseExtRunRequest({ ...ok, idempotency_key: "has:colon:1234" }, { needKey: true }).ok, false);
  assert.equal(parseExtRunRequest({ tool: ok.tool, input: ok.input }, { needKey: false }).ok, true);
  assert.equal(parseExtRunRequest(null, { needKey: true }).ok, false);
  assert.equal(parseExtRunRequest({ ...ok, input: [] }, { needKey: true }).ok, false);
  assert.equal(parseExtRunRequest({ ...ok, conversation_id: 5 }, { needKey: true }).ok, false);
});

test("namespacedKey: valid for runCore, per token, never the raw key", () => {
  const k = namespacedKey("11111111-2222-4333-8444-555555555555", "my-key-12345");
  assert.match(k, /^[A-Za-z0-9_-]{8,100}$/);
  assert.notEqual(k, namespacedKey("99999999-2222-4333-8444-555555555555", "my-key-12345"));
  assert.equal(k, namespacedKey("11111111-2222-4333-8444-555555555555", "my-key-12345"));
  assert.ok(!k.includes("my-key"));
});

test("start reply: 202 job, 200 repeat with no charge, errors flat with the client's codes", () => {
  const job = toExtStartReply({ status: 202, body: { runId: "r1", status: "running", chargedPoints: 500, conversationId: "c1" } }, RID);
  assert.deepEqual(job, { status: 202, body: { request_id: RID, run_id: "r1", conversation_id: "c1", status: "running", charged_points: 500 } });
  const dup = toExtStartReply({ status: 409, body: { code: "duplicate", error: "x", runId: "r1", status: "running" } }, RID);
  assert.equal(dup.status, 200);
  assert.equal(dup.body.charged_points, 0);
  assert.equal(dup.body.run_id, "r1");
  const pts = toExtStartReply({ status: 402, body: { error: "رصيدك من النقاط لا يكفي", code: "insufficient_points", price: 500 } }, RID);
  assert.deepEqual(pts, { status: 402, body: { request_id: RID, error: "رصيدك من النقاط لا يكفي", code: "insufficient_points" } });
  assert.equal(toExtStartReply({ status: 403, body: { error: "x", code: "role" } }, RID).body.code, "role_refused");
  assert.equal(toExtStartReply({ status: 429, body: { error: "x", code: "daily_limit" } }, RID).body.code, "quota_exceeded");
  assert.equal(toExtStartReply({ status: 423, body: { error: "x", code: "tool_off" } }, RID).body.code, "tool_off");
  assert.equal(toExtStartReply({ status: 422, body: { error: "x", code: "invalid_input" } }, RID).body.code, "validation");
  assert.equal(toExtStartReply({ status: 403, body: { error: "x", code: "consultant_blocked" } }, RID).body.code, "consultant_blocked");
  assert.equal(toExtStartReply({ status: 404, body: { error: "x" } }, RID).body.code, "not_found");
  // a "success" with no run id is a fault, never a success shape
  assert.equal(toExtStartReply({ status: 200, body: {} }, RID).status, 502);
});

test("start reply: a body without a message still gets an Arabic one; non-error status never leaks as success", () => {
  const r = toExtStartReply({ status: 503, body: { code: "unavailable" } }, RID);
  assert.match(String(r.body.error), /[\u0600-\u06FF]/);
  assert.equal(r.body.run_id, undefined);
});

test("run response: whitelisted fields only; running hides output; failed is Arabic and refunded", () => {
  const row = {
    id: "r1", tool: "legal-drafter", status: "succeeded", conversation_id: "c1",
    output: { title: "t", lawyer_notes: { engine: {} }, najiz: { text: "x" } },
    citations: [{ sid: "S1", kind: "article", id: "a-1", title: "المادة ١", url: "/laws/x#a-1", status: "in_force" }, { title: "" }],
    charged_points: 500, refunded_at: null, progress_step: "drafting", created_at: "2026-11-21T10:00:00Z",
    // internal columns that must never come out:
    input: { facts: "secret" }, n8n_execution_id: "9", callback_url: "https://x", source_ids: { a: 1 },
  } as never;
  const out = toExtRunResponse(row, RID);
  assert.deepEqual(Object.keys(out).sort(), ["charged_points", "citations", "conversation_id", "error_code", "error_message", "output", "progress", "refunded", "request_id", "run_id", "status", "tool"]);
  assert.equal((out.output as { najiz: unknown }).najiz !== undefined, true);
  assert.deepEqual(out.citations, [{ title: "المادة ١", status: "in_force", sid: "S1", library_id: "a-1", url: "/laws/x#a-1" }]);
  const running = toExtRunResponse({ ...(row as object), status: "running" } as never, RID);
  assert.equal(running.output, null);
  assert.deepEqual(running.citations, []);
  const review = toExtRunResponse({ ...(row as object), status: "review" } as never, RID);
  assert.equal(review.status, "running");
  assert.equal(review.output, null);
  const failed = toExtRunResponse({ id: "r2", tool: "legal-drafter", status: "failed", error_code: "unreachable", refunded_at: "2026-11-21T10:01:00Z", charged_points: 500 } as never, RID);
  assert.equal(failed.status, "failed");
  assert.equal(failed.refunded, true);
  assert.match(String(failed.error_message), /[\u0600-\u06FF]/);
});

test("citations: unknown status stays unknown, absolute urls and non-library ids are dropped", () => {
  const c = toExtCitations([{ title: "x", status: "نشط", url: "https://evil.example/x", kind: "fiqh", id: "f1" }]);
  assert.deepEqual(c, [{ title: "x", status: "unknown" }]);
  assert.deepEqual(toExtCitations("nope"), []);
});
