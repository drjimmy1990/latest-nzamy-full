"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarCheck, Clock, MapPin, User, Buildings,
  VideoCamera, Scales, CheckCircle, Plus,
  CaretLeft, CaretRight, Warning,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock hearings ────────────────────────────────────────────────────────────
const MOCK_HEARINGS = [
  { id: "ARB-2025-001", subject: "نزاع عقد توريد مواد بناء", date: "٢٠٢٥-٠٥-٠٦", time: "١٠:٠٠ ص", mode: "remote", location: "Zoom", parties: ["شركة الإنشاءات المتحدة", "مورد الخرسانة الدولي"], stage: "جلسة أولى", status: "upcoming" },
  { id: "ARB-2025-002", subject: "نزاع عقد خدمات IT", date: "٢٠٢٥-٠٥-١٠", time: "٠٢:٠٠ م", mode: "inperson", location: "مركز التحكيم التجاري الخليجي — الرياض", parties: ["بنك الأمل", "شركة تك سوليوشنز"], stage: "تبادل مذكرات", status: "upcoming" },
  { id: "ARB-2025-004", subject: "نزاع شراكة تجارية", date: "٢٠٢٥-٠٥-٢٠", time: "١١:٣٠ ص", mode: "remote", location: "Teams", parties: ["مجموعة الرواد", "مجموعة الأمل للتجارة"], stage: "كتابة دفاع", status: "upcoming" },
  { id: "ARB-2024-018", subject: "نزاع عمالي جماعي", date: "٢٠٢٥-٠٣-١٨", time: "٠٩:٠٠ ص", mode: "inperson", location: "مكتب التحكيم المركزي", parties: ["مصنع السلام الكيماوي", "نقابة العمال"], stage: "مكتمل", status: "done" },
  { id: "ARB-2025-003", subject: "نزاع عقد إيجار تجاري", date: "٢٠٢٥-٠٤-٢٨", time: "٠١:٠٠ م", mode: "remote", location: "Zoom", parties: ["مجموعة الخليج العقارية", "سلسلة متاجر الأفق"], stage: "إصدار الحكم", status: "done" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ArbitrationHearingsPage() {
  const { lang } = useTheme();
  const isAr = lang === "ar";
  const [view, setView] = useState<"upcoming" | "done">("upcoming");

  const shown = MOCK_HEARINGS.filter(h => h.status === view);

  const kpis = [
    { icon: CalendarCheck, label: isAr ? "جلسات قادمة" : "Upcoming", value: MOCK_HEARINGS.filter(h => h.status === "upcoming").length, color: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
    { icon: CheckCircle,   label: isAr ? "جلسات مكتملة" : "Completed", value: MOCK_HEARINGS.filter(h => h.status === "done").length,     color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
    { icon: VideoCamera,   label: isAr ? "عن بُعد" : "Remote",        value: MOCK_HEARINGS.filter(h => h.mode === "remote").length,      color: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400" },
    { icon: MapPin,        label: isAr ? "حضوري" : "In-person",       value: MOCK_HEARINGS.filter(h => h.mode === "inperson").length,   color: "bg-royal/8 text-royal dark:bg-royal/15 dark:text-emerald-400" },
  ];

  return (
    <div className="space-y-6 p-6 lg:p-8" dir={isAr ? "rtl" : "ltr"}>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink dark:text-gray-100">
            {isAr ? "جلسات التحكيم" : "Arbitration Hearings"}
          </h1>
          <p className="text-sm text-ink-muted dark:text-gray-400">
            {isAr ? "إدارة مواعيد جلسات التحكيم وتفاصيلها" : "Schedule and manage your arbitration hearing sessions"}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 rounded-xl bg-royal px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)]"
        >
          <Plus size={16} weight="bold" />
          {isAr ? "جلسة جديدة" : "New Hearing"}
        </motion.button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className="rounded-2xl border border-slate-200/60 dark:border-dark-border bg-white dark:bg-dark-card p-4 flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${k.color}`}>
                <Icon size={20} weight="duotone" />
              </div>
              <div>
                <div className="text-xl font-bold text-ink dark:text-gray-100">{k.value}</div>
                <div className="text-xs text-ink-muted dark:text-gray-400">{k.label}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Tab toggle */}
      <div className="flex rounded-xl border border-slate-200 dark:border-dark-border overflow-hidden w-fit">
        {(["upcoming", "done"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-5 py-2 text-sm font-medium transition-colors ${view === v ? "bg-royal text-white" : "text-ink-muted dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-dark-bg/40"}`}>
            {v === "upcoming" ? (isAr ? "القادمة" : "Upcoming") : (isAr ? "المكتملة" : "Completed")}
          </button>
        ))}
      </div>

      {/* Hearing cards */}
      <div className="space-y-4">
        {shown.length === 0 && (
          <div className="flex flex-col items-center py-16 text-ink-faint dark:text-gray-500">
            <Warning size={36} className="mb-2" />
            <span className="text-sm">{isAr ? "لا توجد جلسات" : "No hearings found"}</span>
          </div>
        )}
        {shown.map((h, i) => {
          const isRemote = h.mode === "remote";
          return (
            <motion.div
              key={h.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="rounded-2xl border border-slate-200/60 dark:border-dark-border bg-white dark:bg-dark-card p-5 flex flex-col gap-4 sm:flex-row sm:items-center"
            >
              {/* Date column */}
              <div className={`flex shrink-0 flex-col items-center justify-center rounded-2xl p-3 w-20 text-center ${h.status === "done" ? "bg-slate-50 dark:bg-dark-bg/40" : "bg-amber-50 dark:bg-amber-500/10"}`}>
                <CalendarCheck size={18} className={h.status === "done" ? "text-ink-faint dark:text-gray-500" : "text-amber-600 dark:text-amber-400"} weight="duotone" />
                <span className="mt-1 text-xs font-bold text-ink dark:text-gray-200 leading-tight">{h.date}</span>
                <span className="text-[10px] text-ink-muted dark:text-gray-400">{h.time}</span>
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-xs font-mono text-ink-faint dark:text-gray-500">{h.id}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isRemote ? "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"}`}>
                    {isRemote ? (isAr ? "عن بُعد" : "Remote") : (isAr ? "حضوري" : "In-person")}
                  </span>
                  <span className="rounded-full bg-royal/8 dark:bg-royal/15 px-2 py-0.5 text-[10px] font-medium text-royal dark:text-emerald-400">
                    {h.stage}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-ink dark:text-gray-100 truncate">{h.subject}</h3>
                <div className="mt-1.5 flex flex-wrap gap-3">
                  <span className="flex items-center gap-1 text-xs text-ink-muted dark:text-gray-400">
                    <Buildings size={11} /> {h.parties[0]}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-ink-faint dark:text-gray-500">
                    <User size={11} /> {h.parties[1]}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-ink-faint dark:text-gray-500">
                    {isRemote ? <VideoCamera size={11} /> : <MapPin size={11} />} {h.location}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 gap-2">
                {h.status === "upcoming" && isRemote && (
                  <button
                    onClick={() => window.open(h.location.startsWith("http") ? h.location : "#", "_blank")}
                    className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition-colors">
                    <VideoCamera size={13} />
                    {isAr ? "انضم" : "Join"}
                  </button>
                )}
                <button className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-dark-border px-3 py-2 text-xs font-medium text-ink-muted dark:text-gray-400 hover:border-royal/30 hover:text-royal dark:hover:text-gold transition-colors">
                  <Scales size={13} />
                  {isAr ? "القضية" : "Case"}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Monthly nav hint */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/60 dark:border-dark-border bg-white dark:bg-dark-card px-5 py-3">
        <button className="flex items-center gap-1 text-sm text-ink-muted dark:text-gray-400 hover:text-royal dark:hover:text-gold transition-colors">
          <CaretRight size={14} className={isAr ? "" : "rotate-180"} />
          {isAr ? "الشهر السابق" : "Prev Month"}
        </button>
        <span className="text-sm font-semibold text-ink dark:text-gray-200">{isAr ? "مايو ٢٠٢٥" : "May 2025"}</span>
        <button className="flex items-center gap-1 text-sm text-ink-muted dark:text-gray-400 hover:text-royal dark:hover:text-gold transition-colors">
          {isAr ? "الشهر القادم" : "Next Month"}
          <CaretLeft size={14} className={isAr ? "" : "rotate-180"} />
        </button>
      </div>
    </div>
  );
}
