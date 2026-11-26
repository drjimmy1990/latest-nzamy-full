import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { frozenAccountResponse, isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import { TIER_RANK } from "@/lib/access-control";
import { readGiftValidDays } from "@/lib/points/pointsSettings";
import { REDEEM_UNAVAILABLE_AR, redeemCouponWith } from "@/lib/payments/couponRedeemCore";

/**
 * POST /api/v1/coupons/redeem — «تفعيل كود» (batch l16, A-08 / A-59 / E-12;
 * owner 25 Nov §7.7.3 and س٢١٣). Body `{ code }`; signed-in only (401); a
 * frozen account (a pending deletion) is refused like every other write.
 * A free-plan or points code is redeemed once (20261206_30) and recorded as
 * full price → 100 % discount → net 0 with a free-activation receipt; a
 * discount code is only recognised (it applies at checkout, or rides on the
 * activation request while online payment is off). The steps and every
 * answer: src/lib/payments/couponRedeemCore.ts (tested there). Works whether
 * or not online payment is on: nothing is charged.
 */

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) return reply({ error: "سجّل الدخول لتفعيل الكود" }, 401);
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const code = typeof raw === "object" && raw !== null ? (raw as { code?: unknown }).code : undefined;

  let admin: Awaited<ReturnType<typeof createServiceClient>>;
  try {
    admin = await createServiceClient();
  } catch {
    return reply({ error: REDEEM_UNAVAILABLE_AR }, 503);
  }

  try {
    const result = await redeemCouponWith(
      { admin, ranks: TIER_RANK, giftValidDays: () => readGiftValidDays(admin) },
      { userId: user.id, code },
    );
    return reply(result.body, result.status);
  } catch (err) {
    console.error("[coupons/redeem] threw:", err instanceof Error ? err.message : "unknown");
    return reply({ error: REDEEM_UNAVAILABLE_AR }, 503);
  }
}
