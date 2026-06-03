import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/groups/[id]/members — List group members
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: groupId } = await context.params;

  const { data, error } = await supabase
    .from("group_members")
    .select("*")
    .eq("group_id", groupId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * DELETE /api/v1/groups/[id]/members — Remove a member
 * Body: { user_id } — Only owner/admin can remove members.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: groupId } = await context.params;

  // Check caller is owner or admin
  const { data: callerMembership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (
    !callerMembership ||
    !["owner", "admin"].includes(callerMembership.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  if (!body.user_id) {
    return NextResponse.json(
      { error: "user_id is required" },
      { status: 400 },
    );
  }

  // Cannot remove yourself (owner) — use DELETE group instead
  if (body.user_id === user.id) {
    return NextResponse.json(
      { error: "Cannot remove yourself" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("group_members")
    .update({ status: "removed" })
    .eq("group_id", groupId)
    .eq("user_id", body.user_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
