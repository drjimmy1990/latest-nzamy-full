"use client";

import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import { useUser, type GovernmentRole } from "@/hooks/useUser";
import Link from "next/link";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { SectorProfileReadinessPanel } from "@/components/dashboard/sector/SectorProfileReadinessPanel";
import {
  Gavel, MagnifyingGlass, PencilSimple, Brain,
  Warning, ClipboardText, ShieldCheck, Clock,
  LockKey, ListBullets, Bell, Buildings, Lightbulb,
  FileText, ArrowLeft, ArrowUpRight, Scales,
  ChartLineUp, CalendarCheck, CheckCircle,
} from "@phosphor-icons/react";

// ─── ROLE SYSTEM ──────────────────────────────────────────────────────────────

type GovRole = GovernmentRole;

const ROLE_META: Record<GovRole, {
  label: string;
  accentDark: string;
  accentLight: string;
  iconEl: React.ElementType;
}> = {
  judge:      { label: "قاضي",           accentDark: "text-amber-400 bg-amber-400/10 border-amber-400/20",   accentLight: "text-amber-700 bg-amber-50 border-amber-200",  iconEl: Gavel },
  prosecutor: { label: "عضو نيابة عامة", accentDark: "text-rose-400 bg-rose-400/10 border-rose-400/20",     accentLight: "text-rose-700 bg-rose-50 border-rose-200",    iconEl: Warning },
  officer:    { label: "ضابط",           accentDark: "text-slate-300 bg-slate-400/10 border-slate-400/20",   accentLight: "text-slate-700 bg-slate-100 border-slate-300", iconEl: ShieldCheck },
  gov_counsel:{ label: "مستشار حكومي",   accentDark: "text-sky-400 bg-sky-400/10 border-sky-400/20",         accentLight: "text-sky-700 bg-sky-50 border-sky-200",       iconEl: Lightbulb },
};

// ─── RBAC: Permission keys per role ────────────────────────────────────────────
const ROLE_PERMISSIONS: Record<GovRole, string[]> = {
  judge:      ["ai:gov:judgment-weigher","ai:gov:judicial-search","ai:gov:judgment-drafter","ai:gov:verdict-drafter","ai:gov:jurisdiction-analyzer"],
  prosecutor: ["ai:gov:indictment-drafter","ai:gov:evidence-analyzer","ai:gov:investigation-forms","ai:gov:guarantees-checker","ai:gov:deadline-calculator"],
  officer:    ["ai:gov:detention-records","ai:gov:arrest-forms","ai:gov:procedure-guide","ai:gov:rights-reminder","ai:gov:deadline-calculator"],
  gov_counsel:["ai:gov:procurement-reviewer","ai:gov:legal-opinion-drafter","ai:gov:compliance-checker","ai:gov:contract-reviewer"],
};

