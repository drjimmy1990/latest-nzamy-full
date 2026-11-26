import { NextRequest, NextResponse } from "next/server";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import {
  BAD_BODY_AR,
  adminCouponMetadataPatch,
  adminDiscountFields,
  couponAudience,
  couponBodyObject,
  couponDateIso,
  couponPurpose,
  PURPOSE_REQUIRED_AR,
} from "@/lib/payments/couponAdminRules";
import { isMissingFeatureColumn } from "@/lib/library/optionalColumn";
import { couponsAvailable } from "@/lib/payments/couponServer";
import {
  POINTS_GRANT_INVALID_AR,
  PLAN_GRANT_INVALID_AR,
  couponPoints,
  grantablePlan,
  highCouponIssue,
  withPlatformOnlyKinds,
} from "@/lib/payments/couponGrantRules";

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

/** l14: the purpose column is missing (20261204_60 not run yet). */
const PURPOSE_MIGRATION_AR = "حقل «الغرض» غير متاح قبل ترحيل 20261204_60 — لم يُحفظ الكود.";

// The page's eligibleRoles ("client", "business", …) become profiles.user_type
// values ("individual", "corporate", …) through couponAdminRules.couponAudience
// (S6-T11: «الشركات» is 'corporate', the type companies have — never 'business').

