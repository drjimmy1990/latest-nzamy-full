/**
 * heldPlanActivation.test.ts — batch l18, owner answer ٢٣٩: a professional
 * plan paid while the buyer's licence is pending is HELD at fulfilment (paid,
 * stamped, metadata.licence_pending, no subscription) and activated on the
 * admin's approval with its period starting that day; a rejection refunds it
 * in full. Fulfilment and the settlement against a fake service client.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fulfillOrderWith, type FulfilDeps, type GatewayClient } from "./fulfillCore.ts";
import type { MoyasarPayment } from "./moyasarClient.ts";
import type { GrantLibraryFn } from "./grantPurchase.ts";
import { fakeDb, RANKS, type FakeHandler, type FakeQuery } from "./fakeDb.test-helper.ts";
import { LICENCE_PENDING_REASON, LICENCE_PENDING_SENTENCE_AR } from "./fulfillDecision.ts";
import { licenceHoldFor, settleHeldPlansOfFirmMembers, settleHeldPlansOnVerification, type HeldPlanDeps } from "./heldPlanActivation.ts";
import { paymentResultView } from "./resultView.ts";
import { PAYABLE_ITEMS } from "./catalog.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const PAID_AT = new Date("2026-11-27T08:00:00.000Z");
const APPROVED_AT = new Date("2026-12-05T09:00:00.000Z");
const USER = "00000000-0000-0000-0000-00000000h239";
const ORDER = "00000000-0000-0000-0000-0000000ab239";

const order = (over: Record<string, unknown> = {}) => ({
  id: ORDER, user_id: USER, merchant: "platform", kind: "plan", item_id: "lawyer-pro", billing: "yearly",
  total_halalas: 458850, currency: "SAR", status: "initiated", moyasar_payment_id: null, live: true,
  receipt_number: null, paid_at: null, fulfilled_at: null, failure_message: null, metadata: { user_email: "u@example.test" }, ...over,
});
const payment: MoyasarPayment = {
  id: "pay_1", status: "paid", amount: 458850, currency: "SAR", metadata: { order_id: ORDER }, source: { type: "creditcard" },
  invoice_id: null, refunded: 0, captured: 458850, createdAt: "2026-11-27T07:59:00.000Z",
} as MoyasarPayment;
const gw = {
  mode: "live",
  fetchPayment: async () => ({ ok: true, data: payment }),
  fetchToken: async (id: string) => ({ ok: true, data: { id, status: "active", brand: "visa", month: "12", year: "2030", lastFour: "1111" } }),
  listPaymentsByOrder: async () => ({ ok: true, data: [] }),
} as unknown as GatewayClient;

function fulfilDb(over?: FakeHandler) {
  return fakeDb((q) => {
    const r = over?.(q);
    if (r) return r;
    if (q.table === "payment_orders" && q.op === "select") return { data: order() };
    if (q.table === "claim_payment_order") return { data: [{ ...order(), status: "paid", moyasar_payment_id: "pay_1", receipt_number: "NZ-2026-000239", paid_at: PAID_AT.toISOString() }] };
    if (q.table === "payment_orders" && q.op === "update") return { data: [{ id: ORDER }] };
    if (q.table === "merge_payment_order_metadata") return { data: null };
    if (q.table === "subscriptions" && q.op === "select") return { data: [] };
    if (q.table === "grant_plan_subscription") return { data: { inserted: true, current_period_end: null } };
    return { data: null };
  });
}

function fulfilDeps(admin: FulfilDeps["admin"], hold: "go" | "hold" | "review" | null | undefined) {
  const notices: Array<{ title: string; body: string }> = [];
  const admins: string[] = [];
  const d: FulfilDeps = {
    admin,
    gateway: async () => gw,
    grantLibrary: (async () => ({ ok: true, endsAt: PAID_AT.toISOString() })) as GrantLibraryFn,
    ranks: RANKS,
    notify: async (n) => { notices.push(n); },
    notifyAdmins: async (n) => { admins.push(n.title); },
    now: () => PAID_AT,
    ...(hold === undefined ? {} : { licenceHold: async () => hold }),
  };
  return { d, notices, admins };
}
const INPUT = { orderId: ORDER, paymentId: "pay_1", merchant: "platform" as const };
const rpcs = (log: FakeQuery[], fn: string) => log.filter((q) => q.table === fn);

test("٢٣٩ fulfilment: a pending licence → paid and stamped, licence_pending merged BEFORE the stamp, NO subscription, told it activates after the approval", async () => {
  const { client, log } = fulfilDb();
  const { d, notices } = fulfilDeps(client, "hold");
  const r = await fulfillOrderWith(d, INPUT);
  assert.deepEqual(r, { outcome: "granted", reason: LICENCE_PENDING_REASON, receiptNumber: "NZ-2026-000239" });
  assert.equal(rpcs(log, "grant_plan_subscription").length, 0, "no plan before the approval");
  const merge = log.findIndex((q) => q.table === "merge_payment_order_metadata" && (q.payload as { p_patch: Record<string, unknown> }).p_patch.licence_pending === true);
  const stamp = log.findIndex((q) => q.table === "payment_orders" && q.op === "update" && "fulfilled_at" in (q.payload as object));
  assert.ok(merge > -1 && stamp > merge, "flag before the stamp");
  assert.equal(notices.length, 1);
  assert.ok(notices[0].body.includes(LICENCE_PENDING_SENTENCE_AR), notices[0].body);
  // the result page says the same — not «تم التفعيل»
  const view = paymentResultView(r, { id: ORDER, kind: "plan", item_id: "lawyer-pro", billing: "yearly", status: "paid", receipt_number: "NZ-2026-000239" });
  assert.equal(view.tone, "review");
  assert.ok(view.body.includes("بعد اعتماد التوثيق"));
});

test("٢٣٩ fulfilment: verified (go) is granted as before; a failed read stays pending (the sweep retries); no dependency = go", async () => {
  const go = fulfilDb();
  const r = await fulfillOrderWith(fulfilDeps(go.client, "go").d, INPUT);
  assert.equal(r.outcome, "granted");
  assert.equal(rpcs(go.log, "grant_plan_subscription").length, 1);
  const failed = fulfilDb();
  const r2 = await fulfillOrderWith(fulfilDeps(failed.client, null).d, INPUT);
  assert.deepEqual([r2.outcome, r2.reason], ["pending", "licence_check_failed"]);
  assert.equal(failed.log.filter((q) => q.table === "payment_orders" && q.op === "update" && "fulfilled_at" in (q.payload as object)).length, 0);
  const none = fulfilDb();
  assert.equal((await fulfillOrderWith(fulfilDeps(none.client, undefined).d, INPUT)).outcome, "granted");
});

test("٢٣٩ fulfilment: paid by a rejected / unsubmitted licence (review) → held, sent to the refund review, admins alerted", async () => {
  const { client, log } = fulfilDb();
  const { d, admins } = fulfilDeps(client, "review");
  const r = await fulfillOrderWith(d, INPUT);
  assert.deepEqual([r.outcome, r.reason], ["already_done", "already_entitled"]);
  const patch = (log.find((q) => q.table === "merge_payment_order_metadata" && (q.payload as { p_patch: Record<string, unknown> }).p_patch.licence_pending === true)?.payload as { p_patch: Record<string, unknown> }).p_patch;
  assert.equal(patch.already_entitled, true);
  assert.equal(admins.length, 1);
});

test("٢٣٩ licenceHoldFor: not gated → go; verified → go; pending → hold; rejected → review; a failed read → null", async () => {
  const pro = PAYABLE_ITEMS["lawyer-pro"];
  const mk = (type: string, status: string | null, err = false) =>
    fakeDb((q) => {
      if (q.table === "profiles") return err ? { error: { code: "08006" } } : { data: { user_type: type } };
      if (q.table === "lawyer_profiles") return { data: status ? { verification_status: status } : null };
      return { data: [] };
    }).client;
  assert.equal(await licenceHoldFor(mk("individual", null), USER, PAYABLE_ITEMS["ind-ai"]), "go");
  assert.equal(await licenceHoldFor(mk("lawyer", "verified"), USER, pro), "go");
  assert.equal(await licenceHoldFor(mk("lawyer", "pending"), USER, pro), "hold");
  assert.equal(await licenceHoldFor(mk("lawyer", "rejected"), USER, pro), "review");
  assert.equal(await licenceHoldFor(mk("lawyer", "pending", true), USER, pro), null);
  // l18 review ruling: a licence not submitted yet (no lawyer row) is held too — its approval releases it
  assert.equal(await licenceHoldFor(mk("lawyer", null), USER, pro), "hold");
  assert.equal(await licenceHoldFor(mk("lawyer", "suspended"), USER, pro), "review");
});

// l18 review S2: the approval ran while this order was being held (it could not see the flag yet)
test("fulfilment: a licence that reads verified right after the hold → the approval's release runs at once; the plan is active", async () => {
  const { client, log } = fulfilDb();
  const answers: Array<"go" | "hold"> = ["hold", "go"];
  const released: string[] = [];
  const { d, notices } = fulfilDeps(client, undefined);
  d.licenceHold = async () => answers.shift() ?? "go";
  d.activateHeldPlans = async (userId) => {
    released.push(userId);
    return { activated: [ORDER] };
  };
  const r = await fulfillOrderWith(d, INPUT);
  assert.deepEqual(r, { outcome: "granted", receiptNumber: "NZ-2026-000239" });
  assert.deepEqual(released, [USER]);
  const stamp = log.findIndex((q) => q.table === "payment_orders" && q.op === "update" && "fulfilled_at" in (q.payload as object));
  assert.ok(stamp > -1, "held and stamped first; the second read comes after");
  assert.equal(notices.length, 0, "no «held» notice — the release sends the activation notice");
  // still pending on the second read → held as before, nothing released
  const still = fulfilDb();
  const s = fulfilDeps(still.client, "hold");
  const calls: string[] = [];
  s.d.activateHeldPlans = async (u) => { calls.push(u); return { activated: [] }; };
  assert.equal((await fulfillOrderWith(s.d, INPUT)).reason, LICENCE_PENDING_REASON);
  assert.deepEqual(calls, []);
  assert.equal(s.notices.length, 1);
});

// ── the settlement on the admin's decision ──

const HELD = { id: ORDER, user_id: USER, kind: "plan", item_id: "lawyer-pro", billing: "yearly", receipt_number: "NZ-2026-000239", metadata: { licence_pending: true } };

function settleDb(over?: FakeHandler) {
  return fakeDb((q) => {
    const r = over?.(q);
    if (r) return r;
    if (q.table === "payment_orders" && q.op === "select") return { data: [HELD] };
    if (q.table === "subscriptions" && q.op === "select") return { data: [] };
    if (q.table === "grant_plan_subscription") return { data: { inserted: true, current_period_end: null } };
    return { data: null };
  });
}
function settleDeps(admin: HeldPlanDeps["admin"], refund?: HeldPlanDeps["refund"]) {
  const notices: string[] = [];
  const admins: string[] = [];
  const refunds: string[] = [];
  const d: HeldPlanDeps = {
    admin,
    ranks: RANKS,
    grantLibrary: (async () => ({ ok: true, endsAt: APPROVED_AT.toISOString() })) as GrantLibraryFn,
    notify: async (n) => { notices.push(n.title); },
    notifyAdmins: async (n) => { admins.push(n.title); },
    refund: refund ?? (async (id) => { refunds.push(id); return { status: 200, body: { refunded: true } }; }),
    now: () => APPROVED_AT,
  };
  return { d, notices, admins, refunds };
}

test("٢٣٩ approve: the held plan is granted keyed on the order, its period STARTS ON THE APPROVAL DAY; the flag cleared; the payer told", async () => {
  const { client, log } = settleDb();
  const { d, notices } = settleDeps(client);
  const r = await settleHeldPlansOnVerification(d, USER, "approve");
  assert.deepEqual(r, { activated: [ORDER], refunded: [], review: [] });
  const grant = rpcs(log, "grant_plan_subscription")[0].payload as { p_order: string; p_period_start: string };
  assert.equal(grant.p_order, ORDER);
  assert.equal(grant.p_period_start, APPROVED_AT.toISOString(), "the year starts at the approval, not at the payment");
  const sel = log.find((q) => q.table === "payment_orders" && q.op === "select")!;
  assert.ok(sel.filters.some(([op, c, v]) => op === "eq" && c === "metadata->>licence_pending" && v === "true"));
  const patch = (rpcs(log, "merge_payment_order_metadata")[0].payload as { p_patch: Record<string, unknown> }).p_patch;
  // l18 review S3: an order first held for review leaves the refund queue once active
  assert.deepEqual(patch, { licence_pending: false, already_entitled: false, licence_review: false, licence_activated_at: APPROVED_AT.toISOString() });
  assert.equal(notices.length, 1);
});

// l18 review S7: two held plans of different ranks — only the highest is activated, the lower refunded once it is
test("approve: two held plans → the highest (rank, then total, then the earlier payment) is activated; the lower is refunded with an admin note", async () => {
  const LOW = "00000000-0000-0000-0000-0000000ab240";
  // a firm: firm-enterprise ranks above firm-basic (the lawyer plans share one tier)
  const lower = { ...HELD, id: LOW, item_id: "firm-basic", total_halalas: 990000, paid_at: "2026-11-27T07:00:00Z" };
  const higher = { ...HELD, item_id: "firm-enterprise", billing: "quarterly", total_halalas: 449000, paid_at: "2026-11-28T07:00:00Z" };
  assert.ok(RANKS[PAYABLE_ITEMS["firm-enterprise"].tier as keyof typeof RANKS] > RANKS[PAYABLE_ITEMS["firm-basic"].tier as keyof typeof RANKS], "fixture: enterprise ranks above corp");
  // the lower one comes FIRST from the read (no order by): the rank decides
  const { client, log } = settleDb((q) => (q.table === "payment_orders" && q.op === "select" ? { data: [lower, higher] } : undefined));
  const { d, refunds, admins } = settleDeps(client);
  const r = await settleHeldPlansOnVerification(d, USER, "approve");
  assert.deepEqual(r, { activated: [ORDER], refunded: [LOW], review: [] });
  const grants = rpcs(log, "grant_plan_subscription").map((q) => (q.payload as { p_order: string }).p_order);
  assert.deepEqual(grants, [ORDER], "the lower plan is never granted (it would be replaced and lost)");
  assert.deepEqual(refunds, [LOW]);
  const lowPatch = rpcs(log, "merge_payment_order_metadata").map((q) => q.payload as { p_order: string; p_patch: Record<string, unknown> }).find((p) => p.p_order === LOW)!.p_patch;
  assert.deepEqual(lowPatch, { licence_pending: false, licence_superseded: true, licence_superseded_by: ORDER, already_entitled: true }, "never marked rejected");
  assert.equal(admins.length, 1, "an admin-visible note of the automatic refund");
  // the highest grant fails → nothing refunded, both stay held
  const broken = settleDb((q) =>
    q.table === "payment_orders" && q.op === "select" ? { data: [lower, higher] } : q.table === "grant_plan_subscription" ? { error: { code: "XX000", message: "x" } } : undefined,
  );
  const b = settleDeps(broken.client);
  const rb = await settleHeldPlansOnVerification(b.d, USER, "approve");
  assert.deepEqual(rb, { activated: [], refunded: [], review: [ORDER] });
  assert.deepEqual(b.refunds, []);
  assert.equal(rpcs(broken.log, "merge_payment_order_metadata").length, 0, "both still held");
});

test("٢٣٩ approve: a higher plan running → refund review + alert; a failed grant → stays held + alert (never fails the decision)", async () => {
  const higher = settleDb((q) =>
    q.table === "subscriptions" && q.op === "select" && q.columns === "id, tier, status, current_period_end"
      ? { data: [{ id: "s-max", tier: "max", status: "active", current_period_end: null }] }
      : undefined,
  );
  const a = settleDeps(higher.client);
  assert.deepEqual(await settleHeldPlansOnVerification(a.d, USER, "approve"), { activated: [], refunded: [], review: [ORDER] });
  assert.equal(a.admins.length, 1);
  const broken = settleDb((q) => (q.table === "grant_plan_subscription" ? { error: { code: "XX000", message: "x" } } : undefined));
  const b = settleDeps(broken.client);
  assert.deepEqual(await settleHeldPlansOnVerification(b.d, USER, "approve"), { activated: [], refunded: [], review: [ORDER] });
  assert.equal(rpcs(broken.log, "merge_payment_order_metadata").length, 0, "still held");
});

test("٢٣٩ reject: the full refund (marks merged first); a refund that cannot run → the refund review + alert", async () => {
  const { client, log } = settleDb();
  const ok = settleDeps(client);
  assert.deepEqual(await settleHeldPlansOnVerification(ok.d, USER, "reject"), { activated: [], refunded: [ORDER], review: [] });
  assert.deepEqual((rpcs(log, "merge_payment_order_metadata")[0].payload as { p_patch: unknown }).p_patch, { licence_pending: false, licence_rejected: true, already_entitled: true });
  assert.equal(rpcs(log, "grant_plan_subscription").length, 0);
  const off = settleDb();
  const no = settleDeps(off.client, async () => ({ status: 503, body: { error: "البوابة متوقفة" } }));
  assert.deepEqual(await settleHeldPlansOnVerification(no.d, USER, "reject"), { activated: [], refunded: [], review: [ORDER] });
  assert.equal(no.admins.length, 1);
});

// ── l19, owner ٢٤٢: approving a firm releases its member lawyers' held plans ──

const FIRM = "00000000-0000-0000-0000-00000000f242";
const OWNER = "00000000-0000-0000-0000-0000000a0242";
const M_PENDING = "00000000-0000-0000-0000-0000000a1242";
const M_REJECTED = "00000000-0000-0000-0000-0000000a2242";
const M_NOTHING = "00000000-0000-0000-0000-0000000a3242";
const M_NOROW = "00000000-0000-0000-0000-0000000a4242";

function membersDb(over?: FakeHandler) {
  return fakeDb((q) => {
    const r = over?.(q);
    if (r) return r;
    if (q.table === "firm_members") {
      return { data: [OWNER, M_PENDING, M_REJECTED, M_NOTHING, M_NOROW, M_PENDING].map((user_id) => ({ user_id })) };
    }
    if (q.table === "payment_orders") return { data: [OWNER, M_PENDING, M_REJECTED, M_NOROW].map((user_id) => ({ user_id })) };
    if (q.table === "lawyer_profiles") {
      return { data: [{ user_id: M_PENDING, verification_status: "pending" }, { user_id: M_REJECTED, verification_status: "rejected" }] };
    }
    return { data: null };
  });
}

test("٢٤٢ firm approval: every ACTIVE member holding a plan is settled once (own licence pending or never submitted); the owner is not settled twice; a member whose own licence was rejected stays as is", async () => {
  const { client, log } = membersDb();
  const settled: string[] = [];
  const admins: string[] = [];
  const r = await settleHeldPlansOfFirmMembers({ admin: client, notifyAdmins: async (n) => { admins.push(n.title); } }, FIRM, OWNER, async (m) => {
    settled.push(m);
    return { activated: [`order-of-${m}`], refunded: [], review: [] };
  });
  assert.deepEqual(settled, [M_PENDING, M_NOROW], "one call per member, the owner left to the firm's own call");
  assert.deepEqual(r.skipped, [M_REJECTED]);
  assert.equal(r.readFailed, false);
  assert.deepEqual(r.members.map((m) => m.userId), [M_PENDING, M_NOROW]);
  assert.equal(admins.length, 0);
  // only this firm's ACTIVE members are read, and only paid plan orders held for the licence
  const fm = log.find((q) => q.table === "firm_members")!;
  assert.ok(fm.filters.some(([op, c, v]) => op === "eq" && c === "firm_id" && v === FIRM));
  assert.ok(fm.filters.some(([op, c, v]) => op === "eq" && c === "status" && v === "active"));
  const po = log.find((q) => q.table === "payment_orders")!;
  for (const [c, v] of [["status", "paid"], ["kind", "plan"], ["metadata->>licence_pending", "true"]]) {
    assert.ok(po.filters.some(([op, cc, vv]) => op === "eq" && cc === c && vv === v), c);
  }
  assert.ok(!(po.filters.find(([op, c]) => op === "in" && c === "user_id")?.[2] as string[]).includes(OWNER), "the owner's orders are not read here");
});

test("٢٤٢ firm approval: a failed read settles no member and alerts the admins; no member with a held plan → nothing to do", async () => {
  for (const table of ["firm_members", "payment_orders", "lawyer_profiles"]) {
    const { client } = membersDb((q) => (q.table === table ? { error: { code: "08006" } } : undefined));
    const settled: string[] = [];
    const admins: string[] = [];
    const r = await settleHeldPlansOfFirmMembers({ admin: client, notifyAdmins: async (n) => { admins.push(n.title); } }, FIRM, OWNER, async (m) => {
      settled.push(m);
      return { activated: [], refunded: [], review: [] };
    });
    assert.deepEqual([r.readFailed, settled, admins.length], [true, [], 1], table);
  }
  const none = membersDb((q) => (q.table === "payment_orders" ? { data: [] } : undefined));
  const calls: string[] = [];
  const r = await settleHeldPlansOfFirmMembers({ admin: none.client }, FIRM, OWNER, async (m) => { calls.push(m); return { activated: [], refunded: [], review: [] }; });
  assert.deepEqual([r.members, r.skipped, calls], [[], [], []]);
  assert.equal(none.log.some((q) => q.table === "lawyer_profiles"), false);
});

test("٢٤٢ a member released by his firm's approval: the same settlement (granted keyed on his order, period from today), told «اعتُمد توثيق مكتبك»", async () => {
  const { client, log } = settleDb();
  const bodies: string[] = [];
  const { d } = settleDeps(client);
  d.notify = async (n) => { bodies.push(n.body); };
  assert.deepEqual(await settleHeldPlansOnVerification(d, USER, "approve", { via: "firm" }), { activated: [ORDER], refunded: [], review: [] });
  assert.equal((rpcs(log, "grant_plan_subscription")[0].payload as { p_period_start: string }).p_period_start, APPROVED_AT.toISOString());
  assert.ok(bodies[0].startsWith("اعتُمد توثيق مكتبك"), bodies[0]);
  // his own approval keeps the old wording
  const own = settleDb();
  const o = settleDeps(own.client);
  const ownBodies: string[] = [];
  o.d.notify = async (n) => { ownBodies.push(n.body); };
  await settleHeldPlansOnVerification(o.d, USER, "approve");
  assert.ok(ownBodies[0].startsWith("اعتُمد توثيقك"), ownBodies[0]);
});

test("٢٤٢ fulfilment: a member lawyer who never submitted his licence pays and is held while his firm is pending; once the firm is verified he goes", async () => {
  const pro = PAYABLE_ITEMS["lawyer-pro"];
  const member = (firmStatus: string) =>
    fakeDb((q) => {
      if (q.table === "profiles") return { data: { user_type: "lawyer" } };
      if (q.table === "lawyer_profiles") return { data: null }; // no lawyer row: never submitted
      if (q.table === "firm_members") return { data: [{ firm_id: FIRM }] };
      if (q.table === "firm_profiles") {
        const byId = q.filters.some(([op, c]) => op === "in" && c === "id");
        return { data: byId ? [{ verification_status: firmStatus }] : [] };
      }
      return { data: [] };
    }).client;
  assert.equal(await licenceHoldFor(member("pending"), USER, pro), "hold");
  assert.equal(await licenceHoldFor(member("verified"), USER, pro), "go");
});

test("source contract: fulfilment wires the hold; the admin decision (lawyer AND firm) and the instant approval settle held plans", () => {
  const wrapper = readFileSync(join(ROOT, "src", "lib", "payments", "fulfillOrder.ts"), "utf8");
  assert.match(wrapper, /licenceHold: \(userId, item\) => licenceHoldFor\(admin, userId, item\),/);
  const route = readFileSync(join(ROOT, "src", "app", "api", "v1", "admin", "verifications", "[id]", "route.ts"), "utf8");
  assert.match(route, /updatedType === "lawyer" \|\| updatedType === "firm"\s*\? await settleHeldPlansAfterDecision\(adminClient, gate\.userId, userId, action === "approve" \? "approve" : "reject"\)/);
  const approve = readFileSync(join(ROOT, "src", "lib", "lawyerSignup", "approve.ts"), "utf8");
  assert.match(approve, /await settleHeldPlansAfterDecision\(svc, userId, userId, "approve", false\);/);
  // l18 review: fulfilment's late release has no admin either — no refund under the buyer's id
  assert.match(wrapper, /activateHeldPlans: \(userId\) => settleHeldPlansAfterDecision\(admin, userId, userId, "approve", false\),/);
  const server = readFileSync(join(ROOT, "src", "lib", "payments", "heldPlanActivationServer.ts"), "utf8");
  assert.match(server, /if \(!autoRefund\) \{\s+return Promise\.resolve\(\{ status: 409,/);
  const billing = readFileSync(join(ROOT, "src", "app", "dashboard", "billing", "page.tsx"), "utf8");
  assert.match(billing, /supabase\.rpc\("my_licence_held_orders"\)/);
  // l19 (٢٤٢): a firm APPROVAL also settles its members (never a rejection), keyed on the firm row just updated
  assert.match(route, /updatedType === "firm" && action === "approve" && updatedFirmId\s*\? await settleFirmMembersHeldPlansAfterApproval\(adminClient, gate\.userId, updatedFirmId, userId\)/);
  assert.match(server, /settleHeldPlansAfterDecision\(admin, actorId, memberId, "approve", true, "firm"\)/);
});
