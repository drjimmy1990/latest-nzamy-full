/**
 * resultView.test.ts — what /payments/result shows for each fulfilment
 * outcome (Moyasar payments B1, Task 6). Success only for 'granted', or
 * 'already_done' with no reason (Task 5 note); the page never trusts a
 * ?status= in the URL, so nothing here takes one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fulfilmentNoticeAr } from "./fulfillDecision.ts";
import {
  AUTO_REFRESH_INTERVAL_MS,
  AUTO_REFRESH_WINDOW_MS,
  autoRefreshDecision,
  paymentResultView,
  pendingView,
  resultViewWithoutPayment,
  type ResultOrder,
} from "./resultView.ts";

const order: ResultOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "plan",
  item_id: "lawyer-pro",
  billing: "monthly",
  status: "initiated",
  receipt_number: null,
};

const RETRY = "/checkout?item=lawyer-pro&billing=monthly";
const RECEIPT = `/dashboard/billing/receipt/${order.id}`;

test("granted: «تم الدفع وتفعيل …», the receipt number and the receipt link", () => {
  const v = paymentResultView({ outcome: "granted", receiptNumber: "NZ-2026-000001" }, order);
  const notice = fulfilmentNoticeAr({ kind: "plan", labelAr: "المحامي المحترف", receiptNumber: "NZ-2026-000001", alreadyEntitled: false });
  assert.equal(v.tone, "success");
  assert.equal(v.title, notice.title);
  assert.equal(v.body, notice.body);
  assert.match(v.body, /^تم الدفع وتفعيل «المحامي المحترف»/);
  assert.equal(v.receiptHref, RECEIPT);
  assert.equal(v.retryHref, undefined);
  assert.equal(v.refresh, false);
});

test("already_done with no reason (a refresh after success) is success too", () => {
  const v = paymentResultView({ outcome: "already_done", receiptNumber: "NZ-2026-000001" }, { ...order, status: "paid" });
  assert.equal(v.tone, "success");
  assert.equal(v.receiptHref, RECEIPT);
});

test("a top-up says the points were added", () => {
  const v = paymentResultView({ outcome: "granted" }, { ...order, kind: "topup", item_id: "topup-250", billing: "once" });
  assert.equal(v.tone, "success");
  assert.match(v.body, /إضافة نقاط «شحن ٢٥٠ \(٣٠٠ نقطة\)»/);
});

test("already_entitled: paid, nothing replaced — the refund-review copy, never «تم الدفع وتفعيل»", () => {
  const v = paymentResultView({ outcome: "already_done", reason: "already_entitled", receiptNumber: "NZ-2026-000002" }, order);
  const notice = fulfilmentNoticeAr({ kind: "plan", labelAr: "المحامي المحترف", receiptNumber: "NZ-2026-000002", alreadyEntitled: true });
  assert.equal(v.tone, "review");
  assert.equal(v.title, notice.title);
  assert.equal(v.body, notice.body);
  assert.doesNotMatch(v.body, /تم الدفع وتفعيل/);
  assert.equal(v.receiptHref, RECEIPT, "the money was taken: the receipt is shown");
});

test("claimed_elsewhere and every pending reason: «جارٍ تأكيد الدفع…» with a refresh, not success", () => {
  for (const r of [
    { outcome: "already_done", reason: "claimed_elsewhere" },
    { outcome: "pending", reason: "fulfilment_in_progress" },
    { outcome: "pending", reason: "payment_not_final" },
    { outcome: "pending", reason: "gateway_disabled" },
    { outcome: "pending", reason: "schema_missing" },
    { outcome: "pending" },
  ] as const) {
    const v = paymentResultView(r, order);
    assert.equal(v.tone, "pending", JSON.stringify(r));
    assert.equal(v.title, "جارٍ تأكيد الدفع…");
    assert.equal(v.refresh, true);
    assert.equal(v.receiptHref, undefined);
    assert.ok(!v.body.includes(r.reason ?? "\u0000"), "no machine reason in the copy");
  }
});

test("failed: «لم تتم عملية الدفع», Moyasar's message beside the Arabic, and a retry link", () => {
  const v = paymentResultView({ outcome: "failed", reason: "Insufficient Funds" }, order);
  assert.equal(v.tone, "failed");
  assert.equal(v.title, "لم تتم عملية الدفع");
  assert.equal(v.detail, "Insufficient Funds");
  assert.ok(!v.body.includes("Insufficient Funds"), "the gateway message is never the copy itself");
  assert.equal(v.retryHref, RETRY);
  assert.equal(v.receiptHref, undefined);
});

test("failed without Moyasar's message shows no machine word", () => {
  const v = paymentResultView({ outcome: "failed", reason: "payment_failed" }, order);
  assert.equal(v.detail, undefined);
  const none = paymentResultView({ outcome: "failed" }, order);
  assert.equal(none.detail, undefined);
});

test("refunded: the refund, with the receipt", () => {
  const v = paymentResultView({ outcome: "already_done", reason: "order_refunded", receiptNumber: "NZ-1" }, { ...order, status: "refunded" });
  assert.equal(v.tone, "refunded");
  assert.equal(v.receiptHref, RECEIPT);
});

test("a closed unpaid order (order_<status>): closed, retry and contact, no machine word", () => {
  for (const reason of ["order_cancelled", "order_voided", "order_failed"]) {
    const v = paymentResultView({ outcome: "already_done", reason }, { ...order, status: reason.slice(6) });
    assert.equal(v.tone, "closed", reason);
    assert.equal(v.retryHref, RETRY);
    assert.equal(v.contact, true);
    assert.ok(!v.body.includes(reason));
  }
});

test("rejected: not matched, nothing granted, contact", () => {
  for (const reason of ["amount_mismatch", "order_mismatch", "mode_mismatch", "order_has_no_user"]) {
    const v = paymentResultView({ outcome: "rejected", reason }, order);
    assert.equal(v.tone, "rejected", reason);
    assert.equal(v.contact, true);
    assert.equal(v.receiptHref, undefined);
    assert.ok(!v.body.includes(reason));
  }
});

test("the retry link is built from the order's own item and billing, and only for an item still sold", () => {
  const v = paymentResultView({ outcome: "failed" }, { ...order, item_id: "lib-q1", billing: "once" });
  assert.equal(v.retryHref, "/checkout?item=lib-q1&billing=once");
  const unknown = paymentResultView({ outcome: "failed" }, { ...order, item_id: "gone-plan" });
  assert.equal(unknown.retryHref, undefined);
  const odd = paymentResultView({ outcome: "failed" }, { ...order, item_id: "lawyer-pro", billing: "weekly" });
  assert.equal(odd.retryHref, undefined);
});

test("an unknown item still renders (a neutral label), never throws", () => {
  const v = paymentResultView({ outcome: "granted" }, { ...order, item_id: "gone-plan" });
  assert.equal(v.tone, "success");
  assert.match(v.body, /^تم الدفع وتفعيل/);
});

test("resultViewWithoutPayment: no payment reported yet — pending while open, closed when cancelled", () => {
  assert.equal(resultViewWithoutPayment({ ...order, status: "created" }).tone, "pending");
  assert.equal(resultViewWithoutPayment({ ...order, status: "initiated" }).tone, "pending");
  const cancelled = resultViewWithoutPayment({ ...order, status: "cancelled" });
  assert.equal(cancelled.tone, "closed");
  assert.equal(cancelled.retryHref, RETRY);
  // a paid order always carries its payment id; if one ever does not, it is not a success here
  assert.equal(resultViewWithoutPayment({ ...order, status: "paid" }).tone, "pending");
});

test("autoRefreshDecision: a pending view polls every 3 s for about a minute, then stops", () => {
  assert.equal(AUTO_REFRESH_INTERVAL_MS, 3_000);
  assert.equal(AUTO_REFRESH_WINDOW_MS, 60_000);
  const view = pendingView();
  const startedAt = 1_000_000;
  assert.equal(autoRefreshDecision({ view, startedAt, now: startedAt }), "poll");
  assert.equal(autoRefreshDecision({ view, startedAt, now: startedAt + 3_000 }), "poll");
  assert.equal(autoRefreshDecision({ view, startedAt, now: startedAt + 59_999 }), "poll");
  assert.equal(autoRefreshDecision({ view, startedAt, now: startedAt + 60_000 }), "stop");
  assert.equal(autoRefreshDecision({ view, startedAt, now: startedAt + 600_000 }), "stop");
  // another call still granting (claimed_elsewhere) is pending too
  const claimed = paymentResultView({ outcome: "already_done", reason: "claimed_elsewhere" }, order);
  assert.equal(autoRefreshDecision({ view: claimed, startedAt, now: startedAt }), "poll");
});

test("autoRefreshDecision: never polls on a final state", () => {
  const startedAt = 1_000_000;
  const finals = [
    paymentResultView({ outcome: "granted" }, order),
    paymentResultView({ outcome: "already_done" }, order),
    paymentResultView({ outcome: "already_done", reason: "already_entitled" }, order),
    paymentResultView({ outcome: "already_done", reason: "order_refunded" }, order),
    paymentResultView({ outcome: "already_done", reason: "order_cancelled" }, order),
    paymentResultView({ outcome: "failed", reason: "declined" }, order),
    paymentResultView({ outcome: "rejected" }, order),
    resultViewWithoutPayment({ ...order, status: "cancelled" }),
  ];
  for (const view of finals) {
    assert.equal(view.refresh, false, view.title);
    assert.equal(autoRefreshDecision({ view, startedAt, now: startedAt }), "stop", view.title);
  }
});

test("autoRefreshDecision: a clock that is not a number, or runs backwards, stops", () => {
  const view = pendingView();
  assert.equal(autoRefreshDecision({ view, startedAt: Number.NaN, now: 5 }), "stop");
  assert.equal(autoRefreshDecision({ view, startedAt: 10, now: Number.POSITIVE_INFINITY }), "stop");
  assert.equal(autoRefreshDecision({ view, startedAt: 10_000, now: 5_000 }), "stop");
});
