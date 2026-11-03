import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deadlineActionRule, validateStatusChange, withStatusHistory, createLatestGuard,
  deadlineTruncationNoticeAr, windowCountLabel, MAX_STATUS_REASON,
} from "./deadlineStatusPolicy.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("CODE-F33: cancelling and reopening need a reason; «تمّ» takes an optional receipt", () => {
  assert.equal(validateStatusChange("open", "cancelled", ""), "اذكر سبب إلغاء المهلة.");
  assert.equal(validateStatusChange("open", "cancelled", "   "), "اذكر سبب إلغاء المهلة.");
  assert.equal(validateStatusChange("open", "cancelled", "صُلح بين الطرفين"), null);
  assert.equal(validateStatusChange("done", "open", undefined), "اذكر سبب إعادة فتح المهلة.");
  assert.equal(validateStatusChange("cancelled", "open", "أُلغيت خطأً"), null);
  assert.equal(validateStatusChange("open", "done", ""), null);
  assert.equal(validateStatusChange("open", "done", "لائحة اعتراض رقم ١٢٣"), null);
  assert.equal(deadlineActionRule("open", "done").reasonRequired, false);
});

test("a change the current state does not allow is refused; a no-op and system statuses pass", () => {
  assert.match(validateStatusChange("cancelled", "done", "x") ?? "", /لا يمكن/);
  assert.match(validateStatusChange("open", "open", null) ?? "x", /^x$/); // same status → null
  assert.equal(validateStatusChange("open", "missed", null), null);
  assert.equal(validateStatusChange("open", "cancelled", "a".repeat(MAX_STATUS_REASON + 1)), "السبب أطول من المسموح.");
});

test("status_history appends, keeps other metadata, and is bounded", () => {
  const entry = { at: "2026-10-30T10:00:00Z", by: "u1", from: "open", to: "cancelled", reason: "صلح" };
  const m1 = withStatusHistory({ computation: { engineVersion: "x" } }, entry);
  assert.deepEqual(m1.computation, { engineVersion: "x" });
  assert.equal((m1.status_history as unknown[]).length, 1);
  let m: Record<string, unknown> = {};
  for (let i = 0; i < 60; i++) m = withStatusHistory(m, { ...entry, reason: String(i) });
  const h = m.status_history as { reason: string }[];
  assert.equal(h.length, 50);
  assert.equal(h[h.length - 1].reason, "59");
  assert.equal((withStatusHistory(null, entry).status_history as unknown[]).length, 1);
});

test("CODE-F32: only the latest request may land", () => {
  const g = createLatestGuard();
  const a = g.next();
  const b = g.next();
  assert.equal(g.isLatest(a), false);
  assert.equal(g.isLatest(b), true);
});

test("CODE-F32: the cut notice and the «N+» counters", () => {
  assert.equal(deadlineTruncationNoticeAr(200, 200), null);
  assert.equal(deadlineTruncationNoticeAr(200, null), null);
  assert.match(deadlineTruncationNoticeAr(200, 340) ?? "", /أقرب/);
  // cut after day 30, counting overdue (window ends at -1) → exact
  assert.deepEqual(windowCountLabel(12, { truncated: true, lastShownDaysLeft: 30 }, -1), { count: 12, atLeast: false });
  // cut while rows were still overdue → at least
  assert.deepEqual(windowCountLabel(200, { truncated: true, lastShownDaysLeft: -3 }, -1), { count: 200, atLeast: true });
  assert.deepEqual(windowCountLabel(5, { truncated: false, lastShownDaysLeft: -3 }, 7), { count: 5, atLeast: false });
});

test("wiring: route validates and logs the reason; card confirms; panel guards and has «ملغاة»", () => {
  const route = read("app/api/v1/lawyer/deadlines/[id]/route.ts");
  assert.match(route, /validateStatusChange\(existing\.status, status, reason\)/);
  assert.match(route, /withStatusHistory\(/);
  assert.match(route, /reason: reason \|\| null/);
  assert.match(route, /case_request_id, metadata"\)/);
  const card = read("app/dashboard/lawyer/_components/DeadlineCard.tsx");
  assert.doesNotMatch(card, /onClick=\{\(\) => onAction\?\.\("done"\)\}/);
  assert.match(card, /إعادة فتح/);
  assert.match(card, /reasonMissing/);
  const panel = read("app/dashboard/lawyer/_components/LawyerDeadlinesPanel.tsx");
  assert.match(panel, /createLatestGuard\(\)/);
  assert.match(panel, /isLatest\(/);
  assert.match(panel, /key: "cancelled"/);
  assert.match(panel, /deadlineTruncationNoticeAr\(/);
});

test("CODE-F06: AddDeadlineModal reports the save once, at the save — every way of closing is the same", () => {
  const modal = read("app/dashboard/lawyer/_components/AddDeadlineModal.tsx");
  assert.match(modal, /setDone\(true\);\n\s*onCreated\(res\.deadline\);/);
  assert.equal((modal.match(/onCreated\(/g) ?? []).length, 1);
  assert.match(modal, /<ModalShell[^>]*busy=\{saving\}[^>]*dirty=\{dirty\}/);
  // and the parents refresh without closing the confirmation themselves
  for (const p of ["app/dashboard/lawyer/_components/LawyerDeadlinesPanel.tsx", "app/dashboard/firm/cases/[id]/page.tsx", "components/dashboard/quickAdd/QuickAdd.tsx"]) {
    const src = read(p);
    const block = src.slice(src.indexOf("<AddDeadlineModal"), src.indexOf("<AddDeadlineModal") + 400);
    const onCreated = block.slice(block.indexOf("onCreated="));
    assert.doesNotMatch(onCreated.slice(0, 120), /setShowAdd(Deadline)?\(false\)|closeModal\(\)/, p);
  }
});
