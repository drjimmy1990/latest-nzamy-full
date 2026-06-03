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

export async function getChatRooms(): Promise<ChatRoom[]> {
  if (!isSupabaseMode) return []; // No demo chat data
  try {
    const response = await apiGet<{ data: ChatRoom[] }>("/api/v1/chat/rooms");
    return response.data;
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
    const response = await apiGet<{ data: ChatMessage[] }>(
      `/api/v1/chat/rooms/${roomId}/messages`,
      { limit: opts?.limit, offset: opts?.offset },
    );
    return response.data;
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
  return apiMutate<ChatMessage>(`/api/v1/chat/rooms/${roomId}/messages`, "POST", {
    content,
    message_type: messageType,
    metadata,
  });
}
