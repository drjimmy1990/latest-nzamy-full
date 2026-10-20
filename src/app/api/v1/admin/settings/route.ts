import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { founderCampaignSettingIssue } from "@/lib/pricing/campaigns";

/** Allowlisted setting keys that admins can modify */
const ALLOWED_SETTINGS_KEYS = [
  "library_free_article_limit",
  "library_whitelisted_laws",
  "library_free_law_overrides",
  "library_free_items",
  "tier_limits",
  "payments_gateway",
  "library_status",
  // Owner ٢١٨ / ٢٢٥ (20261021_50): {"starts_on","ends_on": "YYYY-MM-DD" | null,
  // "library_days": number}. Read by founder_campaign_active() and the
  // BEFORE INSERT trigger on lawyer_profiles; malformed dates read as "off" —
  // so the write is validated below.
  "founder_campaign",
] as const;

/**
 * Per-key value validators for settings whose value is safety-critical.
 *
 * library_status is read as "closed only when it is exactly 'closed'", so an
 * unvalidated typo (e.g. "closd") would read back as OPEN — a failed closure
 * that looks like a success. Rejecting the write is the only place this can be
 * caught, so it is enforced here rather than trusted to the caller.
 *
 * Returns an error string when invalid, or null when the value is acceptable.
 */
const SETTINGS_VALUE_VALIDATORS: Record<string, (value: unknown) => string | null> = {
  library_status: (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return 'قيمة library_status يجب أن تكون كائناً بالشكل: {"status":"open"|"closed","message":string|null}';
    }
    const { status, message } = value as { status?: unknown; message?: unknown };
    if (status !== "open" && status !== "closed") {
      return `قيمة status غير صالحة${typeof status === "string" ? ` ("${status}")` : ""} — المسموح: "open" أو "closed" فقط`;
    }
    if (message !== undefined && message !== null && typeof message !== "string") {
      return "قيمة message يجب أن تكون نصاً أو null";
    }
    return null;
  },
  payments_gateway: (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return 'قيمة payments_gateway يجب أن تكون كائناً بالشكل: {"status":"disabled","provider":null}';
    }

    const { status, provider } = value as { status?: unknown; provider?: unknown };
    if (status === "disabled" && (provider === null || provider === undefined)) {
      return null;
    }

    const deploymentEnvironment = process.env.NZAMY_DEPLOYMENT_ENV?.toLowerCase();
    const stubAllowed =
      process.env.NZAMY_ALLOW_STUB_PAYMENTS === "true" &&
      (deploymentEnvironment === "local" || deploymentEnvironment === "staging");
    if (status === "test" && provider === "stub" && stubAllowed) {
      return null;
    }

    return "بوابة الدفع مغلقة افتراضياً؛ test/stub يتطلب بيئة local أو staging وإذن خادمي صريح، وlive غير مدعوم بعد";
  },
  // A malformed date reads as "campaign off" in founder_campaign_active(), so a
  // typo would silently stop the founder grants — refuse it here instead.
  // Pure, so src/lib/pricing/campaigns.test.ts covers it.
  founder_campaign: founderCampaignSettingIssue,
};

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

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
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
 * Requires: a staff role with settings.write (owner ٢١٠); each change is
 * audited with the value before and after.
 */
export async function PATCH(request: NextRequest) {
  // ── Staff gate (owner ٢١٠) ─────────────────────────────────────────────────
  const gate = await requireStaff("settings.write");
  if (!gate.ok) return gate.response;

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

  // ── Validate the value shape for safety-critical keys ──────────────────────
  const validate = SETTINGS_VALUE_VALIDATORS[key];
  if (validate) {
    const invalid = validate(value);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }
  }

  const adminClient = await createServiceClient();

  try {
    // ── The value before, for the audit row (a failed read only loses that) ──
    const { data: previous } = await adminClient
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

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

    await logAdminAction({
      actorId: gate.userId,
      action: "platform_setting_updated",
      targetType: "platform_setting",
      targetId: key,
      before: { value: previous?.value ?? null },
      after: { value },
    });

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
