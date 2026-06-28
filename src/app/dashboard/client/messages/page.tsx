"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChatCircle,
  PaperPlaneTilt,
  MagnifyingGlass,
  CheckCircle,
  Circle,
  Phone,
  VideoCamera,
  DotsThreeVertical,
  Lock,
  SealCheck,
  Paperclip,
  X,
  Warning,
  Archive,
  ArrowSquareOut,
  ChatSlash,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useChat } from "@/hooks/useChat";
import { SkeletonThreadList, SkeletonMessages } from "../_components/DashboardSkeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

type MsgSender = "lawyer" | "client" | "system";
type ThreadStatus = "active" | "closed" | "waiting";

interface Message {
  id: string;
  sender: MsgSender;
  text: string;
  time: string;
  read: boolean;
}

interface Thread {
  id: string;
  lawyerName: string;
  lawyerInitial: string;
  lawyerColor: string;
  specialty: string;
  caseTitle: string;
  caseId: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  status: ThreadStatus;
  closedReason?: string;
  // Follow-up window: lawyer can grant X calls within Y hours after session ends
  followUpWindow?: {
    callsRemaining: number;   // how many calls left
    expiresAt: string;        // human-readable expiry e.g. "غداً الساعة ٢ م"
    isActive: boolean;        // computed: still within window?
  };
  messages: Message[];
  // Whether voice/video call buttons should be shown for this thread
  // (direct/case rooms — not group/broadcast rooms).
  supportsCalls?: boolean;
}

// ─── Call Modal ───────────────────────────────────────────────────────────────

