import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { NezamyClient, NezamyApiError } from "../src/index.js";
import { startMock, GOOD_TOKEN, NO_AI_TOKEN, STAFF_TOKEN, type MockHandle } from "./mock-server.js";

let mock: MockHandle;
const sleeps: number[] = [];
const mk = (token = GOOD_TOKEN, extra: Partial<ConstructorParameters<typeof NezamyClient>[0]> = {}) =>
  new NezamyClient({ baseUrl: mock.url, token, allowInsecureHttp: true, sleep: async (ms) => { sleeps.push(ms); }, ...extra });

before(async () => { mock = await startMock(); });
after(async () => { await mock.close(); });

test("search sends Bearer header and parses hits", async () => {
  const r = await mk().searchLibrary({ q: "عقد الإيجار", limit: 5 });
  assert.equal(r.hits.length, 2);
  assert.equal(r.hits[0]!.snippet.length <= 400, true);
  assert.equal(r.usage_notice.length > 10, true);
  const last = mock.log.at(-1)!;
  assert.equal(last.auth, `Bearer ${GOOD_TOKEN}`);
  assert.ok(!last.path.includes(GOOD_TOKEN), "token must never be in the URL");
});

test("bad token -> unauthorized with Arabic message and no token leak", async () => {
  const c = mk("nzy_pat_wrong_token_000000000");
  await assert.rejects(c.searchLibrary({ q: "اختبار" }), (e: unknown) => {
    assert.ok(e instanceof NezamyApiError);
    assert.equal(e.code, "unauthorized");
    assert.match(e.arabic, /[؀-ۿ]/);
    assert.ok(!JSON.stringify(e).includes("wrong_token"));
    assert.ok(!e.message.includes("wrong_token"));
    return true;
  });
});

test("503 twice then success: retried with backoff", async () => {
  sleeps.length = 0;
  mock.inject({ status: 503, count: 2 });
  const r = await mk().searchLibrary({ q: "اختبار الإعادة" });
  assert.equal(r.hits.length, 2);
  assert.equal(sleeps.length, 2);
});

test("429 honours Retry-After (capped) before retrying", async () => {
  sleeps.length = 0;
  mock.inject({ status: 429, count: 1, retryAfter: 2 });
  await mk().accountStanding();
  assert.deepEqual(sleeps, [2000]);
});

test("gives up after maxRetries with upstream_unavailable", async () => {
  mock.inject({ status: 503, count: 10 });
  await assert.rejects(mk(GOOD_TOKEN, { maxRetries: 1 }).accountStanding(), (e: unknown) => e instanceof NezamyApiError && e.code === "upstream_unavailable");
  mock.inject({ status: 200, count: 0 });
});

test("400 is not retried", async () => {
  sleeps.length = 0;
  
  // q below min length is rejected client-side by zod as a rejected promise (never reaches the server)
  const before = mock.log.length;
  await assert.rejects(mk().searchLibrary({ q: "a" }));
  assert.equal(mock.log.length, before);
  // a server-side 400 is surfaced at once, never retried
  mock.inject({ status: 400, count: 1, body: { request_id: "r", error: "بيانات غير صحيحة", code: "validation" } });
  await assert.rejects(mk().accountStanding(), (e: unknown) => e instanceof NezamyApiError && e.code === "validation");
  assert.equal(sleeps.length, 0);
});

test("locked article: text is null, reason present", async () => {
  const a = await mk().getArticle("art-locked");
  assert.equal(a.locked, true);
  assert.equal(a.text, null);
  assert.equal(a.lock_reason, "daily_quota");
  assert.equal(a.amended_by.length, 1);
});

test("missing article -> not_found", async () => {
  await assert.rejects(mk().getArticle("missing"), (e: unknown) => e instanceof NezamyApiError && e.code === "not_found");
});

test("neighbors", async () => {
  const r = await mk().graphNeighbors("art-1", { edge: "EXCEPTS" });
  assert.equal(r.edges[0]!.type, "EXCEPTS");
});

test("citation check: ok / amended / not_found(article) / not_found(law)", async () => {
  const r = await mk().checkCitations({ citations: [
    { law: "نظام تجريبي", article: 5 }, { law: "نظام تجريبي", article: 11 },
    { law: "نظام تجريبي", article: 99 }, { law: "نظام آخر", article: 1 },
  ] });
  assert.deepEqual(r.results.map((x) => x.status), ["ok", "amended", "not_found", "not_found"]);
  assert.equal(r.results[2]!.missing, "article");
  assert.equal(r.results[3]!.missing, "law");
});

test("scope refusal: token without ai:run cannot start a run", async () => {
  await assert.rejects(mk(NO_AI_TOKEN).startRun({ tool: "legal-drafter", input: { phase: "issues" }, idempotency_key: "key-00000001" }),
    (e: unknown) => e instanceof NezamyApiError && e.code === "forbidden_scope");
});

