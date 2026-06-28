"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  User, Buildings, ArrowRight, Gavel, FileText, ChatDots,
  CurrencyCircleDollar, Star, Phone, Clock, CheckCircle,
  Warning, ArrowUpRight, CalendarBlank, Scales, Notepad,
  PaperclipHorizontal, CaretLeft, ShieldCheck,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { isSupabaseMode } from "@/lib/services/api";
import { getLawyerClients, type LawyerClient } from "@/lib/services/lawyerClientsService";

// ─── Shared mock data (same as clients/page.tsx) ─────────────────────────────

type ClientFlag =
  | "vip" | "late_pay" | "bad" | "new" | "loyal" | "urgent" | "corporate" | "inactive";

interface Client {
  id: string; name: string; type: "individual" | "company";
  phone: string; email?: string; city?: string;
  activeCases: number; closedCases: number;
  totalFees: number; paidFees: number;
  since: string; lastContact: string;
  flags: ClientFlag[]; rating: 1 | 2 | 3 | 4 | 5;
  notes?: string;
}

const MOCK_CLIENTS: Client[] = [
  { id: "1", name: "شركة الأفق للتجارة", type: "company", phone: "+٩٦٦ ١١ ٥١٢ ٠٠١٢", email: "legal@horizon.sa", city: "الرياض", activeCases: 2, closedCases: 1, totalFees: 85000, paidFees: 60000, since: "يناير ٢٠٢٤", lastContact: "منذ يومين", flags: ["vip","corporate","urgent"], rating: 5, notes: "العميل الأكبر — يتطلب اهتماماً دورياً أسبوعياً" },
  { id: "2", name: "أحمد الزاهد", type: "individual", phone: "+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧", email: "ahmed@mail.com", city: "جدة", activeCases: 1, closedCases: 0, totalFees: 12000, paidFees: 12000, since: "مارس ٢٠٢٤", lastContact: "منذ أسبوع", flags: ["loyal","new"], rating: 4 },
  { id: "3", name: "خالد محمد القحطاني", type: "individual", phone: "+٩٦٦ ٥٥ ٦٧٨ ٩٠١٢", city: "الرياض", activeCases: 1, closedCases: 2, totalFees: 28000, paidFees: 14000, since: "فبراير ٢٠٢٤", lastContact: "اليوم", flags: ["late_pay","urgent"], rating: 3, notes: "متأخر ١٤،٠٠٠ ريال — أُرسلت له تذكيران بدون رد" },
  { id: "4", name: "سارة الدوسري", type: "individual", phone: "+٩٦٦ ٥٠ ٢٣٤ ٥٦٧٨", email: "sara@mail.com", city: "الدمام", activeCases: 1, closedCases: 0, totalFees: 9500, paidFees: 9500, since: "أبريل ٢٠٢٤", lastContact: "منذ ٣ أيام", flags: ["new"], rating: 4 },
  { id: "5", name: "ريم المطيري", type: "individual", phone: "+٩٦٦ ٥٥ ٣٤٥ ٦٧٨٩", city: "مكة", activeCases: 1, closedCases: 0, totalFees: 14000, paidFees: 0, since: "نوفمبر ٢٠٢٣", lastContact: "منذ شهر", flags: ["bad","late_pay","inactive"], rating: 1, notes: "لا يرد على الهاتف — متأخر بكامل الأتعاب" },
  { id: "6", name: "علي السبيعي", type: "individual", phone: "+٩٦٦ ٥٠ ٤٥٦ ٧٨٩٠", city: "الرياض", activeCases: 0, closedCases: 1, totalFees: 6000, paidFees: 6000, since: "يوليو ٢٠٢٣", lastContact: "منذ شهرين", flags: ["inactive","loyal"], rating: 4 },
  { id: "7", name: "مجموعة الرياض العقارية", type: "company", phone: "+٩٦٦ ١١ ٥٦٧ ٨٩٠١", email: "info@riyadhgroup.sa", city: "الرياض", activeCases: 0, closedCases: 3, totalFees: 120000, paidFees: 120000, since: "مارس ٢٠٢٣", lastContact: "منذ شهر", flags: ["vip","corporate","loyal","inactive"], rating: 5, notes: "صفقات كبيرة — التواصل مع إدارة الشركة مباشرة" },
];

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

