"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { useUser } from "@/hooks/useUser";
import { isSupabaseMode } from "@/lib/services/api";
import { getPreferences, type RecentSession } from "@/lib/services/preferencesService";
import { useNoSessionCookie } from "./useNoSessionCookie";
import {
  ClockCounterClockwise, CaretDown, CaretUp, BookOpen,
  Trash, ArrowRight, Eye, Clock, CalendarBlank,
} from "@phosphor-icons/react";

// ─── Types ──────────────────────────────────────────────────────────────────────
export interface SessionEntry {
  id: string;
  /** The reader this entry opens (law, royal order or precedent). */
  href: string;
  lawSlug: string;
  lawTitle: string;
  lawTitleEn: string;
  /** Last article or section viewed */
  lastSection?: string;
  lastSectionEn?: string;
  /** reading progress 0-100 — not tracked yet, so absent */
  progress?: number;
  /** ISO timestamp — absent on entries saved before 2026-09-28 */
  timestamp?: string;
  /** category badge */
  catId: string;
  catLabel: string;
  catLabelEn: string;
}

type TimeGroup = "today" | "yesterday" | "thisWeek" | "thisMonth" | "older" | "undated";

const GROUP_LABELS: Record<TimeGroup, { ar: string; en: string }> = {
  today:     { ar: "اليوم",          en: "Today" },
  yesterday: { ar: "أمس",           en: "Yesterday" },
  thisWeek:  { ar: "هذا الأسبوع",   en: "This Week" },
  thisMonth: { ar: "هذا الشهر",     en: "This Month" },
  older:     { ar: "أقدم",          en: "Older" },
  undated:   { ar: "آخر ما تصفّحت",  en: "Recently viewed" },
};

const GROUP_ORDER: TimeGroup[] = ["today", "yesterday", "thisWeek", "thisMonth", "older", "undated"];

// ─── Real data ──────────────────────────────────────────────────────────────────
// Maps the stored RecentSession rows (preferencesService) onto the card shape.
// Entries written before 2026-09-28 carry no openedAt; they are grouped as
// «آخر ما تصفّحت» instead of being given an invented time.
// The guest key is shared by three readers: laws (type "law"), royal orders
// ("order", src/app/laws/orders/[slug]) and precedents ("precedent",
// src/app/precedents/[slug]). Each entry opens its own reader. The slug is
// stored as useParams() returned it — possibly already percent-encoded — so
// it is only encoded when it is not.
function sessionHref(type: string | undefined, slug: string): string {
  const safe = /%[0-9A-Fa-f]{2}/.test(slug) ? slug : encodeURIComponent(slug);
  if (type === "order") return `/laws/orders/${safe}`;
  if (type === "precedent") return `/precedents/${safe}`;
  return `/laws/${safe}`;
}

