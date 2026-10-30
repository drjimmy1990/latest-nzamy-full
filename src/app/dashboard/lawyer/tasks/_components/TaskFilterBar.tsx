"use client";

import { useState } from "react";
import {
  MagnifyingGlass, FolderOpen, CalendarDot, CalendarBlank, CalendarCheck, ChartBar, CalendarStar,
  CalendarX, Archive, Funnel, X,
} from "@phosphor-icons/react";
import type { KanbanGroupBy, Priority, TaskCategory, TimeRange } from "../_types";
import { PRIORITY_CONFIG, CATEGORY_CONFIG } from "../_data";
import {
  DEFAULT_TASK_FILTERS, activeFilterChips, clearFilter, panelFilterCount,
  PRIORITY_ORDER, CATEGORY_ORDER, TIME_RANGE_LABELS_AR, type TaskFilters,
} from "./taskFilters";
import { toArabicDigits } from "@/lib/services/arabicCount";

/**
 * TaskFilterBar — UX09 (owner review, mobile): the page used to stack a
 * search box, a six-chip period row, a grouping row with the archive toggle
 * and a priority legend — three or four horizontally scrolling rows on a
 * phone, with no way to see what was narrowing the list or undo it in one
 * go. Now:
 *   • always visible: search + «الكل / اليوم / الأسبوع»;
 *   • every other filter (longer periods, «بلا تاريخ», الأولوية, النوع,
 *     التجميع, الأرشيف) sits in ONE «فلاتر» panel — collapsed on a phone,
 *     open on a wide screen;
 *   • under it: the result count, one removable chip per active filter, and
 *     «مسح الفلاتر», so a task hidden by a filter is one clear click away.
 * The counts it shows come from the page's ONE filtered list (taskFilters.ts).
 */

const QUICK_RANGES: { key: TimeRange; icon: React.ElementType }[] = [
  { key: "all", icon: FolderOpen },
  { key: "today", icon: CalendarDot },
  { key: "week", icon: CalendarBlank },
];

const PANEL_RANGES: { key: TimeRange; icon: React.ElementType }[] = [
  { key: "month", icon: CalendarCheck },
  { key: "quarter", icon: ChartBar },
  { key: "year", icon: CalendarStar },
  { key: "nodate", icon: CalendarX },
];

const GROUPS: { k: KanbanGroupBy; l: string }[] = [
  { k: "status", l: "حالة المهمة" },
  { k: "priority", l: "الأولوية" },
  { k: "category", l: "النوع" },
  { k: "due", l: "الموعد" },
];

