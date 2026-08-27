/**
 * useChat — Real-time chat hook
 * ─────────────────────────────────────────────────────────
 * Subscribes to Supabase Realtime for live message updates.
 * Falls back to polling in demo mode.
 *
 * ── THE FAILURE THIS HOOK USED TO HIDE ──────────────────────────────────────
 *
 * Both readers were wrapped in `catch { /* Keep existing state *\/ }`, which on
 * a first load means `rooms` and `messages` stay at their initial `[]`. So a
 * failed room list was byte-identical to a client who has never had a
 * conversation, and a failed message load was byte-identical to a thread nobody
 * has written in — a client whose thread failed to load saw an empty composer
 * and concluded their lawyer had said nothing.
 *
 * src/app/dashboard/client/messages/page.tsx:364-375 states this in prose and
 * asks, by name, for «a `ListRead<ChatRoom>` or a `roomsUnreadable` flag». That
 * is what `roomsRead` / `roomsState` (and the message pair) are. Every added
 * field is ADDITIVE — that page and any other consumer keep compiling
 * unchanged, and split their one honest-but-vague branch into the real two
 * whenever they are next touched.
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
import { listViewState, type ListRead, type ListViewState } from "@/lib/services/listRead";
import { createClient } from "@/lib/supabase/client";

export interface UseChatReturn {
  /** Rooms from the last successful read; the last good list if a later one failed. */
  rooms: ChatRoom[];
  messages: ChatMessage[];
  loading: boolean;
  /** The room read itself. `ok: false` is "could not read", NOT "no rooms". */
  roomsRead: ListRead<ChatRoom> | null;
  /** 'loading' | 'unreadable' | 'empty' | 'ready' for the room list. */
  roomsState: ListViewState;
  /** The message read for `activeRoomId`. `ok: false` is NOT "no messages". */
  messagesRead: ListRead<ChatMessage> | null;
  /** 'loading' | 'unreadable' | 'empty' | 'ready' for the open thread. */
  messagesState: ListViewState;
  /** True while the open thread's messages are being fetched. */
  messagesLoading: boolean;
  /** Which room `messages`/`messagesRead` describe. Never trust them for another. */
  messagesRoomId: string | null;
  activeRoomId: string | null;
  setActiveRoom: (roomId: string) => void;
  sendMessage: (content: string, type?: "text" | "file") => Promise<void>;
  refreshRooms: () => Promise<void>;
}

export function useChat(): UseChatReturn {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [roomsRead, setRoomsRead] = useState<ListRead<ChatRoom> | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesRead, setMessagesRead] = useState<ListRead<ChatMessage> | null>(null);
  const [messagesRoomId, setMessagesRoomId] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // ── Load rooms ──────────────────────────────────────────────────────────────
  const refreshRooms = useCallback(async () => {
    // getChatRooms no longer rejects — it reports `ok: false`. The old
    // try/catch is gone with it; there is nothing left to swallow.
    const read = await getChatRooms();
    setRoomsRead(read);
    // Only replace the list from a read that answered. A failed refresh leaves
    // the rooms on screen and turns `roomsState` 'unreadable' instead of
    // blanking a client's conversations.
    if (read.ok) setRooms(read.items);
    setLoading(false);
  }, []);

  useEffect(() => { refreshRooms(); }, [refreshRooms]);

  // ── Load messages when active room changes ──────────────────────────────────
  useEffect(() => {
    if (!activeRoomId) {
      setMessages([]);
      setMessagesRead(null);
      setMessagesRoomId(null);
      setMessagesLoading(false);
      return;
    }

    let cancelled = false;
    /*
      CLEARED BEFORE THE FETCH, NOT AFTER IT.

      `messages` used to keep the PREVIOUS room's messages until the new room's
      load returned, and a consumer that maps `messages` onto the open thread
      (messages/page.tsx:220-233 does exactly that, keyed on `activeRoomId`)
      would write one client's conversation into another client's thread for
      those few hundred milliseconds. Nothing survives a room change.
    */
    setMessages([]);
    setMessagesRead(null);
    setMessagesRoomId(activeRoomId);
    setMessagesLoading(true);
    const load = async () => {
      const read = await getChatMessages(activeRoomId, { limit: 50 });
      if (cancelled) return;
      setMessagesRead(read);
      /*
        On failure `messages` stays `[]` — and that empty array is NOT the
        assertion it looks like. A consumer must read `messagesState`, where the
        same failure is 'unreadable'; that is the whole reason the field exists.
      */
      if (read.ok) setMessages(read.items);
      setMessagesLoading(false);
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
              // Realtime delivers the raw row (column `body`); map to `content`.
              const row = payload.new as { body: string } & Partial<ChatMessage>;
              const { body, ...rest } = row;
              const newMsg: ChatMessage = { ...rest, content: body } as ChatMessage;
              setMessages(prev => {
                if (prev.some(m => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
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
      /*
        DELIBERATELY NOT CAUGHT. A failed send must reach the caller: the only
        consumer awaits this inside a try/catch and reverts its optimistic
        bubble on rejection (messages/page.tsx:304-316). Swallowing it here
        would leave the user's message on screen as though it had been sent.

        sendChatMessage now returns the ACTUAL message row. It previously
        returned the `{ data: … }` envelope typed as a message, so `msg.id` was
        undefined — the dedupe below could never match (undefined equals no real
        id), and the blank `{ content: undefined }` object was appended to the
        thread on every send. The dedupe against the Realtime INSERT of the same
        row only starts working now.
      */
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
    roomsRead,
    roomsState: listViewState(loading, roomsRead),
    messagesRead,
    /*
      WITH NO ROOM OPEN THIS IS 'loading', NOT 'unreadable'.

      listViewState(false, null) is 'unreadable' — correct for a read that was
      attempted and failed, wrong for a user who simply has not clicked a
      thread yet. Rendering «تعذّرت القراءة» at them would be the same false
      claim as «لا توجد رسائل», only inverted. 'loading' is the one branch that
      asserts nothing, so that is what "no thread open" reports; a consumer
      should check `activeRoomId` before treating this as being about a thread.
    */
    messagesState: activeRoomId === null ? "loading" : listViewState(messagesLoading, messagesRead),
    messagesLoading,
    messagesRoomId,
    activeRoomId,
    setActiveRoom,
    sendMessage: sendMessageFn,
    refreshRooms,
  };
}
