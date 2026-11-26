import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakeDb, type FakeHandler, type FakeQuery } from "./fakeDb.test-helper.ts";
import { createCouponAttemptBudget } from "./couponAttempts.ts";
import { COUPON_INVALID_AR } from "./couponRules.ts";
import {
  DISCOUNT_CODE_NOTE_AR,
  REDEEM_AUDIENCE_AR,
  REDEEM_CHECK_FAILED_AR,
  REDEEM_CONSULTANT_AR,
  REDEEM_HIGHER_PLAN_AR,
  REDEEM_PAID_PLAN_RUNNING_AR,
  REDEEM_UNAVAILABLE_AR,
  redeemCouponWith,
} from "./couponRedeemCore.ts";
import { quote } from "./catalog.ts";

const USER = "00000000-0000-0000-0000-0000000016b1";
const RED = "00000000-0000-0000-0000-0000000016c1";
const NOW = new Date("2026-11-26T10:00:00Z");
const RANKS = { free: 0, ai: 1, pro: 2, max: 3, corp: 4, shield: 5, enterprise: 6 } as never;

const PLAN_COUPON = {
  id: "c-plan", code: "PROFREE", discount_type: "plan_upgrade", plan_granted: "lawyer-pro", points_granted: 0,
  active: true, valid_from: "2026-11-01T00:00:00Z", valid_until: "2026-12-31T20:59:59Z", metadata: { grant_billing: "yearly" },
};
const POINTS_COUPON = { ...PLAN_COUPON, id: "c-pts", code: "PTS500", discount_type: "points_grant", plan_granted: null, points_granted: 500, metadata: {} };
const DISCOUNT_COUPON = { ...PLAN_COUPON, id: "c-disc", code: "NZAMY50", discount_type: "fixed", plan_granted: null, metadata: {} };

interface Opts {
  userType?: string;
  coupon?: object | null;
  couponErr?: boolean;
  practiceKind?: string | "error";
  subs?: object[];
  open?: object;
  grantErr?: boolean;
}

function db(o: Opts = {}, over?: FakeHandler) {
  let granted = false;
  return fakeDb((q) => {
    const r = over?.(q);
    if (r) return r;
    if (q.table === "profiles") return { data: { user_type: o.userType ?? "lawyer" } };
    if (q.table === "coupons") return o.couponErr ? { error: { code: "42P01", message: "x" } } : { data: o.coupon === undefined ? PLAN_COUPON : o.coupon };
    if (q.table === "lawyer_profiles") return o.practiceKind === "error" ? { error: { code: "08006", message: "down" } } : { data: { practice_kind: o.practiceKind ?? "advocate" } };
    if (q.table === "firm_members") return { data: null };
    if (q.table === "subscriptions" && q.op === "select") {
      const byOrder = q.filters.some(([, c]) => c === "metadata->>order_id");
      if (byOrder) return { data: granted ? [{ id: "sub-new", metadata: { order_id: RED, method: "moyasar" } }] : [] };
      return { data: o.subs ?? [] };
    }
    if (q.table === "subscriptions" && q.op === "update") return { data: null };
    if (q.op === "rpc" && q.table === "coupon_redeem_open") return { data: o.open ?? { status: "opened", id: RED, kind: "plan", receipt_number: "NZ-2026-000099" } };
    if (q.op === "rpc" && q.table === "grant_plan_subscription") {
      if (o.grantErr) return { error: { code: "XX000", message: "x" } };
      granted = true;
      return { data: { inserted: true, current_period_end: "2027-11-26T10:00:00Z" } };
    }
    if (q.op === "rpc" && q.table === "coupon_redeem_finish") return { data: (q.payload as { p_ok: boolean }).p_ok ? "granted" : "void" };
    return { data: null };
  });
}

const deps = (client: ReturnType<typeof db>["client"], extra: object = {}) => ({
  admin: client,
  ranks: RANKS,
  giftValidDays: async () => 90,
  attempts: createCouponAttemptBudget(),
  now: () => NOW,
  ...extra,
});
const rpcs = (log: FakeQuery[], fn: string) => log.filter((q) => q.op === "rpc" && q.table === fn);

