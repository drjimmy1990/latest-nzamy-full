/**
 * useChat — Real-time chat hook
 * ─────────────────────────────────────────────────────────
 * Subscribes to Supabase Realtime for live message updates.
 * Falls back to polling in demo mode.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { isSupabaseMode } from "@/lib/services/api";
import {
  getChatRooms,
  getChatMessages,
  sendChatMessage,
} from "@/lib/services/chatService";
import type { ChatRoom, ChatMessage } from "@/lib/services/chatService";
import { createClient } from "@/lib/supabase/client";

export interface UseChatReturn {
  rooms: ChatRoom[];
  messages: ChatMessage[];
  loading: boolean;
  activeRoomId: string | null;
  setActiveRoom: (roomId: string) => void;
  sendMessage: (content: string, type?: "text" | "file") => Promise<void>;
  refreshRooms: () => Promise<void>;
}

export function useChat(): UseChatReturn {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // ── Load rooms ──────────────────────────────────────────────────────────────
  const refreshRooms = useCallback(async () => {
    try {
      const data = await getChatRooms();
      setRooms(data);
    } catch {
      // Keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshRooms(); }, [refreshRooms]);

  // ── Load messages when active room changes ──────────────────────────────────
  useEffect(() => {
    if (!activeRoomId) { setMessages([]); return; }

    let cancelled = false;
    const load = async () => {
      try {
        const data = await getChatMessages(activeRoomId, { limit: 50 });
        if (!cancelled) setMessages(data);
      } catch {
        // Keep existing state
      }
    };
    load();

    // Realtime subscription for this room's messages
    if (isSupabaseMode) {
      try {
        const supabase = createClient();
        const channel = supabase
          .channel(`chat-room-${activeRoomId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "chat_messages",
              filter: `room_id=eq.${activeRoomId}`,
            },
            (payload) => {
              const newMsg = payload.new as ChatMessage;
              setMessages(prev => [...prev, newMsg]);
            },
          )
          .subscribe();

        channelRef.current = channel;

        return () => {
          cancelled = true;
          supabase.removeChannel(channel);
        };
      } catch {
        // Fallback: no realtime
      }
    }

    return () => { cancelled = true; };
  }, [activeRoomId]);

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessageFn = useCallback(
    async (content: string, type: "text" | "file" = "text") => {
      if (!activeRoomId) return;
      const msg = await sendChatMessage(activeRoomId, content, type);
      // Optimistic: if Realtime doesn't catch it, add locally
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    },
    [activeRoomId],
  );

  const setActiveRoom = useCallback((roomId: string) => {
    setActiveRoomId(roomId);
  }, []);

  return {
    rooms,
    messages,
    loading,
    activeRoomId,
    setActiveRoom,
    sendMessage: sendMessageFn,
    refreshRooms,
  };
}
