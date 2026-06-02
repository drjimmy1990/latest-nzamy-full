"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, CheckCircle, Kanban, List,
  Archive, ArrowCounterClockwise, Trash,
  Trophy, X, UsersThree, User,
  FolderOpen, CalendarBlank, CalendarDot, CalendarCheck, ChartBar, CalendarStar, Timer,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import EmptyState from "@/components/ui/EmptyState";
import { VoiceInput } from "@/components/ui/VoiceInput";
import { CasePicker } from "@/components/ui/CasePicker";
import { getActiveCases, SHARED_CASES } from "@/lib/casesStore";
import { useUser } from "@/hooks/useUser";
import ReactConfetti from "react-confetti";

// Internal
import type { Task, TaskStatus, TaskCategory, ViewMode, TimeRange, KanbanGroupBy, Priority } from "./_types";
import { INIT_TASKS, KANBAN_COLS, CATEGORY_CONFIG, PRIORITY_CONFIG, today, playSuccessBeep } from "./_data";
import { TaskCard, TaskGamification } from "./_components/TaskCard";
import PomodoroPanel from "./_components/PomodoroPanel";
import { getBenchmarks, getPerformanceContext, getPerformanceSnapshot } from "../_data/performance";

// ─── Solo+ Team Members Mock ──────────────────────────────────────────────────
const TEAM_MEMBERS = [
  { id: "m1", name: "نورة القحطاني", avatar: "ن" },
  { id: "m2", name: "علي المطيري",   avatar: "ع" },
];

