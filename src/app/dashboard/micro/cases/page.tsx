"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Gavel, Clock, CheckCircle, Warning, ArrowLeft,
  MagnifyingGlass, UserCircle, SealCheck, FunnelSimple,
  FileText, CalendarBlank, Plus,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const CASES = [
  {
    id: "C-2025-001",
    title: "نزاع تجاري — عقد توريد لم يُنفَّذ",
    type: "تجاري",
    status: "active" as const,
    statusLabel: "نشطة",
    statusColor: "blue",
    lawyer: "خالد الحربي",
    lawyerVerified: true,
    nextSession: "١٥ مايو ٢٠٢٦",
    openedDate: "٢ أبريل ٢٠٢٦",
    progress: 45,
    urgent: false,
  },
  {
    id: "C-2025-002",
    title: "مطالبة بتعويض عمالي — فصل تعسفي",
    type: "عمالي",
    status: "session" as const,
    statusLabel: "جلسة قادمة",
    statusColor: "amber",
    lawyer: "نورة الزهراني",
    lawyerVerified: true,
    nextSession: "٢٠ أبريل ٢٠٢٦",
    openedDate: "١٥ مارس ٢٠٢٦",
    progress: 70,
    urgent: true,
  },
  {
    id: "C-2024-009",
    title: "تسوية نزاع إيجار — محل تجاري",
    type: "عقاري",
    status: "closed" as const,
    statusLabel: "مغلقة",
    statusColor: "green",
    lawyer: "علي السعدي",
    lawyerVerified: false,
    nextSession: null,
    openedDate: "١ يناير ٢٠٢٤",
    progress: 100,
    urgent: false,
  },
];

type FilterKey = "all" | "active" | "session" | "closed";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "active", label: "نشطة" },
  { key: "session", label: "جلسة قادمة" },
  { key: "closed", label: "مغلقة" },
];

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  blue:  { bg: "bg-blue-50 dark:bg-blue-900/20",    text: "text-blue-600 dark:text-blue-400",    border: "border-blue-200 dark:border-blue-700/30" },
  amber: { bg: "bg-amber-50 dark:bg-amber-900/20",   text: "text-amber-600 dark:text-amber-400",   border: "border-amber-200 dark:border-amber-700/30" },
  green: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-700/30" },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35 } }),
};

export default function MicroCasesPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  const filtered = CASES.filter(c =>
    (filter === "all" || c.status === filter) &&
    (c.title.includes(search) || c.id.includes(search))
  );

  return (
    <div className={`p-5 md:p-8 max-w-[900px] mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className={`text-[22px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>قضاياي</h1>
          <p className={`text-[13px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            متابعة جميع قضاياك القانونية
          </p>
        </div>
        <Link href="/dashboard/micro/find-lawyer">
          <motion.div
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 bg-[#0B3D2E] text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow-md cursor-pointer"
          >
            <Plus size={16} weight="bold" /> قضية جديدة
          </motion.div>
        </Link>
      </motion.div>

      {/* Search */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1} className="space-y-3">
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-200"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث برقم أو عنوان القضية..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-400"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                filter === f.key
                  ? "bg-[#0B3D2E] text-white"
                  : isDark ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Cases */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className={`${card} p-12 text-center`}
          >
            <Gavel size={36} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
            <p className={`font-bold text-[15px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد قضايا</p>
          </motion.div>
        ) : (
          <motion.div key="list" className="space-y-3">
            {filtered.map((c, i) => {
              const sc = STATUS_STYLE[c.statusColor];
              const barColor = c.progress === 100 ? "bg-emerald-500" : c.progress >= 70 ? "bg-amber-500" : "bg-royal";
              return (
                <motion.div key={c.id} variants={fadeUp} initial="hidden" animate="show" custom={i}
                  className={`${card} p-5`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Badges */}
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {c.urgent && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold bg-red-50 text-red-500 border border-red-200 px-1.5 py-0.5 rounded-full dark:bg-red-900/20 dark:border-red-700/30 animate-pulse">
                            <Warning size={9} weight="fill" /> عاجل
                          </span>
                        )}
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
                          {c.statusLabel}
                        </span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                          {c.type}
                        </span>
                      </div>
                      <p className={`text-[15px] font-bold leading-snug mb-1 ${isDark ? "text-white" : "text-zinc-800"}`}>{c.title}</p>
                      <p className={`text-[10px] font-mono ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{c.id}</p>

                      {/* Progress */}
                      <div className="mt-3 mb-2">
                        <div className={`flex justify-between text-[10px] mb-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                          <span>مسار القضية</span>
                          <span className="font-mono font-bold">{c.progress}%</span>
                        </div>
                        <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
                          <motion.div
                            className={`h-full rounded-full ${barColor}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${c.progress}%` }}
                            transition={{ duration: 0.9, ease: "easeOut", delay: 0.3 }}
                          />
                        </div>
                      </div>

                      {/* Meta */}
                      <div className={`flex items-center gap-3 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                        <span className="flex items-center gap-1">
                          <UserCircle size={11} />
                          {c.lawyer}
                          {c.lawyerVerified && <SealCheck size={10} className="text-[#C8A762]" />}
                        </span>
                        {c.nextSession ? (
                          <span className="flex items-center gap-1">
                            <CalendarBlank size={11} className="text-amber-500" />
                            {c.nextSession}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <CheckCircle size={11} className="text-emerald-500" />
                            مُغلقة
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {c.openedDate}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <Link href={`/dashboard/micro/cases/${c.id}`}>
                        <motion.div whileHover={{ scale: 1.04 }}
                          className="flex items-center gap-1 text-[11px] font-bold text-royal border border-royal/20 bg-royal/5 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-royal/10 transition-colors"
                        >
                          عرض التفاصيل <ArrowLeft size={10} />
                        </motion.div>
                      </Link>
                      <Link href={`/dashboard/micro/requests?case=${c.id}`}>
                        <motion.div whileHover={{ scale: 1.04 }}
                          className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                            isDark ? "bg-zinc-800 text-zinc-400 hover:text-zinc-200" : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
                          }`}
                        >
                          <FileText size={10} /> المستندات
                        </motion.div>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