test("runAndWait polls until succeeded and reports progress", async () => {
  sleeps.length = 0;
  const seen: string[] = [];
  const run = await mk().runAndWait({ tool: "legal-drafter", input: { phase: "issues", facts: "وقائع تجريبية كافية للتحليل" }, idempotency_key: "key-run-0001" }, { onProgress: (r) => seen.push(r.status) });
  assert.equal(run.status, "succeeded");
  assert.deepEqual(seen, ["running", "running", "succeeded"]);
  assert.ok(sleeps.every((s) => s >= 1000 && s <= 5000));
});

test("same idempotency key: one charge only", async () => {
  const before = mock.charges();
  const c = mk();
  const a = await c.startRun({ tool: "contract-drafter", input: { x: 1 }, idempotency_key: "key-idem-0001" });
  const b = await c.startRun({ tool: "contract-drafter", input: { x: 1 }, idempotency_key: "key-idem-0001" });
  assert.equal(a.run_id, b.run_id);
  assert.equal(mock.charges() - before, 200);
});

test("failed run -> run_failed carrying the server's Arabic reason", async () => {
  await assert.rejects(
    mk().runAndWait({ tool: "legal-drafter", input: { facts: "FAIL وقائع" }, idempotency_key: "key-fail-0001" }),
    (e: unknown) => e instanceof NezamyApiError && e.code === "run_failed" && /رد النقاط/.test(e.arabic),
  );
});

test("waitForRun times out when the run never finishes", async () => {
  const c = mk();
  const s = await c.startRun({ tool: "legal-drafter", input: { facts: "وقائع" }, idempotency_key: "key-slow-0001" });
  const slow = await startMock({ pollsBeforeDone: 10_000 });
  const c2 = new NezamyClient({ baseUrl: slow.url, token: GOOD_TOKEN, allowInsecureHttp: true, sleep: async () => {} });
  const s2 = await c2.startRun({ tool: "legal-drafter", input: { facts: "وقائع" }, idempotency_key: "key-slow-0002" });
  await assert.rejects(c2.waitForRun(s2.run_id, { deadlineMs: 50 }), (e: unknown) => e instanceof NezamyApiError && e.code === "timeout");
  await slow.close();
  assert.ok(s.run_id);
});

test("schema mismatch -> bad_response", async () => {
  mock.inject({ status: 200, count: 1, body: { request_id: "r", nope: true } });
  await assert.rejects(mk().accountStanding(), (e: unknown) => e instanceof NezamyApiError && e.code === "bad_response");
});

test("http baseUrl is refused unless explicitly allowed for localhost", () => {
  assert.throws(() => new NezamyClient({ baseUrl: "http://nezamy.sa", token: GOOD_TOKEN }));
  assert.throws(() => new NezamyClient({ baseUrl: "http://example.com", token: GOOD_TOKEN, allowInsecureHttp: true }));
});

test("onRequest hook never receives the token or bodies", async () => {
  const infos: unknown[] = [];
  await mk(GOOD_TOKEN, { onRequest: (i) => infos.push(i) }).accountStanding();
  assert.ok(!JSON.stringify(infos).includes(GOOD_TOKEN));
});

test("quoteRun: price known before any charge", async () => {
  const before = mock.charges();
  const q = await mk().quoteRun({ tool: "contract-drafter", input: { type: "rent", fields: [] } });
  assert.equal(q.price_points, 500);
  assert.equal(q.can_afford, true);
  assert.equal(mock.charges(), before);
});

test("v2: excerpt read, dossier read and research write use their scopes; kill_switch maps to an Arabic error", async () => {
  const c = mk(STAFF_TOKEN);
  const ex = await c.getArticle("art-1", { excerpt: true });
  assert.equal(ex.excerpt_only, true);
  assert.ok(mock.log.at(-1)!.path.endsWith("?excerpt=1"));
  const d = await c.getDossier("d1", { stage: "intake" });
  assert.equal(d.items.length, 1);
  assert.equal(d.manifest.length, 2);
  const w = await c.addResearchItem({ title: "ملاحظة", content: "نص" });
  assert.match(w.item_id, /^ri-/);
  await assert.rejects(mk().getDossier("d1"), (e: unknown) => e instanceof NezamyApiError && e.code === "forbidden_scope");
  mock.kill(true);
  try {
    await assert.rejects(mk().accountStanding(), (e: unknown) => e instanceof NezamyApiError && e.code === "kill_switch");
  } finally { mock.kill(false); }
  assert.match(c.tokenId, /^[0-9a-f]{16}$/);
  assert.ok(!c.tokenId.includes(STAFF_TOKEN));
});
