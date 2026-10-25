/**
 * refundPolicy.test.ts — the refund page's numbers and the refund code agree
 * (P7; owner ١٨٠, ٢٨٨, ٢٨٩ and the 26-Oct pack validity; pricing doc §13ج),
 * and the page says nothing checkout contradicts (P7 review, finding 3): the
 * top-up validity is the price book's, the renewal reminders and the 90-day
 * promotional points stay hidden until they are true, and the 90-minute
 * cancel is asked of support.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  afterWithdrawalLineAr,
  afterWithdrawalLineEn,
  arNumber,
  CONSULTATION_CANCEL_HOURS,
  INSTANT_CANCEL_MINUTES,
  PROMO_POINTS_VALIDITY_DAYS,
  monthsAr,
  promoPointsLinesAr,
  promoPointsLinesEn,
  RENEWAL_REMINDER_DAYS,
  renewalReminderLinesAr,
  renewalReminderLinesEn,
  renewalRemindersAr,
  SHOW_PROMO_POINTS_VALIDITY,
  SHOW_RENEWAL_REMINDERS,
  SUBSCRIPTIONS_AUTO_RENEW,
  SHOW_UPGRADE_PRORATION,
  upgradeProrationLinesAr,
  upgradeProrationLinesEn,
  topupValidityAr,
  topupValidityEn,
  topupValidityMonths,
  WITHDRAWAL_DAYS,
  WITHDRAWAL_MAX_POINTS_USED_PCT,
} from "./refundPolicy.ts";
import { PRICE_BOOK, type BookEntry } from "../pricing/priceBook.ts";
import { quote } from "./catalog.ts";
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
});

test("finding 3: the top-up validity is the price book's on-sale packs — what checkout sells today", () => {
  const packs = topupValidityMonths();
  assert.deepEqual(packs.map((t) => [t.sar, t.months]), [[100, 3], [250, 3], [500, 6], [1000, 12]]);
  for (const { sar } of packs) {
    const entry = Object.values(PRICE_BOOK).find((e) => e.kind === "topup" && e.prices.once?.sar === sar)!;
    const q = quote(entry.id, "once");
    assert.ok(q.ok && q.netHalalas === sar * 100, `checkout sells ${entry.id} at ${sar}`);
  }
  // the owner's 26-Oct packs (P2) reach the page by changing the book only
  const p2: Record<string, BookEntry> = {};
  for (const [sar, months] of [[500, 3], [1000, 6], [2500, 12], [5000, 12], [10000, 12]] as const) {
    p2[`topup-${sar}`] = { ...PRICE_BOOK["topup-500"], id: `topup-${sar}`, prices: { once: { sar } }, pointsValidityMonths: months };
  }
  p2["topup-old"] = { ...PRICE_BOOK["topup-100"], id: "topup-old", retired: true };
  assert.equal(topupValidityAr(p2), "حزمة ٥٠٠ ر.س: ٣ أشهر؛ حزمة ١٬٠٠٠ ر.س: ٦ أشهر؛ حزم ٢٬٥٠٠ و٥٬٠٠٠ و١٠٬٠٠٠ ر.س: ١٢ شهراً");
  assert.equal(topupValidityEn(p2), "SAR 500: 3 months; SAR 1,000: 6 months; SAR 2,500, 5,000 and 10,000: 12 months");
});

test("finding 3: the renewal reminders (B2) and the 90-day promotional points (not enforced) are off and render nothing", () => {
  assert.equal(SHOW_RENEWAL_REMINDERS, false);
  assert.equal(SHOW_PROMO_POINTS_VALIDITY, false);
  assert.deepEqual(renewalReminderLinesAr(), []);
  assert.deepEqual(renewalReminderLinesEn(), []);
  assert.deepEqual(promoPointsLinesAr(), []);
  assert.deepEqual(promoPointsLinesEn(), []);
  // kept for the day they are true
  assert.ok(renewalReminderLinesAr(true)[0].includes(renewalRemindersAr()));
  assert.ok(promoPointsLinesAr(true)[0].includes(`(${arNumber(PROMO_POINTS_VALIDITY_DAYS)}) يوماً`));
  assert.ok(promoPointsLinesEn(true)[0].includes(`(${PROMO_POINTS_VALIDITY_DAYS}) days`));
  assert.ok(renewalReminderLinesEn(true)[0].includes("7 days"));
  // and the page carries neither sentence in its own text
  const text = visible(PAGE);
  for (const gone of ["تذكير التجديد", "النقاط الترويجية", "Renewal reminders", "Promotional points", "٢٬٥٠٠", "2,500"]) {
    assert.ok(!text.includes(gone), gone);
  }
});

test("finding 3: the 90-minute instant cancel is asked of support (no self-service button), in the section and the banner", () => {
  const text = visible(PAGE);
  assert.ok(text.includes("**الإلغاء الفوري عند الشراء بالخطأ** (تُطلب من الدعم)"));
  assert.ok(text.includes("(requested from support): within"));
  assert.ok(text.includes("من الشراء بالخطأ (يُطلب من الدعم)"));
  assert.ok(text.includes("purchase made by mistake (requested from support)"));
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
  for (const name of ["INSTANT_CANCEL_MINUTES", "WITHDRAWAL_DAYS", "...renewalReminderLinesAr()", "...renewalReminderLinesEn()", "...promoPointsLinesAr()", "...promoPointsLinesEn()", "topupValidityAr()", "topupValidityEn()"]) {
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
  assert.equal(topupValidityAr(), "حزمتا ١٠٠ و٢٥٠ ر.س: ٣ أشهر؛ حزمة ٥٠٠ ر.س: ٦ أشهر؛ حزمة ١٬٠٠٠ ر.س: ١٢ شهراً");
  assert.equal(topupValidityEn(), "SAR 100 and 250: 3 months; SAR 500: 6 months; SAR 1,000: 12 months");
  assert.deepEqual([1, 2, 3, 10, 11, 12].map(monthsAr), ["شهر واحد", "شهران", "٣ أشهر", "١٠ أشهر", "١١ شهراً", "١٢ شهراً"]);
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

// ── final review, item 4: no auto-renewal promise the code does not keep ────

test("no subscription renews automatically, so the page promises no cancel control", () => {
  assert.equal(SUBSCRIPTIONS_AUTO_RENEW, false);
  // The grant writes auto_renew = false; nothing charges a saved card at the period's end.
  const grant = readFileSync(join(ROOT, "supabase", "migrations", "20261025_10_grant_plan_atomic.sql"), "utf8");
  assert.match(grant, /p_period_start, p_period_end,\s+false, p_payment_method/);
  assert.match(afterWithdrawalLineAr(), /لا تتجدد الاشتراكات تلقائياً/);
  assert.match(afterWithdrawalLineEn(), /do not renew automatically/);
  for (const line of [afterWithdrawalLineAr(), afterWithdrawalLineEn()]) {
    assert.equal(/إعدادات الحساب|account settings/.test(line), false, line);
  }
  const page = visible(PAGE);
  assert.equal(page.includes("إلغاء التجديد التلقائي"), false);
  assert.equal(page.includes("automatic renewal can be cancelled"), false);
  assert.match(page, /afterWithdrawalLineAr\(\)/);
  assert.match(page, /afterWithdrawalLineEn\(\)/);
  // kept for the day B2 builds the renewal and its cancel control
  assert.match(afterWithdrawalLineAr(true), /إلغاء التجديد التلقائي/);
});

test("no upgrade is pro-rated today, so the page promises no pro-rata on a next invoice", () => {
  assert.equal(SHOW_UPGRADE_PRORATION, false);
  const decision = readFileSync(join(ROOT, "src", "lib", "payments", "fulfillDecision.ts"), "utf8");
  assert.match(decision, /pro-rata is B2/);
  assert.deepEqual(upgradeProrationLinesAr(), []);
  assert.deepEqual(upgradeProrationLinesEn(), []);
  const page = visible(PAGE);
  assert.equal(page.includes("تناسبياً على الفاتورة التالية"), false);
  assert.equal(page.includes("pro-rated on the next invoice"), false);
  // kept for the day B2 builds it
  assert.match(upgradeProrationLinesAr(true)[0], /تناسبياً/);
});
