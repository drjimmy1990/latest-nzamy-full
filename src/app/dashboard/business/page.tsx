"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Briefcase, UsersThree, Kanban, ChartLine,
  ArrowLeft, Plus, TrendUp, TrendDown,
  Warning, CheckCircle, Buildings, Scales,
  CurrencyDollar, Clock, CalendarCheck, Flag, Robot, PencilSimple,
  MagnifyingGlass, ShieldCheck, Envelope, Gavel, Storefront,
  ChatCircle, Scan, BookOpen, HandCoins, Users, Lightning,
  UserCircle, ChartBar, Money, FileText, Receipt, Bell as BellIcon,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import AddCaseModal from "./_components/AddCaseModal";
import LegalLibraryBanner from "@/components/LegalLibraryBanner";
import EscalationFlow from "@/components/EscalationFlow";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { BusinessProfileReadinessPanel } from "@/components/dashboard/business/BusinessProfileReadinessPanel";
import { ServiceModeView, LimitedRoleView } from "@/components/dashboard/business/BusinessSubViews";

// ─── Mock data ────────────────────────────────────────────────────────────────

const STATS = [
  { ar: "استشارات معلقة",  value: "٤",   icon: Briefcase,  trend: +2, trendLabel: "من الأقسام",              from: "from-[#0B3D2E]",   to: "to-[#155e41]",    href: "/dashboard/business/cases?status=pending" },
  { ar: "عقود سارية",      value: "٣٤",  icon: UsersThree, trend: +5, trendLabel: "تم تجديدها",               from: "from-blue-700",     to: "to-blue-500",     href: "/dashboard/business/employee-contracts" },
  { ar: "قضايا عمالية",    value: "٢",   icon: Scales,     trend: -1, trendLabel: "مقارنة بالشهر الماضي",    from: "from-[#b8974f]",   to: "to-[#C8A762]",    href: "/dashboard/business/cases?type=labor" },
  { ar: "معدل الامتثال",   value: "٩٢٪", icon: ChartLine,  trend: +4, trendLabel: "PDPL & ZATCA",             from: "from-purple-700",  to: "to-purple-500",   href: "/dashboard/business/health-check" },
];

const URGENT_DEADLINES = [
  { label: "تجديد عقد التوريد الرئيسي", date: "١٥ أبريل ٢٠٢٦", daysLeft: 7, severity: "urgent" as const },
  { label: "تسليم تقرير حوكمة البيانات", date: "٢٠ أبريل ٢٠٢٦", daysLeft: 12, severity: "warning" as const },
];

const INITIAL_REQUESTS = [
  { id: "NZ-REQ-102", title: "مراجعة اتفاقية سرية (NDA)", dept: "المبيعات", type: "مراجعة عقد", status: "high" as const, date: "اليوم ٩:٠٠ ص" },
  { id: "NZ-REQ-101", title: "تظلم موظف", dept: "الموارد البشرية", type: "نزاع عمالي", status: "mid" as const, date: "أمس ٢:٠٠ م" },
  { id: "NZ-REQ-099", title: "صياغة عقد تقديم خدمة", dept: "العمليات", type: "صياغة", status: "done" as const, date: "قبل يومين" },
];

const TEAM_LOAD = [
  { name: "نورة الزهراني", role: "مدير الشؤون القانونية", count: 6, max: 10 },
  { name: "فهد السبيعي", role: "مستشار عقود", count: 8, max: 10 },
  { name: "ريم القحطاني", role: "باحثة نظامية", count: 3, max: 10 },
];

const STATUS_STYLE = {
  high: "bg-red-500/10 text-red-500 border-red-500/20",
  mid: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  done: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};
const STATUS_AR = { high: "عاجل جداً", mid: "قيد المراجعة", done: "مكتمل" };

