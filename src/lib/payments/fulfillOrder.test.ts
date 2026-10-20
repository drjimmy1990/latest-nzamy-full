/**
 * fulfillOrder.test.ts — source contract for ./fulfillOrder.ts and
 * ./grantPurchase.ts (B1 Task 5). Both import "@/lib/…" (the service client),
 * which `node --test` cannot resolve, so the order of their steps is pinned
 * in the source; the decisions they act on are executed in
 * ./fulfillDecision.test.ts and the claim in
 * supabase/tests/rls/payments_fulfill_once.test.sql.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fulfill = readFileSync(join(import.meta.dirname, "fulfillOrder.ts"), "utf8");
const grant = readFileSync(join(import.meta.dirname, "grantPurchase.ts"), "utf8");

function body(src: string, signature: string): string {
  const at = src.indexOf(signature);
  assert.ok(at > -1, `missing ${signature}`);
  return src.slice(at, src.indexOf("\n}\n", at));
}

test("the claim is the claim_payment_order RPC, run only on a 'grant' decision; zero rows → already_done", () => {
  const run = body(fulfill, "async function run(");
  const decideAt = run.indexOf("fulfillDecision(order, payment, client.mode");
  const claimAt = run.indexOf('admin.rpc("claim_payment_order"');
  assert.ok(decideAt > -1 && claimAt > decideAt, "decide, then claim");
  assert.ok(run.includes("p_live: live") && run.includes("const live = client.mode === \"live\""), "the mode stamped is the key's mode");
  assert.match(run, /if \(!claimed\) return \{ outcome: "already_done"/);
  assert.match(run, /claimErr\.code === "23505"[\s\S]{0,300}reason: "order_mismatch"/, "a payment already on another order is order_mismatch");
  assert.ok(!/from\("payment_orders"\)\s*\.update\(\{\s*status: "paid"/.test(fulfill), "no other code path writes status paid");
});

test("the webhook's live flag reaches the decision", () => {
  assert.match(fulfill, /liveFlag: input\.liveFlag/);
});

test("finish: card saved before the grant, fulfilled_at stamped only while null, notified only by the stamping call", () => {
  const fin = body(fulfill, "async function finish(");
  const cardAt = fin.indexOf("await saveCard(");
  const grantAt = fin.indexOf("await grantPurchase(");
  const stampAt = fin.indexOf('.is("fulfilled_at", null)', grantAt);
  const notifyAt = fin.indexOf("await recordNotification(");
  assert.ok(cardAt > -1 && grantAt > cardAt, "the card is saved before the grant (the subscription points at it)");
  assert.ok(stampAt > grantAt, "fulfilled_at is stamped after the grant, conditionally");
  assert.ok(notifyAt > stampAt, "the notification follows the stamp");
  assert.match(fin, /stamped\.length === 0\)[\s\S]{0,200}already_done/, "a call that did not stamp does not notify");
  assert.match(fin, /if \(!granted\.ok\)[\s\S]{0,400}outcome: "pending"/, "a failed grant leaves fulfilled_at null (pending)");
  assert.match(fin, /already_entitled: true/);
  assert.match(fin, /reason: "already_entitled"/);
});

test("the notification always has a body", () => {
  assert.match(fulfill, /recordNotification\(\{ userId: order\.user_id, title: notice\.title, body: notice\.body, href: notice\.href \}\)/);
});

test("a paid unfulfilled order is resumed only by the sweep, only after RESUME_AFTER_MS", () => {
  const run = body(fulfill, "async function run(");
  assert.match(run, /if \(input\.resume && resumeAllowed\(order, Date\.now\(\)\)\) return resume\(admin, order\)/);
  assert.match(run, /reason: "fulfilment_in_progress"/);
});

test("'wait' keeps the payment id on the open order; 'record_failed' closes only an open order", () => {
  const run = body(fulfill, "async function run(");
  assert.match(run, /update\(\{ moyasar_payment_id: payment\.id \}\)[\s\S]{0,200}\.in\("status", OPEN_STATUSES\)[\s\S]{0,80}\.is\("moyasar_payment_id", null\)/);
  assert.match(run, /update\(\{ status: "failed"[\s\S]{0,200}\.in\("status", OPEN_STATUSES\)/);
  assert.match(fulfill, /const OPEN_STATUSES = \["created", "initiated"\]/);
});

test("a missing B1 object answers pending and is logged once", () => {
  assert.match(fulfill, /isMissingPaymentsObject\(error\?\.code\)[\s\S]{0,120}logMissingOnce/);
  assert.match(fulfill, /missingLogged\.has\(step\)\) return/);
  assert.doesNotMatch(fulfill, /throw /, "fulfillOrder never throws");
});

test("grantPurchase keys every grant on the order", () => {
  const plan = body(grant, "async function grantPlan(");
  const existingAt = plan.indexOf('.eq("metadata->>order_id", order.id)');
  const decisionAt = plan.indexOf("planGrantDecision(");
  const cancelAt = plan.indexOf('status: "cancelled"');
  const insertAt = plan.indexOf('from("subscriptions").insert(');
  assert.ok(existingAt > -1 && decisionAt > existingAt && cancelAt > decisionAt && insertAt > cancelAt,
    "check the order's row, then the downgrade guard, then cancel, then insert");
  assert.match(plan, /if \(decision\.keepExisting\) return \{ ok: true, alreadyEntitled: true \}/);
  assert.match(plan, /metadata: \{ order_id: order\.id, method: "moyasar" \}/);
  assert.match(plan, /auto_renew: false/);
  assert.match(plan, /payment_method_id: paymentMethodId/);
  assert.match(plan, /billing_cycle: order\.billing/);
  assert.match(plan, /source: "plan_monthly"/);
  assert.match(plan, /points: PLAN_MONTHLY_POINTS/);

  assert.match(grant, /source: "purchase",\s*orderId: order\.id/, "library grants carry the order");
  assert.match(grant, /grant\.code === "23505"\) return \{ ok: true/, "library 23505 = already granted");
  assert.match(grant, /error\.code === "23505"\) return \{ ok: true \}/, "points 23505 = already credited");
  assert.match(grant, /p_order: input\.orderId/);
});

test("a later call on a closed order still reports a refund review or a refund — never a bare success", () => {
  const run = body(fulfill, "async function run(");
  const early = run.slice(run.indexOf('if (order.status === "paid" || order.status === "refunded")'));
  const block = early.slice(0, early.indexOf("\n  }\n"));
  assert.match(block, /already_entitled === true[\s\S]{0,80}"already_entitled"/, "metadata.already_entitled → reason already_entitled");
  assert.match(block, /order\.status === "refunded"[\s\S]{0,40}"order_refunded"/, "a refunded order → reason order_refunded");
});
