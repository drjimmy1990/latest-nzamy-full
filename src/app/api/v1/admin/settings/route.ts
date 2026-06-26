import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/** Allowlisted setting keys that admins can modify */
const ALLOWED_SETTINGS_KEYS = [
  "library_free_article_limit",
  "library_whitelisted_laws",
  "library_free_law_overrides",
] as const;

/**
 * GET /api/v1/admin/settings — Fetch all platform settings
 *
 * Returns: { data: { [key]: value } } as a flat object
 *
 * Requires: authenticated admin user
 */
export async function GET() {
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

  const adminClient = await createServiceClient();

  try {
    const { data, error } = await adminClient
      .from("platform_settings")
      .select("key, value");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform array of { key, value } into flat object
    const settings: Record<string, unknown> = {};
    for (const row of data ?? []) {
      settings[row.key as string] = row.value;
    }

    return NextResponse.json({ data: settings });
  } catch (err) {
    console.error("[admin/settings] GET error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء جلب الإعدادات" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/v1/admin/settings — Update a platform setting
 *
 * Body: { key: string, value: unknown }
 *
 * Allowed keys: 'library_free_article_limit', 'library_whitelisted_laws',
 *               'library_free_law_overrides'
 *
 * Upserts into platform_settings table.
 *
 * Requires: authenticated admin user
 */
export async function PATCH(request: NextRequest) {
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
  let body: { key: string; value: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "بيانات غير صالحة" },
      { status: 400 },
    );
  }

  const { key, value } = body;

  if (!key || value === undefined) {
    return NextResponse.json(
      { error: "الحقول مطلوبة: key, value" },
      { status: 400 },
    );
  }

  // ── Validate key is allowed ────────────────────────────────────────────────
  if (!ALLOWED_SETTINGS_KEYS.includes(key as (typeof ALLOWED_SETTINGS_KEYS)[number])) {
    return NextResponse.json(
      {
        error: `مفتاح الإعداد غير مسموح. المفاتيح المسموحة: ${ALLOWED_SETTINGS_KEYS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const adminClient = await createServiceClient();

  try {
    // ── Upsert setting ─────────────────────────────────────────────────────
    const { data, error } = await adminClient
      .from("platform_settings")
      .upsert(
        {
          key,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      )
      .select("key, value")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "تم تحديث الإعداد بنجاح",
      data,
    });
  } catch (err) {
    console.error("[admin/settings] PATCH error:", err);
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث الإعداد" },
      { status: 500 },
    );
  }
}
