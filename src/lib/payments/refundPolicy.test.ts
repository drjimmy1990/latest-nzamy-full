/**
 * refundPolicy.test.ts — the refund page's numbers and the refund code agree
 * (P7; owner ١٨٠, ٢٨٨, ٢٨٩ and the 26-Oct pack validity; pricing doc §13ج).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  arNumber,
  CONSULTATION_CANCEL_HOURS,
  INSTANT_CANCEL_MINUTES,
  PROMO_POINTS_VALIDITY_DAYS,
  RENEWAL_REMINDER_DAYS,
  renewalRemindersAr,
  TOPUP_VALIDITY_MONTHS,
  topupValidityAr,
  topupValidityEn,
  WITHDRAWAL_DAYS,
  WITHDRAWAL_MAX_POINTS_USED_PCT,
} from "./refundPolicy.ts";
import { refundDecision, VOID_WINDOW_MS } from "./refundDecision.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const PAGE = readFileSync(join(ROOT, "src", "app", "refund-policy", "page.tsx"), "utf8");
const TERMS = readFileSync(join(ROOT, "src", "app", "terms", "page.tsx"), "utf8");

/** The page's strings without its // comments (what a reader sees). */
const visible = (src: string) => src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

test("the owner's numbers", () => {
  assert.equal(INSTANT_CANCEL_MINUTES, 90);
  assert.equal(WITHDRAWAL_DAYS, 14);
  assert.equal(WITHDRAWAL_MAX_POINTS_USED_PCT, 5);
  assert.equal(CONSULTATION_CANCEL_HOURS, 24);
  assert.equal(PROMO_POINTS_VALIDITY_DAYS, 90);
  assert.deepEqual(RENEWAL_REMINDER_DAYS, [7, 3]);
  assert.deepEqual(
    TOPUP_VALIDITY_MONTHS.map((t) => [t.sar, t.months]),
    [[500, 3], [1000, 6], [2500, 12], [5000, 12], [10000, 12]],
  );
});

test("the 90-minute instant cancel is the refund code's void window — a change to one fails here", () => {
  assert.equal(INSTANT_CANCEL_MINUTES * 60 * 1000, VOID_WINDOW_MS);
  const order = { status: "paid", kind: "topup", paid_at: "2026-10-26T08:00:00Z" };
  const usage = { pointsUsedFromOrderLot: 0, planPointsUsedPct: 0 };
  assert.equal(refundDecision(order, new Date(Date.parse(order.paid_at) + VOID_WINDOW_MS - 1), usage)?.method, "void");
  assert.equal(refundDecision(order, new Date(Date.parse(order.paid_at) + VOID_WINDOW_MS), usage)?.method, "refund");
});

test("the ≤ 5 % withdrawal rule is the refund code's warning threshold", () => {
  const order = { status: "paid", kind: "plan", paid_at: "2026-10-20T08:00:00Z" };
  const now = new Date("2026-10-26T08:00:00Z");
  const at = (pct: number) => refundDecision(order, now, { pointsUsedFromOrderLot: 0, planPointsUsedPct: pct })?.warnings ?? [];
  assert.equal(at(WITHDRAWAL_MAX_POINTS_USED_PCT).length, 0);
  assert.equal(at(WITHDRAWAL_MAX_POINTS_USED_PCT + 0.01).length, 1);
});

test("the page agrees with refundPolicy.ts: new sentences built from it, the owner's verbatim clauses carry the same numbers", () => {
  // the P7 sentences are built from the constants, not typed
  for (const name of ["INSTANT_CANCEL_MINUTES", "WITHDRAWAL_DAYS", "PROMO_POINTS_VALIDITY_DAYS", "RENEWAL_REMINDER_DAYS", "renewalRemindersAr()", "topupValidityAr()", "topupValidityEn()"]) {
    assert.ok(PAGE.includes(name), name);
  }
  const text = visible(PAGE);
  assert.ok(!text.includes("٩٠ دقيقة") && !text.includes("90 minutes"), "the instant-cancel window is typed, not built");
  // ١٨٠ — his clauses stay word for word (pricingHonesty.test.ts); their numbers are these constants
  assert.ok(text.includes(`خلال (${arNumber(WITHDRAWAL_DAYS)}) يوماً من تاريخ السداد`));
  assert.ok(text.includes(`أكثر من ${arNumber(WITHDRAWAL_MAX_POINTS_USED_PCT)}٪ من رصيد وحدات الاستخدام`));
  assert.ok(text.includes(`قبل ${arNumber(CONSULTATION_CANCEL_HOURS)} ساعة من موعد الجلسة الاستشارية`));
  assert.ok(text.includes(`الإلغاء قبل ${arNumber(CONSULTATION_CANCEL_HOURS)} ساعة`));
  assert.ok(text.includes(`within (${WITHDRAWAL_DAYS}) days of payment`));
  assert.ok(text.includes(`no more than ${WITHDRAWAL_MAX_POINTS_USED_PCT}% of the usage units`));
  assert.ok(text.includes(`up to ${CONSULTATION_CANCEL_HOURS} hours before the consultation session`));
  // no other value of these numbers anywhere in the visible text
  for (const other of ["(٧) يوماً", "(٣٠) يوماً", "١٠٪ من رصيد", "قبل ٤٨ ساعة", "(7) days", "(30) days", "up to 48 hours"]) {
    assert.ok(!text.includes(other), other);
  }
});

test("the sentences the page shows", () => {
  assert.equal(topupValidityAr(), "حزمة ٥٠٠ ر.س: ٣ أشهر؛ حزمة ١٬٠٠٠ ر.س: ٦ أشهر؛ حزم ٢٬٥٠٠ و٥٬٠٠٠ و١٠٬٠٠٠ ر.س: ١٢ شهراً");
  assert.equal(topupValidityEn(), "SAR 500: 3 months; SAR 1,000: 6 months; SAR 2,500, 5,000 and 10,000: 12 months");
  assert.equal(renewalRemindersAr(), "تذكيراً أول قبل ٧ أيام، وتذكيراً ثانياً قبل ٣ أيام من موعد التجديد");
  assert.equal(arNumber(10000), "١٠٬٠٠٠");
});

test("٢٨٩: no Escrow / حساب الضمان wording a reader sees on the refund or terms page", () => {
  for (const [name, src] of [["refund-policy", PAGE], ["terms", TERMS]] as const) {
    const text = visible(src);
    assert.ok(!/escrow/i.test(text), `${name}: Escrow`);
    assert.ok(!text.includes("حساب الضمان"), `${name}: حساب الضمان`);
  }
});
