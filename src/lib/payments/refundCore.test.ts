import { test } from "node:test";
import assert from "node:assert/strict";
import { refundOrderWith } from "./refundCore.ts";
import { fakeDb } from "./fakeDb.test-helper.ts";
import type { MoyasarPayment, MoyasarClient } from "./moyasarClient.ts";
const order = { id: "o", user_id: "u", merchant: "platform", kind: "topup", status: "paid", total_halalas: 11500, paid_at: "2026-10-22T10:00:00Z", fulfilled_at: "2026-10-22T10:00:01Z", moyasar_payment_id: "p", live: false, metadata: {} };
const job = { token: "claim", state: "processing", method: "refund", actor_id: "admin" };
const payment: MoyasarPayment = { id: "p", status: "paid", amount: 11500, currency: "SAR", metadata: { order_id: "o" }, source: { type: "creditcard" }, invoice_id: null, refunded: 0, captured: 11500, createdAt: null };
function setup(over: Partial<typeof order> = {}, gatewayFails = false, claimLost = false) {
  const events: string[] = [];
  const db = fakeDb(q => {
    events.push(q.table);
    if (q.table === "payment_orders") return { data: { ...order, ...over } };
    if (q.table === "points_lots") return { data: [{ points_total: 100, points_left: 80 }] };
    if (q.table === "claim_payment_refund") return { data: claimLost ? null : job };
    if (q.table === "finish_payment_refund") return { data: { done: true, tier: "free" } };
    return {};
  });
  const deps = { admin: db.client, now: () => new Date("2026-10-22T13:00:00Z"), gateway: async (): Promise<Pick<MoyasarClient, "mode" | "fetchPayment" | "refund" | "void">> => ({ mode: "test" as const, fetchPayment: async () => ({ ok: true as const, data: payment }), refund: async () => { events.push("gateway-refund"); return gatewayFails ? { ok: false as const, status: 500, type: "error", message: "failed" } : { ok: true as const, data: { ...payment, status: "refunded" as const, refunded: 11500 } }; }, void: async () => ({ ok: true as const, data: { ...payment, status: "voided" as const } }) }), syncTier: async () => { events.push("tier"); }, notify: async () => { events.push("notice"); } };
  return { deps, events, log: db.log };
}
test("preview warns about spent points without any claim or gateway action", async () => {
  const { deps, events } = setup();
  const r = await refundOrderWith(deps, "o", "admin", false);
  assert.equal(r.status, 200);
  assert.ok("warnings" in r.body && r.body.warnings?.length);
  assert.deepEqual(events, ["payment_orders", "points_lots"]);
});
test("refund is claimed before money moves; atomic finish before tier and notice", async () => {
  const { deps, events } = setup();
  assert.equal((await refundOrderWith(deps, "o", "admin", true)).status, 200);
  assert.deepEqual(events, ["payment_orders", "points_lots", "claim_payment_refund", "gateway-refund", "finish_payment_refund", "notice"]);
});
test("gateway failure changes no grants and sends no success notification", async () => {
  const { deps, events } = setup({}, true);
  assert.equal((await refundOrderWith(deps, "o", "admin", true)).status, 502);
  assert.ok(!events.includes("finish_payment_refund") && !events.includes("notice"));
});
test("concurrent refund losing the claim never calls the refund endpoint", async () => {
  const { deps, events } = setup({}, false, true);
  assert.equal((await refundOrderWith(deps, "o", "admin", true)).status, 409);
  assert.ok(!events.includes("gateway-refund"));
});
test("wrong mode and an unfinished grant refuse before claiming", async () => {
  for (const change of [{ live: true }, { fulfilled_at: null }]) {
    const { deps, events } = setup(change as Partial<typeof order>);
    assert.ok((await refundOrderWith(deps, "o", "admin", true)).status >= 400);
    assert.ok(!events.includes("claim_payment_refund"));
  }
});
test("a gateway refund with a failed local finish recovers without refunding again", async () => {
  const { deps, events } = setup({ metadata: { refund_job: job } });
  deps.gateway = async () => ({ mode: "test", fetchPayment: async () => ({ ok: true, data: { ...payment, status: "refunded", refunded: 11500 } }), refund: async () => { throw new Error("must not resend"); }, void: async () => { throw new Error("must not resend"); } });
  assert.equal((await refundOrderWith(deps, "o", "admin", true)).status, 200);
  assert.ok(events.includes("finish_payment_refund") && !events.includes("claim_payment_refund"));
});

test("ambiguous failure keeps the claim; a definitive validation failure releases it", async () => {
  for (const [status, type, released] of [[500,"error",false],[0,"timeout",false],[400,"validation_error",true]] as const) {
    const { deps, events } = setup();
    const gateway = await deps.gateway();
    deps.gateway = async () => ({ ...gateway, refund: async () => ({ ok: false, status, type, message: "rejected" }) });
    assert.equal((await refundOrderWith(deps,"o","admin",true)).status,502);
    assert.equal(events.includes("release_payment_refund"),released);
    assert.ok(!events.includes("finish_payment_refund"));
  }
});
test("refund response mismatches never reverse local grants", async () => {
  for (const bad of [{ amount: 1 }, { currency: "USD" }, { metadata: { order_id: "another" } }, { status: "voided" as const }, { refunded: 11499 }]) {
    const { deps, events } = setup();
    const gateway = await deps.gateway();
    deps.gateway = async () => ({ ...gateway, refund: async () => ({ ok: true, data: { ...payment, status: "refunded", refunded: 11500, ...bad } }) });
    assert.equal((await refundOrderWith(deps,"o","admin",true)).status,502);
    assert.ok(!events.includes("finish_payment_refund"));
  }
});
test("notification failure after atomic finish still reports a completed refund", async () => {
  const { deps } = setup();
  deps.notify = async () => { throw new Error("offline"); };
  assert.equal((await refundOrderWith(deps,"o","admin",true)).status,200);
});
test("a retryable claim can be replaced only after checking the provider paid state", async () => {
  const { deps, events } = setup({ metadata: { refund_job: { ...job, state: "retryable" } } });
  assert.equal((await refundOrderWith(deps,"o","admin",true)).status,200);
  assert.ok(events.includes("claim_payment_refund"));
});
