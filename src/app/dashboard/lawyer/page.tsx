"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@/hooks/useUser";
import { useTheme } from "@/components/ThemeProvider";
import {
  Scales, Gavel, CheckCircle, Clock,
  CaretLeft, Robot, PencilSimple,
  CalendarCheck, Lightning,
  Warning, ArrowUp,
  Bell, Hourglass, Plus,
  Flag, Lock, Crown, ArrowRight, Storefront,
  Timer, Folder, Money, Briefcase,
} from "@phosphor-icons/react";
import HijriDateWidget from "@/components/HijriDateWidget";
import Link from "next/link";
import { LawyerDashboardSkeleton } from "@/components/ui";
import { OnboardingBanner } from "@/components/OnboardingBanner";

// ─── Subscription Tiers ───────────────────────────────────────────────────────
type LawyerTier = "free" | "starter" | "pro" | "premium";

const TIER_CONFIG: Record<LawyerTier, {
  labelAr: string; labelEn: string;
  color: string; bg: string; border: string;
  canDraft: boolean;   // الصائغ القانوني
  canScribe: boolean;  // مفرغ الجلسات
  caseLimit: number | null;
  consultLimit: number | null;
}> = {
  free:    { labelAr: "مجاني",         labelEn: "Free",     color: "text-slate-500",   bg: "bg-slate-100",      border: "border-slate-200",   canDraft: false, canScribe: false, caseLimit: 3,  consultLimit: 1 },
  starter: { labelAr: "الناشئ",        labelEn: "Starter",  color: "text-blue-600",   bg: "bg-blue-50",        border: "border-blue-200",    canDraft: false, canScribe: false, caseLimit: 10, consultLimit: 5 },
  pro:     { labelAr: "الاحترافي",     labelEn: "Pro",      color: "text-royal",      bg: "bg-royal/8",        border: "border-royal/20",    canDraft: true,  canScribe: true,  caseLimit: null, consultLimit: null },
  premium: { labelAr: "المميز",        labelEn: "Premium",  color: "text-[#C8A762]",  bg: "bg-[#C8A762]/10",   border: "border-[#C8A762]/30", canDraft: true,  canScribe: true,  caseLimit: null, consultLimit: null },
};

// Local imports
import AddCaseModal from "./_components/AddCaseModal";
import AddTaskModal from "./_components/AddTaskModal";
import { AI_QUICK, ACTIVITY_TYPE_CONFIG } from "./_data/mockData";
import { getLawyerDashboardSummary, type LawyerDashboardSummary } from "@/lib/services/lawyerDashboardService";
import { isSupabaseMode } from "@/lib/services/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map API case status to display shape */
function mapStatus(status: string): "active" | "pending" {
  return ["assigned", "in_progress"].includes(status) ? "active" : "pending";
}

/** Relative-time label for an ISO date string */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