const AI_TOOLS = [
  { label: "محلل الصفقات والفرص", icon: MagnifyingGlass, hot: true,  desc: "دراسة جدوى ٣٦٠° قبل التوقيع",  href: "/ai/corp/deal-intel",          badge: "جديد" },
  { label: "مدقق الامتثال",       icon: ShieldCheck,     hot: false, desc: "جاهزية PDPL / ZATCA",           href: "/ai/corp/compliance-monitor", badge: null },
  { label: "صائغ العقود",         icon: PencilSimple,    hot: true,  desc: "باللغتين — AI + مراجعة",      href: "/ai/contracts",               badge: null },
  { label: "LegalMail",           icon: Envelope,        hot: false, desc: "تحليل المراسلات القانونية",     href: "/ai/mail-advisor",            badge: null },
];

// ─── Component ────────────────────────────────────────────────────────────────

// ── Subscription plan mock (replace with real user context when backend ready) ──
const BUSINESS_PLAN = {
  name: "Growth",
  requestsUsed: 12,
  requestsLimit: 20,
  consultationsUsed: 3,
  consultationsLimit: 5,
  aiQueriesUsed: 18,
  aiQueriesLimit: 30,
};

// ─── Role config ──────────────────────────────────────────────────────────────
const ROLE_CONFIG: Record<string, { label: string; color: string; subtitle: string }> = {
  owner:               { label: "مدير الشركة",             color: "from-[#0B3D2E] to-[#155e41]",  subtitle: "نظرة إدارية شاملة على الشركة" },
  legal_manager:       { label: "رئيس الشؤون القانونية",  color: "from-cyan-800 to-sky-600",     subtitle: "إدارة القضايا والأدوات القانونية" },
  department_head:     { label: "رئيس قسم",                color: "from-rose-700 to-pink-500",    subtitle: "طلباتي المعلقة وإجراءاتي" },
  legal_staff:         { label: "أخصائي قانوني",           color: "from-slate-600 to-slate-400",  subtitle: "مهامي وملفاتي فقط" },
  seconded:            { label: "مستشار منتدب",            color: "from-indigo-700 to-sky-500",   subtitle: "ملفاتي المنتدبة وساعات العمل المخصصة" },
  hr_manager:          { label: "مدير الموارد البشرية",    color: "from-purple-700 to-fuchsia-500", subtitle: "شؤون الموظفين وعقود العمل" },
  finance_manager:     { label: "المدير المالي",           color: "from-amber-600 to-yellow-500", subtitle: "التقارير المالية والتحصيل" },
  employee:            { label: "موظف عام",                color: "from-stone-600 to-stone-400",  subtitle: "طلباتي ومهامي" },
  compliance_officer:  { label: "مسؤول الامتثال",         color: "from-teal-700 to-cyan-500",    subtitle: "متابعة ZATCA و PDPL واللوائح" },
};

function ModeHandler({ setMode, isServiceMode }: { setMode: (m: "erp" | "service") => void, isServiceMode: boolean }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("mode") === "service" || isServiceMode) setMode("service");
  }, [searchParams, isServiceMode, setMode]);
  return null;
}