const ALL_TOOLS: { label: string; sub: string; href: string; Icon: React.ElementType; roles: GovRole[]; permKey: string }[] = [
  { label: "مُرجّح الأحكام",       sub: "ترجيح بين اتجاهات قضائية متعددة",   href: "/ai/gov/judgment-weigher",      Icon: Scales,         roles: ["judge"],       permKey: "ai:gov:judgment-weigher" },
  { label: "باحث المبادئ",         sub: "سوابق المحكمة العليا والاستئناف",     href: "/ai/gov/judicial-search",       Icon: MagnifyingGlass,roles: ["judge"],       permKey: "ai:gov:judicial-search" },
  { label: "صائغ الأحكام",         sub: "ديباجة + وقائع + أسباب + منطوق",     href: "/ai/gov/judgment-drafter",      Icon: PencilSimple,   roles: ["judge"],       permKey: "ai:gov:judgment-drafter" },
  { label: "صائغ المنطوق",          sub: "ترجيح + تسبيب + صياغة منطوق الحكم",  href: "/ai/gov/verdict-drafter",       Icon: Gavel,          roles: ["judge"],       permKey: "ai:gov:verdict-drafter" },
  { label: "محلل الاختصاص",        sub: "اختصاص نوعي ومكاني",                href: "/ai/gov/jurisdiction-analyzer", Icon: Brain,          roles: ["judge"],       permKey: "ai:gov:jurisdiction-analyzer" },
  { label: "صائغ لائحة الاتهام",   sub: "وقائع + تكييف + نصوص + عقوبة",      href: "/ai/gov/indictment-drafter",    Icon: Warning,        roles: ["prosecutor"],  permKey: "ai:gov:indictment-drafter" },
  { label: "محلل الأدلة",          sub: "تصنيف + تقييم القوة + المشروعية",   href: "/ai/gov/evidence-analyzer",     Icon: MagnifyingGlass,roles: ["prosecutor"],  permKey: "ai:gov:evidence-analyzer" },
  { label: "نماذج التحقيق",        sub: "استجواب / شاهد / معاينة / مواجهة",   href: "/ai/gov/investigation-forms",   Icon: ClipboardText,  roles: ["prosecutor"],  permKey: "ai:gov:investigation-forms" },
  { label: "حاسبة المواعيد",       sub: "مدد التوقيف والإحالة",               href: "/ai/gov/deadline-calculator",   Icon: Clock,          roles: ["prosecutor", "officer"], permKey: "ai:gov:deadline-calculator" },
  { label: "محاضر الضبط",          sub: "محضر جنائي كامل ومتوافق نظاماً",    href: "/ai/gov/detention-records",     Icon: ClipboardText,  roles: ["officer"],     permKey: "ai:gov:detention-records" },
  { label: "نماذج القبض والتفتيش", sub: "هل يحق القبض؟ + نماذج جاهزة",        href: "/ai/gov/arrest-forms",          Icon: LockKey,        roles: ["officer"],     permKey: "ai:gov:arrest-forms" },
  { label: "دليل الإجراءات",       sub: "خطوة بخطوة حسب نوع الجريمة",        href: "/ai/gov/procedure-guide",       Icon: ListBullets,    roles: ["officer"],     permKey: "ai:gov:procedure-guide" },
  { label: "مُذكّر الضمانات",      sub: "تنبيهات: 24 ساعة للإحالة وغيرها",   href: "/ai/gov/rights-reminder",       Icon: Bell,           roles: ["officer"],     permKey: "ai:gov:rights-reminder" },
  { label: "مراجع المناقصات",      sub: "نظام المنافسات والمشتريات الحكومية", href: "/ai/gov/procurement-reviewer",  Icon: Buildings,      roles: ["gov_counsel"], permKey: "ai:gov:procurement-reviewer" },
  { label: "صائغ الرأي القانوني",  sub: "وقائع → تحليل → رأي → توصية",       href: "/ai/gov/legal-opinion-drafter", Icon: Lightbulb,      roles: ["gov_counsel"], permKey: "ai:gov:legal-opinion-drafter" },
  { label: "مدقق الامتثال",        sub: "ديوان المراقبة + PDPL + نزاهة",     href: "/ai/gov/compliance-checker",    Icon: ShieldCheck,    roles: ["gov_counsel"], permKey: "ai:gov:compliance-checker" },
  { label: "مراجع العقود الحكومية",sub: "مراجعة بنود عقود التوريد والخدمات",  href: "/ai/gov/contract-reviewer",     Icon: FileText,       roles: ["gov_counsel"], permKey: "ai:gov:contract-reviewer" },
];

// KPIs are contextual per role
const KPI_BY_ROLE: Record<GovRole, { label: string; value: string; note: string }[]> = {
  judge: [
    { label: "القضايا الجارية",   value: "23",   note: "5 جلسات هذا الأسبوع" },
    { label: "أحكام منتظرة",     value: "7",    note: "استحقاق خلال أسبوع" },
    { label: "معدل الإنجاز",     value: "91%",  note: "أعلى من المعدل الوطني" },
    { label: "متوسط مدة القضية", value: "47 يوم", note: "تحسّن 8 أيام" },
  ],
  prosecutor: [
    { label: "القضايا قيد التحقيق", value: "14",  note: "3 جلسات استجواب" },
    { label: "التوقيفات النشطة",    value: "6",   note: "4 تنتهي خلال 48 ساعة" },
    { label: "الإحالات للمحكمة",   value: "9",   note: "هذا الشهر" },
    { label: "لوائح الاتهام",      value: "11",  note: "3 في مرحلة الصياغة" },
  ],
  officer: [
    { label: "المهام المفتوحة",  value: "8",   note: "2 عاجلة الآن" },
    { label: "محاضر هذا الأسبوع", value: "12", note: "اكتملت 9 منها" },
    { label: "التوقيفات الجارية", value: "3",   note: "أقصى مدة: 21 ساعة" },
    { label: "الامتثال الإجرائي", value: "98%", note: "دون انتهاكات" },
  ],
  gov_counsel: [
    { label: "العقود النشطة",     value: "12",   note: "2 تنتهي قريباً" },
    { label: "القضايا والنزاعات", value: "5",    note: "جلسة قادمة" },
    { label: "مؤشر الامتثال",    value: "94%",  note: "فوق المعدل" },
    { label: "التقارير المعلقة",  value: "3",    note: "استحقاق هذا الأسبوع" },
  ],
};

