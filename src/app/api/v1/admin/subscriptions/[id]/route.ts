import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { pickPlanRow } from "@/lib/payments/pickPlanRow";

/**
 * PATCH /api/v1/admin/subscriptions/[id] — Update a subscription
 *
 * Body: {
 *   tier?: string,
 *   plan_id?: string,
 *   status?: string,
 *   period_months?: number,   // extends current_period_end by N months from now
 *   auto_renew?: boolean
 * }
 *
 * - If tier changes, also updates auth metadata tier
 * - If status changes to 'cancelled', sets cancelled_at = now()
 *
 * Requires: a staff role with subscriptions.write (owner ٢١٠)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subscriptionId } = await params;

  // ── Staff gate (owner ٢١٠) ─────────────────────────────────────────────────
  const gate = await requireStaff("subscriptions.write");
  if (!gate.ok) return gate.response;

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: {
    tier?: string;
    plan_id?: string;
    status?: string;
    period_months?: number;
    auto_renew?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "بيانات غير صالحة" },
      { status: 400 },
    );
  }

  const adminClient = await createServiceClient();

  try {
    // ── Fetch existing subscription ──────────────────────────────────────────
    const { data: existing, error: fetchError } = await adminClient
      .from("subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "الاشتراك غير موجود" },
        { status: 404 },
      );
    }

    // ── Build update payload ───────────────────────────────────────────────
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.tier) {
      updateData.tier = body.tier;
      if (!body.plan_id) {
        // Resolve plan_id if not provided
        const { data: profile } = await adminClient
          .from("profiles")
          .select("user_type")
          .eq("id", existing.user_id)
          .single();
        
        if (profile) {
          const audience = profile.user_type === "individual" ? "individual" : profile.user_type === "firm" ? "firm" : "lawyer";
          const { data: plans } = await adminClient
            .from("subscription_plans")
            .select("id")
            .eq("tier", body.tier)
            .eq("audience", audience);
          const planId = pickPlanRow(plans);
          if (planId) {
            updateData.plan_id = planId;
          } else {
            updateData.plan_id = `${audience}-${body.tier}`;
          }
        }
      }
    }

    if (body.plan_id) {
      updateData.plan_id = body.plan_id;
    }



    if (body.auto_renew !== undefined) {
      updateData.auto_renew = body.auto_renew;
    }

    if (body.status) {
      updateData.status = body.status;
      if (body.status === "cancelled") {
        updateData.cancelled_at = new Date().toISOString();
      }
    }

    if (body.period_months) {
      const newEnd = new Date();
      newEnd.setMonth(newEnd.getMonth() + body.period_months);
      updateData.current_period_end = newEnd.toISOString();
    }

    // ── Update subscription ──────────────────────────────────────────────────
    const { data: updated, error: updateError } = await adminClient
      .from("subscriptions")
      .update(updateData)
      .eq("id", subscriptionId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    // ── Sync auth metadata if tier changed ─────────────────────────────────
    if (body.tier && body.tier !== existing.tier) {
      const { error: metaError } = await adminClient.auth.admin.updateUserById(
        existing.user_id as string,
        { user_metadata: { tier: body.tier } },
      );

      if (metaError) {
        console.error(
          "[admin/subscriptions/[id]] Failed to update auth metadata:",
          metaError,
        );
      }
    }

    const changed = Object.keys(updateData).filter((k) => k !== "updated_at");
    const prior = existing as Record<string, unknown>;
    const current = (updated ?? {}) as Record<string, unknown>;
    await logAdminAction({
      actorId: gate.userId,
      action: body.status === "cancelled" ? "subscription_cancelled" : "subscription_updated",
      targetType: "subscription",
      targetId: subscriptionId,
      before: Object.fromEntries(changed.map((k) => [k, prior[k] ?? null])),
      after: Object.fromEntries(changed.map((k) => [k, current[k] ?? null])),
      metadata: { user_id: prior.user_id ?? null },
    });

    return NextResponse.json({
      success: true,
      message: "تم تحديث الاشتراك بنجاح",
      data: updated,
    });
  } catch (err) {
    console.error("[admin/subscriptions/[id]] PATCH error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث الاشتراك" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/v1/admin/subscriptions/[id] — Revoke a subscription
 *
 * Sets status = 'cancelled', cancelled_at = now(),
 * and downgrades auth metadata tier back to 'free'.
 *
 * Requires: a staff role with subscriptions.write (owner ٢١٠)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subscriptionId } = await params;

  // ── Staff gate (owner ٢١٠) ─────────────────────────────────────────────────
  const gate = await requireStaff("subscriptions.write");
  if (!gate.ok) return gate.response;

  const adminClient = await createServiceClient();

  try {
    // ── Fetch subscription to get user_id ────────────────────────────────────
    const { data: existing, error: fetchError } = await adminClient
      .from("subscriptions")
      .select("id, user_id, status")
      .eq("id", subscriptionId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "الاشتراك غير موجود" },
        { status: 404 },
      );
    }

    // ── Cancel the subscription ──────────────────────────────────────────────
    const { error: updateError } = await adminClient
      .from("subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    // ── Downgrade auth metadata tier to free ─────────────────────────────────
    const { error: metaError } = await adminClient.auth.admin.updateUserById(
      existing.user_id as string,
      { user_metadata: { tier: "free" } },
    );

    if (metaError) {
      console.error(
        "[admin/subscriptions/[id]] Failed to downgrade auth metadata:",
        metaError,
      );
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "subscription_revoked",
      targetType: "subscription",
      targetId: subscriptionId,
      before: { status: existing.status ?? null },
      after: { status: "cancelled" },
      metadata: { user_id: existing.user_id ?? null },
    });

    return NextResponse.json({
      success: true,
      message: "تم إلغاء الاشتراك بنجاح",
    });
  } catch (err) {
    console.error("[admin/subscriptions/[id]] DELETE error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء إلغاء الاشتراك" },
      { status: 500 },
    );
  }
}
