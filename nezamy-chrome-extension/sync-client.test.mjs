// تشغيل: node --test nezamy-chrome-extension/sync-client.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleToSyncRequest, classifyResponse, backoffMs, pruneQueue, sendSync, maskId } from "./sync-client.js";

const bundle = { portal: "najiz", caseCode: "4412345678", courtName: "المحكمة التجارية", caseStatusName: "قيد النظر", prosecutorName: "أ", defendantName: "ب" };
const fixed = { now: () => new Date("2026-11-21T10:00:00Z"), extensionVersion: "1.2.0" };

test("تحويل حزمة ناجز إلى جسم العقد", async () => {
  const b = await bundleToSyncRequest(bundle, fixed);
  assert.equal(b.source.platform, "najiz");
  assert.equal(b.case.number, "4412345678");
  assert.deepEqual(b.parties.map((p) => p.role), ["plaintiff", "defendant"]);
  assert.match(b.idempotency_key, /^ext-najiz-[0-9a-f]{40}$/);
});
test("المفتاح ثابت لنفس المحتوى ولو تغيّر وقت السحب", async () => {
  const a = await bundleToSyncRequest(bundle, fixed);
  const c = await bundleToSyncRequest(bundle, { ...fixed, now: () => new Date("2027-01-01T00:00:00Z") });
  assert.equal(a.idempotency_key, c.idempotency_key);
  const d = await bundleToSyncRequest({ ...bundle, caseStatusName: "منتهية" }, fixed);
  assert.notEqual(a.idempotency_key, d.idempotency_key);
});
test("منصة غير مدعومة أو بلا رقم → null", async () => {
  assert.equal(await bundleToSyncRequest({ ...bundle, portal: "moeen" }, fixed), null);
  assert.equal(await bundleToSyncRequest({ portal: "najiz" }, fixed), null);
});
test("تصنيف الردود: 404 ليس حالة عادية", () => {
  assert.deepEqual([200, 201, 429, 503, 0, 401, 403, 413, 422, 404].map(classifyResponse),
    ["done", "done", "retry", "retry", "retry", "rejected", "rejected", "rejected", "rejected", "rejected"]);
});
test("تراجع أسّي مسقوف ويحترم Retry-After", () => {
  assert.equal(backoffMs(0), 5000);
  assert.equal(backoffMs(3), 40000);
  assert.equal(backoffMs(30), 30 * 60_000);
  assert.equal(backoffMs(1, 12), 12000);
});
test("انتهاء الطابور بعد ٧ أيام", () => {
  const now = Date.parse("2026-11-21T00:00:00Z");
  const q = [{ queuedAt: "2026-11-10T00:00:00Z" }, { queuedAt: "2026-11-20T00:00:00Z" }];
  assert.equal(pruneQueue(q, now).length, 1);
});
test("sendSync: توكن + حالات", async () => {
  const body = await bundleToSyncRequest(bundle, fixed);
  const mk = (status, json = {}) => async (url, init) => {
    assert.equal(url, "https://x.test/api/v1/ext/cases/sync");
    assert.equal(init.headers.Authorization, "Bearer tok");
    assert.equal(init.credentials, "omit");
    return { status, json: async () => json, headers: { get: () => "7" } };
  };
  const ok = await sendSync(body, { serverUrl: "https://x.test", token: "tok", fetchImpl: mk(201, { case_id: "c1" }) });
  assert.deepEqual([ok.outcome, ok.caseId], ["done", "c1"]);
  const rl = await sendSync(body, { serverUrl: "https://x.test", token: "tok", fetchImpl: mk(429) });
  assert.deepEqual([rl.outcome, rl.retryAfterMs], ["retry", 7000]);
  const rej = await sendSync(body, { serverUrl: "https://x.test", token: "tok", fetchImpl: mk(422) });
  assert.equal(rej.outcome, "rejected");
  const off = await sendSync(body, { serverUrl: "https://x.test", token: "tok", fetchImpl: async () => { throw new Error("net"); } });
  assert.equal(off.outcome, "retry");
  assert.equal((await sendSync(body, { serverUrl: "https://x.test", token: "" })).outcome, "rejected");
  assert.equal((await sendSync(null, { serverUrl: "", token: "t" })).outcome, "skipped");
});
test("تقنيع الهوية", () => assert.equal(maskId("1234567890"), "••••7890"));
