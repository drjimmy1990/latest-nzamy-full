"use client";

import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import Link from "next/link";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { SectorProfileReadinessPanel } from "@/components/dashboard/sector/SectorProfileReadinessPanel";
import {
  Handshake, ShieldCheck, ClipboardText, FileText,
  Brain, Robot, ArrowLeft, CurrencyCircleDollar,
  ArrowUpRight, ShieldChevron, UserCirclePlus,
  WarningCircle, CheckCircle,
} from "@phosphor-icons/react";

// ─── DATA ─────────────────────────────────────────────────────────────────────

const AI_TOOLS = [
  { label: "صائغ عقود التطوع",    sub: "عقود مخصصة لكل متطوع ومهمة",               href: "/ai/ngo/volunteer-contract", Icon: Handshake },
  { label: "مدقق الحوكمة",        sub: "توافق مع المركز الوطني للقطاع غير الربحي", href: "/ai/ngo/governance-checker", Icon: ShieldCheck },
  { label: "محلل التبرعات",       sub: "تصنيف + قيود + استحقاق + تقارير",          href: "/ai/ngo/donation-analyzer",  Icon: Brain },
  { label: "المستشار الذكي",      sub: "استشارة قانونية سريعة بالذكاء الاصطناعي", href: "/ai/consult",                Icon: Robot },
];

const COMPLIANCE_LOG = [
  { id: 1, title: "تجديد شهادة المواءمة مع المركز الوطني",        status: "pending",   due: "2026-05-15", type: "شهادة" },
  { id: 2, title: "رفع التقرير الربع سنوي الأول",                 status: "completed", due: "2026-04-30", type: "تقرير" },
  { id: 3, title: "تحديث بيانات أعضاء مجلس الإدارة",             status: "warning",   due: "2026-05-05", type: "حوكمة" },
];

const RECENT_DONATIONS = [
  { id: "DON-092", amount: "50,000", donor: "فاعل خير", project: "كفالة الأيتام",   time: "قبل ساعتين" },
  { id: "DON-091", amount: "12,500", donor: "مؤسسة العطاء", project: "السلال الغذائية", time: "قبل 5 ساعات" },
  { id: "DON-090", amount: "3,000",  donor: "فاعل خير", project: "الوقف العام",     time: "قبل يوم" },
];

// ─── ANIMATION CONFIG ─────────────────────────────────────────────────────────

