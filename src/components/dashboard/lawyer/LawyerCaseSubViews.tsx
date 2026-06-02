"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Gavel,
  CalendarCheck,
  Clock,
  User,
  Buildings,
  FileText,
  Plus,
  Download,
  UploadSimple,
  ArrowUpRight,
  CheckCircle,
  Warning,
  PencilSimple,
  Scales,
  Eye,
  Graph,
  Circle,
  DotsThree,
  ArrowsOut,
  ArrowsIn,
  X,
  Robot,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";

const CaseGraphView = dynamic(
  () => import("@/app/dashboard/business/kanban/CaseGraphView"),
  { ssr: false, loading: () => <div className="h-96 flex items-center justify-center text-sm text-slate-400">جاري تحميل الجراف...</div> }
);

const LegalCanvas = dynamic(
  () => import("@/app/dashboard/lawyer/cases/[id]/_components/LegalCanvas"),
  { ssr: false, loading: () => <div className="h-[340px] rounded-2xl animate-pulse bg-zinc-800/20" /> }
);

// ─── Types & DB structures ───────────────────────────────────────────────────
type CaseStatus = "active" | "pending" | "suspended" | "closed";
type TaskStatus = "todo" | "inprogress" | "done";
type TaskPriority = "high" | "medium" | "low";

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  due: string;
}

interface TeamMember {
  name: string;
  role: string;
  avatar: string;
}

interface CaseDetail {
  id: string;
  title: string;
  client: string;
  clientType: "individual" | "corporate";
  court: string;
  type: string;
  status: CaseStatus;
  assignee: string;
  nextDate?: string;
  filedDate: string;
  stage: string;
  description: string;
  value?: string;
  referenceNo?: string;
  team: TeamMember[];
  tasks: Task[];
  hearings: { date: string; court: string; result: string; status: "done" | "upcoming" }[];
  documents: { name: string; type: string; date: string; size: string }[];
  notes: { author: string; text: string; date: string }[];
  timeline: { event: string; date: string; icon: React.ElementType; color: string }[];
}

