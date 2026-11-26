/**
 * couponFounderPreview.test.ts — batch l11 pay, O8 / F12d: for an active
 * founder member, the coupon preview (validateCouponWith, behind
 * POST /api/v1/coupons/validate) shows what checkout (startCheckoutWith step
 * 3c) will charge — the larger of the coupon and the founder discount, never
 * both. Each case runs BOTH on the same fake database and compares the net
 * and the total (preview == charge).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/payments/couponFounderPreview.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fakeDb } from "./fakeDb.test-helper.ts";
import { startCheckoutWith, type CheckoutDeps, type CheckoutInput } from "./checkoutCore.ts";
import { createCouponAttemptBudget } from "./couponAttempts.ts";
import { validateCouponWith } from "./couponServer.ts";
import { FOUNDER_DISCOUNT_FAILED_AR } from "./founderDiscount.ts";
import { COUPON_REPLACES_FOUNDER_AR, FOUNDER_BEATS_COUPON_AR, parseCouponPreview } from "./checkoutView.ts";

const NOW = new Date("2026-10-22T08:00:00.000Z");
const USER = "00000000-0000-0000-0000-00000000u011";
const NEW_ORDER = "00000000-0000-0000-0000-0000000b0011";

const COUPON = {
  id: "00000000-0000-0000-0000-0000000c0011",
  code: "LIB50",
  discount_type: "fixed",
  discount_value: "50.00",
  min_order_amount: "0.00",
  eligible_user_types: [],
  max_uses: null,
  used_count: 0,
  valid_from: "2026-06-01T00:00:00Z",
  valid_until: "2027-12-31T23:59:59Z",
  active: true,
  max_discount_pct: "25.00",
  excluded_kinds: ["topup"],
};

function moyasar(): CheckoutDeps["client"] {
  return {
    async listPaymentsByOrder() {
      return { ok: true as const, data: [] };
    },
    async createIntent() {
      return { ok: true as const, data: { id: "pi_new", clientSecret: "cs", expiresAt: null } };
    },
    async cancelIntent(id: string) {
      return { ok: true as const, data: { id, status: "canceled" } };
    },
  } as unknown as CheckoutDeps["client"];
}

function db(opts: { founder: boolean | "error"; coupon: Record<string, unknown> }) {
  return fakeDb((q) => {
    if (q.table === "profiles") return { data: { user_type: "lawyer" } };
    if (q.table === "subscriptions") return { data: [] };
    if (q.table === "founder_seats") {
      if (opts.founder === "error") return { error: { code: "XX000" } };
      return { data: opts.founder ? [{ id: "seat", activated_at: "2026-10-01T00:00:00.000Z" }] : [] };
    }
    if (q.table === "coupons") return { data: opts.coupon };
    if (q.table === "coupon_usage") return { data: [] };
    if (q.table === "payment_orders" && q.op === "select") return { data: [] };
    if (q.table === "payment_orders" && q.op === "insert") return { data: { id: NEW_ORDER } };
    if (q.table === "payment_orders" && q.op === "update") return { data: [{ id: NEW_ORDER }] };
    return { data: null };
  });
}

const input: CheckoutInput = {
  vatPercent: 15,
  user: { id: USER, email: "buyer@example.test" },
  itemId: "lib-q1",
  billing: "once",
  couponCode: "LIB50",
  origin: "https://nezamy.sa",
  publishableKey: "pk_test_x",
};

async function both(opts: { founder: boolean | "error"; coupon: Record<string, unknown> }) {
  const p = db(opts);
  const preview = await validateCouponWith(
    { admin: p.client, now: () => NOW, attempts: createCouponAttemptBudget() },
    { userId: USER, code: "LIB50", itemId: "lib-q1", billing: "once", vatPercent: 15 },
  );
  const c = db(opts);
  const charge = await startCheckoutWith({ admin: c.client, client: moyasar(), now: () => NOW, attempts: createCouponAttemptBudget() }, input);
  return { preview, charge, previewLog: p.log };
}

function figures(r: { status: number; body: unknown }) {
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const q = (r.body as { quote: { net: number; total: number } }).quote;
  return { net: q.net, total: q.total };
}

// lib-q1 = 1,990 SAR; the founder's 15 % = 298.50 SAR

test("O8: founder 15 % beats a 50 SAR coupon — the preview shows the founder figures, flagged, equal to the charge", async () => {
  const { preview, charge, previewLog } = await both({ founder: true, coupon: COUPON });
  assert.deepEqual(figures(preview), figures(charge));
  assert.deepEqual(figures(preview), { net: 169150, total: 194523 });
  assert.equal((preview.body as { source?: string }).source, "founder");
  const parsed = parseCouponPreview(preview.body);
  assert.equal(parsed?.founderWins, true);
  assert.equal(parsed?.discount, 29850);
  assert.equal(previewLog.filter((q) => q.op !== "select").length, 0, "the preview writes nothing");
});

test("O8: a 400 SAR coupon beats the founder 15 % — the coupon's figures, no flag, equal to the charge", async () => {
  const { preview, charge } = await both({ founder: true, coupon: { ...COUPON, discount_value: "400.00" } });
  assert.deepEqual(figures(preview), figures(charge));
  assert.deepEqual(figures(preview), { net: 159000, total: 182850 });
  assert.equal("source" in (preview.body as object), false);
  assert.equal(parseCouponPreview(preview.body)?.founderWins, undefined);
  // the founder line above the form is replaced, and the screen says so
  assert.equal((preview.body as { replacesFounder?: boolean }).replacesFounder, true);
  assert.equal(parseCouponPreview(preview.body)?.replacesFounder, true);
  assert.match(COUPON_REPLACES_FOUNDER_AR, /يُطبَّق الكود وحده بدل خصم المؤسس/);
});

test("O8: a tie goes to the founder discount, in the preview as at checkout", async () => {
  const { preview, charge } = await both({ founder: true, coupon: { ...COUPON, discount_value: "298.50" } });
  assert.deepEqual(figures(preview), figures(charge));
  assert.equal((preview.body as { source?: string }).source, "founder");
  assert.equal("replacesFounder" in (preview.body as object), false);
});

test("O8: a non-founder sees the coupon as before; a failed founder read is the same 503 in both", async () => {
  const plain = await both({ founder: false, coupon: COUPON });
  assert.deepEqual(figures(plain.preview), figures(plain.charge));
  assert.deepEqual(figures(plain.preview), { net: 194000, total: 223100 });
  assert.equal("source" in (plain.preview.body as object), false);
  assert.equal("replacesFounder" in (plain.preview.body as object), false, "a non-founder's preview is unchanged");

  const broken = await both({ founder: "error", coupon: COUPON });
  assert.deepEqual(broken.preview, { status: 503, body: { error: FOUNDER_DISCOUNT_FAILED_AR } });
  assert.equal(broken.charge.status, 503);
  assert.equal((broken.charge.body as { error: string }).error, FOUNDER_DISCOUNT_FAILED_AR);
});

test("O8: the screen does not send the code when the founder discount wins, and says why", () => {
  assert.match(FOUNDER_BEATS_COUPON_AR, /خصم العضو المؤسس أكبر/);
  // source pin (a client component cannot be imported under node --test)
  const form = readFileSync(join(import.meta.dirname, "..", "..", "components", "payments", "MoyasarCheckout.tsx"), "utf8");
  assert.ok(form.includes("couponCode.current = checked.preview.founderWins ? null : checked.preview.code;"));
  assert.ok(form.includes("coupon.founderWins ? FOUNDER_BEATS_COUPON_AR : COUPON_REPLACES_FOUNDER_AR"));
});
