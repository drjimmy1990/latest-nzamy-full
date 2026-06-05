"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Buildings, Clock, ArrowLeft, CheckCircle, CalendarCheck,
  Warning, ArrowSquareOut, ChartBar, Scales, Plus,
  ShieldCheck, X, ClipboardText, UserCircleGear,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock Data ────────────────────────────────────────────────────────────────

type SecondmentStatus = "active" | "paused" | "ending_soon";

interface SecondmentContract {
  id: string;
  companyName: string;
  companyType: string;
  role: string;
  status: SecondmentStatus;
  hoursUsed: number;
  hoursLimit: number;
  startDate: string;
  endDate: string;
  tasksActive: number;
  tasksDone: number;
  dashboardPath: string;
  gradient: string;
}

const CONTRACTS: SecondmentContract[] = [
  {
    id: "sec-1",
    companyName: "الزهراني للمقاولات",
    companyType: "شركة تجارية — قطاع البناء",
    role: "مستشار قانوني منتدب",
    status: "active",
    hoursUsed: 28,
    hoursLimit: 40,
    startDate: "مارس ٢٠٢٦",
    endDate: "سبتمبر ٢٠٢٦",
    tasksActive: 4,
    tasksDone: 12,
    dashboardPath: "/dashboard/business",
    gradient: "from-[#0B3D2E] to-[#155e41]",
  },
  {
    id: "sec-2",
    companyName: "مجموعة الريادة",
    companyType: "شركة تجارية — الخدمات اللوجستية",
    role: "مراجع عقود قانونية",
    status: "ending_soon",
    hoursUsed: 36,
    hoursLimit: 40,
    startDate: "يناير ٢٠٢٦",
    endDate: "يونيو ٢٠٢٦",
    tasksActive: 1,
    tasksDone: 21,
    dashboardPath: "/dashboard/business",
    gradient: "from-amber-700 to-amber-500",
  },
];

type LogEntry = { id: string; contractId: string; date: string; hours: number; desc: string; type: "task" | "meeting" | "review" };

const LOG_ENTRIES: LogEntry[] = [
  { id: "l1", contractId: "sec-1", date: "اليوم",      hours: 2,   desc: "مراجعة عقد التوريد مع شركة الأفق",    type: "review"  },
  { id: "l2", contractId: "sec-1", date: "أمس",        hours: 1.5, desc: "اجتماع مع إدارة الموارد البشرية",      type: "meeting" },
  { id: "l3", contractId: "sec-2", date: "أمس",        hours: 3,   desc: "إعداد مذكرة قانونية — نزاع تجاري",    type: "task"    },
  { id: "l4", contractId: "sec-1", date: "الثلاثاء",   hours: 2,   desc: "مراجعة NDA مع المورد الجديد",          type: "review"  },
  { id: "l5", contractId: "sec-2", date: "الاثنين",    hours: 1,   desc: "مكالمة استشارة طارئة — الإدارة العليا", type: "meeting" },
];

