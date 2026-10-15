/**
 * POST /api/v1/chat/rooms — body parsing and error mapping, kept pure so they
 * are unit-tested (the route imports next/server).
 *
 * Since migration 20261016_03 a user creates a chat room only through
 * public.create_chat_room(request_id, participant_ids, name, room_type): the
 * room belongs to a service request and its parties. The client
 * (src/lib/services/chatService.ts createChatRoom) sends `type` and
 * `related_id`; older callers sent `room_type` / `request_id` — both spellings
 * are read. The route used to demand `room_type` and so answered 400 to every
 * room the consultation page tried to open.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PARTICIPANTS = 20;
const MAX_NAME = 200;
const MAX_REQUEST_ID = 200;

export type CreateRoomInput = {
  requestId: string;
  participantIds: string[];
  name: string;
  roomType: "direct" | "group";
};

export type ParsedCreateRoom =
  | { ok: true; value: CreateRoomInput }
  | { ok: false; error: string };

export function parseCreateRoomBody(body: unknown): ParsedCreateRoom {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "طلب غير صالح" };
  }
  const b = body as Record<string, unknown>;

  const rawType = b.room_type ?? b.type ?? "direct";
  if (rawType !== "direct" && rawType !== "group") {
    return { ok: false, error: "نوع المحادثة غير مدعوم" };
  }

  const rawRequest = b.related_id ?? b.request_id;
  if (typeof rawRequest !== "string" || !rawRequest.trim() || rawRequest.length > MAX_REQUEST_ID) {
    return { ok: false, error: "تُفتح المحادثة من طلب خدمة" };
  }

  if (!Array.isArray(b.participant_ids) || b.participant_ids.length === 0 || b.participant_ids.length > MAX_PARTICIPANTS) {
    return { ok: false, error: "قائمة المشاركين غير صالحة" };
  }
  const ids = b.participant_ids;
  if (!ids.every((id): id is string => typeof id === "string" && UUID_RE.test(id))) {
    return { ok: false, error: "قائمة المشاركين غير صالحة" };
  }

  const name = typeof b.name === "string" ? b.name.trim().slice(0, MAX_NAME) : "";

  return {
    ok: true,
    value: {
      requestId: rawRequest.trim(),
      participantIds: [...new Set(ids.map((id) => id.toLowerCase()))],
      name,
      roomType: rawType,
    },
  };
}

/** HTTP status and Arabic message for an error raised by create_chat_room. */
export function createRoomError(code: string | undefined): { status: number; error: string } {
  if (code === "42501") return { status: 403, error: "لا يمكنك فتح محادثة لهذا الطلب" };
  if (code === "22023") return { status: 400, error: "بيانات المحادثة غير صالحة" };
  return { status: 500, error: "تعذّر فتح المحادثة الآن" };
}

/**
 * chat_rooms has no `related_id` column; the client matches a consultation to
 * its room on it, so the route derives it from request_id (or case_id).
 */
export function withRelatedId<T extends { request_id?: string | null; case_id?: string | null }>(
  room: T,
): T & { related_id: string | null } {
  return { ...room, related_id: room.request_id ?? room.case_id ?? null };
}