type OwnerFilter = "mine" | "team" | "all";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LawyerTasksPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(INIT_TASKS);
  const [pomodoroBonus, setPomodoroBonus] = useState(0);
  const [filter, setFilter] = useState<TaskStatus | "all" | "archived">("all");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | "all">("all");
  const [priority,  setPriority]  = useState<Priority | "all">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [kanbanGroup, setKanbanGroup] = useState<KanbanGroupBy>("status");
  const [newTask, setNewTask] = useState("");
  const [taskCategory, setTaskCategory] = useState<TaskCategory>("case");
  const [taskCaseId, setTaskCaseId] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [achievementTitle, setAchievementTitle] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const achieveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [winSize, setWinSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    setWinSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => setWinSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const showAchievement = (title: string) => {
    setAchievementTitle(title);
    setShowConfetti(true);
    if (achieveTimer.current) clearTimeout(achieveTimer.current);
    achieveTimer.current = setTimeout(() => {
      setAchievementTitle(null);
      setShowConfetti(false);
    }, 4000);
  };

  // Time-range helper
  const timeRangeCutoff = (range: TimeRange): string | null => {
    const now = new Date();
    if (range === "today")   return today();
    if (range === "week")    { const d = new Date(now); d.setDate(now.getDate() + 7);   return d.toISOString().slice(0, 10); }
    if (range === "month")   { const d = new Date(now); d.setMonth(now.getMonth() + 1); return d.toISOString().slice(0, 10); }
    if (range === "quarter") { const d = new Date(now); d.setMonth(now.getMonth() + 3); return d.toISOString().slice(0, 10); }
    if (range === "year")    { const d = new Date(now); d.setFullYear(now.getFullYear() + 1); return d.toISOString().slice(0, 10); }
    return null;
  };

  const timeRangeStart = today();
  const dragId = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const active   = tasks.filter(t => t.status !== "archived");
  const archived = tasks.filter(t => t.status === "archived");
  const counts = {
    all: active.length,
    todo: active.filter(t => t.status === "todo").length,
    in_progress: active.filter(t => t.status === "in_progress").length,
    done: active.filter(t => t.status === "done").length,
    archived: archived.length,
  };

  const shouldShowArchived = filter === "archived" || showArchive;
  const archivedCaseIds = new Set(
    SHARED_CASES.filter(c => c.status === "archived" || c.status === "closed").map(c => c.id)
  );

  const base = shouldShowArchived
    ? archived
    : active
        .filter(t => filter === "all" || t.status === filter)
        .filter(t => ownerFilter === "all" || (ownerFilter === "mine" ? !t.ownerId : !!t.ownerId))
        .filter(t => !t.caseId || !archivedCaseIds.has(t.caseId));

  const cutoff = timeRangeCutoff(timeRange);
  const filtered = base
    .filter(t => categoryFilter === "all" || t.category === categoryFilter)
    .filter(t => priority === "all" || t.priority === priority)
    .filter(t => {
      if (timeRange === "all" || !t.dueDate) return true;
      if (timeRange === "today") return t.dueDate === timeRangeStart;
      return t.dueDate >= timeRangeStart && (!cutoff || t.dueDate <= cutoff);
    })
    .sort((a, b) => {
      const order: Priority[] = ["urgent", "high", "normal", "low"];
      return order.indexOf(a.priority) - order.indexOf(b.priority);
    });

  const kanbanTasks = (s: TaskStatus) =>
    active
      .filter(t => t.status === s)
      .filter(t => ownerFilter === "all" || (ownerFilter === "mine" ? !t.ownerId : !!t.ownerId))
      .filter(t => categoryFilter === "all" || t.category === categoryFilter)
      .filter(t => priority === "all" || t.priority === priority)
      .filter(t => {
        if (timeRange === "all" || !t.dueDate) return true;
        if (timeRange === "today") return t.dueDate === timeRangeStart;
        return t.dueDate >= timeRangeStart && (!cutoff || t.dueDate <= cutoff);
      })
      .sort((a, b) => {
        const order: Priority[] = ["urgent", "high", "normal", "low"];
        return order.indexOf(a.priority) - order.indexOf(b.priority);
      });

  // Actions
  const onToggle = useCallback((id: string) => {
    setTasks(prev => {
      const next = prev.map(t =>
        t.id === id ? ({ ...t, status: t.status === "done" ? "todo" : "done" } as Task) : t
      );
      const wasJustDone = next.find(t => t.id === id)?.status === "done";
      if (wasJustDone) {
        playSuccessBeep();
        const task = next.find(t => t.id === id);
        showAchievement(task?.title ?? "تم إنجاز المهمة!");
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDelete  = useCallback((id: string) => setTasks(prev => prev.filter(t => t.id !== id)), []);
  const onArchive = useCallback((id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: "archived" } : t));
  }, []);
  const onRestore = useCallback((id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: "todo" } : t));
  }, []);
  const onStatusChange = useCallback((id: string, s: TaskStatus) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: s } : t));
  }, []);

  const onSubtaskToggle = useCallback((taskId: string, subtaskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id !== taskId ? t :
      { ...t, subtasks: t.subtasks?.map(s => s.id === subtaskId ? { ...s, done: !s.done } : s) }
    ));
  }, []);

  const onEditSave = useCallback((taskId: string, patch: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
  }, []);

  const addTask = () => {
    if (!newTask.trim()) return;
    const linked = getActiveCases().find(c => c.id === taskCaseId);
    const newTaskObj: Task = {
      id: Date.now().toString(), title: newTask,
      category: taskCategory, priority: "normal", status: "todo",
      caseId: taskCaseId || undefined,
      caseRef: linked?.title || undefined,
    };
    setTasks(prev => [newTaskObj, ...prev]);
    setNewTask(""); setTaskCaseId(""); setTaskCategory("case");
  };

  const onDragStart = useCallback((id: string) => { dragId.current = id; }, []);
  const onDrop = useCallback((targetStatus: TaskStatus) => {
    if (!dragId.current) return;
    setTasks(prev => prev.map(t => t.id === dragId.current ? { ...t, status: targetStatus } : t));
    dragId.current = null;
    setDragOverCol(null);
  }, []);

  const performanceContext = getPerformanceContext(user);
  const performanceSnapshot = getPerformanceSnapshot("today", { pomodoroBonus });
  const performanceBenchmarks = getBenchmarks(performanceContext, {
    city: "الرياض",
    firmName: user.affiliation?.entityName,
  });
  const onPomodoroComplete = useCallback(() => {
    setPomodoroBonus(count => count + 1);
  }, []);

  return (
    <div className="max-w-[1240px] mx-auto space-y-5 relative" dir="rtl">
      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 z-[10000] pointer-events-none">
          <ReactConfetti width={winSize.width} height={winSize.height} recycle={false} numberOfPieces={300} gravity={0.15} />
        </div>
      )}

      {/* Achievement Toast */}
      <AnimatePresence>
        {achievementTitle && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-5 right-1/2 translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl"
            style={{ background: "linear-gradient(135deg,#0B3D2E,#155239)", border: "1px solid rgba(200,167,98,0.3)" }}
          >
            <CheckCircle size={20} weight="fill" className="text-[#C8A762] flex-shrink-0" />
            <div>
              <p className="text-[11px] text-[#C8A762] font-black uppercase tracking-wider">مهمة مكتملة!</p>
              <p className="text-[13px] text-white font-semibold truncate max-w-[260px]">{achievementTitle}</p>
            </div>
            <Trophy size={20} weight="fill" className="text-[#C8A762] flex-shrink-0" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            قائمة المهام
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {counts.todo} معلقة · {counts.in_progress} قيد التنفيذ · {counts.done} مكتملة
            {counts.archived > 0 && ` · ${counts.archived} مؤرشفة`}
          </p>
        </div>
          {/* View toggle */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Pomodoro toggle */}
            <motion.button whileTap={{ scale: 0.95 }}
              onClick={() => setShowPomodoro(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold transition-all ${
                showPomodoro
                  ? "bg-[#0B3D2E] text-[#C8A762] border-[#0B3D2E]"
                  : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-500 hover:border-[#0B3D2E]/20 hover:text-[#0B3D2E]"
              }`}>
              <Timer size={13} weight={showPomodoro ? "fill" : "regular"} />
              مؤقت التركيز
            </motion.button>
            {/* Add task CTA */}
            <motion.button whileTap={{ scale: 0.97 }}
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-[12px] bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
              <Plus size={14} weight="bold" />
              مهمة جديدة
            </motion.button>
            <div className={`flex rounded-xl overflow-hidden border ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
              {([
                { mode: "list" as const,   icon: List,   title: "قائمة" },
                { mode: "kanban" as const, icon: Kanban, title: "كانبان" },
              ]).map(({ mode, icon: Icon, title }) => (
                <button key={mode} onClick={() => setView(mode)} title={title}
                  className={`px-3 py-2 flex items-center gap-1 text-[11px] font-bold transition-all ${
                    view === mode ? isDark ? "bg-white/[0.08] text-white" : "bg-[#0B3D2E] text-white" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
                  }`}>
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>
      </motion.div>

      {/* Owner Toggle (Solo+ Mode) */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}
        className={`flex gap-1 p-1 rounded-2xl w-fit ${isDark ? "bg-zinc-800/60" : "bg-slate-100"}`}>
        {([
          { key: "all"  as OwnerFilter, label: "الكل",         icon: CheckCircle },
          { key: "mine" as OwnerFilter, label: "مهامي",        icon: User },
          { key: "team" as OwnerFilter, label: "مهام الفريق", icon: UsersThree },
        ]).map(opt => {
          const Icon = opt.icon;
          const isActive = ownerFilter === opt.key;
          return (
            <button key={opt.key} onClick={() => setOwnerFilter(opt.key)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold transition-all ${
                isActive ? isDark ? "bg-zinc-700 text-white" : "bg-white text-[#0B3D2E] shadow-sm" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
              }`}>
              <Icon size={13} weight={isActive ? "fill" : "regular"} />
              {opt.label}
              {opt.key === "team" && (
                <span className="flex -space-x-1">
                  {TEAM_MEMBERS.map(m => (
                    <span key={m.id}
                      className={`w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center ring-1 ring-white ${
                        isActive ? isDark ? "bg-zinc-600 text-white" : "bg-slate-200 text-slate-700" : "bg-slate-300 text-slate-500"
                      }`}>{m.avatar}</span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </motion.div>

      {/* Pomodoro Panel — يظهر أولاً عند التفعيل */}
      <AnimatePresence>
        {showPomodoro && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
            className="overflow-hidden"
          >
            <PomodoroPanel
              isDark={isDark}
              taskTitles={tasks.filter(t => t.status !== "archived" && t.status !== "done").map(t => t.title)}
              onPomodoroComplete={onPomodoroComplete}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gamification Panel — سجل الأداء يلي المؤقت */}
      <TaskGamification
        snapshot={performanceSnapshot}
        benchmarks={performanceBenchmarks}
        context={performanceContext}
        isDark={isDark}
      />

      {/* Time Range Bar */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
        className={`flex gap-1.5 overflow-x-auto pb-1 p-1 rounded-2xl w-fit max-w-full ${isDark ? "bg-zinc-800/60" : "bg-slate-100"}`}>
        {([
          { key: "all"     as TimeRange, label: "الكل",          icon: FolderOpen },
          { key: "today"   as TimeRange, label: "اليوم",         icon: CalendarDot },
          { key: "week"    as TimeRange, label: "الأسبوع",       icon: CalendarBlank },
          { key: "month"   as TimeRange, label: "هذا الشهر",    icon: CalendarCheck },
          { key: "quarter" as TimeRange, label: "هذا الربع",    icon: ChartBar },
          { key: "year"    as TimeRange, label: "هذه السنة",    icon: CalendarStar },
        ]).map(t => {
          const Icon = t.icon;
          return (
          <button key={t.key} onClick={() => setTimeRange(t.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-xl text-[11px] font-bold flex-shrink-0 transition-all ${
              timeRange === t.key
                ? "bg-[#0B3D2E] text-[#C8A762] shadow-sm"
                : isDark ? "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]" : "text-slate-500 hover:text-slate-700 hover:bg-white"
            }`}>
            <Icon size={12} weight={timeRange === t.key ? "fill" : "regular"} />
            {t.label}
          </button>
          );
        })}
      </motion.div>

      {/* Group Selector */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
        className="flex items-center gap-2 flex-wrap">
        <div className={`flex gap-1 p-1 rounded-2xl ${isDark?"bg-zinc-800/60":"bg-slate-100"}`}>
          {([
            {k:"status"   as KanbanGroupBy, l:"حالة المهمة"},
            {k:"priority" as KanbanGroupBy, l:"الأولوية"},
            {k:"category" as KanbanGroupBy, l:"النوع"},
            {k:"due"      as KanbanGroupBy, l:"الموعد"},
          ]).map(g=>(
            <button key={g.k} onClick={()=>setKanbanGroup(g.k)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                kanbanGroup===g.k?isDark?"bg-zinc-700 text-white":"bg-white text-[#0B3D2E] shadow-sm":isDark?"text-zinc-500 hover:text-zinc-300":"text-slate-400 hover:text-slate-600"
              }`}>{g.l}</button>
          ))}
        </div>
        {/* Archive pill */}
        <button onClick={()=>setShowArchive(v=>!v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold flex-shrink-0 transition-all ${
            showArchive?"bg-amber-500 text-white border-amber-500":isDark?"border-white/[0.06] text-zinc-500 hover:text-zinc-300":"border-slate-200 text-slate-500 hover:border-amber-400 hover:text-amber-600"
          }`}>
          <Archive size={12}/>
          الأرشيف {counts.archived>0&&`(${counts.archived})`}
        </button>
      </motion.div>

      {/* ── List View (grouped) ── */}
      {view === "list" && (() => {
        type GSection = {key:string;label:string;color:string;tasks:Task[]};
        let sections: GSection[] = [];

        if (showArchive) {
          sections = [{key:"archive",label:"الأرشيف",color:"text-amber-500",tasks:archived}];
        } else if (kanbanGroup==="status") {
          sections = KANBAN_COLS.map(c=>({key:c.status,label:c.label,color:c.color,tasks:kanbanTasks(c.status)}));
        } else if (kanbanGroup==="priority") {
          sections = [
            {key:"urgent",label:"عاجل 🔴",color:"text-red-500",   tasks:active.filter(t=>t.priority==="urgent")},
            {key:"high",  label:"عالية 🟠",color:"text-amber-500", tasks:active.filter(t=>t.priority==="high")},
            {key:"normal",label:"عادية 🔵",color:"text-blue-500",  tasks:active.filter(t=>t.priority==="normal")},
            {key:"low",   label:"منخفضة ⚪️",color:"text-slate-400", tasks:active.filter(t=>t.priority==="low")},
          ];
        } else if (kanbanGroup==="category") {
          sections = Object.entries(CATEGORY_CONFIG).map(([k,v])=>({
            key:k, label:v.label, color:v.color,
            tasks:active.filter(t=>t.category===k),
          }));
        } else {
          const todayStr = today();
          const inDays = (n:number)=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
          sections = [
            {key:"overdue",label:"متأخرة ⚠️",color:"text-red-500",   tasks:active.filter(t=>t.dueDate&&t.dueDate<todayStr&&t.status!=="done")},
            {key:"today",  label:"اليوم 📌",    color:"text-orange-500",tasks:active.filter(t=>t.dueDate===todayStr)},
            {key:"week",   label:"هذا الأسبوع",color:"text-amber-500", tasks:active.filter(t=>t.dueDate&&t.dueDate>todayStr&&t.dueDate<=inDays(7))},
            {key:"later",  label:"لاحقاً",     color:"text-slate-400", tasks:active.filter(t=>!t.dueDate||(t.dueDate>inDays(7)))},
          ];
        }

        const nonEmpty = sections.filter(s=>s.tasks.length>0);
        if (nonEmpty.length===0) return (
          <EmptyState
            icon={<CheckCircle />}
            title="لا توجد مهام"
            description="لم يتم العثور على مهام تطابق شروط الفلترة أو البحث الحالية."
            action={{ label: "إضافة مهمة", onClick: () => setShowAddModal(true) }}
          />
        );

        return (
          <div className="space-y-5">
            {nonEmpty.map(sec=>(
              <div key={sec.key}>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${sec.color}`}>{sec.label} <span className={`ml-1 ${isDark?"text-zinc-600":"text-slate-400"}`}>({sec.tasks.length})</span></p>
                <AnimatePresence>
                  <div className="space-y-1.5">
                    {sec.tasks.map((task,i)=>(
                      <motion.div key={task.id} layout initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{delay:i*0.02}}>
                        {task.status==="archived" ? (
                          <div className={`group rounded-2xl border px-4 py-3 flex items-center gap-3 opacity-60 hover:opacity-80 transition-all ${isDark?"bg-zinc-900/40 border-white/[0.04]":"bg-slate-50 border-slate-100"}`}>
                            <Archive size={14} className={isDark?"text-zinc-600":"text-slate-400"}/>
                            <p className={`text-[13px] font-medium line-through truncate flex-1 ${isDark?"text-zinc-500":"text-slate-400"}`}>{task.title}</p>
                            <button onClick={()=>onRestore(task.id)} className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl transition-colors opacity-0 group-hover:opacity-100 ${isDark?"bg-white/[0.06] text-zinc-300 hover:bg-white/[0.10]":"bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}>
                              <ArrowCounterClockwise size={11}/> استعادة
                            </button>
                            <button onClick={()=>onDelete(task.id)} className={`p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100 ${isDark?"hover:bg-red-500/10 text-zinc-700 hover:text-red-400":"hover:bg-red-50 text-slate-300 hover:text-red-400"}`}>
                              <Trash size={12}/>
                            </button>
                          </div>
                        ) : (
                          <TaskCard task={task} isDark={isDark} onToggle={onToggle} onDelete={onDelete} onArchive={onArchive} onStatusChange={onStatusChange} onSubtaskToggle={onSubtaskToggle} onEditSave={onEditSave}/>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </AnimatePresence>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Kanban View (Bento 2.0 & Liquid Glass) ── */}
      {view === "kanban" && (
        <div className="space-y-4">
          <div className="flex gap-6 overflow-x-auto pb-4 pt-2 snap-x snap-mandatory hide-scrollbar">
            {(()=>{
              type KCol = {key:string;label:string;color:string;colBg:string;tasks:Task[]};
              let cols:KCol[] = [];
              if(kanbanGroup==="status") {
                cols = KANBAN_COLS.map(c=>({key:c.status,label:c.label,color:c.color,colBg:"",tasks:kanbanTasks(c.status)}));
              } else if(kanbanGroup==="priority") {
                cols = [
                  {key:"urgent", label:"عاجل 🔴",  color:"text-red-500",    colBg:"", tasks:active.filter(t=>t.priority==="urgent")},
                  {key:"high",   label:"عالية 🟠", color:"text-amber-500",  colBg:"", tasks:active.filter(t=>t.priority==="high")},
                  {key:"normal", label:"عادية 🔵",  color:"text-blue-500",   colBg:"", tasks:active.filter(t=>t.priority==="normal")},
                  {key:"low",    label:"منخفضة ⚪️", color:"text-slate-400",  colBg:"", tasks:active.filter(t=>t.priority==="low")},
                ];
              } else if(kanbanGroup==="category") {
                cols = Object.entries(CATEGORY_CONFIG).map(([k,v])=>({
                  key:k, label:v.label, color:v.color, colBg:"",
                  tasks:active.filter(t=>t.category===k),
                }));
              } else {
                const todayStr = new Date().toISOString().slice(0,10);
                const inDays = (n:number)=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
                cols = [
                  {key:"overdue", label:"متأخرة ⚠️", color:"text-red-500",   colBg:"", tasks:active.filter(t=>t.dueDate&&t.dueDate<todayStr&&t.status!=="done")},
                  {key:"today",   label:"اليوم 📌",     color:"text-orange-500",colBg:"", tasks:active.filter(t=>t.dueDate===todayStr)},
                  {key:"week",    label:"هذا الأسبوع", color:"text-amber-500", colBg:"", tasks:active.filter(t=>t.dueDate&&t.dueDate>todayStr&&t.dueDate<=inDays(7))},
                  {key:"later",   label:"لاحقاً",      color:"text-slate-400", colBg:"", tasks:active.filter(t=>!t.dueDate||(t.dueDate>inDays(7)))},
                ];
              }
              const isDraggable = kanbanGroup==="status";
              return cols.filter(c=>c.tasks.length>0||kanbanGroup==="status").map((col, index) =>(
                <motion.div 
                  key={col.key}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 100, damping: 20, delay: index * 0.05 }}
                  className={`flex-shrink-0 rounded-[2.5rem] relative overflow-hidden transition-all duration-300 snap-center snap-always ${
                    isDark
                      ? "bg-zinc-900/40 border border-white/[0.04] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                      : "bg-white border border-slate-100/50 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)]"
                  } ${dragOverCol===col.key ? (isDark ? "ring-2 ring-emerald-500/30 bg-emerald-500/5" : "ring-2 ring-emerald-500/20 bg-emerald-50") : ""}`}
                  style={{ minWidth: 360, width: 360 }}
                  onDragOver={e=>{e.preventDefault();if(isDraggable)setDragOverCol(col.key as TaskStatus);}}
                  onDrop={()=>{if(isDraggable)onDrop(col.key as TaskStatus);}}
                >
                  <div className="absolute inset-0 pointer-events-none opacity-[0.015] bg-[url('/noise.svg')]" />
                  
                  <div className={`flex items-center gap-3 px-6 py-5 border-b ${isDark?"border-white/[0.04]":"border-slate-100"} relative z-10`}>
                    <div className="flex-1">
                      <h3 className={`text-[12px] font-black uppercase tracking-widest ${col.color}`}>{col.label}</h3>
                    </div>
                    <motion.span 
                      key={col.tasks.length}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={`text-[12px] font-bold px-3 py-1 rounded-full backdrop-blur-md ${isDark?"bg-white/[0.04] text-zinc-400 border border-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]":"bg-slate-50 text-slate-500 border border-slate-200/60 shadow-sm"}`}>
                      {col.tasks.length}
                    </motion.span>
                  </div>

                  <div className="p-4 space-y-4 min-h-[300px] relative z-10">
                    <AnimatePresence mode="popLayout">
                      {col.tasks.map(task=>(
                        <motion.div 
                          key={task.id} 
                          layoutId={task.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95, y: 10 }} 
                          animate={{ opacity: 1, scale: 1, y: 0 }} 
                          exit={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                          transition={{ type: "spring", stiffness: 120, damping: 20 }}
                        >
                          <TaskCard task={task} isDark={isDark}
                            onToggle={onToggle} onDelete={onDelete} onArchive={onArchive}
                            onStatusChange={onStatusChange}
                            onSubtaskToggle={onSubtaskToggle}
                            onEditSave={onEditSave}
                            draggable={isDraggable}
                            onDragStart={isDraggable?onDragStart:undefined}
                            onDragEnd={()=>dragId.current=null} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {col.tasks.length===0&&(
                      <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className={`flex flex-col items-center justify-center py-12 rounded-[2rem] border border-dashed ${isDark?"border-white/[0.04] bg-white/[0.01]":"border-slate-200 bg-slate-50/50"}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${isDark?"bg-white/[0.02]":"bg-white shadow-sm"}`}>
                          <CheckCircle size={20} className={isDark?"text-zinc-700":"text-slate-300"} weight="duotone"/>
                        </div>
                        <p className={`text-[11px] font-semibold ${isDark?"text-zinc-600":"text-slate-400"}`}>منطقة خالية</p>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ── Add Task Modal ── */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
            <motion.div initial={{ scale: 0.95, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: -10, opacity: 0 }}
              className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}>
              <div className="flex justify-between items-center mb-5">
                <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>تفاصيل المهمة الجديدة</h3>
                <button onClick={() => setShowAddModal(false)} className={`w-8 h-8 flex items-center justify-center rounded-full ${isDark ? "bg-white/10 hover:bg-white/20" : "bg-slate-100 hover:bg-slate-200"}`}>
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>عنوان المهمة</label>
                  <div className="relative">
                    <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="مثال: كتابة مذكرة رد..."
                      className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none pe-12 ${isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-slate-50 text-slate-800"}`} />
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center pointer-events-auto">
                      <VoiceInput onTranscript={t => setNewTask(prev => prev ? prev + " " + t : t)} compact />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>التصنيف</label>
                    <select value={taskCategory} onChange={e=>setTaskCategory(e.target.value as TaskCategory)} className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-slate-50 text-slate-800"}`}>
                      <option value="case">قضية</option>
                      <option value="document">مستند</option>
                      <option value="client">إدارة عملاء</option>
                      <option value="admin">إداري عام</option>
                    </select>
                  </div>
                  {taskCategory === "case" && (
                    <div>
                      <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>ارتباط بقضية (اختياري)</label>
                      <CasePicker value={taskCaseId} onChange={(id) => setTaskCaseId(id)} isDark={isDark} />
                    </div>
                  )}
                </div>

                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>الأولوية</label>
                  <div className="flex gap-2">
                    {(["critical", "high", "normal"] as const).map(p => (
                      <button key={p} className={`flex-1 rounded-xl py-2 text-[12px] font-bold border transition-colors ${
                        p === "critical" ? "border-red-500/30 bg-red-500/10 text-red-500" :
                        p === "high" ? "border-amber-500/30 bg-amber-500/10 text-amber-500" :
                        isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-400" : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}>
                        {p === "critical" ? "حرجة" : p === "high" ? "عاجل" : "عادية"}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={() => { if(newTask.trim()) { addTask(); setShowAddModal(false); } }}
                  className="w-full mt-2 rounded-xl bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] py-3 text-[13px] font-bold text-white">
                  تأكيد الإضافة
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