// Mock related data per client
const MOCK_CASES: Record<string, { id: string; title: string; status: "active" | "pending" | "closed"; degree: string; date: string }[]> = {
  "1": [
    { id: "c1", title: "نزاع تجاري — شركة الأفق", status: "active", degree: "ابتدائي", date: "٢٠ أبريل ٢٠٢٦" },
    { id: "c2", title: "استئناف العقد ٢١٣", status: "active", degree: "استئناف", date: "١٠ مايو ٢٠٢٦" },
    { id: "c3", title: "قضية فسخ عقد إيجار", status: "closed", degree: "ابتدائي", date: "يناير ٢٠٢٤" },
  ],
  "3": [
    { id: "c4", title: "قضية عمالية — فصل تعسفي", status: "active", degree: "ابتدائي", date: "٥ مايو ٢٠٢٦" },
    { id: "c5", title: "نزاع ميراث", status: "closed", degree: "ابتدائي", date: "مارس ٢٠٢٤" },
    { id: "c6", title: "قضية تعويض", status: "closed", degree: "استئناف", date: "يونيو ٢٠٢٤" },
  ],
  "7": [
    { id: "c7", title: "عقد تطوير عقاري", status: "closed", degree: "ابتدائي", date: "أبريل ٢٠٢٣" },
    { id: "c8", title: "نزاع مستأجر", status: "closed", degree: "ابتدائي", date: "أغسطس ٢٠٢٣" },
    { id: "c9", title: "دعوى استرداد", status: "closed", degree: "عليا", date: "نوفمبر ٢٠٢٣" },
  ],
};

const MOCK_CONTRACTS: Record<string, { id: string; title: string; status: "active" | "expired" | "draft"; value: number; date: string }[]> = {
  "1": [
    { id: "k1", title: "عقد توكيل قضائي شامل", status: "active", value: 45000, date: "يناير ٢٠٢٤" },
    { id: "k2", title: "اتفاقية خدمات مستمرة", status: "active", value: 24000, date: "مارس ٢٠٢٤" },
  ],
  "7": [
    { id: "k3", title: "عقد تمثيل قانوني", status: "expired", value: 80000, date: "مارس ٢٠٢٣" },
    { id: "k4", title: "ملحق توكيل خاص", status: "expired", value: 40000, date: "يونيو ٢٠٢٣" },
  ],
};

const MOCK_CONSULTATIONS: Record<string, { id: string; title: string; date: string; status: "done" | "pending" }[]> = {
  "1": [
    { id: "q1", title: "استشارة عقد توريد", date: "مارس ٢٠٢٤", status: "done" },
    { id: "q2", title: "مراجعة علاقات العمل", date: "أبريل ٢٠٢٤", status: "done" },
  ],
  "2": [
    { id: "q3", title: "استشارة قانون الأسرة", date: "أبريل ٢٠٢٤", status: "done" },
  ],
};

// Mini sparkline revenue data per client (6 months)
const REVENUE_DATA: Record<string, number[]> = {
  "1": [8000, 12000, 15000, 10000, 18000, 22000],
  "2": [0, 4000, 4000, 4000, 0, 0],
  "3": [5000, 0, 3000, 6000, 0, 0],
  "4": [0, 9500, 0, 0, 0, 0],
  "5": [0, 0, 0, 0, 0, 0],
  "6": [6000, 0, 0, 0, 0, 0],
  "7": [0, 40000, 35000, 28000, 17000, 0],
};

const MONTHS = ["نوف", "ديس", "يناير", "فبر", "مارس", "أبريل"];

// ─── Sparkline Component ───────────────────────────────────────────────────────

