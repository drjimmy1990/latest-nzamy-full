"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ticket, MagnifyingGlass, ArrowLeft, Clock, CheckCircle,
  Warning, X, ChatCircle, User, Robot, Fire, SealCheck,
  CaretDown, ArrowsClockwise,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────
type TicketStatus  = "open" | "inprogress" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "critical";

interface SupportTicket {
  id: string;
  user: string;
  userType: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  created: string;
  lastReply: string;
  messages: number;
  assignee?: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const TICKETS: SupportTicket[] = [
  { id: "TKT-2041", user: "محمد العتيبي",    userType: "عميل فرد",     subject: "لا أستطيع الوصول إلى صفحة قضاياي بعد التحديث",         category: "تقني",      status: "open",       priority: "high",     created: "منذ ٣٠ دقيقة", lastReply: "منذ ٣٠ دقيقة", messages: 1 },
  { id: "TKT-2040", user: "شركة الخبرة القانونية", userType: "شركة محاماة", subject: "طلب ترقية الخطة من PRO إلى Enterprise",            category: "اشتراك",   status: "inprogress", priority: "medium",   created: "منذ ساعتين",   lastReply: "منذ ساعة",    messages: 4, assignee: "فريق الدعم" },
  { id: "TKT-2039", user: "سارة الزهراني",   userType: "محامي",        subject: "الفاتورة الشهرية تعرض مبلغاً خاطئاً",                   category: "اشتراك",   status: "inprogress", priority: "medium",   created: "منذ ٤ ساعات",  lastReply: "منذ ساعتين", messages: 6, assignee: "فريق المالية" },
  { id: "TKT-2038", user: "شركة نماء",       userType: "شركة/مؤسسة",  subject: "حذف بيانات القسم القانوني بالخطأ — استعادة عاجلة",      category: "تقني",      status: "open",       priority: "critical", created: "منذ ٥ ساعات",  lastReply: "منذ ٥ ساعات", messages: 1 },
  { id: "TKT-2037", user: "خالد الدوسري",    userType: "مزود خدمة",   subject: "لم أستلم مدفوعاتي منذ أسبوعين",                        category: "مالي",      status: "open",       priority: "high",     created: "منذ يوم",      lastReply: "منذ يوم",     messages: 2 },
  { id: "TKT-2036", user: "نورة السبيعي",    userType: "محامي",        subject: "استفسار عن آلية التحقق من شهادة المحامي",               category: "عام",       status: "resolved",   priority: "low",      created: "منذ ٣ أيام",   lastReply: "منذ يومين",   messages: 8, assignee: "دعم العملاء" },
  { id: "TKT-2035", user: "فهد العتيبي",     userType: "محامي فردي",  subject: "أداة الصائغ القانوني لا تُنتج مستندات PDF",             category: "تقني",      status: "resolved",   priority: "medium",   created: "منذ ٤ أيام",   lastReply: "منذ ٣ أيام", messages: 5, assignee: "فريق المنتج" },
  { id: "TKT-2034", user: "منشأة الرياض",    userType: "منشأة صغيرة", subject: "عدم ظهور صفحة اشتراطات الترخيص",                       category: "تقني",      status: "closed",     priority: "low",      created: "منذ أسبوع",    lastReply: "منذ ٥ أيام", messages: 3 },
];

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
    category: row.category ?? "عام",
    status: DB_STATUS_TO_PAGE[row.status ?? "open"] ?? "open",
    priority: DB_PRIORITY_TO_PAGE[row.priority ?? "normal"] ?? "medium",
    created: timeAgo(row.created_at),
    lastReply: timeAgo(row.updated_at ?? row.created_at),
    messages: 1,
    ...(assignee ? { assignee } : {}),
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminTicketsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  // Fetch tickets from the API; fall back to the mock TICKETS on empty/error.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/v1/admin/tickets");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data?: SupportTicketRow[] };
        const rows = json.data ?? [];
        if (!active) return;
        setTickets(rows.length > 0 ? rows.map(rowToTicket) : TICKETS);
      } catch {
        if (active) setTickets(TICKETS);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Persist a status change to the API, then update local state optimistically.
  async function updateTicketStatus(ticketId: string, next: TicketStatus) {
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: next } : t)),
    );
    setSelectedTicket((cur) =>
      cur && cur.id === ticketId ? { ...cur, status: next } : cur,
    );
    try {
      await fetch(`/api/v1/admin/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: PAGE_STATUS_TO_DB[next] }),
      });
    } catch {
      // best-effort; local optimistic state stays
    }
  }

  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-zinc-100"}`;

  const filtered = tickets
    .filter(t => statusFilter === "all" || t.status === statusFilter)
    .filter(t => search === "" || t.subject.includes(search) || t.user.includes(search) || t.id.includes(search));

  const COUNTS = {
    all: tickets.length,
    open: tickets.filter(t => t.status === "open").length,
    inprogress: tickets.filter(t => t.status === "inprogress").length,
    resolved: tickets.filter(t => t.status === "resolved").length,
    closed: tickets.filter(t => t.status === "closed").length,
  };

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
            <p className={`text-2xl font-black font-mono ${isDark ? "text-white" : "text-zinc-900"}`}>
              {COUNTS[s]}
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
          {filtered.map((ticket, i) => {
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

                {/* Messages */}
                <span className={`flex items-center gap-1 text-[12px] self-center ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  <ChatCircle size={13} />
                  {ticket.messages}
                </span>
              </motion.button>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-5 py-12 text-center">
              <Ticket size={40} className={`mx-auto mb-3 opacity-30 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} weight="duotone" />
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>لا توجد تذاكر</p>
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

              {/* Chat-style */}
              <div className="p-6 space-y-4 max-h-80 overflow-y-auto">
                <div className={`p-4 rounded-2xl ${isDark ? "bg-zinc-800" : "bg-zinc-50"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <User size={14} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                    <span className={`text-xs font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{selectedTicket.user}</span>
                    <span className={`text-xs ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{selectedTicket.created}</span>
                  </div>
                  <p className={`text-sm ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    مرحباً، أواجه مشكلة في: {selectedTicket.subject.toLowerCase()}. أرجو المساعدة في أقرب وقت.
                  </p>
                </div>

                {selectedTicket.assignee && (
                  <div className={`p-4 rounded-2xl border-s-4 border-royal ${isDark ? "bg-royal/10" : "bg-[#0B3D2E]/5"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <SealCheck size={14} className="text-royal" weight="fill" />
                      <span className={`text-xs font-bold text-royal`}>{selectedTicket.assignee}</span>
                      <span className={`text-xs ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{selectedTicket.lastReply}</span>
                    </div>
                    <p className={`text-sm ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      تم استلام تذكرتك. فريقنا يعمل على حل المشكلة وسنردّ عليك في أقرب وقت.
                    </p>
                  </div>
                )}
              </div>

              {/* Reply area */}
              <div className={`p-6 border-t ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
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
