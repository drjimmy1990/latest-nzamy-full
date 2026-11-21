/**
 * l12MoneyTerms.test.ts — batch l12 money: the ONE new terms version
 * (2026-11-22) carries the owner's point rule (Q87, RAW[61]) on every page
 * that states it, and the re-ask modal names what changed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CURRENT_TERMS_VERSION, TERMS_LAST_UPDATED_AR } from "./termsVersion.ts";
import { FOUNDER_TERMS_VERSION } from "../founder/founderTerms.ts";

const SRC = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const POINT = "النقطة = ريال سعودي واحد قبل ضريبة القيمة المضافة";

test("one version for /terms and /founder-terms, later than l9's 2026-11-21", () => {
  assert.equal(CURRENT_TERMS_VERSION, "2026-11-22");
  assert.equal(FOUNDER_TERMS_VERSION, CURRENT_TERMS_VERSION);
  assert.equal(TERMS_LAST_UPDATED_AR, "٢٢ نوفمبر ٢٠٢٦");
});

test("/terms §٦ states the point's value and the minimum top-up (individual 100, others 500), in both languages", () => {
  const terms = read("app/terms/page.tsx");
  assert.ok(terms.includes(`**النقاط**: ${POINT}. وأقل شحنة للفرد ١٠٠ نقطة، ولغيره من أنواع الحسابات ٥٠٠ نقطة`));
  assert.ok(terms.includes("one point equals one Saudi riyal before VAT. The smallest top-up is 100 points for individuals and 500 points"));
});

test("the re-ask modal names this version's changes (not l9's clauses 14–15)", () => {
  const gate = read("components/legal/TermsReacceptGate.tsx");
  assert.ok(gate.includes(POINT));
  assert.ok(gate.includes("وأقل شحنة للفرد ١٠٠ نقطة ولغيره ٥٠٠ نقطة"));
  assert.ok(gate.includes("ما دام لم يُصرف شيء من نقاطها"));
  assert.ok(!gate.includes("وأُضيف إليها البند ١٤"));
});

test("l12 N9 (market) rides on the same version: /terms §٦ says the platform is an intermediary and no longer that fees are collected or a commission deducted through it", () => {
  const terms = read("app/terms/page.tsx");
  assert.ok(terms.includes("في سوق الطلبات: المنصة وسيط لا ضامن ولا أمين على الأتعاب، ولا تُحصَّل الأتعاب عبر المنصة حالياً."));
  assert.ok(terms.includes("neither a guarantor nor a trustee of fees"));
  assert.ok(!terms.includes("تُقتطع عمولة الخدمة"), "no commission deducted before payout while payment is off");
  assert.ok(!terms.includes("is deducted directly from fees"));
  assert.ok(!terms.includes("عبر قنوات الدفع المعتمدة في المنصة وحدها"));
  assert.ok(!terms.includes("ويُصرف المستحق لمقدم الخدمة"));
  assert.ok(read("components/legal/TermsReacceptGate.tsx").includes("وسيط لا ضامن ولا أمين على الأتعاب"));
});

test("/founder no longer calls 50 a top-up minimum; the point line is on the top-up screens", () => {
  const founder = read("app/founder/page.tsx");
  assert.ok(!founder.includes("بحد أدنى ٥٠ نقطة"));
  assert.ok(founder.includes("أقل شحنة ٥٠٠ نقطة"));
  assert.ok(read("components/payments/TopUpModalHost.tsx").includes("{POINT_VALUE_LINE_AR}"));
  assert.ok(read("lib/payments/checkoutView.ts").includes(`export const POINT_VALUE_LINE_AR = "${POINT}";`));
});
