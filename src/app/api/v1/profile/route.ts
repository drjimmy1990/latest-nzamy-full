import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/profile — Get current user's profile
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

  // Fetch profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return NextResponse.json(
      { error: "Profile not found" },
      { status: 404 },
    );
  }

  // Fetch role-specific profile if applicable
  let roleProfile = null;
  if (profile.user_type === "lawyer") {
    const { data } = await supabase
      .from("lawyer_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    roleProfile = data;
  } else if (profile.user_type === "provider") {
    const { data } = await supabase
      .from("provider_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    roleProfile = data;
  } else if (profile.user_type === "micro") {
    const { data } = await supabase
      .from("micro_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    roleProfile = data;
  }

  // Fetch subscription
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*, subscription_plans(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    profile,
    roleProfile,
    subscription,
  });
}

/**
 * PATCH /api/v1/profile — Update current user's profile
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Allowlist of updatable fields
  const allowedFields = [
    "display_name",
    "display_name_en",
    "phone",
    "avatar_url",
    "language",
    "calendar_type",
    "theme",
    "country_code",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ profile: data });
}
