import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/research/desktop — List desktop items
 * Items where space='desktop' and user_id=current user, newest first.
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

  const { data, count, error } = await supabase
    .from("research_items")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .eq("space", "desktop")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, total: count });
}

/**
 * POST /api/v1/research/desktop — Add item to desktop
 * Body: { source, item_type, title, content }
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

  if (!body.source || !body.item_type || !body.title || !body.content) {
    return NextResponse.json(
      { error: "source, item_type, title, and content are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("research_items")
    .insert({
      session_id: null,
      user_id: user.id,
      space: "desktop",
      source: body.source,
      item_type: body.item_type,
      title: body.title,
      content: body.content,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
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

  const { error } = await supabase
    .from("research_items")
    .delete()
    .eq("user_id", user.id)
    .eq("space", "desktop");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
