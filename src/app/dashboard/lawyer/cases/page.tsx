"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel, MagnifyingGlass, Plus, CalendarCheck, CaretLeft,
  Clock, ArrowUpRight, Kanban, List, ChartBar,
  Archive, FunnelSimple, Users, CalendarBlank,
  SquaresFour, Dot, Warning, CheckCircle, Hourglass,
  TrendUp, Star, Handshake, UsersThree, User,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { readWorkflowRequestsByReceiver, type WorkflowRequest } from "@/lib/workflowStore";
import type { CaseStatus, CaseType, CourtDegree, Priority, KanbanCol, CollabFilter, ViewMode, KanbanGroupBy, Case } from "./_types";
import AddCaseModal from "../_components/AddCaseModal";
import EmptyState from "@/components/ui/EmptyState";




import {
  MOCK_CASES,
  workflowToCase,
  COURTS_LIST,
  DEGREE_LABELS,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  TYPE_LABELS,
  TIME_FILTERS,
  COLLAB_TABS
} from "@/constants/lawyerCasesData";

export default function CasesPage() {
  const { isDark } = useTheme();
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState<CaseStatus | "all">("all");
  const [typeFilter,    setTypeFilter]    = useState<CaseType | "all">("all");
  const [teamFilter,    setTeamFilter]    = useState<string>("all");
  const [timeFilter,    setTimeFilter]    = useState("all");
  const [viewMode,      setViewMode]      = useState<ViewMode>("list");
  const [kanbanGroup,   setKanbanGroup]   = useState<KanbanGroupBy>("status");
  const [showFilters,   setShowFilters]   = useState(false);
  const [degreeFilter,  setDegreeFilter]  = useState<CourtDegree | "all">("all");
  const [priorityFilter,setPriorityFilter]= useState<Priority | "all">("all");
  const [courtFilter,   setCourtFilter]   = useState<string>("all");
  const [cases,         setCases]         = useState(MOCK_CASES);
  const [showAddCase,   setShowAddCase]   = useState(false);
  const [collabFilter,  setCollabFilter]  = useState<CollabFilter>("all"); // S59
  const [archiveSearch, setArchiveSearch] = useState(""); // S82

  // Drag & drop state for Kanban
  const dragId = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<KanbanCol | null>(null);

  const onKanbanDragStart = useCallback((id: string) => { dragId.current = id; }, []);
  const onKanbanDrop = useCallback((col: KanbanCol) => {
    if (!dragId.current) return;
    setCases(prev => prev.map(c => c.id === dragId.current ? { ...c, kanbanCol: col } : c));
    dragId.current = null;
    setDragOverCol(null);
  }, []);

  useEffect(() => {
    const syncCases = () => {
      const workflowCases = readWorkflowRequestsByReceiver("lawyer")
        .filter(request => request.type === "service")
        .map(workflowToCase);
      setCases([...workflowCases, ...MOCK_CASES]);
    };

    syncCases();
    window.addEventListener("nzamy-workflow-updated", syncCases);
    return () => window.removeEventListener("nzamy-workflow-updated", syncCases);
  }, []);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  // All team members
  const allTeam = useMemo(() => {
    const s = new Set<string>();
    MOCK_CASES.forEach(c => c.team.forEach(m => s.add(m)));
    return Array.from(s);
  }, []);

  // Filtered cases
  const activeCases = cases.filter(c => c.status !== "archived");
  const archivedCases = cases.filter(c => c.status === "archived");

  const filtered = useMemo(() => {
    const base = viewMode === "archive" ? archivedCases : activeCases;
    return base.filter(c => {
      if (collabFilter !== "all" && c.collab !== collabFilter) return false; // S59
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (degreeFilter !== "all" && c.degree !== degreeFilter) return false;
      if (courtFilter !== "all" && c.court !== courtFilter) return false;
      if (teamFilter !== "all" && !c.team.includes(teamFilter)) return false;
      if (priorityFilter !== "all" && c.priority !== priorityFilter) return false;
      if (timeFilter === "today"  && (c.nextDateSort === undefined || c.nextDateSort > 0)) return false;
      if (timeFilter === "week"   && (c.nextDateSort === undefined || c.nextDateSort > 7)) return false;
      if (timeFilter === "month"  && (c.nextDateSort === undefined || c.nextDateSort > 30)) return false;
      if (timeFilter === "urgent" && !c.hasDeadline) return false;
      if (search && !c.title.includes(search) && !c.client.includes(search) && !c.court.includes(search)) return false;
      return true;
    }).sort((a, b) => {
      // مواعيد الطعون أولاً
      if (a.hasDeadline && !b.hasDeadline) return -1;
      if (!a.hasDeadline && b.hasDeadline) return 1;
      // ثم الأولوية
      const pOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      return (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3);
    });
  }, [collabFilter, statusFilter, typeFilter, degreeFilter, teamFilter, timeFilter, priorityFilter, search, viewMode]);

  const counts = {
    all: activeCases.length,
    active: activeCases.filter(c => c.status === "active").length,
    pending: activeCases.filter(c => c.status === "pending").length,
    suspended: activeCases.filter(c => c.status === "suspended").length,
    closed: activeCases.filter(c => c.status === "closed").length,
    archived: archivedCases.length,
  };

  const criticalCount = MOCK_CASES.filter(c => c.hasDeadline).length;

  // ─── VIEWS ────────────────────────────────────────────────────────────────

  function CaseCard({ c, compact = false }: { c: Case; compact?: boolean }) {
    const status = STATUS_CONFIG[c.status];
    const pConf  = PRIORITY_CONFIG[c.priority];
    return (
      <Link href={`/dashboard/lawyer/cases/${c.id}`}
        className={`group ${card} p-4 flex items-center gap-4 hover:border-royal/30 hover:scale-[1.005] transition-all ${compact ? "p-3" : ""}`}>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.title}</p>
            {c.hasDeadline && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 flex-shrink-0">⏰ طعن</span>}
            <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${status.bg} ${status.color}`}>{status.label}</span>
          </div>
          <div className={`flex items-center gap-2 text-[11px] flex-wrap ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            <span>{c.client}</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-40" />
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>{TYPE_LABELS[c.type]}</span>
            {c.team.length > 0 && <span className="flex items-center gap-0.5"><Users size={9} />{c.team.join("، ")}</span>}
          </div>
        </div>
        <div className="flex-shrink-0 text-left hidden sm:block">
          <p className={`text-[12px] font-medium mb-0.5 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{c.stage}</p>
          {c.nextDate
            ? <p className={`text-[11px] flex items-center gap-1 ${c.hasDeadline ? "text-red-500 font-semibold" : isDark ? "text-zinc-600" : "text-slate-400"}`}><Clock size={10} />{c.nextDate}</p>
            : <p className={`text-[11px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>{c.filedDate}</p>}
          {c.value && <p className={`text-[10px] mt-0.5 font-mono ${isDark ? "text-zinc-600" : "text-slate-300"}`}>{c.value}</p>}
        </div>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${isDark ? "text-zinc-700 group-hover:bg-white/[0.06] group-hover:text-zinc-300" : "text-slate-200 group-hover:bg-royal group-hover:text-white"}`}>
          <CaretLeft size={15} />
        </div>
      </Link>
    );
  }

  function ListView() {
    return (
      <div className="space-y-2">
        {filtered.length === 0
          ? (
            <EmptyState
              icon={<Gavel />}
              title="لا توجد قضايا مطابقة"
              description="لم يتم العثور على أي قضايا تطابق شروط البحث الحالية."
              action={{ label: "إضافة قضية", onClick: () => setShowAddCase(true) }}
            />
          )
          : filtered.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <CaseCard c={c} />
              </motion.div>
            ))}
      </div>
    );
  }

  function KanbanView() {
    // Build columns based on grouping mode
    type Col = { key: string; label: string; color: string; bg: string; cases: Case[] };
    let cols: Col[] = [];

    if (kanbanGroup === "status") {
      cols = [
        { key:"active",    label:"نشطة",        color:"text-emerald-500", bg:"bg-emerald-500/10",  cases: filtered.filter(c=>c.status==="active") },
        { key:"pending",   label:"انتظار",       color:"text-amber-500",   bg:"bg-amber-500/10",   cases: filtered.filter(c=>c.status==="pending") },
        { key:"suspended", label:"معلقة",        color:"text-blue-500",    bg:"bg-blue-500/10",    cases: filtered.filter(c=>c.status==="suspended") },
        { key:"closed",    label:"مغلقة",        color:"text-slate-400",   bg:"bg-slate-100 dark:bg-white/[0.03]", cases: filtered.filter(c=>c.status==="closed") },
      ];
    } else if (kanbanGroup === "degree") {
      cols = [
        { key:"primary",  label:"ابتدائي",             color:"text-blue-500",    bg:"bg-blue-500/10",    cases: filtered.filter(c=>c.degree==="primary") },
        { key:"labor",    label:"عمالية",              color:"text-teal-500",    bg:"bg-teal-500/10",    cases: filtered.filter(c=>c.degree==="labor") },
        { key:"criminal", label:"جزائية",              color:"text-red-600",     bg:"bg-red-600/10",     cases: filtered.filter(c=>c.degree==="criminal") },
        { key:"admin",    label:"ديوان المظالم",        color:"text-purple-500",  bg:"bg-purple-500/10",  cases: filtered.filter(c=>c.degree==="admin") },
        { key:"appeal",   label:"استئناف",             color:"text-orange-500",  bg:"bg-orange-500/10", cases: filtered.filter(c=>c.degree==="appeal") },
        { key:"supreme",  label:"المحكمة العليا",       color:"text-rose-500",    bg:"bg-rose-500/10",    cases: filtered.filter(c=>c.degree==="supreme") },
      ];
    } else if (kanbanGroup === "priority") {
      cols = [
        { key:"critical", label:"حرج",    color:"text-red-500",    bg:"bg-red-500/10",    cases: filtered.filter(c=>c.priority==="critical") },
        { key:"high",     label:"عالٍ",   color:"text-orange-500", bg:"bg-orange-500/10", cases: filtered.filter(c=>c.priority==="high") },
        { key:"normal",   label:"عادي",   color:"text-blue-500",   bg:"bg-blue-500/10",   cases: filtered.filter(c=>c.priority==="normal") },
        { key:"low",      label:"منخفض",  color:"text-slate-400",  bg:"bg-slate-100 dark:bg-white/[0.03]", cases: filtered.filter(c=>c.priority==="low") },
      ];
    } else if (kanbanGroup === "team") {
      cols = allTeam.map(m => ({
        key: m, label: m, color: "text-indigo-500", bg: "bg-indigo-500/10",
        cases: filtered.filter(c=>c.team.includes(m)),
      }));
      cols.push({ key:"unassigned", label:"غير مُسند", color:"text-slate-400", bg:"bg-slate-100 dark:bg-white/[0.03]", cases: filtered.filter(c=>c.team.length===0) });
    }

    const isDraggable = kanbanGroup === "status"; // drag only in status mode

    return (
      <div className="space-y-3">
        {/* Group selector */}
        <div className={`flex gap-1.5 flex-wrap p-1 rounded-2xl w-fit ${isDark?"bg-zinc-800/60":"bg-slate-100"}`}>
          {([
            {k:"status"  as KanbanGroupBy, l:"حالة القضية"},
            {k:"degree"  as KanbanGroupBy, l:"درجة التقاضي"},
            {k:"priority"as KanbanGroupBy, l:"الأولوية"},
            {k:"team"    as KanbanGroupBy, l:"عضو الفريق"},
          ]).map(g=>(
            <button key={g.k} onClick={()=>setKanbanGroup(g.k)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                kanbanGroup===g.k?isDark?"bg-zinc-700 text-white":"bg-white text-[#0B3D2E] shadow-sm":isDark?"text-zinc-500 hover:text-zinc-300":"text-slate-400 hover:text-slate-600"
              }`}>{g.l}</button>
          ))}
        </div>

        {/* Kanban columns */}
        <div className="flex gap-4 overflow-x-auto pb-4" style={{minHeight:440}}>
          {cols.filter(c=>c.cases.length>0||kanbanGroup==="status").map(col=>{
            const isOver = isDraggable && dragOverCol === col.key;
            return (
              <div key={col.key}
                className={`flex-shrink-0 rounded-3xl transition-all ${isDark?"bg-zinc-800/40":"bg-slate-50/80"} ${isOver?isDark?"ring-2 ring-royal/40":"ring-2 ring-royal/30 bg-royal/[0.02]":""}`}
                style={{minWidth:260,width:260}}
                onDragOver={e=>{e.preventDefault();if(isDraggable)setDragOverCol(col.key as KanbanCol);}}
                onDrop={()=>{if(isDraggable)onKanbanDrop(col.key as KanbanCol);}}
              >
                <div className={`flex items-center gap-2 px-4 py-3.5 border-b ${isDark?"border-white/[0.06]":"border-slate-200/80"} border-dashed`}>
                  <span className={`text-[11px] font-black uppercase tracking-wider flex-1 ${col.color}`}>{col.label}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isDark?"bg-white/[0.06] text-zinc-500":"bg-white text-slate-500 shadow-sm"}`}>{col.cases.length}</span>
                </div>
                <div className="p-3 space-y-2.5 min-h-[160px]">
                  {col.cases.map(c=>(
                    <div key={c.id}
                      draggable={isDraggable}
                      onDragStart={()=>isDraggable&&onKanbanDragStart(c.id)}
                      className={`relative rounded-2xl border p-3.5 ${isDraggable?"cursor-grab active:cursor-grabbing":""} hover:shadow-md transition-all hover:scale-[1.01] ${isDark?"bg-zinc-900 border-white/[0.07] hover:border-white/[0.12]":"bg-white border-slate-100 shadow-sm"}`}
                    >
                      {c.hasDeadline&&<span className="text-[9px] font-black text-red-500 block mb-1.5 flex items-center gap-1">⏰ طعن قادم</span>}
                      <p className={`text-[13px] font-bold leading-snug mb-1 ${isDark?"text-zinc-100":"text-slate-800"}`}>{c.title}</p>
                      <p className={`text-[11px] mb-2 ${isDark?"text-zinc-500":"text-slate-400"}`}>{c.client}</p>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_CONFIG[c.status].bg} ${STATUS_CONFIG[c.status].color}`}>{STATUS_CONFIG[c.status].label}</span>
                        {kanbanGroup!=="degree"&&<span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isDark?"bg-white/[0.05] text-zinc-500":"bg-slate-100 text-slate-400"}`}>{DEGREE_LABELS[c.degree] ?? c.degree}</span>}
                        {c.nextDate&&<span className={`text-[10px] font-mono flex items-center gap-0.5 ${c.hasDeadline?"text-red-500":isDark?"text-zinc-600":"text-slate-400"}`}><Clock size={9}/>{c.nextDate}</span>}
                      </div>
                      {c.team.length>0&&(
                        <div className="flex gap-1 mt-2">{c.team.map(m=>(
                          <span key={m} className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${isDark?"bg-white/[0.06] text-zinc-400":"bg-slate-100 text-slate-500"}`}>{m}</span>
                        ))}</div>
                      )}
                      <Link href={`/dashboard/lawyer/cases/${c.id}`} className="absolute inset-0 rounded-2xl"
                        onClick={e=>{if(dragId.current)e.preventDefault();}} />
                    </div>
                  ))}
                  {col.cases.length===0&&(
                    <div className={`flex flex-col items-center justify-center py-10 rounded-2xl border-2 border-dashed transition-all ${isOver?isDark?"border-royal/40":"border-royal/30":isDark?"border-white/[0.06]":"border-slate-200"}`}>
                      <p className={`text-[11px] ${isDark?"text-zinc-700":"text-slate-400"}`}>{isOver?"أسقط هنا":"لا توجد قضايا"}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // S82 — Archive view: closed + archived, with live search
  function ArchiveView() {
    const allArchived = [
      ...cases.filter(c => c.status === "archived"),
      ...cases.filter(c => c.status === "closed"),
    ];
    const q = archiveSearch.trim().toLowerCase();
    const filtered = q
      ? allArchived.filter(c =>
          c.title.toLowerCase().includes(q) ||
          c.client.toLowerCase().includes(q) ||
          c.court.toLowerCase().includes(q) ||
          TYPE_LABELS[c.type]?.toLowerCase().includes(q) ||
          c.filedDate?.toLowerCase().includes(q)
        )
      : allArchived;

    return (
      <div className="space-y-3">
        {/* Header banner */}
        <div className={`p-3 rounded-2xl border flex items-center gap-3 ${isDark ? "border-purple-500/20 bg-purple-500/5" : "border-purple-100 bg-purple-50"}`}>
          <Archive size={16} className="text-purple-500 flex-shrink-0" />
          <p className={`flex-1 text-[12px] font-semibold ${isDark ? "text-purple-300" : "text-purple-700"}`}>
            الأرشيف — القضايا المنتهية والمغلقة
          </p>
          <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
            isDark ? "bg-purple-500/15 text-purple-400" : "bg-purple-100 text-purple-600"
          }`}>
            {filtered.length}{q ? ` / ${allArchived.length}` : ""}
          </span>
        </div>

        {/* Search bar */}
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
          isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"
        }`}>
          <MagnifyingGlass size={14} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input
            value={archiveSearch}
            onChange={e => setArchiveSearch(e.target.value)}
            placeholder="ابحث في الأرشيف (اسم قضية، موكل، محكمة، نوع، تاريخ...)"
            className={`flex-1 bg-transparent text-[13px] outline-none ${
              isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"
            }`}
          />
          {archiveSearch && (
            <button onClick={() => setArchiveSearch("")}
              className={`text-[11px] px-2 py-0.5 rounded-lg ${
                isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
              }`}>
              مسح
            </button>
          )}
        </div>

        {/* Legend */}
        <div className="flex gap-3 flex-wrap">
          <span className={`flex items-center gap-1.5 text-[10px] font-semibold ${
            isDark ? "text-zinc-600" : "text-slate-400"
          }`}>
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            مغلقة ({cases.filter(c => c.status === "closed").length})
          </span>
          <span className={`flex items-center gap-1.5 text-[10px] font-semibold ${
            isDark ? "text-zinc-600" : "text-slate-400"
          }`}>
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            مؤرشفة يدوياً ({cases.filter(c => c.status === "archived").length})
          </span>
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Archive />}
            title={q ? "لم يُعثر على نتائج في الأرشيف" : "لا توجد قضايا مؤرشفة"}
            description="جميع قضاياك المنتهية أو المعلقة ستظهر هنا للرجوع إليها مستقبلاً."
            action={q ? { label: "عرض الكل", onClick: () => setArchiveSearch("") } : undefined}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <CaseCard c={c} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }


  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1200px] mx-auto space-y-4" dir="rtl">

      {/* Critical Banner */}
      {criticalCount > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-red-500/30 bg-red-500/8 p-3 flex items-center gap-3">
          <Hourglass size={16} weight="duotone" className="text-red-500 flex-shrink-0 animate-pulse" />
          <p className="text-[12px] font-bold text-red-500 flex-1">
            {criticalCount} قضية لديها مواعيد طعون قادمة — تتطلب متابعة فورية
          </p>
          <button onClick={() => { setTimeFilter("urgent"); setViewMode("list"); }}
            className="text-[11px] font-bold text-red-500 hover:underline flex-shrink-0">
            عرض فقط
          </button>
        </motion.div>
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
              style={{ fontFamily: "var(--font-brand)" }}>ملف القضايا</h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {counts.all} قضية · <span className="text-emerald-500 font-semibold">{counts.active} نشطة</span>
            {criticalCount > 0 && <> · <span className="text-red-500 font-semibold">{criticalCount} طعون</span></>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/lawyer/hearings"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <CalendarCheck size={15} />الجلسات
          </Link>
          <button onClick={() => setShowAddCase(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Plus size={15} weight="bold" />قضية جديدة
          </button>
        </div>
      </motion.div>

      {/* View Switcher + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في القضايا، العملاء، المحاكم..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        {/* View mode */}
        <div className={`flex rounded-xl overflow-hidden border flex-shrink-0 ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
          {([
            { key: "list",    icon: List,    title: "قائمة" },
            { key: "kanban",  icon: Kanban,  title: "كانبان" },
            { key: "archive", icon: Archive,  title: "الأرشيف" },
          ] as const).map(v => {
            const Icon = v.icon;
            return (
              <button key={v.key} onClick={() => setViewMode(v.key)} title={v.title}
                className={`px-3 py-2.5 flex items-center gap-1.5 text-[11px] font-bold transition-all ${
                  viewMode === v.key ? isDark ? "bg-white/[0.08] text-white" : "bg-royal text-white" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
                }`}>
                <Icon size={14} />
                <span className="hidden sm:block">{v.title}</span>
              </button>
            );
          })}
        </div>
        {/* Filters toggle */}
        <button onClick={() => setShowFilters(p => !p)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[12px] font-bold transition-all flex-shrink-0 ${
            showFilters ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-500"
          }`}>
          <FunnelSimple size={14} />فلاتر
        </button>
      </div>

      {/* Expanded Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden">
            <div className={`p-4 rounded-2xl border space-y-4 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-100 bg-slate-50"}`}>

              {/* Time filters */}
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>نطاق زمني</p>
                <div className="flex gap-1.5 flex-wrap">
                  {TIME_FILTERS.map(tf => (
                    <button key={tf.key} onClick={() => setTimeFilter(tf.key)}
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                        timeFilter === tf.key ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"
                      }`}>{tf.label}</button>
                  ))}
                </div>
              </div>

              {/* Status filters */}
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>حالة القضية</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(["all", "active", "pending", "suspended", "closed"] as const).map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                        statusFilter === s ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"
                      }`}>
                      {s !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[s]?.dot}`} />}
                      {s === "all" ? "الكل" : STATUS_CONFIG[s].label}
                      <span className={`text-[9px] px-1.5 rounded-full ${statusFilter === s ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                        {s === "all" ? counts.all : counts[s]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Type + Priority + Degree + Team */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>الفرع القانوني</p>
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setTypeFilter("all")}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${typeFilter === "all" ? "bg-royal text-white" : isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-200 text-slate-500"}`}>الكل</button>
                    {(Object.entries(TYPE_LABELS) as [CaseType, string][]).map(([k, v]) => (
                      <button key={k} onClick={() => setTypeFilter(k)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${typeFilter === k ? "bg-royal text-white" : isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-200 text-slate-500"}`}>{v}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>المحكمة</p>
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setCourtFilter("all")}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${courtFilter === "all" ? "bg-royal text-white" : isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-200 text-slate-500"}`}>الكل</button>
                    {COURTS_LIST.map(ct => (
                      <button key={ct.id} onClick={() => setCourtFilter(ct.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${courtFilter === ct.id ? "bg-royal text-white" : isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-200 text-slate-500"}`}>
                        {ct.icon} {ct.id}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>درجة التقاضي</p>
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setDegreeFilter("all")}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${degreeFilter === "all" ? "bg-royal text-white" : isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-200 text-slate-500"}`}>الكل</button>
                    {(Object.entries(DEGREE_LABELS) as [CourtDegree, string][]).map(([d, label]) => (
                      <button key={d} onClick={() => setDegreeFilter(d)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${degreeFilter === d ? "bg-royal text-white" : isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-200 text-slate-500"}`}>{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>الأولوية</p>
                  <div className="flex flex-wrap gap-1">
                    {(["all", "critical", "high", "normal", "low"] as const).map(p => (
                      <button key={p} onClick={() => setPriorityFilter(p)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${priorityFilter === p ? "bg-royal text-white" : isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-200 text-slate-500"}`}>
                        {p === "all" ? "الكل" : PRIORITY_CONFIG[p].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>عضو الفريق</p>
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setTeamFilter("all")}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${teamFilter === "all" ? "bg-royal text-white" : isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-200 text-slate-500"}`}>الكل</button>
                    {allTeam.map(m => (
                      <button key={m} onClick={() => setTeamFilter(m)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${teamFilter === m ? "bg-royal text-white" : isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-200 text-slate-500"}`}>{m}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Reset */}
              <button onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setDegreeFilter("all"); setCourtFilter("all"); setTeamFilter("all"); setTimeFilter("all"); setPriorityFilter("all"); setSearch(""); }}
                className={`text-[11px] font-semibold underline ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}>
                إعادة ضبط الفلاتر
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* S59 — Premium Collab Context Rail */}
      <div className="space-y-2">
        {/* Segment control */}
        <div className={`inline-flex items-center gap-1 p-1.5 rounded-[1.5rem] ${
          isDark ? "bg-zinc-800/70 border border-white/[0.05]" : "bg-slate-100 border border-slate-200/60"
        }`}>
          {COLLAB_TABS.map(tab => {
            const isActive = collabFilter === tab.key;
            const count = tab.key === "all"
              ? activeCases.length
              : activeCases.filter(c => c.collab === tab.key).length;
            const Icon = tab.icon;
            return (
              <motion.button
                key={tab.key}
                onClick={() => setCollabFilter(tab.key)}
                layout
                className={`relative flex items-center gap-2 px-4 py-2 rounded-2xl text-[12px] font-bold transition-colors ${
                  isActive
                    ? isDark ? "text-white" : "text-[#0B3D2E]"
                    : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="collab-pill"
                    className={`absolute inset-0 rounded-2xl ${
                      isDark
                        ? "bg-zinc-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                        : "bg-white shadow-sm shadow-slate-200/80"
                    }`}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <Icon size={13} weight={isActive ? "fill" : "regular"} />
                  {tab.label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isActive
                      ? isDark ? "bg-white/15 text-white" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                      : isDark ? "bg-white/[0.05] text-zinc-600" : "bg-slate-200/80 text-slate-400"
                  }`}>{count}</span>
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Context description — appears on non-all selection */}
        <AnimatePresence mode="wait">
          {collabFilter !== "all" && (
            <motion.p
              key={collabFilter}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
              className={`text-[11px] pr-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}
            >
              {COLLAB_TABS.find(t => t.key === collabFilter)?.desc}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Quick status pills (always visible) */}
      {!showFilters && (
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "active", "pending", "suspended"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                statusFilter === s ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"
              }`}>
              {s !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[s]?.dot}`} />}
              {s === "all" ? "الكل" : STATUS_CONFIG[s].label}
              <span className={`text-[9px] rounded-full px-1.5 ${statusFilter === s ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                {s === "all" ? counts.all : counts[s]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Active View */}
      <AnimatePresence mode="wait">
        <motion.div key={viewMode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {viewMode === "list"    && <ListView />}
          {viewMode === "kanban"  && <KanbanView />}
          {viewMode === "archive" && <ArchiveView />}
        </motion.div>
      </AnimatePresence>

      {/* Stats footer */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className={`${card} p-4 flex flex-wrap items-center gap-5`}>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>نشطة: <strong className="text-emerald-500">{counts.active}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>انتظار: <strong className="text-amber-500">{counts.pending}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>طعون: <strong className="text-red-500">{criticalCount}</strong></span>
        </div>
        <div className="mr-auto flex gap-3">
          <Link href="/ai/draft" className="flex items-center gap-1.5 text-[12px] text-royal hover:underline">
            <ArrowUpRight size={13} />صياغة مذكرة
          </Link>
          <Link href="/ai/wargaming" className="flex items-center gap-1.5 text-[12px] text-orange-500 hover:underline">
            <ArrowUpRight size={13} />محاكي خصم
          </Link>
        </div>
      </motion.div>
      <AnimatePresence>
        {showAddCase && <AddCaseModal onClose={() => setShowAddCase(false)} isDark={isDark} />}
      </AnimatePresence>
    </div>
  );
}