const STATUS_CONFIG: Record<SecondmentStatus, { label: string; dot: string; badge: string }> = {
  active:      { label: "نشط",          dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  paused:      { label: "موقوف مؤقتاً", dot: "bg-amber-400",   badge: "bg-amber-500/10 text-amber-400 border-amber-500/20"     },
  ending_soon: { label: "ينتهي قريباً", dot: "bg-red-500 animate-pulse", badge: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const LOG_TYPE_CONFIG = {
  task:    { label: "مهمة",    icon: ClipboardText,  color: "text-royal",      bg: "bg-royal/10"      },
  meeting: { label: "اجتماع",  icon: UserCircleGear, color: "text-amber-500",  bg: "bg-amber-500/10"  },
  review:  { label: "مراجعة",  icon: ShieldCheck,    color: "text-emerald-500", bg: "bg-emerald-500/10" },
};

// ─── Log Entry Row ────────────────────────────────────────────────────────────

function LogRow({ entry, isDark }: { entry: LogEntry; isDark: boolean }) {
  const cfg = LOG_TYPE_CONFIG[entry.type];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-4 py-3 border-b last:border-0 ${isDark ? "border-white/[0.04]" : "border-zinc-50"}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
        <Icon size={15} weight="duotone" className={cfg.color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-medium truncate ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{entry.desc}</p>
        <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{entry.date} · {cfg.label}</span>
      </div>
      <span className={`text-[12px] font-bold font-mono flex-shrink-0 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
        {entry.hours}س
      </span>
    </div>
  );
}

// ─── Contract Card ────────────────────────────────────────────────────────────

function ContractCard({
  contract, isDark, isSelected, onSelect,
}: {
  contract: SecondmentContract;
  isDark: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const pct = Math.min((contract.hoursUsed / contract.hoursLimit) * 100, 100);
  const st = STATUS_CONFIG[contract.status];
  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 18 }}
      onClick={onSelect}
      className={`${card} p-5 cursor-pointer transition-all shadow-sm hover:shadow-md hover:scale-[1.01] ${
        isSelected
          ? isDark ? "ring-2 ring-[#C8A762]/40" : "ring-2 ring-[#0B3D2E]/20"
          : ""
      }`}
    >
      {/* Top gradient stripe */}
      <div className={`h-1 w-full -mt-5 -mx-5 mb-4 rounded-t-2xl bg-gradient-to-r ${contract.gradient}`} style={{ width: "calc(100% + 2.5rem)" }} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Buildings size={16} className={isDark ? "text-zinc-400" : "text-zinc-600"} />
            <h3 className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>{contract.companyName}</h3>
          </div>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{contract.companyType}</p>
          <p className={`text-[11px] font-medium mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{contract.role}</p>
        </div>
        <span className={`flex-shrink-0 flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${st.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
          {st.label}
        </span>
      </div>

      {/* Hours bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className={isDark ? "text-zinc-500" : "text-zinc-400"}>الساعات المستخدمة هذا الشهر</span>
          <span className={`font-bold font-mono ${pct >= 90 ? "text-red-500" : pct >= 70 ? "text-amber-500" : isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            {contract.hoursUsed} / {contract.hoursLimit}س
          </span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className={`h-full rounded-full bg-gradient-to-r ${contract.gradient}`}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className={`flex items-center gap-4 text-[11px] pt-3 border-t ${isDark ? "border-white/[0.04]" : "border-zinc-100"}`}>
        <div>
          <span className={isDark ? "text-zinc-600" : "text-zinc-400"}>مهام نشطة</span>
          <p className={`font-bold font-mono ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{contract.tasksActive}</p>
        </div>
        <div>
          <span className={isDark ? "text-zinc-600" : "text-zinc-400"}>مهام منجزة</span>
          <p className="font-bold font-mono text-emerald-500">{contract.tasksDone}</p>
        </div>
        <div className="flex-1 text-end">
          <span className={isDark ? "text-zinc-600" : "text-zinc-400"}>نهاية العقد</span>
          <p className={`font-bold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{contract.endDate}</p>
        </div>
      </div>

      {/* CTA */}
      <Link
        href={contract.dashboardPath}
        onClick={e => e.stopPropagation()}
        className={`mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[12px] font-bold border transition-all hover:scale-[1.01] ${
          isDark
            ? "border-[#C8A762]/20 text-[#C8A762] hover:bg-[#C8A762]/5"
            : "border-[#0B3D2E]/20 text-[#0B3D2E] hover:bg-[#0B3D2E]/5"
        }`}
      >
        <ArrowSquareOut size={14} />
        فتح داشبورد الشركة
      </Link>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SecondmentPage() {
  const { isDark } = useTheme();
  const [selectedId, setSelectedId] = useState<string>(CONTRACTS[0].id);
  const [logFilter, setLogFilter] = useState<"all" | string>("all");

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  const fadeUp = {
    hidden: { opacity: 0, y: 14 },
    show: (i: number) => ({ opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 20, delay: i * 0.07 } }),
  };

  const selected = CONTRACTS.find(c => c.id === selectedId) ?? CONTRACTS[0];
  const filteredLog = LOG_ENTRIES.filter(e => logFilter === "all" || e.contractId === logFilter);
  const totalHoursThisMonth = LOG_ENTRIES.reduce((a, e) => a + e.hours, 0);

  return (
    <div className={`p-5 md:p-8 space-y-6 max-w-[1400px] mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* بيانات تجريبية Banner */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl p-4 border flex items-center gap-3 mb-5 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
          <Warning size={18} weight="fill" className="text-amber-500" />
        </div>
        <div>
          <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>بيانات تجريبية</p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/60"}`}>نظام الانتداب القانوني — قريباً</p>
        </div>
      </motion.div>


      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
        <div className="flex items-center gap-1 mb-2">
          <Link href="/dashboard/lawyer" className={`text-[13px] hover:underline ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            لوحة التحكم
          </Link>
          <ArrowLeft size={12} className={isDark ? "text-zinc-700" : "text-zinc-300"} />
          <span className={`text-[13px] ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>الانتداب القانوني</span>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
              عقود الانتداب
            </h1>
            <p className={`text-sm mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              إدارة انتداباتك والتبديل بين داشبوردات الشركات
            </p>
          </div>
          <Link
            href="/dashboard/lawyer"
            className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-bold transition-all hover:scale-[1.02] bg-[#0B3D2E] text-[#C8A762] border-[#0B3D2E]"
          >
            <ArrowSquareOut size={15} />
            الرجوع لداشبوردي
          </Link>
        </div>
      </motion.div>

      {/* Summary KPIs */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        {[
          { label: "عقود نشطة",         value: CONTRACTS.filter(c => c.status === "active").length.toString(),       icon: ShieldCheck,    color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "إجمالي الساعات/شهر", value: `${totalHoursThisMonth}س`,                                            icon: Clock,          color: "text-royal",       bg: "bg-royal/10"       },
          { label: "مهام قيد التنفيذ",   value: CONTRACTS.reduce((a, c) => a + c.tasksActive, 0).toString(),          icon: ClipboardText,  color: "text-amber-500",   bg: "bg-amber-500/10"   },
          { label: "تنتهي قريباً",       value: CONTRACTS.filter(c => c.status === "ending_soon").length.toString(),  icon: Warning,        color: "text-red-500",     bg: "bg-red-500/10"     },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className={`${card} flex items-center gap-3 p-4 shadow-sm`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}`}>
                <Icon size={18} weight="duotone" className={s.color} />
              </div>
              <div>
                <p className={`text-xl font-bold font-mono ${isDark ? "text-white" : "text-zinc-800"}`}>{s.value}</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{s.label}</p>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Main 2-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Contract cards */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className={`text-[13px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            عقودي الحالية
          </h2>
          {CONTRACTS.map((c, i) => (
            <motion.div key={c.id} variants={fadeUp} initial="hidden" animate="show" custom={i + 2}>
              <ContractCard
                contract={c}
                isDark={isDark}
                isSelected={selectedId === c.id}
                onSelect={() => setSelectedId(c.id)}
              />
            </motion.div>
          ))}

          {/* Empty-state CTA */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={CONTRACTS.length + 2}
            className={`${card} p-5 flex flex-col items-center gap-3 border-dashed shadow-none opacity-60 hover:opacity-90 transition-opacity`}
          >
            <Plus size={22} className={isDark ? "text-zinc-600" : "text-zinc-300"} />
            <p className={`text-[12px] font-bold ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              إضافة عقد انتداب جديد
            </p>
            <p className={`text-[11px] text-center ${isDark ? "text-zinc-700" : "text-zinc-300"}`}>
              تُرسل دعوة من الشركة عبر المنصة أو تنشئ طلباً جديداً
            </p>
          </motion.div>
        </div>

        {/* Hour Log Panel */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2} className={`${card} p-5 flex flex-col shadow-sm`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-[14px] font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
              <ChartBar size={16} className="text-[#C8A762]" weight="duotone" />
              سجل الساعات
            </h2>
            {/* Filter */}
            <select
              value={logFilter}
              onChange={e => setLogFilter(e.target.value)}
              className={`text-[11px] rounded-lg border px-2 py-1 outline-none ${isDark ? "bg-zinc-800 border-zinc-700 text-zinc-300" : "bg-white border-zinc-200 text-zinc-600"}`}
            >
              <option value="all">الكل</option>
              {CONTRACTS.map(c => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </select>
          </div>

          {/* Log list */}
          <div className="flex-1 divide-y-0">
            <AnimatePresence mode="popLayout">
              {filteredLog.map(entry => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  <LogRow entry={entry} isDark={isDark} />
                </motion.div>
              ))}
            </AnimatePresence>
            {filteredLog.length === 0 && (
              <div className={`flex flex-col items-center py-8 gap-2 ${isDark ? "text-zinc-700" : "text-zinc-300"}`}>
                <ClipboardText size={28} weight="duotone" />
                <p className="text-[12px] font-medium">لا توجد إدخالات</p>
              </div>
            )}
          </div>

          {/* Total */}
          <div className={`mt-4 pt-4 border-t ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
            <div className="flex items-center justify-between text-[12px]">
              <span className={isDark ? "text-zinc-500" : "text-zinc-400"}>إجمالي الساعات هذا الشهر</span>
              <span className="font-bold font-mono text-[#C8A762]">
                {filteredLog.reduce((a, e) => a + e.hours, 0)}س
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Selected contract detail */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}
        className={`${card} p-5 shadow-sm`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-[14px] font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
            <Scales size={16} className="text-royal" weight="duotone" />
            تفاصيل الانتداب — {selected.companyName}
          </h2>
          <Link href={selected.dashboardPath}
            className={`flex items-center gap-1.5 text-[12px] font-bold text-[#C8A762] hover:underline`}
          >
            <ArrowSquareOut size={13} /> فتح داشبورد الشركة
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "تاريخ البداية",  value: selected.startDate  },
            { label: "تاريخ الانتهاء", value: selected.endDate    },
            { label: "الدور",           value: selected.role       },
            { label: "حالة العقد",      value: STATUS_CONFIG[selected.status].label },
          ].map((item) => (
            <div key={item.label} className={`p-3 rounded-xl ${isDark ? "bg-white/[0.03] border border-white/[0.04]" : "bg-zinc-50 border border-zinc-100"}`}>
              <p className={`text-[10px] mb-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{item.label}</p>
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Warning if ending soon */}
        {selected.status === "ending_soon" && (
          <div className={`mt-4 flex items-center gap-3 p-3 rounded-xl border ${isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
            <Warning size={16} className="text-red-500 flex-shrink-0" />
            <p className={`text-[12px] ${isDark ? "text-red-400" : "text-red-600"}`}>
              هذا العقد ينتهي قريباً — تواصل مع الشركة لتجديده أو إنهائه بشكل رسمي.
            </p>
          </div>
        )}
      </motion.div>

    </div>
  );
}
