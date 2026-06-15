import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/notifications — Get user's notifications
 * Query params:
 *   - limit (default: 20)
 *   - offset (default: 0)
 *   - unread_only (default: false)
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

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const unreadOnly = searchParams.get("unread_only") === "true";

  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  // Also get unread count
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return NextResponse.json({
    notifications: data,
    total: count,
    unread_count: unreadCount,
  });
}

/**
 * PATCH /api/v1/notifications — Mark notifications as read
 * Body: { ids: string[] } or { mark_all: true }
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

  if (body.mark_all) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .in("id", body.ids);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Provide 'ids' array or 'mark_all: true'" },
    { status: 400 },
  );
}