// Recent actions contextual
const RECENT_ACTIONS: Record<GovRole, { text: string; time: string; Icon: React.ElementType }[]> = {
  judge: [
    { text: "صدر حكم في القضية ١٤٥-ج", time: "منذ ساعتين",    Icon: Gavel },
    { text: "تأجيل جلسة الثلاثاء",       time: "منذ 3 ساعات",   Icon: CalendarCheck },
    { text: "مراجعة 4 صحف دعوى واردة",   time: "اليوم الصباح",  Icon: FileText },
  ],
  prosecutor: [
    { text: "إحالة قضية ٠٠٣٢ للمحكمة",  time: "منذ ساعة",      Icon: ArrowUpRight },
    { text: "استجواب شاهد ج في ٠٠٢١",    time: "منذ 4 ساعات",   Icon: MagnifyingGlass },
    { text: "صياغة لائحة اتهام ٠٠١٩",    time: "أمس",           Icon: PencilSimple },
  ],
  officer: [
    { text: "استيفاء محضر قبض ٠٠٥٤",    time: "منذ 30 دقيقة",  Icon: ClipboardText },
    { text: "تسليم شخص موقوف لنيابة",    time: "منذ ساعتين",    Icon: CheckCircle },
    { text: "إغلاق بلاغ ٠٠٤١",          time: "اليوم الصباح",  Icon: ShieldCheck },
  ],
  gov_counsel: [
    { text: "مراجعة عقد استشاري جديد",   time: "منذ ساعة",      Icon: FileText },
    { text: "رأي قانوني في مناقصة ١٢",   time: "منذ 3 ساعات",   Icon: Lightbulb },
    { text: "تقرير امتثال ربع سنوي",      time: "أمس",           Icon: ChartLineUp },
  ],
};

// ─── ANIMATION ────────────────────────────────────────────────────────────────

type GovActionLink = {
  label: string;
  href: string;
  Icon: React.ElementType;
  primary?: boolean;
};

const HEADER_ACTIONS_BY_ROLE: Record<GovRole, GovActionLink[]> = {
  judge: [
    { label: "التقارير", href: "/dashboard/government/reports?role=judge", Icon: ClipboardText },
    { label: "القضايا والأحكام", href: "/dashboard/government/cases?role=judge", Icon: Gavel, primary: true },
  ],
  prosecutor: [
    { label: "تقارير التحقيق", href: "/dashboard/government/reports?role=prosecutor", Icon: ClipboardText },
    { label: "ملفات التحقيق", href: "/dashboard/government/cases?role=prosecutor", Icon: Warning, primary: true },
  ],
  officer: [
    { label: "التقارير الإجرائية", href: "/dashboard/government/reports?role=officer", Icon: ClipboardText },
    { label: "محاضر الضبط", href: "/ai/gov/detention-records", Icon: ClipboardText, primary: true },
  ],
  gov_counsel: [
    { label: "تقارير الجهة", href: "/dashboard/government/reports?role=gov_counsel", Icon: ClipboardText },
    { label: "العقود الحكومية", href: "/dashboard/government/contracts", Icon: FileText, primary: true },
  ],
};

const QUICK_NAV_BY_ROLE: Record<GovRole, GovActionLink[]> = {
  judge: [
    { label: "القضايا والأحكام", href: "/dashboard/government/cases?role=judge", Icon: Gavel },
    { label: "البحث القضائي", href: "/ai/gov/judicial-search", Icon: MagnifyingGlass },
    { label: "التقارير القضائية", href: "/dashboard/government/reports?role=judge", Icon: ClipboardText },
  ],
  prosecutor: [
    { label: "ملفات التحقيق", href: "/dashboard/government/cases?role=prosecutor", Icon: Warning },
    { label: "نماذج التحقيق", href: "/ai/gov/investigation-forms", Icon: ClipboardText },
    { label: "حاسبة المواعيد", href: "/ai/gov/deadline-calculator", Icon: Clock },
    { label: "تقارير النيابة", href: "/dashboard/government/reports?role=prosecutor", Icon: ClipboardText },
  ],
  officer: [
    { label: "محاضر الضبط", href: "/ai/gov/detention-records", Icon: ClipboardText },
    { label: "نماذج القبض والتفتيش", href: "/ai/gov/arrest-forms", Icon: LockKey },
    { label: "دليل الإجراءات", href: "/ai/gov/procedure-guide", Icon: ListBullets },
    { label: "التقارير الإجرائية", href: "/dashboard/government/reports?role=officer", Icon: ClipboardText },
  ],
  gov_counsel: [
    { label: "العقود والاتفاقيات", href: "/dashboard/government/contracts", Icon: FileText },
    { label: "الامتثال القانوني", href: "/dashboard/government/compliance", Icon: ShieldCheck },
    { label: "مراجعة المنافسات", href: "/ai/gov/procurement-reviewer", Icon: Buildings },
    { label: "التقارير الدورية", href: "/dashboard/government/reports?role=gov_counsel", Icon: ClipboardText },
  ],
};

