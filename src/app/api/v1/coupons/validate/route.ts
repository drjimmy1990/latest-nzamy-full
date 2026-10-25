import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { frozenAccountResponse } from "@/lib/auth/apiAuth";
import { parseCheckoutBody } from "@/lib/payments/checkoutRules";
import { validateCouponWith } from "@/lib/payments/couponServer";
import { COUPON_INVALID_AR, COUPONS_UNAVAILABLE_AR, normalizeCouponCode } from "@/lib/payments/couponRules";

/**
 * POST /api/v1/coupons/validate — the coupon preview on /checkout (owner
 * answers of 25 Oct 2026, P7; pricing doc §13أ). Body `{ code, itemId,
 * billing }`; signed-in only (401). Answers 200 `{ code, quote: { listNet,
 * discount, net, vat, total } }` in halalas — the same numbers the checkout
 * POST will store and charge, because both call couponServer.priceWithCoupon.
 * Nothing is written: a coupon is consumed only when an order carrying it is
 * PAID (fulfilment).
 *
 * Unknown, expired, used-up, already-used and wrong-audience codes all answer
 * the same 400 (COUPON_INVALID_AR); a code the buyer holds on another open
 * order answers COUPON_PENDING_AR. Rate-limited per SIGNED-IN USER inside
 * validateCouponWith (couponAttempts.ts: 20 previews / 10 min, the budget
 * checkout's coupon refusals also spend → 429), with a per-address ceiling in
 * src/proxy.ts (X-Real-IP, its own "coupon" bucket,
 * src/lib/rateLimitRoutes.ts). Before 20261026_20 runs: 503 «أكواد الخصم غير
 * متاحة حالياً».
 */

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return reply({ error: "سجّل الدخول لاستخدام كود الخصم" }, 401);
  // D6 (owner ٢٩٨): a frozen account (a pending deletion) cannot pay, so it
  // spends no coupon tries either.
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const code = normalizeCouponCode(body.code);
  const parsed = parseCheckoutBody({ itemId: body.itemId, billing: body.billing });
  if (!parsed.ok) return reply({ error: "طلب غير صالح" }, 400);
  if (!code) return reply({ error: COUPON_INVALID_AR }, 400);

  let admin: Awaited<ReturnType<typeof createServiceClient>>;
  try {
    admin = await createServiceClient();
  } catch {
    return reply({ error: COUPONS_UNAVAILABLE_AR }, 503);
  }

  try {
    const result = await validateCouponWith(
      { admin },
      { userId: user.id, code, itemId: parsed.itemId, billing: parsed.billing },
    );
    return reply(result.body, result.status);
  } catch (err) {
    console.error("[coupons/validate] threw:", err instanceof Error ? err.message : "unknown");
    return reply({ error: COUPONS_UNAVAILABLE_AR }, 503);
  }
}
