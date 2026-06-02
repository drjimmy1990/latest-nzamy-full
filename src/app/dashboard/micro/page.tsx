"use client";

import { motion } from "framer-motion";
import { useUser } from "@/hooks/useUser";
import Link from "next/link";
import {
  Robot, ChatCircle, Scan, Briefcase, ShieldStar,
  Percent, Buildings, Warning, CheckCircle, ArrowLeft,
  FileText, Storefront, Scales, Users, Gavel,
  Lightning, BookOpen, HandCoins, CalendarBlank,
  TrendUp, MagnifyingGlass, PencilSimple,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import LegalLibraryBanner from "@/components/LegalLibraryBanner";
import EscalationFlow from "@/components/EscalationFlow";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { SectorProfileReadinessPanel } from "@/components/dashboard/sector/SectorProfileReadinessPanel";

// ─── Spring config (design-taste-frontend: MOTION_INTENSITY 6) ───────────────
const spring = { type: "spring" as const, stiffness: 100, damping: 20 };

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { ...spring, delay: i * 0.06 },
  }),
};

// ─── Mock Data ────────────────────────────────────────────────────────────────
const REQUIREMENTS_MOCK = [
  { labelAr: "رخصة البلدية",          labelEn: "Municipal License",       status: "completed",   expiresAr: "٢٠٢٦/٠٩/١٤", expiresEn: "2026/09/14", icon: Buildings,  href: "/dashboard/micro/requirements/municipality", actionAr: "عرض الرخصة",     actionEn: "View license" },
  { labelAr: "شهادة الزكاة والضريبة", labelEn: "Zakat & Tax Certificate", status: "needs_action", expiresAr: "٢٠٢٥/٠٥/٢٠", expiresEn: "2025/05/20", icon: Percent,    href: "/dashboard/micro/requirements/zakat",        actionAr: "ابدأ التجديد",   actionEn: "Renew now" },
  { labelAr: "التأمينات الاجتماعية",  labelEn: "Social Insurance",        status: "in_progress",  expiresAr: "دورية",         expiresEn: "Recurring",  icon: ShieldStar, href: "/dashboard/micro/requirements/gosi",         actionAr: "استكمل المتابعة", actionEn: "Continue" },
  { labelAr: "سجل تجاري",             labelEn: "Commercial Register",     status: "completed",   expiresAr: "٢٠٢٦/١١/٠١", expiresEn: "2026/11/01", icon: Briefcase,  href: "/dashboard/micro/requirements/licenses",     actionAr: "عرض السجل",      actionEn: "View record" },
];

const QUICK_LINKS = [
  { labelAr: "تسجيل علامة تجارية", labelEn: "Trademark",        href: "/services/business/trademark",        icon: ShieldStar },
  { labelAr: "تأسيس شركة",         labelEn: "Company Formation", href: "/services/business/company-formation", icon: Buildings  },
  { labelAr: "استشارة قانونية",    labelEn: "Consultation",      href: "/services/consultations",              icon: ChatCircle },
  { labelAr: "صياغة عقود",         labelEn: "Contracts",         href: "/services/contracts",                  icon: FileText   },
  { labelAr: "المكتبة القانونية",  labelEn: "Legal Library",     href: "/laws",                                icon: BookOpen   },
];

const NAV_LINKS = [
  { hrefSuffix: "/contracts",  labelAr: "عقودي",            labelEn: "My Contracts",  icon: Briefcase  },
  { hrefSuffix: "/documents",  labelAr: "مستنداتي",          labelEn: "My Documents",  icon: Scan       },
  { hrefSuffix: "/marketplace",labelAr: "سوق المهنيين",      labelEn: "Marketplace",   icon: Storefront },
  { href: "/laws",             labelAr: "المكتبة القانونية", labelEn: "Legal Library", icon: BookOpen   },
];

const AI_TOOLS = [
  { href: "/ai/legal-opinion", labelAr: "اسأل سؤالاً قانونياً", labelEn: "Ask a Legal Question", descAr: "إجابة فورية",          descEn: "Instant answer",          icon: ChatCircle, primary: true },
  { href: "/ai/analyze",       labelAr: "افحص مستنداً",           labelEn: "Scan a Document",      descAr: "عقد أو إشعار",         descEn: "Contract or notice",      icon: Scan,       primary: false },
  { href: "/ai/micro",         labelAr: "مساعد المنشآت",          labelEn: "Business Assistant",   descAr: "أسئلة خاصة بنشاطك",    descEn: "Business-specific AI",   icon: Robot,      primary: false },
];

