"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Scales, CalendarCheck, Gavel, Robot, MagnifyingGlass,
  ArrowLeft, ArrowRight, CaretLeft, CaretRight,
  Star, Money, Clock, CheckCircle, Hourglass,
  Users, FileText, Storefront, SealCheck, MapPin,
  PencilSimple, Scan, Globe, TreeStructure, Warning,
  Lightning, Crown, Sparkle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";

// ─── Types ───────────────────────────────────────────────────────────────────

type CaseStatus = "active" | "deliberation" | "closed" | "suspended";
type HearingType = "remote" | "inperson";

interface ArbitrationCase {
  id: number;
  caseNumber: string;
  parties: string;
  subject: string;
  center: string;
  status: CaseStatus;
  amount: string;
  nextHearing?: string;
  startDate: string;
}

interface Hearing {
  id: number;
  caseNumber: string;
  parties: string;
  date: string;
  time: string;
  type: HearingType;
  location?: string;
  link?: string;
  status: "upcoming" | "confirmed" | "pending";
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const CASES: ArbitrationCase[] = [
  {
    id: 1, caseNumber: "ARB-2026-001",
    parties: "شركة البناء الحديث ضد مجموعة الخليج للتطوير",
    subject: "نزاع عقد مقاولة — مشروع أبراج الرياض",
    center: "مركز التحكيم التجاري الخليجي",
    status: "active", amount: "٤٢ مليون ر.س",
    nextHearing: "٥ مايو ٢٠٢٦", startDate: "٢٠ فبراير ٢٠٢٦",
  },
  {
    id: 2, caseNumber: "ARB-2026-002",
    parties: "مؤسسة الشروق للتجارة ضد شركة التقنية المتقدمة",
    subject: "خلاف عقد توريد برمجيات — إلغاء مشروع",
    center: "هيئة التحكيم التجاري بالرياض",
    status: "deliberation", amount: "٨.٥ مليون ر.س",
    startDate: "١٠ يناير ٢٠٢٦",
  },
  {
    id: 3, caseNumber: "ARB-2025-089",
    parties: "بنك الرياض ضد شركة العقارات الذهبية",
    subject: "نزاع تمويل عقاري — إخلال بشروط العقد",
    center: "مركز التحكيم التجاري الخليجي",
    status: "closed", amount: "١٥ مليون ر.س",
    startDate: "١ سبتمبر ٢٠٢٥",
  },
];

const HEARINGS: Hearing[] = [
  {
    id: 1, caseNumber: "ARB-2026-001",
    parties: "البناء الحديث ضد الخليج",
    date: "٥ مايو", time: "١٠:٠٠ص",
    type: "inperson", location: "مركز التحكيم التجاري — الرياض",
    status: "confirmed",
  },
  {
    id: 2, caseNumber: "ARB-2026-005",
    parties: "شركة نور ضد مجموعة الفجر",
    date: "١٢ مايو", time: "٢:٠٠م",
    type: "remote", link: "https://meet.example.com/arb-005",
    status: "upcoming",
  },
  {
    id: 3, caseNumber: "ARB-2026-007",
    parties: "مؤسسة الأصيل ضد شركة الريادة",
    date: "١٨ مايو", time: "١١:٠٠ص",
    type: "inperson", location: "هيئة التحكيم — جدة",
    status: "pending",
  },
];

const STATUS_CONFIG: Record<CaseStatus, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  active:       { label: "نشطة",           bg: "bg-blue-500/10",    color: "text-blue-500",    icon: <Clock size={12} weight="fill" /> },
  deliberation: { label: "قيد المداولة",   bg: "bg-amber-500/10",   color: "text-amber-500",   icon: <Hourglass size={12} weight="fill" /> },
  closed:       { label: "مغلقة — حكم صدر", bg: "bg-emerald-500/10", color: "text-emerald-500", icon: <CheckCircle size={12} weight="fill" /> },
  suspended:    { label: "موقوفة",          bg: "bg-red-500/10",     color: "text-red-500",     icon: <Warning size={12} weight="fill" /> },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ArbitratorDashboard() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | CaseStatus>("all");
  useEffect(() => setMounted(true), []);