const TASK_STATUS: Record<TaskStatus, { label: string; color: string; dot: string }> = {
  todo:       { label: "لم تبدأ",    color: "text-slate-500 bg-slate-100",         dot: "bg-slate-300" },
  inprogress: { label: "قيد التنفيذ", color: "text-blue-600 bg-blue-500/10",       dot: "bg-blue-400 animate-pulse" },
  done:       { label: "مكتملة",     color: "text-emerald-600 bg-emerald-500/10", dot: "bg-emerald-400" },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; badge: string }> = {
  high:   { label: "عالية",   badge: "text-red-500 bg-red-500/10 border-red-500/20" },
  medium: { label: "متوسطة",  badge: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  low:    { label: "منخفضة",  badge: "text-slate-400 bg-slate-100 border-slate-200" },
};

// ─── 1. Overview Tab ─────────────────────────────────────────────────────────
interface OverviewPaneProps {
  isDark: boolean;
  caseData: CaseDetail;
  taskStats: { done: number; inprogress: number; todo: number };
}

export function OverviewPane({ isDark, caseData, taskStats }: OverviewPaneProps) {
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className={`${card} p-5 space-y-4`}>
          <div>
            <h2 className={`text-sm font-bold mb-2 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <Scales size={14} className="text-royal" />وقائع القضية
            </h2>
            <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{caseData.description}</p>
          </div>
          <div className={`p-3 rounded-xl border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#C8A762]/30 bg-[#C8A762]/5"}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <Robot size={13} className="text-[#C8A762]" />
              <span className="text-[11px] font-bold text-[#C8A762]">تقييم نظامي AI</span>
            </div>
            <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
              قوة موقف الموكل: <strong className="text-emerald-500">عالية (٧٨%)</strong> — الحكم الابتدائي الإيجابي يعزز الموقف في الاستئناف.
            </p>
            <Link href="/ai/analyze-strength"
              className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-[#C8A762] hover:underline">
              <ArrowUpRight size={10} />تحليل تفصيلي
            </Link>
          </div>
          {/* Task quick summary */}
          <div className={`grid grid-cols-3 gap-2 p-3 rounded-xl ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
            {[
              { label: "مكتملة",     value: taskStats.done,       color: "text-emerald-500" },
              { label: "قيد التنفيذ", value: taskStats.inprogress, color: "text-blue-500" },
              { label: "لم تبدأ",    value: taskStats.todo,        color: "text-slate-400" },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legal Canvas — embedded in overview */}
      <LegalCanvas
        isDark={isDark}
        caseType={caseData.type === "تجاري" ? "commercial" : caseData.type === "مدني" ? "civil" : "labor"}
      />
    </div>
  );
}

// ─── 2. Tasks Pane (Kanban) ──────────────────────────────────────────────────
interface TasksPaneProps {
  isDark: boolean;
  caseTasks: Task[];
  setCaseTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  caseData: CaseDetail;
}

export function TasksPane({ isDark, caseTasks, setCaseTasks, caseData }: TasksPaneProps) {
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const [taskFilter, setTaskFilter] = useState<TaskStatus | "all">("all");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", status: "todo" as TaskStatus, priority: "medium" as TaskPriority, assignee: "" });
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  
  const dragId = useRef<string | null>(null);

  const onTaskDragStart = (id: string) => { dragId.current = id; };
  
  const onTaskDrop = (targetStatus: TaskStatus) => {
    if (!dragId.current) return;
    setCaseTasks(prev => prev.map(t => t.id === dragId.current ? { ...t, status: targetStatus } : t));
    dragId.current = null;
    setDragOverCol(null);
  };

  const toggleCaseTask = (id: string) => {
    setCaseTasks(prev => prev.map(t =>
      t.id === id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t
    ));
  };

  const openEdit = (task: Task) => {
    setEditForm({ title: task.title, status: task.status, priority: task.priority, assignee: task.assignee });
    setEditingTaskId(task.id);
  };

  const saveEdit = () => {
    setCaseTasks(prev => prev.map(t =>
      t.id === editingTaskId ? { ...t, ...editForm } : t
    ));
    setEditingTaskId(null);
  };

  const colTasksFiltered = (col: TaskStatus) => {
    return caseTasks.filter(t => t.status === col && (taskFilter === "all" || taskFilter === col));
  };

  return (
    <div className="space-y-4">
      {/* Header + filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {(["all", "todo", "inprogress", "done"] as const).map(s => (
            <button key={s} onClick={() => setTaskFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${taskFilter === s
                ? "bg-royal text-white border-royal"
                : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"
              }`}>
              {s !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${TASK_STATUS[s].dot}`} />}
              {s === "all" ? "الكل" : TASK_STATUS[s].label}
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${taskFilter === s ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                {s === "all" ? caseData.tasks.length : caseData.tasks.filter(t => t.status === s).length}
              </span>
            </button>
          ))}
        </div>
        <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"}`}>
          <Plus size={12} weight="bold" />إضافة مهمة
        </button>
      </div>

      {/* Kanban columns — with Drag & Drop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["todo", "inprogress", "done"] as TaskStatus[]).map(col => {
          const colTasks = caseTasks.filter(t => t.status === col);
          const activeColTasks = colTasksFiltered(col);
          const conf = TASK_STATUS[col];
          const isOver = dragOverCol === col;
          return (
            <div key={col}
              onDragOver={e => { e.preventDefault(); setDragOverCol(col); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => onTaskDrop(col)}
              className={`rounded-2xl transition-all duration-200 ${
                isOver ? (isDark ? "bg-royal/10 ring-2 ring-royal/30" : "bg-royal/5 ring-2 ring-royal/20") : ""
              }`}
            >
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className={`w-2 h-2 rounded-full ${conf.dot}`} />
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{conf.label}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>
                  {colTasks.length}
                </span>
              </div>
              <div className="space-y-2.5 min-h-[120px]">
                {colTasks.length === 0 && (
                  <div className={`${card} p-5 flex flex-col items-center justify-center opacity-40 border-dashed`}>
                    <Circle size={20} className={isDark ? "text-zinc-700" : "text-slate-300"} />
                    <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-700" : "text-slate-300"}`}>اسحب مهمة هنا</p>
                  </div>
                )}
                {activeColTasks.map((task, i) => {
                  const pri = PRIORITY_CONFIG[task.priority];
                  return (
                    <motion.div key={task.id}
                      layout
                      layoutId={`case-task-${task.id}`}
                      draggable
                      onDragStart={() => onTaskDragStart(task.id)}
                      onDragEnd={() => { dragId.current = null; setDragOverCol(null); }}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                      className={`group ${card} p-3.5 hover:border-royal/20 transition-all cursor-grab active:cursor-grabbing ${
                        task.status === "done" ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2.5 mb-2">
                        {/* Toggle button */}
                        <button
                          onClick={() => toggleCaseTask(task.id)}
                          className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                            task.status === "done"
                              ? "bg-emerald-500 border-emerald-500"
                              : task.status === "inprogress"
                              ? "border-amber-400"
                              : isDark ? "border-zinc-600 hover:border-royal" : "border-slate-300 hover:border-royal"
                          }`}
                        >
                          {task.status === "done" && <CheckCircle size={10} weight="fill" className="text-white" />}
                          {task.status === "inprogress" && <Circle size={6} weight="fill" className="text-amber-400" />}
                        </button>
                        <p className={`text-[13px] font-semibold leading-snug line-clamp-2 flex-1 ${
                          task.status === "done" ? "line-through opacity-60" : isDark ? "text-zinc-100" : "text-slate-800"
                        }`}>{task.title}</p>
                        <button
                          onClick={e => { e.stopPropagation(); openEdit(task); }}
                          className={`opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all flex-shrink-0 ${isDark ? "hover:bg-white/[0.06] text-zinc-600 hover:text-zinc-300" : "hover:bg-slate-100 text-slate-400 hover:text-slate-600"}`}
                          title="تحرير"
                        >
                          <DotsThree size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap pr-6">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${pri.badge}`}>{pri.label}</span>
                        <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                          <Clock size={9} className="inline ml-0.5" />{task.due}
                        </span>
                      </div>
                      <div className={`mt-2 pt-2 border-t flex items-center gap-1.5 ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
                        <div className={`w-5 h-5 rounded-lg text-[10px] font-bold flex items-center justify-center ${
                          isDark ? "bg-royal/20 text-royal" : "bg-royal/10 text-royal"
                        }`}>
                          {task.assignee.split(" ").pop()?.charAt(0)}
                        </div>
                        <p className={`text-[10px] truncate ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{task.assignee}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Edit Task Modal ── */}
      <AnimatePresence>
        {editingTaskId && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget) setEditingTaskId(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 20, opacity: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
              className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${
                isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className={`text-[15px] font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}>
                  <PencilSimple size={16} className="text-royal" /> تحرير المهمة
                </h3>
                <button onClick={() => setEditingTaskId(null)}
                  className={`w-8 h-8 flex items-center justify-center rounded-full ${
                    isDark ? "bg-white/10 hover:bg-white/20" : "bg-slate-100 hover:bg-slate-200"
                  }`}>
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-[11px] font-bold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>عنوان المهمة</label>
                  <input
                    value={editForm.title}
                    onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
                      isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-slate-50 text-slate-800"
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-[11px] font-bold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>الحالة</label>
                    <select
                      value={editForm.status}
                      onChange={e => setEditForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
                      className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
                        isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-slate-50 text-slate-800"
                      }`}
                    >
                      <option value="todo">لم تبدأ</option>
                      <option value="inprogress">قيد التنفيذ</option>
                      <option value="done">مكتملة</option>
                    </select>
                  </div>
                  <div>
                    <label className={`block text-[11px] font-bold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>الأولوية</label>
                    <select
                      value={editForm.priority}
                      onChange={e => setEditForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                      className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
                        isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-slate-50 text-slate-800"
                      }`}
                    >
                      <option value="high">عالية 🔴</option>
                      <option value="medium">متوسطة 🟡</option>
                      <option value="low">منخفضة ⚪️</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={`block text-[11px] font-bold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>المكلَّف</label>
                  <input
                    value={editForm.assignee}
                    onChange={e => setEditForm(f => ({ ...f, assignee: e.target.value }))}
                    className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
                      isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-slate-50 text-slate-800"
                    }`}
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={saveEdit}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-bold bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] text-[#C8A762] hover:shadow-lg transition-all">
                    حفظ التعديل
                  </button>
                  <button
                    onClick={() => {
                      setCaseTasks(prev => prev.filter(t => t.id !== editingTaskId));
                      setEditingTaskId(null);
                    }}
                    className={`px-4 py-2.5 rounded-xl text-[13px] font-bold border transition-colors ${
                      isDark ? "border-red-500/30 text-red-400 hover:bg-red-500/10" : "border-red-200 text-red-500 hover:bg-red-50"
                    }`}>
                    حذف
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── 3. Hearings Pane ────────────────────────────────────────────────────────
interface HearingsPaneProps {
  isDark: boolean;
  caseData: CaseDetail;
}

export function HearingsPane({ isDark, caseData }: HearingsPaneProps) {
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          {caseData.hearings.length} جلسات مسجّلة
        </p>
        <button className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"}`}>
          <Plus size={12} weight="bold" />إضافة جلسة
        </button>
      </div>
      {caseData.hearings.map((h, i) => (
        <motion.div key={i}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
          className={`${card} p-4 flex items-start gap-4 ${h.status === "upcoming" ? "border-l-4 border-l-royal" : ""}`}>
          <div className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${h.status === "upcoming" ? "bg-royal/10" : isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
            {h.status === "upcoming"
              ? <Clock size={18} weight="duotone" className="text-royal" />
              : <CheckCircle size={18} weight="duotone" className="text-emerald-500" />}
            <span className={`text-[9px] font-bold mt-0.5 ${h.status === "upcoming" ? "text-royal" : "text-emerald-500"}`}>
              {h.status === "upcoming" ? "قادمة" : "منتهية"}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{h.date}</p>
              <span className={`text-[10px] px-2 py-0.5 rounded-md ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{h.court}</span>
            </div>
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{h.result}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── 4. Documents Pane ───────────────────────────────────────────────────────
interface DocumentsPaneProps {
  isDark: boolean;
  caseData: CaseDetail;
}

export function DocumentsPane({ isDark, caseData }: DocumentsPaneProps) {
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{caseData.documents.length} مستندات</p>
        <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"}`}>
          <UploadSimple size={12} />رفع مستند<input type="file" className="hidden" />
        </label>
      </div>
      {caseData.documents.map((doc, i) => (
        <motion.div key={i}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
          className={`group ${card} p-4 flex items-center gap-3 hover:border-royal/20 transition-all`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${doc.type === "pdf" ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"}`}>
            <FileText size={18} weight="duotone" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{doc.name}</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{doc.size} · {doc.date}</p>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Eye size={14} /></button>
            <button className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Download size={14} /></button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── 5. Team Pane ────────────────────────────────────────────────────────────
interface TeamPaneProps {
  isDark: boolean;
  caseData: CaseDetail;
}

export function TeamPane({ isDark, caseData }: TeamPaneProps) {
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          {caseData.team.length} أعضاء في الفريق
        </p>
      </div>
      {caseData.team.map((m, i) => {
        const memberTasks = caseData.tasks.filter(t => t.assignee === m.name);
        const doneTasks = memberTasks.filter(t => t.status === "done").length;
        return (
          <motion.div key={i}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`${card} p-4`}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-royal/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[17px] font-bold text-royal">{m.avatar}</span>
              </div>
              <div className="flex-1">
                <p className={`text-[14px] font-semibold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{m.name}</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{m.role}</p>
              </div>
              <div className="text-left">
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                  {doneTasks}/{memberTasks.length}
                </p>
                <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مهام مكتملة</p>
              </div>
            </div>
            {memberTasks.length > 0 && (
              <div className={`mt-3 pt-3 border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
                <div className="space-y-1.5">
                  {memberTasks.slice(0, 3).map((t, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TASK_STATUS[t.status].dot}`} />
                      <p className={`text-[11px] truncate ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{t.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── 6. Graph Pane ───────────────────────────────────────────────────────────
interface GraphPaneProps {
  isDark: boolean;
  caseData: CaseDetail;
  caseGraphNodes: { nodes: any[]; edges: any[] };
}

export function GraphPane({ isDark, caseData, caseGraphNodes }: GraphPaneProps) {
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const [graphFullscreen, setGraphFullscreen] = useState(false);

  return (
    <div className={`${card} overflow-hidden`} style={{ height: "580px" }}>
      <div className={`p-3 border-b flex items-center gap-2 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
        <Graph size={14} weight="duotone" className="text-royal" />
        <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
          الجراف البصري للقضية — {caseData.title}
        </p>
        <span className={`text-[10px] px-2 py-0.5 rounded-full mr-auto ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#C8A762]/10 text-[#C8A762]"}`}>
          نظامي AI
        </span>
        <button
          onClick={() => setGraphFullscreen(f => !f)}
          className={`p-1.5 rounded-xl transition-colors ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}
          title="ملء الشاشة"
        >
          <ArrowsOut size={14} />
        </button>
      </div>
      <div className="h-[calc(100%-48px)]">
        <CaseGraphView
          isDark={isDark}
          isGlobal={false}
          initialNodes={caseGraphNodes.nodes}
          initialEdges={caseGraphNodes.edges}
        />
      </div>
      {/* Fullscreen Overlay */}
      {graphFullscreen && (
        <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: isDark ? "#0f0f0f" : "#f8f8f8" }}>
          <div className={`flex items-center gap-3 p-3 border-b ${isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-200 bg-white"}`}>
            <Graph size={15} weight="duotone" className="text-royal" />
            <p className={`text-[13px] font-semibold flex-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
              {caseData.title} — الجراف البصري
            </p>
            <button onClick={() => setGraphFullscreen(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors ${
                isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/10" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}>
              <ArrowsIn size={13} /> خروج
            </button>
          </div>
          <div className="flex-1">
            <CaseGraphView
              isDark={isDark}
              isGlobal={false}
              initialNodes={caseGraphNodes.nodes}
              initialEdges={caseGraphNodes.edges}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 7. Notes Pane ───────────────────────────────────────────────────────────
interface NotesPaneProps {
  isDark: boolean;
  caseData: CaseDetail;
}

export function NotesPane({ isDark, caseData }: NotesPaneProps) {
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const [noteInput, setNoteInput] = useState("");

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <p className={`text-[12px] font-semibold mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>ملاحظة جديدة</p>
        <textarea
          value={noteInput}
          onChange={e => setNoteInput(e.target.value)}
          placeholder="اكتب ملاحظتك هنا..."
          rows={3}
          className={`w-full text-sm bg-transparent outline-none resize-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`}
        />
        <div className="flex justify-end mt-2">
          <button onClick={() => setNoteInput("")} disabled={!noteInput.trim()}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors disabled:opacity-40">
            حفظ الملاحظة
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {caseData.notes.map((note, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className={`${card} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-royal/10 flex items-center justify-center">
                  <span className="text-[11px] font-bold text-royal">{note.author.split(" ").pop()?.charAt(0)}</span>
                </div>
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{note.author}</p>
              </div>
              <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{note.date}</p>
            </div>
            <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{note.text}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
