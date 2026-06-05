"use client";

import { useEffect, useRef, useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserCircle, Star, Gavel, Certificate, Phone, Envelope,
  MapPin, PencilSimple, SealCheck, Scales, Warning,
  Globe, LinkedinLogo, TwitterLogo,
  FilePdf, ShareNetwork, Users, BookOpen, FileText,
  Trophy, Lightning, Target, Lock, CheckCircle,
  Flame, ChartLine, ChartBar, Robot, ArrowDown,
  Coins, X, Copy,
  Clock, Timer, Briefcase, ChartBarHorizontal, TrendUp, TrendDown,
  Smiley, SmileyMeh, SmileySad,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import {
  SpotlightCard,
  RingScore,
  ShareModal,
  OverviewTab,
  AchievementsTab,
  ReviewsTab,
} from "@/components/dashboard/LawyerProfileForms";
import {
  PERFORMANCE_RANGE_LABELS,
  WEEK_ACTIVITY,
  WORK_DISTRIBUTION,
  getBenchmarkSummary,
  getBenchmarks,
  getPerformanceContext,
  getPerformanceContextLabel,
  getPerformanceSnapshot,
  type StatRange,
} from "../_data/performance";
import {
  getMetalTier, METAL_TIERS, WORK_HOURS,
  WORK_DIST, WIN_RATE_PCT, WIN, WIN_TOTAL,
  AI_TOOLS, PRO_SCORES, ACTIVITY_DATA, FINANCIAL_DATA,
  SHARE_TOGGLE_DEFAULTS, type AnalyticsPeriod,
} from "../_data/analytics";


const MOCK_PROFILE = {
  name: "أ. محمد العتيبي",
  title: "محامٍ ومستشار قانوني",
  specialty: "قانون تجاري وعقود",
  city: "الرياض",
  phone: "+966 50 123 4567",
  email: "mohammed@nzamy.sa",
  barNumber: "SA-2019-00482",
  yearsExp: 7,
  casesWon: 143,
  rating: 4.8,
  reviewCount: 89,
  verified: true,
  bio: "محامٍ معتمد من وزارة العدل السعودية، متخصص في القانون التجاري وصياغة العقود التجارية وقضايا الشركات. خبرة 7 سنوات في تمثيل الشركات والأفراد أمام محاكم المملكة العربية السعودية بجميع درجاتها.",
  expertise: ["قانون تجاري", "عقود الشركات", "النزاعات التجارية", "نظام العمل", "التحكيم التجاري"],
  languages: ["العربية", "الإنجليزية"],
  education: [
    { degree: "بكالوريوس القانون", institution: "جامعة الملك سعود", year: "2017" },
    { degree: "دبلوم القانون التجاري", institution: "معهد الإدارة العامة", year: "2019" },
  ],
  courts: ["المحكمة التجارية بالرياض", "محكمة الاستئناف", "المحكمة العامة"],
  linkedin: "linkedin.com/in/mohammed",
  twitter: "@mo_lawyer",
  website: "mohammed-law.sa",
};

const ACHIEVEMENTS = [
  { id:"a1", title:"أول انتصار",         desc:"ربحت أول قضية",                   icon:Gavel,   color:"#C8A762", unlocked:true,  date:"مارس ٢٠٢٤",   points:50  },
  { id:"a2", title:"نجم التقييمات",      desc:"١٠ تقييمات ٥ نجوم متتالية",       icon:Star,    color:"#C8A762", unlocked:true,  date:"يناير ٢٠٢٥",  points:100 },
  { id:"a3", title:"محامٍ ذهبي",         desc:"أتممت ٥٠ قضية بنجاح",             icon:Trophy,  color:"#0B3D2E", unlocked:true,  date:"فبراير ٢٠٢٥", points:200 },
  { id:"a4", title:"خبير العقود",        desc:"راجعت أكثر من ١٠٠ عقد",           icon:Certificate, color:"#3b82f6", unlocked:true, date:"أبريل ٢٠٢٥", points:150 },
  { id:"a5", title:"ملك الاستشارات",     desc:"أجريت ٢٠٠ استشارة قانونية",       icon:Users,   color:"#8b5cf6", unlocked:true,  date:"أبريل ٢٠٢٥", points:175 },
  { id:"a6", title:"الفريق الأول",       desc:"كوّن فريقاً من ٥ محامين",         icon:Lightning, color:"#f59e0b", unlocked:false, points:250 },
  { id:"a7", title:"٩٩٪ نسبة ربح",       desc:"نسبة ربح ٩٩٪ في ١٠ قضايا",       icon:Target,  color:"#ef4444", unlocked:false, points:500 },
  { id:"a8", title:"محامٍ أسطوري",       desc:"أتمم ٥٠٠ قضية بنجاح",            icon:Flame,   color:"#f97316", unlocked:false, points:1000},
];

const REVIEWS = [
  { name:"شركة الأفق للتجارة", rating:5, text:"محامٍ محترف واستجابته ممتازة. أنجز القضية في وقت قياسي.", date:"مارس ٢٠٢٥" },
  { name:"عبدالله الحارثي",    rating:5, text:"خبرة واسعة في قانون العمل. نصائحه كانت دقيقة ومفيدة.", date:"فبراير ٢٠٢٥" },
  { name:"نورة العتيبي",       rating:4, text:"تعامل راقٍ ومتابعة جيدة طوال مراحل القضية.",          date:"يناير ٢٠٢٥"  },
];

const MILESTONES = [
  { label:"قضايا مكسوبة", current:143, target:200, color:"bg-emerald-500", icon:Gavel },
  { label:"الاستشارات",   current:89,  target:200, color:"bg-blue-500",    icon:Users },
  { label:"تقييمات ٥★",  current:56,  target:100, color:"bg-[#C8A762]",   icon:Star  },
];

const STATS = [
  { label:"قضايا", value:"143",  icon:Gavel,   color:"text-emerald-500", bg:"bg-emerald-500/10" },
  { label:"تقييم", value:"4.8★", icon:Star,    color:"text-[#C8A762]",   bg:"bg-[#C8A762]/10"  },
  { label:"خبرة",  value:"7+ س", icon:Certificate, color:"text-blue-500", bg:"bg-blue-500/10"   },
  { label:"تقييمات", value:"89", icon:Users,   color:"text-violet-500",  bg:"bg-violet-500/10" },
];

type ProfileTab = "overview" | "performance" | "achievements" | "reviews";

const PROFILE_TABS: ProfileTab[] = ["overview", "performance", "achievements", "reviews"];

function isProfileTab(value: string | null): value is ProfileTab {
  return !!value && PROFILE_TABS.includes(value as ProfileTab);
}

// ─── Promoter Score (NPS) Tier System ────────────────────────────────────────

const PROMOTER_DATA = { promoters: 61, passives: 24, detractors: 15 };
const NPS_SCORE = PROMOTER_DATA.promoters - PROMOTER_DATA.detractors; // 46

const NPS_TIERS = [
  { min: 70, label: "محامٍ استثنائي",  sublabel: "أفضل ١٠٪ على مستوى المملكة", color: "#C8A762", next: null,  nextTarget: 100 },
  { min: 50, label: "محامٍ متميز",    sublabel: "أفضل ٢٥٪ على مستوى المملكة", color: "#10b981", next: 70,   nextTarget: 70 },
  { min: 30, label: "محامٍ احترافي",  sublabel: "أفضل ٥٠٪ على مستوى المدينة", color: "#3b82f6", next: 50,   nextTarget: 50 },
  { min: 10, label: "محامٍ ناشئ",     sublabel: "في طريقك للتميز",             color: "#8b5cf6", next: 30,   nextTarget: 30 },
  { min: -100, label: "بداية المشوار", sublabel: "ابدأ بتحسين رضا الموكلين",   color: "#94a3b8", next: 10,   nextTarget: 10 },
];

function getNpsTier(nps: number) {
  return NPS_TIERS.find(t => nps >= t.min) ?? NPS_TIERS[NPS_TIERS.length - 1];
}




export default function LawyerProfilePage() {
  const { isDark } = useTheme();
  const user = useUser();
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [performanceRange, setPerformanceRange] = useState<StatRange>("today");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>("سنة");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToggles, setShareToggles] = useState(SHARE_TOGGLE_DEFAULTS);
  const [activeWorkIdx, setActiveWorkIdx] = useState<number | null>(null);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (isProfileTab(tab)) setActiveTab(tab);
  }, []);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const unlocked = ACHIEVEMENTS.filter(a => a.unlocked);
  const totalPoints = unlocked.reduce((s, a) => s + a.points, 0);
  const performanceContext = getPerformanceContext(user);
  const performanceSnapshot = getPerformanceSnapshot(performanceRange);
  const performanceBenchmarks = getBenchmarks(performanceContext, {
    city: MOCK_PROFILE.city,
    firmName: user.affiliation?.entityName,
  });
  const benchmarkSummary = getBenchmarkSummary(performanceSnapshot, performanceBenchmarks);
  const maxWeekHours = Math.max(...WEEK_ACTIVITY.map(day => day.hours), 1);
  const benchmarkMax = Math.max(performanceSnapshot.hours, ...performanceBenchmarks.map(item => item.avgHours), 1);
  const performanceKpis = [
    { label: "ساعات العمل", value: performanceSnapshot.hours.toFixed(1), unit: "س", icon: Clock, color: "#0B3D2E", previous: performanceSnapshot.previousHours.toFixed(1) },
    { label: "المهام المنجزة", value: String(performanceSnapshot.tasks), unit: "مهمة", icon: CheckCircle, color: "#10b981", previous: String(performanceSnapshot.previousTasks) },
    { label: "القضايا النشطة", value: String(performanceSnapshot.cases), unit: "قضية", icon: Briefcase, color: "#C8A762", previous: String(performanceSnapshot.previousCases) },
    { label: "جلسات بومودورو", value: String(performanceSnapshot.pomodoros), unit: "جلسة", icon: Timer, color: "#6366f1", previous: String(performanceSnapshot.previousPomodoros) },
  ];

  // NPS derived
  const npsTier = getNpsTier(NPS_SCORE);
  const npsNextPct = npsTier.next != null
    ? Math.min(Math.round(((NPS_SCORE - (npsTier.next - 20)) / 20) * 100), 99)
    : 100;

  // Metal tier derived (based on cumulative focus hours)
  const metalTier = getMetalTier(WORK_HOURS.total);
  const metalNextTarget = metalTier.next ?? WORK_HOURS.total;
  const metalPct = metalTier.next
    ? Math.min(Math.round((WORK_HOURS.total / metalNextTarget) * 100), 99)
    : 100;
  const metalHoursLeft = metalTier.next ? Math.max(0, metalNextTarget - WORK_HOURS.total) : 0;
  const nextMetalLabel = metalTier.next ? (METAL_TIERS.find(t => t.min === metalTier.next)?.label ?? "") : "";

  const tabs = [
    { id: "overview",     label: "الملف المهني" },
    { id: "performance",  label: "الأداء" },
    { id: "achievements", label: "إنجازاتي" },
    { id: "reviews",      label: "التقييمات" },
  ] as const;

  return (
    <>
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">

      {/* ── بانر بيانات تجريبية ── */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl p-4 border flex items-center gap-3 mb-5 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
          <Warning size={18} weight="fill" className="text-amber-500" />
        </div>
        <div>
          <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>بعض الإحصائيات تجريبية</p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/60"}`}>الإنجازات والتحليلات ستُحدَّث تلقائياً مع الاستخدام</p>
        </div>
      </motion.div>

      {/* Header hero card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className={`${card} overflow-hidden`}>
        {/* Cover */}
        <div className="h-28 w-full" style={{ background: "linear-gradient(135deg, #0B3D2E 0%, #125e47 60%, #1a7a5e 100%)" }}>
          <div className="h-full w-full opacity-10"
            style={{ backgroundImage: "radial-gradient(circle at 20% 80%, #C8A762 0%, transparent 50%)" }} />
        </div>

        <div className="px-6 pb-5">
          {/* Avatar row */}
          <div className="flex flex-col gap-4 -mt-10 mb-4 sm:flex-row sm:items-end">
            <div className="flex min-w-0 items-end gap-4">
              <div className="w-20 h-20 rounded-2xl border-4 border-white dark:border-zinc-900 bg-[#0B3D2E] flex items-center justify-center flex-shrink-0 shadow-lg">
                <UserCircle size={44} weight="duotone" className="text-[#C8A762]" />
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className={`text-xl font-bold leading-snug ${isDark ? "text-white" : "text-slate-800"}`}>
                    {user.name || MOCK_PROFILE.name}
                  </h1>
                  {MOCK_PROFILE.verified && (
                    <SealCheck size={18} weight="fill" className="text-[#C8A762]" />
                  )}
                </div>
                <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                  {MOCK_PROFILE.title} · {MOCK_PROFILE.specialty}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <MapPin size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} />
                  <span className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{MOCK_PROFILE.city}</span>
                </div>
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 pb-1 sm:ms-auto">
              <button className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold border transition-all ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                <FilePdf size={13} /> تصدير PDF
              </button>
              <button onClick={() => setShareOpen(true)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold border transition-all ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                <ShareNetwork size={13} /> مشاركة
              </button>
              <Link href="/dashboard/lawyer/profile/edit"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
                <PencilSimple size={13} /> تعديل
              </Link>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
            {STATS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={`${isDark ? "bg-white/[0.03] border border-white/[0.05]" : "bg-slate-50 border border-slate-100"} rounded-xl p-3 flex items-center gap-2.5`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.bg}`}>
                    <Icon size={15} weight="duotone" className={s.color} />
                  </div>
                  <div>
                    <p className={`text-[15px] font-black leading-none ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{s.value}</p>
                    <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{s.label}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Contact chips */}
          <div className="flex flex-wrap gap-2">
            {[
              { icon: Phone,    val: MOCK_PROFILE.phone },
              { icon: Envelope, val: MOCK_PROFILE.email },
              { icon: Globe,    val: MOCK_PROFILE.website },
            ].map(({ icon: Icon, val }, i) => (
              <div key={i} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                <Icon size={11} /> {val}
              </div>
            ))}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
              <SealCheck size={11} className="text-[#C8A762]" /> رقم النقابة: {MOCK_PROFILE.barNumber}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-3 text-[12px] font-semibold transition-colors border-b-2 ${activeTab === t.id
                ? "border-[#0B3D2E] text-[#0B3D2E] dark:text-emerald-400"
                : `border-transparent ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Tab: Overview */}
      {activeTab === "overview" && (
        <OverviewTab isDark={isDark} profile={MOCK_PROFILE} cardClass={card} />
      )}

      {/* Tab: Performance */}
      {activeTab === "performance" && (
        <div className="space-y-4">
          <div className={`${card} p-5`}>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={`text-[11px] font-black uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لوحة الإنتاجية</p>
                <h2 className={`mt-1 text-[17px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>إحصائيات الأداء</h2>
                <p className={`mt-1 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  {getPerformanceContextLabel(performanceContext)} · {benchmarkSummary}
                </p>
              </div>
              <div className={`flex w-fit gap-0.5 rounded-xl p-1 ${isDark ? "bg-zinc-800/60" : "bg-slate-100"}`}>
                {(["today", "week", "month", "quarter", "year"] as StatRange[]).map(range => (
                  <button
                    key={range}
                    onClick={() => setPerformanceRange(range)}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all ${
                      performanceRange === range
                        ? isDark ? "bg-zinc-700 text-white" : "bg-white text-[#0B3D2E] shadow-sm"
                        : isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {PERFORMANCE_RANGE_LABELS[range]}
                  </button>
                ))}
              </div>
            </div>

            <div className={`grid overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-4 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
              {performanceKpis.map(({ label, value, unit, icon: Icon, color, previous }, index) => (
                <div
                  key={label}
                  className={`p-4 ${index !== 0 ? isDark ? "border-r border-white/[0.06]" : "border-r border-slate-100" : ""} ${index > 1 ? isDark ? "border-t border-white/[0.06] lg:border-t-0" : "border-t border-slate-100 lg:border-t-0" : ""}`}
                >
                  <div className="mb-2 flex items-center gap-1.5">
                    <Icon size={14} weight="duotone" style={{ color }} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{label}</span>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className={`font-mono text-[25px] font-black leading-none ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{value}</span>
                    <span className={`pb-0.5 text-[11px] font-bold ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{unit}</span>
                  </div>
                  <p className={`mt-1 text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>السابق: <span className="font-mono">{previous}</span></p>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <div className="flex h-16 items-end gap-1.5">
                {WEEK_ACTIVITY.map((day, index) => {
                  const isToday = index === new Date().getDay();
                  return (
                    <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
                      <motion.div
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ type: "spring", stiffness: 80, damping: 18, delay: index * 0.04 }}
                        style={{ height: `${Math.max((day.hours / maxWeekHours) * 52, 4)}px`, originY: 1 }}
                        className={`w-full rounded-sm ${isToday ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-700" : "bg-slate-200"}`}
                      />
                      <span className={`font-mono text-[9px] ${isToday ? "font-bold text-[#0B3D2E]" : isDark ? "text-zinc-600" : "text-slate-400"}`}>{day.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <div className={`${card} p-5`}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className={`text-[11px] font-black uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مستوى الإنتاجية</p>
                  <h3 className="mt-1 text-[18px] font-black" style={{ color: performanceSnapshot.level.color }}>{performanceSnapshot.level.label}</h3>
                  <p className={`mt-1 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{performanceSnapshot.level.description}</p>
                </div>
                <div className="text-left">
                  <p className={`font-mono text-[42px] font-black leading-none ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                    {performanceSnapshot.productivity}<span className="text-[16px] opacity-45">%</span>
                  </p>
                  <p className={`mt-1 text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>سلسلة {performanceSnapshot.streak} أيام</p>
                </div>
              </div>
              <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${performanceSnapshot.productivity}%` }}
                  transition={{ type: "spring", stiffness: 80, damping: 18 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: performanceSnapshot.level.color }}
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { label: "فرق الساعات", value: performanceSnapshot.hours - performanceSnapshot.previousHours },
                  { label: "فرق المهام", value: performanceSnapshot.tasks - performanceSnapshot.previousTasks },
                ].map(item => {
                  const up = item.value >= 0;
                  return (
                    <div key={item.label} className={`rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                      <div className={`mb-1 flex items-center gap-1 text-[10px] font-bold ${up ? "text-emerald-500" : "text-red-500"}`}>
                        {up ? <TrendUp size={11} weight="bold" /> : <TrendDown size={11} weight="bold" />}
                        {item.label}
                      </div>
                      <p className={`font-mono text-[17px] font-black ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{item.value >= 0 ? "+" : ""}{item.value.toFixed(item.label.includes("ساعات") ? 1 : 0)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`${card} p-5`}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className={`text-[11px] font-black uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مقارنة بالمتوسطات</p>
                  <h3 className={`mt-1 text-[16px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>مقارنة مهنية حسب نوع الحساب</h3>
                </div>
                <ChartBarHorizontal size={20} className={isDark ? "text-zinc-500" : "text-slate-400"} />
              </div>
              <div className="space-y-4">
                {performanceBenchmarks.map(item => {
                  const ahead = performanceSnapshot.hours >= item.avgHours;
                  const userPct = Math.min((performanceSnapshot.hours / benchmarkMax) * 100, 100);
                  const avgPct = Math.min((item.avgHours / benchmarkMax) * 100, 100);
                  return (
                    <div key={item.id}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <div>
                          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{item.label}</p>
                          <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.description}</p>
                        </div>
                        <span className={`font-mono text-[11px] font-bold ${ahead ? "text-emerald-500" : "text-red-500"}`}>
                          {ahead ? "+" : ""}{(performanceSnapshot.hours - item.avgHours).toFixed(1)}س
                        </span>
                      </div>
                      <div className={`relative h-2.5 overflow-hidden rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${avgPct}%` }}
                          transition={{ type: "spring", stiffness: 70, damping: 18 }}
                          className={`absolute inset-y-0 right-0 rounded-full ${isDark ? "bg-zinc-700" : "bg-slate-300"}`}
                        />
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${userPct}%` }}
                          transition={{ type: "spring", stiffness: 70, damping: 18, delay: 0.08 }}
                          className="absolute inset-y-0 right-0 rounded-full"
                          style={{ backgroundColor: ahead ? "#0B3D2E" : "#ef4444" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={`${card} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className={`text-[11px] font-black uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>توزيع العمل</p>
                <h3 className={`mt-1 text-[16px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>تفصيل مصادر الإنتاجية</h3>
              </div>
              <ChartLine size={20} className={isDark ? "text-zinc-500" : "text-slate-400"} />
            </div>
            <div className="space-y-3">
              {WORK_DISTRIBUTION.map(item => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{item.label}</span>
                    <span className={`font-mono text-[11px] font-bold ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{item.pct}%</span>
                  </div>
                  <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${item.pct}%` }}
                      transition={{ type: "spring", stiffness: 70, damping: 18 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Bento Row: NPS Tier + Pomodoro Level ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Promoter Score Tier Card */}
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2 mb-4">
                <Star size={14} weight="duotone" className="text-[#C8A762]" />
                <p className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>مستوى رضا الموكلين</p>
              </div>

              {/* NPS Score hero */}
              <div className="flex items-center gap-4 mb-4">
                <div className="relative w-16 h-16 flex-shrink-0">
                  <svg width="64" height="64" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeWidth="12"
                      className={isDark ? "text-white/[0.06]" : "text-slate-100"} />
                    <motion.circle cx="50" cy="50" r="36" fill="none"
                      stroke={npsTier.color} strokeWidth="12" strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                      initial={{ strokeDasharray: `0 ${2 * Math.PI * 36}` }}
                      animate={{ strokeDasharray: `${((NPS_SCORE + 100) / 200) * 2 * Math.PI * 36} ${2 * Math.PI * 36}` }}
                      transition={{ duration: 0.9 }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-[14px] font-black font-mono ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{NPS_SCORE}</span>
                  </div>
                </div>
                <div>
                  <p className="text-[15px] font-black" style={{ color: npsTier.color }}>{npsTier.label}</p>
                  <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{npsTier.sublabel}</p>
                  {npsTier.next != null && (
                    <p className={`text-[10px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      يلزمك NPS <span className="font-mono font-bold">{npsTier.next}</span> للمستوى التالي
                    </p>
                  )}
                </div>
              </div>

              {/* Progress to next tier */}
              {npsTier.next != null && (
                <div className="mb-4">
                  <div className="flex justify-between mb-1">
                    <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>التقدم نحو "{NPS_TIERS.find(t=>t.min===npsTier.next)?.label}"</span>
                    <span className={`text-[10px] font-mono font-bold`} style={{ color: npsTier.color }}>{npsNextPct}٪</span>
                  </div>
                  <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.05]" : "bg-slate-100"}`}>
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${npsNextPct}%` }}
                      transition={{ duration: 0.7 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: npsTier.color }}
                    />
                  </div>
                </div>
              )}

              {/* Promoter breakdown */}
              <div className="space-y-2">
                {[
                  { label: "مروّجون",  pct: PROMOTER_DATA.promoters,  icon: Smiley,    color: "#10b981" },
                  { label: "محايدون",  pct: PROMOTER_DATA.passives,   icon: SmileyMeh, color: "#C8A762" },
                  { label: "منتقدون",  pct: PROMOTER_DATA.detractors, icon: SmileySad, color: "#ef4444" },
                ].map(row => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label} className="flex items-center gap-2">
                      <Icon size={13} weight="duotone" style={{ color: row.color }} />
                      <span className={`text-[11px] flex-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{row.label}</span>
                      <span className={`text-[11px] font-mono font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{row.pct}٪</span>
                      <div className={`w-16 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.05]" : "bg-slate-100"}`}>
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${row.pct}%` }}
                          transition={{ duration: 0.6 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Metal Level Card */}
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2 mb-4">
                <Coins size={14} weight="duotone" className="text-[#C8A762]" />
                <p className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>مستوى الإنتاجية</p>
              </div>
              <div className={`rounded-2xl p-4 mb-4 ${isDark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-slate-50 border border-slate-100"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>المستوى الحالي</p>
                    <p className="text-[22px] font-black" style={{ color: metalTier.color }}>{metalTier.emoji} {metalTier.label}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[32px] font-black font-mono leading-none ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{WORK_HOURS.total}</p>
                    <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>ساعة تراكمية</p>
                  </div>
                </div>
                {metalTier.next && (
                  <>
                    <div className="flex justify-between mb-1">
                      <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        فاضلك <span className="font-mono font-bold">{metalHoursLeft.toFixed(1)}</span> س للمستوى التالي ({nextMetalLabel})
                      </span>
                      <span className="text-[10px] font-mono font-bold" style={{ color: metalTier.color }}>{metalPct}٪</span>
                    </div>
                    <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.05]" : "bg-slate-200"}`}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${metalPct}%` }}
                        transition={{ duration: 0.8, delay: 0.1 }} className="h-full rounded-full"
                        style={{ backgroundColor: metalTier.color }} />
                    </div>
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "هذا الأسبوع",   value: WORK_HOURS.thisWeek,  unit: "س",    color: "#6366f1" },
                  { label: "سلسلة التركيز",  value: WORK_HOURS.streak,    unit: "يوم",  color: "#f59e0b" },
                  { label: "الجلسات",        value: WORK_HOURS.sessions,  unit: "جلسة", color: "#0B3D2E" },
                  { label: "إجمالي تراكمي", value: WORK_HOURS.total,     unit: "س",    color: metalTier.color },
                ].map(stat => (
                  <div key={stat.label} className={`rounded-xl p-3 ${isDark ? "bg-white/[0.03] border border-white/[0.04]" : "bg-slate-50 border border-slate-100"}`}>
                    <p className="text-[20px] font-black font-mono leading-none mb-0.5" style={{ color: stat.color }}>{stat.value}</p>
                    <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{stat.label} <span className="font-semibold">{stat.unit}</span></p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1">
                {[...METAL_TIERS].reverse().map(t => (
                  <div key={t.label}
                    className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${
                      metalTier.label === t.label ? "border-current" : isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-200 text-slate-400"
                    }`}
                    style={{ color: metalTier.label === t.label ? t.color : undefined }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    {t.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Activity Chart ── */}
          <SpotlightCard isDark={isDark} className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <ChartBar size={14} weight="duotone" className="text-[#0B3D2E]" />
                <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>نشاط الأعمال</h3>
              </div>
              <div className={`flex gap-1 p-1 rounded-xl self-start sm:self-auto ${isDark ? "bg-zinc-800/60 border border-white/[0.06]" : "bg-slate-100"}`}>
                {(Object.keys(ACTIVITY_DATA) as AnalyticsPeriod[]).map(p => (
                  <button key={p} onClick={() => setAnalyticsPeriod(p)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      analyticsPeriod === p
                        ? isDark ? "bg-white/10 text-white shadow-sm" : "bg-white text-slate-800 shadow-sm"
                        : isDark ? "text-zinc-500" : "text-slate-400"
                    }`}>{p}</button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-1 h-28">
              {ACTIVITY_DATA[analyticsPeriod].map((d, i) => {
                const total = d.cases + d.contracts + d.consult;
                const max = Math.max(...ACTIVITY_DATA[analyticsPeriod].map(x => x.cases + x.contracts + x.consult), 1);
                const h = Math.max((total / max) * 100, 4);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col-reverse rounded-sm overflow-hidden" style={{ height: `${h}%` }}>
                      <div className="w-full bg-[#0B3D2E]" style={{ height: `${(d.cases/total)*100}%` }} />
                      <div className="w-full bg-[#C8A762]" style={{ height: `${(d.contracts/total)*100}%` }} />
                      <div className="w-full bg-blue-500/70" style={{ height: `${(d.consult/total)*100}%` }} />
                    </div>
                    <span className={`text-[8px] font-mono ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{d.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[9px]">
              {[["قضايا","bg-[#0B3D2E]"],["عقود","bg-[#C8A762]"],["استشارات","bg-blue-500/70"]].map(([l,c]) => (
                <span key={l} className={`flex items-center gap-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  <span className={`w-2 h-2 rounded-sm ${c}`} />{l}
                </span>
              ))}
            </div>
          </SpotlightCard>

          {/* ── Work Distribution + Win Rate (2-col) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
            <SpotlightCard isDark={isDark} className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase size={14} weight="duotone" className="text-[#C8A762]" />
                <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>توزيع نوع العمل</h3>
              </div>
              <div className="space-y-2">
                {WORK_DIST.map((w, i) => {
                  const isOpen = activeWorkIdx === i;
                  return (
                    <div key={i}>
                      <button onClick={() => setActiveWorkIdx(isOpen ? null : i)}
                        className={`w-full flex items-center gap-3 rounded-xl p-2.5 transition-all text-right ${isOpen ? isDark ? "bg-white/[0.06]" : "bg-slate-50" : "hover:bg-black/[0.02]"}`}>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: w.color }} />
                        <span className={`text-[12px] font-semibold flex-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{w.label}</span>
                        <span className="text-[11px] font-mono font-bold" style={{ color: w.color }}>{w.pct}٪</span>
                        <div className={`w-20 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                          <motion.div animate={{ width: `${w.pct}%` }} initial={{ width: 0 }}
                            transition={{ duration: 0.7, delay: i * 0.1 }} className="h-full rounded-full" style={{ backgroundColor: w.color }} />
                        </div>
                        <ArrowDown size={11} className={`transition-transform ${isOpen ? "rotate-180" : ""} ${isDark ? "text-zinc-600" : "text-slate-400"}`} />
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                            <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-1">
                              {w.sub.map(s => (
                                <span key={s} className={`text-[10px] px-2 py-0.5 rounded-full border ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>{s}</span>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </SpotlightCard>

            <SpotlightCard isDark={isDark} className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Trophy size={14} weight="duotone" className="text-amber-500" />
                <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>نتائج القضايا</h3>
              </div>
              <div className="flex flex-col items-center mb-4">
                <div className="relative w-24 h-24">
                  <RingScore score={WIN_RATE_PCT} color="#C8A762" size={96} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-2xl font-black font-mono ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{WIN_RATE_PCT}٪</span>
                    <span className={`text-[9px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>فوز</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { label: "مكسوبة",    val: WIN.won,     color: "#10b981" },
                  { label: "تسوية",     val: WIN.settled, color: "#3b82f6" },
                  { label: "خسارة",     val: WIN.lost,    color: "#ef4444" },
                  { label: "قيد النظر", val: WIN.pending, color: "#94a3b8" },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className={`text-[11px] flex-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{s.label}</span>
                    <span className={`text-[11px] font-mono font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{s.val}</span>
                    <div className={`w-12 h-1 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${(s.val / WIN_TOTAL) * 100}%` }}
                        transition={{ duration: 0.6, delay: 0.3 }} className="h-full rounded-full" style={{ backgroundColor: s.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </SpotlightCard>
          </div>

          {/* ── AI Usage ── */}
          <SpotlightCard isDark={isDark} className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Robot size={14} weight="duotone" className="text-[#C8A762]" />
              <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>أكثر أدوات نظامي AI استخداماً</h3>
              <span className={`text-[10px] font-mono mr-auto ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                إجمالي: {AI_TOOLS.reduce((s,a) => s+a.uses, 0)} استخدام
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AI_TOOLS.map((tool, i) => (
                <motion.div key={tool.label} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ type: "spring", stiffness: 120, damping: 18, delay: i * 0.07 }} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tool.color }} />
                      <span className={`text-[12px] font-medium ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{tool.label}</span>
                    </div>
                    <span className={`text-[11px] font-mono font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{tool.uses}أ—</span>
                  </div>
                  <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(tool.uses / 47) * 100}%` }}
                      transition={{ duration: 0.7, delay: 0.1 * i }} className="h-full rounded-full" style={{ backgroundColor: tool.color }} />
                  </div>
                </motion.div>
              ))}
            </div>
          </SpotlightCard>

          {/* ── Professional Scores ── */}
          <SpotlightCard isDark={isDark} className="p-5">
            <div className="flex items-center gap-2 mb-5">
              <Target size={14} weight="duotone" className="text-[#0B3D2E]" />
              <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>مؤشرات التطوير المهني</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {PRO_SCORES.map((item, i) => (
                <motion.div key={item.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 100, damping: 20, delay: i * 0.1 }} className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <RingScore score={item.score} color={item.color} size={84} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-xl font-black font-mono ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{item.score}</span>
                    </div>
                  </div>
                  <p className={`text-[11px] font-semibold text-center ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{item.label}</p>
                </motion.div>
              ))}
            </div>
          </SpotlightCard>

          {/* ── Financial Summary ── */}
          <SpotlightCard isDark={isDark} className="p-5">
            <div className="flex items-center gap-2 mb-5">
              <Coins size={14} weight="duotone" className="text-[#C8A762]" />
              <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>ملخص الإيرادات</h3>
              <span className={`text-[10px] mr-auto px-2 py-0.5 rounded-full border font-semibold ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-400"}`}>تقديري</span>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-5">
              {[
                { label: "الإجمالي السنوي",   value: FINANCIAL_DATA.total.toLocaleString(), unit: "ر.س", color: "#0B3D2E" },
                { label: "المتوسط الشهري",     value: FINANCIAL_DATA.monthly.toLocaleString(), unit: "ر.س", color: "#C8A762" },
                { label: `أعلى شهر (${FINANCIAL_DATA.bestMonth.name})`, value: FINANCIAL_DATA.bestMonth.amount.toLocaleString(), unit: "ر.س", color: "#10b981" },
              ].map(item => (
                <div key={item.label}>
                  <p className={`text-[10px] mb-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.label}</p>
                  <p className="text-[18px] font-black font-mono leading-none" style={{ color: item.color }}>{item.value}</p>
                  <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-500"}`}>{item.unit}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {FINANCIAL_DATA.sources.map((src, i) => (
                <div key={src.label}>
                  <div className="flex justify-between mb-1">
                    <span className={`text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{src.label}</span>
                    <span className="text-[11px] font-mono font-bold" style={{ color: src.color }}>{src.pct}٪</span>
                  </div>
                  <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${src.pct}%` }}
                      transition={{ duration: 0.7, delay: i * 0.1 }} className="h-full rounded-full" style={{ backgroundColor: src.color }} />
                  </div>
                </div>
              ))}
            </div>
          </SpotlightCard>
        </div>
      )}

      {/* Tab: Achievements */}
      {activeTab === "achievements" && (
        <AchievementsTab
          isDark={isDark}
          totalPoints={totalPoints}
          unlockedLength={unlocked.length}
          cardClass={card}
          achievements={ACHIEVEMENTS}
          milestones={MILESTONES}
        />
      )}

      {/* Tab: Reviews */}
      {activeTab === "reviews" && (
        <ReviewsTab isDark={isDark} reviews={REVIEWS} cardClass={card} />
      )}
    </div>

    {/* ── Share Modal ── */}
    <ShareModal
      open={shareOpen}
      onClose={() => setShareOpen(false)}
      isDark={isDark}
      metalTier={metalTier}
      shareToggles={shareToggles}
      setShareToggles={setShareToggles}
      WIN_RATE_PCT={WIN_RATE_PCT}
      reviewCount={MOCK_PROFILE.reviewCount}
    />
    </>
  );
}