const spring = { type: "spring" as const, stiffness: 100, damping: 20 };

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: spring },
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function NGODashboard() {
  const user = useUser();
  const { isDark } = useTheme();

  const bg    = isDark ? "bg-zinc-950"            : "bg-slate-50";
  const card  = isDark ? "bg-zinc-900/40 border-white/5" : "bg-white border-slate-200";
  const muted = isDark ? "text-slate-400"         : "text-slate-500";
  const dim   = isDark ? "text-slate-500"         : "text-slate-400";

  return (
    <div className={`${bg} min-h-[100dvh] pb-20`} dir="rtl">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-10">

        {/* -- Onboarding Welcome (first-visit only) -- */}
        <OnboardingBanner role="ngo" name={user.name} isDark={isDark} />

        <SectorProfileReadinessPanel sector="ngo" />


        {/* ── Asymmetric Header ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-end"
        >
          <div>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border mb-4 ${
              isDark ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}>
              <ShieldChevron size={14} weight="duotone" />
              منظمة غير ربحية — متوافق مع المركز الوطني للقطاع غير الربحي
            </div>

            <h1 className={`text-4xl md:text-5xl font-bold tracking-tighter leading-none mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>
              {user.name || "جمعية البر الأهلية"}
            </h1>
            <p className={`max-w-[52ch] text-base leading-relaxed ${muted}`}>
              لوحة التحكم الشاملة — إدارة المتطوعين، تتبع التبرعات، وضمان الامتثال القانوني والتشغيلي.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <Link
              href="/dashboard/ngo/volunteers/new"
              className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all active:scale-[0.98] ${
                isDark ? "bg-white text-zinc-950 hover:bg-slate-200" : "bg-zinc-900 text-white hover:bg-zinc-800"
              }`}
            >
              <UserCirclePlus size={18} weight="bold" />
              متطوع جديد
            </Link>
            <Link
              href="/dashboard/ngo/reports"
              className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl font-medium border transition-all active:scale-[0.98] ${
                isDark ? "bg-zinc-900 border-white/10 text-white hover:bg-zinc-800" : "bg-white border-slate-200 text-slate-900 hover:bg-slate-50"
              }`}
            >
              <ClipboardText size={18} />
              التقارير
            </Link>
          </div>
        </motion.div>

        {/* ── KPI Metrics — 4-col borderless strip ──────────────────────────── */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className={`grid grid-cols-2 md:grid-cols-4 divide-x divide-x-reverse border rounded-[2rem] overflow-hidden ${
            isDark ? "divide-white/5 border-white/5" : "divide-slate-200 border-slate-200"
          }`}
        >
          {[
            { label: "إجمالي التبرعات الموثقة",  value: "182,500 ر.س", note: "+12.5% عن الشهر الماضي",    accent: true },
            { label: "المتطوعون النشطون",         value: "48",          note: "+6 متطوعين جدد هذا الشهر",   accent: false },
            { label: "مؤشر الحوكمة والامتثال",   value: "94%",         note: "3 مهام متبقية للاكتمال",      accent: false },
            { label: "العقود التشغيلية السارية",  value: "12",          note: "عقدان ينتهيان خلال 30 يوم",  accent: false },
          ].map((k) => (
            <motion.div key={k.label} variants={item} className="px-6 py-6">
              <div className={`text-2xl md:text-3xl font-mono font-bold tracking-tighter ${
                k.accent ? (isDark ? "text-emerald-400" : "text-emerald-700") : (isDark ? "text-white" : "text-slate-900")
              }`}>{k.value}</div>
              <div className={`text-xs mt-1 ${muted}`}>{k.label}</div>
              <div className={`text-xs mt-1 flex items-center gap-1 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
                {k.accent && <ArrowUpRight size={11} weight="bold" className={isDark ? "text-emerald-500" : "text-emerald-600"} />}
                {k.note}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Main Body — Asymmetric 2/3 + 1/3 ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">

          {/* LEFT: Compliance Radar + AI Tools ─────────────────────────────── */}
          <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">

            {/* Compliance Radar */}
            <div className={`p-8 rounded-[2.5rem] border ${card}`}>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className={`text-xl font-semibold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                    رادار الامتثال والحوكمة
                  </h2>
                  <p className={`text-sm mt-1 ${muted}`}>المهام القانونية المطلوبة للمركز الوطني للقطاع غير الربحي</p>
                </div>
                <Link
                  href="/dashboard/ngo/compliance"
                  className={`p-2 rounded-full border transition-colors ${
                    isDark ? "border-white/10 hover:bg-white/5" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <ArrowLeft size={16} className={isDark ? "text-slate-400" : "text-slate-600"} />
                </Link>
              </div>

              <div className="space-y-4">
                {COMPLIANCE_LOG.map((task) => {
                  const isCompleted = task.status === "completed";
                  const isWarning   = task.status === "warning";

                  return (
                    <motion.div
                      key={task.id}
                      variants={item}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-colors ${
                        isDark ? "bg-zinc-900 border-white/5 hover:border-white/10" : "bg-slate-50 border-slate-100 hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl ${
                          isCompleted ? (isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-100 text-emerald-700") :
                          isWarning   ? (isDark ? "bg-amber-500/10 text-amber-400"    : "bg-amber-100 text-amber-700")    :
                          (isDark ? "bg-zinc-800 text-slate-400" : "bg-slate-200 text-slate-600")
                        }`}>
                          {isCompleted ? <CheckCircle size={20} weight="fill" /> :
                           isWarning   ? <WarningCircle size={20} weight="fill" /> :
                           <ShieldCheck size={20} />}
                        </div>
                        <div>
                          <div className={`font-medium text-sm ${isDark ? "text-white" : "text-slate-800"}`}>{task.title}</div>
                          <div className={`text-xs mt-0.5 ${dim}`}>استحقاق: {task.due}</div>
                        </div>
                      </div>
                      <div className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                        isDark ? "bg-zinc-800 text-slate-400" : "bg-white border border-slate-200 text-slate-500"
                      }`}>
                        {task.type}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* AI Tools — 2×2 Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {AI_TOOLS.map((tool) => {
                const Icon = tool.Icon;
                return (
                  <Link href={tool.href} key={tool.href}>
                    <motion.div
                      variants={item}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.98 }}
                      transition={spring}
                      className={`h-full p-6 rounded-[2rem] border transition-all cursor-pointer ${
                        isDark
                          ? "bg-zinc-900/30 border-white/5 hover:bg-zinc-900/60 hover:border-white/10"
                          : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                      }`}
                    >
                      <div className={`w-11 h-11 flex items-center justify-center rounded-2xl mb-4 ${
                        isDark ? "bg-white/5 text-slate-300" : "bg-slate-100 text-slate-600"
                      }`}>
                        <Icon size={22} weight="duotone" />
                      </div>
                      <h3 className={`font-semibold text-sm mb-1.5 ${isDark ? "text-white" : "text-slate-900"}`}>{tool.label}</h3>
                      <p className={`text-xs leading-relaxed ${muted}`}>{tool.sub}</p>
                    </motion.div>
                  </Link>
                );
              })}
            </div>

          </motion.div>

          {/* RIGHT: Live Donations Feed ───────────────────────────────────────── */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className={`p-8 rounded-[2.5rem] border flex flex-col ${card}`}
          >
            <div className="flex items-center gap-3 mb-8">
              <div className={`p-2.5 rounded-2xl ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}>
                <CurrencyCircleDollar size={22} weight="duotone" className={isDark ? "text-emerald-400" : "text-emerald-700"} />
              </div>
              <div>
                <h2 className={`text-xl font-semibold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  سجل التبرعات
                </h2>
                <p className={`text-xs ${muted}`}>آخر المعاملات المالية الموثقة</p>
              </div>
            </div>

            {/* Timeline Feed */}
            <div className="flex-1 space-y-6">
              {RECENT_DONATIONS.map((don, i) => (
                <div key={don.id} className="relative">
                  {/* Vertical line */}
                  {i !== RECENT_DONATIONS.length - 1 && (
                    <div className={`absolute top-7 right-[10px] bottom-[-24px] w-px ${isDark ? "bg-white/5" : "bg-slate-100"}`} />
                  )}

                  <div className="flex items-start gap-4">
                    {/* Dot */}
                    <div className={`relative z-10 mt-1 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ring-4 ${
                      isDark ? "bg-emerald-500 ring-zinc-900" : "bg-emerald-600 ring-white"
                    }`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>

                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-medium text-sm truncate ${isDark ? "text-white" : "text-slate-800"}`}>
                          {don.donor}
                        </span>
                        <span className={`font-mono font-semibold text-sm whitespace-nowrap ${
                          isDark ? "text-emerald-400" : "text-emerald-700"
                        }`}>
                          {don.amount} ر.س
                        </span>
                      </div>
                      <div className={`flex items-center justify-between gap-2 mt-1 ${dim}`}>
                        <span className="text-xs">{don.project}</span>
                        <span className="text-xs">{don.time}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick nav links */}
            <div className={`mt-8 pt-6 border-t space-y-2 ${isDark ? "border-white/5" : "border-slate-100"}`}>
              {[
                { label: "السجل المالي الكامل",    href: "/dashboard/ngo/finance" },
                { label: "إدارة المتطوعين",        href: "/dashboard/ngo/volunteers" },
                { label: "سجل العقود والوثائق",    href: "/dashboard/ngo/contracts" },
              ].map((lnk) => (
                <Link key={lnk.href} href={lnk.href}
                  className={`flex items-center justify-between w-full py-2.5 px-3 rounded-xl text-sm transition-colors ${
                    isDark ? "text-slate-400 hover:bg-white/5 hover:text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {lnk.label}
                  <ArrowLeft size={14} />
                </Link>
              ))}
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
