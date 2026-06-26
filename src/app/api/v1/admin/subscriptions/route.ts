import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/admin/subscriptions — List all subscriptions with user info
 *
 * Query params:
 *   - tier    (filter by subscription tier)
 *   - status  (filter by subscription status)
 *   - page    (default 1)
 *   - limit   (default 20)
 *
 * Requires: authenticated admin user
 */
export async function GET(request: NextRequest) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "غير مصرح — يرجى تسجيل الدخول" },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.user_type !== "admin") {
    return NextResponse.json(
      { error: "غير مصرح — صلاحيات المسؤول مطلوبة" },
      { status: 403 },
    );
  }

  // ── Parse query params ─────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const tier = searchParams.get("tier");
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  const adminClient = await createServiceClient();

  try {
    let query = adminClient
      .from("subscriptions")
      .select(
        `
        *,
        profiles!inner (
          id,
          display_name,
          display_name_en,
          email,
          avatar_url,
          user_type
        ),
        subscription_plans (
          id,
          name_ar,
          name_en,
          tier,
          price_monthly,
          price_yearly
        )
      `,
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (tier) {
      query = query.eq("tier", tier);
    }

    if (status) {
      query = query.eq("status", status);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[admin/subscriptions] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب الاشتراكات" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/admin/subscriptions — Admin assigns a subscription to a user
 *
 * Body: {
 *   user_id: string,
 *   plan_id: string,
 *   tier: 'free' | 'ai' | 'pro' | 'corp' | 'max',
 *   billing_cycle: 'monthly' | 'yearly' | 'custom',
 *   period_months: number
 * }
 *
 * - Cancels any existing active subscription for the user
 * - Creates a new subscription record
 * - CRITICAL: Updates user auth metadata tier
 *
 * Requires: authenticated admin user
 */
export async function POST(request: NextRequest) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "غير مصرح — يرجى تسجيل الدخول" },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.user_type !== "admin") {
    return NextResponse.json(
      { error: "غير مصرح — صلاحيات المسؤول مطلوبة" },
      { status: 403 },
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: {
    user_id: string;
    plan_id: string;
    tier: string;
    billing_cycle: string;
    period_months: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "بيانات غير صالحة" },
      { status: 400 },
    );
  }

  const { user_id, plan_id, tier, billing_cycle, period_months } = body;

  // ── Validate required fields ───────────────────────────────────────────────
  if (!user_id || !plan_id || !tier || !billing_cycle || !period_months) {
    return NextResponse.json(
      { error: "جميع الحقول مطلوبة: user_id, plan_id, tier, billing_cycle, period_months" },
      { status: 400 },
    );
  }

  const validTiers = ["free", "ai", "pro", "corp", "max"];
  if (!validTiers.includes(tier)) {
    return NextResponse.json(
      { error: `الباقة غير صالحة. القيم المسموحة: ${validTiers.join(", ")}` },
      { status: 400 },
    );
  }

  const adminClient = await createServiceClient();

  try {
    // ── Verify user exists ─────────────────────────────────────────────────
    const { data: targetUser, error: userError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", user_id)
      .single();

    if (userError || !targetUser) {
      return NextResponse.json(
        { error: "المستخدم غير موجود" },
        { status: 404 },
      );
    }

    // ── Cancel existing active subscriptions ───────────────────────────────
    await adminClient
      .from("subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id)
      .eq("status", "active");

    // ── Calculate period dates ─────────────────────────────────────────────
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + period_months);

    // ── Create new subscription ────────────────────────────────────────────
    const { data: subscription, error: subError } = await adminClient
      .from("subscriptions")
      .insert({
        user_id,
        plan_id,
        tier,
        billing_cycle,
        status: "active",
        started_at: now.toISOString(),
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        auto_renew: false,
        metadata: {
          assigned_by: user.id,
          assigned_at: now.toISOString(),
          method: "admin_assignment",
        },
      })
      .select("*")
      .single();

    if (subError) {
      return NextResponse.json(
        { error: subError.message },
        { status: 500 },
      );
    }

    // ── CRITICAL: Update auth metadata tier ────────────────────────────────
    const { error: metaError } = await adminClient.auth.admin.updateUserById(
      user_id,
      { user_metadata: { tier } },
    );

    if (metaError) {
      console.error("[admin/subscriptions] Failed to update auth metadata:", metaError);
      // Subscription was created but metadata failed — log but don't rollback
    }

    return NextResponse.json({
      success: true,
      message: "تم تعيين الاشتراك بنجاح",
      data: subscription,
    });
  } catch (err) {
    console.error("[admin/subscriptions] POST error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تعيين الاشتراك" },
      { status: 500 },
    );
  }
}
