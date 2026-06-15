import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/chat/rooms/[id]/messages — Get messages in a room
 * Updates last_read_at for current user.
 * Query params: limit (default: 50), offset (default: 0)
 */
export async function GET(
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

  const { id: roomId } = await context.params;

  // Verify user is a participant
  const { data: participation } = await supabase
    .from("chat_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .single();

  if (!participation) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const { data, count, error } = await supabase
    .from("chat_messages")
    .select("*", { count: "exact" })
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update last_read_at for current user
  await supabase
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", user.id);

  return NextResponse.json({ data, total: count });
}

/**
 * POST /api/v1/chat/rooms/[id]/messages — Send a message
 * Body: { body: string, metadata?: object }
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

  const { id: roomId } = await context.params;

  // Verify user is a participant
  const { data: participation } = await supabase
    .from("chat_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .single();

  if (!participation) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  if (!body.body) {
    return NextResponse.json(
      { error: "body is required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      room_id: roomId,
      sender_id: user.id,
      body: body.body,
      metadata: body.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update sender's last_read_at
  await supabase
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", user.id);

  return NextResponse.json({ data }, { status: 201 });
}
