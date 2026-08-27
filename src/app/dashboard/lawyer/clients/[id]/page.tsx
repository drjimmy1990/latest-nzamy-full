"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  User, Buildings, ArrowRight, Gavel, ChatDots,
  CurrencyCircleDollar, Star, Phone, Clock, CheckCircle,
  Warning, ArrowClockwise, CalendarBlank, Scales, Notepad,
  CaretLeft, ShieldCheck,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { isSupabaseMode, apiGet } from "@/lib/services/api";
import type { LawyerClientApiRow } from "@/components/dashboard/lawyer/ClientDrawer";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClientFlag =
  | "vip" | "late_pay" | "bad" | "new" | "loyal" | "urgent" | "corporate" | "inactive";

/**
 * Nullable by design. `totalFees`, `paidFees` and `rating` are null when the
 * platform holds no such value — which is the case for every client who came in
 * through a platform account rather than through AddClientModal. The page must
 * omit those labels rather than print a 0 or a 3-star default: a fee balance
 * and a client rating are things a lawyer acts on.
 */
interface Client {
  id: string; name: string; type: "individual" | "company" | null;
  phone: string; email?: string; city?: string;
  activeRequests: number; closedRequests: number;
  totalFees: number | null; paidFees: number | null;
  since: string; lastContact: string;
  flags: ClientFlag[]; rating: number | null;
  notes?: string;
}

interface CaseRow {
  id: string; title: string;
  status: "active" | "pending" | "closed";
  degree: string; date: string;
}

interface ConsultationRow {
  id: string; title: string; date: string; status: "done" | "pending";
}

const FLAG_CONFIG: Record<ClientFlag, { label: string; color: string; bg: string; emoji: string }> = {
  vip:       { label: "VIP",         color: "text-amber-600",  bg: "bg-amber-500/10",  emoji: "👑" },
  late_pay:  { label: "متأخر",       color: "text-red-500",    bg: "bg-red-500/10",    emoji: "💸" },
  bad:       { label: "تعامل صعب",   color: "text-orange-600", bg: "bg-orange-500/10", emoji: "⚠️" },
  new:       { label: "جديد",        color: "text-blue-500",   bg: "bg-blue-500/10",   emoji: "🆕" },
  loyal:     { label: "دائم",        color: "text-emerald-500",bg: "bg-emerald-500/10",emoji: "🤝" },
  urgent:    { label: "قضية حرجة",   color: "text-red-600",    bg: "bg-red-600/10",    emoji: "🔴" },
  corporate: { label: "شركة",        color: "text-indigo-500", bg: "bg-indigo-500/10", emoji: "🏢" },
  inactive:  { label: "غير نشط",     color: "text-slate-400",  bg: "bg-slate-100",     emoji: "💤" },
};

const KNOWN_FLAGS: ClientFlag[] = [
  "vip", "late_pay", "bad", "new", "loyal", "urgent", "corporate", "inactive",
];
const isKnownFlag = (f: string): f is ClientFlag => (KNOWN_FLAGS as string[]).includes(f);

