import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

/**
 * POST /api/v1/groups/[id]/invite — Generate (or return) the group's invite
 * code and optionally record an emailed/phoned invitation.
 * Body: { email?: string, phone?: string } — all optional. When an email or
 *       phone is supplied, a `group_invitations` row is created (expires 7 days).
 * Returns: { data: { invite_code: string, invitation?: { id } } }
 *
 * The shareable code is stored on the `groups.join_code` column. If the group
 * has no join_code yet, one is generated and persisted.
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

  // Verify caller is an active member of the group.
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

  // Load the group's current join_code + cap.
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, join_code, max_members, status")
    .eq("id", groupId)
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  let inviteCode = group.join_code;

  // Generate a join_code if one doesn't exist yet.
  if (!inviteCode) {
    inviteCode = randomUUID().slice(0, 8).toUpperCase();
    const { error: updateError } = await supabase
      .from("groups")
      .update({ join_code: inviteCode })
      .eq("id", groupId);

    if (updateError) {
      console.error("[groups/invite] failed to set join_code:", updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  // Optionally record an invitation row when contact info is supplied.
  const body = await request.json().catch(() => ({} as { email?: string; phone?: string }));
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

  let invitation: { id: string } | undefined;
  if (email || phone) {
    // Respect the member cap when issuing a new invitation.
    const { count: memberCount } = await supabase
      .from("group_members")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("status", "active");

    if (typeof memberCount === "number" && memberCount >= group.max_members) {
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
        invitee_email: email || null,
        invitee_phone: phone || null,
        status: "pending",
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[groups/invite] invitation insert failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (data) invitation = { id: data.id };
  }

  return NextResponse.json(
    { data: { invite_code: inviteCode, invitation } },
    { status: 200 },
  );
}