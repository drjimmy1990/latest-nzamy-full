/**
 * fulfillDecision.test.ts — the pure half of fulfilment (B1 Task 5): what a
 * fetched Moyasar payment means for an order, the dates a purchase runs to,
 * the Arabic notices, the deploy-order error codes and the cron secret check.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  addMonthsRiyadh,
  addMonthsUtc,
  cronSecretMatches,
  fulfilmentNoticeAr,
  fulfillDecision,
  isMissingPaymentsObject,
  planPeriodEnd,
  paidUnmatchedReason,
  pickPaidPayment,
  planWindow,
  RESUME_AFTER_MS,
  resumeAllowed,
  SWEEP_MAX_ATTEMPTS,
  sweepAttemptPatch,
  sweepGaveUp,
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

test("planPeriodEnd: 1 / 3 / 6 / 12 calendar months for the four cycles, nothing else", () => {
  const now = new Date("2026-10-22T08:00:00Z");
  assert.equal(planPeriodEnd(now, "monthly")?.toISOString(), "2026-11-22T08:00:00.000Z");
  assert.equal(planPeriodEnd(now, "quarterly")?.toISOString(), "2027-01-22T08:00:00.000Z");
  assert.equal(planPeriodEnd(now, "semiannual")?.toISOString(), "2027-04-22T08:00:00.000Z");
  assert.equal(planPeriodEnd(now, "yearly")?.toISOString(), "2027-10-22T08:00:00.000Z");
  for (const b of ["once", "custom", "biannual", "", "Monthly"]) assert.equal(planPeriodEnd(now, b), null, b);
});

test("planPeriodEnd clamps to month end on the Riyadh calendar (daytime = the UTC answer)", () => {
  const cases: Array<[string, string, string]> = [
    ["2026-01-31T10:00:00Z", "monthly", "2026-02-28T10:00:00.000Z"], // 31 Jan + 1
    ["2028-01-31T10:00:00Z", "monthly", "2028-02-29T10:00:00.000Z"], // leap year
    ["2026-08-31T09:00:00Z", "semiannual", "2027-02-28T09:00:00.000Z"], // 31 Aug + 6
    ["2026-11-30T09:00:00Z", "quarterly", "2027-02-28T09:00:00.000Z"], // 30 Nov + 3
    ["2028-02-29T09:00:00Z", "yearly", "2029-02-28T09:00:00.000Z"], // 29 Feb + 12
  ];
  for (const [from, billing, want] of cases) {
    assert.equal(planPeriodEnd(new Date(from), billing)?.toISOString(), want, `${from} ${billing}`);
  }
});

test("planPeriodEnd near midnight: Riyadh (UTC+3) is already on the next day, so its month end decides", () => {
  const cases: Array<[string, string, string]> = [
    // 30 Jan 22:00Z = 31 Jan 01:00 Riyadh → 28 Feb 01:00 Riyadh (the UTC rule: 28 Feb 22:00Z, already 1 Mar in Riyadh)
    ["2026-01-30T22:00:00Z", "monthly", "2026-02-27T22:00:00.000Z"],
    // 30 Aug 21:30Z = 31 Aug 00:30 Riyadh → 28 Feb 00:30 Riyadh
    ["2026-08-30T21:30:00Z", "semiannual", "2027-02-27T21:30:00.000Z"],
    // 29 Nov 21:00Z = 30 Nov 00:00 Riyadh → 28 Feb 00:00 Riyadh
    ["2026-11-29T21:00:00Z", "quarterly", "2027-02-27T21:00:00.000Z"],
    // 28 Feb 2028 22:00Z = 29 Feb 01:00 Riyadh → 28 Feb 2029 01:00 Riyadh
    ["2028-02-28T22:00:00Z", "yearly", "2029-02-27T22:00:00.000Z"],
  ];
  for (const [from, billing, want] of cases) {
    assert.equal(planPeriodEnd(new Date(from), billing)?.toISOString(), want, `${from} ${billing}`);
  }
  // addMonthsRiyadh is the same rule; addMonthsUtc keeps the UTC day (top-up lots use it)
  assert.equal(addMonthsRiyadh(new Date("2026-01-30T22:00:00Z"), 1).toISOString(), "2026-02-27T22:00:00.000Z");
  assert.equal(addMonthsUtc(new Date("2026-01-30T22:00:00Z"), 1).toISOString(), "2026-02-28T22:00:00.000Z");
});

test("planWindow: a quarterly or half-yearly plan runs 3 or 6 months, and stacks on the same rank", () => {
  const q = planWindow({ now: NOW, billing: "quarterly", tier: "pro", activeRows: [], ranks: RANKS });
  assert.equal(q?.end.toISOString(), "2027-01-22T08:00:00.000Z");
  const s = planWindow({ now: NOW, billing: "semiannual", tier: "pro", activeRows: [], ranks: RANKS });
  assert.equal(s?.end.toISOString(), "2027-04-22T08:00:00.000Z");
  const held = "2026-12-31T09:00:00.000Z";
  const stacked = planWindow({
    now: NOW, billing: "quarterly", tier: "pro", ranks: RANKS,
    activeRows: [{ id: "y", tier: "pro", current_period_end: held }],
  });
  assert.equal(stacked?.start.toISOString(), held);
  assert.equal(stacked?.end.toISOString(), "2027-03-31T09:00:00.000Z");
});

// Owner ٢٩١ (26 Oct 2026): standard subscriptions open with 0 points; points
// come from top-ups only. No plan copy may promise points every month.
const MONTHLY_POINTS_PROMISE =
  /نقطة كل شهر|نقاط كل شهر|نقطة شهرياً|نقاط شهرياً|نقطة في الشهر|١٬٥٠٠ كل شهر|رصيد الشهر التالي|نقاط الشهر|points every month|points a month|points per month|points\/month|1,500 \/ month|next month's points|month's points/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

test("no pricing or plan copy promises points every month (owner ٢٩١: points by top-up only)", () => {
  const src = join(import.meta.dirname, "../..");
  const dirs = ["constants/pricing", "app/pro", "app/register", "app/pricing", "lib/pricing", "components/pricing"];
  const bad: string[] = [];
  let scanned = 0;
  for (const d of dirs) {
    for (const file of sourceFiles(join(src, d))) {
      scanned++;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (MONTHLY_POINTS_PROMISE.test(line)) bad.push(`${file.slice(src.length + 1)}:${i + 1}`);
      });
    }
  }
  assert.ok(scanned > 10, `only ${scanned} files scanned — the directories moved`);
  assert.deepEqual(bad, []);
});

test("grantPurchase credits no lot for a plan (no PLAN_MONTHLY_POINTS any more)", () => {
  const grant = readFileSync(join(import.meta.dirname, "grantPurchase.ts"), "utf8");
  assert.doesNotMatch(grant, /PLAN_MONTHLY_POINTS|MONTHLY_POINTS_PLAN_IDS|source: "plan_monthly"/);
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

// ── fix round 1 ─────────────────────────────────────────────────────────────

const RANKS = { free: 0, shield: 1, ai: 2, pro: 3, max: 4, corp: 5, enterprise: 6 } as const;
const NOW = new Date("2026-10-22T08:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

test("pickPaidPayment: none, one failed, one paid, two with one paid, two paid → the newest paid", () => {
  const p = (id: string, status: string, createdAt: string | null) => ({ id, status, createdAt, metadata: { order_id: ORDER_ID } });
  assert.equal(pickPaidPayment([], ORDER_ID), null);
  assert.equal(pickPaidPayment(null, ORDER_ID), null);
  assert.equal(pickPaidPayment([p("a", "failed", "2026-10-22T08:00:00Z")], ORDER_ID), null);
  assert.equal(pickPaidPayment([p("a", "paid", "2026-10-22T08:00:00Z")], ORDER_ID)?.id, "a");
  assert.equal(pickPaidPayment([p("a", "failed", "2026-10-22T09:00:00Z"), p("b", "paid", "2026-10-22T08:00:00Z")], ORDER_ID)?.id, "b");
  assert.equal(pickPaidPayment([p("a", "paid", "2026-10-22T08:00:00Z"), p("b", "paid", "2026-10-22T09:00:00Z")], ORDER_ID)?.id, "b");
  assert.equal(pickPaidPayment([p("a", "paid", null), p("b", "paid", "2026-10-22T09:00:00Z")], ORDER_ID)?.id, "b");
  assert.equal(pickPaidPayment([p("a", "initiated", "2026-10-22T09:00:00Z"), p("b", "authorized", null)], ORDER_ID), null);
});

test("pickPaidPayment ignores payments of other orders, even newer paid ones (an unfiltered list)", () => {
  const p = (id: string, status: string, createdAt: string, orderId: unknown) => ({ id, status, createdAt, metadata: { order_id: orderId } });
  assert.equal(pickPaidPayment([p("other", "paid", "2026-10-22T09:00:00Z", "another-order")], ORDER_ID), null);
  assert.equal(
    pickPaidPayment([p("mine", "paid", "2026-10-22T08:00:00Z", ORDER_ID), p("other", "paid", "2026-10-22T09:00:00Z", "another-order")], ORDER_ID)?.id,
    "mine",
  );
  assert.equal(pickPaidPayment([{ id: "x", status: "paid", createdAt: null, metadata: {} }], ORDER_ID), null, "no order_id → not this order's");
});

test("paidUnmatchedReason: a paid payment that names ANOTHER order never traces this one", () => {
  const theirs = payment({ metadata: { order_id: "another-order" } });
  assert.equal(paidUnmatchedReason(fulfillDecision(order(), theirs, "test"), theirs, order()), null);
  const unnamed = payment({ metadata: {} });
  assert.equal(paidUnmatchedReason(fulfillDecision(order(), unnamed, "test"), unnamed, order()), "order_mismatch",
    "a payment naming no order still leaves a trace on the order it was brought for");
});

test("paidUnmatchedReason: only a PAID payment that did not settle the order leaves a trace", () => {
  const paid = payment();
  assert.equal(paidUnmatchedReason({ reject: "amount_mismatch" }, paid, order()), "amount_mismatch");
  assert.equal(paidUnmatchedReason({ reject: "currency_mismatch" }, paid, order()), "currency_mismatch");
  assert.equal(paidUnmatchedReason({ reject: "order_mismatch" }, paid, order({ moyasar_payment_id: "pay_0" })), "order_mismatch");
  assert.equal(paidUnmatchedReason("already_done", paid, order({ status: "cancelled" })), "order_cancelled");
  assert.equal(paidUnmatchedReason("already_done", paid, order({ status: "failed" })), "order_failed");
  assert.equal(paidUnmatchedReason("grant", paid, order()), null);
  assert.equal(paidUnmatchedReason("wait", paid, order()), null);
  // a payment that is not paid took no money: no trace
  assert.equal(paidUnmatchedReason({ reject: "amount_mismatch" }, payment({ status: "failed" }), order()), null);
  assert.equal(paidUnmatchedReason("already_done", payment({ status: "initiated" }), order({ status: "cancelled" })), null);
  // end to end through the decision: a paid payment of the wrong amount
  const wrong = payment({ amount: 45884 });
  assert.equal(paidUnmatchedReason(fulfillDecision(order(), wrong, "test"), wrong, order()), "amount_mismatch");
});

test("sweep attempts: counted from metadata, the 20th gives up with a paid_unmatched trace", () => {
  assert.equal(SWEEP_MAX_ATTEMPTS, 20);
  const at = "2026-10-22T08:00:00.000Z";
  assert.deepEqual(sweepAttemptPatch({}, "pay_1", at), { sweep_attempts: 1 });
  assert.deepEqual(sweepAttemptPatch(null, "pay_1", at), { sweep_attempts: 1 });
  assert.deepEqual(sweepAttemptPatch({ sweep_attempts: 7, other: 1 }, "pay_1", at), { sweep_attempts: 8 });
  assert.deepEqual(sweepAttemptPatch({ sweep_attempts: "x" }, "pay_1", at), { sweep_attempts: 1 });
  assert.deepEqual(sweepAttemptPatch({ sweep_attempts: 19 }, "pay_1", at), {
    sweep_attempts: 20,
    paid_unmatched: { payment_id: "pay_1", reason: "sweep_gave_up", at },
  });
  assert.equal(sweepGaveUp({ sweep_attempts: 19 }), false);
  assert.equal(sweepGaveUp({ sweep_attempts: 20 }), true);
  assert.equal(sweepGaveUp(null), false);
});

test("planWindow: nothing held → starts now, one month or one year", () => {
  const w = planWindow({ now: NOW, billing: "monthly", tier: "pro", activeRows: [], ranks: RANKS });
  assert.equal(w?.start.toISOString(), NOW.toISOString());
  assert.equal(w?.end.toISOString(), "2026-11-22T08:00:00.000Z");
  assert.equal(planWindow({ now: NOW, billing: "once", tier: "pro", activeRows: [], ranks: RANKS }), null);
});

test("planWindow: a lapsed row (status still active, period ended) is not running and never counts", () => {
  const w = planWindow({
    now: NOW, billing: "monthly", tier: "ai", ranks: RANKS,
    activeRows: [{ id: "old-max", tier: "max", current_period_end: inDays(-3) }],
  });
  assert.deepEqual(w?.running, []);
  assert.equal(w?.start.toISOString(), NOW.toISOString());
});

test("planWindow: the same rank stacks — monthly with 20 days left + monthly → old end + 1 month", () => {
  const oldEnd = inDays(20);
  const w = planWindow({
    now: NOW, billing: "monthly", tier: "pro", ranks: RANKS,
    activeRows: [{ id: "m", tier: "pro", current_period_end: oldEnd }],
  });
  assert.equal(w?.start.toISOString(), new Date(oldEnd).toISOString());
  assert.equal(w?.end.toISOString(), addMonthsUtc(new Date(oldEnd), 1).toISOString());
});

test("planWindow: yearly held + monthly bought (same rank) → yearly end + 1 month", () => {
  const yearEnd = inDays(300);
  const w = planWindow({
    now: NOW, billing: "monthly", tier: "pro", ranks: RANKS,
    activeRows: [{ id: "y", tier: "pro", current_period_end: yearEnd }],
  });
  assert.equal(w?.end.toISOString(), addMonthsUtc(new Date(yearEnd), 1).toISOString());
});

test("planWindow: an upgrade starts now; a higher or open-ended same rank row is left to planGrantDecision", () => {
  const up = planWindow({
    now: NOW, billing: "monthly", tier: "max", ranks: RANKS,
    activeRows: [{ id: "p", tier: "pro", current_period_end: inDays(20) }],
  });
  assert.equal(up?.start.toISOString(), NOW.toISOString(), "lower → higher starts now (pro-rata is B2)");
  const open = planWindow({
    now: NOW, billing: "monthly", tier: "pro", ranks: RANKS,
    activeRows: [{ id: "admin", tier: "pro", current_period_end: null }],
  });
  assert.equal(open?.start.toISOString(), NOW.toISOString(), "an open-ended row cannot be stacked onto");
  assert.equal(open?.running.length, 1);
});
