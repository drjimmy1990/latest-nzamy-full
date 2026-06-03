import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/chat/rooms — List user's chat rooms with last message preview
 * Query params: limit (default: 20), offset (default: 0)
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

  // Get room IDs where user is a participant
  const { data: participations, error: partError } = await supabase
    .from("chat_participants")
    .select("room_id")
    .eq("user_id", user.id);

  if (partError) {
    return NextResponse.json({ error: partError.message }, { status: 500 });
  }

  const roomIds = (participations ?? []).map((p) => p.room_id);

  if (roomIds.length === 0) {
    return NextResponse.json({ data: [], total: 0 });
  }

  const { data: rooms, count, error } = await supabase
    .from("chat_rooms")
    .select("*", { count: "exact" })
    .in("id", roomIds)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch last message for each room
  const roomsWithLastMessage = await Promise.all(
    (rooms ?? []).map(async (room) => {
      const { data: lastMessage } = await supabase
        .from("chat_messages")
        .select("id, content, message_type, sender_id, created_at")
        .eq("room_id", room.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return { ...room, last_message: lastMessage };
    }),
  );

  return NextResponse.json({ data: roomsWithLastMessage, total: count });
}

/**
 * POST /api/v1/chat/rooms — Create a new chat room
 * Body: { participant_ids: string[], name?, type: 'direct'|'group'|'case' }
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

  if (!body.type || !Array.isArray(body.participant_ids)) {
    return NextResponse.json(
      { error: "type and participant_ids are required" },
      { status: 400 },
    );
  }

  if (!["direct", "group", "case"].includes(body.type)) {
    return NextResponse.json(
      { error: "type must be 'direct', 'group', or 'case'" },
      { status: 400 },
    );
  }

  // Create the room
  const { data: room, error: roomError } = await supabase
    .from("chat_rooms")
    .insert({
      name: body.name ?? null,
      type: body.type,
      related_id: body.related_id ?? null,
    })
    .select()
    .single();

  if (roomError) {
    return NextResponse.json({ error: roomError.message }, { status: 500 });
  }

  // Add current user as owner participant
  const allParticipantIds = [
    user.id,
    ...body.participant_ids.filter((id: string) => id !== user.id),
  ];

  const participants = allParticipantIds.map((pid: string, index: number) => ({
    room_id: room.id,
    user_id: pid,
    role: index === 0 ? "owner" : "member",
  }));

  const { error: partError } = await supabase
    .from("chat_participants")
    .insert(participants);

  if (partError) {
    return NextResponse.json({ error: partError.message }, { status: 500 });
  }

  return NextResponse.json({ data: room }, { status: 201 });
}
