"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ticket, MagnifyingGlass, ArrowLeft, Clock, CheckCircle,
  Warning, X, ChatCircle, User, Robot, Fire, SealCheck,
  CaretDown, ArrowsClockwise, ArrowClockwise,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { listFailed, listFromApi, listOk, listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";

// ─── Types ────────────────────────────────────────────────────────────────────
type TicketStatus  = "open" | "inprogress" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "critical";

interface SupportTicket {
  id: string;
  user: string;
  userType: string;
  subject: string;
  /**
   * What the client actually wrote. It is on the row (`support_tickets.body`)
   * and was being dropped, which is why the detail panel had to invent a
   * message to fill the space — see the modal below.
   */
  body: string | null;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  created: string;
  lastReply: string;
  /**
   * `null` always, until something counts messages. There is no ticket-messages
   * table anywhere in this repo, so the old hardcoded `1` was a per-row invented
   * figure sitting under a «رسائل» column header — and a ticket with six
   * exchanges read as a ticket nobody had answered.
   */
  messages: number | null;
  assignee?: string;
}

/* ── No mock queue ───────────────────────────────────────────────────────────
 *
 * Eight invented tickets used to be substituted whenever the fetch failed or
 * the table came back empty, including «حذف بيانات القسم القانوني بالخطأ —
 * استعادة عاجلة» at critical priority. A support queue that answers a broken
 * read by inventing an urgent ticket sends the office chasing a client who
 * never wrote in, while the real queue — whatever is in it — stays invisible.
 * GET /api/v1/admin/tickets now answers a failed query with 500 + {error}.
 */

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; icon: React.ElementType }> = {
  open:       { label: "مفتوح",     color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",   icon: Clock },
  inprogress: { label: "جارٍ",      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",       icon: ArrowsClockwise },
  resolved:   { label: "محلول",     color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle },
  closed:     { label: "مغلق",      color: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",          icon: X },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string }> = {
  critical: { label: "حرج",     color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  high:     { label: "عالية",   color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  medium:   { label: "متوسطة",  color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  low:      { label: "منخفضة",  color: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500" },
};

// ─── DB row → page mapping ──────────────────────────────────────────────────────
// support_tickets(id,user_id,subject,body,category,priority,status,assignee_id,metadata,created_at,updated_at)
// DB status vocabulary: open | pending | resolved | closed → page uses "inprogress" for "pending".
// DB priority vocabulary: low | normal | high | urgent → page uses medium/critical.
interface SupportTicketRow {
  id: string;
  user_id: string | null;
  subject: string;
  body: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  assignee_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

const DB_STATUS_TO_PAGE: Record<string, TicketStatus> = {
  open: "open",
  pending: "inprogress",
  inprogress: "inprogress",
  resolved: "resolved",
  closed: "closed",
};
// Page status → DB status (for PATCH). "inprogress" persists as "pending".
const PAGE_STATUS_TO_DB: Record<TicketStatus, string> = {
  open: "open",
  inprogress: "pending",
  resolved: "resolved",
  closed: "closed",
};

const DB_PRIORITY_TO_PAGE: Record<string, TicketPriority> = {
  low: "low",
  normal: "medium",
  medium: "medium",
  high: "high",
  urgent: "critical",
  critical: "critical",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

function rowToTicket(row: SupportTicketRow): SupportTicket {
  const metadata = row.metadata ?? {};
  const userLabel =
    (typeof metadata.user_name === "string" && metadata.user_name) ||
    row.user_id ||
    "مستخدم";
  const userType =
    (typeof metadata.user_type === "string" && metadata.user_type) || "مستخدم";
  const assignee =
    (typeof metadata.assignee_name === "string" && metadata.assignee_name) ||
    row.assignee_id ||
    undefined;
  return {
    id: row.id,
    user: userLabel,
    userType,
    subject: row.subject,
    body: typeof row.body === "string" && row.body.trim() ? row.body : null,
    category: row.category ?? "عام",
    status: DB_STATUS_TO_PAGE[row.status ?? "open"] ?? "open",
    priority: DB_PRIORITY_TO_PAGE[row.priority ?? "normal"] ?? "medium",
    created: timeAgo(row.created_at),
    lastReply: timeAgo(row.updated_at ?? row.created_at),
    messages: null,
    ...(assignee ? { assignee } : {}),
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminTicketsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [read, setRead] = useState<ListRead<SupportTicket> | null>(null);
  // Starts `true`: with it `false`, the first paint says «لا توجد تذاكر» to an
  // office that may well have an open critical ticket.
  const [loading, setLoading] = useState(true);
  const [actionErr, setActionErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/tickets");
      if (!res.ok) {
        setRead(listFailed<SupportTicket>());
        return;
      }
      const json = await res.json();
      const base = listFromApi<SupportTicketRow>(json);
      setRead(base.ok ? listOk(base.items.map(rowToTicket), base.total) : listFailed<SupportTicket>());
    } catch {
      setRead(listFailed<SupportTicket>());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-100"}`;

  const state = listViewState(loading, read);
  const tickets = itemsOf(read);

  // Persist a status change, showing it immediately and TAKING IT BACK if the
  // write did not land. The optimistic update used to be permanent whatever the
  // server said — a failed PATCH left «محلول» on screen over a ticket still
  // open in the database, which is the same defect as a failed read reported as
  // an empty one, only written into the queue instead of read out of it.
  async function updateTicketStatus(ticketId: string, next: TicketStatus) {
    const previous = tickets.find((t) => t.id === ticketId)?.status;
    setActionErr("");
    const apply = (status: TicketStatus) => {
      setRead((cur) =>
        cur && cur.ok
          ? listOk(cur.items.map((t) => (t.id === ticketId ? { ...t, status } : t)), cur.total)
          : cur,
      );
      setSelectedTicket((cur) => (cur && cur.id === ticketId ? { ...cur, status } : cur));
    };
    apply(next);
    try {
      const res = await fetch(`/api/v1/admin/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: PAGE_STATUS_TO_DB[next] }),
      });
      if (!res.ok) {
        if (previous) apply(previous);
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setActionErr(body.error ?? "تعذّر تغيير حالة التذكرة — لم يُحفظ التغيير.");
      }
    } catch {
      if (previous) apply(previous);
      setActionErr("تعذّر الاتصال بالخادم — لم يُحفظ تغيير الحالة.");
    }
  }

  const filtered = tickets
    .filter(t => statusFilter === "all" || t.status === statusFilter)
    .filter(t => search === "" || t.subject.includes(search) || t.user.includes(search) || t.id.includes(search));

  // Counted over what was read. On an unreadable queue these are not rendered
  // as numbers at all — see the KPI row: «٠ مفتوح» is a statement that nothing
  // is waiting, and it is the single most expensive thing this screen can say.
  const COUNTS = {
    all: tickets.length,
    open: tickets.filter(t => t.status === "open").length,
    inprogress: tickets.filter(t => t.status === "inprogress").length,
    resolved: tickets.filter(t => t.status === "resolved").length,
    closed: tickets.filter(t => t.status === "closed").length,
  };
  const countsKnown = state === "empty" || state === "ready";

  return (
    <div className={`p-6 md:p-8 space-y-6 max-w-[1300px] mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-zinc-900"}`}>
            تذاكر الدعم
          </h1>
          <p className={`text-sm mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            إدارة ومتابعة طلبات دعم المستخدمين
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state === "unreadable" && (
            <span className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl ${
              isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "bg-amber-50 text-amber-600 border border-amber-200"}`}>
              <Warning size={13} weight="fill" /> تعذّرت القراءة
            </span>
          )}
          {tickets.filter(t => t.status === "open" && t.priority === "critical").length > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-bold bg-red-500 text-white px-3 py-1.5 rounded-xl animate-pulse">
              <Fire size={13} weight="fill" />
              {tickets.filter(t => t.status === "open" && t.priority === "critical").length} تذكرة حرجة
            </span>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(["all", "open", "inprogress", "resolved", "closed"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`${card} p-4 text-center transition-all hover:scale-[1.02] ${statusFilter === s ? "ring-2 ring-[#0B3D2E]" : ""}`}
          >
            <p className={`text-2xl font-black font-mono ${
              countsKnown ? (isDark ? "text-white" : "text-zinc-900") : (isDark ? "text-zinc-600" : "text-zinc-300")
            }`}>
              {countsKnown ? COUNTS[s] : "—"}
            </p>
            <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              {s === "all" ? "الكل" : STATUS_CONFIG[s].label}
            </p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className={`flex items-center gap-2 rounded-xl border px-4 ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-200"}`}>
        <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث بالرقم أو الاسم أو الموضوع..."
          className={`flex-1 py-3 text-sm bg-transparent outline-none ${isDark ? "text-zinc-200 placeholder-zinc-600" : "text-zinc-800 placeholder-zinc-400"}`}
        />
      </div>

      {/* Tickets Table */}
      <div className={card}>
        <div className={`grid grid-cols-[100px_1fr_100px_90px_90px_80px] gap-4 px-5 py-3 text-[11px] font-bold uppercase tracking-wider border-b ${isDark ? "text-zinc-600 border-white/[0.06]" : "text-zinc-400 border-zinc-100"}`}>
          <span>رقم التذكرة</span>
          <span>الموضوع</span>
          <span>الحالة</span>
          <span>الأولوية</span>
          <span>آخر رد</span>
          <span>رسائل</span>
        </div>

        <div className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
          {state === "ready" && filtered.map((ticket, i) => {
            const StatusIcon = STATUS_CONFIG[ticket.status].icon;
            return (
              <motion.button
                key={ticket.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setSelectedTicket(ticket)}
                className={`w-full grid grid-cols-[100px_1fr_100px_90px_90px_80px] gap-4 px-5 py-4 text-right transition-colors ${
                  isDark ? "hover:bg-white/[0.02]" : "hover:bg-zinc-50"
                }`}
              >
                {/* ID */}
                <span className={`text-[12px] font-mono font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  {ticket.id}
                </span>

                {/* Subject + User */}
                <div className="min-w-0 text-right">
                  <p className={`text-[13px] font-semibold truncate mb-0.5 ${ticket.priority === "critical" ? "text-red-500" : isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                    {ticket.priority === "critical" && <Warning size={12} className="inline me-1" weight="fill" />}
                    {ticket.subject}
                  </p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    {ticket.user} · {ticket.userType} · {ticket.category}
                  </p>
                </div>

                {/* Status */}
                <span className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full self-center ${STATUS_CONFIG[ticket.status].color}`}>
                  <StatusIcon size={10} />
                  {STATUS_CONFIG[ticket.status].label}
                </span>

                {/* Priority */}
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full self-center ${PRIORITY_CONFIG[ticket.priority].color}`}>
                  {PRIORITY_CONFIG[ticket.priority].label}
                </span>

                {/* Last reply */}
                <span className={`text-[12px] self-center ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  {ticket.lastReply}
                </span>

                {/* Messages — «—» until something counts them. */}
                <span className={`flex items-center gap-1 text-[12px] self-center ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  <ChatCircle size={13} />
                  {ticket.messages ?? "—"}
                </span>
              </motion.button>
            );
          })}

          {state === "loading" && (
            <div className={`px-5 py-12 text-center text-sm ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              جارٍ تحميل التذاكر…
            </div>
          )}

          {state === "unreadable" && (
            <div className="px-5 py-12 text-center">
              <Warning size={24} weight="fill" className="mx-auto mb-2 text-amber-500" />
              <p className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>تعذّرت قراءة التذاكر</p>
              <p className={`text-xs mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                هذه ليست قائمة فارغة — لم نتمكن من القراءة، فقد تكون هناك تذاكر مفتوحة لا تظهر هنا.
              </p>
              <button type="button" onClick={() => { void load(); }}
                className="mt-3 inline-flex items-center gap-1.5 bg-[#0B3D2E] hover:bg-[#1a5c44] text-white text-xs font-bold px-4 py-2 rounded-xl transition">
                <ArrowClockwise size={12} weight="bold" /> إعادة المحاولة
              </button>
            </div>
          )}

          {state === "empty" && (
            <div className="px-5 py-12 text-center">
              <Ticket size={40} className={`mx-auto mb-3 opacity-30 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} weight="duotone" />
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>لا توجد تذاكر</p>
            </div>
          )}

          {/* Read fine, but the chips or the search box hid everything. A
              different fact from an empty queue and worded as one. */}
          {state === "ready" && filtered.length === 0 && (
            <div className="px-5 py-12 text-center">
              <Ticket size={40} className={`mx-auto mb-3 opacity-30 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} weight="duotone" />
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>لا توجد تذاكر مطابقة للتصفية الحالية</p>
            </div>
          )}
        </div>
      </div>

      {/* Ticket Detail Modal */}
      <AnimatePresence>
        {selectedTicket && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedTicket(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden ${isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-zinc-100"}`}
            >
              {/* Header */}
              <div className={`flex items-start justify-between p-6 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-mono font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{selectedTicket.id}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_CONFIG[selectedTicket.status].color}`}>
                      {STATUS_CONFIG[selectedTicket.status].label}
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_CONFIG[selectedTicket.priority].color}`}>
                      {PRIORITY_CONFIG[selectedTicket.priority].label}
                    </span>
                  </div>
                  <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{selectedTicket.subject}</h2>
                  <p className={`text-xs mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    {selectedTicket.user} · {selectedTicket.userType} · {selectedTicket.created}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedTicket(null)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${isDark ? "hover:bg-white/[0.06]" : "hover:bg-zinc-100"}`}
                >
                  <X size={16} />
                </button>
              </div>

              {/* The ticket as filed.
                  ── WHAT WAS HERE ──────────────────────────────────────────
                  This panel used to render «مرحباً، أواجه مشكلة في: {subject}.
                  أرجو المساعدة في أقرب وقت.» under the client's own name and
                  timestamp, styled as their message. Nobody wrote that
                  sentence. It was a template built from the subject line and
                  attributed to a real, named person — the strongest form of
                  this whole defect, because an admin reading it has no way to
                  know they are not reading their client.

                  `support_tickets.body` is the real text and was already on the
                  row; it was simply being dropped in rowToTicket(). It is now
                  carried through and shown, and when the column is genuinely
                  empty the panel says so rather than filling the space.

                  The second block — a «تم استلام تذكرتك…» reply attributed to
                  the assignee — is gone entirely and not replaced. There is no
                  replies table in this repo, so there is no such message to
                  show; only the assignment itself is a fact, and that is what
                  is left. */}
              <div className="p-6 space-y-4 max-h-80 overflow-y-auto">
                <div className={`p-4 rounded-2xl ${isDark ? "bg-zinc-800" : "bg-zinc-50"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <User size={14} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                    <span className={`text-xs font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{selectedTicket.user}</span>
                    <span className={`text-xs ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{selectedTicket.created}</span>
                  </div>
                  {selectedTicket.body ? (
                    <p className={`text-sm whitespace-pre-wrap ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      {selectedTicket.body}
                    </p>
                  ) : (
                    <p className={`text-sm italic ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                      لا يوجد نص مرفق مع هذه التذكرة — العنوان أعلاه هو كل ما أرسله العميل.
                    </p>
                  )}
                </div>

                {selectedTicket.assignee && (
                  <div className={`p-4 rounded-2xl border-s-4 border-royal ${isDark ? "bg-royal/10" : "bg-[#0B3D2E]/5"}`}>
                    <div className="flex items-center gap-2">
                      <SealCheck size={14} className="text-royal" weight="fill" />
                      <span className={`text-xs font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        مُسندة إلى {selectedTicket.assignee}
                      </span>
                      <span className={`text-xs ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                        آخر تحديث {selectedTicket.lastReply}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Reply area */}
              <div className={`p-6 border-t ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                {actionErr && (
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-rose-500">
                    <Warning size={13} weight="fill" /> {actionErr}
                  </p>
                )}
                <div className="flex gap-3">
                  <textarea
                    rows={3}
                    placeholder="اكتب ردك هنا..."
                    className={`flex-1 rounded-xl border px-4 py-3 text-sm outline-none resize-none transition ${
                      isDark ? "bg-zinc-800 border-white/[0.08] text-zinc-200 placeholder-zinc-600 focus:border-royal/40" : "bg-white border-zinc-200 text-zinc-800 placeholder-zinc-400 focus:border-royal/40"
                    }`}
                  />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedTicket.status}
                      onChange={(e) => updateTicketStatus(selectedTicket.id, e.target.value as TicketStatus)}
                      className={`text-xs rounded-lg border px-3 py-1.5 outline-none ${isDark ? "bg-zinc-800 border-white/[0.08] text-zinc-300" : "bg-white border-zinc-200 text-zinc-700"}`}
                    >
                      <option value="open">مفتوح</option>
                      <option value="inprogress">جارٍ</option>
                      <option value="resolved">محلول</option>
                      <option value="closed">مغلق</option>
                    </select>
                    <button className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition ${isDark ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}>
                      <Robot size={13} /> رد AI تلقائي
                    </button>
                  </div>
                  <button className="flex items-center gap-1.5 bg-[#0B3D2E] hover:bg-[#1a5c44] text-white text-xs font-bold px-4 py-2 rounded-xl transition">
                    <ArrowLeft size={13} /> إرسال الرد
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