export default function TaskFilterBar({
  filters, onChange, groupBy, onGroupChange, resultCount, poolCount, archivedCount, isDark,
}: {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  groupBy: KanbanGroupBy;
  onGroupChange: (g: KanbanGroupBy) => void;
  /** Tasks the list and kanban are showing now; null while not known (loading, day not read yet). */
  resultCount: number | null;
  /** Tasks in this view (active board or archive) before the filters. */
  poolCount: number | null;
  /** Archived tasks, or null when the board was not read. */
  archivedCount: number | null;
  isDark: boolean;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const chips = activeFilterChips(filters);
  const panelCount = panelFilterCount(filters);
  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });

  const pill = (active: boolean) =>
    `flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-all ${
      active
        ? "bg-[#0B3D2E] text-[#C8A762] shadow-sm"
        : isDark ? "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]" : "text-slate-500 hover:text-slate-700 hover:bg-white"
    }`;
  const groupBox = `flex flex-wrap gap-1 p-1 rounded-2xl ${isDark ? "bg-zinc-800/60" : "bg-slate-100"}`;
  const label = `text-[10px] font-black ${isDark ? "text-zinc-500" : "text-slate-400"}`;

  return (
    <div className="space-y-2">
      {/* Row 1 — search, the three periods everyone uses, the panel toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`flex items-center gap-2 flex-1 min-w-[180px] px-3 py-2 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={filters.search} onChange={e => set({ search: e.target.value })} placeholder="بحث في عناوين المهام..."
            aria-label="بحث في عناوين المهام"
            className={`flex-1 min-w-0 bg-transparent text-[13px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <div className={groupBox} role="group" aria-label="الفترة">
          {QUICK_RANGES.map(r => {
            const Icon = r.icon;
            const active = filters.timeRange === r.key;
            return (
              <button key={r.key} onClick={() => set({ timeRange: r.key })} aria-pressed={active} className={pill(active)}>
                <Icon size={12} weight={active ? "fill" : "regular"} />
                {TIME_RANGE_LABELS_AR[r.key]}
              </button>
            );
          })}
        </div>
        <button onClick={() => setPanelOpen(v => !v)} aria-expanded={panelOpen}
          className={`md:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold ${
            panelOpen || panelCount > 0
              ? "bg-[#0B3D2E] text-[#C8A762] border-[#0B3D2E]"
              : isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"
          }`}>
          <Funnel size={13} weight={panelCount > 0 ? "fill" : "regular"} />
          فلاتر{panelCount > 0 ? ` (${toArabicDigits(panelCount)})` : ""}
        </button>
      </div>

      {/* The ONE panel — collapsed on a phone, always open from md up */}
      <div className={`${panelOpen ? "flex" : "hidden"} md:flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 rounded-2xl md:rounded-none p-3 md:p-0 border md:border-0 ${isDark ? "border-white/[0.06] bg-zinc-900/60 md:bg-transparent" : "border-slate-200 bg-white md:bg-transparent"}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`${label} md:hidden`}>الفترة</span>
          <div className={groupBox}>
            {PANEL_RANGES.map(r => {
              const Icon = r.icon;
              const active = filters.timeRange === r.key;
              return (
                <button key={r.key} onClick={() => set({ timeRange: active ? "all" : r.key })} aria-pressed={active} className={pill(active)}>
                  <Icon size={12} weight={active ? "fill" : "regular"} />
                  {TIME_RANGE_LABELS_AR[r.key]}
                </button>
              );
            })}
          </div>
        </div>

        {/* الأولوية — the coloured dots double as the legend for the dot on each card */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={label}>الأولوية</span>
          <div className={groupBox}>
            {PRIORITY_ORDER.map((p: Priority) => {
              const active = filters.priority === p;
              return (
                <button key={p} onClick={() => set({ priority: active ? "all" : p })} aria-pressed={active} className={pill(active)}>
                  <span className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[p].dot}`} />
                  {PRIORITY_CONFIG[p].label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={label}>النوع</span>
          <div className={groupBox}>
            {CATEGORY_ORDER.map((c: TaskCategory) => {
              const active = filters.category === c;
              return (
                <button key={c} onClick={() => set({ category: active ? "all" : c })} aria-pressed={active} className={pill(active)}>
                  {CATEGORY_CONFIG[c].label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={label}>التجميع</span>
          <div className={groupBox}>
            {GROUPS.map(g => (
              <button key={g.k} onClick={() => onGroupChange(g.k)} aria-pressed={groupBy === g.k} className={pill(groupBy === g.k)}>
                {g.l}
              </button>
            ))}
          </div>
          {/* «الأرشيف» — where archived tasks are seen and restored (CODE-F12) */}
          <button onClick={() => set({ showArchive: !filters.showArchive })} aria-pressed={filters.showArchive}
            className={`${pill(filters.showArchive)} border ${filters.showArchive ? "border-transparent" : isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
            <Archive size={12} />
            الأرشيف{archivedCount !== null && archivedCount > 0 ? ` (${toArabicDigits(archivedCount)})` : ""}
          </button>
        </div>
      </div>

      {/* Result count + active chips + clear-all */}
      <div className="flex items-center gap-2 flex-wrap min-h-[28px]">
        <span className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`} aria-live="polite">
          {resultCount === null
            ? "…"
            : chips.length > 0 && poolCount !== null
              ? `يظهر ${toArabicDigits(resultCount)} من ${toArabicDigits(poolCount)} مهمة`
              : `${toArabicDigits(resultCount)} مهمة`}
        </span>
        {chips.map(c => (
          <button key={c.key} onClick={() => onChange(clearFilter(filters, c.key))}
            aria-label={`إزالة ${c.label}`}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {c.label}
            <X size={10} weight="bold" />
          </button>
        ))}
        {chips.length > 0 && (
          <button onClick={() => onChange(DEFAULT_TASK_FILTERS)}
            className={`text-[11px] font-black underline underline-offset-2 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
            مسح الفلاتر
          </button>
        )}
      </div>
    </div>
  );
}
