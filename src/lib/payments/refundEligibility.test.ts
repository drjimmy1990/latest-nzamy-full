import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { cleanOverrideReason, needsOverride, NO_EVIDENCE, REFUND_WINDOW_MS, refundEligibility, ruleFor, type RefundEvidence } from "./refundEligibility.ts";
import { WITHDRAWAL_DAYS } from "./refundPolicy.ts";

const PAID = "2026-11-20T10:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(PAID) + ms);
const ev = (over: Partial<RefundEvidence> = {}): RefundEvidence => ({ ...NO_EVIDENCE, creditsUsed: {}, aiRuns: [], ...over });
const member = { kind: "membership", paid_at: PAID };

test("the window is WITHDRAWAL_DAYS (14) from paid_at: day 14 to the second is in, one second later is out", () => {
  assert.equal(WITHDRAWAL_DAYS, 14);
  assert.equal(refundEligibility(member, at(REFUND_WINDOW_MS), ev())?.state, "eligible");
  const late = refundEligibility(member, at(REFUND_WINDOW_MS + 1000), ev());
  assert.equal(late?.state, "ineligible");
  assert.ok(late?.reasons.some((r) => r.includes("انقضت نافذة")));
  assert.equal(refundEligibility(member, at(3 * 86400000 + 5), ev())?.daysSincePayment, 3);
});

test("founder: no AI use + inside the window → «مؤهل», enforced", () => {
  const v = refundEligibility(member, at(60_000), ev())!;
  assert.deepEqual([v.state, v.enforced, v.rule, v.label], ["eligible", true, "no_ai_use", "مؤهل للاسترداد"]);
  assert.equal(needsOverride(v), false);
  // batch l9: the line is now the 5-full-text count (previews and lists never count)
  assert.ok(v.lines.some((l) => l.includes("ملفات المكتبة المقروءة نصاً كاملاً منذ الدفع: ٠، والحد ٥")), "the full-text count is shown");
});

test("founder: any credit, AI run or points debit since payment blocks it", () => {
  for (const e of [ev({ creditsUsed: { drafting_work: 1 } }), ev({ creditsUsed: { library_question: 2 } }), ev({ aiRuns: [{ tool: "library-assistant", created_at: PAID }] }), ev({ pointsDebited: 5 })]) {
    const v = refundEligibility(member, at(60_000), e)!;
    assert.equal(v.state, "ineligible");
    assert.ok(v.reasons.includes("استُخدمت ميزة ذكاء اصطناعي منذ الدفع."));
    assert.equal(needsOverride(v), true);
  }
  const v = refundEligibility(member, at(60_000), ev({ creditsUsed: { drafting_work: 2, library_question: 1 }, aiRuns: [{ tool: "drafter", created_at: PAID }, { tool: "drafter", created_at: PAID }] }))!;
  assert.ok(v.lines.some((l) => l.includes("أعمال الصائغ ٢") && l.includes("أسئلة مساعد المكتبة ١")), v.lines.join("|"));
  assert.ok(v.lines.some((l) => l.includes("drafter × ٢")));
});

test("fail closed: a failed evidence read is «تعذّر التحقق», never «مؤهل», and needs the override", () => {
  const v = refundEligibility(member, at(60_000), ev({ readFailed: true }))!;
  assert.equal(v.state, "unverified");
  assert.equal(v.label, "تعذّر التحقق من الأهلية");
  assert.equal(needsOverride(v), true);
});

test("l8 (٦٤): the library uses the founder's no-AI rule and is ENFORCED — its own assistant and its own points count, another tool does not", () => {
  assert.equal(ruleFor("library"), "no_ai_use");
  const lib = (e: RefundEvidence) => refundEligibility({ kind: "library", paid_at: PAID }, at(60_000), e)!;
  const asked = lib(ev({ aiRuns: [{ tool: "library-assistant", created_at: PAID }] }));
  assert.deepEqual([asked.state, asked.enforced, needsOverride(asked)], ["ineligible", true, true]);
  assert.ok(asked.reasons.includes("استُخدمت ميزة ذكاء اصطناعي في الاشتراك منذ الدفع."));
  assert.equal(asked.ruleLabel, "سياسة الاسترداد: بلا استخدام ذكاء اصطناعي");
  const spent = lib(ev({ orderLotTotal: 300, orderLotUsed: 5 }));
  assert.equal(spent.state, "ineligible", "points of the library plan's own lot spent");
  // a drafter run paid by another plan, or points debited elsewhere, are not the library's AI
  const other = lib(ev({ aiRuns: [{ tool: "legal-drafter", created_at: PAID }], pointsDebited: 500 }));
  assert.deepEqual([other.state, needsOverride(other)], ["eligible", false]);
  assert.ok(other.lines.some((l) => l.includes("المعاينة والقوائم لا تُحتسب")));
  const late = lib(ev());
  assert.equal(late.state, "eligible");
  assert.equal(refundEligibility({ kind: "library", paid_at: PAID }, at(REFUND_WINDOW_MS + 1000), ev())!.state, "ineligible");
});

