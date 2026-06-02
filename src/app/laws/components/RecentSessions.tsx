"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import {
  ClockCounterClockwise, CaretDown, CaretUp, BookOpen,
  Trash, ArrowRight, Eye, Clock, CalendarBlank,
} from "@phosphor-icons/react";

// ─── Types ──────────────────────────────────────────────────────────────────────
export interface SessionEntry {
  id: string;
  lawSlug: string;
  lawTitle: string;
  lawTitleEn: string;
  /** Last article or section viewed */
  lastSection?: string;
  lastSectionEn?: string;
  /** reading progress 0-100 */
  progress: number;
  /** ISO timestamp */
  timestamp: string;
  /** category badge */
  catId: string;
  catLabel: string;
  catLabelEn: string;
}

type TimeGroup = "today" | "yesterday" | "thisWeek" | "thisMonth" | "older";

const GROUP_LABELS: Record<TimeGroup, { ar: string; en: string }> = {
  today:     { ar: "اليوم",          en: "Today" },
  yesterday: { ar: "أمس",           en: "Yesterday" },
  thisWeek:  { ar: "هذا الأسبوع",   en: "This Week" },
  thisMonth: { ar: "هذا الشهر",     en: "This Month" },
  older:     { ar: "أقدم",          en: "Older" },
};

const GROUP_ORDER: TimeGroup[] = ["today", "yesterday", "thisWeek", "thisMonth", "older"];

// ─── Demo Data ──────────────────────────────────────────────────────────────────
function generateDemoSessions(): SessionEntry[] {
  const now = new Date();

  const mkDate = (daysAgo: number, hours: number = 14) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hours, Math.floor(Math.random() * 60), 0, 0);
    return d.toISOString();
  };

  return [
    {
      id: "s1",
      lawSlug: "companies-law",
      lawTitle: "نظام الشركات",
      lawTitleEn: "Companies Law",
      lastSection: "المادة 54 — مسؤولية المدير",
      lastSectionEn: "Article 54 — Director Liability",
      progress: 72,
      timestamp: mkDate(0, 16),
      catId: "SA-04",
      catLabel: "التجاري والشركات",
      catLabelEn: "Commercial & Companies",
    },
    {
      id: "s2",
      lawSlug: "civil-procedure",
      lawTitle: "نظام المرافعات الشرعية",
      lawTitleEn: "Civil Procedure Law",
      lastSection: "المادة 76 — الدفع بعدم الاختصاص",
      lastSectionEn: "Article 76 — Jurisdiction Plea",
      progress: 38,
      timestamp: mkDate(0, 10),
      catId: "SA-00",
      catLabel: "الإجرائي والقضائي",
      catLabelEn: "Procedural",
    },
    {
      id: "s3",
      lawSlug: "execution-law",
      lawTitle: "نظام التنفيذ",
      lawTitleEn: "Execution Law",
      lastSection: "المادة 34 — الحجز التنفيذي",
      lastSectionEn: "Article 34 — Execution Seizure",
      progress: 55,
      timestamp: mkDate(1, 20),
      catId: "SA-00",
      catLabel: "الإجرائي والقضائي",
      catLabelEn: "Procedural",
    },
    {
      id: "s4",
      lawSlug: "evidence-law",
      lawTitle: "نظام الإثبات",
      lawTitleEn: "Evidence Law",
      lastSection: "المادة 22 — اليمين الحاسمة",
      lastSectionEn: "Article 22 — Decisive Oath",
      progress: 90,
      timestamp: mkDate(1, 15),
      catId: "SA-00",
      catLabel: "الإجرائي والقضائي",
      catLabelEn: "Procedural",
    },
    {
      id: "s5",
      lawSlug: "labor-law",
      lawTitle: "نظام العمل",
      lawTitleEn: "Labor Law",
      lastSection: "المادة 80 — إنهاء العقد بدون مكافأة",
      lastSectionEn: "Article 80 — Termination Without Award",
      progress: 25,
      timestamp: mkDate(4, 11),
      catId: "SA-06",
      catLabel: "العمل والتأمينات",
      catLabelEn: "Labor",
    },
    {
      id: "s6",
      lawSlug: "civil-transactions",
      lawTitle: "نظام المعاملات المدنية",
      lawTitleEn: "Civil Transactions Law",
      lastSection: "المادة 180 — المسؤولية التقصيرية",
      lastSectionEn: "Article 180 — Tort Liability",
      progress: 44,
      timestamp: mkDate(12, 9),
      catId: "SA-03",
      catLabel: "المدني والأحوال الشخصية",
      catLabelEn: "Civil & Personal Status",
    },
    {
      id: "s7",
      lawSlug: "arbitration-law",
      lawTitle: "نظام التحكيم",
      lawTitleEn: "Arbitration Law",
      lastSection: "المادة 50 — بطلان الحكم",
      lastSectionEn: "Article 50 — Award Nullification",
      progress: 68,
      timestamp: mkDate(20, 14),
      catId: "SA-28",
      catLabel: "التحكيم وتسوية النزاعات",
      catLabelEn: "Arbitration",
    },
  ];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
