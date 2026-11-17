/**
 * founderSaleStats.test.ts — F14: the founder sale's numbers
 * (founderSaleStats.ts): live-only revenue with VAT apart, refunds and voids,
 * conversion by buyer per utm_source / utm_campaign with an honest
 * «غير متتبَّع» row, and the webhook problem filter.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  attributionKey,
  conversionPercent,
  founderSaleStats,
  webhookProblemOf,
  webhookProblems,
  WEBHOOK_PROBLEM_FILTER,
  WEBHOOK_UNRECORDED_NOTE_AR,
  type SaleOrderRow,
} from "./founderSaleStats.ts";

const PAID_AT = "2026-11-18T08:00:00.000Z";
let n = 0;
function order(over: Partial<SaleOrderRow>): SaleOrderRow {
  n += 1;
  return {
    id: `o${n}`,
    user_id: `u${n}`,
    status: "paid",
    live: true,
    net_halalas: 299600,
    vat_halalas: 44940,
    total_halalas: 344540,
    refunded_halalas: 0,
    paid_at: PAID_AT,
    attribution: null,
    ...over,
  };
}

test("revenue: live paid orders only, net and VAT apart; a test payment and an unknown mode are never added in", () => {
  const s = founderSaleStats([
    order({}),
    order({}),
    order({ live: false }),
    order({ live: null }),
    order({ status: "initiated", paid_at: null, live: null }),
    order({ status: "cancelled", paid_at: null, live: null }),
    order({ status: "failed", paid_at: null, live: true }),
  ]);
  assert.deepEqual(s.revenue.live, {
    paidOrders: 2,
    netHalalas: 599200,
    vatHalalas: 89880,
    totalHalalas: 689080,
    reversedHalalas: 0,
    keptHalalas: 689080,
  });
  assert.equal(s.revenue.test.paidOrders, 1);
  assert.equal(s.revenue.test.totalHalalas, 344540);
  assert.equal(s.revenue.unknownMode, 1);
});

test("revenue: a refund keeps its gross in the paid total and shows the amount given back; a void gives back the whole total", () => {
  const s = founderSaleStats([
    order({}),
    order({ status: "refunded", refunded_halalas: 344540 }),
    order({ status: "voided", refunded_halalas: 0 }),
    order({ status: "paid", refunded_halalas: 999999999 }), // never more than the total
  ]);
  assert.equal(s.revenue.live.paidOrders, 4);
  assert.equal(s.revenue.live.totalHalalas, 4 * 344540);
  assert.equal(s.revenue.live.reversedHalalas, 3 * 344540);
  assert.equal(s.revenue.live.keptHalalas, 344540);
});

test("conversion: by buyer, not by order — a declined card then a paid retry is one buyer who paid", () => {
  const tw = { utm_source: "twitter", utm_campaign: "launch" };
  const s = founderSaleStats([
    order({ user_id: "A", status: "failed", paid_at: null, attribution: tw }),
    order({ user_id: "A", attribution: tw }),
    order({ user_id: "B", status: "cancelled", paid_at: null, live: null, attribution: tw }),
    order({ user_id: "C", attribution: { utm_source: "google", utm_campaign: "launch" } }),
    order({ user_id: "D", status: "initiated", paid_at: null, live: null, attribution: null }),
    order({ user_id: "E", live: false, attribution: tw }), // a test account: not a buyer
  ]);
  assert.deepEqual(s.conversion.bySource, [
    { key: "twitter", started: 2, paid: 1, revenueHalalas: 344540 },
    { key: "google", started: 1, paid: 1, revenueHalalas: 344540 },
    { key: null, started: 1, paid: 0, revenueHalalas: 0 },
  ]);
  assert.deepEqual(s.conversion.byCampaign, [
    { key: "launch", started: 3, paid: 2, revenueHalalas: 689080 },
    { key: null, started: 1, paid: 0, revenueHalalas: 0 },
  ]);
});

test("conversion: an order without attribution (before F13, or an untagged visit) is «غير متتبَّع», never guessed", () => {
  const s = founderSaleStats([order({ attribution: undefined }), order({ attribution: { utm_medium: "email" } }), order({ attribution: "x" })]);
  assert.deepEqual(s.conversion.bySource, [{ key: null, started: 3, paid: 3, revenueHalalas: 3 * 344540 }]);
});

test("attributionKey reads only the named string key, bounded", () => {
  assert.equal(attributionKey({ utm_source: " x " }, "utm_source"), "x");
  assert.equal(attributionKey({ utm_source: "y".repeat(200) }, "utm_source")?.length, 64);
  for (const bad of [null, undefined, [], "s", { utm_source: 5 }, { utm_source: "  " }]) {
    assert.equal(attributionKey(bad, "utm_source"), null);
  }
});

test("conversionPercent: whole percent, null when nobody started", () => {
  assert.equal(conversionPercent({ started: 3, paid: 1 }), 33);
  assert.equal(conversionPercent({ started: 0, paid: 0 }), null);
});

test("webhook problems: unfinished, waiting for retry, rejected, no order, wrong mode — and nothing normal", () => {
  for (const o of [null, "", "pending", "pending:error", "pending:order_lookup_failed", "rejected:amount_mismatch", "no_order", "mode_mismatch"]) {
    assert.ok(webhookProblemOf(o), String(o));
  }
  for (const o of ["granted", "already_done", "already_done:claimed_elsewhere", "failed", "recorded", "ignored"]) {
    assert.equal(webhookProblemOf(o), null, o);
  }
  const dto = webhookProblems([
    { event_id: "e1", type: "payment_paid", payment_id: "p1", live: true, received_at: PAID_AT, outcome: "rejected:amount_mismatch" },
    { event_id: "e2", type: "payment_paid", payment_id: "p2", live: true, received_at: PAID_AT, outcome: "granted" },
  ]);
  assert.equal(dto.length, 1);
  assert.equal(dto[0].eventId, "e1");
  // the PostgREST filter names exactly these outcomes
  assert.equal(
    WEBHOOK_PROBLEM_FILTER,
    "outcome.is.null,outcome.like.pending*,outcome.like.rejected*,outcome.eq.no_order,outcome.eq.mode_mismatch",
  );
});

test("the page says plainly that forged / malformed deliveries are not recorded", () => {
  assert.match(WEBHOOK_UNRECORDED_NOTE_AR, /المزوّرة/);
  assert.match(WEBHOOK_UNRECORDED_NOTE_AR, /لا يسجّلها التطبيق/);
  assert.match(WEBHOOK_UNRECORDED_NOTE_AR, /وليس المؤسس وحده/);
});
