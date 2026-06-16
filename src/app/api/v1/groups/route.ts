import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/groups — List groups where the current user is a member
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    // Get group IDs where user is an active member
    const { data: memberships, error: memError } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (memError) {
      console.error("[groups] group_members query failed:", memError.message);
      return NextResponse.json({ data: [], total: 0 });
    }

    const groupIds = (memberships ?? []).map((m) => m.group_id);

    if (groupIds.length === 0) {
      return NextResponse.json({ data: [], total: 0 });
    }

    const { data, count, error } = await supabase
      .from("groups")
      .select("*, group_members(count)", { count: "exact" })
      .in("id", groupIds)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[groups] groups query failed:", error.message);
      return NextResponse.json({ data: [], total: 0 });
    }

    return NextResponse.json({ data, total: count });
  } catch (err) {
    console.error("[groups] Unexpected error:", err);
    return NextResponse.json({ data: [], total: 0 });
  }
}

/**
 * POST /api/v1/groups — Create a new group
 * Body: { name, description?, max_members?, plan_id? }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (!body.name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  // Create the group
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .insert({
      owner_id: user.id,
      name: body.name,
      description: body.description ?? null,
      max_members: body.max_members ?? 10,
      plan_id: body.plan_id ?? null,
    })
    .select()
    .single();

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  // Add creator as owner member
  await supabase.from("group_members").insert({
    group_id: group.id,
    user_id: user.id,
    role: "owner",
    status: "active",
  });

  return NextResponse.json({ data: group }, { status: 201 });
}
