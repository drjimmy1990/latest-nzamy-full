import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/chat/rooms — List user's chat rooms with last message preview
 * Query params: limit (default: 20), offset (default: 0)
 *
 * ALREADY HONEST — LEAVE IT THAT WAY. This route was listed in the empty-200
 * sweep, and it does not have that defect: both query failures return a real
 * 500 with the Supabase message, and the `total` behind the `.range()` is
 * already reported from `{ count: "exact" }`, so there is no silent cap either.
 *
 * The one `{ data: [], total: 0 }` here (the `roomIds.length === 0` branch) is
 * a genuine empty: the participation query SUCCEEDED and this user is in no
 * rooms. That is the honest empty state the rest of this pass exists to
 * protect, not an instance of the defect — do not "fix" it into an error.
 *
 * Note for callers: this route has no try/catch on purpose. An unexpected throw
 * becomes Next's own 500, which is the truth; wrapping it to return `{data: []}`
 * is exactly the regression this comment is here to prevent.
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

  // Fetch last message for each room.
  //
  // A failure here is deliberately NOT fatal — losing one room's preview line
  // is not worth hiding the whole conversation list — but it was also entirely
  // invisible: the error was destructured away, and a room whose preview query
  // failed rendered identically to a room nobody has written in yet. Logging it
  // does not fix that ambiguity for the reader, but it makes it diagnosable
  // instead of silent. Fixing it properly needs a per-room marker in the row
  // shape and a client that renders it, which is a consumer-side change.
  const roomsWithLastMessage = await Promise.all(
    (rooms ?? []).map(async (room) => {
      const { data: lastMessage, error: lastMessageError } = await supabase
        .from("chat_messages")
        .select("id, body, sender_id, created_at")
        .eq("room_id", room.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastMessageError) {
        console.error(
          `[chat/rooms GET] last message read failed for room ${room.id}:`,
          lastMessageError.message,
          lastMessageError.code,
        );
      }

      return { ...room, last_message: lastMessage };
    }),
  );

  return NextResponse.json({ data: roomsWithLastMessage, total: count ?? null });
}

/**
 * POST /api/v1/chat/rooms — Create a new chat room
 * Body: { participant_ids: string[], name?, room_type: 'direct'|'group'|'support' }
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

  if (!body.room_type || !Array.isArray(body.participant_ids)) {
    return NextResponse.json(
      { error: "room_type and participant_ids are required" },
      { status: 400 },
    );
  }

  if (!["direct", "group", "support"].includes(body.room_type)) {
    return NextResponse.json(
      { error: "room_type must be 'direct', 'group', or 'support'" },
      { status: 400 },
    );
  }

  // Create the room
  const { data: room, error: roomError } = await supabase
    .from("chat_rooms")
    .insert({
      name: body.name ?? null,
      room_type: body.room_type,
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
