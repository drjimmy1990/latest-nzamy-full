import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/settings — Get user's settings/preferences
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
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
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
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