const CONTRACT_TEMPLATES = [
  { labelAr: "عقد عمل",    labelEn: "Employment Contract", icon: Users    },
  { labelAr: "عقد إيجار",  labelEn: "Lease Agreement",     icon: Buildings },
  { labelAr: "عقد خدمات",  labelEn: "Service Agreement",   icon: HandCoins },
  { labelAr: "عقد شراكة",  labelEn: "Partnership",         icon: Scales   },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MicroDashboardPage() {
  const { name, businessType } = useUser();
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const dir  = isAr ? "rtl" : "ltr";

  const base  = isDark ? "bg-zinc-900/60 border-white/[0.06]"        : "bg-white border-slate-100 shadow-sm";
  const card  = `rounded-2xl border ${base}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  const activeReqs  = REQUIREMENTS_MOCK.filter(r => r.status === "completed").length;
  const warningReqs = REQUIREMENTS_MOCK.filter(r => r.status === "needs_action").length;

  return (
    <div className="max-w-[960px] mx-auto space-y-5 px-4 py-6" dir={dir}>

      {/* -- Onboarding Welcome (first-visit only) -- */}
      <OnboardingBanner role="micro" name={name} isDark={isDark} />

      <SectorProfileReadinessPanel sector="micro" />


      {/* ── Header ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
            {isAr ? `أهلاً، ${name || "صاحب المنشأة"}` : `Hello, ${name || "Business Owner"}`}
          </h1>
          <p className={`text-sm ${muted}`}>
            {businessType
              ? (isAr ? `نظرة سريعة على اشتراطات ${businessType}` : `Quick look at ${businessType} requirements`)
              : (isAr ? "لوحة التحكم — منشأتك دائماً في أمان" : "Dashboard — your business always protected")}
          </p>
        </div>
        <Link href="/dashboard/micro/wallet"
          className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold border transition-opacity hover:opacity-80 ${
            isDark ? "bg-[#0B3D2E]/30 text-emerald-400 border-[#0B3D2E]/40" : "bg-[#0B3D2E]/8 text-[#0B3D2E] border-[#0B3D2E]/12"
          }`}>
          <Lightning size={12} weight="fill" />
          {isAr ? "المنشأة الذكية" : "Smart Business"}
        </Link>
      </motion.div>

      {/* ── BENTO KPIs — asymmetric 2fr 1fr (DESIGN_VARIANCE 8) ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>

        {/* Large KPI — اشتراطات نشطة */}
        <div className={`sm:col-span-2 ${card} p-5 flex items-center gap-4`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
            isDark ? "bg-emerald-500/10" : "bg-emerald-50"
          }`}>
            <CheckCircle size={22} weight="fill" className="text-emerald-500" />
          </div>
          <div>
            <p className={`text-[28px] font-black font-mono leading-none ${isDark ? "text-white" : "text-slate-900"}`}>
              {isAr ? activeReqs.toLocaleString("ar-SA") : activeReqs}
            </p>
            <p className={`text-[12px] mt-0.5 ${muted}`}>{isAr ? "اشتراطات نشطة" : "Active Requirements"}</p>
          </div>
          <div className="ms-auto flex flex-col items-end gap-1">
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
              <TrendUp size={11} weight="bold" />
              {isAr ? "محدّث" : "Updated"}
            </span>
            {warningReqs > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500">
                <Warning size={11} weight="fill" />
                {isAr ? `${warningReqs} تنتهي قريباً` : `${warningReqs} expiring soon`}
              </span>
            )}
          </div>
        </div>

        {/* Small KPI — AI اليوم */}
        <div className={`${card} p-4 flex flex-col justify-between`}>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${isDark ? "bg-[#0B3D2E]/30" : "bg-[#0B3D2E]/8"}`}>
            <Robot size={16} weight="duotone" className={isDark ? "text-emerald-400" : "text-[#0B3D2E]"} />
          </div>
          <p className={`text-[22px] font-black font-mono leading-none ${isDark ? "text-white" : "text-slate-900"}`}>
            {isAr ? "ظ£" : "3"}
            <span className={`text-[12px] font-normal ${muted}`}>/30</span>
          </p>
          <p className={`text-[11px] ${muted}`}>{isAr ? "استفسارات AI اليوم" : "AI Queries Today"}</p>
        </div>
      </motion.div>

      {/* ── Quick Links ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}>
        <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${muted}`}>
          {isAr ? "خدمات سريعة لمنشأتك" : "Quick Business Services"}
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div key={item.href} custom={i} variants={fadeUp} initial="hidden" animate="show">
                <Link href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all hover:scale-[1.03] active:scale-[0.98] ${
                    isDark
                      ? "border-white/[0.07] bg-white/[0.03] text-zinc-300 hover:border-[#C8A762]/30 hover:text-[#C8A762]"
                      : "border-slate-200 text-slate-600 hover:border-[#0B3D2E]/25 hover:text-[#0B3D2E] hover:bg-[#0B3D2E]/[0.03]"
                  }`}>
                  <Icon size={13} weight="duotone" />
                  {isAr ? item.labelAr : item.labelEn}
                </Link>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* ── Requirements Status ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3} className={card}>
        <div className="flex items-center justify-between mb-4 p-5 pb-0">
          <h2 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
            {isAr ? "اشتراطات نشاطي" : "Business Requirements"}
          </h2>
          <Link href="/dashboard/micro/requirements"
            className={`text-xs font-semibold flex items-center gap-1 ${isDark ? "text-emerald-400 hover:text-emerald-300" : "text-[#0B3D2E] hover:underline"}`}>
            {isAr ? "تفاصيل" : "Details"} <ArrowLeft size={11} />
          </Link>
        </div>
        <div className="px-5 pb-5 space-y-2">
          {REQUIREMENTS_MOCK.map((req, i) => {
            const Icon = req.icon;
            const isWarn = req.status === "needs_action";
            const isProgress = req.status === "in_progress";
            const StatusIcon = isWarn ? Warning : isProgress ? CalendarBlank : CheckCircle;
            const statusLabel = isWarn
              ? (isAr ? "مطلوب" : "Required")
              : isProgress
              ? (isAr ? "قيد المتابعة" : "In progress")
              : (isAr ? "مكتمل" : "Done");
            return (
              <motion.div key={i}
                custom={i} variants={fadeUp} initial="hidden" animate="show"
                className={`flex flex-col gap-3 p-3 rounded-xl border sm:flex-row sm:items-center ${
                  isWarn
                    ? isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"
                    : isProgress
                    ? isDark ? "border-sky-500/20 bg-sky-500/5" : "border-sky-200 bg-sky-50"
                    : isDark ? "border-white/[0.04] bg-white/[0.02]" : "border-slate-100 bg-slate-50/60"
                }`}>
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 relative ${
                    isWarn
                      ? "bg-amber-500/15 text-amber-500"
                      : isProgress
                      ? "bg-sky-500/15 text-sky-500"
                      : "bg-[#0B3D2E]/8 text-[#0B3D2E] dark:text-emerald-400"
                  }`}>
                    <Icon size={15} weight="duotone" />
                    {isWarn && (
                      <span className="absolute -top-0.5 -end-0.5 w-2 h-2 rounded-full bg-amber-500 animate-pulse border-2 border-white dark:border-zinc-900" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-[13px] font-medium ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                        {isAr ? req.labelAr : req.labelEn}
                      </p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isWarn
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : isProgress
                          ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                          : "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                      }`}>
                        <StatusIcon size={11} weight="fill" />
                        {statusLabel}
                      </span>
                    </div>
                    <p className={`text-[11px] font-mono ${muted}`}>
                      {isAr ? `تنتهي: ${req.expiresAr}` : `Expires: ${req.expiresEn}`}
                    </p>
                  </div>
                </div>
                <Link href={req.href}
                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition sm:w-auto ${
                    isWarn
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : isDark ? "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                  }`}>
                  {isAr ? req.actionAr : req.actionEn}
                  <ArrowLeft size={12} />
                </Link>
              </motion.div>
            );
          })}

          {/* Warning notice — no emoji */}
          {REQUIREMENTS_MOCK.some(r => r.status === "needs_action") && (
            <div className={`mt-1 flex items-start gap-2 p-3 rounded-xl border text-[12px] ${
              isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"
            }`}>
              <Warning size={13} weight="fill" className="flex-shrink-0 mt-0.5" />
              <span>{isAr ? "شهادة الزكاة والضريبة تنتهي قريباً — يُنصح بالتجديد فور الإمكان" : "Zakat certificate expiring soon — renew before deadline"}</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── AI Tools — Asymmetric 2+1 (not 3-equal-columns) ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4} className={card}>
        <div className={`flex items-center gap-2 px-5 pt-5 pb-3`}>
          <Robot size={14} weight="duotone" className="text-[#C8A762]" />
          <p className={`text-[11px] font-bold uppercase tracking-wider ${muted}`}>
            {isAr ? "المساعد الذكي" : "AI Assistant"}
          </p>
        </div>

        {/* Asymmetric: primary tool large, 2 secondary smaller */}
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
          {/* Primary — large */}
          {(() => {
            const tool = AI_TOOLS[0];
            const Icon = tool.icon;
            return (
              <Link key={tool.href} href={tool.href}
                className={`flex flex-col gap-3 p-4 rounded-2xl border transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5 hover:border-[#C8A762]/40" : "border-[#0B3D2E]/15 bg-[#0B3D2E]/[0.03] hover:border-[#0B3D2E]/30"
                }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-[#C8A762]/10" : "bg-[#0B3D2E]/8"}`}>
                  <Icon size={20} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
                </div>
                <div>
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
                    {isAr ? tool.labelAr : tool.labelEn}
                  </p>
                  <p className={`text-[11px] mt-0.5 ${muted}`}>{isAr ? tool.descAr : tool.descEn}</p>
                </div>
              </Link>
            );
          })()}

          {/* Secondary tools */}
          {AI_TOOLS.slice(1).map((tool) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.href} href={tool.href}
                className={`flex flex-col gap-2 p-4 rounded-2xl border transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]" : "border-slate-100 hover:border-[#0B3D2E]/20 hover:bg-[#0B3D2E]/[0.02]"
                }`}>
                <Icon size={18} weight="duotone" className={isDark ? "text-zinc-400" : "text-slate-500"} />
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                  {isAr ? tool.labelAr : tool.labelEn}
                </p>
                <p className={`text-[10px] ${muted}`}>{isAr ? tool.descAr : tool.descEn}</p>
              </Link>
            );
          })}
        </div>
      </motion.div>

      {/* ── Contract Templates ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5} className={card}>
        <div className="px-5 pt-5 pb-3">
          <p className={`text-[11px] font-bold uppercase tracking-wider ${muted}`}>
            {isAr ? "قوالب عقود جاهزة" : "Contract Templates"}
          </p>
        </div>
        <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CONTRACT_TEMPLATES.map((tpl, i) => {
            const Icon = tpl.icon;
            return (
              <motion.button key={tpl.labelAr} custom={i} variants={fadeUp} initial="hidden" animate="show"
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors text-center ${
                  isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]" : "border-slate-100 hover:border-[#0B3D2E]/20 hover:bg-[#0B3D2E]/[0.02]"
                }`}>
                <Icon size={20} weight="duotone" className={isDark ? "text-zinc-400" : "text-[#0B3D2E]"} />
                <span className={`text-[11px] font-medium ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                  {isAr ? tpl.labelAr : tpl.labelEn}
                </span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ── Find a Lawyer ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6}
        className={`rounded-2xl border-2 border-dashed p-5 flex items-center gap-4 ${
          isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#C8A762]/30 bg-amber-50/50"
        }`}>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#C8A762]/15">
          <Gavel size={22} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div className="flex-1">
          <p className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
            {isAr ? "تحتاج محامي؟" : "Need a Lawyer?"}
          </p>
          <p className={`text-xs mt-0.5 ${muted}`}>
            {isAr ? "وصّلك بمحامي متخصص في نوع مشكلتك" : "Connect with a specialist — seriousness deposit only"}
          </p>
        </div>
        <Link href="/dashboard/client/find-lawyer"
          className="shrink-0 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0a3328] transition-colors">
          {isAr ? "ابحث عن محامي" : "Find a Lawyer"}
        </Link>
      </motion.div>

      {/* ── Nav Links ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={7}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {NAV_LINKS.map(({ href, hrefSuffix, labelAr, labelEn, icon: Icon }, i) => (
          <motion.div key={labelAr} custom={i} variants={fadeUp} initial="hidden" animate="show">
            <Link href={href ?? `/dashboard/micro${hrefSuffix}`}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
                isDark ? "border-white/[0.05] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05]" : "border-slate-100 text-slate-600 hover:bg-slate-50"
              }`}>
              <Icon size={17} weight="duotone" className={isDark ? "text-zinc-400" : "text-[#0B3D2E]"} />
              <span className="text-[12px] font-medium flex-1">{isAr ? labelAr : labelEn}</span>
              <ArrowLeft size={13} className={`opacity-30 ${isAr ? "" : "rotate-180"}`} />
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <LegalLibraryBanner variant="compact" />

      <EscalationFlow legalArea="commercial" complexityScore={55} variant="inline" />
    </div>
  );
}