function CallModal({
  type,
  lawyerName,
  caseId,
  followUpWindow,
  onClose,
}: {
  type: "voice" | "video";
  lawyerName: string;
  caseId: string;
  followUpWindow?: Thread["followUpWindow"];
  onClose: () => void;
}) {
  const hasActiveFollowUp = followUpWindow?.isActive && (followUpWindow.callsRemaining ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-[#1e2530] rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 text-center"
        dir="rtl"
      >
        {hasActiveFollowUp ? (
          /* ── Active follow-up window ── */
          <>
            <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${type === "voice" ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-blue-100 dark:bg-blue-900/40"}`}>
              {type === "voice"
                ? <Phone size={28} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
                : <VideoCamera size={28} weight="fill" className="text-blue-600 dark:text-blue-400" />}
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-1">
              {type === "voice" ? "مكالمة متابعة صوتية" : "مكالمة متابعة مرئية"}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              {`منح ${lawyerName} نافذة متابعة — تنتهي ${followUpWindow!.expiresAt}`}
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-3 py-2 mb-5">
              <Phone size={12} />
              <span>متبقي {followUpWindow!.callsRemaining} مكالمة من نافذة المتابعة</span>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                إلغاء
              </button>
              <button
                onClick={onClose}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-colors ${
                  type === "voice" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {type === "voice" ? "اتصل الآن" : "ابدأ المكالمة"}
              </button>
            </div>
          </>
        ) : (
          /* ── No active follow-up — prompt to book ── */
          <>
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-gray-100 dark:bg-white/8">
              <Lock size={28} className="text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-1">المكالمات المباشرة</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              لا تتوفر نافذة متابعة نشطة مع {lawyerName} حالياً.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2 mb-5">
              💡 المكالمات متاحة ضمن الاستشارات المدفوعة أو نافذة متابعة ممنوحة من المحامي.
            </p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                إلغاء
              </button>
              <Link
                href={`/dashboard/client/consultation`}
                className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-sm font-bold hover:bg-[#0a3328] transition-colors"
              >
                احجز استشارة
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

// ─── Closed Thread Banner ─────────────────────────────────────────────────────

function ClosedBanner({ caseId, reason }: { caseId: string; reason?: string }) {
  return (
    <div className="px-5 pb-3">
      <div className="rounded-2xl border border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-white/3 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/8 flex items-center justify-center">
            <Archive size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">هذه المحادثة مؤرشفة</p>
            {reason && <p className="text-xs text-gray-400 mt-0.5">{reason}</p>}
          </div>
        </div>
        {caseId && (
          <Link
            href={`/dashboard/client/cases?id=${caseId}`}
            className="sm:ms-auto flex items-center gap-1.5 text-xs font-bold text-[#0B3D2E] dark:text-emerald-400 hover:underline"
          >
            <ArrowSquareOut size={13} />
            عرض ملف القضية
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MessagesPage() {
  const router = useRouter();
  const chat = useChat();

  // Map ChatRoom → Thread[]
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (chat.loading) return;
    if (chat.rooms.length === 0) {
      setThreads([]);
      setLoading(false);
      return;
    }
    const mapped: Thread[] = chat.rooms.map((room) => ({
      id: room.id,
      lawyerName: room.name || "غرفة محادثة",
      lawyerInitial: (room.name || "غ")[0],
      lawyerColor: room.type === "case" ? "bg-emerald-600" : "bg-indigo-600",
      specialty: "",
      caseTitle: room.name || "",
      caseId: room.related_id || "",
      lastMessage: room.last_message?.content || "",
      lastTime: room.last_message?.created_at || "",
      unread: room.unread_count || 0,
      status: "active" as ThreadStatus,
      messages: [],
      supportsCalls: room.type !== "group",
    }));
    setThreads(mapped);
    setLoading(false);
  }, [chat.loading, chat.rooms]);

  // Load messages for active room
  useEffect(() => {
    if (!chat.activeRoomId || chat.messages.length === 0) return;
    setThreads(prev => prev.map(t => {
      if (t.id !== chat.activeRoomId) return t;
      return {
        ...t,
        messages: chat.messages.map(m => ({
          id: m.id,
          sender: (m.sender_name === "client" ? "client" : m.message_type === "system" ? "system" : "lawyer") as MsgSender,
          text: m.content,
          time: m.created_at,
          read: true,
        })),
      };
    }));
  }, [chat.activeRoomId, chat.messages]);

  // ── State ──
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [callModal, setCallModal] = useState<null | "voice" | "video">(null);

  // Auto-select first thread when loaded
  useEffect(() => {
    if (threads.length > 0 && !activeThreadId) {
      setActiveThreadId(threads[0].id);
      chat.setActiveRoom(threads[0].id);
    }
  }, [threads, activeThreadId, chat]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0];
  const isClosed = activeThread?.status === "closed";

  // Auto-scroll to bottom on new messages or thread switch
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThreadId, activeThread?.messages?.length]);

  const filtered = threads.filter(
    (t) =>
      t.lawyerName.includes(search) ||
      t.caseTitle.includes(search) ||
      t.lastMessage.includes(search)
  );

  // ── Handlers ──

  function selectThread(threadId: string) {
    setActiveThreadId(threadId);
    chat.setActiveRoom(threadId);
    // Mark unread → read
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? { ...t, unread: 0, messages: t.messages.map((m) => ({ ...m, read: true })) }
          : t
      )
    );
  }

  function sendMessage() {
    if (!input.trim() || isClosed || !activeThread) return;
    const text = input.trim();
    const newMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: "client",
      text,
      time: "الآن",
      read: true,
    };
    // Update local state optimistically
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThreadId
          ? { ...t, lastMessage: text, lastTime: "الآن", messages: [...t.messages, newMsg] }
          : t
      )
    );
    // Send via service
    chat.sendMessage(text).catch(console.error);
    setInput("");
  }


  const STATUS_BADGE: Record<ThreadStatus, { label: string; cls: string }> = {
    active:  { label: "نشط",           cls: "text-emerald-600 dark:text-emerald-400" },
    waiting: { label: "قيد المراجعة",  cls: "text-amber-600 dark:text-amber-400" },
    closed:  { label: "مؤرشف",         cls: "text-gray-400" },
  };

  if (loading || !activeThread) {
    return (
      <div className="flex h-[calc(100vh-4rem)]" dir="rtl">
        <div className="w-full md:w-[380px] p-4">
          <SkeletonThreadList count={3} />
        </div>
        <div className="hidden md:flex flex-1 items-center justify-center">
          <SkeletonMessages count={5} />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Call Modal ── */}
      <AnimatePresence>
        {callModal && (
          <CallModal
            type={callModal}
            lawyerName={activeThread.lawyerName}
            caseId={activeThread.caseId}
            followUpWindow={activeThread.followUpWindow}
            onClose={() => setCallModal(null)}
          />
        )}
      </AnimatePresence>

      <div className="flex h-[calc(100vh-4rem)] overflow-hidden" dir="rtl">

        {/* ── Thread Sidebar ──────────────────────────────────────────── */}
        <aside className="w-80 flex-shrink-0 flex flex-col border-l border-gray-100 dark:border-white/8 bg-white dark:bg-[#161b22]">
          <div className="p-4 border-b border-gray-100 dark:border-white/8">
            <h1 className="text-base font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <ChatCircle size={18} weight="duotone" className="text-[#0B3D2E]" />
              رسائلي
            </h1>
            <div className="relative">
              <MagnifyingGlass size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث في رسائلك..."
                className="w-full rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/8 text-sm pr-9 pl-3 py-2 outline-none focus:ring-2 focus:ring-[#0B3D2E]/20 text-gray-900 dark:text-white placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">لا توجد نتائج</div>
            ) : (
              filtered.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => selectThread(thread.id)}
                  className={`w-full p-4 text-start border-b border-gray-50 dark:border-white/5 transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${
                    activeThread.id === thread.id
                      ? "bg-[#0B3D2E]/5 dark:bg-[#0B3D2E]/10 border-r-2 border-r-[#0B3D2E]"
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      <div className={`w-10 h-10 rounded-full ${thread.lawyerColor} text-white font-bold text-sm flex items-center justify-center ${thread.status === "closed" ? "opacity-50" : ""}`}>
                        {thread.lawyerInitial}
                      </div>
                      {thread.status === "closed" && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                          <Lock size={8} className="text-gray-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-sm font-bold truncate ${thread.status === "closed" ? "text-gray-400" : "text-gray-900 dark:text-white"}`}>
                          {thread.lawyerName}
                        </span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0 mr-2">{thread.lastTime}</span>
                      </div>
                      <p className={`text-[11px] font-medium mb-1 truncate ${thread.status === "closed" ? "text-gray-400" : "text-[#0B3D2E] dark:text-emerald-400"}`}>
                        {thread.caseTitle}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate leading-relaxed">{thread.lastMessage}</p>
                    </div>
                    {thread.unread > 0 && (
                      <span className="w-5 h-5 rounded-full bg-[#0B3D2E] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {thread.unread}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ── Chat View ──────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col bg-gray-50 dark:bg-[#0c0f12] min-w-0">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-white dark:bg-[#161b22] border-b border-gray-100 dark:border-white/8">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${activeThread.lawyerColor} text-white font-bold text-sm flex items-center justify-center ${isClosed ? "opacity-50" : ""}`}>
                {activeThread.lawyerInitial}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-gray-900 dark:text-white">{activeThread.lawyerName}</span>
                  {!isClosed && <SealCheck size={14} weight="fill" className="text-[#0B3D2E]" />}
                  <span className={`text-[10px] font-medium ${STATUS_BADGE[activeThread.status].cls}`}>
                    {STATUS_BADGE[activeThread.status].label}
                  </span>
                </div>
                {activeThread.caseId && (
                  <Link href={`/dashboard/client/cases?id=${activeThread.caseId}`} className="text-xs text-[#0B3D2E] hover:underline">
                    ملف القضية رقم {activeThread.caseId}
                  </Link>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Call buttons — only for threads that support calls (not group/broadcast) */}
              {!isClosed && activeThread.supportsCalls !== false && (
                <>
                  <button
                    onClick={() => setCallModal("voice")}
                    className="p-2 rounded-xl text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                    title="مكالمة صوتية"
                  >
                    <Phone size={17} />
                  </button>
                  <button
                    onClick={() => setCallModal("video")}
                    className="p-2 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    title="مكالمة مرئية"
                  >
                    <VideoCamera size={17} />
                  </button>
                </>
              )}
              <button className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                <DotsThreeVertical size={17} />
              </button>
            </div>
          </div>

          {/* Closed case banner */}
          {isClosed && (
            <div className="px-5 pt-4">
              <ClosedBanner caseId={activeThread.caseId} reason={activeThread.closedReason} />
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {activeThread.messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex ${msg.sender === "client" ? "justify-start" : msg.sender === "system" ? "justify-center" : "justify-end"}`}
              >
                {msg.sender === "system" ? (
                  <span className="text-xs text-gray-400 bg-gray-100 dark:bg-white/5 px-3 py-1.5 rounded-full">
                    {msg.text}
                  </span>
                ) : (
                  <div className={`max-w-[70%] flex flex-col gap-1 ${msg.sender === "client" ? "items-start" : "items-end"}`}>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.sender === "client"
                          ? "bg-[#0B3D2E] text-white rounded-tr-sm"
                          : "bg-white dark:bg-[#1e2530] text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-white/8 rounded-tl-sm shadow-sm"
                      }`}
                    >
                      {msg.text}
                    </div>
                    <div className={`flex items-center gap-1 text-[10px] text-gray-400 ${msg.sender === "client" ? "flex-row" : "flex-row-reverse"}`}>
                      <span>{msg.time}</span>
                      {msg.sender === "client" && (
                        msg.read
                          ? <CheckCircle size={12} className="text-emerald-500" weight="fill" />
                          : <Circle size={12} />
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Security note */}
          <div className="px-5 py-1.5">
            <div className="flex items-center gap-2 text-[11px] text-gray-400 justify-center">
              <Lock size={11} />
              <span>المحادثات محمية وسرية — لا تشارك معلومات حساسة خارج المنصة</span>
            </div>
          </div>

          {/* Input — disabled when closed */}
          <div className="px-5 pb-5">
            {isClosed ? (
              <div className="flex items-center gap-3 bg-gray-100 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/8 px-4 py-3">
                <ChatSlash size={18} className="text-gray-400 flex-shrink-0" />
                <p className="text-sm text-gray-400">
                  هذه المحادثة مؤرشفة — يمكنك فتح قضية جديدة أو حجز استشارة مع محامٍ آخر.
                </p>
                <Link
                  href="/dashboard/client/consultation"
                  className="ms-auto flex-shrink-0 text-xs font-bold text-[#0B3D2E] dark:text-emerald-400 hover:underline whitespace-nowrap"
                >
                  احجز الآن ←
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-white/10 px-4 py-2 shadow-sm">
                <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                  <Paperclip size={18} />
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="اكتب رسالتك لمحاميك..."
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none"
                />
                <motion.button
                  onClick={sendMessage}
                  whileTap={{ scale: 0.9 }}
                  disabled={!input.trim()}
                  className={`p-2 rounded-xl transition-all ${
                    input.trim()
                      ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328] shadow-sm"
                      : "bg-gray-100 dark:bg-white/5 text-gray-300 dark:text-gray-600 cursor-not-allowed"
                  }`}
                >
                  <PaperPlaneTilt size={17} weight="fill" />
                </motion.button>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