export default function BusinessOverviewPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const { currentCompanyFeatures, mounted: adminSettingsMounted } = useAdminSettings();
  const businessRole = (user as { businessRole?: string }).businessRole ?? "owner";
  const roleConf = ROLE_CONFIG[businessRole] ?? ROLE_CONFIG.owner;
  const isAdminServiceProfile =
    adminSettingsMounted &&
    (!currentCompanyFeatures.hasInternalLegal || currentCompanyFeatures.serviceModel === "advisory_only");
  const isServiceMode = (user as { businessType?: string }).businessType === "service" || isAdminServiceProfile;
  const isLimitedRole = ["department_head", "legal_staff", "seconded", "employee", "hr_manager", "finance_manager", "compliance_officer"].includes(businessRole);
  const canManageBilling = businessRole === "owner";
  const canShowQaRoleSwitcher = process.env.NODE_ENV !== "production" && businessRole === "owner";

  const [showAddCase, setShowAddCase] = useState(false);
  const [mode, setMode] = useState<"erp" | "service">("erp");
  const { lang } = useTheme();
  const isAr = lang === "ar";
  const [recentRequests, setRecentRequests] = useState(INITIAL_REQUESTS);

  const handleCaseAdded = (newCase: { id: string; title: string; type: string; dept: string; urgency: string }) => {
    setRecentRequests(prev => [{
      id: `NZ-${newCase.id}`,
      title: newCase.title,
      dept: newCase.dept,
      type: newCase.type,
      status: newCase.urgency === "حرجة" ? "high" as const : newCase.urgency === "عاجلة" ? "mid" as const : "done" as const,
      date: "الآن",
    }, ...prev]);
    setShowAddCase(false);
  };

  if (mode === "service") {
    return (
      <>
        <Suspense fallback={null}><ModeHandler setMode={setMode} isServiceMode={isServiceMode} /></Suspense>
        <ServiceModeView isDark={isDark} isAr={isAr} />
      </>
    );
  }

  // Limited view — department head / employee / seconded counsel sees trimmed dashboard
  if (isLimitedRole) {
    return (
      <>
        <Suspense fallback={null}><ModeHandler setMode={setMode} isServiceMode={isServiceMode} /></Suspense>
        <LimitedRoleView isDark={isDark} businessRole={businessRole} roleConf={roleConf} />
      </>
    );
  }

  const card = isDark
    ? "bg-zinc-900/80 border border-white/[0.06] rounded-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] transition-all hover:border-white/[0.12] hover:shadow-lg"
    : "bg-white border border-zinc-200/70 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,1)] transition-all hover:border-zinc-300 hover:shadow-lg";

  const fadeUp = {
    hidden: { opacity: 0, y: 15 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 90, damping: 18, delay: i * 0.05 } }),
  };

  return (
    <>
      <Suspense fallback={null}><ModeHandler setMode={setMode} isServiceMode={isServiceMode} /></Suspense>
      <div className={`p-5 md:p-8 space-y-6 max-w-[1400px] mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* -- Onboarding Welcome (first-visit only) -- */}
      <OnboardingBanner role="business" name={user.name} isDark={isDark} />

      {/* -- TEMPORARY ROLE SWITCHER FOR QA TESTING -- */}
      {canShowQaRoleSwitcher && (
        <div className={`p-4 mb-4 rounded-xl border border-dashed border-[#C8A762]/50 bg-[#C8A762]/5 flex flex-wrap gap-2 items-center`}>
          <span className="text-xs font-bold text-[#C8A762] uppercase tracking-widest me-4">QA Test Roles:</span>
          {["owner", "legal_manager", "hr_manager", "finance_manager", "compliance_officer", "department_head", "employee"].map(role => (
            <button
              key={role}
              onClick={() => {
                const current = JSON.parse(localStorage.getItem("nzamy_demo_role") || "{}");
                localStorage.setItem("nzamy_demo_role", JSON.stringify({ ...current, isLoggedIn: true, userType: "corporate", businessRole: role, name: "Demo " + role, tier: "max" }));
                window.location.reload();
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-md border ${businessRole === role ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : isDark ? "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100"}`}
            >
              {role}
            </button>
          ))}
        </div>
      )}

      <BusinessProfileReadinessPanel />

      {/* ── Header — Liquid Glass ─────────────────────────────────────────── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#0B3D2E] to-[#0d5238] p-7 shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.2)]"
      >
        <div className="absolute start-6 top-1/2 -translate-y-1/2 opacity-[0.07]">
          <Buildings size={140} weight="fill" />
        </div>
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-white uppercase tracking-wider">{user.name}</h1>
              <span className={`rounded-full border border-[#C8A762]/40 bg-[#C8A762]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#C8A762]`}>
                {roleConf.label} · {user.tier.toUpperCase()}
              </span>
            </div>
            <p className="text-emerald-300/70 text-sm">{roleConf.subtitle}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link href="/dashboard/business/kanban">
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.94 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="flex items-center gap-2 rounded-xl bg-white/[0.12] border border-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm"
              >
                <Kanban size={15} />
                لوحة الأقسام
              </motion.button>
            </Link>
            <motion.button
              onClick={() => setShowAddCase(true)}
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="flex items-center gap-2 rounded-xl bg-[#C8A762] px-4 py-2 text-sm font-bold text-[#0B3D2E] shadow-[0_4px_16px_-4px_rgba(200,167,98,0.5)] cursor-pointer"
            >
              <Plus size={15} weight="bold" />
              طلب قانوني جديد
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── Urgent Notice ─────────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}
        className={`p-4 rounded-2xl border flex gap-4 items-center ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#C8A762]/20 bg-amber-50/60"}`}
      >
        <div className="w-10 h-10 rounded-xl bg-[#0B3D2E] text-[#C8A762] flex items-center justify-center flex-shrink-0">
          <Robot size={20} weight="duotone" />
        </div>
        <div className="flex-1">
          <h4 className={`text-[13px] font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
            إخطار من السكرتير القانوني الذكي
          </h4>
          <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
            تم تحليل ٣ عقود موردين جديدة، واكتشاف ثغرات في بند تحمل المسئولية. الرجاء المراجعة.
          </p>
        </div>
        <Link href="/ai/secretary" className="flex items-center gap-1 text-[12px] font-bold text-[#C8A762] hover:underline flex-shrink-0">
          مراجعة التقرير <ArrowLeft size={11} />
        </Link>
      </motion.div>

      {/* ── Stats 4-col ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((s, i) => {
          const Icon = s.icon;
          const isUp = s.trend > 0;
          return (
            <Link key={i} href={s.href}>
              <motion.div variants={fadeUp} initial="hidden" animate="show" custom={i + 2}
                whileHover={{ y: -2, boxShadow: isDark ? "0 8px 24px -6px rgba(0,0,0,0.5)" : "0 8px 24px -6px rgba(0,0,0,0.12)" }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 350, damping: 22 }}
                className={`${card} p-5 cursor-pointer`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${s.from} ${s.to} shadow-md`}>
                    <Icon size={19} weight="fill" className="text-white" />
                  </div>
                  <span className={`flex items-center gap-0.5 text-[11px] font-bold px-2 py-1 rounded-full ${isUp ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600" : isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"}`}>
                    {isUp ? <TrendUp size={12} /> : <TrendDown size={12} />}
                    {isUp ? "+" : ""}{s.trend}
                  </span>
                </div>
                <p className={`text-xl font-bold mb-0.5 font-mono ${isDark ? "text-white" : "text-zinc-900"}`}>{s.value}</p>
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{s.ar}</p>
                <p className={`text-[10px] mt-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{s.trendLabel}</p>
              </motion.div>
            </Link>
          );
        })}
      </div>

      {/* ── Main 2-col grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Requests List — 2fr */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className={`xl:col-span-2 ${card} flex flex-col shadow-sm`}>
          <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
            <div className="flex items-center gap-2">
              <Briefcase size={17} weight="fill" className={isDark ? "text-emerald-400" : "text-[#0B3D2E]"} />
              <h2 className="font-bold text-[15px]">طلبات الإدارات المعلقة</h2>
            </div>
            <Link href="/dashboard/business/kanban" className="flex items-center gap-1 text-[#C8A762] text-sm font-medium hover:underline">
              عرض الكل <ArrowLeft size={13} />
            </Link>
          </div>
          <div className={`divide-y flex-1 ${isDark ? "divide-white/[0.04]" : "divide-zinc-50"}`}>
             {recentRequests.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-12 gap-3 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                <Briefcase size={32} weight="duotone" />
                <p className="text-sm font-medium">لا توجد طلبات معلقة</p>
                <button onClick={() => setShowAddCase(true)} className="text-xs font-bold text-[#C8A762] hover:underline">+ أضف طلباً جديداً</button>
              </div>
            ) : recentRequests.map((c) => (
              <Link key={c.id} href="/dashboard/business/kanban" className={`flex items-center gap-4 px-6 py-4 transition-colors cursor-pointer ${isDark ? "hover:bg-white/[0.04]" : "hover:bg-zinc-50/80"}`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.status === "high" ? "bg-red-400 animate-pulse" : c.status === "mid" ? "bg-amber-400" : "bg-emerald-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] font-bold mb-1 truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{c.title}</p>
                  <div className={`flex items-center gap-2 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    <span className="font-mono">{c.id}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Buildings size={12} /> {c.dept}</span>
                    <span>·</span>
                    <span>{c.date}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center border rounded-md px-2 py-1 text-[10px] font-bold ${STATUS_STYLE[c.status]}`}>
                    {STATUS_AR[c.status]}
                  </span>
                  <span className={`text-[10px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{c.type}</span>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Right Sidebar: Deadlines & AI Tools */}
        <div className="space-y-5">
          {/* Deadlines */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4} className={`${card} p-5 shadow-sm`}>
            <div className="flex items-center gap-2 mb-4">
              <Flag size={15} weight="fill" className="text-red-500" />
              <h2 className="font-bold text-[14px]">مواعيد حرجة</h2>
            </div>
            <div className="space-y-3">
              {URGENT_DEADLINES.map((d, i) => (
                <div key={i} className={`p-3.5 rounded-xl border ${isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className={`text-[12px] font-bold ${isDark ? "text-red-400" : "text-red-600"}`}>{d.label}</p>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`flex items-center gap-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}><CalendarCheck size={12} /> {d.date}</span>
                    <span className="font-bold text-red-500">متبقي {d.daysLeft} أيام</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* AI Tools */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5} className={`${card} p-5 shadow-sm`}>
            <h2 className={`font-bold text-[14px] flex items-center gap-2 mb-4 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
              <Robot size={15} className="text-[#C8A762]" weight="duotone" /> أدوات قانونية ذكية
            </h2>

            {/* Deal Intel featured card */}
            <Link href="/ai/corp/deal-intel"
              className={`group flex items-center gap-3 p-4 rounded-2xl border mb-3 transition-all hover:scale-[1.01] ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5 hover:bg-[#C8A762]/8" : "border-amber-200 bg-amber-50/60 hover:bg-amber-50"}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-[#0B3D2E] to-emerald-700 shadow`}>
                <MagnifyingGlass size={18} weight="duotone" className="text-[#C8A762]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>محلل الصفقات والفرص</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-amber-900/30 text-amber-400" : "bg-amber-100 text-amber-700"}`}>جديد</span>
                </div>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>دراسة جدوى ٣٦٠° قانونية + تجارية + مخاطر</p>
              </div>
              <ArrowLeft size={13} className={isDark ? "text-zinc-600" : "text-slate-400"} />
            </Link>

            <div className="space-y-2">
              {AI_TOOLS.filter(t => t.label !== "محلل الصفقات والفرص").map((tool, i) => {
                const Icon = tool.icon;
                return (
                  <Link key={i} href={tool.href} className={`group flex items-center gap-3 p-3 rounded-xl border transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-[#0B3D2E]/10" : "border-zinc-100 hover:bg-[#0B3D2E]/5"}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDark ? "bg-white/[0.04] text-[#C8A762]" : "bg-zinc-100 text-[#0B3D2E]"}`}>
                      <Icon size={18} weight="duotone" />
                    </div>
                    <div className="flex-1">
                      <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{tool.label}</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{tool.desc}</p>
                    </div>
                    {tool.badge && <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#0B3D2E] text-white">{tool.badge}</span>}
                  </Link>
                );
              })}
            </div>
          </motion.div>
          
          {/* Seconded Counsel Widget */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6} className={`${card} p-5 shadow-sm`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`font-bold text-[14px] flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                <UserCircle size={18} className="text-royal" weight="duotone" /> المستشار المنتدب
              </h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>نشط</span>
            </div>
            
            <div className={`p-4 rounded-xl border flex items-center gap-4 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-zinc-100 bg-zinc-50"}`}>
              <div className="relative">
                <img src="https://ui-avatars.com/api/?name=أحمد+سالم&background=0B3D2E&color=C8A762" alt="المستشار" className="w-12 h-12 rounded-full object-cover border-2 shadow-sm" style={{borderColor: isDark ? "#27272a" : "#fff"}} />
                <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2" style={{borderColor: isDark ? "#27272a" : "#fff"}}></div>
              </div>
              <div className="flex-1">
                <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>أ. أحمد سالم</p>
                <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>مكتب المنشاوي وشركاه</p>
              </div>
            </div>
            
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className={isDark ? "text-zinc-400" : "text-zinc-500"}>الساعات المتبقية هذا الشهر</span>
                <span className="font-bold font-mono">١٢ / ٤٠</span>
              </div>
              <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-zinc-200"}`}>
                <div className="h-full bg-royal w-[30%] rounded-full"></div>
              </div>
            </div>
            
            <Link href="/dashboard/business/cases" className={`mt-4 w-full py-2.5 rounded-xl border text-[12px] font-bold flex items-center justify-center gap-2 transition-colors ${
              isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}>
              إدارة الانتداب
            </Link>
          </motion.div>
        </div>
      </div>

      {/* ── Subscription Plan Banner ─────────────────────────────────────────── */}
      {canManageBilling && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={7}
          className={`rounded-2xl border p-5 ${isDark ? 'border-white/[0.06] bg-zinc-900' : 'border-zinc-200 bg-white'} shadow-sm`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CurrencyDollar size={16} weight="duotone" className="text-[#C8A762]" />
              <h2 className={`font-bold text-[14px] ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>باقتك الحالية — {BUSINESS_PLAN.name}</h2>
            </div>
            <Link href="/dashboard/business/wallet" className="text-[11px] font-bold text-[#C8A762] hover:underline">ترقية الباقة</Link>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "الطلبات القانونية", used: BUSINESS_PLAN.requestsUsed, limit: BUSINESS_PLAN.requestsLimit },
              { label: "الاستشارات", used: BUSINESS_PLAN.consultationsUsed, limit: BUSINESS_PLAN.consultationsLimit },
              { label: "استعلامات AI", used: BUSINESS_PLAN.aiQueriesUsed, limit: BUSINESS_PLAN.aiQueriesLimit },
            ].map(({ label, used, limit }) => {
              const pct = Math.min((used / limit) * 100, 100);
              const isNear = pct >= 80;
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[11px] font-semibold ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>{label}</span>
                    <span className={`text-[11px] font-bold font-mono ${isNear ? 'text-amber-500' : isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>{used}/{limit}</span>
                  </div>
                  <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/[0.06]' : 'bg-zinc-100'}`}>
                    <div
                      className={`h-full rounded-full transition-all ${isNear ? 'bg-amber-500' : 'bg-[#0B3D2E]'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {isNear && <p className="text-[10px] text-amber-500 mt-1 font-bold">اقتربت من الحد — فكّر في الترقية</p>}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ── Library + Escalation ── */}
      <LegalLibraryBanner variant="compact" />
      <EscalationFlow complexityScore={55} variant="banner" onDismiss={() => {}} />

      <AnimatePresence>
        {showAddCase && <AddCaseModal onClose={() => setShowAddCase(false)} isDark={isDark} onCaseAdded={handleCaseAdded} />}
      </AnimatePresence>

    </div>
    </>
  );
}


