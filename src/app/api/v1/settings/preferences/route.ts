import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { validatePreferencesPatch, mergePreferences } from "@/lib/services/preferencesMerge.ts";
import { preferencesDbErrorResponse } from "./_shared";

/**
 * PATCH /api/v1/settings/preferences — Phase 6 (preferencesService.ts).
 * ─────────────────────────────────────────────────────────
 * Body: a partial object whose keys are a subset of PREFERENCE_KEYS
 * (readingActivity, recentSessions, dashboardMode) — any other key is a 400.
 * Every key present is validated (src/lib/services/preferencesMerge.ts),
 * then shallow-merged over the caller's existing `user_settings.preferences`
 * WITHOUT touching sibling keys the merge module does not model — most
 * notably `notifications`, which NotificationsTab already stores there.
 *
 * The upsert only ever names `user_id` and `preferences` (never the eight
 * notification/security columns GET /api/v1/settings also serves), mirroring
 * the PUT handler in the parent route: on INSERT the untouched columns take
 * their table defaults, on UPDATE they are left exactly as they were.
 *
 * Write-through: when the body includes `dashboardMode`, the caller's own
 * `lawyer_profiles.display_mode` (user_type lawyer) or `firm_profiles.
 * display_mode` (user_type firm) is updated to match — best-effort, logged
 * on failure but never failing the response, since `preferences.
 * dashboardMode` (already saved above) is the value every role can read,
 * and the profile column is only a mirror for the two roles that have one.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, userType, supabase } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات الطلب غير صالحة (JSON غير سليم)." }, { status: 400 });
    }

    const validation = validatePreferencesPatch(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { patch } = validation;

    const { data: existingRow, error: readError } = await supabase
      .from("user_settings")
      .select("preferences")
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) {
      console.error("[settings/preferences PATCH] read failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر تحميل الإعدادات الحالية." }, { status: 500 });
    }

    const existingPreferences = (existingRow?.preferences ?? null) as Record<string, unknown> | null;
    const merged = mergePreferences(existingPreferences, patch);

    const { data: savedRow, error: writeError } = await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, preferences: merged }, { onConflict: "user_id" })
      .select("preferences")
      .single();

    if (writeError) {
      console.error("[settings/preferences PATCH] upsert failed:", writeError.message, writeError.code);
      const { status, message } = preferencesDbErrorResponse(writeError);
      return NextResponse.json({ error: message }, { status });
    }

    // Write-through: keep the role-specific display_mode column in step.
    // Best-effort — the preferences write above already succeeded and is
    // the value every role (including ones with no such column) can read.
    if (patch.dashboardMode) {
      if (userType === "lawyer") {
        const { error: mirrorError, count } = await supabase
          .from("lawyer_profiles")
          .update({ display_mode: patch.dashboardMode }, { count: "exact" })
          .eq("user_id", user.id);
        if (mirrorError) {
          console.error("[settings/preferences PATCH] lawyer_profiles display_mode mirror failed:", mirrorError.message, mirrorError.code);
        } else if (!count) {
          console.error("[settings/preferences PATCH] lawyer_profiles display_mode mirror matched 0 rows for user", user.id);
        }
      } else if (userType === "firm") {
        const { error: mirrorError, count } = await supabase
          .from("firm_profiles")
          .update({ display_mode: patch.dashboardMode }, { count: "exact" })
          .eq("owner_user_id", user.id);
        if (mirrorError) {
          console.error("[settings/preferences PATCH] firm_profiles display_mode mirror failed:", mirrorError.message, mirrorError.code);
        } else if (!count) {
          console.error("[settings/preferences PATCH] firm_profiles display_mode mirror matched 0 rows for user", user.id);
        }
      }
      // Other roles: preferences.dashboardMode only — no mirror column exists.
    }

    return NextResponse.json({ preferences: savedRow?.preferences ?? merged });
  } catch (err) {
    console.error("[settings/preferences PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
