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
    if (q.table === "points_lots") return { data: [{ id: "lot", points_total: 100, points_left: 80 }] };
    // the order lot's own use (20 points) — and the buyer's debits since payment, read by the evidence
    if (q.table === "points_ledger") return { data: [{ delta: -20, reason: "usage" }] };
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
  assert.deepEqual(events, ["payment_orders", "points_lots", "points_ledger", "ai_runs", "points_ledger"]);
});
test("refund is claimed before money moves; atomic finish before tier and notice", async () => {
  const { deps, events } = setup();
  assert.equal((await refundOrderWith(deps, "o", "admin", true)).status, 200);
  assert.deepEqual(events, ["payment_orders", "points_lots", "points_ledger", "ai_runs", "points_ledger", "claim_payment_refund", "gateway-refund", "finish_payment_refund", "issue_payment_credit_note", "notice"]);
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
test("membership refund: claimed, money back, founder_revoke(order, 'refund') BEFORE the atomic finish, then the credit note and the notice", async () => {
  const { deps, events, log } = setupMember();
  assert.equal((await refundOrderWith(deps, "o", "admin", true)).status, 200);
  // l7: a membership is no longer skipped — its lots and usage are read like any order's
  // l9: a membership includes the library, so its full-text reads are read too
  assert.deepEqual(events, ["payment_orders", "points_lots", "founder_seats", "ai_runs", "points_ledger", "full_text_reads", "claim_payment_refund", "gateway-refund", "founder_revoke", "finish_payment_refund", "issue_payment_credit_note", "notice"]);
  assert.deepEqual(log.find(q => q.table === "founder_revoke")?.payload, { p_order: "o", p_reason: "refund" });
  assert.ok(!events.includes("revoke_lot"));
  assert.ok(!events.includes("tier"), "a membership is not a plan: no tier sync");
});
test("membership refund preview: the super_admin gets a review with the founder warning and the eligibility verdict", async () => {
  const { deps, events } = setupMember();
  const r = await refundOrderWith(deps, "o", "admin", false);
  assert.equal(r.status, 200);
  assert.ok("warnings" in r.body && r.body.warnings?.some((w: string) => w.includes("المؤسس")));
  assert.equal((r.body as { eligibility?: { state: string; enforced: boolean } }).eligibility?.state, "eligible");
  assert.deepEqual(events, ["payment_orders", "points_lots", "founder_seats", "ai_runs", "points_ledger", "full_text_reads"]);
});
test("membership refund: a founder_revoke error answers 503 and never finishes; the retry revokes then finishes without refunding again", async () => {
  const { deps, events } = setupMember({}, { error: { code: "40001", message: "x" } });
  assert.equal((await refundOrderWith(deps, "o", "admin", true)).status, 503);
  assert.ok(!events.includes("finish_payment_refund"));
  const retry = setupMember({ metadata: { refund_job: job } }, { data: "none" });
  retry.deps.gateway = async () => ({ mode: "test", fetchPayment: async () => ({ ok: true, data: { ...payment, amount: 344540, status: "refunded", refunded: 344540 } }), refund: async () => { throw new Error("must not resend"); }, void: async () => { throw new Error("must not resend"); } });
  assert.equal((await refundOrderWith(retry.deps, "o", "admin", true)).status, 200);
  // a claim in flight is finished, never re-judged: no usage reads on the retry
  assert.deepEqual(retry.events, ["payment_orders", "points_lots", "founder_revoke", "finish_payment_refund", "issue_payment_credit_note", "notice"]);
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

// ── l7 decision 10: the founder refund verdict, enforced from the route ──
function setupUsed(over: Record<string, unknown> = {}, handler: (t: string) => { data?: unknown; error?: { code: string; message: string } } | undefined = () => undefined) {
  const base = setupMember(over);
  const events: string[] = [];
  const db = fakeDb(q => {
    events.push(q.table);
    const h = handler(q.table);
    if (h) return h;
    if (q.table === "payment_orders") return { data: { ...order, kind: "membership", total_halalas: 344540, ...over } };
    if (q.table === "points_lots") return { data: [] };
    if (q.table === "founder_seats") return { data: [{ id: "seat" }] };
    if (q.table === "membership_credits") return { data: [{ id: "c1", kind: "drafting_work" }, { id: "c2", kind: "library_question" }] };
    if (q.table === "membership_credit_uses") return { data: [{ credit_id: "c1" }] };
    if (q.table === "ai_runs") return { data: [{ tool: "drafter", created_at: "2026-10-22T11:00:00Z" }] };
    if (q.table === "points_ledger") return { data: [] };
    if (q.table === "claim_payment_refund") return { data: job };
    if (q.table === "founder_revoke") return { data: "revoked" };
    if (q.table === "finish_payment_refund") return { data: { done: true, tier: "free" } };
    if (q.table === "issue_payment_credit_note") return { data: { number: "CN-2026-000001" } };
    return {};
  });
  return { deps: { ...base.deps, admin: db.client }, events, log: db.log };
}
test("l7: the review lists the evidence (credits, runs) and says «غير مؤهل»", async () => {
  const { deps, log } = setupUsed();
  const r = await refundOrderWith(deps, "o", "admin", false);
  const v = (r.body as { eligibility: { state: string; lines: string[] } }).eligibility;
  assert.equal(v.state, "ineligible");
  assert.ok(v.lines.some(l => l.includes("أعمال الصائغ ١")));
  assert.ok(v.lines.some(l => l.includes("drafter")));
  const uses = log.find(q => q.table === "membership_credit_uses");
  assert.ok(uses?.filters.some(([k, c, val]) => k === "is" && c === "restored_at" && val === null), "restored credits do not count");
  const runs = log.find(q => q.table === "ai_runs");
  assert.ok(runs?.filters.some(([k, c, val]) => k === "in" && c === "status" && Array.isArray(val) && !val.includes("failed")), "failed runs do not count");
});
test("l7: the route refuses an ineligible founder refund without a reason — no audit, no claim, no money", async () => {
  for (const reason of [undefined, "", "قصير"]) {
    const { deps, events } = setupUsed();
    const r = await refundOrderWith(deps, "o", "admin", true, { enforceEligibility: true, overrideReason: reason });
    assert.equal(r.status, 409);
    assert.ok((r.body as { eligibility?: unknown }).eligibility, "the fresh verdict comes back");
    for (const e of ["admin_audit_events", "claim_payment_refund", "gateway-refund"]) assert.ok(!events.includes(e), e);
  }
});
test("l7: with a typed reason the override is audited BEFORE the claim, then the refund and its credit note", async () => {
  const { deps, events, log } = setupUsed();
  const r = await refundOrderWith(deps, "o", "admin", true, { enforceEligibility: true, overrideReason: "  طلب العميل بعد خطأ تقني موثّق  " });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { refunded: true, creditNote: "CN-2026-000001" });
  assert.ok(events.indexOf("admin_audit_events") < events.indexOf("claim_payment_refund"));
  const row = log.find(q => q.table === "admin_audit_events")?.payload as { action: string; target_id: string; metadata: { reason: string } };
  assert.equal(row.action, "payment_refund_eligibility_override");
  assert.equal(row.target_id, "o");
  assert.equal(row.metadata.reason, "طلب العميل بعد خطأ تقني موثّق");
});
test("l7: a failed override audit write answers 503 and moves no money", async () => {
  const { deps, events } = setupUsed({}, t => t === "admin_audit_events" ? { error: { code: "42501", message: "x" } } : undefined);
  const r = await refundOrderWith(deps, "o", "admin", true, { enforceEligibility: true, overrideReason: "سبب كافٍ للاستثناء هنا" });
  assert.equal(r.status, 503);
  assert.ok(!events.includes("claim_payment_refund") && !events.includes("gateway-refund"));
});
test("l7: a failed usage read is «تعذّر التحقق» and needs the reason too (fail closed)", async () => {
  const { deps } = setupUsed({}, t => t === "ai_runs" ? { error: { code: "XX000", message: "x" } } : t === "membership_credit_uses" ? { data: [] } : undefined);
  const review = await refundOrderWith(deps, "o", "admin", false);
  assert.equal((review.body as { eligibility: { state: string } }).eligibility.state, "unverified");
  assert.equal((await refundOrderWith(deps, "o", "admin", true, { enforceEligibility: true })).status, 409);
});
test("l7: the system path (l7-founder's automatic refund on a rejected licence: the old 4-argument call) is never blocked and still gets its credit note", async () => {
  // an ineligible founder order, 40 days late: AI used and past the window
  const { deps, events } = setupUsed();
  deps.now = () => new Date("2026-12-01T13:00:00Z");
  const r = await refundOrderWith(deps, "o", "admin", true);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { refunded: true, creditNote: "CN-2026-000001" });
  assert.ok(!events.includes("admin_audit_events"));
  assert.ok(events.indexOf("issue_payment_credit_note") > events.indexOf("finish_payment_refund"));
});
test("l8 (٦٤): a top-up past its window is ENFORCED — refused without a reason, refunded with an audited one", async () => {
  const { deps, events } = setup();
  deps.now = () => new Date("2026-11-22T13:00:00Z");
  const review = await refundOrderWith(deps, "o", "admin", false);
  assert.equal((review.body as { eligibility: { state: string; enforced: boolean } }).eligibility.enforced, true);
  assert.equal((review.body as { eligibility: { state: string } }).eligibility.state, "ineligible");
  const refused = await refundOrderWith(deps, "o", "admin", true, { enforceEligibility: true });
  assert.equal(refused.status, 409);
  assert.ok(!events.includes("claim_payment_refund") && !events.includes("gateway-refund"));
  const done = await refundOrderWith(deps, "o", "admin", true, { enforceEligibility: true, overrideReason: "خطأ في الشحن أكده الدعم" });
  assert.equal(done.status, 200);
  assert.ok(events.indexOf("admin_audit_events") < events.indexOf("claim_payment_refund"));
});
test("l8 (٦٤): a library pass is judged on its own assistant — a drafter run paid elsewhere does not block it; the platform-owed order never needs a reason", async () => {
  const lib = setupUsed({ kind: "library" });
  const review = await refundOrderWith(lib.deps, "o", "admin", false);
  const v = (review.body as { eligibility: { state: string; enforced: boolean } }).eligibility;
  assert.deepEqual([v.state, v.enforced], ["eligible", true]);
  const runs = lib.log.find((q) => q.table === "ai_runs");
  assert.ok(runs?.filters.some(([k, c, val]) => k === "in" && c === "tool" && JSON.stringify(val) === '["library-assistant"]'), "filtered by tool in the query (the row limit never hides one)");
  const asked = setupUsed({ kind: "library" }, (t) => (t === "ai_runs" ? { data: [{ tool: "library-assistant", created_at: "2026-10-22T11:00:00Z" }] } : undefined));
  assert.equal((await refundOrderWith(asked.deps, "o", "admin", true, { enforceEligibility: true })).status, 409);
  const owed = setupUsed({ metadata: { founder: "not_verified", already_entitled: true } });
  owed.deps.now = () => new Date("2026-12-01T13:00:00Z");
  assert.equal((await refundOrderWith(owed.deps, "o", "admin", true, { enforceEligibility: true })).status, 200);
  assert.ok(!owed.events.includes("admin_audit_events"));
});
test("l7: a missing credit-note function (SQL not run) never fails the refund", async () => {
  const { deps } = setupUsed({}, t => t === "issue_payment_credit_note" ? { error: { code: "PGRST202", message: "missing" } } : undefined);
  const r = await refundOrderWith(deps, "o", "admin", true);
  assert.deepEqual(r.body, { refunded: true, creditNote: null });
});

test("l7 × 20261127_40: points emptied by EXPIRY are not «used» — the order lot's use comes from its usage ledger rows", async () => {
  // a 1,000-point top-up lot emptied by expiry (points_left 0), 10 points actually used, 5 refunded by a failed run
  const events: string[] = [];
  const db = fakeDb(q => {
    events.push(q.table);
    if (q.table === "payment_orders") return { data: { ...order } };
    if (q.table === "points_lots") return { data: [{ id: "lot", points_total: 1000, points_left: 0 }] };
    if (q.table === "points_ledger" && q.filters.some(([k, c]) => k === "in" && c === "lot_id")) return { data: [{ delta: -10, reason: "usage" }, { delta: 5, reason: "usage_refund" }] };
    return {};
  });
  const { deps } = setup();
  const r = await refundOrderWith({ ...deps, admin: db.client }, "o", "admin", false);
  const v = (r.body as { eligibility: { state: string; lines: string[] } }).eligibility;
  // l12 (owner item 69): any spend ends a top-up's refund — but the spend counted is 5, never the 1,000 expiry emptied
  assert.equal(v.state, "ineligible", "5 of 1,000 spent → not refundable (l12: none may be spent)");
  assert.ok(v.lines.some(l => l.includes("صُرف ٥ من ١٬٠٠٠") || l.includes("صُرف ٥ من ١٠٠٠")), v.lines.join(" | "));
  assert.ok(!v.lines.some(l => l.includes("صُرف ١٬٠٠٠") || l.includes("صُرف ١٠٠٠")), "expiry is not spend");
  assert.ok((r.body as { warnings: string[] }).warnings.some(w => w.includes("استُخدمت بعض نقاط")), "the used-points warning still fires for real use");
});
test("l7 × 20261127_40: a failed ledger read of the order lot leaves the verdict «تعذّر التحقق»", async () => {
  const db = fakeDb(q => {
    if (q.table === "payment_orders") return { data: { ...order } };
    if (q.table === "points_lots") return { data: [{ id: "lot", points_total: 100, points_left: 100 }] };
    if (q.table === "points_ledger" && q.filters.some(([k, c]) => k === "in" && c === "lot_id")) return { error: { code: "XX000", message: "x" } };
    return {};
  });
  const { deps } = setup();
  const r = await refundOrderWith({ ...deps, admin: db.client }, "o", "admin", false);
  assert.equal((r.body as { eligibility: { state: string } }).eligibility.state, "unverified");
});
