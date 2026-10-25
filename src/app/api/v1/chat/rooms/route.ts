import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";
import { createRoomError, parseCreateRoomBody, withRelatedId } from "./_createRoom";

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

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
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

      return { ...withRelatedId(room), last_message: lastMessage };
    }),
  );

  return NextResponse.json({ data: roomsWithLastMessage, total: count ?? null });
}

/**
 * POST /api/v1/chat/rooms — open THE chat room of a service request
 * Body: { participant_ids: string[], related_id (or request_id): string,
 *         name?: string, type (or room_type)?: 'direct' | 'group' }
 *
 * Since migration 20261016_03 a user creates a room only through
 * public.create_chat_room: the caller must be a party of the request (its
 * requester or assignee), the other participants must be its other party, and
 * a request has one room — a second call returns it. This route used to insert
 * the room and its participants itself, which the recursive production policy
 * (42P17), the room's read-after-insert and a `room_type`-only body check
 * (the client sends `type`) each broke on their own.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // D6 (owner ٢٩٨): a frozen account (a pending deletion) changes nothing.
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const parsed = parseCreateRoomBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data: room, error } = await supabase.rpc("create_chat_room", {
    p_request_id: parsed.value.requestId,
    p_participant_ids: parsed.value.participantIds,
    p_name: parsed.value.name,
    p_room_type: parsed.value.roomType,
  });

  if (error || !room) {
    console.error("[chat/rooms POST] create_chat_room failed:", error?.code, error?.message);
    const mapped = createRoomError(error?.code);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  return NextResponse.json({ data: withRelatedId(room) }, { status: 201 });
}
