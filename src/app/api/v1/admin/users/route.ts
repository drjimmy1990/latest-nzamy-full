import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/admin/users — List all users with subscription info
 *
 * Query params:
 *   - search  (filter on display_name / email)
 *   - role    (user_type filter)
 *   - tier    (subscription tier filter)
 *   - status  (subscription status filter)
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
  const search = searchParams.get("search");
  const role = searchParams.get("role");
  const tier = searchParams.get("tier");
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;

  const adminClient = await createServiceClient();

  try {
    // ── Build the query ────────────────────────────────────────────────────
    let query = adminClient
      .from("profiles")
      .select(
        `
        id,
        display_name,
        display_name_en,
        email,
        phone,
        user_type,
        avatar_url,
        verified_at,
        created_at,
        subscriptions!left(
          id,
          tier,
          plan_id,
          status,
          billing_cycle,
          current_period_end
        ),
        lawyer_profiles!left(
          credit_balance
        )
      `,
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    // ── Filters ──────────────────────────────────────────────────────────────
    if (search) {
      query = query.or(
        `display_name.ilike.%${search}%,display_name_en.ilike.%${search}%,email.ilike.%${search}%`,
      );
    }

    if (role) {
      query = query.eq("user_type", role);
    }

    // Tier and status filters are applied on the subscriptions relation
    if (tier) {
      query = query.eq("subscriptions.tier", tier);
    }

    if (status) {
      query = query.eq("subscriptions.status", status);
    }

    // ── Paginate ─────────────────────────────────────────────────────────────
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Transform results ────────────────────────────────────────────────────
    const users = (data ?? []).map((row: Record<string, unknown>) => {
      // Pick the active subscription (first match) or null
      const subs = row.subscriptions as Record<string, unknown>[] | null;
      const activeSub =
        subs?.find((s) => s.status === "active") ?? subs?.[0] ?? null;

      const lawyerProfiles = row.lawyer_profiles as
        | Record<string, unknown>[]
        | Record<string, unknown>
        | null;
      const lp = Array.isArray(lawyerProfiles)
        ? lawyerProfiles[0]
        : lawyerProfiles;

      return {
        id: row.id,
        display_name: row.display_name,
        display_name_en: row.display_name_en,
        email: row.email,
        phone: row.phone,
        user_type: row.user_type,
        avatar_url: row.avatar_url,
        verified_at: row.verified_at,
        created_at: row.created_at,
        subscription: activeSub
          ? {
              id: activeSub.id,
              tier: activeSub.tier,
              plan_id: activeSub.plan_id,
              status: activeSub.status,
              billing_cycle: activeSub.billing_cycle,
              current_period_end: activeSub.current_period_end,
            }
          : null,
        credit_balance: (lp?.credit_balance as number) ?? 0,
      };
    });

    return NextResponse.json({
      data: users,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[admin/users] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب المستخدمين" },
      { status: 500 },
    );
  }
}
