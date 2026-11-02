import { test } from "node:test";
import assert from "node:assert/strict";
import { refundOrderWith, REFUND_NOT_HERE_AR, REFUND_NOTICE_AR } from "./refundCore.ts";
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
test("a deleted account's plan order refunds without a null user filter (no_user)", async () => {
  const { deps, events, log } = setup({ user_id: null, kind: "plan", metadata: { no_user: true } } as unknown as Partial<typeof order>);
  assert.equal((await refundOrderWith(deps, "o", "admin", true)).status, 200);
  assert.ok(!log.some(q => q.filters.some(([, c, v]) => c === "user_id" && v === null)));
  assert.ok(!events.includes("subscriptions"));
  assert.ok(events.includes("finish_payment_refund"));
  assert.ok(!events.includes("tier") && !events.includes("notice"));
});
test("a non-platform or unknown-mode order is a permanent 409 refusal, at review time too", async () => {
  for (const change of [{ merchant: "office" }, { live: null }]) {
    for (const confirm of [false, true]) {
      const { deps, events } = setup(change as unknown as Partial<typeof order>);
      const r = await refundOrderWith(deps, "o", "admin", confirm);
      assert.equal(r.status, 409);
      assert.deepEqual(r.body, { error: REFUND_NOT_HERE_AR });
      assert.ok(!events.includes("claim_payment_refund"));
    }
  }
});
test("the refund notice says the refund started and may take days, never that it is done", () => {
  assert.ok(REFUND_NOTICE_AR.body.includes("بدأت إعادة المبلغ إلى وسيلة الدفع الأصلية، وقد يستغرق ظهوره في حسابك عدة أيام حسب البنك"));
  assert.ok(!REFUND_NOTICE_AR.body.includes("تمت إعادة") && !REFUND_NOTICE_AR.title.includes("تم استرداد"));
});

// ── P3 Task 5: refunding the founder membership revokes it (founder_revoke), never a points lot ──
function setupMember(over: Record<string, unknown> = {}, revoke: { data?: unknown; error?: { code: string; message: string } } = { data: "revoked" }) {
  const base = setup({ kind: "membership", total_halalas: 344540, ...over } as Partial<typeof order>);
  const events: string[] = [];
  const db = fakeDb(q => {
    events.push(q.table);
    if (q.table === "payment_orders") return { data: { ...order, kind: "membership", total_halalas: 344540, ...over } };
    if (q.table === "points_lots") return { data: [] };
    if (q.table === "claim_payment_refund") return { data: job };
    if (q.table === "founder_revoke") return revoke;
    if (q.table === "finish_payment_refund") return { data: { done: true, tier: "free" } };
    return {};
  });
  const mpay = { ...payment, amount: 344540, captured: 344540 };
  const deps = { ...base.deps, admin: db.client, gateway: async (): Promise<Pick<MoyasarClient, "mode" | "fetchPayment" | "refund" | "void">> => ({ mode: "test" as const, fetchPayment: async () => ({ ok: true as const, data: mpay }), refund: async () => { events.push("gateway-refund"); return { ok: true as const, data: { ...mpay, status: "refunded" as const, refunded: 344540 } }; }, void: async () => { events.push("gateway-void"); return { ok: true as const, data: { ...mpay, status: "voided" as const } }; } }), syncTier: async () => { events.push("tier"); }, notify: async () => { events.push("notice"); } };
  return { deps, events, log: db.log };
}
test("membership refund: claimed, money back, founder_revoke(order, 'refund') BEFORE the atomic finish, then the notice — no points lots read or revoked", async () => {
  const { deps, events, log } = setupMember();
  assert.equal((await refundOrderWith(deps, "o", "admin", true)).status, 200);
  assert.deepEqual(events, ["payment_orders", "claim_payment_refund", "gateway-refund", "founder_revoke", "finish_payment_refund", "notice"]);
  assert.deepEqual(log.find(q => q.table === "founder_revoke")?.payload, { p_order: "o", p_reason: "refund" });
  assert.ok(!events.includes("points_lots") && !events.includes("revoke_lot"));
  assert.ok(!events.includes("tier"), "a membership is not a plan: no tier sync");
});
test("membership refund preview: the super_admin gets a review (the button acts), with the founder warning and no lots read", async () => {
  const { deps, events } = setupMember();
  const r = await refundOrderWith(deps, "o", "admin", false);
  assert.equal(r.status, 200);
  assert.ok("warnings" in r.body && r.body.warnings?.some((w: string) => w.includes("المؤسس")));
  assert.deepEqual(events, ["payment_orders"]);
});
test("membership refund: a founder_revoke error answers 503 and never finishes; the retry revokes then finishes without refunding again", async () => {
  const { deps, events } = setupMember({}, { error: { code: "40001", message: "x" } });
  assert.equal((await refundOrderWith(deps, "o", "admin", true)).status, 503);
  assert.ok(!events.includes("finish_payment_refund"));
  const retry = setupMember({ metadata: { refund_job: job } }, { data: "none" });
  retry.deps.gateway = async () => ({ mode: "test", fetchPayment: async () => ({ ok: true, data: { ...payment, amount: 344540, status: "refunded", refunded: 344540 } }), refund: async () => { throw new Error("must not resend"); }, void: async () => { throw new Error("must not resend"); } });
  assert.equal((await refundOrderWith(retry.deps, "o", "admin", true)).status, 200);
  assert.deepEqual(retry.events, ["payment_orders", "founder_revoke", "finish_payment_refund", "notice"]);
});
test("membership refund: an order that never got a seat (seat_unavailable / already_member) — founder_revoke 'none' — still refunds", async () => {
  const { deps, events } = setupMember({ metadata: { founder: "seat_unavailable", already_entitled: true } }, { data: "none" });
  assert.equal((await refundOrderWith(deps, "o", "admin", true)).status, 200);
  assert.ok(events.includes("founder_revoke") && events.includes("finish_payment_refund"));
});
test("a top-up or plan refund never calls founder_revoke", async () => {
  const { deps, events } = setup();
  assert.equal((await refundOrderWith(deps, "o", "admin", true)).status, 200);
  assert.ok(!events.includes("founder_revoke"));
});
