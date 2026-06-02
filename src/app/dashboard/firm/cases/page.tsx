"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass, Plus, CalendarCheck,
  ArrowUpRight, Clock, CaretLeft, CircleHalf,
  List, SquaresFour, Warning, Archive,
  Fire, SortAscending, Bell,
  Scales, CheckCircle, XCircle, Handshake,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

import { AddCaseModal } from "@/components/dashboard/firm/AddCaseModal";
import {
  type CaseStatus,
  type CaseType,
  type Urgency,
  type ArchiveResult,
  type PageView,
  type FirmCase,
  ACTIVE_CASES,
  ARCHIVE_CASES,
  getUrgency,
  URGENCY_CONFIG,
  STATUS_CONFIG,
  RESULT_CONFIG,
  TYPE_LABELS,
} from "@/constants/firmCasesData";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FirmCasesPage() {
  const { isDark } = useTheme();
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "all">("all");
  const [viewMode, setViewMode]   = useState<"list" | "kanban">("list");
  const [pageView, setPageView]   = useState<PageView>("active");
  const [sortBy, setSortBy]       = useState<"urgency" | "importance" | "date">("urgency");
  const [showReminder, setShowReminder] = useState<string | null>(null);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveResult | "all">("all");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [showAddCase, setShowAddCase]     = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  // Active cases with urgency
  const activeCasesWithUrgency = useMemo(() => ACTIVE_CASES.map(c => ({
    ...c,
    urgency: getUrgency(c.daysLeft, c.isAppealDeadline),
  })), []);

  // Urgent cases = deadline cases sorted by daysLeft then importance
  const urgentCases = useMemo(() => activeCasesWithUrgency
    .filter(c => c.urgency !== "normal")
    .sort((a, b) => {
      if (a.urgency !== b.urgency) {
        const order = { critical: 0, high: 1, medium: 2, normal: 3 };
        return order[a.urgency] - order[b.urgency];
      }
      return (a.daysLeft ?? 99) - (b.daysLeft ?? 99) || a.importance - b.importance;
    }), [activeCasesWithUrgency]);

  // Regular filtered list
  const filtered = useMemo(() => {
    let cases = activeCasesWithUrgency.filter(c => {
      const matchStatus = statusFilter === "all" || c.status === statusFilter;
      const matchSearch = !search || c.title.includes(search) || c.client.includes(search) || c.assignee.includes(search);
      return matchStatus && matchSearch;
    });
    if (sortBy === "urgency") cases = [...cases].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, normal: 3 };
      return order[a.urgency] - order[b.urgency] || (a.daysLeft ?? 99) - (b.daysLeft ?? 99);
    });
    else if (sortBy === "importance") cases = [...cases].sort((a, b) => a.importance - b.importance);
    return cases;
  }, [activeCasesWithUrgency, statusFilter, search, sortBy]);

  // Archive filtered
  const filteredArchive = useMemo(() => ARCHIVE_CASES.filter(c =>
    (archiveFilter === "all" || c.result === archiveFilter) &&
    (!archiveSearch || c.title.includes(archiveSearch) || c.client.includes(archiveSearch))
  ), [archiveFilter, archiveSearch]);

  const counts = {
    all:       ACTIVE_CASES.length,
    active:    ACTIVE_CASES.filter(c => c.status === "active").length,
    pending:   ACTIVE_CASES.filter(c => c.status === "pending").length,
    suspended: ACTIVE_CASES.filter(c => c.status === "suspended").length,
    closed:    ACTIVE_CASES.filter(c => c.status === "closed").length,
  };

  const criticalCount = urgentCases.filter(c => c.urgency === "critical").length;
  const highCount     = urgentCases.filter(c => c.urgency === "high").length;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5" dir="rtl">

      {/* ── Critical Alert Banner ── */}
      {criticalCount > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-red-500/30 bg-red-500/8 p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
            <Fire size={16} weight="duotone" className="text-red-500" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-red-500">
              {criticalCount} قضية حرجة — ميعاد الطعن خلال ٣ أيام أو أقل
            </p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              {urgentCases.filter(c => c.urgency === "critical").map(c => c.title).join(" · ")}
            </p>
          </div>
          <button onClick={() => setPageView("urgent")}
            className="flex-shrink-0 text-[11px] font-bold text-red-500 hover:underline">
            عرض الآن
          </button>
        </motion.div>
      )}

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            قضايا المكتب
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {ACTIVE_CASES.length} قضية نشطة{criticalCount > 0 ? ` · ` : ""}{criticalCount > 0 && <span className="text-red-500 font-semibold">{criticalCount} حرجة</span>}{highCount > 0 && <span className="text-orange-500 font-semibold"> · {highCount} عاجلة</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* View toggle */}
          {pageView === "active" && (
            <div className={`flex p-1 rounded-xl border gap-1 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
              <button onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-royal text-white" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}
                title="عرض قائمة"><List size={15} /></button>
              <button onClick={() => setViewMode("kanban")}
                className={`p-2 rounded-lg transition-all ${viewMode === "kanban" ? "bg-royal text-white" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}
                title="عرض كانبان"><SquaresFour size={15} /></button>
            </div>
          )}
          <Link href="/dashboard/firm/hearings"
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <CalendarCheck size={15} />الجلسات
          </Link>
          <button onClick={() => setShowAddCase(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Plus size={15} weight="bold" />قضية جديدة
          </button>
        </div>
      </motion.div>

      {/* ── Page View Tabs ── */}
      <div className={`flex gap-1 p-1 rounded-2xl ${isDark ? "bg-zinc-900/60 border border-white/[0.06]" : "bg-slate-100/80"}`}>
        {[
          { id: "active",  label: "القضايا النشطة", icon: Scales,   badge: ACTIVE_CASES.length },
          { id: "urgent",  label: "الطعون العاجلة", icon: Warning,  badge: urgentCases.length, badgeColor: urgentCases.filter(c => c.urgency === "critical").length > 0 ? "bg-red-500" : "bg-orange-500" },
          { id: "archive", label: "الأرشيف",        icon: Archive,  badge: ARCHIVE_CASES.length },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = pageView === tab.id;
          return (
            <button key={tab.id} onClick={() => setPageView(tab.id as PageView)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${isActive
                ? isDark ? "bg-white/[0.08] text-white shadow-sm" : "bg-white text-slate-800 shadow-sm"
                : isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-500 hover:text-slate-700"
              }`}>
              <Icon size={14} weight={isActive ? "duotone" : "regular"} />
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? (tab.badgeColor ?? "bg-royal") + " text-white" : isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-200 text-slate-500"}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">

        {/* ════════════════ ACTIVE CASES ════════════════ */}
        {pageView === "active" && (
          <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Filters row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
                <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="بحث بالقضية أو الموكل أو المحامي..."
                  className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(["all", "active", "pending", "suspended"] as const).map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold flex-shrink-0 transition-all ${statusFilter === s
                      ? "bg-royal text-white border-royal"
                      : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"
                    }`}>
                    {s !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[s]?.dot}`} />}
                    {s === "all" ? "الكل" : STATUS_CONFIG[s].label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${statusFilter === s ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>{counts[s]}</span>
                  </button>
                ))}
                {/* Sort */}
                <div className={`flex items-center gap-1 px-2 py-2 rounded-xl border text-[11px] ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-100 bg-white"}`}>
                  <SortAscending size={13} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                    className={`bg-transparent outline-none text-[11px] cursor-pointer ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                    <option value="urgency">الأعجل</option>
                    <option value="importance">الأهم</option>
                    <option value="date">الأحدث</option>
                  </select>
                </div>
              </div>
            </div>

            {/* List view */}
            {viewMode === "list" && (
              <div className="space-y-2">
                {filtered.map((c, i) => {
                  const status  = STATUS_CONFIG[c.status];
                  const urgConf = URGENCY_CONFIG[c.urgency];
                  return (
                    <motion.div key={c.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                      <Link href={`/dashboard/firm/cases/${c.id}`}
                        className={`group block ${card} p-4 hover:border-royal/30 hover:scale-[1.004] transition-all ${c.urgency === "critical" ? "border-l-4 border-l-red-500" : c.urgency === "high" ? "border-l-4 border-l-orange-500" : ""}`}>
                        <div className="flex items-center gap-4">
                          {/* Urgency dot */}
                          <div className={`relative flex-shrink-0 w-2.5 h-2.5 rounded-full ${urgConf.dot}`}>
                            {c.urgency === "critical" && <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 mb-1 flex-wrap">
                              <p className={`text-[14px] font-semibold leading-snug flex-1 truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.title}</p>
                              <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                                {c.isAppealDeadline && (
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${urgConf.bg} ${urgConf.color} border ${urgConf.border}`}>
                                    ميعاد طعن
                                  </span>
                                )}
                                {c.daysLeft !== undefined && c.daysLeft <= 14 && (
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${urgConf.bg} ${urgConf.color}`}>
                                    <Clock size={8} />
                                    {c.daysLeft === 0 ? "اليوم!" : `${c.daysLeft} أيام`}
                                  </span>
                                )}
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.color}`}>{status.label}</span>
                              </div>
                            </div>
                            <div className={`flex items-center gap-3 text-[12px] flex-wrap ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                              <span>{c.client}</span>
                              <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                              <span>{c.court}</span>
                              <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                              <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>{TYPE_LABELS[c.type]}</span>
                              <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${isDark ? "bg-royal/10 text-royal/80" : "bg-royal/8 text-royal"}`}>{c.assignee}</span>
                              {c.value && <span className={`text-[10px] font-medium ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{c.value}</span>}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-left hidden sm:flex flex-col items-end gap-1.5">
                            <p className={`text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{c.stage}</p>
                            {c.nextDate && <p className={`text-[11px] flex items-center gap-1 ${c.urgency === "critical" ? "text-red-500 font-semibold" : isDark ? "text-zinc-600" : "text-slate-400"}`}><Clock size={10} />{c.nextDate}</p>}
                            {/* Reminder button */}
                            <button onClick={e => { e.preventDefault(); setShowReminder(c.id); }}
                              className={`text-[9px] flex items-center gap-0.5 px-2 py-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? "bg-white/[0.06] text-zinc-400 hover:text-zinc-200" : "bg-slate-100 text-slate-400 hover:text-slate-600"}`}>
                              <Bell size={8} />تذكير
                            </button>
                          </div>
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${isDark ? "text-zinc-700 group-hover:bg-white/[0.06] group-hover:text-zinc-300" : "text-slate-200 group-hover:bg-royal group-hover:text-white"}`}>
                            <CaretLeft size={15} />
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Kanban view */}
            {viewMode === "kanban" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(["active", "pending", "suspended"] as CaseStatus[]).map(col => {
                  const colCases = filtered.filter(c => c.status === col);
                  const sConf = STATUS_CONFIG[col];
                  return (
                    <div key={col} className={`rounded-2xl border border-t-4 p-3 ${sConf.kanbanBg} ${isDark ? "bg-zinc-900/40 border-white/[0.06]" : "bg-slate-50/80 border-slate-100"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${sConf.dot}`} />
                          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{sConf.label}</p>
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-200 text-slate-500"}`}>{colCases.length}</span>
                      </div>
                      <div className="space-y-2">
                        {colCases.map((c, i) => {
                          const urgConf = URGENCY_CONFIG[c.urgency];
                          return (
                            <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                              <Link href={`/dashboard/firm/cases/${c.id}`}
                                className={`group block ${card} p-3 hover:border-royal/30 hover:scale-[1.02] transition-all`}>
                                {c.urgency !== "normal" && (
                                  <div className={`text-[9px] font-bold px-2 py-0.5 rounded-full mb-2 inline-flex items-center gap-1 ${urgConf.bg} ${urgConf.color}`}>
                                    {c.isAppealDeadline && "⚠ ميعاد طعن · "}{c.daysLeft} أيام
                                  </div>
                                )}
                                <p className={`text-[12px] font-semibold leading-snug mb-1 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.title}</p>
                                <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{c.client}</p>
                                <div className={`mt-2 pt-2 border-t flex items-center gap-1.5 ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
                                  <div className="w-5 h-5 rounded-lg bg-royal/10 flex items-center justify-center">
                                    <span className="text-[9px] font-bold text-royal">{c.assignee.charAt(3)}</span>
                                  </div>
                                  <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{c.assignee}</p>
                                </div>
                              </Link>
                            </motion.div>
                          );
                        })}
                        {colCases.length === 0 && (
                          <div className={`${card} p-4 text-center opacity-40`}>
                            <p className={`text-[11px] ${isDark ? "text-zinc-700" : "text-slate-400"}`}>لا توجد قضايا</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ════════════════ URGENT / APPEAL DEADLINES ════════════════ */}
        {pageView === "urgent" && (
          <motion.div key="urgent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "حرجة (≤٣ أيام)",  count: urgentCases.filter(c => c.urgency === "critical").length, color: "text-red-500",    bg: "bg-red-500/10",    icon: Fire },
                { label: "عاجلة (≤٧ أيام)",  count: urgentCases.filter(c => c.urgency === "high").length,     color: "text-orange-500", bg: "bg-orange-500/10", icon: Warning },
                { label: "متوسطة (≤١٤ يوم)", count: urgentCases.filter(c => c.urgency === "medium").length,   color: "text-amber-500",  bg: "bg-amber-500/10",  icon: Clock },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className={`${card} p-4 flex items-center gap-3`}>
                    <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={18} weight="duotone" className={s.color} />
                    </div>
                    <div>
                      <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
                      <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{s.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cases list sorted by urgency */}
            <div className="space-y-2">
              {urgentCases.length === 0 && (
                <div className={`${card} p-12 text-center`}>
                  <CheckCircle size={36} weight="duotone" className="mx-auto mb-3 text-emerald-500" />
                  <p className={`text-sm font-semibold ${isDark ? "text-zinc-400" : "text-slate-600"}`}>لا توجد قضايا بمواعيد حرجة</p>
                </div>
              )}
              {urgentCases.map((c, i) => {
                const urgConf = URGENCY_CONFIG[c.urgency];
                const status  = STATUS_CONFIG[c.status];
                return (
                  <motion.div key={c.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <Link href={`/dashboard/firm/cases/${c.id}`}
                      className={`group block ${card} p-4 hover:scale-[1.004] transition-all border-r-4 ${c.urgency === "critical" ? "border-r-red-500" : c.urgency === "high" ? "border-r-orange-500" : "border-r-amber-400"}`}>
                      <div className="flex items-start gap-4">
                        {/* Days countdown */}
                        <div className={`flex-shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center ${urgConf.bg}`}>
                          <p className={`text-2xl font-black leading-none ${urgConf.color}`}>{c.daysLeft}</p>
                          <p className={`text-[9px] font-bold mt-0.5 ${urgConf.color}`}>يوم</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {c.isAppealDeadline && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${urgConf.bg} ${urgConf.color} border ${urgConf.border}`}>
                                ⚠ ميعاد طعن
                              </span>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.color}`}>{status.label}</span>
                          </div>
                          <p className={`text-[14px] font-bold mb-1 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.title}</p>
                          <div className={`flex items-center gap-3 text-[12px] flex-wrap ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                            <span>{c.client}</span>
                            <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                            <span>{c.court}</span>
                            <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${isDark ? "bg-royal/10 text-royal/80" : "bg-royal/8 text-royal"}`}>{c.assignee}</span>
                          </div>
                          <p className={`text-[11px] mt-1 font-medium ${isDark ? "text-zinc-500" : "text-slate-400"}`}>الجلسة القادمة: {c.nextDate}</p>
                        </div>
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button onClick={e => { e.preventDefault(); setShowReminder(c.id); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/10" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                            <Bell size={12} />إضافة تذكير
                          </button>
                          <Link href={`/ai/draft`}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${isDark ? "bg-[#C8A762]/10 text-[#C8A762] hover:bg-[#C8A762]/20" : "bg-[#C8A762]/10 text-[#8B6914] hover:bg-[#C8A762]/20"}`}>
                            صياغة طعن
                          </Link>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ════════════════ ARCHIVE ════════════════ */}
        {pageView === "archive" && (
          <motion.div key="archive" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Archive stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(["won", "lost", "settled", "withdrawn"] as ArchiveResult[]).map(r => {
                const conf = RESULT_CONFIG[r];
                const Icon = conf.icon;
                const count = ARCHIVE_CASES.filter(c => c.result === r).length;
                return (
                  <button key={r} onClick={() => setArchiveFilter(archiveFilter === r ? "all" : r)}
                    className={`${card} p-3.5 flex items-center gap-3 hover:border-royal/20 transition-all text-right ${archiveFilter === r ? "border-royal" : ""}`}>
                    <div className={`w-9 h-9 rounded-xl ${conf.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={16} weight="duotone" className={conf.color} />
                    </div>
                    <div>
                      <p className={`text-xl font-black ${conf.color}`}>{count}</p>
                      <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{conf.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
              <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
              <input value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)}
                placeholder="بحث في الأرشيف..."
                className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
            </div>

            {/* Archive list */}
            <div className="space-y-2">
              {filteredArchive.map((c, i) => {
                const conf = RESULT_CONFIG[c.result!];
                const Icon = conf.icon;
                return (
                  <motion.div key={c.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <div className={`group ${card} p-4 flex items-center gap-4 hover:border-royal/20 transition-all`}>
                      <div className={`w-10 h-10 rounded-xl ${conf.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon size={18} weight="duotone" className={conf.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className={`text-[14px] font-semibold truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{c.title}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${conf.bg} ${conf.color}`}>{conf.label}</span>
                        </div>
                        <div className={`flex items-center gap-3 text-[12px] flex-wrap ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                          <span>{c.client}</span>
                          <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                          <span>{c.court}</span>
                          <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>{TYPE_LABELS[c.type]}</span>
                          {c.value && <span className="font-medium">{c.value}</span>}
                        </div>
                        <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                          تقديم: {c.filedDate} · إغلاق: {c.closedDate} · {c.assignee}
                        </p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <Link href={`/dashboard/firm/cases/${c.id}`}
                          className={`text-[10px] font-semibold px-3 py-1.5 rounded-xl transition-colors ${isDark ? "bg-white/[0.06] text-zinc-400 hover:text-zinc-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                          ملف القضية
                        </Link>
                        <Link href={`/dashboard/firm/cases/${c.id}?tab=graph`}
                          className={`text-[10px] font-semibold px-3 py-1.5 rounded-xl transition-colors ${isDark ? "bg-royal/10 text-royal/80 hover:bg-royal/20" : "bg-royal/8 text-royal hover:bg-royal/15"}`}>
                          الجراف
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reminder Modal ── */}
      <AnimatePresence>
        {showReminder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowReminder(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-100"}`}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl bg-royal/10 flex items-center justify-center">
                  <Bell size={18} weight="duotone" className="text-royal" />
                </div>
                <div>
                  <p className={`text-[14px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>إضافة تذكير</p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>للقضية المحددة</p>
                </div>
              </div>
              <p className={`text-[12px] mb-3 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>التذكير قبل الميعاد بـ:</p>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {["يوم واحد", "٣ أيام", "أسبوع"].map(opt => (
                  <button key={opt}
                    className={`py-2.5 rounded-xl text-[12px] font-semibold border transition-all hover:border-royal hover:text-royal ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                    {opt}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowReminder(null)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-slate-100 text-slate-600"}`}>
                  إلغاء
                </button>
                <button onClick={() => setShowReminder(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
                  حفظ التذكير
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {showAddCase && <AddCaseModal onClose={() => setShowAddCase(false)} isDark={isDark} />}
      </AnimatePresence>

      {/* Bottom stats bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className={`${card} p-4 flex flex-wrap items-center gap-5`}>
        <div className="flex items-center gap-1.5">
          <CircleHalf size={14} weight="duotone" className="text-royal" />
          <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            إجمالي: <strong className={isDark ? "text-zinc-200" : "text-slate-700"}>{ACTIVE_CASES.length}</strong>
          </span>
        </div>
        <div className={`h-4 w-px ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`} />
        {(["active", "pending", "suspended"] as CaseStatus[]).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[s].dot}`} />
            <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              {STATUS_CONFIG[s].label}: <strong>{counts[s]}</strong>
            </span>
          </div>
        ))}
        <div className="mr-auto flex items-center gap-3">
          <span className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
            الأرشيف: <strong>{ARCHIVE_CASES.length} قضية</strong>
          </span>
          <Link href="/ai/draft" className="flex items-center gap-1.5 text-[12px] text-royal hover:underline">
            <ArrowUpRight size={13} />صياغة مذكرة
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
