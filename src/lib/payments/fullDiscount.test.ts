/**
 * fullDiscount.test.ts — batch l14 (owner package of 23 Nov §٤, item 67أ/67ب):
 * a code up to 100 % with a mandatory purpose, and the full-discount path
 * that needs a saved card and is not activated yet. Pure rules, the admin
 * purpose rules, and checkout / the coupon preview against a fake service
 * client: a code that leaves less than 1 SAR never reaches Moyasar and never
 * writes an order.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeDb, type FakeQuery } from "./fakeDb.test-helper.ts";
import {
  FULL_DISCOUNT_ACTIVATION_READY,
  FULL_DISCOUNT_CARD_CHECK_FAILED_AR,
  FULL_DISCOUNT_CARD_REQUIRED_AR,
  FULL_DISCOUNT_CARD_REQUIRED_CODE,
  FULL_DISCOUNT_PENDING_AR,
  FULL_DISCOUNT_PENDING_CODE,
  fullDiscountDecision,
  hasUsableSavedCard,
  isFullDiscount,
  MOYASAR_MIN_CHARGE_HALALAS,
  savedCardUsable,
} from "./fullDiscount.ts";
import {
  adminPurposePatch,
  couponPurpose,
  PURPOSE_HIGH_CAP_AR,
  PURPOSE_REQUIRED_AR,
} from "./couponAdminRules.ts";
import { startCheckoutWith, type CheckoutDeps, type CheckoutInput } from "./checkoutCore.ts";
import { validateCouponWith } from "./couponServer.ts";
import { buildCatalog } from "./catalog.ts";
import { PRICE_BOOK, type BookEntry } from "../pricing/priceBook.ts";
import { createCouponAttemptBudget } from "./couponAttempts.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const NOW = new Date("2026-11-24T08:00:00.000Z");
const USER = "00000000-0000-0000-0000-00000000u014";

// ── the pure rules ────────────────────────────────────────────────────────────

test("isFullDiscount: below Moyasar's smallest charge (1 SAR = 100 halalas)", () => {
  assert.equal(MOYASAR_MIN_CHARGE_HALALAS, 100);
  assert.equal(isFullDiscount(0), true);
  assert.equal(isFullDiscount(99), true);
  assert.equal(isFullDiscount(100), false);
  assert.equal(isFullDiscount(171350), false);
  assert.equal(isFullDiscount(Number.NaN), false);
});

test("savedCardUsable: active, saved in this gateway mode, not past its expiry month (Riyadh)", () => {
  const card = { status: "active", live: true, exp_month: "11", exp_year: "2026" };
  assert.equal(savedCardUsable(card, "live", NOW), true);
  // through the end of its expiry month, in Riyadh: 30 Nov 22:00 UTC is already 1 Dec there
  assert.equal(savedCardUsable(card, "live", new Date("2026-11-30T20:00:00Z")), true);
  assert.equal(savedCardUsable(card, "live", new Date("2026-11-30T22:00:00Z")), false);
  assert.equal(savedCardUsable({ ...card, exp_year: "26" }, "live", NOW), true);
  assert.equal(savedCardUsable({ ...card, exp_month: "10" }, "live", NOW), false);
  // the other mode, an unknown mode, an inactive card, an unreadable expiry
  assert.equal(savedCardUsable(card, "test", NOW), false);
  assert.equal(savedCardUsable({ ...card, live: null }, "live", NOW), false);
  assert.equal(savedCardUsable(card, undefined, NOW), false);
  assert.equal(savedCardUsable({ ...card, status: "inactive" }, "live", NOW), false);
  assert.equal(savedCardUsable({ ...card, exp_month: null }, "live", NOW), false);
  assert.equal(savedCardUsable({ ...card, exp_month: "13" }, "live", NOW), false);
  assert.equal(savedCardUsable({ ...card, live: false }, "test", NOW), true);
});

test("fullDiscountDecision: no card → card_required; a card → pending while the activation is not built; a failed read → 503", () => {
  assert.equal(FULL_DISCOUNT_ACTIVATION_READY, false);
  assert.deepEqual(fullDiscountDecision(false), {
    ok: false,
    status: 409,
    error: FULL_DISCOUNT_CARD_REQUIRED_AR,
    code: FULL_DISCOUNT_CARD_REQUIRED_CODE,
  });
  assert.deepEqual(fullDiscountDecision(true), { ok: false, status: 409, error: FULL_DISCOUNT_PENDING_AR, code: FULL_DISCOUNT_PENDING_CODE });
  assert.deepEqual(fullDiscountDecision(null), { ok: false, status: 503, error: FULL_DISCOUNT_CARD_CHECK_FAILED_AR });
  assert.deepEqual(fullDiscountDecision(true, true), { ok: true });
  // honest Arabic: says a saved card is needed and that the rest is not active yet
  assert.match(FULL_DISCOUNT_CARD_REQUIRED_AR, /بطاقة دفع محفوظة/);
  assert.match(FULL_DISCOUNT_CARD_REQUIRED_AR, /قيد التفعيل/);
  assert.match(FULL_DISCOUNT_PENDING_AR, /قيد التفعيل/);
});

test("hasUsableSavedCard: reads the platform's active cards (never the token), true / false / null", async () => {
  const live = { status: "active", live: true, exp_month: "12", exp_year: "2030" };
  const { client, log } = fakeDb((q) => (q.table === "payment_methods" ? { data: [live] } : undefined));
  assert.equal(await hasUsableSavedCard(client, USER, "live", NOW), true);
  assert.equal(await hasUsableSavedCard(client, USER, "test", NOW), false);
  const q = log[0];
  assert.equal(q.columns, "status, live, exp_month, exp_year");
  assert.ok(!String(q.columns).includes("token"));
  assert.deepEqual(q.filters, [
    ["eq", "user_id", USER],
    ["eq", "merchant", "platform"],
    ["eq", "status", "active"],
  ]);
  const failed = fakeDb(() => ({ error: { code: "57014", message: "timeout" } }));
  assert.equal(await hasUsableSavedCard(failed.client, USER, "live", NOW), null);
  const none = fakeDb(() => ({ data: [] }));
  assert.equal(await hasUsableSavedCard(none.client, USER, "live", NOW), false);
});

// ── the purpose (owner item 67أ) ──────────────────────────────────────────────

test("couponPurpose: 3–500 characters after trimming (spaces collapsed); anything else is null", () => {
  assert.equal(couponPurpose("  تجربة   مجانية لمكتب شريك "), "تجربة مجانية لمكتب شريك");
  assert.equal(couponPurpose("ab"), null);
  assert.equal(couponPurpose("   "), null);
  assert.equal(couponPurpose(""), null);
  assert.equal(couponPurpose(undefined), null);
  assert.equal(couponPurpose(42), null);
  assert.equal(couponPurpose("x".repeat(500))?.length, 500);
  assert.equal(couponPurpose("x".repeat(501)), null);
});

test("adminPurposePatch: set or changed, never cleared; a cap above 25 needs one", () => {
  assert.deepEqual(adminPurposePatch({ purpose: null, max_discount_pct: 25 }, {}), { ok: true, fields: {} });
  assert.deepEqual(adminPurposePatch({ purpose: null, max_discount_pct: 25 }, { purpose: " تعويض عميل " }), {
    ok: true,
    fields: { purpose: "تعويض عميل" },
  });
  assert.deepEqual(adminPurposePatch({ purpose: "قديم", max_discount_pct: 25 }, { purpose: "" }), { ok: false, error: PURPOSE_REQUIRED_AR });
  // raising the cap above 25 on a code saved without a purpose
  assert.deepEqual(adminPurposePatch({ purpose: null, max_discount_pct: "25.00" }, { maxDiscountPct: 100 }), { ok: false, error: PURPOSE_HIGH_CAP_AR });
  assert.deepEqual(adminPurposePatch({ purpose: null, max_discount_pct: 25 }, { maxDiscountPct: 100, purpose: "تجربة مجانية" }), {
    ok: true,
    fields: { purpose: "تجربة مجانية" },
  });
  assert.deepEqual(adminPurposePatch({ purpose: "تجربة مجانية", max_discount_pct: 25 }, { maxDiscountPct: 100 }), { ok: true, fields: {} });
  // a stored 100 % code without a purpose (impossible after 20261204_60) cannot be saved until it gets one
  assert.deepEqual(adminPurposePatch({ purpose: null, max_discount_pct: 100 }, { usageLimit: 5 }), { ok: false, error: PURPOSE_HIGH_CAP_AR });
});

test("the admin routes and page: purpose required on create, patched on edit, stored and shown", () => {
  const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
  const create = read("src", "app", "api", "v1", "admin", "coupons", "route.ts");
  const patch = read("src", "app", "api", "v1", "admin", "coupons", "[id]", "route.ts");
  const page = read("src", "app", "dashboard", "admin", "subscriptions", "coupons", "page.tsx");
  assert.match(create, /const purpose = couponPurpose\(body\.purpose\);\s*if \(!purpose\) \{\s*return NextResponse\.json\(\{ error: PURPOSE_REQUIRED_AR \}, \{ status: 400 \}\);/);
  assert.match(create, /created_by: gate\.userId,\s*purpose,/);
  assert.match(patch, /const purpose = adminPurposePatch\(prior, body\);/);
  assert.match(patch, /Object\.assign\(updateData, purpose\.fields\);/);
  assert.match(page, /<Field label="الغرض من الكود — مطلوب">/);
  assert.match(page, /purpose: typeof row\.purpose === "string" \? row\.purpose : ""/);
  assert.match(page, /max=\{100\}/);
  assert.doesNotMatch(page, /max=\{25\}/);
});

// ── checkout and the preview ─────────────────────────────────────────────────

/** A book entry with none of its cycles retired. */
function asSold(entry: BookEntry): BookEntry {
  return {
    ...entry,
    prices: Object.fromEntries(Object.entries(entry.prices).map(([billing, p]) => [billing, { sar: p!.sar }])),
  };
}
const BOOK: Readonly<Record<string, BookEntry>> = { ...PRICE_BOOK, "ind-preventive": asSold(PRICE_BOOK["ind-preventive"]) };
const CATALOG = buildCatalog(BOOK);

