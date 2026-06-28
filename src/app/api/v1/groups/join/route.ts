import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/groups/join — Join a group using a join code
 * Body: { code: string }
 * Returns: { data: { groupId } }
 *
 * Looks up the active group whose `join_code` matches `code`, then inserts the
 * authenticated user into `group_members` as an active member.
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

  const body = await request.json().catch(() => ({} as { code?: string }));
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  // Find the active group with this join_code.
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, status, max_members")
    .eq("join_code", code)
    .single();

  if (groupError || !group) {
    return NextResponse.json(
      { error: "كود الدعوة غير صالح" },
      { status: 404 },
    );
  }

  if (group.status !== "active") {
    return NextResponse.json(
      { error: "هذه المجموعة غير نشطة" },
      { status: 400 },
    );
  }

  // Check the member cap (count active members).
  const { count } = await supabase
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("group_id", group.id)
    .eq("status", "active");

  if (typeof count === "number" && count >= group.max_members) {
    return NextResponse.json(
      { error: "المجموعة ممتلئة" },
      { status: 400 },
    );
  }

  // Insert (or re-activate) membership. The (group_id, user_id) pair is unique.
  const { error: memberError } = await supabase
    .from("group_members")
    .upsert(
      {
        group_id: group.id,
        user_id: user.id,
        role: "member",
        status: "active",
      },
      { onConflict: "group_id,user_id" },
    );

  if (memberError) {
    console.error("[groups/join] insert failed:", memberError.message);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json(
    { data: { groupId: group.id } },
    { status: 201 },
  );
}