function mapRequestStatus(s: string | undefined): "active" | "pending" | "closed" {
  switch (s) {
    case "assigned":
    case "in_review":
      return "active";
    case "completed":
    case "cancelled":
      return "closed";
    default:
      return "pending";
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return String(iso);
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const params = useParams();
  const clientId = params.id as string;

  const [liveClient, setLiveClient] = useState<Client | null>(null);
  const [clientLoading, setClientLoading] = useState(true);
  const [clientError, setClientError] = useState<string | null>(null);

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [relatedError, setRelatedError] = useState<string | null>(null);

  // Calls /api/v1/lawyer/clients directly rather than through
  // getLawyerClients(), whose `catch { return []; }` turns any failure into an
  // empty list. Through that wrapper a database fault rendered this page as
  // «الموكّل غير موجود» — "no such client", which is a different and more
  // alarming statement than "we could not read the directory".
  const loadClient = useCallback(() => {
    if (!isSupabaseMode) {
      setClientLoading(false);
      return;
    }
    setClientLoading(true);
    setClientError(null);

    apiGet<LawyerClientApiRow[]>("/api/v1/lawyer/clients")
      .then((rows) => {
        const found = (Array.isArray(rows) ? rows : []).find((c) => c.id === clientId);
        if (!found) {
          setLiveClient(null);
          return;
        }
        setLiveClient({
          id: found.id,
          name: found.name || "عميل نظامي",
          // Only a manually-added client carries an entity type. Deriving
          // "individual" from the absence of one is a guess, so keep it null
          // and let the UI fall back to the neutral initial avatar.
          type: found.clientType,
          phone: found.phone ?? "",
          email: found.email ?? undefined,
          activeRequests: found.activeCount ?? 0,
          closedRequests: found.closedCount ?? 0,
          // null, not 0: the endpoint only knows fees for clients whose fee
          // agreement was typed into AddClientModal.
          totalFees: found.totalFees,
          paidFees: found.paidFees,
          since: "",
          // formatDate() returns «—» for a missing date; pass "" instead so the
          // «آخر نشاط» line is omitted rather than shown with a dash in it.
          lastContact: found.lastActivity ? formatDate(found.lastActivity) : "",
          flags: (found.flags ?? []).filter(isKnownFlag),
          rating: found.rating,
        });
      })
      .catch((e) => {
        console.error("[lawyer client detail] client fetch failed:", e);
        setClientError("تعذّر تحميل بيانات الموكّل.");
      })
      .finally(() => setClientLoading(false));
  }, [clientId]);

  // The client's own service requests (cases + consultations), by
  // requester_user_id.
  const loadRelated = useCallback(() => {
    if (!isSupabaseMode) return;
    setRelatedError(null);
    apiGet<{ data: any[]; total: number; degraded?: boolean }>("/api/v1/service-requests", {
      requester_user_id: clientId,
      limit: 100,
    })
      .then((res) => {
        // That route reports a failed query as HTTP 200 with
        // { data: [], degraded: true }, so the catch below never sees it and
        // the failure would otherwise be drawn as «لا توجد قضايا».
        if (res?.degraded) {
          setRelatedError("تعذّر تحميل القضايا والاستشارات المرتبطة.");
          return;
        }
        const rows = Array.isArray(res?.data) ? res.data : [];
        const caseRows: CaseRow[] = [];
        const consultRows: ConsultationRow[] = [];
        for (const r of rows) {
          const type = String(r.type ?? "").toLowerCase();
          const row = {
            id: String(r.id),
            title: String(r.title ?? "بدون عنوان"),
            status: mapRequestStatus(r.status),
            degree: String((r.metadata as any)?.degree ?? (r.metadata as any)?.court ?? "—"),
            date: formatDate(r.createdAt),
          };
          if (type === "consultation") {
            consultRows.push({
              id: row.id,
              title: row.title,
              date: row.date,
              status: row.status === "closed" ? "done" : "pending",
            });
          } else {
            caseRows.push(row);
          }
        }
        setCases(caseRows);
        setConsultations(consultRows);
      })
      .catch((e) => {
        console.error("[lawyer client detail] related fetch failed:", e);
        setRelatedError("تعذّر تحميل القضايا والاستشارات المرتبطة.");
      });
  }, [clientId]);

  useEffect(() => { loadClient(); loadRelated(); }, [loadClient, loadRelated]);

  // Notes state (local notepad — not persisted to backend yet).
  const [notes, setNotes] = useState<{id:string;text:string;ts:string;pinned:boolean}[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const addNote = () => {
    if (!noteInput.trim()) return;
    setNotes(prev => [{ id: `note-${Date.now()}`, text: noteInput.trim(), ts: "الآن", pinned: false }, ...prev]);
    setNoteInput("");
  };
  const togglePin = (id: string) => setNotes(prev => prev.map(n => n.id === id ? {...n, pinned: !n.pinned} : n));
  const deleteNote = (id: string) => setNotes(prev => prev.filter(n => n.id !== id));
  const sortedNotes = [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const client = liveClient;

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  if (clientLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3" dir="rtl">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
        <p className={isDark ? "text-zinc-500" : "text-slate-400"}>جاري تحميل بيانات الموكّل...</p>
      </div>
    );
  }

  // Two different outcomes, two different messages. A failed read must never be
  // reported as «الموكّل غير موجود» — that tells the lawyer the client is not on
  // the platform, which is a claim, not an error.
  if (clientError) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3" dir="rtl">
      <Warning size={40} weight="duotone" className="text-red-500" />
      <p className={`text-lg font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{clientError}</p>
      <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لم تنجح القراءة — هذا لا يعني أن الموكّل غير موجود.</p>
      <button onClick={loadClient} className="flex items-center gap-1.5 text-sm font-bold text-royal hover:underline">
        <ArrowClockwise size={14} /> إعادة المحاولة
      </button>
      <Link href="/dashboard/lawyer/clients" className="text-sm text-royal hover:underline flex items-center gap-1">
        <CaretLeft size={12} /> العودة لدليل الموكّلين
      </Link>
    </div>
  );

  if (!client) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3" dir="rtl">
      <User size={40} className={isDark ? "text-zinc-700" : "text-slate-300"} />
      <p className={`text-lg font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>الموكّل غير موجود</p>
      <Link href="/dashboard/lawyer/clients" className="text-sm text-royal hover:underline flex items-center gap-1">
        <CaretLeft size={12} /> العودة لدليل الموكّلين
      </Link>
    </div>
  );

  // null when no fee agreement is on record — every fee-derived figure on this
  // page is gated on that, rather than falling back to «0 ﷼ / مسدّدة بالكامل».
  const hasFees = client.totalFees !== null && client.paidFees !== null;
  const unpaid = hasFees ? (client.totalFees as number) - (client.paidFees as number) : null;
  const payPct = hasFees && (client.totalFees as number) > 0
    ? Math.round(((client.paidFees as number) / (client.totalFees as number)) * 100)
    : null;
  const hasBad = client.flags.includes("bad");
  const hasLatePay = client.flags.includes("late_pay");

  const STATUS_CASE = {
    active:  { label: "نشطة",  dot: "bg-emerald-500", text: "text-emerald-500" },
    pending: { label: "معلقة", dot: "bg-amber-500",    text: "text-amber-500" },
    closed:  { label: "مغلقة", dot: "bg-slate-400",    text: "text-slate-400" },
  };

  return (
    <div className="max-w-[1100px] mx-auto space-y-5 pb-10" dir="rtl">

      {/* Breadcrumb */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-1.5 text-[12px]">
        <Link href="/dashboard/lawyer/clients" className={`hover:underline ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
          الموكّلون
        </Link>
        <CaretLeft size={10} className={isDark ? "text-zinc-700" : "text-slate-300"} />
        <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{client.name}</span>
      </motion.div>

      {/* Related-fetch error banner */}
      {relatedError && (
        <div className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
          <Warning size={18} className="text-red-500 flex-shrink-0" />
          <p className={`text-[12px] font-semibold flex-1 ${isDark ? "text-red-400" : "text-red-600"}`}>
            {relatedError} — القوائم أدناه فارغة لأن القراءة فشلت، لا لأنه لا توجد بيانات.
          </p>
          <button onClick={loadRelated} className="flex items-center gap-1.5 text-[11px] font-bold text-red-500 hover:underline flex-shrink-0">
            <ArrowClockwise size={13} /> إعادة المحاولة
          </button>
        </div>
      )}

      {/* ── Hero Card ─────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className={`${card} overflow-hidden`}>
        <div className={`h-1.5 w-full ${client.flags.includes("vip") ? "bg-gradient-to-l from-amber-400 to-amber-600" : client.flags.includes("bad") ? "bg-gradient-to-l from-orange-400 to-red-500" : "bg-gradient-to-l from-[#0B3D2E] to-[#1a6b4e]"}`} />

        <div className="p-5 flex flex-col sm:flex-row gap-5">
          <div className="flex items-start gap-4 flex-1">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl font-black shadow-sm ${client.type === "company" ? "bg-indigo-500/10 text-indigo-500" : hasBad ? "bg-orange-500/10 text-orange-500" : "bg-[#0B3D2E]/10 text-[#0B3D2E] dark:text-emerald-400"}`}>
              {client.type === "company" ? <Buildings size={28} weight="duotone" /> : client.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className={`text-xl font-black ${isDark ? "text-white" : "text-slate-800"}`}
                  style={{ fontFamily: "var(--font-brand)" }}>{client.name}</h1>
                {/* Stars only when the lawyer actually rated this client
                    (AddClientModal step 2 is the only source). */}
                {client.rating !== null && (
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={11} weight={i < (client.rating ?? 0) ? "fill" : "regular"}
                        className={i < (client.rating ?? 0) ? "text-amber-400" : isDark ? "text-zinc-700" : "text-slate-200"} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {client.flags.map(f => {
                  const fc = FLAG_CONFIG[f];
                  return (
                    <span key={f} className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${fc.bg} ${fc.color}`}>
                      {fc.emoji} {fc.label}
                    </span>
                  );
                })}
              </div>
              <div className={`flex flex-wrap gap-4 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {client.phone && <span className="flex items-center gap-1"><Phone size={10} /> {client.phone}</span>}
                {client.email && <span className="flex items-center gap-1 dir-ltr">{client.email}</span>}
                {client.lastContact && (
                  <span className="flex items-center gap-1"><CalendarBlank size={10} /> آخر نشاط: {client.lastContact}</span>
                )}
              </div>
            </div>
          </div>
          {/* «تسجيل ملاحظة» and «فتح محادثة» used to sit here with no onClick at
              all. The notes panel further down is the working control; there is
              no messaging surface between a lawyer and a client in the repo, so
              the chat button is removed rather than left as a dead promise. */}
        </div>
      </motion.div>

      {/* ── KPI Stats ─────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          // «قضايا نشطة» renamed: the number is a count of in-flight service
          // requests, which is what the endpoint computes. Nothing in the repo
          // writes the `cases` table, so this was never a case count.
          { icon: Gavel,             label: "طلبات نشطة",   value: client.activeRequests, color: "text-emerald-500", sub: `${client.closedRequests} مغلقة` },
          // An «العقود ٠ · ٠ نشط» tile used to sit here, counting a
          // `const contracts = []` that nothing ever fills: there is no
          // per-client contracts backend. A zero from a hardcoded empty array
          // is the same fabrication as the fee tile below, so it goes too.
          { icon: ChatDots,          label: "الاستشارات",    value: consultations.length, color: "text-blue-500", sub: "مسجّلة" },
          // The fee tile appears only for a client with a fee agreement on
          // record. It used to render «0 ﷼ · مسدّدة بالكامل» for every client
          // on the platform, off two hardcoded zeros.
          ...(hasFees ? [{
            icon: CurrencyCircleDollar,
            label: "إجمالي الأتعاب",
            value: `${(client.totalFees as number).toLocaleString()} ﷼`,
            color: (unpaid ?? 0) > 0 ? "text-red-500" : "text-emerald-500",
            sub: (unpaid ?? 0) > 0 ? `متبقي ${(unpaid as number).toLocaleString()} ﷼` : "مسدّدة بالكامل",
          }] : []),
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.04 }}
            className={`${card} p-4`}>
            <div className="flex items-start justify-between mb-2">
              <kpi.icon size={18} className={kpi.color} weight="duotone" />
            </div>
            <p className={`text-xl font-black mb-0.5 ${isDark ? "text-white" : "text-slate-800"}`}>{kpi.value}</p>
            <p className={`text-[10px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{kpi.label}</p>
            <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>{kpi.sub}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Main Grid ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column: Cases + Contracts + Consultations */}
        <div className="lg:col-span-2 space-y-4">

          {/* Cases */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}
            className={`${card} overflow-hidden`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <div className="flex items-center gap-2">
                <Gavel size={15} className="text-[#0B3D2E] dark:text-emerald-400" weight="duotone" />
                <span className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-700"}`}>القضايا</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500"}`}>{cases.length}</span>
              </div>
              <Link href={`/dashboard/lawyer/cases?client=${clientId}`}
                className={`text-[11px] font-semibold flex items-center gap-0.5 ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-royal"}`}>
                عرض الكل <ArrowRight size={10} />
              </Link>
            </div>
            {cases.length === 0 ? (
              <div className="p-8 text-center">
                <Scales size={28} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} weight="duotone" />
                <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد قضايا</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04] dark:divide-white/[0.04]">
                {cases.map(c => {
                  const st = STATUS_CASE[c.status];
                  return (
                    <Link key={c.id} href={`/dashboard/lawyer/cases/${c.id}`}
                      className={`flex items-center gap-3 px-4 py-3 hover:bg-royal/[0.03] transition-colors group`}>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{c.title}</p>
                        <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{c.degree} · {c.date}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${isDark ? "bg-white/[0.06]" : "bg-slate-100"} ${st.text}`}>{st.label}</span>
                      <ArrowRight size={12} className={`flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? "text-zinc-500" : "text-slate-400"}`} />
                    </Link>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* A «العقود» card used to sit here: a header counting the same
              hardcoded empty `contracts` array, an «عرض الكل» link, and a
              permanent «لا توجد عقود» body. There is no per-client contracts
              backend for it to ever show anything — an empty state for a
              feature that does not exist is a promise, so the card is gone. */}

          {/* Consultations */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
            className={`${card} overflow-hidden`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <div className="flex items-center gap-2">
                <ChatDots size={15} className="text-blue-500" weight="duotone" />
                <span className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-700"}`}>الاستشارات</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500"}`}>{consultations.length}</span>
              </div>
            </div>
            {consultations.length === 0 ? (
              <div className="p-8 text-center">
                <ChatDots size={28} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} weight="duotone" />
                <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد استشارات</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {/* The green check used to be drawn on every row regardless of
                    status — a pending consultation shown as done. `q.status` is
                    computed from the request's real status; use it. */}
                {consultations.map(q => (
                  <div key={q.id} className="flex items-center gap-3 px-4 py-3">
                    {q.status === "done"
                      ? <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" weight="duotone" />
                      : <Clock size={14} className="text-amber-500 flex-shrink-0" weight="duotone" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{q.title}</p>
                      <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        {q.status === "done" ? "منتهية" : "قيد الانتظار"}{q.date ? ` · ${q.date}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Right column: Payment + Risk */}
        <div className="space-y-4">

          {/* The «الإيرادات (٦ أشهر)» sparkline that used to sit here is gone.
              It plotted `const revenue = [0,0,0,0,0,0]` under a «0 ﷼» headline
              and a rising-trend arrow: six months of revenue history for a
              platform through which no money has ever moved. There is no
              per-client revenue series to plot, so the chart is removed rather
              than drawn flat — a flat line is still a claim about six months. */}

          {/* Payment status — only for a client with a fee agreement on record.
              Note this is the agreed fee the lawyer typed in, not a payment
              record: no payment provider has ever been connected. */}
          {hasFees && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={`${card} p-4`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>الأتعاب المتفق عليها</p>
            <div className="flex items-end justify-between mb-2">
              <div>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>مسدّد</p>
                <p className={`text-base font-black ${isDark ? "text-white" : "text-slate-800"}`}>{(client.paidFees as number).toLocaleString()} <span className="text-[10px] font-normal">﷼</span></p>
              </div>
              {(unpaid ?? 0) > 0 && (
                <div className="text-left">
                  <p className="text-[11px] text-red-400">متبقٍ</p>
                  <p className="text-base font-black text-red-500">{(unpaid as number).toLocaleString()} <span className="text-[10px] font-normal">﷼</span></p>
                </div>
              )}
            </div>
            {payPct !== null && (
              <>
                <div className={`h-3 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                  <div
                    className={`h-full rounded-full transition-all ${payPct === 100 ? "bg-emerald-500" : payPct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${payPct}%` }} />
                </div>
                <div className="flex justify-between mt-1">
                  <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>٠</p>
                  <p className={`text-[9px] font-bold ${payPct === 100 ? "text-emerald-500" : payPct >= 50 ? "text-amber-500" : "text-red-500"}`}>{payPct}% مسدّد</p>
                </div>
              </>
            )}
            <p className={`text-[9px] mt-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              أرقام مُدخَلة يدوياً عند إضافة الموكّل — لا يوجد سجل مدفوعات في النظام.
            </p>
          </motion.div>
          )}

          {/* Risk / health — every row here is either a flag the lawyer ticked or
              a real timestamp. «منخفضة ✓» for payment risk and a default
              3-star rating used to be printed for clients who had never been
              classified at all; an unclassified client now reads as such. */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
            className={`${card} p-4`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>تقييم التعامل</p>
            <div className="space-y-2">
              {[
                { label: "مستوى الأولوية",   value: client.flags.includes("vip") ? "VIP 👑" : client.flags.includes("urgent") ? "حرج 🔴" : "لم يُصنَّف",  color: client.flags.includes("vip") ? "text-amber-500" : client.flags.includes("urgent") ? "text-red-500" : isDark ? "text-zinc-400" : "text-slate-600" },
                { label: "مخاطر السداد",     value: hasLatePay ? "مرتفعة ⚠️" : "لم تُصنَّف",  color: hasLatePay ? "text-red-500" : isDark ? "text-zinc-400" : "text-slate-600" },
                ...(client.lastContact ? [{ label: "آخر نشاط", value: client.lastContact, color: isDark ? "text-zinc-300" : "text-slate-700" }] : []),
                ...(client.rating !== null ? [{ label: "التقييم", value: `${"★".repeat(client.rating)}${"☆".repeat(5 - client.rating)}`, color: "text-amber-400" }] : []),
              ].map((row, i) => (
                <div key={i} className={`flex items-center justify-between py-1.5 border-b ${isDark ? "border-white/[0.04]" : "border-slate-100"} last:border-0`}>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{row.label}</p>
                  <p className={`text-[11px] font-bold ${row.color}`}>{row.value}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Compliance. Shown only when an entity type is actually on record —
              the previous version treated "no type" as "natural person", and
              called every company «كيان قانوني موثّق» although the platform
              verifies nothing about a manually-added client. */}
          {client.type !== null && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }}
            className={`${card} p-4 flex items-start gap-3`}>
            <ShieldCheck size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" weight="duotone" />
            <div>
              <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>نوع الكيان</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {client.type === "company" ? "شركة / كيان اعتباري — كما أُدخل عند إضافة الموكّل" : "شخص طبيعي — كما أُدخل عند إضافة الموكّل"}
              </p>
            </div>
          </motion.div>
          )}

          {/* Notes */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
            className={`${card} overflow-hidden`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <div className="flex items-center gap-2">
                <Notepad size={15} className="text-amber-500" weight="duotone" />
                <span className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-700"}`}>الملاحظات</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"}`}>{notes.length}</span>
              </div>
            </div>

            {/* Say plainly that this notepad is not storage. `notes` is React
                state and nothing else: there is no client-notes column or
                endpoint in the repo, so everything typed here is gone on
                refresh. Relabelled rather than removed — the panel is still
                useful within one sitting, as long as it does not pretend to
                keep what a lawyer writes about a client. */}
            <div className={`px-4 py-2 text-[10px] border-b ${isDark ? "border-white/[0.05] bg-amber-500/[0.06] text-amber-400" : "border-slate-100 bg-amber-50 text-amber-700"}`}>
              ملاحظات مؤقتة داخل هذه الجلسة فقط — لا تُحفظ في النظام وتُفقد عند تحديث الصفحة.
            </div>

            <div className="p-4">
              <div className={`flex flex-col gap-2 p-3 rounded-xl border ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-slate-200 bg-slate-50"}`}>
                <textarea
                  value={noteInput} onChange={e => setNoteInput(e.target.value)}
                  placeholder="أضف ملاحظة جديدة..."
                  onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) addNote(); }}
                  rows={2}
                  className={`w-full bg-transparent text-[12px] outline-none resize-none ${isDark ? "text-zinc-300 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`}
                />
                <div className="flex items-center justify-between">
                  <p className={`text-[9px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>Ctrl+Enter للإضافة</p>
                  <button onClick={addNote}
                    disabled={!noteInput.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-bold hover:bg-amber-600 disabled:opacity-40 transition-all">
                    إضافة
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {sortedNotes.length === 0 && (
                  <p className={`text-center text-[11px] py-4 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد ملاحظات بعد</p>
                )}
                {sortedNotes.map(note => (
                  <motion.div key={note.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className={`relative p-3 rounded-xl border text-[11px] leading-relaxed transition-all ${note.pinned ? isDark ? "border-amber-500/25 bg-amber-500/[0.06]" : "border-amber-200 bg-amber-50" : isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-white"}`}>
                    {note.pinned && (
                      <span className="absolute top-2 left-2 text-[8px] font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">تم تثبيته</span>
                    )}
                    <p className={`mb-1.5 ${note.pinned ? "font-semibold" : ""} ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{note.text}</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{note.ts}</span>
                      <div className="flex gap-1">
                        <button onClick={() => togglePin(note.id)}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition-all ${note.pinned ? "text-amber-500 hover:bg-amber-500/10" : isDark ? "text-zinc-600 hover:text-amber-400" : "text-slate-400 hover:text-amber-500"}`}>
                          {note.pinned ? "۝" : "★"}
                        </button>
                        <button onClick={() => deleteNote(note.id)}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition-all ${isDark ? "text-zinc-700 hover:text-red-400" : "text-slate-300 hover:text-red-500"}`}>
                          ×
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

        </div>
      </div>

    </div>
  );
}