const FULL_ROW = {
  id: "00000000-0000-0000-0000-0000000c0100",
  code: "FREE100",
  discount_type: "percentage",
  discount_value: "100.00",
  min_order_amount: "1.00",
  eligible_user_types: [],
  max_uses: null,
  used_count: 0,
  valid_from: "2026-06-01T00:00:00Z",
  valid_until: "2027-12-31T23:59:59Z",
  active: true,
  max_discount_pct: "100.00",
  excluded_kinds: ["topup"],
  metadata: {},
};

function db(opts: { row?: Record<string, unknown>; cards?: unknown[]; cardErr?: boolean } = {}) {
  return fakeDb((q) => {
    if (q.table === "profiles") return { data: { user_type: "individual" } };
    if (q.table === "coupons") return { data: opts.row ?? FULL_ROW };
    if (q.table === "coupon_usage") return { data: [] };
    if (q.table === "payment_methods") return opts.cardErr ? { error: { code: "57014", message: "x" } } : { data: opts.cards ?? [] };
    if (q.table === "payment_orders" && q.op === "select") return { data: [] };
    if (q.table === "payment_orders" && q.op === "insert") return { data: { id: "00000000-0000-0000-0000-0000000b0014" } };
    if (q.table === "payment_orders" && q.op === "update") return { data: [{ id: "00000000-0000-0000-0000-0000000b0014" }] };
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

const LIVE_CARD = { status: "active", live: false, exp_month: "12", exp_year: "2030" };
const orderWrites = (log: FakeQuery[]) => log.filter((q) => q.table === "payment_orders" && q.op !== "select");

// l18 (owner ق٢٦-١١, س٢٢٤ settled): a code that covers the whole price is no
// longer refused for want of a saved card — it is activated at 0 SAR. Its
// checkout and preview behaviour is tested in freeActivation.test.ts.
void FULL_ROW; void db; void moyasar; void input; void LIVE_CARD; void orderWrites;
void startCheckoutWith; void validateCouponWith; void createCouponAttemptBudget;

test("the validate route passes the gateway mode (payments_gateway) to the preview", () => {
  const route = readFileSync(join(ROOT, "src", "app", "api", "v1", "coupons", "validate", "route.ts"), "utf8");
  assert.match(route, /const cfg = await getMoyasarConfig\(\);\s*if \(cfg\.enabled\) gatewayMode = cfg\.mode;/);
  assert.match(route, /billing: parsed\.billing, gatewayMode, vatPercent: vatPercentFor\(vatRegistered\) \}/);
});
