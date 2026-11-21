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
import { TERMS_LAST_UPDATED_AR } from "../legal/termsVersion.ts";
import { quote } from "./catalog.ts";
import { refundDecision, VOID_WINDOW_MS } from "./refundDecision.ts";
import {
  FOUNDER_REFUND_LINE_AR,
  FOUNDER_REFUND_LINE_EN,
  IND_AI_REFUND_LINE_AR,
  IND_AI_REFUND_LINE_EN,
  LIBRARY_REFUND_MAX_FULL_TEXTS,
  SUBSCRIPTION_REFUND_LINE_AR,
  SUBSCRIPTION_REFUND_LINE_EN,
  TOPUP_REFUND_LINE_AR,
  TOPUP_REFUND_LINE_EN,
} from "./refundPolicy.ts";
import { FOUNDER_REFUND_CLAUSE, FOUNDER_TERMS_ITEMS } from "../founder/founderTerms.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const PAGE = readFileSync(join(ROOT, "src", "app", "refund-policy", "page.tsx"), "utf8");
const TERMS = readFileSync(join(ROOT, "src", "app", "terms", "page.tsx"), "utf8");

/** The page's strings without its // comments (what a reader sees). */
const visible = (src: string) => src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

test("the owner's numbers", () => {
  assert.equal(INSTANT_CANCEL_MINUTES, 90);
  assert.equal(WITHDRAWAL_DAYS, 14);
  // l12 (owner item 69): a top-up is refundable only while none of its points was spent (was 5 %)
  assert.equal(WITHDRAWAL_MAX_POINTS_USED_PCT, 0);
  assert.equal(CONSULTATION_CANCEL_HOURS, 24);
  assert.equal(PROMO_POINTS_VALIDITY_DAYS, 90);
  assert.deepEqual(RENEWAL_REMINDER_DAYS, [7, 3]);
});

