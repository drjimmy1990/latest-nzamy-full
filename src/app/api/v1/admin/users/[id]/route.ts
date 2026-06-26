import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/admin/users/[id] — Fetch single user with full details
 *
 * Includes: profile, all subscriptions (history), lawyer_profile,
 *           and last 20 credit_transactions.
 *
 * Requires: authenticated admin user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

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

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();

  if (!adminProfile || adminProfile.user_type !== "admin") {
    return NextResponse.json(
      { error: "غير مصرح — صلاحيات المسؤول مطلوبة" },
      { status: 403 },
    );
  }

  const adminClient = await createServiceClient();

  try {
    // ── Fetch profile ──────────────────────────────────────────────────────
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "المستخدم غير موجود" },
        { status: 404 },
      );
    }

    // ── Fetch all subscriptions (history) ──────────────────────────────────
    const { data: subscriptions } = await adminClient
      .from("subscriptions")
      .select(
        `
        *,
        subscription_plans (
          id,
          name_ar,
          name_en,
          tier,
          price_monthly,
          price_yearly
        )
      `,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // ── Fetch lawyer profile ───────────────────────────────────────────────
    const { data: lawyerProfile } = await adminClient
      .from("lawyer_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // ── Fetch recent credit transactions ───────────────────────────────────
    const { data: creditTransactions } = await adminClient
      .from("credit_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    // ── Separate active subscription from history ──────────────────────────
    const activeSubscription =
      subscriptions?.find(
        (s: Record<string, unknown>) => s.status === "active",
      ) ?? null;

    return NextResponse.json({
      data: {
        ...profile,
        subscription: activeSubscription,
        subscription_history: subscriptions ?? [],
        lawyer_profile: lawyerProfile ?? null,
        credit_transactions: creditTransactions ?? [],
        credit_balance: (lawyerProfile?.credit_balance as number) ?? 0,
      },
    });
  } catch (err) {
    console.error("[admin/users/[id]] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب بيانات المستخدم" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/v1/admin/users/[id] — Update user profile
 *
 * Body: { status?: string, user_type?: string, metadata?: object }
 *
 * If status is 'suspended', also cancels any active subscription.
 *
 * Requires: authenticated admin user
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

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

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .single();

  if (!adminProfile || adminProfile.user_type !== "admin") {
    return NextResponse.json(
      { error: "غير مصرح — صلاحيات المسؤول مطلوبة" },
      { status: 403 },
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { status?: string; user_type?: string; metadata?: object };
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
    // ── Build update payload ───────────────────────────────────────────────
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.user_type) {
      updateData.user_type = body.user_type;
    }

    if (body.metadata) {
      updateData.metadata = body.metadata;
    }

    // ── Update profile ─────────────────────────────────────────────────────
    const { data: updatedProfile, error: updateError } = await adminClient
      .from("profiles")
      .update(updateData)
      .eq("id", userId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    // ── Handle suspension ──────────────────────────────────────────────────
    if (body.status === "suspended") {
      // Cancel any active subscriptions
      await adminClient
        .from("subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("status", "active");

      // Downgrade auth metadata tier to free
      await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { tier: "free" },
      });
    }

    return NextResponse.json({
      success: true,
      message: "تم تحديث بيانات المستخدم بنجاح",
      data: updatedProfile,
    });
  } catch (err) {
    console.error("[admin/users/[id]] PATCH error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث بيانات المستخدم" },
      { status: 500 },
    );
  }
}
