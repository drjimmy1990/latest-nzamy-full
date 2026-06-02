"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Gavel,
  ChatCircle,
  ArrowLeft,
  Robot,
  Scan,
  Users,
  Buildings,
  HandCoins,
  ShieldCheck,
  Storefront,
  Briefcase,
  BookOpen,
  Lightning,
  Warning,
  Clock,
  ChartBar,
  FileText,
  Kanban,
  Bell as BellIcon,
  ChartLine,
  CurrencyDollar,
  Money,
  Receipt,
  Plus,
  Scales,
  PencilSimple,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { BusinessProfileReadinessPanel } from "@/components/dashboard/business/BusinessProfileReadinessPanel";
import LegalLibraryBanner from "@/components/LegalLibraryBanner";
import EscalationFlow from "@/components/EscalationFlow";

type ActionItem = { label: string; desc: string; href: string; icon: React.ElementType };

// ─── Service Mode View ────────────────────────────────────────────────────────
interface ServiceModeViewProps {
  isDark: boolean;
  isAr: boolean;
}

export function ServiceModeView({ isDark, isAr }: ServiceModeViewProps) {
  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  const t = {
    greeting:            isAr ? "أهلاً بك في لوحة التحكم" : "Welcome to Your Dashboard",
    subtitle:            isAr ? "خدمات قانونية مصممة لشركتك — بدون تعقيد" : "Legal services designed for your business — without complexity",
    aiTitle:             isAr ? "المساعد القانوني الذكي" : "Smart Legal Assistant",
    findLawyer:          isAr ? "ابحث عن محامي" : "Find a Lawyer",
    findLawyerDesc:      isAr ? "وصّلك بمحامٍ متخصص في نوع مشكلتك" : "Connect with a specialist for your issue",
    bookConsultation:    isAr ? "احجز استشارة" : "Book Consultation",
    bookConsultationDesc:isAr ? "جلسة فيديو أو هاتف مع مستشار قانوني" : "Video or phone session with a legal advisor",
    templates:           isAr ? "قوالب عقود جاهزة" : "Contract Templates",
    marketplace:         isAr ? "سوق المهنيين" : "Professional Marketplace",
    myCases:             isAr ? "قضاياي" : "My Cases",
    myContracts:         isAr ? "عقودي" : "My Contracts",
    legalLibrary:        isAr ? "المكتبة القانونية" : "Legal Library",
    aiAsk:               isAr ? "اسأل سؤالاً قانونياً" : "Ask a Legal Question",
    aiAskDesc:           isAr ? "إجابة فورية بالذكاء الاصطناعي" : "Instant AI-powered answer",
    aiScan:              isAr ? "افحص عقداً أو مستنداً" : "Scan a Contract or Document",
    aiScanDesc:          isAr ? "تحليل سريع للمخاطر والثغرات" : "Quick risk & gap analysis",
    tplLabor:            isAr ? "عقد عمل" : "Employment Contract",
    tplLease:            isAr ? "عقد إيجار" : "Lease Agreement",
    tplService:          isAr ? "عقد خدمات" : "Service Agreement",
    tplNDA:              isAr ? "اتفاقية سرية" : "NDA",
    upgradeTitle:        isAr ? "هل تحتاج نظام ERP كامل؟" : "Need a Full ERP System?",
    upgradeDesc:         isAr ? "لو عندكم قسم قانوني داخلي — ترقّوا لوضع الإدارة القانونية" : "If you have an in-house legal team — upgrade to Legal Management mode",
    upgradeBtn:          isAr ? "اكتشف وضع ERP" : "Explore ERP Mode",
  };

  return (
    <div className={`p-5 md:p-8 space-y-5 max-w-[960px] mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir={isAr ? "rtl" : "ltr"}>

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
          {t.greeting}
        </h1>
        <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          {t.subtitle}
        </p>
      </motion.div>

      <BusinessProfileReadinessPanel compact />

      {/* ── Top 2: Find Lawyer + Book Consultation ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Link href="/dashboard/business/cases" className={`${card} p-6 flex items-center gap-4 transition-all hover:scale-[1.01] hover:shadow-md`}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-emerald-700 shadow-md">
              <Gavel size={22} weight="duotone" className="text-[#C8A762]" />
            </div>
            <div>
              <p className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{t.findLawyer}</p>
              <p className={`text-xs ${isDark ? "text-zinc-500" : "text-slate-400"} mt-0.5`}>{t.findLawyerDesc}</p>
            </div>
            <ArrowLeft size={14} className={`ms-auto opacity-40 ${isAr ? "" : "rotate-180"}`} />
          </Link>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Link href="/dashboard/client/consultation/new" className={`${card} p-6 flex items-center gap-4 transition-all hover:scale-[1.01] hover:shadow-md`}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#b8974f] to-[#C8A762] shadow-md">
              <ChatCircle size={22} weight="duotone" className="text-white" />
            </div>
            <div>
              <p className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{t.bookConsultation}</p>
              <p className={`text-xs ${isDark ? "text-zinc-500" : "text-slate-400"} mt-0.5`}>{t.bookConsultationDesc}</p>
            </div>
            <ArrowLeft size={14} className={`ms-auto opacity-40 ${isAr ? "" : "rotate-180"}`} />
          </Link>
        </motion.div>
      </div>

      {/* ── AI Quick Access ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className={`${card} p-5`}>
        <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          {t.aiTitle}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link href="/ai/consult" className={`flex items-center gap-3 p-4 rounded-xl border transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]" : "border-slate-100 hover:border-royal/20 hover:bg-royal/[0.02]"}`}>
            <Robot size={20} weight="duotone" className="text-royal" />
            <div>
              <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{t.aiAsk}</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{t.aiAskDesc}</p>
            </div>
          </Link>
          <Link href="/ai/analyze" className={`flex items-center gap-3 p-4 rounded-xl border transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]" : "border-slate-100 hover:border-royal/20 hover:bg-royal/[0.02]"}`}>
            <Scan size={20} weight="duotone" className="text-royal" />
            <div>
              <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{t.aiScan}</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{t.aiScanDesc}</p>
            </div>
          </Link>
        </div>
      </motion.div>

      {/* ── Contract Templates ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`${card} p-5`}>
        <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          {t.templates}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: t.tplLabor,   icon: Users,       type: "labor" },
            { label: t.tplLease,   icon: Buildings,   type: "lease" },
            { label: t.tplService, icon: HandCoins,   type: "service" },
            { label: t.tplNDA,     icon: ShieldCheck, type: "nda" },
          ].map((tpl) => {
            const Icon = tpl.icon;
            return (
              <Link key={tpl.label} href={`/ai/contracts?type=${tpl.type}`}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all hover:scale-[1.02] text-center ${
                  isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]" : "border-slate-100 hover:border-royal/20 hover:bg-royal/[0.02]"
                }`}
              >
                <Icon size={20} weight="duotone" className="text-royal" />
                <span className={`text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{tpl.label}</span>
              </Link>
            );
          })}
        </div>
      </motion.div>

      {/* ── Quick Links ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/dashboard/business/cases",             label: t.myCases,      icon: Scales },
          { href: "/dashboard/business/marketplace",       label: t.marketplace,  icon: Storefront },
          { href: "/dashboard/business/employee-contracts", label: t.myContracts, icon: Briefcase },
          { href: "/laws",                                 label: t.legalLibrary, icon: BookOpen },
        ].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${isDark ? "border-white/[0.05] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05]" : "border-slate-100 text-slate-600 hover:bg-slate-50"}`}
          >
            <Icon size={18} weight="duotone" className="text-royal" />
            <span className="text-[12px] font-medium flex-1">{label}</span>
            <ArrowLeft size={14} className={`opacity-40 ${isAr ? "" : "rotate-180"}`} />
          </Link>
        ))}
      </div>

      {/* ── Library + Escalation ── */}
      <LegalLibraryBanner variant="compact" />
      <EscalationFlow complexityScore={55} variant="banner" onDismiss={() => {}} />

      {/* ── Upgrade CTA ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className={`rounded-2xl border-2 border-dashed p-5 flex flex-col sm:flex-row items-center gap-4 ${
          isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#C8A762]/30 bg-amber-50/50"
        }`}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0B3D2E] text-[#C8A762]">
          <Lightning size={24} weight="fill" />
        </div>
        <div className="flex-1 text-center sm:text-start">
          <p className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{t.upgradeTitle}</p>
          <p className={`text-xs ${isDark ? "text-zinc-400" : "text-slate-500"} mt-0.5`}>{t.upgradeDesc}</p>
        </div>
        <Link
          href="?mode=erp"
          className="shrink-0 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-xs font-bold text-[#C8A762] shadow-sm hover:bg-[#155e41] transition-colors"
        >
          {t.upgradeBtn}
        </Link>
      </motion.div>
    </div>
  );
}

// ─── Limited Role View ────────────────────────────────────────────────────────
interface LimitedRoleViewProps {
  isDark: boolean;
  businessRole: string;
  roleConf: { label: string; color: string; subtitle: string };
}

export function LimitedRoleView({
  isDark,
  businessRole,
  roleConf,
}: LimitedRoleViewProps) {
  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  // ── HR Manager: dedicated HR-only dashboard ─────────────────────────────────
  if (businessRole === "hr_manager") {
    return (
      <div className={`p-5 md:p-8 space-y-5 max-w-[900px] mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
        {/* Role Header */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className={`relative overflow-hidden rounded-[2rem] p-6 bg-gradient-to-l ${roleConf.color} shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]`}
        >
          <div className="absolute start-4 top-1/2 -translate-y-1/2 opacity-[0.08]"><Users size={110} weight="fill" /></div>
          <div className="relative">
            <span className="inline-block rounded-full bg-white/10 border border-white/20 px-3 py-1 text-[11px] font-bold text-white/80 mb-3">{roleConf.label}</span>
            <h1 className="text-xl font-bold text-white">{roleConf.subtitle}</h1>
            <p className="text-white/50 text-xs mt-1">لوحة تحكم الموارد البشرية</p>
          </div>
        </motion.div>

        {/* HR KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "موظفون نشطون",        value: "١٤٧",  icon: Users,      from: "from-[#0B3D2E]", to: "to-[#155e41]" },
            { label: "عقود قاربت الانتهاء", value: "٣",    icon: Warning,    from: "from-red-700",   to: "to-red-500" },
            { label: "طلبات إجازة معلقة",   value: "٨",    icon: Clock,      from: "from-amber-600", to: "to-amber-400" },
            { label: "نسبة التوطين",         value: "٧٢٪", icon: ChartBar,   from: "from-sky-700",   to: "to-sky-500" },
          ].map((k, i) => {
            const Icon = k.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 100, damping: 20, delay: i * 0.06 }}
                className={`${isDark ? "bg-zinc-900 border border-white/[0.06]" : "bg-white border border-zinc-200/70"} rounded-2xl p-4 flex items-center gap-3`}>
                <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${k.from} ${k.to} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} weight="duotone" className="text-white" />
                </div>
                <div>
                  <p className={`text-lg font-black font-mono ${isDark ? "text-white" : "text-zinc-900"}`}>{k.value}</p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{k.label}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* HR Actions */}
        <div className="grid grid-cols-2 gap-3">
          {([
            { label: "عقود الموظفين",      desc: "إدارة ومراجعة عقود العمل",           href: "/dashboard/business/employee-contracts", icon: FileText      },
            { label: "إدارة الفريق",       desc: "أعضاء الفريق والبيانات الوظيفية",     href: "/dashboard/business/team",               icon: Users         },
            { label: "لوحة المهام",         desc: "مهام قسم الموارد البشرية",             href: "/dashboard/business/kanban",             icon: Kanban        },
            { label: "مستشار HR الذكي",   desc: "استشارات سريعة في شؤون العمل",        href: "/ai/corp/hr",                             icon: Robot         },
            { label: "طلباتي في السوق",    desc: "نشر طلب توظيف أو خدمة",               href: "/dashboard/business/marketplace",        icon: Storefront    },
            { label: "الإشعارات",           desc: "تنبيهات انتهاء العقود والمهام",        href: "/notifications",                         icon: BellIcon      },
          ] as ActionItem[]).map((a, i) => {
            const Icon = a.icon;
            return (
              <motion.div key={a.href} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.2 + i * 0.05 }}>
                <Link href={a.href} className={`${isDark ? "bg-zinc-900 border border-white/[0.06]" : "bg-white border border-zinc-200/70"} rounded-2xl p-5 flex items-center gap-4 transition-all hover:scale-[1.02] hover:ring-1 hover:ring-fuchsia-500/20 shadow-sm`}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-700 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
                    <Icon size={18} weight="duotone" className="text-white" />
                  </div>
                  <div>
                    <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{a.label}</p>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{a.desc}</p>
                  </div>
                  <ArrowLeft size={13} className={`ms-auto ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
                </Link>
              </motion.div>
            );
          })}
        </div>
        <div className={`flex items-center gap-3 p-4 rounded-2xl border text-[12px] ${isDark ? "border-white/[0.05] bg-white/[0.02] text-zinc-500" : "border-zinc-100 bg-slate-50 text-zinc-400"}`}>
          <ShieldCheck size={16} className={isDark ? "text-zinc-600" : "text-zinc-300"} />
          <span>تظهر لك الصفحات والأدوات المتاحة لدورك فقط. للحصول على صلاحيات إضافية، تواصل مع مدير الشركة.</span>
        </div>
      </div>
    );
  }

  // ── Finance Manager: dedicated Finance-only dashboard ────────────────────────
  if (businessRole === "finance_manager") {
    return (
      <div className={`p-5 md:p-8 space-y-5 max-w-[900px] mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className={`relative overflow-hidden rounded-[2rem] p-6 bg-gradient-to-l ${roleConf.color} shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]`}
        >
          <div className="absolute start-4 top-1/2 -translate-y-1/2 opacity-[0.08]"><ChartBar size={110} weight="fill" /></div>
          <div className="relative">
            <span className="inline-block rounded-full bg-white/10 border border-white/20 px-3 py-1 text-[11px] font-bold text-white/80 mb-3">{roleConf.label}</span>
            <h1 className="text-xl font-bold text-white">{roleConf.subtitle}</h1>
            <p className="text-white/50 text-xs mt-1">لوحة التحكم المالية</p>
          </div>
        </motion.div>

        {/* Finance KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "إجمالي الأتعاب القانونية", value: "٢١٧,٥٠٠ ﷼", icon: Receipt,       from: "from-[#0B3D2E]", to: "to-[#155e41]" },
            { label: "مبالغ تحصيل معلقة",        value: "٨٣,٢٠٠ ﷼",   icon: CurrencyDollar,from: "from-red-700",   to: "to-red-500" },
            { label: "ميزانية القسم",             value: "٤٠٠,٠٠٠ ﷼",  icon: Money,         from: "from-amber-600", to: "to-amber-400" },
            { label: "الاستخدام الشهري",          value: "٥٤٪",         icon: ChartLine,     from: "from-sky-700",   to: "to-sky-500" },
          ].map((k, i) => {
            const Icon = k.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 100, damping: 20, delay: i * 0.06 }}
                className={`${isDark ? "bg-zinc-900 border border-white/[0.06]" : "bg-white border border-zinc-200/70"} rounded-2xl p-4 flex items-center gap-3`}>
                <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${k.from} ${k.to} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} weight="duotone" className="text-white" />
                </div>
                <div>
                  <p className={`text-base font-black font-mono ${isDark ? "text-white" : "text-zinc-900"}`}>{k.value}</p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{k.label}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Finance Actions */}
        <div className="grid grid-cols-2 gap-3">
          {([
            { label: "التقارير المالية",     desc: "ميزانية الأتعاب والمصاريف",            href: "/dashboard/business/reports",     icon: ChartBar      },
            { label: "التحصيل القانوني",    desc: "إدارة الديون والإنذارات القانونية",      href: "/ai/debt-collection",              icon: CurrencyDollar },
            { label: "باقتنا والاشتراك",    desc: "عرض الخطة الحالية والفواتير",           href: "/dashboard/business/wallet",       icon: Money         },
            { label: "محلل الصفقات",        desc: "تحليل جدوى الصفقات مالياً",            href: "/ai/corp/deal-intel",              icon: MagnifyingGlass},
          ] as ActionItem[]).map((a, i) => {
            const Icon = a.icon;
            return (
              <motion.div key={a.href} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.2 + i * 0.05 }}>
                <Link href={a.href} className={`${isDark ? "bg-zinc-900 border border-white/[0.06]" : "bg-white border border-zinc-200/70"} rounded-2xl p-5 flex items-center gap-4 transition-all hover:scale-[1.02] hover:ring-1 hover:ring-amber-500/20 shadow-sm`}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-amber-400 flex items-center justify-center flex-shrink-0">
                    <Icon size={18} weight="duotone" className="text-white" />
                  </div>
                  <div>
                    <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{a.label}</p>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{a.desc}</p>
                  </div>
                  <ArrowLeft size={13} className={`ms-auto ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
                </Link>
              </motion.div>
            );
          })}
        </div>
        <div className={`flex items-center gap-3 p-4 rounded-2xl border text-[12px] ${isDark ? "border-white/[0.05] bg-white/[0.02] text-zinc-500" : "border-zinc-100 bg-slate-50 text-zinc-400"}`}>
          <ShieldCheck size={16} className={isDark ? "text-zinc-600" : "text-zinc-300"} />
          <span>تظهر لك الصفحات والأدوات المتاحة لدورك فقط. للحصول على صلاحيات إضافية، تواصل مع مدير الشركة.</span>
        </div>
      </div>
    );
  }

  // ── Generic LimitedRoleView (department_head, seconded, legal_staff, employee) ──
  const actions: ActionItem[] =
    businessRole === "department_head"
      ? [
          { label: "رفع طلب قانوني",  desc: "أرسل طلبك للإدارة القانونية",         href: "/dashboard/business/requests",           icon: Plus           },
          { label: "طلباتي المعلقة",  desc: "حالة الطلبات المرفوعة",               href: "/dashboard/business/kanban",             icon: Briefcase      },
          { label: "المساعد الذكي",   desc: "سؤال قانوني سريع بالذكاء الاصطناعي", href: "/ai/consult",                            icon: Robot          },
          { label: "فاحص المستندات", desc: "رفع عقد أو مستند للمراجعة",            href: "/ai/analyze",                            icon: MagnifyingGlass},
        ]
      : businessRole === "seconded"
      ? [
          { label: "ملفاتي المنتدبة", desc: "القضايا والمراجعات المسندة لك",        href: "/dashboard/business/cases?scope=seconded", icon: Scales         },
          { label: "مراجعة عقد",     desc: "إرسال مراجعة ضمن نطاق الانتداب",       href: "/dashboard/business/reviews/new",         icon: PencilSimple   },
          { label: "ساعات الانتداب",  desc: "متابعة الساعات والاستخدام",            href: "/dashboard/business/reports?view=seconded", icon: Clock          },
          { label: "المساعد الذكي",   desc: "صياغة أو تحليل داخل نطاق المهمة",      href: "/ai/consult?source=business",             icon: Robot          },
        ]
      : businessRole === "employee"
      ? [
          { label: "لوحة المهام",       desc: "مهامي المفتوحة والمُسندة لي",         href: "/dashboard/business/kanban",             icon: Kanban         },
          { label: "تقديم طلب",         desc: "اطلب خدمة أو دعماً من القسم القانوني", href: "/dashboard/business/requests",          icon: Plus           },
        ]
      : /* legal_staff */ [
          { label: "مهامي",           desc: "المهام المُسندة لي",                   href: "/dashboard/business/kanban",             icon: Kanban         },
          { label: "قضاياي",          desc: "ملفات أعمل عليها",                    href: "/dashboard/business/cases",              icon: Scales         },
          { label: "الجلسات",         desc: "جلساتي القادمة",                      href: "/dashboard/business/hearings",           icon: Clock          },
          { label: "المستشار الذكي",  desc: "سؤال قانوني سريع",                    href: "/ai/consult",                            icon: Robot          },
        ];

  return (
    <div
      className={`p-5 md:p-8 space-y-5 max-w-[900px] mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`}
      dir="rtl"
    >
      {/* Role Header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        className={`relative overflow-hidden rounded-[2rem] p-6 bg-gradient-to-l ${roleConf.color} shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]`}
      >
        <div className="absolute start-4 top-1/2 -translate-y-1/2 opacity-[0.08]">
          <Buildings size={110} weight="fill" />
        </div>
        <div className="relative">
          <span className="inline-block rounded-full bg-white/10 border border-white/20 px-3 py-1 text-[11px] font-bold text-white/80 mb-3">
            {roleConf.label}
          </span>
          <h1 className="text-xl font-bold text-white">{roleConf.subtitle}</h1>
          <p className="text-white/50 text-xs mt-1">لوحة التحكم مخصصة لدورك الوظيفي</p>
        </div>
      </motion.div>

      {/* Actions */}
      <div className={`grid gap-3 ${actions.length >= 4 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
        {actions.map((a, i) => {
          const Icon = a.icon;
          return (
            <motion.div
              key={a.href}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 100, damping: 20, delay: i * 0.06 }}
            >
              <Link
                href={a.href}
                className={`${card} p-5 flex items-center gap-4 transition-all hover:scale-[1.02] hover:ring-1 hover:ring-[#0B3D2E]/20 shadow-sm`}
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0B3D2E] to-[#155e41] flex items-center justify-center flex-shrink-0">
                  <Icon size={18} weight="duotone" className="text-[#C8A762]" />
                </div>
                <div>
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{a.label}</p>
                  <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{a.desc}</p>
                </div>
                <ArrowLeft size={13} className={`ms-auto ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* RBAC note */}
      <div
        className={`flex items-center gap-3 p-4 rounded-2xl border text-[12px] ${
          isDark
            ? "border-white/[0.05] bg-white/[0.02] text-zinc-500"
            : "border-zinc-100 bg-slate-50 text-zinc-400"
        }`}
      >
        <ShieldCheck size={16} className={isDark ? "text-zinc-600" : "text-zinc-300"} />
        <span>
          تظهر لك الصفحات والأدوات المتاحة لدورك فقط. للحصول على صلاحيات إضافية، تواصل مع مدير الشركة.
        </span>
      </div>
    </div>
  );
}
