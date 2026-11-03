import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";
import { isCouponId } from "@/lib/payments/couponAdminRules";
import {
  COUPON_USAGE_LIMIT,
  couponUsageUserIds,
  mapCouponUsageRows,
  type CouponUsageProfile,
  type CouponUsageRow,
} from "@/lib/payments/couponUsageView";

/**
 * GET /api/v1/admin/coupons/[id]/usage — the coupon's usage log (S6-T13).
 *
 * Reads public.coupon_usage (one row per paid live order that carried the
 * coupon; fulfilment writes it) with the SERVICE role — since 20261026_20 no
 * session may read the table, and no RLS policy is added for this: the gate
 * is requireAdmin(), as for the coupon list. Newest first, at most
 * COUPON_USAGE_LIMIT (200) rows; then the buyers' names and types in ONE
 * profiles read (≤ 200 distinct ids, under the ~396 `.in()` ceiling).
 *
 * A failed read is a 500 with an Arabic error — never an empty list, which
 * the modal would show as «لم يُسجَّل استخدام بعد». Read-only: no write.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const gate = await requireAdmin();
    if (!gate.isAdmin) {
      return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
    }
    if (!isCouponId(id)) {
      return NextResponse.json({ error: "الكوبون غير موجود" }, { status: 404 });
    }

    const adminClient = await createServiceClient();
    const { data: rows, error } = await adminClient
      .from("coupon_usage")
      .select("id, user_id, order_id, discount_applied, created_at")
      .eq("coupon_id", id)
      .order("created_at", { ascending: false })
      .limit(COUPON_USAGE_LIMIT);

    if (error) {
      console.error("[admin/coupons usage GET] coupon_usage read failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّرت قراءة سجل الاستخدام." }, { status: 500 });
    }

    const usage = (Array.isArray(rows) ? rows : []) as CouponUsageRow[];
    const userIds = couponUsageUserIds(usage);
    let profiles: CouponUsageProfile[] = [];
    if (userIds.length > 0) {
      const { data: found, error: profilesError } = await adminClient
        .from("profiles")
        .select("id, display_name, user_type")
        .in("id", userIds);
      if (profilesError) {
        console.error("[admin/coupons usage GET] profiles read failed:", profilesError.code, profilesError.message);
        return NextResponse.json({ error: "تعذّرت قراءة سجل الاستخدام." }, { status: 500 });
      }
      profiles = (Array.isArray(found) ? found : []) as CouponUsageProfile[];
    }

    return NextResponse.json({ data: mapCouponUsageRows(usage, profiles) });
  } catch (err) {
    console.error("[admin/coupons usage GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّرت قراءة سجل الاستخدام." }, { status: 500 });
  }
}
