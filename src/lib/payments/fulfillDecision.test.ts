/**
 * fulfillDecision.test.ts — the pure half of fulfilment (B1 Task 5): what a
 * fetched Moyasar payment means for an order, the dates a purchase runs to,
 * the Arabic notices, the deploy-order error codes and the cron secret check.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  addMonthsUtc,
  cronSecretMatches,
  fulfilmentNoticeAr,
  fulfillDecision,
  isMissingPaymentsObject,
  MONTHLY_POINTS_PLAN_IDS,
  PLAN_MONTHLY_POINTS,
  planPeriodEnd,
  RESUME_AFTER_MS,
  resumeAllowed,
  type FulfillOrderView,
  type FulfillPaymentView,
} from "./fulfillDecision.ts";

const ORDER_ID = "11111111-2222-4333-8444-555555555555";

function order(over: Partial<FulfillOrderView> = {}): FulfillOrderView {
  return {
    id: ORDER_ID,
    status: "initiated",
    total_halalas: 45885,
    currency: "SAR",
    merchant: "platform",
    moyasar_payment_id: null,
    ...over,
  };
}

function payment(over: Partial<FulfillPaymentView> = {}): FulfillPaymentView {
  return {
    id: "pay_1",
    status: "paid",
    amount: 45885,
    currency: "SAR",
    metadata: { order_id: ORDER_ID },
    ...over,
  };
}

// ── the decision ────────────────────────────────────────────────────────────

test("a paid payment of the right amount, currency, mode and order → grant", () => {
  assert.equal(fulfillDecision(order(), payment(), "test"), "grant");
  assert.equal(fulfillDecision(order({ status: "created" }), payment(), "test"), "grant");
  assert.equal(fulfillDecision(order(), payment({ live: true }), "live"), "grant");
  assert.equal(fulfillDecision(order(), payment(), "live", { liveFlag: true, merchant: "platform" }), "grant");
  // the payment id already stamped on the order (a 'wait' earlier) is the same payment
  assert.equal(fulfillDecision(order({ moyasar_payment_id: "pay_1" }), payment(), "test"), "grant");
});

test("a payment of 45884 for an order of 45885 → amount_mismatch", () => {
  assert.deepEqual(fulfillDecision(order(), payment({ amount: 45884 }), "test"), { reject: "amount_mismatch" });
  assert.deepEqual(fulfillDecision(order(), payment({ amount: 45886 }), "test"), { reject: "amount_mismatch" });
});

test("currency USD → currency_mismatch", () => {
  assert.deepEqual(fulfillDecision(order(), payment({ currency: "USD" }), "test"), { reject: "currency_mismatch" });
  // the case of the code does not matter
  assert.equal(fulfillDecision(order(), payment({ currency: "sar" }), "test"), "grant");
});

test("live: true in test mode → mode_mismatch, and every other disagreement", () => {
  assert.deepEqual(fulfillDecision(order(), payment({ live: true }), "test"), { reject: "mode_mismatch" });
  assert.deepEqual(fulfillDecision(order(), payment({ live: false }), "live"), { reject: "mode_mismatch" });
  // the webhook's live flag against the gateway mode
  assert.deepEqual(fulfillDecision(order(), payment(), "test", { liveFlag: true }), { reject: "mode_mismatch" });
  assert.deepEqual(fulfillDecision(order(), payment(), "live", { liveFlag: false }), { reject: "mode_mismatch" });
  // the two sources disagreeing with each other
  assert.deepEqual(
    fulfillDecision(order(), payment({ live: false }), "live", { liveFlag: true }),
    { reject: "mode_mismatch" },
  );
});

test("order_mismatch: metadata.order_id missing or different, another payment stamped, another merchant, another callback order", () => {
  const mismatch = { reject: "order_mismatch" };
  assert.deepEqual(fulfillDecision(order(), payment({ metadata: {} }), "test"), mismatch);
  assert.deepEqual(fulfillDecision(order(), payment({ metadata: { order_id: "other" } }), "test"), mismatch);
  assert.deepEqual(fulfillDecision(order(), payment({ metadata: { order_id: 42 } }), "test"), mismatch);
  assert.deepEqual(fulfillDecision(order({ moyasar_payment_id: "pay_0" }), payment(), "test"), mismatch);
  assert.deepEqual(fulfillDecision(order(), payment(), "test", { merchant: "office" }), mismatch);
  assert.deepEqual(fulfillDecision(order(), payment(), "test", { callbackOrderId: "other" }), mismatch);
  assert.equal(fulfillDecision(order(), payment(), "test", { callbackOrderId: ORDER_ID }), "grant");
});

test("order_mismatch is checked before the money: a tampered order id never reads as a price problem", () => {
  assert.deepEqual(
    fulfillDecision(order(), payment({ metadata: {}, amount: 1, currency: "USD" }), "test"),
    { reject: "order_mismatch" },
  );
});

test("an order already paid or refunded → already_done, whatever the payment says", () => {
  for (const status of ["paid", "refunded"]) {
    assert.equal(fulfillDecision(order({ status }), payment(), "test"), "already_done", status);
    assert.equal(fulfillDecision(order({ status }), payment({ amount: 1 }), "test"), "already_done", status);
    assert.equal(fulfillDecision(order({ status }), payment({ status: "failed" }), "test"), "already_done", status);
  }
});

test("a closed unpaid order (failed, voided, cancelled) never re-opens → already_done", () => {
  for (const status of ["failed", "voided", "cancelled"]) {
    assert.equal(fulfillDecision(order({ status }), payment(), "test"), "already_done", status);
  }
});

test("a failed payment → record_failed", () => {
  assert.equal(fulfillDecision(order(), payment({ status: "failed" }), "test"), "record_failed");
});

test("an initiated payment → wait; any other non-paid status never grants", () => {
  assert.equal(fulfillDecision(order(), payment({ status: "initiated" }), "test"), "wait");
  for (const status of ["authorized", "captured", "refunded", "voided", "something-new"]) {
    assert.equal(fulfillDecision(order(), payment({ status }), "test"), "wait", status);
  }
});

test("an order of an unknown status never grants", () => {
  assert.equal(fulfillDecision(order({ status: "weird" }), payment(), "test"), "already_done");
});

// ── dates ───────────────────────────────────────────────────────────────────

test("addMonthsUtc clamps to the end of a shorter month", () => {
  assert.equal(addMonthsUtc(new Date("2026-01-31T10:00:00Z"), 1).toISOString(), "2026-02-28T10:00:00.000Z");
  assert.equal(addMonthsUtc(new Date("2028-01-31T10:00:00Z"), 1).toISOString(), "2028-02-29T10:00:00.000Z");
  assert.equal(addMonthsUtc(new Date("2026-03-15T00:00:00Z"), 1).toISOString(), "2026-04-15T00:00:00.000Z");
  assert.equal(addMonthsUtc(new Date("2026-11-30T00:00:00Z"), 3).toISOString(), "2027-02-28T00:00:00.000Z");
  assert.equal(addMonthsUtc(new Date("2026-10-22T08:00:00Z"), 12).toISOString(), "2027-10-22T08:00:00.000Z");
});

test("planPeriodEnd: one month for monthly, one year for yearly, nothing else", () => {
  const now = new Date("2026-10-22T08:00:00Z");
  assert.equal(planPeriodEnd(now, "monthly")?.toISOString(), "2026-11-22T08:00:00.000Z");
  assert.equal(planPeriodEnd(now, "yearly")?.toISOString(), "2027-10-22T08:00:00.000Z");
  assert.equal(planPeriodEnd(now, "once"), null);
});

test("the monthly points come with lawyer-pro and consultant-independent only (both cards promise 1,500 a month)", () => {
  assert.deepEqual([...MONTHLY_POINTS_PLAN_IDS].sort(), ["consultant-independent", "lawyer-pro"]);
  const lawyers = readFileSync(join(import.meta.dirname, "../../constants/pricing/pricing.lawyers.ts"), "utf8");
  const providers = readFileSync(join(import.meta.dirname, "../../constants/pricing/pricing.providers.ts"), "utf8");
  const pinned = /export const LAWYER_PRO_MONTHLY_POINTS = (\d+);/.exec(lawyers);
  assert.ok(pinned, "LAWYER_PRO_MONTHLY_POINTS is gone from pricing.lawyers.ts");
  assert.equal(PLAN_MONTHLY_POINTS, Number(pinned[1]), "PLAN_MONTHLY_POINTS drifted from LAWYER_PRO_MONTHLY_POINTS");
  const consultant = providers.slice(providers.indexOf('id: "consultant-independent"'));
  assert.ok(consultant.includes("١٬٥٠٠ نقطة كل شهر"), "the consultant card no longer promises 1,500 points a month");
});

// ── resuming a paid order the sweep finds unfulfilled ───────────────────────

test("resumeAllowed: only a paid, unfulfilled order paid more than RESUME_AFTER_MS ago", () => {
  const now = Date.parse("2026-10-22T08:00:00Z");
  const old = new Date(now - RESUME_AFTER_MS - 1000).toISOString();
  const fresh = new Date(now - 1000).toISOString();
  assert.equal(RESUME_AFTER_MS, 10 * 60 * 1000);
  assert.equal(resumeAllowed({ status: "paid", fulfilled_at: null, paid_at: old }, now), true);
  assert.equal(resumeAllowed({ status: "paid", fulfilled_at: null, paid_at: fresh }, now), false);
  assert.equal(resumeAllowed({ status: "paid", fulfilled_at: null, paid_at: null }, now), false);
  assert.equal(resumeAllowed({ status: "paid", fulfilled_at: old, paid_at: old }, now), false);
  assert.equal(resumeAllowed({ status: "initiated", fulfilled_at: null, paid_at: old }, now), false);
  assert.equal(resumeAllowed({ status: "paid", fulfilled_at: null, paid_at: "not a date" }, now), false);
});

// ── deploy order ────────────────────────────────────────────────────────────

test("isMissingPaymentsObject: a missing table, column or function, by Postgres or PostgREST", () => {
  for (const code of ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]) {
    assert.equal(isMissingPaymentsObject(code), true, code);
  }
  for (const code of [undefined, null, "", "23505", "42501", "22023", "PGRST116"]) {
    assert.equal(isMissingPaymentsObject(code), false, String(code));
  }
});

// ── the Arabic notices ──────────────────────────────────────────────────────

test("fulfilmentNoticeAr: a title and a non-empty body for every kind, with the receipt number", () => {
  for (const kind of ["plan", "library", "topup"] as const) {
    const n = fulfilmentNoticeAr({ kind, labelAr: "الباقة الذكية", receiptNumber: "NZ-2026-000001", alreadyEntitled: false });
    assert.ok(n.title.trim().length > 0, kind);
    assert.ok(n.body.trim().length > 0, kind);
    assert.ok(n.body.includes("NZ-2026-000001"), kind);
    assert.ok(n.body.includes("الباقة الذكية"), kind);
    assert.equal(n.href, "/dashboard/billing");
  }
});

test("fulfilmentNoticeAr: already entitled says nothing changed and that the administration reviews a refund", () => {
  const n = fulfilmentNoticeAr({ kind: "plan", labelAr: "الباقة الذكية", receiptNumber: "NZ-2026-000002", alreadyEntitled: true });
  assert.ok(n.body.includes("NZ-2026-000002"));
  assert.match(n.body, /استرداد/);
  assert.match(n.body, /الإدارة/);
  assert.doesNotMatch(n.title + n.body, /تفعيل/);
});

test("fulfilmentNoticeAr: no receipt number yet still reads as a sentence", () => {
  const n = fulfilmentNoticeAr({ kind: "topup", labelAr: "شحن ١٠٠ (١٠٠ نقطة)", receiptNumber: null, alreadyEntitled: false });
  assert.ok(n.body.trim().length > 0);
  assert.doesNotMatch(n.body, /null|undefined/);
});

// ── the cron secret ─────────────────────────────────────────────────────────

test("cronSecretMatches: the right secret only; an unset or empty secret refuses everyone", () => {
  assert.equal(cronSecretMatches("s3cret-value", "s3cret-value"), true);
  assert.equal(cronSecretMatches("s3cret-valuX", "s3cret-value"), false);
  assert.equal(cronSecretMatches("short", "s3cret-value"), false);
  assert.equal(cronSecretMatches("s3cret-value-and-more", "s3cret-value"), false);
  assert.equal(cronSecretMatches(null, "s3cret-value"), false);
  assert.equal(cronSecretMatches("", ""), false);
  assert.equal(cronSecretMatches("anything", undefined), false);
  assert.equal(cronSecretMatches("anything", ""), false);
});

test("cronSecretMatches compares with timingSafeEqual on equal-length digests", () => {
  const src = readFileSync(join(import.meta.dirname, "fulfillDecision.ts"), "utf8");
  const fn = src.slice(src.indexOf("export function cronSecretMatches("));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /timingSafeEqual\(/);
  assert.match(body, /createHash\("sha256"\)/);
  assert.doesNotMatch(body, /===\s*secret|secret\s*===/, "no plain string comparison of the secret");
});