function classifyDate(isoStr: string): TimeGroup {
  const now = new Date();
  const d = new Date(isoStr);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (d >= startOfToday) return "today";
  if (d >= startOfYesterday) return "yesterday";
  if (d >= startOfWeek) return "thisWeek";
  if (d >= startOfMonth) return "thisMonth";
  return "older";
}

function formatTime(isoStr: string, isRTL: boolean): string {
  const d = new Date(isoStr);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? (isRTL ? "م" : "PM") : (isRTL ? "ص" : "AM");
  const hour12 = h % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

function formatRelativeDate(isoStr: string, isRTL: boolean): string {
  const now = new Date();
  const d = new Date(isoStr);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return isRTL ? "اليوم" : "Today";
  if (diffDays === 1) return isRTL ? "أمس" : "Yesterday";
  if (diffDays < 7) return isRTL ? `منذ ${diffDays} أيام` : `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return isRTL ? `منذ ${weeks} أسبوع` : `${weeks}w ago`;
  }
  return isRTL ? `منذ ${Math.floor(diffDays / 30)} شهر` : `${Math.floor(diffDays / 30)}mo ago`;
}

// ─── Session Card ───────────────────────────────────────────────────────────────
function SessionCard({
  entry, isDark, isRTL, idx, onRemove,
}: {
  entry: SessionEntry;
  isDark: boolean;
  isRTL: boolean;
  idx: number;
  onRemove: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  // Progress bar color
  const progressColor = entry.progress >= 80
    ? "bg-emerald-500"
    : entry.progress >= 50
      ? "bg-[#C8A762]"
      : "bg-[#0B3D2E]";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, x: isRTL ? 40 : -40 }}
      transition={{
        type: "spring", stiffness: 300, damping: 28,
        delay: idx * 0.04,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer ${
        isDark
          ? "bg-[#161b22] border-[#2d3748] hover:border-[#C8A762]/30 hover:bg-[#1c2230]"
          : "bg-white border-gray-200/80 hover:border-[#0B3D2E]/30 hover:shadow-[0_4px_20px_-6px_rgba(11,61,46,0.08)]"
      }`}
    >
      {/* Progress ring */}
      <div className="relative flex-shrink-0 w-11 h-11">
        <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
          <circle
            cx="22" cy="22" r="18"
            fill="none"
            strokeWidth="3"
            className={isDark ? "stroke-white/5" : "stroke-gray-100"}
          />
          <circle
            cx="22" cy="22" r="18"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${(entry.progress / 100) * 113} 113`}
            className={
              entry.progress >= 80
                ? "stroke-emerald-500"
                : entry.progress >= 50
                  ? "stroke-[#C8A762]"
                  : isDark ? "stroke-[#C8A762]/60" : "stroke-[#0B3D2E]"
            }
            style={{
              transition: "stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-[10px] font-black tabular-nums ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            {entry.progress}%
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h4 className={`text-sm font-bold truncate ${isDark ? "text-white" : "text-gray-900"}`}>
            {isRTL ? entry.lawTitle : entry.lawTitleEn}
          </h4>
          <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
            isDark ? "bg-[#C8A762]/10 text-[#C8A762]/80" : "bg-[#0B3D2E]/5 text-[#0B3D2E]/60"
          }`}>
            {isRTL ? entry.catLabel : entry.catLabelEn}
          </span>
        </div>
        {entry.lastSection && (
          <p className={`text-[11px] truncate ${isDark ? "text-gray-500" : "text-gray-400"}`}>
            {isRTL ? entry.lastSection : entry.lastSectionEn}
          </p>
        )}
        <div className={`flex items-center gap-2 mt-1 text-[10px] ${isDark ? "text-gray-600" : "text-gray-400"}`}>
          <Clock size={10} weight="fill" />
          <span>{formatTime(entry.timestamp, isRTL)}</span>
          <span className="opacity-40">·</span>
          <span>{formatRelativeDate(entry.timestamp, isRTL)}</span>
        </div>
      </div>

      {/* Actions on hover */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5 flex-shrink-0"
          >
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
              className={`p-1.5 rounded-lg transition-colors ${
                isDark ? "hover:bg-red-900/20 text-gray-600 hover:text-red-400" : "hover:bg-red-50 text-gray-400 hover:text-red-500"
              }`}
              title={isRTL ? "إزالة" : "Remove"}
            >
              <Trash size={13} />
            </button>
            <div className={`p-1.5 rounded-lg ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
              <ArrowRight size={14} weight="bold" className={isRTL ? "rotate-180" : ""} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function RecentSessions({
  isDark, isRTL,
}: {
  isDark: boolean;
  isRTL: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);

  useEffect(() => {
    // In production, load from localStorage / API
    setSessions(generateDemoSessions());
  }, []);

  const handleRemove = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
  }, []);

  // Group sessions by time
  const grouped = GROUP_ORDER.reduce<Record<TimeGroup, SessionEntry[]>>((acc, g) => {
    acc[g] = sessions.filter(s => classifyDate(s.timestamp) === g);
    return acc;
  }, { today: [], yesterday: [], thisWeek: [], thisMonth: [], older: [] });

  const totalSessions = sessions.length;

  if (totalSessions === 0) return null;

  return (
    <motion.div
      layout
      className={`mb-8 rounded-[1.75rem] border overflow-hidden transition-colors ${
        isDark
          ? "bg-[#161b22]/60 border-[#2d3748]"
          : "bg-white/70 border-gray-200/70 backdrop-blur-sm"
      }`}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-5 py-4 transition-colors ${
          isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50/50"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            isDark ? "bg-[#C8A762]/10" : "bg-[#0B3D2E]/5"
          }`}>
            <ClockCounterClockwise
              size={18}
              weight="duotone"
              className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}
            />
          </div>
          <div className={`${isRTL ? "text-right" : "text-left"}`}>
            <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "الجلسات الأخيرة" : "Recent Sessions"}
            </h3>
            <p className={`text-[11px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              {isRTL
                ? `${totalSessions} نظام تم تصفحه مؤخراً`
                : `${totalSessions} recently viewed`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Time badges preview */}
          {!isOpen && grouped.today.length > 0 && (
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
              isDark ? "bg-emerald-900/20 text-emerald-400" : "bg-emerald-50 text-emerald-700"
            }`}>
              {isRTL ? `${grouped.today.length} اليوم` : `${grouped.today.length} today`}
            </span>
          )}
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <CaretDown
              size={16}
              weight="bold"
              className={isDark ? "text-gray-500" : "text-gray-400"}
            />
          </motion.div>
        </div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 28 }}
            className="overflow-hidden"
          >
            <div className={`px-5 pb-5 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
              <div className="pt-4 space-y-5 max-h-[480px] overflow-y-auto custom-scrollbar">
                {GROUP_ORDER.map(group => {
                  const items = grouped[group];
                  if (items.length === 0) return null;
                  return (
                    <div key={group}>
                      {/* Time group label */}
                      <div className="flex items-center gap-2 mb-3">
                        <CalendarBlank
                          size={12}
                          weight="duotone"
                          className={isDark ? "text-gray-600" : "text-gray-400"}
                        />
                        <span className={`text-[10px] font-black uppercase tracking-wider ${
                          isDark ? "text-gray-500" : "text-gray-400"
                        }`}>
                          {isRTL ? GROUP_LABELS[group].ar : GROUP_LABELS[group].en}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          isDark ? "bg-white/5 text-gray-600" : "bg-gray-100 text-gray-400"
                        }`}>
                          {items.length}
                        </span>
                        <div className={`flex-1 h-px ${isDark ? "bg-white/5" : "bg-gray-100"}`} />
                      </div>

                      {/* Session cards */}
                      <div className="space-y-2">
                        <AnimatePresence mode="popLayout">
                          {items.map((entry, idx) => (
                            <SessionCard
                              key={entry.id}
                              entry={entry}
                              isDark={isDark}
                              isRTL={isRTL}
                              idx={idx}
                              onRemove={handleRemove}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
