import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import { mergePutPreferences } from "@/lib/services/preferencesMerge.ts";

/**
 * GET /api/v1/settings — Get user's settings/preferences
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  // If no settings exist yet, return defaults
  if (!data) {
    return NextResponse.json({
      settings: {
        user_id: user.id,
        notifications_enabled: true,
        email_notifications: true,
        whatsapp_notifications: true,
        push_notifications: true,
        newsletter: false,
        marketing_emails: false,
        two_factor_enabled: false,
        session_timeout_minutes: 60,
        data_sharing_consent: false,
        analytics_consent: false,
        preferences: {},
      },
    });
  }

  return NextResponse.json({ settings: data });
}

/**
 * PUT /api/v1/settings — Update user's settings
 *
 * Callers (2026-09-28): SecurityTab (session_timeout_minutes), PrivacyTab
 * (the four consent columns), NotificationsTab and the onboarding wizard
 * (email/push/marketing columns + `preferences.notifications`). Only the last
 * two send `preferences`, and it is merged, not replaced — see below.
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Allowlisted fields
  const allowedFields = [
    "notifications_enabled",
    "email_notifications",
    "whatsapp_notifications",
    "push_notifications",
    "newsletter",
    "marketing_emails",
    "two_factor_enabled",
    "session_timeout_minutes",
    "data_sharing_consent",
    "analytics_consent",
    "preferences",
  ];

  const updates: Record<string, unknown> = { user_id: user.id };
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  // `preferences` is MERGED into the stored object, never written over it
  // (mergePutPreferences in preferencesMerge.ts has the full reasoning). This
  // column used to be replaced wholesale, so a settings tab that loaded the
  // row and saved later deleted every key written elsewhere in between — the
  // lawyer dashboard's quickTools among them. PATCH-owned keys
  // (readingActivity, recentSessions, dashboardMode, quickTools) are ignored
  // here: PATCH /api/v1/settings/preferences is their only writer.
  if ("preferences" in updates) {
    const { data: storedRow, error: readError } = await supabase
      .from("user_settings")
      .select("preferences")
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) {
      console.error("[settings PUT] preferences read failed:", readError.message, readError.code);
      return NextResponse.json({ error: "تعذّر تحميل الإعدادات الحالية." }, { status: 500 });
    }
    const merge = mergePutPreferences(
      (storedRow?.preferences ?? null) as Record<string, unknown> | null,
      updates.preferences,
    );
    if (!merge.ok) {
      return NextResponse.json({ error: merge.error }, { status: 400 });
    }
    updates.preferences = merge.merged;
  }

  // Upsert — creates if doesn't exist, updates if does
  const { data, error } = await supabase
    .from("user_settings")
    .upsert(updates, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ settings: data });
}