test("a free-plan code: the plan is granted on the redemption id, the row closed granted, the receipt returned", async () => {
  const { client, log } = db();
  const r = await redeemCouponWith(deps(client), { userId: USER, code: " profree " });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { kind: "plan", code: "PROFREE", itemId: "lawyer-pro", labelAr: (quote("lawyer-pro", "yearly") as { item: { labelAr: string } }).item.labelAr, billing: "yearly", receiptNumber: "NZ-2026-000099", redemptionId: RED });
  const open = rpcs(log, "coupon_redeem_open")[0].payload as Record<string, unknown>;
  const q = quote("lawyer-pro", "yearly");
  assert.ok(q.ok);
  assert.equal(open.p_list_net, q.netHalalas, "the full listed price is recorded");
  assert.equal(open.p_points_expires, null);
  const grant = rpcs(log, "grant_plan_subscription")[0].payload as Record<string, unknown>;
  assert.equal(grant.p_order, RED, "keyed on the redemption — never twice");
  assert.equal(grant.p_plan_id, "lawyer-pro");
  assert.deepEqual(rpcs(log, "coupon_redeem_finish")[0].payload, { p_redemption: RED, p_ok: true, p_subscription: "sub-new" });
  const stamp = log.find((x) => x.table === "subscriptions" && x.op === "update")!.payload as { metadata: Record<string, unknown> };
  assert.equal(stamp.metadata.method, "coupon");
  assert.equal(log.filter((x) => x.table === "payment_orders").length, 0, "never a payment order");
  // l16 review: one admin audit row (actor_type user) for the redemption
  const audit = log.filter((x) => x.table === "admin_audit_events" && x.op === "insert");
  assert.equal(audit.length, 1);
  const row = audit[0].payload as { actor_type: string; action: string; metadata: Record<string, unknown> };
  assert.equal(row.actor_type, "user");
  assert.equal(row.action, "coupon_redeemed");
  assert.equal(row.metadata.redemption_id, RED);
  assert.equal(row.metadata.item_id, "lawyer-pro");
});

test("a points code: credited by the RPC with gift_valid_days; nothing else granted", async () => {
  const { client, log } = db({ coupon: POINTS_COUPON, open: { status: "granted", id: RED, kind: "points", points: 500, receipt_number: "NZ-2026-000100" } });
  const r = await redeemCouponWith(deps(client), { userId: USER, code: "PTS500" });
  assert.deepEqual(r, { status: 200, body: { kind: "points", code: "PTS500", points: 500, receiptNumber: "NZ-2026-000100", redemptionId: RED } });
  const open = rpcs(log, "coupon_redeem_open")[0].payload as Record<string, unknown>;
  assert.equal(open.p_points_expires, new Date(NOW.getTime() + 90 * 86400000).toISOString());
  assert.equal(open.p_list_net, null);
  assert.equal(rpcs(log, "grant_plan_subscription").length, 0);
});

test("a discount code is recognised only when this buyer could use it, never redeemed here; every call spends a try", async () => {
  const budget = createCouponAttemptBudget({ max: 3 });
  const { client, log } = db({ coupon: DISCOUNT_COUPON });
  const r = await redeemCouponWith(deps(client, { attempts: budget }), { userId: USER, code: "nzamy50" });
  assert.deepEqual(r, { status: 200, body: { kind: "discount", code: "NZAMY50", note: DISCOUNT_CODE_NOTE_AR } });
  assert.equal(log.filter((q) => q.op === "rpc").length, 0);
  await redeemCouponWith(deps(client, { attempts: budget }), { userId: USER, code: "nzamy50" });
  await redeemCouponWith(deps(client, { attempts: budget }), { userId: USER, code: "nzamy50" });
  assert.equal((await redeemCouponWith(deps(client, { attempts: budget }), { userId: USER, code: "nzamy50" })).status, 429, "a valid answer spends a try too");
  // the same sentence when he could not use it: wrong audience, already used, a first-order code after a paid order
  const wrong = db({ coupon: { ...DISCOUNT_COUPON, eligible_user_types: ["individual"] } });
  assert.deepEqual(await redeemCouponWith(deps(wrong.client), { userId: USER, code: "NZAMY50" }), { status: 400, body: { error: COUPON_INVALID_AR } });
  const used = db({ coupon: DISCOUNT_COUPON }, (q) => (q.table === "coupon_usage" ? { data: [{ id: 1 }] } : undefined));
  assert.deepEqual(await redeemCouponWith(deps(used.client), { userId: USER, code: "NZAMY50" }), { status: 400, body: { error: COUPON_INVALID_AR } });
  const first = db({ coupon: { ...DISCOUNT_COUPON, metadata: { first_paid_order_only: true } } }, (q) =>
    q.table === "payment_orders" ? { data: [{ id: "o1", live: true, metadata: {} }] } : undefined);
  assert.deepEqual(await redeemCouponWith(deps(first.client), { userId: USER, code: "NZAMY50" }), { status: 400, body: { error: COUPON_INVALID_AR } });
});