test("l12 (owner item 69): a top-up is refundable only while NONE of its own lot was spent — ENFORCED", () => {
  assert.equal(ruleFor("topup"), "points_5pct");
  const top = (used: number) => refundEligibility({ kind: "topup", paid_at: PAID }, at(60_000), ev({ orderLotTotal: 1000, orderLotUsed: used, aiRuns: [{ tool: "x", created_at: PAID }] }))!;
  assert.deepEqual([top(0).state, top(0).enforced, needsOverride(top(0))], ["eligible", true, false], "nothing spent is allowed; AI runs do not matter for a top-up");
  assert.deepEqual([top(1).state, needsOverride(top(1))], ["ineligible", true], "one point spent ends it (was 5 %)");
  assert.ok(top(1).reasons.includes("صُرف شيء من نقاط هذه الشحنة."));
  assert.ok(top(1).lines.some((l) => l.includes("والشرط ألا يُصرف منها شيء")));
  assert.equal(top(1).ruleLabel, "سياسة الاسترداد: شحن النقاط (بلا صرف شيء من نقاط الشحنة)");
});

test("a plan uses the no-AI rule but stays advisory (٦٤ names the library and the bundles only — owner question)", () => {
  assert.equal(ruleFor("plan"), "no_ai_use");
  const plan = refundEligibility({ kind: "plan", paid_at: PAID }, at(60_000), ev({ aiRuns: [{ tool: "x", created_at: PAID }] }))!;
  assert.deepEqual([plan.state, plan.enforced, needsOverride(plan)], ["ineligible", false, false]);
  assert.ok(plan.lines.some((l) => l.includes("إرشادي")));
});

test("an order the platform owes back (already_entitled: nothing granted) is never blocked, whatever its kind", () => {
  for (const kind of ["membership", "library", "topup"]) {
    const v = refundEligibility({ kind, paid_at: PAID, metadata: { already_entitled: true } }, at(40 * 86400000), ev({ aiRuns: [{ tool: "library-assistant", created_at: PAID }], orderLotTotal: 100, orderLotUsed: 100 }))!;
    assert.equal(v.state, "ineligible", kind);
    assert.deepEqual([v.enforced, needsOverride(v)], [false, false], kind);
    assert.ok(v.lines.some((l) => l.includes("مستحقة الاسترداد")), kind);
  }
});

test("no paid_at → null", () => {
  assert.equal(refundEligibility({ kind: "membership", paid_at: null }, new Date(), ev()), null);
});

test("the override reason is trimmed, at least 10 characters, capped at 500", () => {
  assert.equal(cleanOverrideReason("  قصير  "), null);
  assert.equal(cleanOverrideReason(42), null);
  assert.equal(cleanOverrideReason("  رُفض توثيق الرخصة   بعد المراجعة "), "رُفض توثيق الرخصة بعد المراجعة");
  assert.equal(cleanOverrideReason("ا".repeat(900))?.length, 500);
});

test("the admin refund route enforces the verdict and forwards the typed reason; the orders page shows the verdict above the button", () => {
  const root = join(import.meta.dirname, "..", "..", "..");
  const route = readFileSync(join(root, "src/app/api/v1/admin/payments/orders/[id]/refund/route.ts"), "utf8");
  assert.match(route, /enforceEligibility: true,/);
  assert.match(route, /overrideReason: \(body as \{ overrideReason\?: unknown \}\)\.overrideReason/);
  const page = readFileSync(join(root, "src/app/dashboard/admin/subscriptions/orders/page.tsx"), "utf8");
  assert.ok(page.indexOf("<VerdictBox") > -1 && page.indexOf("<VerdictBox") < page.indexOf("تأكيد الاسترداد"), "the verdict comes before the button");
  assert.match(page, /needsReason\(review\) && overrideReason\.trim\(\)\.length < MIN_OVERRIDE_REASON_CHARS/);
});

