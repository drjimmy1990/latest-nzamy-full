/**
 * l16 D-04 — «إلغاء الطلب» on every waiting order card (owner package §٧.٤).
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/dashboard/admin/service-orders/_components/pendingOrderCancel.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cancelBoxShown, orderLooksPaid } from "./pendingOrderCancel.ts";

test("the cancel box shows on every waiting status, never on in_review (own button) or a final one", () => {
  for (const s of ["draft", "pending_payment", "pending_assignment", "pending", "assigned"]) assert.equal(cancelBoxShown(s), true, s);
  for (const s of ["in_review", "completed", "cancelled", "", "weird", null, undefined, 3]) assert.equal(cancelBoxShown(s), false, String(s));
});

test("a paid order is flagged (column or metadata copy); anything else is not", () => {
  assert.equal(orderLooksPaid({ payment: { status: "paid", amount: 100 } }), true);
  assert.equal(orderLooksPaid({ metadata: { payment: { status: "paid" } } }), true);
  assert.equal(orderLooksPaid({ payment: { status: "not_required" } }), false);
  assert.equal(orderLooksPaid({ payment: "paid" }), false);
  assert.equal(orderLooksPaid({}), false);
  assert.equal(orderLooksPaid(null), false);
});

test("the page mounts the box and cancels through the admin route's cancel action, with a confirm step", () => {
  const page = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");
  assert.match(page, /<PendingOrderCancelBox/);
  assert.match(page, /onCancel=\{\(reason\) => act\(o\.id, \{ action: "cancel", reason \}\)\}/);
  const box = readFileSync(new URL("./PendingOrderCancelBox.tsx", import.meta.url), "utf8");
  assert.match(box, /تأكيد الإلغاء/);
  assert.match(box, /if \(!confirming\)/, "the first click only opens the confirm step");
  assert.match(box, /الإلغاء لا يردّ المبلغ تلقائياً/);
});
