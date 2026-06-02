"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star, Users, CurrencyCircleDollar, TrendUp,
  MagnifyingGlass, ArrowUpRight, CaretDown, CaretUp,
  CheckCircle, Clock, XCircle, Crown,
  UserCirclePlus, Gift, ChartBar, Eye,
  DotsThree,
} from "@phosphor-icons/react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────
type AmbStatus = "active" | "pending" | "paused";

interface Ambassador {
  id: string;
  name: string;
  handle: string;    // قناة يوتيوب / حساب تيك توك
  platform: string;
  avatar: string;
  code: string;
  referrals: number;
  earned: number;    // ر.س
  pending: number;
  contractDate: string;
  status: AmbStatus;
  tier: "standard" | "gold" | "platinum";
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const AMBASSADORS: Ambassador[] = [
  { id: "a1", name: "أحمد الشهراني",  handle: "@ahmed_law",    platform: "يوتيوب",   avatar: "أ", code: "AHMED20",  referrals: 48, earned: 7152, pending: 299,  contractDate: "٥ يناير ٢٠٢٦",    status: "active",  tier: "gold" },
  { id: "a2", name: "سارة الحربي",    handle: "@sara_rights",  platform: "إنستغرام", avatar: "س", code: "SARA15",   referrals: 31, earned: 4185, pending: 0,    contractDate: "١٢ يناير ٢٠٢٦",   status: "active",  tier: "standard" },
  { id: "a3", name: "خالد المطيري",   handle: "@khaled_legal", platform: "تيك توك",  avatar: "خ", code: "KHALED25", referrals: 87, earned: 16530,pending: 1497, contractDate: "٣ ديسمبر ٢٠٢٥",   status: "active",  tier: "platinum" },
  { id: "a4", name: "نورة العنزي",    handle: "@noura_qa",     platform: "يوتيوب",   avatar: "ن", code: "NOURA20",  referrals: 12, earned: 1788, pending: 149,  contractDate: "٢٠ فبراير ٢٠٢٦",  status: "pending", tier: "standard" },
  { id: "a5", name: "فهد القحطاني",   handle: "@fahad_law",    platform: "سناب شات", avatar: "ف", code: "FAHAD10",  referrals: 5,  earned: 497,  pending: 0,    contractDate: "١ مارس ٢٠٢٦",     status: "paused",  tier: "standard" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const statusMap: Record<AmbStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  active:  { label: "نشط",       color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle },
  pending: { label: "بانتظار",   color: "text-amber-500  bg-amber-500/10  border-amber-500/20",    icon: Clock },
  paused:  { label: "موقوف",     color: "text-red-500    bg-red-500/10    border-red-500/20",      icon: XCircle },
};

const tierMap = {
  standard: { label: "Standard",  color: "text-zinc-400",   icon: Star },
  gold:     { label: "Gold",      color: "text-[#C8A762]",  icon: Star },
  platinum: { label: "Platinum",  color: "text-sky-400",    icon: Crown },
};

// ─── Ambassador Card ──────────────────────────────────────────────────────────
function AmbCard({ amb, expanded, onToggle }: {
  amb: Ambassador; expanded: boolean; onToggle: () => void;
}) {
  const s = statusMap[amb.status];
  const SIcon = s.icon;
  const t = tierMap[amb.tier];
  const TIcon = t.icon;

  return (
    <motion.div layout className="rounded-2xl border border-white/[0.07] bg-zinc-900/70 overflow-hidden">
      {/* Row */}
      <button onClick={onToggle} className="w-full p-4 flex items-center gap-4 text-right">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-xl bg-[#0B3D2E]/30 text-emerald-400 flex items-center justify-center font-bold text-[16px] flex-shrink-0">
          {amb.avatar}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-bold text-white truncate">{amb.name}</p>
            <TIcon size={13} weight="fill" className={t.color} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-zinc-500">{amb.handle}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.05] text-zinc-400">{amb.platform}</span>
          </div>
        </div>

        {/* Stats quick */}
        <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
          <div className="text-center">
            <p className="text-[15px] font-black text-white font-mono">{amb.referrals}</p>
            <p className="text-[10px] text-zinc-600">إحالة</p>
          </div>
          <div className="text-center">
            <p className="text-[15px] font-black text-[#C8A762] font-mono">{amb.earned.toLocaleString()}</p>
            <p className="text-[10px] text-zinc-600">ر.س مكتسب</p>
          </div>
        </div>

        {/* Status + caret */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.color}`}>
            <SIcon size={10} className="inline me-0.5" weight="fill" />{s.label}
          </span>
          {expanded ? <CaretUp size={13} className="text-zinc-600" /> : <CaretDown size={13} className="text-zinc-600" />}
        </div>
      </button>

      {/* Expanded Detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            className="overflow-hidden border-t border-white/[0.06]">
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "رمز الإحالة",   value: amb.code,                      color: "text-white" },
                { label: "تاريخ التعاقد", value: amb.contractDate,               color: "text-zinc-300" },
                { label: "معلّق (ر.س)",   value: amb.pending.toLocaleString(),   color: "text-amber-400" },
                { label: "المنصة",         value: amb.platform,                   color: "text-zinc-300" },
              ].map((s, i) => (
                <div key={i} className="rounded-xl bg-white/[0.03] p-3">
                  <p className="text-[10px] text-zinc-600 mb-1">{s.label}</p>
                  <p className={`text-[13px] font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="px-4 pb-4 flex gap-2 flex-wrap">
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-[#0B3D2E]/20 border border-emerald-800/30 text-emerald-400 hover:bg-[#0B3D2E]/30 transition-colors">
                <Eye size={13} /> عرض الملف الكامل
              </button>
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-white/[0.04] border border-white/[0.06] text-zinc-400 hover:bg-white/[0.07] transition-colors">
                <Gift size={13} /> تسوية الأرباح
              </button>
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-white/[0.04] border border-white/[0.06] text-zinc-400 hover:text-red-400 hover:border-red-800/30 transition-colors">
                <DotsThree size={13} weight="bold" /> المزيد
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminCelebritiesPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | AmbStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = AMBASSADORS.filter(a => {
    const matchSearch = search === "" || a.name.includes(search) || a.handle.includes(search) || a.code.includes(search);
    const matchFilter = filter === "all" || a.status === filter;
    return matchSearch && matchFilter;
  });

  const totalEarned  = AMBASSADORS.reduce((s, a) => s + a.earned, 0);
  const totalPending = AMBASSADORS.reduce((s, a) => s + a.pending, 0);
  const totalRefs    = AMBASSADORS.reduce((s, a) => s + a.referrals, 0);
  const activeCount  = AMBASSADORS.filter(a => a.status === "active").length;

  const filters: { id: "all" | AmbStatus; label: string }[] = [
    { id: "all",     label: `الكل (${AMBASSADORS.length})` },
    { id: "active",  label: `نشط (${AMBASSADORS.filter(a => a.status === "active").length})` },
    { id: "pending", label: `بانتظار` },
    { id: "paused",  label: `موقوف` },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Star size={22} weight="fill" className="text-[#C8A762]" />
              <h1 className="text-2xl font-bold text-white">سفراء نظامي</h1>
            </div>
            <p className="text-sm text-zinc-500">إدارة شراكات المؤثرين والمشاهير</p>
          </div>
          <Link href="/dashboard/admin/celebrities/upgrade"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-bold hover:bg-[#0a3328] transition-colors">
            <UserCirclePlus size={15} /> ترقية مستخدم جديد
          </Link>
        </motion.div>

        {/* KPI Strip */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "إجمالي السفراء",      value: AMBASSADORS.length, icon: Users,                 color: "text-[#C8A762]" },
            { label: "نشط الآن",             value: activeCount,        icon: CheckCircle,           color: "text-emerald-500" },
            { label: "إجمالي الإحالات",     value: totalRefs,          icon: Gift,                  color: "text-blue-400" },
            { label: "أرباح مدفوعة (ر.س)", value: totalEarned.toLocaleString(), icon: CurrencyCircleDollar, color: "text-[#C8A762]" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.04 }}
                className="rounded-2xl border border-white/[0.07] bg-zinc-900/70 p-4 flex items-center gap-3">
                <Icon size={20} weight="duotone" className={s.color} />
                <div>
                  <p className="text-xl font-black font-mono text-white">{s.value}</p>
                  <p className="text-[11px] text-zinc-500">{s.label}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Pending payout alert */}
        {totalPending > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14 }}
            className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-amber-400" />
              <span className="text-[13px] text-amber-300 font-semibold">
                أرباح معلّقة: <strong>{totalPending.toLocaleString()} ر.س</strong> — بانتظار التسوية
              </span>
            </div>
            <button className="text-[12px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1">
              تسوية الكل <ArrowUpRight size={12} />
            </button>
          </motion.div>
        )}

        {/* Search + Filter */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-zinc-900/70 px-3 flex-1">
            <MagnifyingGlass size={16} className="text-zinc-600" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الرمز أو المنصة..."
              className="flex-1 py-2.5 text-sm bg-transparent outline-none text-zinc-200 placeholder-zinc-600" />
          </div>
          <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-zinc-900/70 p-1">
            {filters.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                  filter === f.id
                    ? "bg-[#0B3D2E] text-emerald-300"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* List */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14 }}
          className="space-y-3">
          <AnimatePresence>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Star size={32} weight="duotone" className="text-zinc-700 mb-3" />
                <p className="text-zinc-400 font-semibold">لا توجد نتائج</p>
                <p className="text-zinc-600 text-sm mt-1">جرّب تغيير كلمة البحث أو الفلتر</p>
              </div>
            ) : (
              filtered.map(a => (
                <AmbCard key={a.id} amb={a}
                  expanded={expanded === a.id}
                  onToggle={() => setExpanded(expanded === a.id ? null : a.id)} />
              ))
            )}
          </AnimatePresence>
        </motion.div>

        {/* Footer Links */}
        <div className="flex gap-3 pt-2">
          <Link href="/dashboard/admin/celebrities/referrals"
            className="flex items-center gap-1.5 text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors">
            <ChartBar size={13} /> تقرير الإحالات الكامل <ArrowUpRight size={11} />
          </Link>
        </div>

      </div>
    </div>
  );
}