/** Days remaining until a given ISO date */
function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/** Map event_type to an activity type for the icon config */
function mapEventType(eventType: string): string {
  if (eventType.includes("ai")) return "ai";
  if (eventType.includes("urgent") || eventType.includes("overdue")) return "urgent";
  if (eventType.includes("complet") || eventType.includes("success")) return "success";
  if (eventType.includes("warn") || eventType.includes("reject")) return "warning";
  return "info";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LawyerDashboardPage() {
  const { name, tier: userTier } = useUser();
  const { isDark } = useTheme();
  const [activityTab, setActivityTab] = useState<"all" | "ai">("all");
  const [showAddCase, setShowAddCase] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<LawyerDashboardSummary | null>(null);

  // Fetch real dashboard data from Supabase-backed service
  useEffect(() => {
    getLawyerDashboardSummary()
      .then((data) => {
        setDashboardData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ─── Derived tier ─────────────────────────────────────────────────────────
  // Map the user's real subscription tier (UserTier) to the lawyer page's
  // LawyerTier vocabulary so the upgrade banner + AI-tool gating reflect the
  // actual plan instead of a hardcoded "free".
  function deriveLawyerTier(t: string | undefined | null): LawyerTier {
    switch (t) {
      case "max":
      case "corp":
      case "enterprise":
        return "premium";
      case "pro":
        return "pro";
      case "ai":
      case "shield":
        return "starter";
      default:
        return "free";
    }
  }
  const lawyerTier: LawyerTier = deriveLawyerTier(userTier);

  // ─── Computed stats ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!dashboardData) return [];
    return [
      { label: "القضايا النشطة", value: String(dashboardData.activeCases), icon: Scales, color: "text-royal", bg: "bg-royal/8", trend: "", trendLabel: "نشطة", up: true },
      { label: "الاستشارات المعلقة", value: String(dashboardData.pendingConsultations), icon: Briefcase, color: "text-amber-500", bg: "bg-amber-500/8", trend: "", trendLabel: "بانتظار رد", up: false },
      { label: "الجلسات القادمة", value: String((dashboardData.upcomingDeadlines as unknown[]).length), icon: Gavel, color: "text-blue-500", bg: "bg-blue-500/8", trend: "", trendLabel: "قادمة", up: true },
      { label: "الإيرادات", value: dashboardData.revenueThisMonth > 0 ? `${dashboardData.revenueThisMonth.toLocaleString("ar-SA")} ﷼` : "٠ ﷼", icon: Money, color: "text-emerald-500", bg: "bg-emerald-500/8", trend: "", trendLabel: "هذا الشهر", up: dashboardData.revenueThisMonth > 0 },
    ];
  }, [dashboardData]);

  // ─── Computed tasks (from recent cases) ────────────────────────────────────
  const tasks = useMemo(() => {
    if (!dashboardData) return [];
    const cases = dashboardData.recentCases as Array<{ id: string; title: string; updated_at?: string; type?: string }>;
    return cases.slice(0, 4).map((c, i) => ({
      id: i + 1,
      title: c.title || "مهمة",
      dueDate: c.updated_at ? relativeTime(c.updated_at) : "—",
      priority: (i === 0 ? "high" : i === 1 ? "medium" : "low") as "high" | "medium" | "low",
      category: c.type || "عام",
    }));
  }, [dashboardData]);

  // ─── Computed recent cases ────────────────────────────────────────────────
  const recentCases = useMemo(() => {
    if (!dashboardData) return [];
    const cases = dashboardData.recentCases as Array<{ id: string; title: string; status: string; updated_at?: string; type?: string; metadata?: { next_step?: string } }>;
    return cases.map((c) => ({
      id: c.id,
      title: c.title || "—",
      status: mapStatus(c.status),
      date: c.updated_at ? relativeTime(c.updated_at) : "—",
      nextStep: c.metadata?.next_step || "—",
      type: c.type || "عام",
    }));
  }, [dashboardData]);

  // ─── Computed activity timeline ───────────────────────────────────────────
  const activityTimeline = useMemo(() => {
    if (!dashboardData) return [];
    // API returns { event, created_at, request_id } — no event_type/payload.
    const events = dashboardData.recentActivity as Array<{ id: string; event: string; created_at: string; request_id?: string }>;
    return events.map((e, i) => ({
      id: i + 1,
      time: relativeTime(e.created_at),
      action: e.event || "نشاط",
      type: mapEventType(e.event) as "warning" | "success" | "info" | "urgent" | "ai",
      caseRef: e.request_id || "—",
      category: (e.event?.includes("ai") ? "ai" : "manual") as "ai" | "manual" | "system",
    }));
  }, [dashboardData]);

  // ─── Computed deadlines ───────────────────────────────────────────────────
  const upcomingDeadlines = useMemo(() => {
    if (!dashboardData) return [];
    // API returns consultations with { id, scheduled_at, mode, requester_user_id } — no `type`.
    const items = dashboardData.upcomingDeadlines as Array<{ id: string; scheduled_at: string; type?: string; mode?: string }>;
    return items.map((d) => {
      const days = daysUntil(d.scheduled_at);
      return {
        label: d.type || (d.mode ? "استشارة قادمة" : "موعد قادم"),
        date: new Date(d.scheduled_at).toLocaleDateString("ar-SA", { day: "numeric", month: "long" }),
        daysLeft: days,
        severity: (days <= 2 ? "urgent" : days <= 7 ? "warning" : "normal") as "urgent" | "warning" | "normal",
      };
    });
  }, [dashboardData]);

  // ─── Computed hearings (from upcomingDeadlines) ───────────────────────────
  const hearings = useMemo(() => {
    if (!dashboardData) return [];
    const items = dashboardData.upcomingDeadlines as Array<{ id: string; scheduled_at: string; type?: string }>;
    return items.slice(0, 3).map((d, i) => {
      const days = daysUntil(d.scheduled_at);
      const dateObj = new Date(d.scheduled_at);
      const dateLabel = days === 0 ? "اليوم" : days === 1 ? "غداً" : dateObj.toLocaleDateString("ar-SA", { weekday: "long" });
      const timeLabel = dateObj.toLocaleTimeString("ar-SA", { hour: "numeric", minute: "2-digit" });
      const palette = [
        { color: "text-red-500",   bg: isDark ? "bg-red-500/10"   : "bg-red-50",   borderColor: isDark ? "border-red-500/20"   : "border-red-200" },
        { color: "text-amber-500", bg: isDark ? "bg-amber-500/10" : "bg-amber-50", borderColor: isDark ? "border-amber-500/20" : "border-amber-200" },
        { color: "text-blue-500",  bg: isDark ? "bg-blue-500/10"  : "bg-blue-50",  borderColor: isDark ? "border-blue-500/20"  : "border-blue-200" },
      ];
      const c = palette[i % palette.length];
      return {
        court: d.type || "جلسة",
        case: d.type || "موعد قادم",
        date: dateLabel,
        time: timeLabel,
        ...c,
      };
    });
  }, [dashboardData, isDark]);

  if (loading) return <LawyerDashboardSkeleton />;

  const card = `rounded-2xl border ${isDark
    ? "bg-zinc-900/60 border-white/[0.06]"
    : "bg-white border-slate-100 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]"}`;

  const activityIconMap = Object.fromEntries(
    Object.entries(ACTIVITY_TYPE_CONFIG).map(([key, cfg]) => [
      key,
      {
        icon: cfg.icon,
        color: cfg.color,
        bg: isDark ? cfg.bgDark : cfg.bgLight,
        border: isDark ? cfg.borderDark : cfg.borderLight,
      },
    ])
  ) as Record<string, { icon: React.ElementType; color: string; bg: string; border: string }>;

  const filteredTimeline = activityTimeline.filter(
    item => activityTab === "all" || item.category === "ai"
  );

  return (
    <div className="max-w-[1400px] mx-auto space-y-5" dir="rtl">

      {/* ── Onboarding Welcome (first-visit only) ── */}
      <OnboardingBanner role="lawyer" name={name} isDark={isDark} />

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}
          >
            مرحباً، {name}
          </motion.h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            نظرة سريعة على أعمالك وقضاياك اليوم
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HijriDateWidget />
          <Link href="/dashboard/lawyer/profile"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
              isDark ? "border-[#C8A762]/30 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-[#C8A762]/40 text-[#C8A762] hover:bg-[#C8A762]/5"
            }`}
          >
            <Storefront size={16} weight="duotone" /> نشر في السوق
          </Link>
          <Link href="/ai/draft"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0B3D2E]/90 transition-colors"
          >
            <PencilSimple size={16} weight="duotone" /> الصائغ القانوني
          </Link>
          <button onClick={() => setShowAddCase(true)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            <Plus size={16} weight="bold" /> قضية جديدة
          </button>
        </div>
      </div>

      {/* ── Subscription Banner ── */}
      {(lawyerTier === "free" || lawyerTier === "starter") && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex flex-wrap items-center gap-3 ${
            isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50/70"
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0B3D2E] text-[#C8A762]">
            <Crown size={17} weight="fill" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
              باقة {TIER_CONFIG[lawyerTier].labelAr} — الصائغ القانوني ومفرغ الجلسات غير متاحَين
            </p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              {lawyerTier === "free"
                ? `حد الاشتراك: ${TIER_CONFIG.free.caseLimit} قضايا · ${TIER_CONFIG.free.consultLimit} استشارة`
                : `حد الاشتراك: ${TIER_CONFIG.starter.caseLimit} قضايا · ${TIER_CONFIG.starter.consultLimit} استشارات`
              } · ترقَّ للاحترافي أو المميز للوصول الكامل
            </p>
          </div>
          <Link
            href="/dashboard/lawyer/finance"
            className="shrink-0 flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-[#C8A762] hover:bg-[#155e41] transition-colors"
          >
            ترقية الباقة <ArrowRight size={12} />
          </Link>
        </motion.div>
      )}

      {/* ── Demo Data Banner (only in demo mode) ── */}
      {!isSupabaseMode && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
            <Warning size={18} weight="fill" className="text-amber-500" />
          </div>
          <div>
            <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>بيانات تجريبية</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/60"}`}>تعمل المنصة في الوضع التجريبي — اضبط NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase لعرض بياناتك الفعلية.</p>
          </div>
        </motion.div>
      )}

      {/* ── Urgent Deadlines Banner ── */}
      {upcomingDeadlines.some(d => d.severity === "urgent") && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-red-700/30 bg-red-900/10" : "border-red-200 bg-red-50"}`}
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-red-500/15" : "bg-red-100"}`}>
            <Lightning size={18} weight="fill" className="text-red-500" />
          </div>
          <div className="flex-1">
            <p className={`text-[13px] font-bold ${isDark ? "text-red-400" : "text-red-700"}`}>
              <Warning size={14} weight="fill" className="inline mb-0.5 me-1" />
              لديك موعد طعن خلال يومين — {upcomingDeadlines[0].label}
            </p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-red-600/60"}`}>
              {upcomingDeadlines[0].date} — تأكد من تحضير المستندات المطلوبة
            </p>
          </div>
          <Link href="/dashboard/lawyer/hearings"
            className="flex items-center gap-1 text-[12px] font-bold text-red-500 hover:underline flex-shrink-0"
          >
            عرض المواعيد <CaretLeft size={11} />
          </Link>
        </motion.div>
      )}

      {/* ── Quick Actions Bar ── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, type: "spring", stiffness: 180, damping: 22 }}
        className={`rounded-2xl border p-3 ${isDark
          ? "bg-zinc-900/40 border-white/[0.05]"
          : "bg-white border-slate-100 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]"}`}
      >
        <div className="flex items-center gap-1 flex-wrap">
          {/* Section label */}
          <span className={`text-[10px] font-black uppercase tracking-widest px-2 shrink-0 ${
            isDark ? "text-zinc-600" : "text-slate-400"
          }`}>
            إجراءات سريعة
          </span>
          <div className={`h-4 w-px mx-1 shrink-0 ${ isDark ? "bg-white/10" : "bg-slate-200"}`} />

          {[
            { label: "قضية جديدة",      icon: Plus,          action: () => setShowAddCase(true),  shortcut: "Q",  accent: false },
            { label: "استشارة جديدة",    icon: CalendarCheck, href: "/dashboard/lawyer/consultations/new", shortcut: "C",  accent: false },
            { label: "صيغ مستند",       icon: PencilSimple,  href: "/ai/draft",   shortcut: "D",  accent: true  },
            { label: "جدول الجلسات",     icon: Gavel,         href: "/dashboard/lawyer/hearings", shortcut: "",   accent: false },
            { label: "مستنداتي",           icon: Folder,        href: "/dashboard/lawyer/documents", shortcut: "",  accent: false },
            { label: "تتبع الوقت",        icon: Timer,         href: "/dashboard/lawyer/tasks",    shortcut: "",   accent: false },
          ].map((item) => {
            const Icon = item.icon;
            const base = `flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all select-none ${
              item.accent
                ? "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0B3D2E]/90"
                : isDark
                  ? "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
            }`;
            if (item.href) {
              return (
                <Link key={item.label} href={item.href} className={base}>
                  <Icon size={14} weight="duotone" />
                  {item.label}
                  {item.shortcut && (
                    <kbd className={`ms-1 hidden sm:inline text-[9px] px-1.5 py-0.5 rounded font-mono ${
                      item.accent ? "bg-white/10 text-[#C8A762]/70" : isDark ? "bg-white/[0.07] text-zinc-600" : "bg-slate-200 text-slate-400"
                    }`}>{item.shortcut}</kbd>
                  )}
                </Link>
              );
            }
            return (
              <button key={item.label} onClick={item.action} className={base}>
                <Icon size={14} weight="duotone" />
                {item.label}
                {item.shortcut && (
                  <kbd className={`ms-1 hidden sm:inline text-[9px] px-1.5 py-0.5 rounded font-mono ${
                    isDark ? "bg-white/[0.07] text-zinc-600" : "bg-slate-200 text-slate-400"
                  }`}>{item.shortcut}</kbd>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ── KPI Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.length === 0 ? (
          <div className={`col-span-full text-center py-8 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
            <p className="text-sm">لا توجد إحصائيات حالياً</p>
          </div>
        ) : stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className={`${card} p-5`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.bg}`}>
                  <Icon size={20} weight="duotone" className={stat.color} />
                </div>
                <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full
                  ${stat.up
                    ? isDark ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                    : isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-amber-50 text-amber-600 border border-amber-200"
                  }`}>
                  {stat.up ? <ArrowUp size={9} weight="bold" /> : <Hourglass size={9} />}
                  {stat.trend}
                </span>
              </div>
              <p className={`text-[11px] mb-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{stat.label}</p>
              <p className={`text-xl font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{stat.value}</p>
              <p className={`text-[10px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{stat.trendLabel}</p>
            </motion.div>
          );
        })}
      </div>

      {/* ── Secondment: no real data yet — entry point is the sidebar link to /dashboard/lawyer/secondment (gated there) ── */}

      {/* ── Second Grid: Tasks + Hearings + Deadlines ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Urgent Tasks */}
        <div className={`${card} p-5 flex flex-col`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <CheckCircle size={15} className="text-royal" weight="duotone" /> المهام العاجلة
            </h2>
            <Link href="/dashboard/lawyer/tasks" className="text-xs text-royal hover:underline">عرض الكل</Link>
          </div>
          <div className="space-y-2 flex-1">
            {tasks.length === 0 ? (
              <div className={`text-center py-6 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                <p className="text-xs">لا توجد مهام عاجلة حالياً</p>
              </div>
            ) : tasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-start gap-2.5 p-3 rounded-xl border transition-colors cursor-pointer ${isDark ? "border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04]" : "border-slate-100 bg-slate-50/80 hover:bg-slate-100/60"}`}
              >
                <div className={`w-2 h-2 mt-1.5 flex-shrink-0 rounded-full ${task.priority === "high" ? "bg-red-400 animate-pulse" : task.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-medium leading-snug mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{task.title}</p>
                  <div className={`flex items-center gap-2 text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    <span className="flex items-center gap-1"><Clock size={10} /> {task.dueDate}</span>
                    <span>·</span>
                    <span className={`px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>{task.category}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowAddTask(true)} className={`w-full mt-3 py-2.5 border border-dashed rounded-xl text-xs font-medium transition-colors ${isDark ? "border-white/10 text-zinc-600 hover:border-white/20 hover:text-zinc-400" : "border-slate-200 text-slate-400 hover:border-royal/30 hover:text-royal"}`}>
            + إضافة مهمة
          </button>
        </div>

        {/* Upcoming Hearings */}
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <CalendarCheck size={15} className="text-blue-500" weight="duotone" /> الجلسات القادمة
            </h2>
            <Link href="/dashboard/lawyer/hearings" className="text-xs text-royal hover:underline">الجدول الكامل</Link>
          </div>
          <div className="space-y-2.5">
            {hearings.length === 0 ? (
              <div className={`text-center py-6 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                <p className="text-xs">لا توجد جلسات قادمة</p>
              </div>
            ) : hearings.map((h, i) => (
              <div key={i} className={`p-3.5 rounded-xl border ${h.borderColor} ${h.bg}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[11px] font-bold ${h.color}`}>{h.date} · {h.time}</span>
                  <Gavel size={13} className={h.color} weight="duotone" />
                </div>
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{h.case}</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{h.court}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Critical Deadlines */}
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <Flag size={15} className="text-red-500" weight="fill" /> مواعيد حرجة
            </h2>
          </div>
          <div className="space-y-2">
            {upcomingDeadlines.length === 0 ? (
              <div className={`text-center py-6 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                <p className="text-xs">لا توجد مواعيد حرجة</p>
              </div>
            ) : upcomingDeadlines.map((d, i) => {
              const severityConfig = {
                urgent:  { bar: "bg-red-500",   text: isDark ? "text-red-400"   : "text-red-600",   bg: isDark ? "bg-red-500/10"   : "bg-red-50",   border: isDark ? "border-red-500/20"   : "border-red-200" },
                warning: { bar: "bg-amber-500", text: isDark ? "text-amber-400" : "text-amber-600", bg: isDark ? "bg-amber-500/10" : "bg-amber-50", border: isDark ? "border-amber-500/20" : "border-amber-200" },
                normal:  { bar: "bg-blue-500",  text: isDark ? "text-blue-400"  : "text-blue-600",  bg: isDark ? "bg-blue-500/10"  : "bg-blue-50",  border: isDark ? "border-blue-500/20"  : "border-blue-200" },
              };
              const cfg = severityConfig[d.severity];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className={`rounded-xl p-3.5 border ${cfg.border} ${cfg.bg}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className={`text-[13px] font-bold ${cfg.text}`}>{d.label}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.severity === "urgent" ? "bg-red-500 text-white animate-pulse" : isDark ? "bg-white/[0.06] text-zinc-500" : "bg-white text-slate-500"}`}>
                      {d.daysLeft === 0 ? "اليوم!" : `${d.daysLeft} أيام`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarCheck size={11} className={cfg.text} />
                    <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{d.date}</span>
                  </div>
                  <div className={`h-1 rounded-full mt-2 overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-white"}`}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(10, 100 - (d.daysLeft * 10))}%` }}
                      transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }}
                      className={`h-full rounded-full ${cfg.bar}`}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Main Grid: Activity + Cases ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Activity Timeline */}
        <div className={`${card} p-5 flex flex-col`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <Clock size={15} className="text-[#C8A762]" weight="duotone" /> سجل النشاط
            </h2>
            <div className={`p-0.5 rounded-lg border flex ${isDark ? "bg-black/20 border-white/5" : "bg-slate-100 border-slate-200"}`}>
              <button
                onClick={() => setActivityTab("all")}
                className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${activityTab === "all" ? (isDark ? "bg-[#C8A762] text-zinc-900" : "bg-white text-slate-800 shadow-sm") : (isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700")}`}
              >الكل</button>
              <button
                onClick={() => setActivityTab("ai")}
                className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 ${activityTab === "ai" ? (isDark ? "bg-[#C8A762] text-zinc-900" : "bg-white text-[#C8A762] shadow-sm") : (isDark ? "text-zinc-500 hover:text-[#C8A762]" : "text-slate-500 hover:text-[#C8A762]")}`}
              >
                <Robot size={12} weight={activityTab === "ai" ? "fill" : "regular"} /> نشاط AI
              </button>
            </div>
          </div>
          <div className="space-y-0 flex-1 relative mt-2">
            <div className={`absolute top-3 bottom-3 w-px ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`} style={{ right: "13px" }} />
            {filteredTimeline.length === 0 ? (
              <div className={`text-center py-8 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                <p className="text-xs">لا يوجد نشاط حالياً</p>
              </div>
            ) : (
            <AnimatePresence mode="popLayout">
              {filteredTimeline.map((item, i) => {
                const config = activityIconMap[item.type] ?? activityIconMap["info"];
                const ActivityIcon = config.icon;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: 8, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -8, scale: 0.95 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-start gap-3 py-2.5 relative"
                  >
                    <div className={`flex-shrink-0 w-[27px] h-[27px] rounded-lg flex items-center justify-center z-10 ${config.bg} border ${config.border}`}>
                      <ActivityIcon size={12} weight={item.type === "ai" ? "duotone" : "fill"} className={config.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-bold leading-snug ${item.type === "ai" ? (isDark ? "text-[#C8A762]" : "text-slate-800") : (isDark ? "text-zinc-300" : "text-slate-700")}`}>
                        {item.action}
                      </p>
                      <div className={`flex items-center gap-2 mt-1 text-[10px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                        <span className="flex items-center gap-1"><Clock size={10} /> {item.time}</span>
                        <span>·</span>
                        <span className="truncate">{item.caseRef}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            )}
          </div>
        </div>

        {/* Cases Table */}
        <div className={`lg:col-span-2 ${card} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <Scales size={15} className="text-royal" weight="duotone" /> القضايا النشطة
            </h2>
            <Link href="/dashboard/lawyer/cases" className="text-xs text-royal hover:underline flex items-center gap-1">
              إدارة القضايا <CaretLeft size={10} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse min-w-[500px]">
              <thead>
                <tr className={`border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                  {["اسم القضية", "النوع", "الحالة", "آخر تحديث", "الخطوة القادمة", ""].map((h, i) => (
                    <th key={i} className={`pb-3 text-[11px] font-semibold ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-white/[0.04]" : "divide-slate-50"}`}>
                {recentCases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={`text-center py-8 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      <p className="text-xs">لا توجد قضايا نشطة حالياً</p>
                    </td>
                  </tr>
                ) : recentCases.map((c) => (
                  <tr key={c.id} className={`group transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50/50"}`}>
                    <td className="py-3.5">
                      <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{c.title}</p>
                    </td>
                    <td className="py-3.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-500"}`}>
                        {c.type}
                      </span>
                    </td>
                    <td className="py-3.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${c.status === "active" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"}`}>
                        {c.status === "active" ? "نشطة" : "انتظار"}
                      </span>
                    </td>
                    <td className={`py-3.5 text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{c.date}</td>
                    <td className={`py-3.5 text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{c.nextStep}</td>
                    <td className="py-3.5 pl-2">
                      <Link href={`/dashboard/lawyer/cases/${c.id}`}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all ${isDark ? "text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300" : "text-slate-300 hover:bg-royal hover:text-white"}`}
                      >
                        <CaretLeft size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── AI Quick Access ── */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Robot size={14} className="text-[#C8A762]" weight="duotone" />
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              أدوات نظامي AI — وصول سريع
            </span>
          </div>
          <Link href="/ai" className={`text-xs font-semibold text-royal hover:underline`}>عرض الكل</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {AI_QUICK.map((item) => {
            const Icon = item.icon;
            // Lock الصائغ ومحترف العقود (can act as المفرغ) for free/starter
            const isLocked =
              (item.href === "/ai/draft" && !TIER_CONFIG[lawyerTier].canDraft) ||
              (item.href === "/ai/contracts" && !TIER_CONFIG[lawyerTier].canScribe);

            if (isLocked) {
              return (
                <div key={item.href}
                  className={`group relative flex flex-col items-center gap-2 px-4 py-4 rounded-xl border text-center opacity-50 cursor-not-allowed select-none ${
                    isDark ? "border-white/[0.04] bg-white/[0.01]" : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <span className={`absolute -top-1.5 -left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-600 text-white`}>
                    محجوب
                  </span>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isDark ? "bg-white/[0.03]" : "bg-slate-100"
                  }`}>
                    <Lock size={18} weight="duotone" className={isDark ? "text-zinc-600" : "text-slate-300"} />
                  </div>
                  <span className={`text-[13px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{item.label}</span>
                  <span className={`text-[10px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>متاح في الاحترافي ↑</span>
                </div>
              );
            }

            return (
              <Link key={item.href} href={item.href}
                className={`group relative flex flex-col items-center gap-2 px-4 py-4 rounded-xl border text-center transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-[#0B3D2E]/15 hover:border-[#C8A762]/20" : "border-slate-100 hover:border-royal/20 hover:bg-royal/[0.02]"}`}
              >
                {item.badge && (
                  <span className={`absolute -top-1.5 -left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.hot ? "bg-royal text-white" : "bg-amber-500/20 text-amber-600 border border-amber-500/30"}`}>
                    {item.badge}
                  </span>
                )}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isDark ? "bg-white/[0.04] group-hover:bg-[#0B3D2E]/30" : "bg-royal/5 group-hover:bg-royal/10"}`}>
                  <Icon size={20} weight="duotone" className="text-royal" />
                </div>
                <span className={`text-[13px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{item.label}</span>
                <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.desc}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── AI Secretary Notice ── */}
      <div className={`p-4 rounded-2xl border flex gap-4 items-start ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#C8A762]/20 bg-amber-50/60"}`}>
        <div className="w-9 h-9 rounded-xl bg-[#0B3D2E] text-[#C8A762] flex items-center justify-center flex-shrink-0">
          <Robot size={18} weight="duotone" />
        </div>
        <div className="flex-1">
          <h4 className={`text-[13px] font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
            التقرير اليومي من السكرتير الذكي جاهز
          </h4>
          <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
            جداولك مزدحمة غداً — تم تحضير مسودات الردود المطلوبة تلقائياً.
          </p>
        </div>
        <Link href="/ai/secretary"
          className="flex items-center gap-1 text-[12px] font-bold text-royal hover:underline flex-shrink-0 mt-0.5"
        >
          مراجعة <CaretLeft size={11} />
        </Link>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showAddCase && <AddCaseModal onClose={() => setShowAddCase(false)} isDark={isDark} />}
        {showAddTask && <AddTaskModal onClose={() => setShowAddTask(false)} isDark={isDark} />}
      </AnimatePresence>

    </div>
  );
}
