"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useUser } from "@/hooks/useUser";
import Link from "next/link";
import {
  Gavel, UsersThree, ChartBar, Money,
  CalendarCheck, ArrowUpRight, WarningCircle,
  ClockCounterClockwise, Robot, FileText,
  CheckCircle, Buildings, ChartLine,
  Lock, Plus, ArrowLeft,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useFirmRole } from "./layout";
import { readWorkflowRequestsByReceiver, type WorkflowRequest } from "@/lib/workflowStore";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { FirmProfileReadinessPanel } from "@/components/dashboard/firm/FirmProfileReadinessPanel";

// ─── Mock KPIs ────────────────────────────────────────────────────────────────
const STATS = [
  { labelAr: "القضايا النشطة",      labelEn: "Active Cases",    value: "38",          icon: Gavel,         color: "text-royal",      bg: "bg-royal/8",         trendAr: "+5 هذا الشهر",   trendEn: "+5 this month",     requiresFinancials: false },
  { labelAr: "أعضاء الفريق",        labelEn: "Team Members",   value: "12",          icon: UsersThree,    color: "text-blue-500",   bg: "bg-blue-500/8",      trendAr: "٢ متدرب",        trendEn: "2 trainees",        requiresFinancials: false },
  { labelAr: "الجلسات هذا الأسبوع", labelEn: "Hearings This Week", value: "7",      icon: CalendarCheck, color: "text-amber-500",  bg: "bg-amber-500/8",     trendAr: "غداً: ٣ جلسات", trendEn: "Tomorrow: 3",      requiresFinancials: false },
  { labelAr: "الإيرادات الشهرية",   labelEn: "Monthly Revenue", value: "١٨٠,٠٠٠ ﷼", icon: Money,        color: "text-emerald-500", bg: "bg-emerald-500/8",   trendAr: "+١٨% عن الشهر",  trendEn: "+18% vs last month", requiresFinancials: true },
];

const URGENT_ITEMS = [
  { id: 1, type: "deadline" as const, titleAr: "تقديم لائحة اعتراضية — قضية ٢٣٤١",    titleEn: "File objection — Case 2341",          deadlineAr: "اليوم ١١:٥٩ م", deadlineEn: "Today 11:59 PM", assignee: "أ. سارة"  },
  { id: 2, type: "hearing"  as const, titleAr: "جلسة نزاع تجاري — المحكمة التجارية",    titleEn: "Commercial dispute hearing",          deadlineAr: "غداً ٩:٠٠ ص",   deadlineEn: "Tomorrow 9 AM",  assignee: "أ. تركي"  },
  { id: 3, type: "contract" as const, titleAr: "مراجعة عقد استثمار — شركة المساء",       titleEn: "Review investment contract",           deadlineAr: "بعد غد",         deadlineEn: "Day after tomorrow", assignee: "أ. نورة" },
];

// Associate only sees their own
const MY_ITEMS = [
  { id: 1, type: "deadline" as const, titleAr: "صياغة مذكرة جوابية — قضية ١٢٢٠",     titleEn: "Draft reply memo — Case 1220",   deadlineAr: "اليوم ٦:٠٠ م",  deadlineEn: "Today 6 PM",    assignee: "أنت"  },
  { id: 2, type: "contract" as const, titleAr: "مراجعة وثائق الشركة الناشئة",          titleEn: "Review startup documents",       deadlineAr: "بعد غد",        deadlineEn: "Day after tomorrow", assignee: "أنت" },
];

type FirmUrgentItem = {
  id: string | number;
  type: "deadline" | "hearing" | "contract";
  titleAr: string;
  titleEn: string;
  deadlineAr: string;
  deadlineEn: string;
  assignee: string;
};

function workflowToFirmItem(request: WorkflowRequest): FirmUrgentItem {
  return {
    id: request.id,
    type: "contract",
    titleAr: request.title,
    titleEn: request.title,
    deadlineAr: String(request.metadata?.deadline ?? "طلب وارد الآن"),
    deadlineEn: String(request.metadata?.deadline ?? "Incoming request"),
    assignee: request.requester.name || "عميل نظامي",
  };
}

