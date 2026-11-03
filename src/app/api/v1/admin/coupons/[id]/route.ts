import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import {
  BAD_BODY_AR,
  adminCouponMetadataPatch,
  adminDiscountPatch,
  buildCouponPatchMetadata,
  couponAudience,
  couponBodyObject,
  couponDateIso,
  couponExpectedUpdatedAt,
  isCouponId,
} from "@/lib/payments/couponAdminRules";

/**
 * PATCH /api/v1/admin/coupons/[id] — Update a coupon (e.g. enable/disable).
 *
 * Body (all optional; the page sends only what changed — couponAdminDiff):
 *   active?: boolean          — toggle enable/disable directly
 *   status?: string           — "disabled"/"expired" => active=false, else true
 *   value?: number            — discount_value
 *   pointsGranted?: number    — points_granted
 *   usageLimit?: number       — max_uses
 *   startsAt?: string         — valid_from
 *   expiresAt?: string        — valid_until
 *   expectedUpdatedAt?: string — the updated_at the page loaded (review M1)
 *   eligibleRoles?: string[]  — eligible_user_types (client => individual,
 *                               business => corporate; [] = everyone)
 *   minOrderAmount?: number   — min_order_amount (> 0 on a discount coupon)
 *   maxDiscountPct?: number   — max_discount_pct (0 < pct <= 25)          (S6-T11)
 *   excludedKinds?: string[]  — excluded_kinds (topup always in)           (S6-T11)
 *   firstPaidOrderOnly?: bool — metadata.first_paid_order_only (٣٠٥)      (S6-T11)
 *   excludedItems?: string[]  — metadata.excluded_items (price-book ids)   (S6-T11)
 *
 * P7 review (finding 2): a discount coupon never gets a minimum of 0 nor a
 * percentage above 25, and is never switched ON while its minimum is 0 (the
 * old seed's LAUNCH2026, or a code made before the rule) —
 * couponAdminRules.adminDiscountPatch, 400 with the reason.
 *
 * S6-T11: metadata is built ONCE (buildCouponPatchMetadata): the stored keys
 * (owner_rules, rules, first_order_rule …), then the flags, then the status —
 * so a body with a status and a flag keeps both. Review M1: the update is
 * conditional on the updated_at the PAGE loaded (body.expectedUpdatedAt): an
 * edit by another admin or a coupon use since the page opened (the trigger
 * that bumps used_count bumps updated_at too) is a 409, not a lost update.
 * A caller that sends no expectedUpdatedAt is guarded against this route's
 * own read only (a change while saving). A bad id is a 404 before any read;
 * a non-object body or a bad date is a 400 (startsAt / expiresAt as in POST:
 * a date-only value is that day in Riyadh, couponDateIso).
 *
 * Owner ٢١٠: PATCH needs a staff role with settings.write, DELETE one with
 * coupons.delete; each successful change is audited.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    if (!isCouponId(id)) {
      return NextResponse.json({ error: "الكوبون غير موجود" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      const parsed = couponBodyObject(await request.json());
      if (!parsed) return NextResponse.json({ error: BAD_BODY_AR }, { status: 400 });
      body = parsed;
    } catch {
      return NextResponse.json({ error: BAD_BODY_AR }, { status: 400 });
    }
    const expected = couponExpectedUpdatedAt(body);
    if (!expected.ok) {
      return NextResponse.json({ error: expected.error }, { status: 400 });
    }

    const adminClient = await createServiceClient();

    const { data: existing, error: fetchError } = await adminClient
      .from("coupons")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error("[admin/coupons PATCH] read failed:", fetchError.code, fetchError.message);
      return NextResponse.json({ error: "تعذّر قراءة الكوبون — لم يتغيّر شيء." }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "الكوبون غير موجود" }, { status: 404 });
    }
    const prior = existing as Record<string, unknown>;

    const updateData: Record<string, unknown> = {};

    // Resolve the new active state (explicit `active`, else derive from `status`).
    let nextActive: boolean | undefined;
    if (typeof body.active === "boolean") {
      nextActive = body.active;
    } else if (typeof body.status === "string") {
      nextActive = body.status !== "disabled" && body.status !== "expired";
    }
    if (nextActive !== undefined) {
      updateData.active = nextActive;
    }

    const discount = adminDiscountPatch(existing as Record<string, unknown>, body, nextActive);
    if (!discount.ok) {
      return NextResponse.json({ error: discount.error }, { status: 400 });
    }
    // The cap / kinds columns exist only once 20261026_20 ran (select * carries them).
    if (
      ("max_discount_pct" in discount.fields || "excluded_kinds" in discount.fields) &&
      !("max_discount_pct" in prior && "excluded_kinds" in prior)
    ) {
      return NextResponse.json(
        { error: "سقف الخصم والأنواع المستثناة غير متاحة قبل ترحيل 20261026_20 — لم يتغيّر شيء." },
        { status: 503 },
      );
    }
    Object.assign(updateData, discount.fields);

    if (body.value !== undefined) {
      updateData.discount_value = Number(body.value) || 0;
    }
    if (body.pointsGranted !== undefined) {
      updateData.points_granted = Number(body.pointsGranted) || 0;
    }
    if (body.usageLimit !== undefined) {
      const n = Number(body.usageLimit);
      updateData.max_uses = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    }
    if (body.startsAt !== undefined) {
      const startsAt = couponDateIso(body.startsAt, "start");
      if (!startsAt.ok) return NextResponse.json({ error: startsAt.error }, { status: 400 });
      updateData.valid_from = startsAt.value;
    }
    if (body.expiresAt !== undefined) {
      const expiresAt = couponDateIso(body.expiresAt, "end");
      if (!expiresAt.ok) return NextResponse.json({ error: expiresAt.error }, { status: 400 });
      updateData.valid_until = expiresAt.value;
    }
    if (body.eligibleRoles !== undefined) {
      const audience = couponAudience(body.eligibleRoles);
      if (!audience.ok) {
        return NextResponse.json({ error: audience.error }, { status: 400 });
      }
      updateData.eligible_user_types = audience.userTypes;
    }

    // One metadata build: the stored keys, the rule flags, then the status.
    const prevMeta = (prior.metadata as Record<string, unknown> | null) ?? {};
    const flags = adminCouponMetadataPatch(prevMeta, body);
    if (!flags.ok) {
      return NextResponse.json({ error: flags.error }, { status: 400 });
    }
    const nextStatus =
      typeof body.status === "string" ? body.status : nextActive === undefined ? null : nextActive ? "active" : "disabled";
    const metadata = buildCouponPatchMetadata(prevMeta, flags.metadata, nextStatus);
    if (metadata) {
      updateData.metadata = metadata;
    }

    const changed = Object.keys(updateData);
    if (changed.length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث" }, { status: 400 });
    }

    // updated_at is NOT NULL; a row read without it would lose the race check.
    if (typeof prior.updated_at !== "string" || prior.updated_at === "") {
      console.error("[admin/coupons PATCH] row has no updated_at; refusing an unconditional write:", id);
      return NextResponse.json({ error: "تعذّر حفظ الكوبون — لم يتغيّر شيء." }, { status: 500 });
    }

    const { data: updated, error } = await adminClient
      .from("coupons")
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("updated_at", expected.value ?? prior.updated_at)
      .select("*");

    if (error) {
      console.error("[admin/coupons PATCH] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: "تعذّر حفظ الكوبون — لم يتغيّر شيء." }, { status: 500 });
    }
    if (!Array.isArray(updated) || updated.length === 0) {
      return NextResponse.json(
        { error: "تغيّر هذا الكوبون منذ فتح الصفحة (تعديل آخر أو استخدام جديد) — أعد التحميل ثم عدّل." },
        { status: 409 },
      );
    }

    const current = updated[0] as Record<string, unknown>;
    await logAdminAction({
      actorId: gate.userId,
      action: "coupon_updated",
      targetType: "coupon",
      targetId: id,
      before: Object.fromEntries(changed.map((k) => [k, prior[k] ?? null])),
      after: Object.fromEntries(changed.map((k) => [k, current[k] ?? null])),
      metadata: { code: prior.code ?? null },
    });

    return NextResponse.json({ success: true, data: current });
  } catch (err) {
    console.error("[admin/coupons PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء تحديث الكوبون" }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/admin/coupons/[id] — Permanently delete a coupon.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const gate = await requireStaff("coupons.delete");
    if (!gate.ok) return gate.response;

    const adminClient = await createServiceClient();
    // What is being deleted, for the audit row (afterwards it is gone).
    const { data: target } = await adminClient
      .from("coupons")
      .select("code, discount_type, discount_value, points_granted, plan_granted, used_count, active")
      .eq("id", id)
      .maybeSingle();

    const { data: deleted, error } = await adminClient.from("coupons").delete().eq("id", id).select("id");

    if (error) {
      console.error("[admin/coupons DELETE] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // A delete that matched nothing is not an error to PostgREST; it is a 404,
    // and there is nothing to audit.
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "coupon_deleted",
      targetType: "coupon",
      targetId: id,
      before: target ?? null,
      after: null,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/coupons DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء حذف الكوبون" }, { status: 500 });
  }
}
