import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/research/sessions/[id]/items — List items in session
 * Ordered by newest first.
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

  const { id: sessionId } = await context.params;

  // Verify session belongs to user
  const { data: session, error: sessionError } = await supabase
    .from("research_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 },
    );
  }

  const { data, error } = await supabase
    .from("research_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * POST /api/v1/research/sessions/[id]/items — Add item to session
 * Body: { source, item_type, content }
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

  const { id: sessionId } = await context.params;
  const body = await request.json();

  if (!body.content) {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 },
    );
  }

  // Verify session belongs to user
  const { data: session, error: sessionError } = await supabase
    .from("research_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 },
    );
  }

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
}