/**
 * GET /api/v1/admin/coupons — List all coupons (admin, service-role read).
 *
 * FAILURE IS A 500, NOT AN EMPTY LIST. The page treats an empty `data` array as
 * "no coupons are saved yet" and shows INITIAL_COUPONS as a demo
 * (src/app/dashboard/admin/subscriptions/coupons/page.tsx:198-202) — so a
 * failed read used to put invented coupon codes on screen under a message
 * saying the table is empty. It already throws on `!res.ok` into a different,
 * honest toast («تعذّر الاتصال بالخادم»), which is the branch this now takes.
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
      return NextResponse.json({ error: "تعذّر تحميل الكوبونات." }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error("[admin/coupons GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل الكوبونات." }, { status: 500 });
  }
}

/**
 * POST /api/v1/admin/coupons — Create a coupon.
 *
 * Accepts the page's AdminCoupon-ish payload and maps it to the real columns:
 *   code, couponType, discountType, value, pointsGranted, planGranted,
 *   usageLimit, startsAt, expiresAt, status, eligibleRoles[],
 *   minOrderAmount, maxDiscountPct?, excludedKinds?,
 *   firstPaidOrderOnly? (boolean), excludedItems? (price-book ids)
 *
 * S6-T11: an unknown role, a non-boolean firstPaidOrderOnly or an unknown
 * excluded item is a 400 (never silently dropped: a dropped rule widens the
 * coupon).
 *
 * Needs a staff role with settings.write, and is audited (owner ٢١٠).
 *
 * P7 review (finding 2): checkout honours every active discount coupon, so a
 * discount coupon (fixed / percentage) is refused (400) without a minimum
 * order net > 0, with a cap above 25 % or a percentage above 25, and always
 * excludes top-ups — couponAdminRules.adminDiscountFields. Before 20261026_20
 * runs (couponsAvailable false) the two new columns are not sent; the rules
 * still apply.
 *
 * Batch l14 (20261204_60, owner package of 23 Nov §٤): every new code needs
 * its «الغرض» (body.purpose, 3–500 characters — couponPurpose) → 400
 * PURPOSE_REQUIRED_AR; it is stored in coupons.purpose and in the audit row.
 * The cap may go up to 100 % (default 25); a code that covers the whole
 * price is refused at checkout without a saved card (fullDiscount.ts).
 * Before 20261204_60 runs the insert names a missing purpose column → 503.
 *
 * Batch l16 (owner س٢١٣, couponGrantRules.ts): a code above 25 %, and every
 * free-plan / points code, is a management code — super admin only, with its
 * purpose, an end date and a use limit (400 with the reason). A cap of 100 %
 * always excludes the services lawyers and offices sell. A free-plan code
 * names a plan on sale and one of its billings (planGranted + planBilling →
 * plan_granted + metadata.grant_billing); a points code 1–100,000 points.
 *
 * Review M6/M7: a body that is not a JSON object, or a startsAt / expiresAt
 * that is not a date, is a 400 (it was a 500). A date-only value is that day in
 * Riyadh: startsAt from 00:00, expiresAt until 23:59:59 (couponDateIso).
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    let body: Record<string, unknown>;
    try {
      const parsed = couponBodyObject(await request.json());
      if (!parsed) return NextResponse.json({ error: BAD_BODY_AR }, { status: 400 });
      body = parsed;
    } catch {
      return NextResponse.json({ error: BAD_BODY_AR }, { status: 400 });
    }

    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code) {
      return NextResponse.json({ error: "الكود مطلوب" }, { status: 400 });
    }

    // l14: the purpose is mandatory for every new code (owner item 67أ)
    const purpose = couponPurpose(body.purpose);
    if (!purpose) {
      return NextResponse.json({ error: PURPOSE_REQUIRED_AR }, { status: 400 });
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

    const audience = couponAudience(body.eligibleRoles ?? []);
    if (!audience.ok) {
      return NextResponse.json({ error: audience.error }, { status: 400 });
    }
    const eligibleUserTypes = audience.userTypes;

    const startsAt = couponDateIso(body.startsAt, "start");
    const expiresAt = couponDateIso(body.expiresAt, "end");
    if (!startsAt.ok) return NextResponse.json({ error: startsAt.error }, { status: 400 });
    if (!expiresAt.ok) return NextResponse.json({ error: expiresAt.error }, { status: 400 });

    const baseMetadata: Record<string, unknown> = {
      coupon_type: couponType,
      created_by_admin: gate.userId,
      status,
    };
    const flags = adminCouponMetadataPatch(baseMetadata, body);
    if (!flags.ok) {
      return NextResponse.json({ error: flags.error }, { status: 400 });
    }

    const adminClient = await createServiceClient();
    const discount = adminDiscountFields(dbDiscountType, body, {
      withNewColumns: await couponsAvailable(adminClient),
    });
    if (!discount.ok) {
      return NextResponse.json({ error: discount.error }, { status: 400 });
    }

    const usageLimitRaw = Number(body.usageLimit);
    const maxUses = Number.isFinite(usageLimitRaw) && usageLimitRaw > 0 ? Math.floor(usageLimitRaw) : null;

    // l16 (س٢١٣): what a free-plan / points code grants
    let pointsGranted = 0;
    let planGranted: string | null = null;
    const grantMeta: Record<string, unknown> = {};
    if (dbDiscountType === "points_grant") {
      const points = couponPoints(body.pointsGranted);
      if (points === null) return NextResponse.json({ error: POINTS_GRANT_INVALID_AR }, { status: 400 });
      pointsGranted = points;
    } else if (dbDiscountType === "plan_upgrade") {
      const plan = grantablePlan(body.planGranted, body.planBilling);
      if (!plan) return NextResponse.json({ error: PLAN_GRANT_INVALID_AR }, { status: 400 });
      planGranted = plan.id;
      grantMeta.grant_billing = body.planBilling;
    }
    // l16 (س٢١٣ ب): a 100 % cap never reaches a service of a lawyer or an office
    if (Array.isArray(discount.fields.excluded_kinds)) {
      discount.fields.excluded_kinds = withPlatformOnlyKinds(discount.fields.max_discount_pct, discount.fields.excluded_kinds as string[]);
    }

    const insertRow: Record<string, unknown> = {
      code,
      discount_type: dbDiscountType,
      discount_value: Number(body.value) || 0,
      points_granted: pointsGranted,
      plan_granted: planGranted,
      eligible_user_types: eligibleUserTypes,
      max_uses: maxUses,
      valid_from: startsAt.value ?? new Date().toISOString(),
      valid_until: expiresAt.value,
      active,
      created_by: gate.userId,
      purpose,
      metadata: { ...(flags.metadata ?? baseMetadata), ...grantMeta },
      ...discount.fields,
    };

    // l16 (س٢١٣ أ): a management code — super admin, purpose, end date, use limit
    const high = highCouponIssue(insertRow, gate.role);
    if (high) return NextResponse.json({ error: high }, { status: 400 });

    const { data, error } = await adminClient
      .from("coupons")
      .insert(insertRow)
      .select("*")
      .single();

    if (error) {
      if (isMissingFeatureColumn(error, "purpose")) {
        return NextResponse.json({ error: PURPOSE_MIGRATION_AR }, { status: 503 });
      }
      console.error("[admin/coupons POST] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "coupon_created",
      targetType: "coupon",
      targetId: data?.id != null ? String(data.id) : null,
      after: insertRow,
      metadata: { code, purpose },
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error("[admin/coupons POST] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء الكوبون" }, { status: 500 });
  }
}