function Sparkline({ data, isDark }: { data: number[]; isDark: boolean }) {
  const max = Math.max(...data, 1);
  const w = 280; const h = 80; const pad = 8;
  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (w - 2 * pad));
  const ys = data.map(v => h - pad - ((v / max) * (h - 2 * pad)));
  const pathD = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${ys[i]}`).join(" ");
  const areaD = `${pathD} L ${xs[xs.length-1]} ${h} L ${xs[0]} ${h} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C8A762" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#C8A762" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#sparkGrad)" />
      <path d={pathD} fill="none" stroke="#C8A762" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {xs.map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={ys[i]} r="3" fill="#C8A762" />
          <text x={x} y={h + 2} textAnchor="middle" fontSize="7" fill={isDark ? "#52525b" : "#94a3b8"} fontFamily="inherit">{MONTHS[i]}</text>
          {data[i] > 0 && (
            <text x={x} y={ys[i] - 6} textAnchor="middle" fontSize="7" fill={isDark ? "#a1a1aa" : "#64748b"} fontFamily="inherit">
              {data[i] >= 1000 ? `${(data[i]/1000).toFixed(0)}k` : data[i]}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [liveClient, setLiveClient] = useState<Client | null>(null);
  const [liveCases, setLiveCases] = useState<typeof MOCK_CASES[string] | null>(null);
  const [liveContracts, setLiveContracts] = useState<typeof MOCK_CONTRACTS[string] | null>(null);
  const [liveConsultations, setLiveConsultations] = useState<typeof MOCK_CONSULTATIONS[string] | null>(null);

  useEffect(() => {
    if (!isSupabaseMode) return;
    // The /api/v1/lawyer/clients route returns a bare array (no `data` wrapper),
    // so use the typed service instead of a hand-rolled apiGet.
    getLawyerClients()
      .then((clients: LawyerClient[]) => {
        const found = clients.find((c) => c.id === clientId);
        if (!found) return;
        // Map the lean LawyerClient shape to the richer Client shape used by this page.
        // Fee/case counts are not returned by the clients endpoint, so default to 0
        // (honest empty state) rather than showing mock fee figures.
        const mapped: Client = {
          id: found.id,
          name: found.name,
          type: found.userType === "company" || found.userType === "business" ? "company" : "individual",
          phone: found.phone ?? "",
          email: found.email ?? undefined,
          activeCases: found.activeCount ?? 0,
          closedCases: 0,
          totalFees: 0,
          paidFees: 0,
          since: "",
          lastContact: found.lastActivity ?? "",
          flags: [],
          rating: 3,
        };
        setLiveClient(mapped);
      })
      .catch(() => {});
    // Additional endpoints for cases/contracts/consultations can be wired here:
    // apiGet("/api/v1/cases", { client_id: clientId }).then(...);
    // apiGet("/api/v1/contracts", { client_id: clientId }).then(...);
    // apiGet("/api/v1/consultations", { client_id: clientId }).then(...);
  }, [clientId]);

  // Notes state
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

  const client = useMemo(() => liveClient ?? MOCK_CLIENTS.find(c => c.id === clientId), [clientId, liveClient]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  if (!client) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3" dir="rtl">
      <User size={40} className={isDark ? "text-zinc-700" : "text-slate-300"} />
      <p className={isDark ? "text-zinc-500" : "text-slate-400"}>الموكّل غير موجود</p>
      <Link href="/dashboard/lawyer/clients" className="text-sm text-royal hover:underline flex items-center gap-1">
        <CaretLeft size={12} /> العودة لدليل الموكّلين
      </Link>
    </div>
  );

  const unpaid = client.totalFees - client.paidFees;
  const payPct = client.totalFees ? Math.round((client.paidFees / client.totalFees) * 100) : 100;
  // Per-client cases/contracts/consultations endpoints aren't wired yet, so
  // show an honest empty state (no mock fallback that fakes real data).
  const cases = liveCases ?? [];
  const contracts = liveContracts ?? [];
  const consultations = liveConsultations ?? [];
  const revenue = REVENUE_DATA[clientId] ?? [0,0,0,0,0,0];
  const totalRevenue = revenue.reduce((a, b) => a + b, 0);
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

      {/* ── Hero Card ─────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className={`${card} overflow-hidden`}>

        {/* Top gradient bar */}
        <div className={`h-1.5 w-full ${client.flags.includes("vip") ? "bg-gradient-to-l from-amber-400 to-amber-600" : client.flags.includes("bad") ? "bg-gradient-to-l from-orange-400 to-red-500" : "bg-gradient-to-l from-[#0B3D2E] to-[#1a6b4e]"}`} />

        <div className="p-5 flex flex-col sm:flex-row gap-5">

          {/* Avatar + Name */}
          <div className="flex items-start gap-4 flex-1">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl font-black shadow-sm ${client.type === "company" ? "bg-indigo-500/10 text-indigo-500" : hasBad ? "bg-orange-500/10 text-orange-500" : "bg-[#0B3D2E]/10 text-[#0B3D2E] dark:text-emerald-400"}`}>
              {client.type === "company" ? <Buildings size={28} weight="duotone" /> : client.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className={`text-xl font-black ${isDark ? "text-white" : "text-slate-800"}`}
                  style={{ fontFamily: "var(--font-brand)" }}>{client.name}</h1>
                {/* Stars */}
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={11} weight={i < client.rating ? "fill" : "regular"}
                      className={i < client.rating ? "text-amber-400" : isDark ? "text-zinc-700" : "text-slate-200"} />
                  ))}
                </div>
              </div>
              {/* Flags */}
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
              {/* Contact info */}
              <div className={`flex flex-wrap gap-4 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                <span className="flex items-center gap-1"><Phone size={10} /> {client.phone}</span>
                {client.email && <span className="flex items-center gap-1 dir-ltr">{client.email}</span>}
                {client.city && <span className="flex items-center gap-1">📍 {client.city}</span>}
                <span className="flex items-center gap-1"><Clock size={10} /> عميل منذ {client.since}</span>
                <span className={`flex items-center gap-1 font-semibold ${isDark ? "text-zinc-400" : "text-slate-600"}`}><CalendarBlank size={10} /> آخر تواصل: {client.lastContact}</span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-col gap-2 flex-shrink-0 self-start">
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
              <Notepad size={13} /> تسجيل ملاحظة
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold border border-[#0B3D2E]/20 text-[#0B3D2E] dark:text-emerald-400 dark:border-emerald-500/20 hover:bg-[#0B3D2E]/5 transition-colors">
              <ChatDots size={13} /> فتح محادثة
            </button>
            {unpaid > 0 && (
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold border border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/5 transition-colors">
                <CurrencyCircleDollar size={13} /> تذكير بالسداد
              </button>
            )}
          </div>
        </div>

        {/* Notes banner */}
        {client.notes && (
          <div className={`mx-5 mb-4 px-3 py-2.5 rounded-xl border-r-2 text-[11px] ${hasBad ? "border-orange-400 bg-orange-50 dark:bg-orange-500/5 text-orange-700 dark:text-orange-400" : "border-amber-400 bg-amber-50 dark:bg-amber-500/5 text-amber-700 dark:text-amber-400"}`}>
            <Warning size={11} className="inline ml-1" />{client.notes}
          </div>
        )}
      </motion.div>

      {/* ── KPI Stats ─────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Gavel,             label: "قضايا نشطة",   value: client.activeCases, color: "text-emerald-500", sub: `${client.closedCases} مغلقة` },
          { icon: FileText,          label: "العقود",        value: contracts.length,  color: "text-indigo-500",  sub: contracts.filter(k => k.status === "active").length + " نشط" },
          { icon: ChatDots,          label: "الاستشارات",    value: consultations.length, color: "text-blue-500", sub: "منجزة" },
          { icon: CurrencyCircleDollar, label: "إجمالي الأتعاب", value: `${client.totalFees.toLocaleString()} ﷼`, color: unpaid > 0 ? "text-red-500" : "text-emerald-500", sub: unpaid > 0 ? `متبقي ${unpaid.toLocaleString()} ﷼` : "مسدّدة بالكامل" },
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

          {/* Contracts */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}
            className={`${card} overflow-hidden`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-indigo-500" weight="duotone" />
                <span className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-700"}`}>العقود</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500"}`}>{contracts.length}</span>
              </div>
              <Link href="/dashboard/lawyer/contracts" className={`text-[11px] font-semibold flex items-center gap-0.5 ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-royal"}`}>
                عرض الكل <ArrowRight size={10} />
              </Link>
            </div>
            {contracts.length === 0 ? (
              <div className="p-8 text-center">
                <PaperclipHorizontal size={28} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} weight="duotone" />
                <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد عقود</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {contracts.map(k => (
                  <div key={k.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${k.status === "active" ? "bg-emerald-500" : k.status === "draft" ? "bg-amber-500" : "bg-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{k.title}</p>
                      <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{k.date} · قيمة {k.value.toLocaleString()} ﷼</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${k.status === "active" ? "bg-emerald-500/10 text-emerald-500" : isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>
                      {k.status === "active" ? "نشط" : k.status === "draft" ? "مسودة" : "منتهي"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

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
                {consultations.map(q => (
                  <div key={q.id} className="flex items-center gap-3 px-4 py-3">
                    <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" weight="duotone" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{q.title}</p>
                      <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{q.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Right column: Revenue chart + Payment + Risk */}
        <div className="space-y-4">

          {/* Revenue sparkline */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className={`${card} p-5`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>الإيرادات (٦ أشهر)</p>
                <p className={`text-xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>{totalRevenue.toLocaleString()} <span className="text-[12px] font-normal text-amber-500">﷼</span></p>
              </div>
              <div className={`p-2 rounded-xl ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}>
                <ArrowUpRight size={18} className="text-amber-500" />
              </div>
            </div>
            <div className="mt-2 overflow-hidden" style={{ height: 95 }}>
              <Sparkline data={revenue} isDark={isDark} />
            </div>
          </motion.div>

          {/* Payment status */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className={`${card} p-4`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>حالة السداد</p>
            <div className="flex items-end justify-between mb-2">
              <div>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>مسدّد</p>
                <p className={`text-base font-black ${isDark ? "text-white" : "text-slate-800"}`}>{client.paidFees.toLocaleString()} <span className="text-[10px] font-normal">﷼</span></p>
              </div>
              {unpaid > 0 && (
                <div className="text-left">
                  <p className="text-[11px] text-red-400">متأخر</p>
                  <p className="text-base font-black text-red-500">{unpaid.toLocaleString()} <span className="text-[10px] font-normal">﷼</span></p>
                </div>
              )}
            </div>
            <div className={`h-3 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
              <div
                className={`h-full rounded-full transition-all ${payPct === 100 ? "bg-emerald-500" : payPct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${payPct}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>٠</p>
              <p className={`text-[9px] font-bold ${payPct === 100 ? "text-emerald-500" : payPct >= 50 ? "text-amber-500" : "text-red-500"}`}>{payPct}% مسدّد</p>
            </div>
          </motion.div>

          {/* Risk / health */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
            className={`${card} p-4`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>تقييم التعامل</p>
            <div className="space-y-2">
              {[
                { label: "مستوى الأولوية",   value: client.flags.includes("vip") ? "VIP 👑" : client.flags.includes("urgent") ? "حرج 🔴" : "عادي",  color: client.flags.includes("vip") ? "text-amber-500" : client.flags.includes("urgent") ? "text-red-500" : isDark ? "text-zinc-400" : "text-slate-600" },
                { label: "مخاطر السداد",     value: hasLatePay ? "مرتفعة ⚠️" : "منخفضة ✓",  color: hasLatePay ? "text-red-500" : "text-emerald-500" },
                { label: "تاريخ التعاون",    value: client.since,  color: isDark ? "text-zinc-300" : "text-slate-700" },
                { label: "التقييم",           value: `${"★".repeat(client.rating)}${"☆".repeat(5 - client.rating)}`, color: "text-amber-400" },
              ].map((row, i) => (
                <div key={i} className={`flex items-center justify-between py-1.5 border-b ${isDark ? "border-white/[0.04]" : "border-slate-100"} last:border-0`}>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{row.label}</p>
                  <p className={`text-[11px] font-bold ${row.color}`}>{row.value}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Compliance */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }}
            className={`${card} p-4 flex items-start gap-3`}>
            <ShieldCheck size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" weight="duotone" />
            <div>
              <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>التوثيق القانوني</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {client.type === "company" ? "كيان قانوني موثّق • تطبّق شروط الشركات" : "شخص طبيعي • نسخة الهوية الوطنية مطلوبة"}
              </p>
            </div>
          </motion.div>

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

            {/* Input area */}
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
                  <p className={`text-[9px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>Ctrl+Enter للحفظ</p>
                  <button onClick={addNote}
                    disabled={!noteInput.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-[11px] font-bold hover:bg-amber-600 disabled:opacity-40 transition-all">
                    إضافة
                  </button>
                </div>
              </div>

              {/* Notes list */}
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
                        {note.id !== "note-init" && (
                          <button onClick={() => deleteNote(note.id)}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition-all ${isDark ? "text-zinc-700 hover:text-red-400" : "text-slate-300 hover:text-red-500"}`}>
                            ×
                          </button>
                        )}
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