test("the elapsed-days line is correct Arabic for 0, 1, 2, 3, 11 and 14 days", () => {
  const line = (days: number) => refundEligibility(member, at(days * 86400000 + 60_000), ev())!.lines[0];
  assert.match(line(0), /^مضى على الدفع أقل من يوم،/);
  assert.match(line(1), /^مضى على الدفع يوم واحد،/);
  assert.match(line(2), /^مضى على الدفع يومان،/);
  assert.match(line(3), /^مضى على الدفع ٣ أيام،/);
  assert.match(line(11), /^مضى على الدفع ١١ يوماً،/);
  assert.match(line(14), /^مضى على الدفع ١٤ يوماً، ونافذة الاسترداد ١٤ يوماً/);
});

// ── batch l9 (register 14 items 16 / 44, file 16 §9.10): ≤ 5 full texts ─────
test("l9: 5 files read in full keep the refund possible; the 6th refuses it (founder and library), enforced", async () => {
  const { MAX_REFUND_FULL_TEXT_READS } = await import("./refundEligibility.ts");
  assert.equal(MAX_REFUND_FULL_TEXT_READS, 5);
  for (const kind of ["membership", "library"]) {
    const five = refundEligibility({ kind, paid_at: PAID }, at(60_000), ev({ fullTextReads: 5 }))!;
    assert.equal(five.state, "eligible", kind);
    const six = refundEligibility({ kind, paid_at: PAID }, at(60_000), ev({ fullTextReads: 6 }))!;
    assert.deepEqual([six.state, six.enforced, needsOverride(six)], ["ineligible", true, true], kind);
    assert.ok(six.reasons.includes("قُرئ نصاً كاملاً أكثر من ٥ ملفات من المكتبة منذ الدفع."), kind);
  }
});

test("l9: the read log missing (SQL not run) → «تعذّر التحقق», never «مؤهل»", () => {
  const v = refundEligibility({ kind: "library", paid_at: PAID }, at(60_000), ev({ fullTextReads: null }))!;
  assert.equal(v.state, "unverified");
  assert.ok(v.lines.some((l) => l.includes("سجل قراءة النصوص الكاملة غير متاح بعد")));
});

test("l9: a top-up never carries the rule; a plan only when its tier includes the library (advisory)", async () => {
  const { orderIncludesLibrary } = await import("./refundEligibility.ts");
  const top = refundEligibility({ kind: "topup", paid_at: PAID }, at(60_000), ev({ orderLotTotal: 100, fullTextReads: 40 }))!;
  assert.equal(top.state, "eligible");
  assert.equal(orderIncludesLibrary({ kind: "library" }), true);
  assert.equal(orderIncludesLibrary({ kind: "membership" }), true);
  assert.equal(orderIncludesLibrary({ kind: "topup", item_id: "topup-500" }), false);
  assert.equal(orderIncludesLibrary({ kind: "plan", item_id: "no-such-plan" }), false);
  assert.equal(orderIncludesLibrary({ kind: "plan", item_id: "ind-ai" }), false, "the AI tier has no library");
  assert.equal(orderIncludesLibrary({ kind: "plan", item_id: "ind-preventive" }), true, "a Pro-tier plan includes the library");
  const plan = refundEligibility({ kind: "plan", paid_at: PAID, item_id: "ind-preventive" }, at(60_000), ev({ fullTextReads: 9 }))!;
  assert.deepEqual([plan.state, plan.enforced], ["ineligible", false]);
});

test("l9: the evidence reads distinct documents since payment from full_text_reads, only where the plan includes the library", () => {
  const src = readFileSync(join(import.meta.dirname, "refundEvidence.ts"), "utf8");
  assert.match(src, /if \(orderIncludesLibrary\(order\)\) \{/);
  assert.match(src, /from\("full_text_reads"\)\.select\("doc_key"\)\.eq\("user_id", order\.user_id\)/);
  assert.match(src, /\.gt\("opened_at", since\)/);
  assert.match(src, /new Set\(/);
});
