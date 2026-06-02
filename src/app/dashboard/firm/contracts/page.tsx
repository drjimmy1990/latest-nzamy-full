"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  FileText, MagnifyingGlass, Plus, ArrowUpRight,
  CaretLeft, Clock, CheckCircle, Warning, Robot,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Mock Data ─────────────────────────────────────────────────────────

type ContractStatus = "active" | "draft" | "expired" | "pending_signature" | "terminated";
type ContractType   = "legal_service" | "employment" | "nda" | "partnership" | "other";

interface Contract {
  id: string;
  title: string;
  party: string;
  type: ContractType;
  status: ContractStatus;
  value?: string;
  startDate: string;
  endDate?: string;
  daysLeft?: number;
  assignee: string;
}

const MOCK_CONTRACTS: Contract[] = [
  { id: "1", title: "اتفاقية تمثيل قانوني — شركة الأفق",     party: "شركة الأفق للتجارة",   type: "legal_service",  status: "active",            value: "١٢٠,٠٠٠ ﷼", startDate: "يناير ٢٠٢٤",   endDate: "يناير ٢٠٢٥",  daysLeft: 290, assignee: "أ. سارة المنصور" },
  { id: "2", title: "عقد كتمان المعلومات — المجموعة الخليجية",party: "المجموعة الخليجية",    type: "nda",            status: "pending_signature",  value: "—",            startDate: "أبريل ٢٠٢٤",                         daysLeft: 0,   assignee: "أ. تركي العمر" },
  { id: "3", title: "اتفاقية شراكة — محامو الرياض",           party: "مكتب محامو الرياض",    type: "partnership",    status: "active",             value: "مشاركة أرباح", startDate: "مارس ٢٠٢٤",    endDate: "مارس ٢٠٢٦",   daysLeft: 700, assignee: "أ. خالد الحربي" },
  { id: "4", title: "عقد خدمات قانونية — الدوسري",            party: "سارة الدوسري",         type: "legal_service",  status: "active",             value: "٤٥,٠٠٠ ﷼",   startDate: "أبريل ٢٠٢٤",  endDate: "أكتوبر ٢٠٢٤", daysLeft: 180, assignee: "أ. سارة المنصور" },
  { id: "5", title: "عقد استشارات دوري — المطيري",             party: "ريم المطيري",          type: "legal_service",  status: "draft",                                     startDate: "—",                                      daysLeft: 0,   assignee: "أ. نورة الشمري" },
  { id: "6", title: "اتفاقية خدمات منتهية — السبيعي",          party: "علي السبيعي",          type: "legal_service",  status: "expired",            value: "٣٠,٠٠٠ ﷼",   startDate: "يوليو ٢٠٢٢",   endDate: "يوليو ٢٠٢٣",  daysLeft: 0,   assignee: "أ. تركي العمر" },
];

const STATUS_CONFIG: Record<ContractStatus, { label: string; color: string; dot: string }> = {
  active:            { label: "ساري",              color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400" },
  pending_signature: { label: "بانتظار التوقيع",  color: "text-amber-500 bg-amber-500/10 border-amber-500/20",       dot: "bg-amber-400" },
  draft:             { label: "مسودة",             color: "text-blue-500 bg-blue-500/10 border-blue-500/20",          dot: "bg-blue-400" },
  expired:           { label: "منتهي",             color: "text-slate-400 bg-slate-100 border-slate-200 dark:bg-white/[0.04] dark:border-white/[0.06]", dot: "bg-slate-300" },
  terminated:        { label: "محلول",             color: "text-red-500 bg-red-500/10 border-red-500/20",             dot: "bg-red-400" },
};

const TYPE_LABELS: Record<ContractType, string> = {
  legal_service: "خدمات قانونية", employment: "توظيف", nda: "كتمان",
  partnership: "شراكة", other: "أخرى",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FirmContractsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContractStatus | "all">("all");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = MOCK_CONTRACTS.filter(c => {
    const matchStatus = filter === "all" || c.status === filter;
    const matchSearch = !search || c.title.includes(search) || c.party.includes(search);
    return matchStatus && matchSearch;
  });

  const counts = {
    all: MOCK_CONTRACTS.length,
    active: MOCK_CONTRACTS.filter(c => c.status === "active").length,
    pending_signature: MOCK_CONTRACTS.filter(c => c.status === "pending_signature").length,
    draft: MOCK_CONTRACTS.filter(c => c.status === "draft").length,
    expired: MOCK_CONTRACTS.filter(c => c.status === "expired").length,
    terminated: 0,
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            إدارة العقود
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {MOCK_CONTRACTS.length} عقد — {counts.active} ساري · {counts.pending_signature} بانتظار توقيع
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/ai/contracts"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <Robot size={15} />
            محترف العقود AI
          </Link>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Plus size={15} weight="bold" />
            عقد جديد
          </button>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex flex-col sm:flex-row gap-3">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث في العقود..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {([
            { key: "all",              label: "الكل" },
            { key: "active",           label: "سارية" },
            { key: "pending_signature",label: "بانتظار توقيع" },
            { key: "draft",            label: "مسودة" },
            { key: "expired",          label: "منتهية" },
          ] as { key: ContractStatus | "all"; label: string }[]).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold flex-shrink-0 transition-all ${filter === f.key
                ? "bg-royal text-white border-royal"
                : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"
              }`}>
              {f.key !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[f.key as ContractStatus]?.dot}`} />}
              {f.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${filter === f.key ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                {counts[f.key as ContractStatus] ?? counts.all}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Contracts list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className={`${card} p-12 text-center`}>
            <FileText size={36} weight="duotone" className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد عقود مطابقة</p>
          </div>
        ) : filtered.map((c, i) => {
          const status = STATUS_CONFIG[c.status];
          const nearExpiry = c.daysLeft != null && c.daysLeft > 0 && c.daysLeft <= 60;
          return (
            <motion.div key={c.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Link href={`/dashboard/firm/contracts/${c.id}`}
                className={`group ${card} p-4 flex items-center gap-4 hover:border-royal/30 hover:scale-[1.005] transition-all block`}>
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                  {c.status === "active" ? <CheckCircle size={18} weight="duotone" className="text-emerald-500" />
                    : c.status === "pending_signature" ? <Warning size={18} weight="duotone" className="text-amber-500" />
                    : <FileText size={18} weight="duotone" className={isDark ? "text-zinc-500" : "text-slate-400"} />}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className={`text-[14px] font-semibold truncate flex-1 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.title}</p>
                    <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.color}`}>{status.label}</span>
                    {nearExpiry && (
                      <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        {c.daysLeft} يوم
                      </span>
                    )}
                  </div>
                  <div className={`flex items-center gap-3 text-[12px] flex-wrap ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    <span>{c.party}</span>
                    <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>
                      {TYPE_LABELS[c.type]}
                    </span>
                    <span>{c.startDate}{c.endDate ? ` — ${c.endDate}` : ""}</span>
                    {c.value && c.value !== "—" && <span className={isDark ? "text-zinc-400" : "text-slate-600"}>{c.value}</span>}
                  </div>
                </div>
                {/* Assignee */}
                <div className="flex-shrink-0 hidden sm:block">
                  <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مكلّف</p>
                  <p className={`text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{c.assignee}</p>
                </div>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${isDark ? "text-zinc-700 group-hover:bg-white/[0.06] group-hover:text-zinc-300" : "text-slate-200 group-hover:bg-royal group-hover:text-white"}`}>
                  <CaretLeft size={15} />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
