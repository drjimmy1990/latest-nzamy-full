/**
 * chatService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode real-time chat service.
 *
 * ── TWO DEFECTS, AND THE SECOND ONE IS WHY CHAT NEVER WORKED ────────────────
 *
 * 1. Both readers ended in `catch { return [] }`. A failed message load is
 *    pixel-identical to a conversation nobody has written in yet, so a client
 *    whose thread failed to load saw an empty composer and concluded the lawyer
 *    had said nothing. Both now return `ListRead`.
 *
 * 2. The two MUTATIONS were reading the wrong shape off the response, which is
 *    a plain bug and not a philosophy:
 *      POST /api/v1/chat/rooms          answers `{ data: room }`    (route.ts:133)
 *      POST /api/v1/chat/rooms/[id]/messages answers `{ data: msg }` (route.ts:125)
 *    but both were typed as the bare row and returned verbatim. So
 *    `createChatRoom(...).id` was `undefined` at
 *    src/app/dashboard/client/consultation/[id]/page.tsx:400 — `roomId` fell to
 *    `null` every time and the page rendered «تعذّر فتح غرفة المحادثة الآن»
 *    over a room the server had just created. And `sendChatMessage` fed
 *    `{ data: … }` to `mapMessage`, producing `{ content: undefined }`, which
 *    is what useChat.ts:111 dedupes on by `.id`. Both are unwrapped below.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, type ListRead } from "@/lib/services/listRead";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatRoom {
  id: string;
  name: string | null;
  type: "direct" | "group" | "case";
  related_id?: string;
  created_at: string;
  last_message?: {
    content: string;
    sender_name?: string;
    created_at: string;
  };
  unread_count?: number;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  message_type: "text" | "file" | "system";
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ChatParticipant {
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  last_read_at?: string;
  profile?: { display_name: string; avatar_url?: string };
}

// ─── Service functions ────────────────────────────────────────────────────────

// Raw row shape from the API (the `chat_messages` table column is `body`, not `content`).
interface ChatMessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name?: string;
  body: string;
  message_type: "text" | "file" | "system";
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface ChatRoomRow extends Omit<ChatRoom, "last_message"> {
  last_message?: { body: string; sender_id?: string; sender_name?: string; created_at: string };
}

// Map a raw API row (column `body`) onto the ChatMessage type (field `content`)
// so pages can keep reading `m.content`.
function mapMessage(row: ChatMessageRow): ChatMessage {
  const { body, ...rest } = row;
  return { ...rest, content: body };
}

/** Map a raw room row (last_message.body) onto ChatRoom (last_message.content). */
function mapRoom(room: ChatRoomRow): ChatRoom {
  return {
    ...room,
    last_message: room.last_message
      ? {
          content: room.last_message.body,
          sender_name: room.last_message.sender_name,
          created_at: room.last_message.created_at,
        }
      : undefined,
  };
}

export async function getChatRooms(): Promise<ListRead<ChatRoom>> {
  // Demo mode has no chat store at all — this is a hardcoded absence, not a
  // read. Reported as an honest empty list, which is what it is.
  if (!isSupabaseMode) return listOk([]);
  try {
    const response = await apiGet<{ data: ChatRoomRow[]; total?: number }>(
      "/api/v1/chat/rooms",
    );
    // The route 500s on a Supabase error rather than answering an empty 200,
    // so a throw is the failure signal and there is no `degraded` flag to read.
    // A 200 whose body has no `data` array is still a contract violation.
    if (!Array.isArray(response?.data)) return listFailed<ChatRoom>();
    return listOk(response.data.map(mapRoom), response.total);
  } catch (error) {
    console.error("[chatService] getChatRooms failed:", error);
    return listFailed<ChatRoom>();
  }
}

export async function createChatRoom(data: {
  participant_ids: string[];
  name?: string;
  type?: "direct" | "group" | "case";
  related_id?: string;
}): Promise<ChatRoom> {
  // `{ data: room }` — see the header. Throws on failure (apiMutate does), which
  // is right for a mutation: the caller must not be handed a room object for a
  // room that was never created.
  const res = await apiMutate<{ data: ChatRoomRow }>("/api/v1/chat/rooms", "POST", {
    ...data,
    type: data.type || "direct",
  });
  if (!res?.data) throw new Error("لم يصل تأكيد إنشاء المحادثة من الخادم");
  return mapRoom(res.data);
}

export async function getChatMessages(
  roomId: string,
  opts?: { limit?: number; offset?: number },
): Promise<ListRead<ChatMessage>> {
  // Demo mode: no chat store. See getChatRooms.
  if (!isSupabaseMode) return listOk([]);
  try {
    const response = await apiGet<{ data: ChatMessageRow[]; total?: number }>(
      `/api/v1/chat/rooms/${roomId}/messages`,
      { limit: opts?.limit, offset: opts?.offset },
    );
    if (!Array.isArray(response?.data)) return listFailed<ChatMessage>();
    // The route returns rows with the `body` column — map to `content`.
    // `total` is the server's unfiltered count, so a thread longer than the
    // requested `limit` can be declared rather than silently cut.
    return listOk(response.data.map(mapMessage), response.total);
  } catch (error) {
    console.error("[chatService] getChatMessages failed:", error);
    return listFailed<ChatMessage>();
  }
}

export async function sendChatMessage(
  roomId: string,
  content: string,
  messageType: "text" | "file" = "text",
  metadata?: Record<string, unknown>,
): Promise<ChatMessage> {
  // The route/table use `body` (not `content`), AND wrap the row in `{ data }`
  // — see the header. Missing that wrapper is what made every sent message come
  // back with `id: undefined, content: undefined`.
  const res = await apiMutate<{ data: ChatMessageRow }>(
    `/api/v1/chat/rooms/${roomId}/messages`,
    "POST",
    { body: content, message_type: messageType, metadata },
  );
  // A 200 with no row means we cannot say the message was stored. Throwing is
  // what lets consultation/[id]/page.tsx:466 pull its optimistic bubble back
  // out of the thread instead of leaving it there looking delivered.
  if (!res?.data) throw new Error("لم يصل تأكيد إرسال الرسالة من الخادم");
  return mapMessage(res.data);
}