function toSessionEntries(list: RecentSession[]): SessionEntry[] {
  return list
    .filter(s => s && typeof s.slug === "string" && typeof s.title === "string" && s.title.trim())
    .map((s, i) => ({
      id: `${s.type ?? "law"}:${s.slug}:${i}`,
      href: sessionHref(s.type, s.slug),
      lawSlug: s.slug,
      lawTitle: s.title,
      lawTitleEn: s.titleEn || s.title,
      timestamp: s.openedAt,
      catId: s.catId ?? "",
      catLabel: "",
      catLabelEn: "",
    }));
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
function classifyDate(isoStr: string | undefined): TimeGroup {
  if (!isoStr) return "undated";
  const now = new Date();
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "undated";
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
      onClick={() => { window.location.href = entry.href; }}
      role="link"
      className={`group relative flex items-center gap-2.5 p-3 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden ${
        isDark
          ? "bg-[#161b22] border-[#2d3748] hover:border-[#C8A762]/30 hover:bg-[#1c2230]"
          : "bg-white border-gray-200/80 hover:border-[#0B3D2E]/30 hover:shadow-[0_4px_20px_-6px_rgba(11,61,46,0.08)]"
      }`}
    >
      {/* Progress ring — only when a real progress value exists */}
      {typeof entry.progress === "number" && (
      <div className="relative flex-shrink-0 w-10 h-10">
        <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
          <circle
            cx="20" cy="20" r="16"
            fill="none"
            strokeWidth="2.5"
            className={isDark ? "stroke-white/5" : "stroke-gray-100"}
          />
          <circle
            cx="20" cy="20" r="16"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${((entry.progress ?? 0) / 100) * 100.5} 100.5`}
            className={
              (entry.progress ?? 0) >= 80
                ? "stroke-emerald-500"
                : (entry.progress ?? 0) >= 50
                  ? "stroke-[#C8A762]"
                  : isDark ? "stroke-[#C8A762]/60" : "stroke-[#0B3D2E]"
            }
            style={{
              transition: "stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-[8.5px] font-black tabular-nums ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            {entry.progress}%
          </span>
        </div>
      </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Category Label stacked above the title to prevent truncation */}
        {entry.catLabel && (
        <div className="mb-1 flex">
          <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded-md ${
            isDark ? "bg-[#C8A762]/10 text-[#C8A762]/80" : "bg-[#0B3D2E]/5 text-[#0B3D2E]/60"
          }`}>
            {isRTL ? entry.catLabel : entry.catLabelEn}
          </span>
        </div>
        )}
        
        <h4 className={`text-[12.5px] font-bold tracking-tight leading-snug mb-0.5 truncate ${isDark ? "text-white" : "text-gray-900"}`}>
          {isRTL ? entry.lawTitle : entry.lawTitleEn}
        </h4>

        {entry.lastSection && (
          <p className={`text-[10px] leading-tight truncate mb-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
            {isRTL ? entry.lastSection : entry.lastSectionEn}
          </p>
        )}
        
        {entry.timestamp && (
        <div className={`flex items-center gap-1.5 text-[9px] font-medium leading-none ${isDark ? "text-gray-600" : "text-gray-400"}`}>
          <Clock size={9} weight="fill" className="shrink-0" />
          <span className="truncate">{formatTime(entry.timestamp, isRTL)}</span>
          <span className="opacity-40 shrink-0">·</span>
          <span className="truncate">{formatRelativeDate(entry.timestamp, isRTL)}</span>
        </div>
        )}
      </div>

      {/* Actions on hover - Absolute positioned to avoid layout shift */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.15 }}
            className={`absolute ${isRTL ? "left-2" : "right-2"} top-1/2 -translate-y-1/2 flex items-center gap-1 p-1 rounded-xl shadow-lg border backdrop-blur-md ${
              isDark ? "bg-[#1c2230]/95 border-white/10" : "bg-white/95 border-gray-200"
            }`}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
              className={`p-1.5 rounded-lg transition-colors ${
                isDark ? "hover:bg-red-900/20 text-gray-400 hover:text-red-400" : "hover:bg-red-50 text-gray-500 hover:text-red-500"
              }`}
              title={isRTL ? "إزالة" : "Remove"}
            >
              <Trash size={12} />
            </button>
            <div className={`p-1.5 rounded-lg ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
              <ArrowRight size={12} weight="bold" className={isRTL ? "rotate-180" : ""} />
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
  const [isExpandedView, setIsExpandedView] = useState(false);

  const { isLoggedIn, loading: authLoading } = useUser();
  // No session cookie: a guest for certain, no need to wait on useUser (sessionCookie.ts).
  const noSessionCookie = useNoSessionCookie();
  const authPending = authLoading && !noSessionCookie;

  // Owner test 2026-09-28 (T28-02): this used to render generateDemoSessions()
  // — seven invented sessions with invented progress — to every visitor,
  // guests included. It now reads the same list the law reader writes
  // (src/app/laws/[slug]/page.tsx): preferences.recentSessions for signed-in
  // users, the `nzamy_recent_sessions` browser key for guests. No progress
  // is tracked anywhere, so no progress ring is shown.
  useEffect(() => {
    if (authPending) return;
    let cancelled = false;
    const apply = (list: RecentSession[] | null | undefined) => {
      if (!cancelled) setSessions(toSessionEntries(list ?? []));
    };
    if (isLoggedIn && isSupabaseMode) {
      getPreferences().then(prefs => apply(prefs?.recentSessions));
    } else {
      try {
        const raw = localStorage.getItem("nzamy_recent_sessions");
        const parsed = raw ? JSON.parse(raw) : [];
        apply(Array.isArray(parsed) ? parsed : []);
      } catch {
        apply([]);
      }
    }
    return () => { cancelled = true; };
  }, [authPending, isLoggedIn]);

  // Hides the row in this view only; the stored list is untouched.
  const handleRemove = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
  }, []);

  // Group sessions by time
  const grouped = GROUP_ORDER.reduce<Record<TimeGroup, SessionEntry[]>>((acc, g) => {
    acc[g] = sessions.filter(s => classifyDate(s.timestamp) === g);
    return acc;
  }, { today: [], yesterday: [], thisWeek: [], thisMonth: [], older: [], undated: [] });

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
                ? `ما تصفّحته مؤخراً: ${totalSessions}`
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
              <div className={`pt-4 space-y-5 transition-all duration-300 ${isExpandedView ? "" : "max-h-[220px] overflow-y-auto pr-1 custom-scrollbar"}`}>
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

              {sessions.length > 2 && (
                <div className="pt-3 mt-3 border-t border-slate-100 dark:border-white/[0.04] flex justify-center">
                  <button
                    onClick={() => setIsExpandedView(!isExpandedView)}
                    className={`flex items-center gap-1.5 text-[10px] font-bold transition-colors ${
                      isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <span>
                      {isExpandedView
                        ? (isRTL ? "عرض أقل" : "Show Less")
                        : (isRTL ? `عرض كافة الجلسات (${sessions.length})` : `Show all sessions (${sessions.length})`)}
                    </span>
                    <motion.div animate={{ rotate: isExpandedView ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <CaretDown size={11} weight="bold" />
                    </motion.div>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
