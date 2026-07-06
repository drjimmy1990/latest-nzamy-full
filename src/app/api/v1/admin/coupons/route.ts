import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * Coupons admin API — backs src/app/dashboard/admin/subscriptions/coupons/page.tsx
 *
 * The `coupons` table (supabase/migrations/20260603_phase1_003_subscriptions_billing.sql)
 * columns:
 *   id, code, discount_type ('percentage'|'fixed'|'points_grant'|'plan_upgrade'),
 *   discount_value, points_granted, plan_granted, min_order_amount,
 *   eligible_user_types text[], eligible_plan_tiers text[], max_uses,
 *   max_uses_per_user, used_count, valid_from, valid_until, active,
 *   created_by, metadata, created_at, updated_at
 */

// The page's eligibleRoles uses "client"; the DB eligible_user_types uses
// "individual" (matches subscription_plans.audience). Bridge both directions.
function roleToUserType(role: string): string {
  return role === "client" ? "individual" : role;
}

/**
 * GET /api/v1/admin/coupons — List all coupons (admin, service-role read).
 * Resilient: on error returns { data: [] } (200) so the page degrades to its
 * local fallback instead of crashing.
 */
export async function GET() {
  try {
    const gate = await requireAdmin();
    if (!gate.isAdmin) {
      return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
    }

    const adminClient = await createServiceClient();
    const { data, error } = await adminClient
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[admin/coupons GET] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ data: [] });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error("[admin/coupons GET] Unexpected error:", err);
    return NextResponse.json({ data: [] });
  }
}

/**
 * POST /api/v1/admin/coupons — Create a coupon.
 *
 * Accepts the page's AdminCoupon-ish payload and maps it to the real columns:
 *   code, couponType, discountType, value, pointsGranted, planGranted,
 *   usageLimit, startsAt, expiresAt, status, eligibleRoles[]
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin();
    if (!gate.isAdmin) {
      return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code) {
      return NextResponse.json({ error: "الكود مطلوب" }, { status: 400 });
    }

    const couponType = typeof body.couponType === "string" ? body.couponType : "discount";
    const discountType = typeof body.discountType === "string" ? body.discountType : "percentage";

    // Map the page's couponType/discountType onto the DB discount_type enum.
    let dbDiscountType: string;
    if (couponType === "points") {
      dbDiscountType = "points_grant";
    } else if (couponType === "free_plan") {
      dbDiscountType = "plan_upgrade";
    } else {
      dbDiscountType = discountType === "fixed" ? "fixed" : "percentage";
    }

    // status → active flag. Only "disabled" (or "expired") means active=false.
    const status = typeof body.status === "string" ? body.status : "active";
    const active = status !== "disabled" && status !== "expired";

    const eligibleRoles = Array.isArray(body.eligibleRoles)
      ? (body.eligibleRoles as unknown[]).filter((r): r is string => typeof r === "string")
      : [];
    const eligibleUserTypes = eligibleRoles.map(roleToUserType);

    const usageLimitRaw = Number(body.usageLimit);
    const maxUses = Number.isFinite(usageLimitRaw) && usageLimitRaw > 0 ? Math.floor(usageLimitRaw) : null;

    const insertRow: Record<string, unknown> = {
      code,
      discount_type: dbDiscountType,
      discount_value: Number(body.value) || 0,
      points_granted: Number(body.pointsGranted) || 0,
      plan_granted: typeof body.planGranted === "string" ? body.planGranted : null,
      eligible_user_types: eligibleUserTypes,
      max_uses: maxUses,
      valid_from: body.startsAt ? new Date(String(body.startsAt)).toISOString() : new Date().toISOString(),
      valid_until: body.expiresAt ? new Date(String(body.expiresAt)).toISOString() : null,
      active,
      created_by: gate.userId,
      metadata: {
        coupon_type: couponType,
        created_by_admin: gate.userId,
        status,
      },
    };

    const adminClient = await createServiceClient();
    const { data, error } = await adminClient
      .from("coupons")
      .insert(insertRow)
      .select("*")
      .single();

    if (error) {
      console.error("[admin/coupons POST] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error("[admin/coupons POST] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء الكوبون" }, { status: 500 });
  }
}
