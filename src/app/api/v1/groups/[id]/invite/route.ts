import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/groups/[id]/invite — Send group invitation
 * Body: { email } or { user_id }
 * Invitation expires in 7 days.
 */
export async function POST(
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

  // Verify caller is a member of the group
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  if (!body.email && !body.user_id) {
    return NextResponse.json(
      { error: "email or user_id is required" },
      { status: 400 },
    );
  }

  // Check group member limit
  const { count: memberCount } = await supabase
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("status", "active");

  const { data: group } = await supabase
    .from("groups")
    .select("max_members")
    .eq("id", groupId)
    .single();

  if (group && memberCount !== null && memberCount >= group.max_members) {
    return NextResponse.json(
      { error: "Group has reached maximum members" },
      { status: 400 },
    );
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data, error } = await supabase
    .from("group_invitations")
    .insert({
      group_id: groupId,
      inviter_id: user.id,
      invitee_email: body.email ?? null,
      invitee_user_id: body.user_id ?? null,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