  const user = useUser();

  if (!mounted) return null;

  const bg   = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const Caret = isRTL ? CaretLeft : CaretRight;

  const activeCases = CASES.filter(c => c.status === "active").length;
  const deliberationCases = CASES.filter(c => c.status === "deliberation").length;
  const closedCases = CASES.filter(c => c.status === "closed").length;
  const filteredCases = activeFilter === "all" ? CASES : CASES.filter(c => c.status === activeFilter);

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" } }),
  };

  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">

        {/* ── Welcome Banner */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
          className="rounded-2xl p-6 bg-gradient-to-l from-[#1a1035] via-[#1e1545] to-[#2a1d5e] text-white relative overflow-hidden shadow-xl">
          <div className="absolute start-0 top-0 bottom-0 w-1 bg-[#C8A762]" />
          <div className="absolute end-6 top-1/2 -translate-y-1/2 opacity-5">
            <Scales size={140} weight="fill" />
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 bg-[#C8A762]/20 text-[#C8A762] text-xs font-bold px-3 py-1 rounded-full">
                  <SealCheck size={12} weight="fill" /> محكّم تجاري معتمد
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black mb-1">مرحباً، {user.name}</h1>
              <p className="text-purple-200/80 text-sm">
                لديك <span className="text-[#C8A762] font-bold">{activeCases}</span> قضايا نشطة و
                <span className="text-[#C8A762] font-bold"> {deliberationCases}</span> أحكام قيد المداولة
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/dashboard/provider/arbitration/cases"
                className="inline-flex items-center gap-2 bg-[#C8A762] text-[#1a1035] font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-[#d4b574] transition shadow-lg">
                <Scales size={16} /> كل القضايا <Arrow size={14} />
              </Link>
              <Link href="/ai/draft?mode=arbitration"
                className="inline-flex items-center gap-2 bg-white/10 text-white font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-white/20 transition">
                <Robot size={16} /> صائغ الحكم
              </Link>
            </div>
          </div>
        </motion.div>

        {/* ── KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "قضايا نشطة",        value: String(activeCases),       sub: "جارٍ النظر فيها",        icon: Scales,        gradient: "from-indigo-600 to-purple-600", change: "+١" },
            { label: "قيد المداولة",       value: String(deliberationCases), sub: "تنتظر حكماً نهائياً",    icon: Hourglass,     gradient: "from-amber-600 to-orange-500",  change: "عاجل" },
            { label: "أحكام أصدرتها",      value: String(closedCases),       sub: "منذ بداية العام",        icon: Gavel,         gradient: "from-emerald-700 to-emerald-500", change: "+٢" },
            { label: "جلسات هذا الشهر",    value: String(HEARINGS.length),   sub: "حضورياً وعن بُعد",       icon: CalendarCheck, gradient: "from-blue-600 to-cyan-500",     change: "مايو" },
          ].map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <motion.div key={i} variants={fadeUp} initial="hidden" animate="show" custom={i + 1}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
                className={`${card} p-5 shadow-sm`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center shadow`}>
                    <Icon size={20} weight="fill" className="text-white" />
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-purple-500/15 text-purple-400" : "bg-purple-50 text-purple-600"}`}>
                    {kpi.change}
                  </span>
                </div>
                <p className={`text-xl font-black mb-0.5 ${isDark ? "text-white" : "text-gray-900"}`}>{kpi.value}</p>
                <p className={`text-xs font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{kpi.label}</p>
                <p className={`text-xs mt-0.5 ${muted}`}>{kpi.sub}</p>
              </motion.div>
            );
          })}
        </div>

        {/* ── Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Cases Table */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}
            className={`xl:col-span-2 ${card} overflow-hidden shadow-sm`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
              <div>
                <h2 className={`font-bold text-base ${isDark ? "text-white" : "text-gray-900"}`}>قضايا التحكيم</h2>
                <p className={`text-xs mt-0.5 ${muted}`}>{CASES.length} قضية في السجل</p>
              </div>
              <Link href="/dashboard/provider/arbitration/cases"
                className={`flex items-center gap-1 text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-indigo-600"} hover:underline`}>
                عرض الكل <Caret size={13} />
              </Link>
            </div>

            {/* Filter tabs */}
            <div className={`flex gap-2 px-5 py-3 border-b ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
              {(["all", "active", "deliberation", "closed"] as const).map(f => (
                <button key={f} onClick={() => setActiveFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-full font-bold transition-all ${
                    activeFilter === f
                      ? isDark ? "bg-[#C8A762] text-[#1a1035]" : "bg-indigo-600 text-white"
                      : isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}>
                  {{ all: "الكل", active: "نشطة", deliberation: "مداولة", closed: "مغلقة" }[f]}
                </button>
              ))}
            </div>

            <div className="divide-y divide-gray-100 dark:divide-[#2d3748]">
              {filteredCases.map((c, i) => {
                const cfg = STATUS_CONFIG[c.status];
                return (
                  <motion.div key={c.id}
                    initial={{ opacity: 0, x: isRTL ? 10 : -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.08 }}
                    className={`p-4 hover:${isDark ? "bg-white/2" : "bg-gray-50/70"} transition-colors`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-mono font-bold ${isDark ? "text-[#C8A762]" : "text-indigo-600"}`}>
                            {c.caseNumber}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold ${cfg.bg} ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </div>
                        <p className={`font-semibold text-sm leading-snug mb-1 ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                          {c.parties}
                        </p>
                        <p className={`text-xs ${muted} mb-1.5`}>{c.subject}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={`flex items-center gap-1 ${muted}`}>
                            <MapPin size={11} weight="fill" /> {c.center}
                          </span>
                          {c.nextHearing && (
                            <>
                              <span className={muted}>·</span>
                              <span className={`flex items-center gap-1 text-amber-500 font-semibold`}>
                                <CalendarCheck size={11} /> الجلسة القادمة: {c.nextHearing}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`text-sm font-black ${isDark ? "text-[#C8A762]" : "text-indigo-700"}`}>
                          {c.amount}
                        </span>
                        <Link href={`/dashboard/provider/arbitration/cases`}
                          className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl transition ${
                            isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                          }`}>
                          فتح الملف <Arrow size={11} />
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Right column */}
          <div className="space-y-6">

            {/* Upcoming Hearings */}
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6}
              className={`${card} overflow-hidden shadow-sm`}>
              <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                <h2 className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>جلسات مايو</h2>
                <Link href="/dashboard/provider/arbitration/hearings"
                  className={`flex items-center gap-1 text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-indigo-600"} hover:underline`}>
                  التقويم <Caret size={13} />
                </Link>
              </div>
              <div className="p-3 space-y-2">
                {HEARINGS.map((h) => (
                  <motion.div key={h.id} whileHover={{ x: isRTL ? -3 : 3 }}
                    className={`rounded-xl p-3.5 border transition-all ${
                      h.status === "confirmed"
                        ? isDark ? "border-indigo-500/30 bg-indigo-500/10" : "border-indigo-200 bg-indigo-50"
                        : h.status === "upcoming"
                        ? isDark ? "border-[#2d3748] bg-white/2" : "border-gray-100 bg-gray-50"
                        : isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-100 bg-amber-50"
                    }`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className={`text-xs font-bold leading-snug ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                        {h.parties}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                        h.type === "remote" ? "bg-blue-500/10 text-blue-500" : "bg-emerald-500/10 text-emerald-500"
                      }`}>
                        {h.type === "remote" ? "عن بُعد" : "حضوري"}
                      </span>
                    </div>
                    <p className={`text-xs font-bold mb-1 ${isDark ? "text-[#C8A762]" : "text-indigo-700"}`}>
                      {h.date} — {h.time}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-mono ${muted}`}>{h.caseNumber}</span>
                      {h.type === "remote" && h.link ? (
                        <a href={h.link} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] font-bold text-blue-500 hover:underline">
                          انضم الآن
                        </a>
                      ) : (
                        <span className={`text-[10px] ${muted} flex items-center gap-1`}>
                          <MapPin size={9} weight="fill" /> {h.location?.split("—")[1]?.trim()}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* AI Tools */}
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={7}
              className={`${card} p-5 shadow-sm`}>
              <div className="flex items-center gap-2 mb-4">
                <Robot size={15} className="text-[#C8A762]" weight="duotone" />
                <span className={`text-[11px] font-bold uppercase tracking-wider ${muted}`}>
                  أدوات AI للمحكّم
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "صائغ الحكم",    icon: Robot,          href: "/ai/draft?mode=arbitration" },
                  { label: "ملخّص المذكرات", icon: Scan,           href: "/ai/analyze?mode=memo" },
                  { label: "باحث المبادئ",   icon: MagnifyingGlass,href: "/ai/gov/judicial-search" },
                  { label: "مدقق الاختصاص", icon: TreeStructure,   href: "/ai/gov/jurisdiction-analyzer" },
                  { label: "القانون الدولي", icon: Globe,           href: "/ai/consult?ctx=arbitration" },
                  { label: "مسودة قرار",     icon: PencilSimple,   href: "/dashboard/provider/arbitration/drafts" },
                ].map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Link key={tool.label} href={tool.href}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all hover:scale-[1.02] ${
                        isDark ? "border-[#2d3748] bg-white/[0.02] hover:bg-indigo-500/10 hover:border-indigo-500/30"
                               : "border-gray-100 hover:border-indigo-200 hover:bg-indigo-50"
                      }`}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? "bg-indigo-500/10" : "bg-indigo-50"}`}>
                        <Icon size={17} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-indigo-600"} />
                      </div>
                      <span className={`text-[11px] font-semibold leading-tight ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                        {tool.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>

            {/* Profile completion */}
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={8}
              className={`${card} p-4 shadow-sm`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "bg-[#C8A762]/15" : "bg-indigo-50"}`}>
                  <Crown size={18} className={isDark ? "text-[#C8A762]" : "text-indigo-600"} weight="fill" />
                </div>
                <div>
                  <p className={`text-xs font-bold ${isDark ? "text-white" : "text-gray-900"}`}>اكتمال الملف المهني</p>
                  <p className={`text-xs ${muted}`}>٨٥٪ مكتمل</p>
                </div>
              </div>
              <div className={`w-full h-1.5 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"} mb-3`}>
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-[#C8A762]" style={{ width: "85%" }} />
              </div>
              <Link href="/dashboard/provider/profile"
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition ${
                  isDark ? "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                }`}>
                <Sparkle size={13} weight="fill" /> اكتمل ملفك الآن
              </Link>
            </motion.div>
          </div>
        </div>

        {/* ── Upgrade Banner */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={9}
          className={`rounded-2xl border-2 border-dashed overflow-hidden ${
            isDark ? "border-indigo-500/20 bg-indigo-500/5" : "border-indigo-200 bg-indigo-50/50"
          }`}>
          <div className="p-6 flex flex-col md:flex-row items-center gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 shadow-md">
              <Crown size={28} weight="fill" className="text-[#C8A762]" />
            </div>
            <div className="flex-1 text-center md:text-start">
              <h3 className={`text-base font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>
                ترقّ لمحكّم مميز — ١٩٩ ﷼/شهر
              </h3>
              <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-2">
                {[
                  { icon: Lightning, label: "أولوية في طلبات التحكيم" },
                  { icon: Robot,     label: "صائغ حكم AI — غير محدود" },
                  { icon: FileText,  label: "قوالب أحكام تحكيمية" },
                  { icon: Users,     label: "إدارة فريق عمل المحكّم" },
                ].map(({ icon: Icon, label }) => (
                  <span key={label} className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full ${
                    isDark ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-100 text-indigo-700"
                  }`}>
                    <Icon size={11} weight="fill" /> {label}
                  </span>
                ))}
              </div>
            </div>
            <Link href="/dashboard/provider/earnings"
              className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-md hover:bg-indigo-700 transition-colors">
              ترقية الآن <Arrow size={14} />
            </Link>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