test("a plan row granted by a code (no payment order behind it) gives no credit and no 503 at a later checkout read", async () => {
  const { upgradeDecision } = await import("./upgradeProration.ts");
  const d = upgradeDecision({
    userId: USER, tier: "enterprise", now: NOW, ranks: RANKS,
    rows: [{ id: "s1", plan_id: "lawyer-pro", tier: "pro", status: "active", started_at: "2026-11-01T00:00:00Z", current_period_start: "2026-11-01T00:00:00Z", current_period_end: "2027-11-01T00:00:00Z", metadata: { order_id: RED, method: "coupon" } }] as never,
    orders: new Map(),
  });
  assert.equal(d.kind, "none", "a free grant is not paid money to credit");
});

test("unknown / inactive / expired / used / exhausted all answer the one sentence and spend a try", async () => {
  const cases: Array<[Opts, string]> = [
    [{ coupon: null }, "unknown"],
    [{ coupon: { ...PLAN_COUPON, active: false } }, "inactive"],
    [{ coupon: { ...PLAN_COUPON, valid_until: "2026-11-01T00:00:00Z" } }, "expired"],
    [{ open: { status: "already_used" } }, "used"],
    [{ open: { status: "exhausted" } }, "exhausted"],
    // l18: the bundle is a coupon target now — a retired plan still cannot be granted
    [{ coupon: { ...PLAN_COUPON, plan_granted: "ind-preventive" } }, "a plan that cannot be granted"],
  ];
  for (const [o, label] of cases) {
    const budget = createCouponAttemptBudget();
    const { client } = db(o);
    const r = await redeemCouponWith(deps(client, { attempts: budget }), { userId: USER, code: "PROFREE" });
    assert.deepEqual(r, { status: 400, body: { error: COUPON_INVALID_AR } }, label);
  }
  // a spent budget answers 429 before any read
  const budget = createCouponAttemptBudget();
  for (let i = 0; i < 50 && budget.check(USER).ok; i++) budget.spend(USER);
  const { client, log } = db();
  const r = await redeemCouponWith(deps(client, { attempts: budget }), { userId: USER, code: "PROFREE" });
  assert.equal(r.status, 429);
  assert.equal(log.length, 0);
});

test("checkout's gates hold for a free plan: audience, consultant (fail-closed), held plans — nothing redeemed", async () => {
  const run = async (o: Opts) => {
    const { client, log } = db(o);
    const r = await redeemCouponWith(deps(client), { userId: USER, code: "PROFREE" });
    return { r, opened: rpcs(log, "coupon_redeem_open").length };
  };
  let x = await run({ userType: "individual" });
  assert.deepEqual([x.r, x.opened], [{ status: 403, body: { error: REDEEM_AUDIENCE_AR } }, 0]);
  x = await run({ practiceKind: "consultant" });
  assert.deepEqual([x.r, x.opened], [{ status: 403, body: { error: REDEEM_CONSULTANT_AR } }, 0]);
  x = await run({ practiceKind: "error" });
  assert.deepEqual([x.r, x.opened], [{ status: 503, body: { error: REDEEM_CHECK_FAILED_AR } }, 0]);
  // a higher plan running → readUpgrade refuses
  x = await run({ subs: [{ id: "s1", plan_id: "firm-enterprise", tier: "enterprise", status: "active", started_at: "2026-11-01T00:00:00Z", current_period_start: "2026-11-01T00:00:00Z", current_period_end: "2027-11-01T00:00:00Z", metadata: {} }] });
  assert.equal(x.r.status, 409);
  assert.equal(x.opened, 0);
  // a lower PAID plan with days left → refused (a free plan never cancels paid days)
  const paid = db(
    { subs: [{ id: "s2", plan_id: "ind-ai", tier: "ai", status: "active", started_at: "2026-11-01T00:00:00Z", current_period_start: "2026-11-01T00:00:00Z", current_period_end: "2027-11-01T00:00:00Z", metadata: { order_id: "o1" } }] },
    (q) => (q.table === "payment_orders" ? { data: [{ id: "o1", user_id: USER, kind: "plan", item_id: "ind-ai", status: "paid", live: true, net_halalas: 24900, metadata: {} }] } : undefined),
  );
  const r = await redeemCouponWith(deps(paid.client), { userId: USER, code: "PROFREE" });
  assert.deepEqual(r, { status: 409, body: { error: REDEEM_PAID_PLAN_RUNNING_AR } });
  assert.equal(rpcs(paid.log, "coupon_redeem_open").length, 0);
  // l16 review: a lower plan NOT paid by a live order (an admin grant, a bank
  // transfer, a test account) with days left → refused too, whatever its source
  for (const metadata of [{ method: "admin_assignment" }, { method: "bank_transfer", order_id: "o-bank" }, {}]) {
    x = await run({ subs: [{ id: "s3", plan_id: "ind-ai", tier: "ai", status: "active", started_at: "2026-11-01T00:00:00Z", current_period_start: "2026-11-01T00:00:00Z", current_period_end: "2027-11-01T00:00:00Z", metadata }] });
    assert.deepEqual([x.r, x.opened], [{ status: 409, body: { error: REDEEM_PAID_PLAN_RUNNING_AR } }, 0], JSON.stringify(metadata));
  }
  // … but a free row, an ended row, or the SAME plan already held do not block
  x = await run({ subs: [
    { id: "s4", plan_id: "lawyer-free", tier: "free", status: "active", current_period_end: null, metadata: {} },
    { id: "s5", plan_id: "ind-ai", tier: "ai", status: "active", current_period_end: "2026-11-01T00:00:00Z", metadata: {} },
    { id: "s6", plan_id: "lawyer-pro", tier: "pro", status: "active", started_at: "2026-11-01T00:00:00Z", current_period_start: "2026-11-01T00:00:00Z", current_period_end: "2027-01-01T00:00:00Z", metadata: {} },
  ] });
  assert.equal(x.r.status, 200, JSON.stringify(x.r));
  assert.equal(x.opened, 1);
});

