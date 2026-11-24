"use client";

/**
 * «رسائل العملاء» — /dashboard/lawyer/messages.
 *
 * Old owner note (file 10 ب8, «رسائل المحامي والموثّق»): the client writes to
 * the lawyer from the consultation page (chat room of the service request,
 * public.create_chat_room), and has «رسائلي» to read the replies — but the
 * lawyer had no screen at all, so a client's message reached nobody. This page
 * is the lawyer's side of the same rooms, over the same hook (useChat →
 * /api/v1/chat/rooms, RLS: a participant reads only his own rooms). A notary is
 * a lawyer account with an extra role, so he uses this page too.
 *
 * Reached from «الاستشارات» (a «رسائل العملاء» button). It is not a new sidebar
 * row: the owner asked to keep the side menu as it is (20 Nov).
 *
 * Honest states only: a failed read says so; it is never shown as «لا رسائل».
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChatCircle, PaperPlaneTilt, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useChat } from "@/hooks/useChat";
import { useUser } from "@/hooks/useUser";

function timeAr(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });
}

export default function LawyerMessagesPage() {
  const { isDark } = useTheme();
  const { userId } = useUser();
  const chat = useChat();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-100" : "text-slate-800";

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await chat.sendMessage(text);
      setDraft("");
    } catch {
      setSendError("تعذّر إرسال الرسالة. لم تصل إلى العميل، فأعد المحاولة.");
    } finally {
      setSending(false);
    }
  }

  // Only the open room's own messages (useChat clears them on a room change).
  const thread = chat.messagesRoomId === chat.activeRoomId ? chat.messages : [];

  return (
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-black ${strong}`}>رسائل العملاء</h1>
          <p className={`mt-1 text-sm ${muted}`}>المحادثات التي فتحها عملاؤك من طلباتهم واستشاراتهم معك.</p>
        </div>
        <Link href="/dashboard/lawyer/consultations" className={`inline-flex items-center gap-1.5 text-sm font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
          <ArrowRight size={14} /> الاستشارات
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Rooms */}
        <div className={`${card} p-3 md:col-span-1`}>
          {chat.roomsState === "loading" ? (
            <p className={`p-3 text-sm ${muted}`}>جارٍ تحميل المحادثات…</p>
          ) : chat.roomsState === "unreadable" ? (
            <p className="p-3 text-sm text-rose-500 flex items-center gap-1.5">
              <Warning size={14} /> تعذّر تحميل المحادثات الآن. أعد تحميل الصفحة.
            </p>
          ) : chat.rooms.length === 0 ? (
            <p className={`p-3 text-sm ${muted}`}>لا توجد محادثات بعد. تظهر هنا حين يراسلك عميل من طلبه.</p>
          ) : (
            <ul className="space-y-1">
              {chat.rooms.map((room) => {
                const active = room.id === chat.activeRoomId;
                return (
                  <li key={room.id}>
                    <button
                      type="button"
                      onClick={() => chat.setActiveRoom(room.id)}
                      className={`w-full text-start rounded-xl px-3 py-2.5 transition-colors ${
                        active ? (isDark ? "bg-white/[0.06]" : "bg-slate-100") : isDark ? "hover:bg-white/[0.04]" : "hover:bg-slate-50"
                      }`}
                    >
                      <p className={`text-[13px] font-bold ${strong} flex items-center gap-1.5`}>
                        <ChatCircle size={14} /> محادثة طلب
                      </p>
                      <p className={`mt-0.5 text-[12px] truncate ${muted}`}>
                        {room.last_message?.content ?? "لا رسائل فيها بعد"}
                      </p>
                      <p className={`mt-0.5 text-[11px] ${muted}`}>{timeAr(room.last_message?.created_at ?? room.created_at)}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Thread */}
        <div className={`${card} p-4 md:col-span-2 flex flex-col min-h-[420px]`}>
          {!chat.activeRoomId ? (
            <p className={`m-auto text-sm ${muted}`}>اختر محادثة لعرض رسائلها.</p>
          ) : (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {chat.messagesState === "loading" ? (
                  <p className={`text-sm ${muted}`}>جارٍ تحميل الرسائل…</p>
                ) : chat.messagesState === "unreadable" ? (
                  <p className="text-sm text-rose-500 flex items-center gap-1.5">
                    <Warning size={14} /> تعذّر تحميل رسائل هذه المحادثة الآن.
                  </p>
                ) : thread.length === 0 ? (
                  <p className={`text-sm ${muted}`}>لا رسائل في هذه المحادثة بعد.</p>
                ) : (
                  thread.map((m) => {
                    const mine = Boolean(userId) && m.sender_id === userId;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-6 whitespace-pre-wrap ${
                            mine
                              ? "bg-[#0B3D2E] text-white"
                              : isDark
                                ? "bg-white/[0.06] text-zinc-100"
                                : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          <p className="text-[11px] opacity-70 mb-0.5">{mine ? "أنت" : m.sender_name || "العميل"}</p>
                          {m.content}
                          <p className="text-[10px] opacity-60 mt-1">{timeAr(m.created_at)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mt-3 flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  maxLength={4000}
                  placeholder="اكتب ردك…"
                  className={`flex-1 resize-none rounded-xl border px-3 py-2 text-sm ${
                    isDark ? "border-white/10 bg-zinc-900 text-zinc-100" : "border-slate-200 bg-white text-slate-800"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || !draft.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-sm font-bold text-[#C8A762] disabled:opacity-50"
                >
                  <PaperPlaneTilt size={15} /> {sending ? "جارٍ الإرسال…" : "إرسال"}
                </button>
              </div>
              {sendError ? <p className="mt-2 text-[12px] text-rose-500">{sendError}</p> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