test("finding 3: the top-up validity is the price book's on-sale packs — what checkout sells today", () => {
  const packs = topupValidityMonths();
  // l12 (owner Q87): the 50 pack is retired, so the page no longer names it
  assert.deepEqual(packs.map((t) => [t.sar, t.months]), [[100, 3], [250, 3], [500, 3], [1000, 6], [2500, 12], [5000, 12], [10000, 12]]);
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

test("a plan's ≤ 5 % points warning stays the refund code's own (l12 moved only the TOP-UP rule to 0)", () => {
  const order = { status: "paid", kind: "plan", paid_at: "2026-10-20T08:00:00Z" };
  const now = new Date("2026-10-26T08:00:00Z");
  const at = (pct: number) => refundDecision(order, now, { pointsUsedFromOrderLot: 0, planPointsUsedPct: pct })?.warnings ?? [];
  assert.equal(at(5).length, 0);
  assert.equal(at(5.01).length, 1);
});

test("the page agrees with refundPolicy.ts: new sentences built from it, the owner's verbatim clauses carry the same numbers", () => {
  // the P7 sentences are built from the constants, not typed
  for (const name of ["INSTANT_CANCEL_MINUTES", "WITHDRAWAL_DAYS", "...renewalReminderLinesAr()", "...renewalReminderLinesEn()", "...promoPointsLinesAr()", "...promoPointsLinesEn()", "topupValidityAr()", "topupValidityEn()"]) {
    assert.ok(PAGE.includes(name), name);
  }
  const text = visible(PAGE);
  assert.ok(!text.includes("٩٠ دقيقة") && !text.includes("90 minutes"), "the instant-cancel window is typed, not built");
  // l8 (٦٤): the per-product lines are built from the constants
  for (const name of ["FOUNDER_REFUND_LINE_AR", "SUBSCRIPTION_REFUND_LINE_AR", "TOPUP_REFUND_LINE_AR", "FOUNDER_REFUND_LINE_EN", "SUBSCRIPTION_REFUND_LINE_EN", "TOPUP_REFUND_LINE_EN"]) {
    assert.ok(PAGE.includes(name), name);
  }
  assert.ok(SUBSCRIPTION_REFUND_LINE_AR.includes(`خلال (${arNumber(WITHDRAWAL_DAYS)}) يوماً من الشراء`));
  assert.ok(TOPUP_REFUND_LINE_AR.includes("بشرط ألا يكون قد صُرف شيء من نقاطها"));
  assert.ok(TOPUP_REFUND_LINE_AR.includes("ولا تُسترد النقاط الإضافية ولا نقاط الهدايا"));
  assert.ok(text.includes(`قبل ${arNumber(CONSULTATION_CANCEL_HOURS)} ساعة من موعد الجلسة الاستشارية`));
  assert.ok(text.includes(`الإلغاء قبل ${arNumber(CONSULTATION_CANCEL_HOURS)} ساعة`));
  assert.ok(SUBSCRIPTION_REFUND_LINE_EN.includes(`within (${WITHDRAWAL_DAYS}) days of purchase`));
  assert.ok(TOPUP_REFUND_LINE_EN.includes("provided none of its points has been spent"));
  assert.ok(text.includes(`up to ${CONSULTATION_CANCEL_HOURS} hours before the consultation session`));
  // no other value of these numbers anywhere in the visible text
  for (const other of ["(٧) يوماً", "(٣٠) يوماً", "١٠٪ من رصيد", "قبل ٤٨ ساعة", "(7) days", "(30) days", "up to 48 hours"]) {
    assert.ok(!text.includes(other), other);
  }
});

test("the sentences the page shows", () => {
  assert.equal(topupValidityAr(), "حزم ١٠٠ و٢٥٠ و٥٠٠ ر.س: ٣ أشهر؛ حزمة ١٬٠٠٠ ر.س: ٦ أشهر؛ حزم ٢٬٥٠٠ و٥٬٠٠٠ و١٠٬٠٠٠ ر.س: ١٢ شهراً");
  assert.equal(topupValidityEn(), "SAR 100, 250 and 500: 3 months; SAR 1,000: 6 months; SAR 2,500, 5,000 and 10,000: 12 months");
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

test("٥٠ (l8): the page says the remaining value is deducted AT the upgrade and a downgrade is refused — what checkout does", () => {
  assert.equal(SHOW_UPGRADE_PRORATION, true);
  const [ar] = upgradeProrationLinesAr();
  const [en] = upgradeProrationLinesEn();
  assert.match(ar, /يُخصم المتبقي من قيمة باقتك الحالية المدفوعة من سعر الباقة الجديدة لحظة الترقية/);
  assert.match(ar, /لا يمكن شراء باقة أدنى ما دامت باقة أعلى سارية/);
  assert.match(en, /at the moment of the upgrade/);
  for (const line of [ar, en]) assert.doesNotMatch(line, /الفاتورة التالية|next invoice/);
  assert.deepEqual(upgradeProrationLinesAr(false), []);
  // the checkout's own rule (l6-pay upgradeProration.ts): the credit off the new price, a downgrade refused
  const proration = readFileSync(join(ROOT, "src", "lib", "payments", "upgradeProration.ts"), "utf8");
  assert.ok(proration.includes('export const UPGRADE_DOWNGRADE_AR = "لديك باقة أعلى سارية؛ لا يمكن شراء باقة أدنى قبل انتهائها"'));
  assert.ok(proration.includes("يُخصم المتبقي من باقتك الحالية"));
  assert.ok(PAGE.includes("...upgradeProrationLinesAr()"));
  assert.ok(PAGE.includes("...upgradeProrationLinesEn()"));
});

test("l8 (owner 18 Nov, 1.2 / ج8): ONE founder refund text — /founder-terms item ٧ word for word on /refund-policy", () => {
  const item7 = FOUNDER_TERMS_ITEMS.find((i) => i.id === "refund")?.paragraphs?.[0];
  assert.equal(item7, FOUNDER_REFUND_CLAUSE);
  assert.ok(FOUNDER_REFUND_LINE_AR.endsWith(FOUNDER_REFUND_CLAUSE));
  assert.ok(FOUNDER_REFUND_CLAUSE.includes("خلال **14 يوماً** من الشراء بشرط **ألا تكون قد استخدمت أي ميزة ذكاء اصطناعي"));
  // ٦٤: the library / bundles share the no-AI rule; the 5 % belongs to top-ups only
  assert.ok(SUBSCRIPTION_REFUND_LINE_AR.includes("المكتبة القانونية والباقات المدمجة"));
  assert.ok(SUBSCRIPTION_REFUND_LINE_AR.includes("أي ميزة ذكاء اصطناعي"));
  assert.ok(!SUBSCRIPTION_REFUND_LINE_AR.includes("٪"));
  assert.ok(TOPUP_REFUND_LINE_AR.startsWith("**شحن النقاط**"));
  // the old clause that let a founder use 5 % of the points is gone from the page
  const text = visible(PAGE);
  assert.ok(!text.includes("رصيد وحدات الاستخدام"));
  assert.ok(!text.includes("usage units"));
  // l12: the date is the terms version's own (termsVersion.ts), so the two never drift
  assert.ok(PAGE.includes("آخر تحديث: ${TERMS_LAST_UPDATED_AR}"), "the last-update date is the current terms version's");
  assert.equal(TERMS_LAST_UPDATED_AR, "٢٢ نوفمبر ٢٠٢٦");
});

test("l9 (register 16 / 44): the 5-full-text rule on the founder and library-including lines; ind-ai says «no refund in practice»; the page shows all three", () => {
  assert.equal(LIBRARY_REFUND_MAX_FULL_TEXTS, 5);
  assert.ok(FOUNDER_REFUND_CLAUSE.includes("**وألا تكون قد قرأت أكثر من 5 ملفات نصاً كاملاً في المكتبة القانونية**"));
  assert.ok(FOUNDER_REFUND_CLAUSE.includes("ولا يمنع الاسترداد تصفح المكتبة القانونية العادية في هذه الحدود"));
  assert.ok(FOUNDER_REFUND_LINE_EN.includes("you have not read more than 5 files in full text in the legal library"));
  assert.ok(SUBSCRIPTION_REFUND_LINE_AR.includes("وألا تكون قد قرأت أكثر من (٥) ملفات نصاً كاملاً في المكتبة القانونية إن كان الاشتراك يشمل المكتبة"));
  assert.ok(SUBSCRIPTION_REFUND_LINE_EN.includes("you have not read more than (5) files in full text"));
  assert.ok(IND_AI_REFUND_LINE_AR.includes("لا استرداد لها فعلياً"));
  assert.ok(IND_AI_REFUND_LINE_EN.includes("in practice it has no refund"));
  for (const name of ["IND_AI_REFUND_LINE_AR", "IND_AI_REFUND_LINE_EN"]) assert.ok(PAGE.includes(name), name);
  // the CTA under /pricing says the same (the third refund text, l8)
  const cta = readFileSync(join(ROOT, "src", "components", "pricing", "PricingCTA.tsx"), "utf8");
  assert.ok(cta.includes("ولم يُقرأ أكثر من ٥ ملفات نصاً كاملاً في المكتبة"));
});