test("a higher plan found at grant time voids the redemption (the use comes back); a transient failure leaves it open", async () => {
  // grantPurchase answers alreadyEntitled when a higher plan runs at grant time
  let reads = 0;
  const { client, log } = db({}, (q) => {
    if (q.table === "subscriptions" && q.op === "select" && !q.filters.some(([, c]) => c === "metadata->>order_id")) {
      reads += 1;
      // readUpgrade sees nothing; the grant's own read sees an open-ended higher plan
      return reads === 1 ? { data: [] } : { data: [{ id: "s9", tier: "enterprise", status: "active", current_period_end: null }] };
    }
    if (q.table === "subscriptions" && q.op === "select") return { data: [] };
    return undefined;
  });
  const r = await redeemCouponWith(deps(client), { userId: USER, code: "PROFREE" });
  assert.deepEqual(r, { status: 409, body: { error: REDEEM_HIGHER_PLAN_AR } });
  assert.deepEqual(rpcs(log, "coupon_redeem_finish")[0].payload, { p_redemption: RED, p_ok: false, p_subscription: null });

  const failed = db({ grantErr: true });
  const r2 = await redeemCouponWith(deps(failed.client), { userId: USER, code: "PROFREE" });
  assert.deepEqual(r2, { status: 503, body: { error: REDEEM_UNAVAILABLE_AR } });
  assert.equal(rpcs(failed.log, "coupon_redeem_finish").length, 0, "left open: the next try resumes it");
});

test("the migration not run / unreadable → 503, nothing written", async () => {
  const { client, log } = db({ couponErr: true });
  assert.deepEqual(await redeemCouponWith(deps(client), { userId: USER, code: "PROFREE" }), { status: 503, body: { error: REDEEM_UNAVAILABLE_AR } });
  assert.equal(log.filter((q) => q.op !== "select").length, 0);
  const missingFn = db({}, (q) => (q.op === "rpc" && q.table === "coupon_redeem_open" ? { error: { code: "PGRST202", message: "x" } } : undefined));
  assert.equal((await redeemCouponWith(deps(missingFn.client), { userId: USER, code: "PROFREE" })).status, 503);
});

test("source contract: the route is signed-in only, refuses a frozen account, and wires the service client", () => {
  const route = readFileSync(new URL("../../app/api/v1/coupons/redeem/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(!user\) return reply\(\{ error: "سجّل الدخول لتفعيل الكود" \}, 401\);/);
  assert.match(route, /const frozen = frozenAccountResponse\(user\);/);
  assert.match(route, /redeemCouponWith\(\s*\{\s*admin,\s*ranks: TIER_RANK,\s*giftValidDays: \(\) => readGiftValidDays\(admin\),/);
  // l18: checkout's gates on the box too — the library lock and the licence (ق٢٦-٩)
  assert.match(route, /libraryAccountAllowed: async \(userId\) => \(await readLibraryAccountAccess\(userId\)\)\.allowed,/);
  assert.match(route, /licenceFacts: \(userId, userType\) => readLicenceFacts\(admin, userId, userType\),/);
});