const spring = { type: "spring" as const, stiffness: 100, damping: 20 };
const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: spring } };

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function GovernmentDashboard() {
  const user  = useUser();
  const { isDark } = useTheme();

  const role   = user.governmentRole ?? "gov_counsel";
  const meta   = ROLE_META[role];
  // ─── RBAC: double-filter — role array AND user permissions ───────────────────
  const allowedPerms = ROLE_PERMISSIONS[role];
  const userPerms    = user.permissions as string[];
  const tools  = ALL_TOOLS.filter(t =>
    t.roles.includes(role) &&
    (userPerms.length === 0 || userPerms.some(p => allowedPerms.includes(p)) || t.permKey === undefined)
  );
  const kpis   = KPI_BY_ROLE[role];
  const recent = RECENT_ACTIONS[role];
  const headerActions = HEADER_ACTIONS_BY_ROLE[role];
  const quickNav = QUICK_NAV_BY_ROLE[role];
  const RoleIcon = meta.iconEl;
  const accent = isDark ? meta.accentDark : meta.accentLight;

  const bg    = isDark ? "bg-zinc-950"            : "bg-slate-50";
  const card  = isDark ? "bg-zinc-900/40 border-white/5" : "bg-white border-slate-200";
  const muted = isDark ? "text-slate-400"         : "text-slate-500";
  const dim   = isDark ? "text-slate-600"         : "text-slate-400";

  return (
    <div className={`${bg} min-h-[100dvh] pb-20`} dir="rtl">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-10">

        {/* -- Onboarding Welcome (first-visit only) -- */}
        <OnboardingBanner role="government" name={user.name} isDark={isDark} />

        <SectorProfileReadinessPanel sector="government" />


        {/* ── Role-Adaptive Header ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-end"
        >
          <div>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border mb-4 ${accent}`}>
              <RoleIcon size={14} weight="duotone" />
              {meta.label} — الجهة الحكومية
            </div>
            <h1 className={`text-4xl md:text-5xl font-bold tracking-tighter leading-none mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>
              {user.name || "الجهة الحكومية"}
            </h1>
            <p className={`max-w-[52ch] text-base leading-relaxed ${muted}`}>
              لوحة تحكم {meta.label} — أدوات ذكاء اصطناعي مخصصة حسب دورك وبياناتك التشغيلية.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            {headerActions.map((action) => {
              const Icon = action.Icon;
              return (
                <Link key={action.href} href={action.href} className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all active:scale-[0.98] ${
                  action.primary
                    ? isDark ? "bg-white text-zinc-950 hover:bg-slate-200" : "bg-zinc-900 text-white hover:bg-zinc-800"
                    : isDark ? "bg-zinc-900 border border-white/10 text-white hover:bg-zinc-800" : "bg-white border border-slate-200 text-slate-900 hover:bg-slate-50"
                }`}>
                  <Icon size={18} weight={action.primary ? "bold" : "duotone"} />
                  {action.label}
                </Link>
              );
            })}
          </div>
        </motion.div>

        {/* ── KPI Strip ─────────────────────────────────────────────────────── */}
        <motion.div
          variants={container} initial="hidden" animate="show"
          className={`grid grid-cols-2 md:grid-cols-4 divide-x divide-x-reverse border rounded-[2rem] overflow-hidden ${
            isDark ? "divide-white/5 border-white/5" : "divide-slate-200 border-slate-200"
          }`}
        >
          {kpis.map((k, i) => (
            <motion.div key={k.label} variants={item} className="px-6 py-6">
              <div className={`text-2xl md:text-3xl font-mono font-bold tracking-tighter ${
                i === 0 ? (isDark ? "text-white" : "text-slate-900") : (isDark ? "text-slate-200" : "text-slate-800")
              }`}>{k.value}</div>
              <div className={`text-xs mt-1 ${muted}`}>{k.label}</div>
              <div className={`text-xs mt-1 ${dim}`}>{k.note}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Main Body: Split ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">

          {/* LEFT: AI Tools ─────────────────────────────────────────────────── */}
          <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className={`text-xl font-semibold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                أدوات الذكاء الاصطناعي — {meta.label}
              </h2>
              <span className={`text-xs ${muted}`}>{tools.length} أدوات متاحة</span>
            </div>

            {/* Featured tool — wide */}
            {tools[0] && (() => {
              const FIcon = tools[0].Icon;
              return (
                <Link href={tools[0].href}>
                  <motion.div
                    variants={item}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    transition={spring}
                    className={`p-8 rounded-[2.5rem] border flex items-start gap-6 cursor-pointer transition-all ${
                      isDark ? "bg-zinc-900/40 border-white/5 hover:bg-zinc-900/70 hover:border-white/10" : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <div className={`p-3.5 rounded-2xl border flex-shrink-0 ${accent}`}>
                      <FIcon size={24} weight="duotone" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-lg font-semibold tracking-tight mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
                        {tools[0].label}
                      </div>
                      <p className={`text-sm leading-relaxed max-w-[48ch] ${muted}`}>{tools[0].sub}</p>
                    </div>
                    <ArrowLeft size={18} className={dim} />
                  </motion.div>
                </Link>
              );
            })()}

            {/* Remaining tools — 2-col grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tools.slice(1).map((tool) => {
                const Icon = tool.Icon;
                return (
                  <Link href={tool.href} key={tool.href}>
                    <motion.div
                      variants={item}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      transition={spring}
                      className={`h-full p-5 rounded-[2rem] border cursor-pointer transition-all ${
                        isDark ? "bg-zinc-900/30 border-white/5 hover:bg-zinc-900/60 hover:border-white/10" : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className={`w-10 h-10 flex items-center justify-center rounded-xl mb-3 border ${accent}`}>
                        <Icon size={18} weight="duotone" />
                      </div>
                      <div className={`font-semibold text-sm mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>{tool.label}</div>
                      <p className={`text-xs leading-relaxed ${muted}`}>{tool.sub}</p>
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          </motion.div>

          {/* RIGHT: Recent Activity + Quick Nav ─────────────────────────────── */}
          <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">

            {/* Recent Activity */}
            <div className={`p-8 rounded-[2.5rem] border ${card}`}>
              <h2 className={`text-xl font-semibold tracking-tight mb-6 ${isDark ? "text-white" : "text-slate-900"}`}>
                آخر النشاطات
              </h2>
              <div className="space-y-5">
                {recent.map((r, i) => {
                  const Icon = r.Icon;
                  return (
                    <div key={i} className="relative flex items-start gap-4">
                      {i !== recent.length - 1 && (
                        <div className={`absolute top-8 right-[14px] bottom-[-20px] w-px ${isDark ? "bg-white/5" : "bg-slate-100"}`} />
                      )}
                      <div className={`relative z-10 w-7 h-7 flex items-center justify-center rounded-full shrink-0 border ${accent}`}>
                        <Icon size={14} weight="duotone" />
                      </div>
                      <div className="flex-1 pt-0.5">
                        <p className={`text-sm font-medium ${isDark ? "text-white" : "text-slate-800"}`}>{r.text}</p>
                        <p className={`text-xs mt-0.5 ${dim}`}>{r.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Navigation */}
            <div className={`p-6 rounded-[2rem] border ${card}`}>
              <h3 className={`text-sm font-medium uppercase tracking-wider mb-4 ${muted}`}>الأقسام</h3>
              <div className="space-y-1">
                {quickNav.map((lnk) => {
                  const Icon = lnk.Icon;
                  return (
                    <Link key={lnk.href} href={lnk.href}
                      className={`flex items-center justify-between w-full py-2.5 px-3 rounded-xl text-sm transition-colors ${
                        isDark ? "text-slate-400 hover:bg-white/5 hover:text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon size={16} />
                        {lnk.label}
                      </div>
                      <ArrowLeft size={14} className={dim} />
                    </Link>
                  );
                })}
              </div>
            </div>

          </motion.div>
        </div>
      </div>
    </div>
  );
}
