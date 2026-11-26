/**
 * freeActivation.test.ts — batch l18 (owner's urgent package of 26 Nov,
 * ق٢٦-١١ settling س٢٢٤; LIVE-11 / LIVE-13 / ٢٣٩): a discount code that
 * covers the whole price is activated at 0 SAR with no card and no Moyasar,
 * the checkout's code box takes a free-plan / points code, the library and the
 * bundle are coupon targets, and the founder / professional plans wait for a
 * verified licence. Checkout, the preview and the redeem box against a fake
 * service client.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fakeDb, type FakeHandler, type FakeQuery } from "./fakeDb.test-helper.ts";
import { startCheckoutWith, type CheckoutDeps, type CheckoutInput } from "./checkoutCore.ts";
import { validateCouponWith } from "./couponServer.ts";
import { redeemCouponWith } from "./couponRedeemCore.ts";
import { buildCatalog } from "./catalog.ts";
import { PRICE_BOOK, type BookEntry } from "../pricing/priceBook.ts";
import { createCouponAttemptBudget } from "./couponAttempts.ts";
import { COUPON_INVALID_AR, GRANT_CODE_AT_CHECKOUT_AR, GRANT_CODE_AT_CHECKOUT_CODE } from "./couponRules.ts";
import { FREE_ACTIVATION_HIGHER_PLAN_AR, FREE_ACTIVATION_OPEN_ORDER_AR, FREE_ACTIVATION_PAID_PLAN_RUNNING_AR, FREE_ACTIVATION_UNAVAILABLE_AR } from "./freeActivationCore.ts";
import { COUPON_PENDING_AR } from "./couponServer.ts";
import { DEMO_LIVE_PAYMENT_AR } from "../api/dbErrorCore.ts";
import { parseCouponPreview, parseFreeActivation } from "./checkoutView.ts";
import { LICENCE_FREE_CODE_PENDING_AR, LICENCE_PURCHASE_CODE, LICENCE_UNVERIFIED_PURCHASE_AR } from "./licenceGate.ts";
import { LIBRARY_ACCOUNT_LOCKED_AR } from "../library/accountAccess.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const NOW = new Date("2026-11-27T08:00:00.000Z");
const USER = "00000000-0000-0000-0000-00000000l018";
const RED = "00000000-0000-0000-0000-0000000018c1";
const RANKS = { free: 0, shield: 1, ai: 2, pro: 3, max: 4, corp: 5, enterprise: 6 } as const;

function asSold(entry: BookEntry): BookEntry {
  return { ...entry, prices: Object.fromEntries(Object.entries(entry.prices).map(([b, p]) => [b, { sar: p!.sar }])) };
}
const BOOK: Readonly<Record<string, BookEntry>> = { ...PRICE_BOOK, "ind-preventive": asSold(PRICE_BOOK["ind-preventive"]) };
const CATALOG = buildCatalog(BOOK);

const FULL = {
  id: "00000000-0000-0000-0000-0000000c0118",
  code: "FREE100",
  discount_type: "percentage",
  discount_value: "100.00",
  min_order_amount: "0.00",
  eligible_user_types: [],
  max_uses: 10,
  used_count: 0,
  valid_from: "2026-06-01T00:00:00Z",
  valid_until: "2027-12-31T23:59:59Z",
  active: true,
  max_discount_pct: "100.00",
  excluded_kinds: ["topup", "service"],
  metadata: {},
};
// a fixed 5,000 SAR off, saved by the super admin (cap 100) — on a 1,490 plan
const FIXED = { ...FULL, id: "00000000-0000-0000-0000-0000000c0119", code: "OFF5000", discount_type: "fixed", discount_value: "5000.00" };

interface Opts {
  userType?: string;
  row?: Record<string, unknown>;
  open?: Record<string, unknown>;
  subs?: object[];
  alreadyEntitledPlan?: boolean;
}

function db(o: Opts = {}, over?: FakeHandler) {
  let granted = false;
  return fakeDb((q) => {
    const r = over?.(q);
    if (r) return r;
    if (q.table === "profiles") return { data: { user_type: o.userType ?? "individual" } };
    if (q.table === "coupons") return { data: o.row ?? FULL };
    if (q.table === "coupon_usage") return { data: [] };
    if (q.table === "payment_orders" && q.op === "select") return { data: [] };
    if (q.table === "payment_orders" && q.op === "insert") return { data: { id: "00000000-0000-0000-0000-0000000b0018" } };
    if (q.table === "payment_orders" && q.op === "update") return { data: [{ id: "00000000-0000-0000-0000-0000000b0018" }] };
    if (q.table === "lawyer_profiles") return { data: { practice_kind: "advocate" } };
    if (q.table === "firm_members") return { data: null };
    if (q.table === "subscriptions" && q.op === "select") {
      const byOrder = q.filters.some(([, c]) => c === "metadata->>order_id");
      if (byOrder) return { data: granted ? [{ id: "sub-free", metadata: { order_id: RED } }] : [] };
      return { data: o.subs ?? [] };
    }
    if (q.table === "subscriptions" && q.op === "update") return { data: null };
    if (q.op === "rpc" && q.table === "coupon_redeem_full_open") {
      return { data: o.open ?? { status: "opened", id: RED, item_id: (q.payload as { p_item: string }).p_item, billing: (q.payload as { p_billing: string }).p_billing, receipt_number: "NZ-2026-000118" } };
    }
    if (q.op === "rpc" && q.table === "coupon_reserve") return { data: "reserved" };
    if (q.op === "rpc" && q.table === "coupon_redeem_open") return { data: { status: "opened", id: RED, kind: "plan", receipt_number: "NZ-2026-000119" } };
    if (q.op === "rpc" && q.table === "grant_plan_subscription") {
      granted = true;
      return { data: { inserted: true, current_period_end: "2027-11-27T08:00:00Z" } };
    }
    if (q.op === "rpc" && q.table === "coupon_redeem_grant_library") return { data: { status: "granted", grant_id: "g-1", ends_at: "2027-02-25T08:00:00Z" } };
    if (q.op === "rpc" && q.table === "coupon_redeem_finish") return { data: (q.payload as { p_ok: boolean }).p_ok ? "granted" : "void" };
    return { data: null };
  });
}

function moyasar() {
  const intents: unknown[] = [];
  const client = {
    async listPaymentsByOrder() {
      return { ok: true as const, data: [] };
    },
    async createIntent(i: unknown) {
      intents.push(i);
      return { ok: true as const, data: { id: "pi_x", clientSecret: "cs_x", expiresAt: null } };
    },
    async cancelIntent(id: string) {
      return { ok: true as const, data: { id, status: "canceled" } };
    },
  } as unknown as CheckoutDeps["client"];
  return { client, intents };
}

const input = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
  vatPercent: 15,
  user: { id: USER, email: "buyer@example.test" },
  itemId: "ind-preventive",
  billing: "yearly",
  origin: "https://nezamy.sa",
  publishableKey: "pk_test_x",
  couponCode: "FREE100",
  gatewayMode: "test",
  ...over,
});

const deps = (admin: CheckoutDeps["admin"], m = moyasar(), extra: Partial<CheckoutDeps> = {}): CheckoutDeps => ({
  admin,
  client: m.client,
  now: () => NOW,
  catalog: CATALOG,
  book: BOOK,
  ranks: RANKS,
  attempts: createCouponAttemptBudget(),
  ...extra,
});
const rpcs = (log: FakeQuery[], fn: string) => log.filter((q) => q.op === "rpc" && q.table === fn);
const orderWrites = (log: FakeQuery[]) => log.filter((q) => q.table === "payment_orders" && q.op !== "select");

// ── ق٢٦-١١: the 0 SAR activation at checkout ─────────────────────────────────

test("checkout: a 100 % code → activated at 0 SAR — no card, no intent, no payment_orders row; the plan granted on the redemption", async () => {
  const { client, log } = db();
  const m = moyasar();
  const r = await startCheckoutWith(deps(client, m), input());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const done = parseFreeActivation(r.body);
  assert.ok(done, JSON.stringify(r.body));
  assert.equal(done.redemptionId, RED);
  assert.equal(done.receiptNumber, "NZ-2026-000118");
  assert.equal(done.itemId, "ind-preventive");
  assert.equal(done.listNet, 149000);
  assert.equal(m.intents.length, 0, "Moyasar never asked");
  assert.equal(orderWrites(log).length, 0, "no payment_orders row");
  assert.equal(log.filter((q) => q.table === "payment_methods").length, 0, "no saved-card read any more");
  const open = rpcs(log, "coupon_redeem_full_open")[0].payload as Record<string, unknown>;
  assert.deepEqual(
    { kind: open.p_kind, item: open.p_item, billing: open.p_billing, list: open.p_list_net, coupon: open.p_coupon },
    { kind: "plan", item: "ind-preventive", billing: "yearly", list: 149000, coupon: FULL.id },
  );
  assert.equal((rpcs(log, "grant_plan_subscription")[0].payload as { p_order: string }).p_order, RED, "keyed on the redemption");
  assert.deepEqual(rpcs(log, "coupon_redeem_finish")[0].payload, { p_redemption: RED, p_ok: true, p_subscription: "sub-free" });
  assert.equal(log.filter((q) => q.table === "admin_audit_events" && q.op === "insert").length, 1);
});

test("checkout: a fixed amount at least the price (5,000 off a 1,490 plan, super admin's cap 100) → the same 0 SAR activation", async () => {
  const { client, log } = db({ row: FIXED });
  const r = await startCheckoutWith(deps(client), input({ couponCode: "OFF5000" }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(parseFreeActivation(r.body));
  assert.equal((rpcs(log, "coupon_redeem_full_open")[0].payload as { p_list_net: number }).p_list_net, 149000);
});

test("checkout: a library pass by a free code — the pass and its points on the redemption, never a plan grant", async () => {
  const { client, log } = db({ userType: "lawyer" });
  const r = await startCheckoutWith(deps(client), input({ itemId: "lib-q1", billing: "once" }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(rpcs(log, "grant_plan_subscription").length, 0);
  const lib = rpcs(log, "coupon_redeem_grant_library")[0].payload as Record<string, unknown>;
  assert.deepEqual({ ref: lib.p_plan_ref, days: lib.p_days, red: lib.p_redemption }, { ref: "lib-q1", days: 90, red: RED });
  assert.equal((rpcs(log, "coupon_redeem_full_open")[0].payload as { p_kind: string }).p_kind, "library");
});

test("checkout: the office + library bundle — the plan on the redemption, then its library pass (yearly → lib-annual, 365 days)", async () => {
  const { client, log } = db({ userType: "lawyer" });
  const r = await startCheckoutWith(deps(client), input({ itemId: "lawyer-bundle", billing: "yearly" }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(rpcs(log, "grant_plan_subscription").length, 1);
  const lib = rpcs(log, "coupon_redeem_grant_library")[0].payload as Record<string, unknown>;
  assert.deepEqual({ ref: lib.p_plan_ref, days: lib.p_days }, { ref: "lib-annual", days: 365 });
});

test("checkout: the database refuses (used / exhausted / not full / not for the item) → the coupon sentence or 503; nothing granted", async () => {
  for (const [status, expected] of [
    ["already_used", 400],
    ["exhausted", 400],
    ["invalid", 400],
    ["not_for_item", 400],
    ["not_full", 503],
  ] as const) {
    const { client, log } = db({ open: { status } });
    const r = await startCheckoutWith(deps(client), input());
    assert.equal(r.status, expected, status);
    if (status === "already_used") assert.deepEqual(r.body, { error: COUPON_INVALID_AR });
    if (status === "not_full") assert.deepEqual(r.body, { error: FREE_ACTIVATION_UNAVAILABLE_AR });
    assert.equal(rpcs(log, "grant_plan_subscription").length, 0);
    assert.equal(orderWrites(log).length, 0);
  }
  // 20261208_30 not run → 503, never a 500
  const missing = db({}, (q) => (q.op === "rpc" && q.table === "coupon_redeem_full_open" ? { error: { code: "PGRST202", message: "x" } } : undefined));
  assert.deepEqual(await startCheckoutWith(deps(missing.client), input()), { status: 503, body: { error: FREE_ACTIVATION_UNAVAILABLE_AR } });
});

test("checkout: another paid plan with days left is never cancelled by a free activation (409, nothing opened)", async () => {
  const paid = {
    id: "sub-paid", plan_id: "ind-ai", tier: "ai", status: "active",
    started_at: "2026-10-01T00:00:00Z", current_period_start: "2026-10-01T00:00:00Z", current_period_end: "2027-10-01T00:00:00Z",
    metadata: { method: "bank_transfer" },
  };
  const { client, log } = db({ subs: [paid] });
  const r = await startCheckoutWith(deps(client), input());
  // refused before anything is opened: the free path's own 409, or checkout's upgrade rule (a coupon is never combined with a credit)
  assert.ok(r.status === 409 || r.status === 400, JSON.stringify(r));
  if (r.status === 409) assert.equal((r.body as { error: string }).error, FREE_ACTIVATION_PAID_PLAN_RUNNING_AR);
  assert.equal(rpcs(log, "coupon_redeem_full_open").length, 0);
});

test("checkout: a higher plan turned out to run → the redemption is voided (the use comes back), 409", async () => {
  const { client, log } = db({}, (q) => {
    if (q.op === "rpc" && q.table === "grant_plan_subscription") return { error: { code: "XX000", message: "never reached" } };
    if (q.table === "subscriptions" && q.op === "select" && !q.filters.some(([, c]) => c === "metadata->>order_id")) {
      // readHeldPlans sees nothing; the grant's own read sees an open-ended higher plan
      const fromGrant = q.columns === "id, tier, status, current_period_end";
      return { data: fromGrant ? [{ id: "sub-max", tier: "max", status: "active", current_period_end: null }] : [] };
    }
    return undefined;
  });
  const r = await startCheckoutWith(deps(client), input());
  assert.deepEqual(r, { status: 409, body: { error: FREE_ACTIVATION_HIGHER_PLAN_AR } });
  assert.deepEqual(rpcs(log, "coupon_redeem_finish")[0].payload, { p_redemption: RED, p_ok: false, p_subscription: null });
});

test("checkout: a 50 % code is still charged through Moyasar (nothing free)", async () => {
  const half = { ...FULL, code: "HALF50", discount_value: "50.00", max_discount_pct: "50.00" };
  const { client, log } = db({ row: half });
  const m = moyasar();
  const r = await startCheckoutWith(deps(client, m), input({ couponCode: "HALF50" }));
  assert.equal(r.status, 200);
  assert.equal(rpcs(log, "coupon_redeem_full_open").length, 0);
  assert.equal((m.intents[0] as { amountHalalas: number }).amountHalalas, 85675);
});

// ── the preview ──────────────────────────────────────────────────────────────

test("preview: a code that covers the price → 200 freeActivation, listNet → 100 % → 0 (no card asked)", async () => {
  const { client } = db();
  const r = await validateCouponWith(
    { admin: client, now: () => NOW, catalog: CATALOG, book: BOOK, attempts: createCouponAttemptBudget(), ranks: RANKS },
    { userId: USER, code: "FREE100", itemId: "ind-preventive", billing: "yearly", gatewayMode: "test", vatPercent: 15 },
  );
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { code: "FREE100", freeActivation: true, quote: { listNet: 149000, discount: 149000, net: 0, vat: 0, total: 0 } });
  const preview = parseCouponPreview(r.body);
  assert.ok(preview?.freeActivation);
  // a body claiming a free activation with money left is not parsed
  assert.equal(parseCouponPreview({ code: "X", freeActivation: true, quote: { listNet: 100, discount: 50, net: 50, vat: 8, total: 58 } }), null);
});

// ── LIVE-13: a free-plan / points code in the checkout's box ─────────────────

test("LIVE-13: a free-plan or points code at checkout → 409 grant_code (activate it here), not «غير صالح»; a closed one stays the generic sentence", async () => {
  const grant = { ...FULL, code: "FREE-VIP1", discount_type: "plan_upgrade", discount_value: "0", plan_granted: "lawyer-pro", metadata: { grant_billing: "yearly" } };
  const { client } = db({ row: grant });
  const r = await validateCouponWith(
    { admin: client, now: () => NOW, catalog: CATALOG, book: BOOK, attempts: createCouponAttemptBudget() },
    { userId: USER, code: "FREE-VIP1", itemId: "ind-preventive", billing: "yearly", vatPercent: 15 },
  );
  assert.deepEqual(r, { status: 409, body: { error: GRANT_CODE_AT_CHECKOUT_AR, code: GRANT_CODE_AT_CHECKOUT_CODE } });
  for (const closed of [{ ...grant, active: false }, { ...grant, valid_until: "2026-01-01T00:00:00Z" }, { ...grant, eligible_user_types: ["firm"] }, { ...grant, max_uses: 1, used_count: 1 }]) {
    const c = db({ row: closed });
    const r2 = await validateCouponWith(
      { admin: c.client, now: () => NOW, catalog: CATALOG, book: BOOK, attempts: createCouponAttemptBudget() },
      { userId: USER, code: "FREE-VIP1", itemId: "ind-preventive", billing: "yearly", vatPercent: 15 },
    );
    assert.deepEqual(r2, { status: 400, body: { error: COUPON_INVALID_AR } });
  }
});

test("redeem box: a free LIBRARY code grants the pass on the redemption (no plan grant); the library lock refuses first", async () => {
  const libCode = { ...FULL, id: "c-lib", code: "LIBFREE", discount_type: "plan_upgrade", plan_granted: "lib-q2", points_granted: 0, metadata: { grant_billing: "once" } };
  const { client, log } = db({ userType: "lawyer", row: libCode });
  const r = await redeemCouponWith(
    { admin: client, ranks: RANKS, giftValidDays: async () => 90, attempts: createCouponAttemptBudget(), now: () => NOW, libraryAccountAllowed: async () => true },
    { userId: USER, code: "LIBFREE" },
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(rpcs(log, "grant_plan_subscription").length, 0);
  const lib = rpcs(log, "coupon_redeem_grant_library")[0].payload as Record<string, unknown>;
  assert.deepEqual({ ref: lib.p_plan_ref, days: lib.p_days }, { ref: "lib-q2", days: 180 });
  const locked = db({ userType: "lawyer", row: libCode });
  const r2 = await redeemCouponWith(
    { admin: locked.client, ranks: RANKS, giftValidDays: async () => 90, attempts: createCouponAttemptBudget(), now: () => NOW, libraryAccountAllowed: async () => false },
    { userId: USER, code: "LIBFREE" },
  );
  assert.deepEqual(r2, { status: 403, body: { error: LIBRARY_ACCOUNT_LOCKED_AR } });
  assert.equal(rpcs(locked.log, "coupon_redeem_open").length, 0);
});

// ── ٢٣٩ (replaces the ق٢٦-٩ block): pay now, activate after the approval ──

const PENDING_FACTS = { userType: "lawyer", lawyerStatus: "pending", ownedFirmStatuses: [], memberFirmStatuses: [] };
const REJECTED_FACTS = { ...PENDING_FACTS, lawyerStatus: "rejected" };

test("٢٣٩: a lawyer whose licence is PENDING may pay for a professional plan — the intent is created (the plan is held at fulfilment)", async () => {
  const { client, log } = db({ userType: "lawyer" });
  const m = moyasar();
  const asked: string[] = [];
  const r = await startCheckoutWith(
    deps(client, m, { licenceFacts: async (id, type) => { asked.push(`${id}:${type}`); return PENDING_FACTS; } }),
    input({ itemId: "lawyer-pro", billing: "yearly", couponCode: null }),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(asked, [`${USER}:lawyer`]);
  assert.equal(m.intents.length, 1);
  assert.equal(orderWrites(log).filter((q) => q.op === "insert").length, 1);
});

test("٢٣٩: an unverified licence (rejected / none) is sent to verify first — 403 with the code and the link, nothing written; a failed read → 503", async () => {
  const { client, log } = db({ userType: "lawyer" });
  const m = moyasar();
  const r = await startCheckoutWith(deps(client, m, { licenceFacts: async () => REJECTED_FACTS }), input({ itemId: "lawyer-pro", billing: "yearly", couponCode: null }));
  assert.deepEqual(r, { status: 403, body: { error: LICENCE_UNVERIFIED_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: "/register/provider/verify" } });
  assert.equal(orderWrites(log).length, 0);
  assert.equal(m.intents.length, 0);
  const down = db({ userType: "lawyer" });
  const r2 = await startCheckoutWith(deps(down.client, moyasar(), { licenceFacts: async () => { throw new Error("down"); } }), input({ itemId: "lawyer-pro", billing: "yearly", couponCode: null }));
  assert.equal(r2.status, 503);
});

test("٢٣٩: a 100 % code for a professional plan needs a VERIFIED licence — refused before the code is opened (not used up)", async () => {
  const { client, log } = db({ userType: "lawyer" });
  const r = await startCheckoutWith(deps(client, moyasar(), { licenceFacts: async () => PENDING_FACTS }), input({ itemId: "lawyer-pro", billing: "yearly" }));
  assert.deepEqual(r, { status: 403, body: { error: LICENCE_FREE_CODE_PENDING_AR, code: LICENCE_PURCHASE_CODE } });
  assert.equal(rpcs(log, "coupon_redeem_full_open").length, 0);
});

test("٢٣٩: the library, a top-up and an individual's plan are not asked about a licence", async () => {
  let asked = 0;
  const licenceFacts = async () => { asked++; return REJECTED_FACTS; };
  const lib = db({ userType: "lawyer" });
  await startCheckoutWith(deps(lib.client, moyasar(), { licenceFacts }), input({ itemId: "lib-q1", billing: "once", couponCode: null }));
  const ind = db({ userType: "individual" });
  await startCheckoutWith(deps(ind.client, moyasar(), { licenceFacts }), input({ couponCode: null }));
  assert.equal(asked, 0);
});

test("٢٣٩: the free-plan box activates a professional plan only for a verified licence (the code is not opened)", async () => {
  const proCode = { ...FULL, id: "c-pro", code: "PROFREE", discount_type: "plan_upgrade", plan_granted: "lawyer-pro", points_granted: 0, metadata: { grant_billing: "yearly" } };
  const { client, log } = db({ userType: "lawyer", row: proCode });
  const r = await redeemCouponWith(
    { admin: client, ranks: RANKS, giftValidDays: async () => 90, attempts: createCouponAttemptBudget(), now: () => NOW, licenceFacts: async () => PENDING_FACTS },
    { userId: USER, code: "PROFREE" },
  );
  assert.deepEqual(r, { status: 403, body: { error: LICENCE_FREE_CODE_PENDING_AR } });
  assert.equal(rpcs(log, "coupon_redeem_open").length, 0);
});

test("source contract: the checkout route wires the licence facts; the page tells a pending buyer the plan activates after the approval", () => {
  const route = readFileSync(join(ROOT, "src", "app", "api", "v1", "payments", "checkout", "route.ts"), "utf8");
  assert.match(route, /licenceFacts: \(userId, userType\) => readLicenceFacts\(admin, userId, userType\),/);
  const page = readFileSync(join(ROOT, "src", "app", "checkout", "page.tsx"), "utf8");
  assert.match(page, /const licence = licenceCheckoutDecision\(userType, facts\);/);
  assert.match(page, /<Notice title=\{licence\.error\} verifyHref=\{licence\.verifyHref \?\? null\} \/>/);
  assert.match(page, /const notes = licenceHeld \? \[LICENCE_HELD_NOTE_AR, \.\.\.itemNotes\] : itemNotes;/);
  const redeem = readFileSync(join(ROOT, "src", "app", "api", "v1", "coupons", "redeem", "route.ts"), "utf8");
  assert.match(redeem, /licenceFacts: \(userId, userType\) => readLicenceFacts\(admin, userId, userType\),/);
});

// ── l18 review (pay S1 / S4) ─────────────────────────────────────────────────

test("checkout S1: an open order for the same item (a form opened before the code) is closed first; the database's «pending» answers 409", async () => {
  const OPEN_ID = "00000000-0000-0000-0000-0000000b0019";
  const { client, log } = db({}, (q) => {
    // the supersede read (by item_id) sees the earlier form's order; the coupon read sees nothing
    if (q.table === "payment_orders" && q.op === "select" && q.filters.some(([, c]) => c === "item_id")) {
      return { data: [{ id: OPEN_ID, item_id: "ind-preventive", status: "initiated", moyasar_intent_id: "pi_old", moyasar_payment_id: null }] };
    }
    return undefined;
  });
  const m = moyasar();
  const cancelled: string[] = [];
  (m.client as unknown as { cancelIntent: (id: string) => Promise<unknown> }).cancelIntent = async (id: string) => {
    cancelled.push(id);
    return { ok: true, data: { id, status: "canceled" } };
  };
  const r = await startCheckoutWith(deps(client, m), input({ billing: "monthly" }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(cancelled, ["pi_old"], "the earlier intent is cancelled");
  const close = log.findIndex((q) => q.table === "payment_orders" && q.op === "update" && q.filters.some(([, c, v]) => c === "id" && v === OPEN_ID));
  const open = log.findIndex((q) => q.op === "rpc" && q.table === "coupon_redeem_full_open");
  assert.ok(close >= 0 && open > close, "the order is closed before the code is opened");

  for (const [reason, expected] of [["coupon", COUPON_PENDING_AR], ["item", FREE_ACTIVATION_OPEN_ORDER_AR]] as const) {
    const pending = db({ open: { status: "pending", reason } });
    const p = await startCheckoutWith(deps(pending.client), input());
    assert.equal(p.status, 409, reason);
    assert.equal((p.body as { error: string }).error, expected, reason);
    assert.equal(rpcs(pending.log, "grant_plan_subscription").length, 0, `${reason}: nothing granted`);
  }
});

test("checkout S4: a test account gets no real 0 SAR activation outside test mode (the paid-order rule)", async () => {
  const testAccount = (q: FakeQuery) => (q.op === "rpc" && q.table === "is_test_account" ? { data: true } : undefined);
  const live = db({}, testAccount);
  const r = await startCheckoutWith(deps(live.client), input({ gatewayMode: "live" }));
  assert.equal(r.status, 403, JSON.stringify(r.body));
  assert.equal((r.body as { error: string }).error, DEMO_LIVE_PAYMENT_AR);
  assert.equal(rpcs(live.log, "coupon_redeem_full_open").length, 0, "the code is never opened");
  // in test mode the same account is activated (nothing real is spent)
  const sandbox = db({}, testAccount);
  const t = await startCheckoutWith(deps(sandbox.client), input({ gatewayMode: "test" }));
  assert.equal(t.status, 201, JSON.stringify(t.body));
  assert.equal(rpcs(sandbox.log, "is_test_account").length, 0);
  // a real account in live mode: asked, then activated; an unreadable answer → 503
  const real = db();
  assert.equal((await startCheckoutWith(deps(real.client), input({ gatewayMode: "live" }))).status, 201);
  assert.equal(rpcs(real.log, "is_test_account").length, 1);
  const down = db({}, (q) => (q.op === "rpc" && q.table === "is_test_account" ? { error: { code: "XX000" } } : undefined));
  const d = await startCheckoutWith(deps(down.client), input({ gatewayMode: "live" }));
  assert.equal(d.status, 503);
  assert.equal(rpcs(down.log, "coupon_redeem_full_open").length, 0);
});