const RECENT_ACTIVITY = [
  { id: 1, action: { ar: "صيغت مذكرة جوابية",      en: "Reply memo drafted"       }, by: "أ. خالد", timeAr: "منذ ٣٠ دقيقة", timeEn: "30 min ago",  icon: FileText },
  { id: 2, action: { ar: "تم إغلاق القضية ٠٠٧٨",   en: "Case 0078 closed"         }, by: "أ. سارة", timeAr: "منذ ساعتين",  timeEn: "2 hours ago", icon: CheckCircle },
  { id: 3, action: { ar: "عميل جديد — شركة النهضة", en: "New client — Al-Nahda Co" }, by: "أ. تركي", timeAr: "منذ ٤ ساعات", timeEn: "4 hours ago", icon: Buildings },
];

const CARD = (isDark: boolean) =>
  `rounded-2xl border p-5 ${isDark ? "bg-zinc-900/60 border-white/[0.06]" : "bg-white border-slate-100 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]"}`;

// ─── Locked overlay ───────────────────────────────────────────────────────────
function LockedCard({ isDark, labelAr, labelEn, isAr }: { isDark: boolean; labelAr: string; labelEn: string; isAr: boolean }) {
  return (
    <div className={`${CARD(isDark)} flex flex-col items-center justify-center gap-2 min-h-[120px] opacity-50`}>
      <Lock size={18} className={isDark ? "text-zinc-600" : "text-slate-300"} weight="fill" />
      <p className={`text-[11px] font-medium ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
        {isAr ? labelAr : labelEn}
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FirmDashboardPage() {
  const { name } = useUser();
  const { isDark, lang } = useTheme();
  const role = useFirmRole();
  const isAr = lang === "ar";

  const isPartner = role.role === "partner";
  const isSenior = role.role === "senior_lawyer";
  const isLimitedView = !role.can.viewAllCases;
  const [workflowItems, setWorkflowItems] = useState<FirmUrgentItem[]>([]);

  // Which items to show
  useEffect(() => {
    const syncItems = () => {
      const incoming = readWorkflowRequestsByReceiver("firm")
        .filter(request => request.type === "service" && request.status !== "cancelled" && request.status !== "completed")
        .map(workflowToFirmItem);
      setWorkflowItems(incoming);
    };

    syncItems();
    window.addEventListener("nzamy-workflow-updated", syncItems);
    return () => window.removeEventListener("nzamy-workflow-updated", syncItems);
  }, []);

  const urgentItems = isLimitedView ? MY_ITEMS : [...workflowItems, ...URGENT_ITEMS];

  return (
    <div className="max-w-[1400px] mx-auto space-y-6" dir={isAr ? "rtl" : "ltr"}>

      {/* ── Onboarding Welcome (first-visit only) ── */}
      <OnboardingBanner role="firm" name={name} isDark={isDark} />
      <FirmProfileReadinessPanel />

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}
          >
            {isAr ? `قمرة القيادة — ${name}` : `Command Center — ${name}`}
          </motion.h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {isAr ? "نظرة شاملة على أداء المكتب — تحديث فوري" : "Comprehensive firm performance overview — live"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/ai/secretary"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0B3D2E]/90 transition-colors"
          >
            <Robot size={16} weight="duotone" /> {isAr ? "السكرتير الذكي" : "AI Secretary"}
          </Link>
          {role.can.addNewCase && (
            <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <Plus size={15} weight="bold" /> {isAr ? "قضية جديدة" : "New Case"}
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((stat, i) => {
          const Icon = stat.icon;
          if (stat.requiresFinancials && !role.can.viewFinancials) {
            return (
              <LockedCard key={i} isDark={isDark} isAr={isAr}
                labelAr="الماليات — متاح للمدير فقط"
                labelEn="Financials — Manager only"
              />
            );
          }
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className={CARD(isDark)}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.bg}`}>
                <Icon size={20} weight="duotone" className={stat.color} />
              </div>
              <p className={`text-[12px] mb-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {isAr ? stat.labelAr : stat.labelEn}
              </p>
              <p className={`text-xl font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{stat.value}</p>
              <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {isAr ? stat.trendAr : stat.trendEn}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Urgent items — 2/3 */}
        <div className={`lg:col-span-2 ${CARD(isDark)}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <WarningCircle size={16} className="text-amber-500" weight="fill" />
              {isLimitedView
                ? (isAr ? "مهامي العاجلة" : "My Urgent Tasks")
                : (isAr ? "العناصر العاجلة" : "Urgent Items")}
            </h2>
            {!isLimitedView && (
              <Link href="/dashboard/firm/cases" className="text-xs text-royal hover:underline">
                {isAr ? "كل القضايا" : "All Cases"}
              </Link>
            )}
          </div>
          <div className="space-y-3">
            {urgentItems.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: isAr ? -8 : 8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.06 }}
                className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]" : "border-slate-100 bg-slate-50/60 hover:bg-slate-100/60"} transition-colors cursor-pointer`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.type === "deadline" ? "bg-red-400 animate-pulse" : item.type === "hearing" ? "bg-amber-400" : "bg-blue-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-medium truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                    {isAr ? item.titleAr : item.titleEn}
                  </p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    {isAr ? item.deadlineAr : item.deadlineEn} · {item.assignee}
                  </p>
                </div>
                <ArrowUpRight size={15} className={isDark ? "text-zinc-600" : "text-slate-300"} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Recent activity — 1/3 */}
        <div className={CARD(isDark)}>
          <div className="flex items-center gap-2 mb-4">
            <ClockCounterClockwise size={16} className="text-royal" weight="duotone" />
            <h2 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              {isAr ? "آخر النشاطات" : "Recent Activity"}
            </h2>
          </div>
          <div className="space-y-3">
            {RECENT_ACTIVITY.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.07 }}
                  className="flex items-start gap-2.5"
                >
                  <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${isDark ? "bg-white/[0.05] text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
                    <Icon size={14} weight="duotone" />
                  </span>
                  <div>
                    <p className={`text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                      {isAr ? item.action.ar : item.action.en}
                    </p>
                    <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      {item.by} · {isAr ? item.timeAr : item.timeEn}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Analytics CTA (manager/senior only) ── */}
      {role.can.viewAnalytics ? (
        <div className={`${CARD(isDark)} flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-royal/8">
              <ChartBar size={18} weight="duotone" className="text-royal" />
            </div>
            <div>
              <p className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                {isAr ? "تقرير الأداء الشهري" : "Monthly Performance Report"}
              </p>
              <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {isAr ? "معدل إغلاق القضايا، الإيرادات، الأداء الفردي" : "Case close rate, revenue, individual KPIs"}
              </p>
            </div>
          </div>
          <Link href="/dashboard/firm/analytics"
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-royal text-white text-xs font-bold hover:bg-royal-light transition-colors"
          >
            {isAr ? "عرض التقرير" : "View Report"}
            <ArrowLeft size={13} className={isAr ? "" : "rotate-180"} />
          </Link>
        </div>
      ) : (
        <div className={`${CARD(isDark)} flex items-center gap-3 opacity-50`}>
          <Lock size={16} className={isDark ? "text-zinc-600" : "text-slate-300"} weight="fill" />
          <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
            {isAr ? "التقارير والتحليلات — متاحة للمحامي الأول والمدير" : "Reports & Analytics — available to Senior Lawyer & Manager"}
          </p>
        </div>
      )}

      {/* ── AI Quick Actions ── */}
      <div className={CARD(isDark)}>
        <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          {isAr ? "الوصول السريع لأدوات AI" : "AI Quick Access"}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/ai/draft",            labelAr: "صياغة مذكرة",     labelEn: "Draft Memo",      icon: FileText,   color: "text-royal"         },
            { href: "/ai/wargaming",        labelAr: "محاكي الخصم",     labelEn: "Case Simulator",  icon: Gavel,       color: "text-purple-500"    },
            { href: "/ai/report-generator", labelAr: "توليد تقرير",     labelEn: "Generate Report", icon: ChartLine,   color: "text-emerald-500"   },
            { href: "/ai/secretary",        labelAr: "السكرتير الذكي",  labelEn: "AI Secretary",    icon: Robot,       color: "text-[#C8A762]"     },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05]" : "border-slate-100 text-slate-600 hover:bg-slate-50 hover:border-slate-200"}`}
              >
                <Icon size={17} weight="duotone" className={action.color} />
                {isAr ? action.labelAr : action.labelEn}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
