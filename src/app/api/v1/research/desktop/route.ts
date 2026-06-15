import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Helper: get or create the user's "desktop" research session.
 * Desktop items are stored as research_items in a special session titled "__desktop__".
 */
async function getOrCreateDesktopSession(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never, userId: string) {
  // Try to find existing desktop session
  const { data: existing } = await supabase
    .from("research_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("title", "__desktop__")
    .maybeSingle();

  if (existing) return existing.id;

  // Create one
  const { data: created, error } = await supabase
    .from("research_sessions")
    .insert({ user_id: userId, title: "__desktop__", status: "active" })
    .select("id")
    .single();

  if (error) throw error;
  return created.id;
}

/**
 * GET /api/v1/research/desktop — List desktop items
 * Items stored in the user's "__desktop__" session, newest first.
 * Query params: limit (default: 50), offset (default: 0)
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
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  try {
    const sessionId = await getOrCreateDesktopSession(supabase, user.id);

    const { data, count, error } = await supabase
      .from("research_items")
      .select("*", { count: "exact" })
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, total: count });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to get desktop session";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/v1/research/desktop — Add item to desktop
 * Body: { source?, item_type?, content }
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

  if (!body.content) {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 },
    );
  }

  try {
    const sessionId = await getOrCreateDesktopSession(supabase, user.id);

    const { data, error } = await supabase
      .from("research_items")
      .insert({
        session_id: sessionId,
        source: body.source ?? "",
        item_type: body.item_type ?? "note",
        content: body.content,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create desktop item";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/research/desktop — Clear all desktop items for current user
 */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sessionId = await getOrCreateDesktopSession(supabase, user.id);

    const { error } = await supabase
      .from("research_items")
      .delete()
      .eq("session_id", sessionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to clear desktop";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
