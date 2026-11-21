import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCasesSyncRequest, maskId, MAX_ITEMS } from "./casesSync.ts";

const sha = (c: string) => c.repeat(64);
const base = () => ({
  idempotency_key: "k-1",
  source: { platform: "najiz", captured_at: "2026-11-21T10:00:00Z", extension_version: "1.2.0" },
  case: { number: "4412345678" },
});

test("أدنى طلب صالح", () => {
  const r = parseCasesSyncRequest(base());
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual([r.value.parties, r.value.attachments], [[], []]);
});
test("المفتاح والمنصة والرقم مطلوبة", () => {
  const r = parseCasesSyncRequest({ source: { platform: "x" }, case: {} });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 422);
    assert.deepEqual(r.errors.map((e) => e.path).sort(), ["case.number", "idempotency_key", "source.captured_at", "source.platform"]);
  }
});
test("الجسم ليس كائنًا → 422", () => assert.equal((parseCasesSyncRequest([]) as { status: number }).status, 422));
test("user_id من الجسم لا يظهر في القيمة", () => {
  const r = parseCasesSyncRequest({ ...base(), user_id: "attacker" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal("user_id" in r.value, false);
});
test("إزالة تكرار المرفقات والسجلات بالبصمة", () => {
  const att = { kind: "pdf", title: "t", sha256: sha("a"), size: 1, mime: "application/pdf" };
  const r = parseCasesSyncRequest({
    ...base(),
    attachments: [att, { ...att, title: "u" }],
    records: [{ kind: "ruling", text: "x", sha256: sha("b") }, { kind: "memo", text: "y", sha256: sha("B") }],
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual([r.value.attachments.length, r.value.records.length], [1, 1]);
});
test("بصمة غير صالحة ترفض", () => {
  const r = parseCasesSyncRequest({ ...base(), attachments: [{ kind: "pdf", title: "t", sha256: "zz", size: 1, mime: "a/b" }] });
  assert.equal(r.ok, false);
});
test("تقنيع الهوية دائمًا", () => {
  assert.equal(maskId("1234567890"), "••••7890");
  const r = parseCasesSyncRequest({ ...base(), parties: [{ role: "plaintiff", name: "س", id_masked: "1234567890" }] });
  assert.equal(r.ok && r.value.parties[0]!.id_masked, "••••7890");
});
test("تجاوز ٢٠٠ عنصر → 413", () => {
  const sessions = Array.from({ length: MAX_ITEMS + 1 }, () => ({ date: "2026-11-21" }));
  const r = parseCasesSyncRequest({ ...base(), sessions });
  assert.equal(!r.ok && r.status, 413);
});
test("تاريخ جلسة فاسد", () => {
  const r = parseCasesSyncRequest({ ...base(), sessions: [{ date: "غدًا" }] });
  assert.equal(r.ok, false);
});
