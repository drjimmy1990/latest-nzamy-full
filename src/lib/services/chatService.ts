/**
 * chatService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode real-time chat service.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";

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

export async function getChatRooms(): Promise<ChatRoom[]> {
  if (!isSupabaseMode) return []; // No demo chat data
  try {
    const response = await apiGet<{ data: ChatRoomRow[] }>("/api/v1/chat/rooms");
    // Map last_message.body → last_message.content for the page.
    return response.data.map((room) => ({
      ...room,
      last_message: room.last_message
        ? {
            content: room.last_message.body,
            sender_name: room.last_message.sender_name,
            created_at: room.last_message.created_at,
          }
        : undefined,
    }));
  } catch {
    return [];
  }
}

export async function createChatRoom(data: {
  participant_ids: string[];
  name?: string;
  type?: "direct" | "group" | "case";
  related_id?: string;
}): Promise<ChatRoom> {
  return apiMutate<ChatRoom>("/api/v1/chat/rooms", "POST", {
    ...data,
    type: data.type || "direct",
  });
}

export async function getChatMessages(
  roomId: string,
  opts?: { limit?: number; offset?: number },
): Promise<ChatMessage[]> {
  if (!isSupabaseMode) return [];
  try {
    const response = await apiGet<{ data: ChatMessageRow[] }>(
      `/api/v1/chat/rooms/${roomId}/messages`,
      { limit: opts?.limit, offset: opts?.offset },
    );
    // The route returns rows with the `body` column — map to `content`.
    return response.data.map(mapMessage);
  } catch {
    return [];
  }
}

export async function sendChatMessage(
  roomId: string,
  content: string,
  messageType: "text" | "file" = "text",
  metadata?: Record<string, unknown>,
): Promise<ChatMessage> {
  // The route/table use `body` (not `content`). Map the returned row too.
  const row = await apiMutate<ChatMessageRow>(
    `/api/v1/chat/rooms/${roomId}/messages`,
    "POST",
    { body: content, message_type: messageType, metadata },
  );
  return mapMessage(row);
}
