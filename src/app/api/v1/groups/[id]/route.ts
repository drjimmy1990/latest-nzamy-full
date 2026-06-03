import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/groups/[id] — Get group detail with member count
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

  const { id } = await context.params;

  const { data, error } = await supabase
    .from("groups")
    .select("*, group_members(count)")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}

/**
 * PATCH /api/v1/groups/[id] — Update group (owner or admin only)
 * Allowlist: name, description, max_members
 */
export async function PATCH(
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

  const { id } = await context.params;

  // Check user is owner or admin
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const allowedFields = ["name", "description", "max_members"];
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
    .from("groups")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * DELETE /api/v1/groups/[id] — Soft-delete group (owner only)
 */
export async function DELETE(
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

  const { id } = await context.params;

  // Only the owner can delete
  const { data: group } = await supabase
    .from("groups")
    .select("owner_id")
    .eq("id", id)
    .single();

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  if (group.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("groups")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
