"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, Clock, Circle, Archive,
  CaretRight, Scales, Trash,
  ChartLine, Briefcase, Timer, ArrowLeft, TrendUp, TrendDown, Target,
  PencilSimple, Plus, X, Note,
} from "@phosphor-icons/react";
import Link from "next/link";
import { PRIORITY_CONFIG, CATEGORY_CONFIG } from "../_data";
import type { Task, TaskStatus } from "../_types";
import type { BenchmarkItem, PerformanceContext, PerformanceSnapshot } from "../../_data/performance";
import { getBenchmarkSummary, getPerformanceContextLabel } from "../../_data/performance";

// ─── TaskCard ──────────────────────────────────────────────────────────────────

export function TaskCard({
  task, isDark, onToggle, onDelete, onArchive, onStatusChange,
  draggable, onDragStart, onDragEnd,
  onSubtaskToggle, onEditSave,
}: {
  task: Task; isDark: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
  draggable?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  onSubtaskToggle?: (taskId: string, subtaskId: string) => void;
  onEditSave?: (taskId: string, patch: Partial<Task>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // ── Edit form ────────────────────────────────────────────────────────────────
  const [editTitle, setEditTitle]       = useState(task.title);
  const [editNotes, setEditNotes]       = useState((task as any).notes ?? "");
  const [editPriority, setEditPriority] = useState(task.priority);
  const [editSubtasks, setEditSubtasks] = useState(task.subtasks ? [...task.subtasks] : []);
  const [newSubInput, setNewSubInput]   = useState("");

  const openEdit = () => {
    setEditTitle(task.title);
    setEditNotes((task as any).notes ?? "");
    setEditPriority(task.priority);
    setEditSubtasks(task.subtasks ? [...task.subtasks] : []);
    setNewSubInput("");
    setEditOpen(true);
  };

  const addSubtask = () => {
    const t = newSubInput.trim();
    if (!t) return;
    setEditSubtasks(prev => [...prev, { id: `ns-${Date.now()}`, title: t, done: false }]);
    setNewSubInput("");
  };

  const removeSubtask    = (id: string) => setEditSubtasks(prev => prev.filter(s => s.id !== id));
  const toggleEditSub    = (id: string) => setEditSubtasks(prev => prev.map(s => s.id === id ? { ...s, done: !s.done } : s));

  const saveEdit = () => {
    onEditSave?.(task.id, {
      title: editTitle,
      priority: editPriority,
      subtasks: editSubtasks,
      ...(editNotes !== undefined ? { notes: editNotes } : {}),
    } as any);
    setEditOpen(false);
  };

  const priority = PRIORITY_CONFIG[task.priority];
  const category = CATEGORY_CONFIG[task.category];
  const CatIcon  = category.icon;
  const isDone   = task.status === "done";

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        draggable={draggable}
        onDragStart={() => onDragStart?.(task.id)}
        onDragEnd={onDragEnd}
        className={`group rounded-2xl border px-4 py-3.5 transition-all hover:shadow-md ${isDone ? "opacity-55" : ""}
          ${isDark
            ? "bg-zinc-900/70 border-white/[0.06] hover:border-white/10"
            : "bg-white border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:border-royal/20"
          } ${task.priority === "urgent" || task.priority === "high" ? priority.bg : ""}`}
      >
        {/* Main row */}
        <div className="flex items-center gap-3"
          onClick={() => task.subtasks?.length && setExpanded(v => !v)}
          style={{ cursor: task.subtasks?.length ? "pointer" : "default" }}>

          {/* Checkbox */}
          <button onClick={e => { e.stopPropagation(); onToggle(task.id); }}
            className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isDone
              ? "bg-emerald-500 border-emerald-500"
              : task.status === "in_progress"
                ? "border-amber-400"
                : isDark ? "border-zinc-600 hover:border-royal" : "border-slate-300 hover:border-royal"
            }`}>
            {isDone && <CheckCircle size={12} weight="fill" className="text-white" />}
            {task.status === "in_progress" && <Circle size={8} weight="fill" className="text-amber-400" />}
          </button>

          {/* Category icon */}
          <span className={`flex-shrink-0 ${category.color} opacity-70`}>
            <CatIcon size={14} weight="duotone" />
          </span>

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <p className={`text-[14px] font-semibold leading-snug line-clamp-2 ${isDone ? "line-through opacity-60" : ""} ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              {task.title}
            </p>
            {task.caseRef && task.caseId && (
              <Link href={`/dashboard/lawyer/cases/${task.caseId}`} onClick={e => e.stopPropagation()}
                className={`text-[11px] flex items-center gap-1 mt-0.5 transition-colors hover:underline ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-royal"}`}>
                <Scales size={10} /> {task.caseRef}
              </Link>
            )}
            {task.caseRef && !task.caseId && (
              <p className={`text-[11px] flex items-center gap-1 mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                <Scales size={10} /> {task.caseRef}
              </p>
            )}
            {(task as any).notes && (
              <p className={`text-[11px] mt-0.5 line-clamp-1 flex items-center gap-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                <Note size={10} /> {(task as any).notes}
              </p>
            )}
          </div>

          {/* Priority dot */}
          <span className={`flex-shrink-0 w-2 h-2 rounded-full ${priority.dot}`} title={priority.label} />

          {/* Due */}
          {task.due && (
            <span className={`flex-shrink-0 text-[10px] flex items-center gap-1 ${task.due.includes("اليوم") ? "text-red-500 font-bold" : isDark ? "text-zinc-600" : "text-slate-400"}`}>
              <Clock size={10} /> {task.due}
            </span>
          )}

          {/* Expand toggle */}
          {!!task.subtasks?.length && (
            <button onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
              className={`flex-shrink-0 p-1 rounded-lg transition-colors ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-300 hover:text-slate-500"}`}>
              <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                <CaretRight size={12} />
              </motion.span>
            </button>
          )}

          {/* Hover actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={e => { e.stopPropagation(); openEdit(); }}
              className={`p-1.5 rounded-lg transition-all ${isDark ? "hover:bg-white/[0.06] text-zinc-500 hover:text-[#C8A762]" : "hover:bg-slate-100 text-slate-300 hover:text-royal"}`}
              title="تحرير">
              <PencilSimple size={12} />
            </button>
            <button onClick={e => { e.stopPropagation(); setTracking(!tracking); }}
              className={`p-1.5 rounded-lg transition-all border ${tracking ? "border-red-500 bg-red-500/10 text-red-500 animate-pulse" : isDark ? "border-transparent text-zinc-600 hover:border-white/[0.05] hover:bg-white/[0.05]" : "border-transparent text-slate-300 hover:border-slate-200 hover:bg-slate-50"}`}
              title="تتبع الوقت">
              <Clock size={12} weight={tracking ? "fill" : "regular"} />
            </button>
            {task.status !== "archived" && (
              <button onClick={e => { e.stopPropagation(); onArchive(task.id); }}
                className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-white/[0.06] text-zinc-600 hover:text-zinc-300" : "hover:bg-slate-100 text-slate-300 hover:text-slate-500"}`}
                title="أرشفة">
                <Archive size={12} />
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); onDelete(task.id); }}
              className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-red-500/10 text-zinc-700 hover:text-red-400" : "hover:bg-red-50 text-slate-300 hover:text-red-400"}`}>
              <Trash size={12} />
            </button>
          </div>
        </div>

        {/* Subtasks (read + toggle) */}
        <AnimatePresence>
          {expanded && task.subtasks && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mt-2 pt-2 border-t border-dashed">
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                خطوات العمل ({task.subtasks.filter(s => s.done).length}/{task.subtasks.length})
              </p>
              <div className={`h-1 rounded-full mb-2 overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                <motion.div className="h-full bg-royal rounded-full"
                  animate={{ width: `${(task.subtasks.filter(s => s.done).length / task.subtasks.length) * 100}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
              <div className="space-y-1.5">
                {task.subtasks.map(sub => (
                  <button key={sub.id}
                    onClick={e => { e.stopPropagation(); onSubtaskToggle?.(task.id, sub.id); }}
                    className={`w-full flex items-center gap-2 text-[12px] rounded-lg px-1.5 py-1 transition-all group/sub ${
                      onSubtaskToggle ? (isDark ? "hover:bg-white/[0.04] cursor-pointer" : "hover:bg-slate-50 cursor-pointer") : "cursor-default"
                    } ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                      sub.done
                        ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                        : isDark ? "border border-zinc-600 group-hover/sub:border-emerald-500/50" : "border border-slate-300 group-hover/sub:border-emerald-400/60"
                    }`}>
                      {sub.done && <CheckCircle size={9} weight="fill" className="text-white" />}
                    </div>
                    <span className={`text-start leading-tight ${sub.done ? "line-through opacity-50" : ""}`}>{sub.title}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Edit Modal ── */}
      <AnimatePresence>
        {editOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setEditOpen(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 24, opacity: 0 }}
              transition={{ type: "spring", stiffness: 130, damping: 20 }}
              className={`w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
              dir="rtl"
            >
              {/* Header */}
              <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-royal/10 flex items-center justify-center">
                    <PencilSimple size={14} className="text-royal" />
                  </div>
                  <h3 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>تحرير المهمة</h3>
                </div>
                <button onClick={() => setEditOpen(false)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? "bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400" : "bg-slate-100 hover:bg-slate-200 text-slate-500"}`}>
                  <X size={14} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

                {/* Title */}
                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>عنوان المهمة</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-[14px] font-medium outline-none transition-colors ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-100 focus:border-royal/40" : "border-slate-200 bg-slate-50 text-slate-800 focus:border-royal/40"}`}
                    placeholder="اكتب عنوان المهمة..." />
                </div>

                {/* Notes */}
                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>ملاحظات / وصف</label>
                  <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-[13px] outline-none resize-none transition-colors ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300 focus:border-royal/40 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-700 focus:border-royal/40 placeholder:text-slate-400"}`}
                    placeholder="أضف وصفاً أو ملاحظة للمهمة..." />
                </div>

                {/* Priority */}
                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>الأولوية</label>
                  <div className="flex gap-2">
                    {(["urgent", "high", "normal", "low"] as const).map(p => {
                      const cfg = PRIORITY_CONFIG[p];
                      return (
                        <button key={p} onClick={() => setEditPriority(p)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-[11px] font-bold transition-all ${
                            editPriority === p
                              ? `${cfg.color} border-current bg-current/10`
                              : isDark ? "border-white/[0.06] text-zinc-600 hover:text-zinc-400" : "border-slate-200 text-slate-400 hover:border-slate-300"
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Subtasks */}
                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    خطوات العمل ({editSubtasks.filter(s => s.done).length}/{editSubtasks.length})
                  </label>

                  {editSubtasks.length > 0 && (
                    <div className={`h-1 rounded-full mb-3 overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                      <motion.div className="h-full bg-royal rounded-full"
                        animate={{ width: `${editSubtasks.length > 0 ? (editSubtasks.filter(s => s.done).length / editSubtasks.length) * 100 : 0}%` }}
                        transition={{ type: "spring", stiffness: 120, damping: 20 }}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {editSubtasks.map(sub => (
                      <div key={sub.id} className={`flex items-center gap-2.5 py-1.5 px-2 rounded-xl group/sub ${isDark ? "bg-white/[0.03] hover:bg-white/[0.05]" : "bg-slate-50 hover:bg-slate-100"}`}>
                        <button onClick={() => toggleEditSub(sub.id)}
                          className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-all ${sub.done ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" : isDark ? "border border-zinc-600 hover:border-emerald-500/50" : "border border-slate-300 hover:border-emerald-400"}`}>
                          {sub.done && <CheckCircle size={9} weight="fill" className="text-white" />}
                        </button>
                        <span className={`flex-1 text-[12px] ${sub.done ? "line-through opacity-50" : ""} ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                          {sub.title}
                        </span>
                        <button onClick={() => removeSubtask(sub.id)}
                          className={`opacity-0 group-hover/sub:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded-lg ${isDark ? "hover:bg-red-500/10 text-zinc-600 hover:text-red-400" : "hover:bg-red-50 text-slate-300 hover:text-red-400"}`}>
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add subtask */}
                  <div className={`flex items-center gap-2 mt-2 rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.06] bg-zinc-800/60" : "border-slate-200 bg-slate-50"}`}>
                    <Plus size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} />
                    <input value={newSubInput} onChange={e => setNewSubInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addSubtask()}
                      placeholder="أضف خطوة جديدة... (Enter للإضافة)"
                      className={`flex-1 text-[12px] bg-transparent outline-none ${isDark ? "text-zinc-300 placeholder:text-zinc-700" : "text-slate-700 placeholder:text-slate-400"}`} />
                    <button onClick={addSubtask}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${newSubInput.trim() ? "bg-royal text-white" : isDark ? "text-zinc-700 cursor-default" : "text-slate-300 cursor-default"}`}>
                      إضافة
                    </button>
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className={`px-6 py-4 border-t flex gap-3 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                <button onClick={saveEdit}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] text-[#C8A762] hover:shadow-lg transition-all">
                  حفظ التعديلات
                </button>
                <button onClick={() => setEditOpen(false)}
                  className={`px-5 py-2.5 rounded-xl text-[13px] font-medium border transition-colors ${isDark ? "border-white/[0.06] text-zinc-400 hover:bg-white/[0.05]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── TaskGamification ─────────────────────────────────────────────────────────

const formatDelta = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}س`;

export function TaskGamification({
  snapshot, benchmarks, context, isDark,
}: {
  snapshot: PerformanceSnapshot;
  benchmarks: BenchmarkItem[];
  context: PerformanceContext;
  isDark: boolean;
}) {
  const surface = isDark
    ? "bg-zinc-900/60 border border-white/[0.06]"
    : "bg-white border border-slate-200/70 shadow-[0_20px_40px_-18px_rgba(15,23,42,0.10)]";
  const subtleBorder = isDark ? "border-white/[0.06]" : "border-slate-100";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  const text = isDark ? "text-zinc-100" : "text-slate-800";
  const maxHours = Math.max(snapshot.hours, ...benchmarks.map(item => item.avgHours), 1);
  const hourDelta = snapshot.hours - snapshot.previousHours;
  const trendUp = hourDelta >= 0;
  const summary = getBenchmarkSummary(snapshot, benchmarks);

  const kpis = [
    { label: "ساعات العمل",    value: snapshot.hours.toFixed(1), unit: "س",     icon: Clock,        color: "#0B3D2E" },
    { label: "المهام المنجزة", value: String(snapshot.tasks),    unit: "مهمة",  icon: CheckCircle,  color: "#10b981" },
    { label: "القضايا النشطة", value: String(snapshot.cases),    unit: "قضية",  icon: Briefcase,    color: "#C8A762" },
    { label: "جلسات بومودورو", value: String(snapshot.pomodoros),unit: "جلسة",  icon: Timer,        color: "#6366f1" },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.03 }}
      className={`${surface} rounded-[1.75rem] p-5`}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-stretch">
        <div className={`xl:w-[250px] xl:border-l xl:pl-5 ${subtleBorder}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[11px] font-black uppercase tracking-widest ${muted}`}>سجل الأداء</p>
              <h3 className={`mt-1 text-[17px] font-bold ${text}`}>ملخص الإنتاجية</h3>
              <p className={`mt-1 text-[11px] ${muted}`}>{getPerformanceContextLabel(context)}</p>
            </div>
            <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${trendUp ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
              {trendUp ? <TrendUp size={11} weight="bold" /> : <TrendDown size={11} weight="bold" />}
              <span className="font-mono">{formatDelta(hourDelta)}</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-end gap-2">
              <span className={`font-mono text-[38px] font-black leading-none ${text}`}>{snapshot.productivity}</span>
              <span className={`pb-1 text-[13px] font-bold ${muted}`}>%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${snapshot.productivity}%` }}
                transition={{ type: "spring", stiffness: 80, damping: 18 }}
                className="h-full rounded-full"
                style={{ backgroundColor: snapshot.level.color }}
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Target size={14} weight="duotone" style={{ color: snapshot.level.color }} />
              <div>
                <p className="text-[12px] font-bold" style={{ color: snapshot.level.color }}>{snapshot.level.label}</p>
                <p className={`text-[10px] ${muted}`}>{snapshot.level.description}</p>
              </div>
            </div>
          </div>
        </div>

        <div className={`grid flex-1 grid-cols-2 overflow-hidden rounded-2xl border md:grid-cols-4 ${subtleBorder}`}>
          {kpis.map(({ label, value, unit, icon: Icon, color }, index) => (
            <div key={label} className={`p-4 ${index !== 0 ? `border-r ${subtleBorder}` : ""} ${index > 1 ? `border-t md:border-t-0 ${subtleBorder}` : ""}`}>
              <div className="mb-2 flex items-center gap-1.5">
                <Icon size={14} weight="duotone" style={{ color }} />
                <span className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>{label}</span>
              </div>
              <div className="flex items-end gap-1">
                <span className={`font-mono text-[24px] font-black leading-none ${text}`}>{value}</span>
                <span className={`pb-0.5 text-[11px] font-bold ${muted}`}>{unit}</span>
              </div>
            </div>
          ))}
        </div>

        <div className={`xl:w-[320px] xl:border-r xl:pr-5 ${subtleBorder}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>مقارنة سياقية</p>
              <p className={`mt-0.5 text-[12px] font-bold ${text}`}>{summary}</p>
            </div>
            <ChartLine size={18} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          </div>
          <Link href="/dashboard/lawyer/profile?tab=performance"
            className={`mb-4 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition-colors ${isDark ? "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.09]" : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328]"}`}>
            عرض التحليل الكامل
            <ArrowLeft size={13} weight="bold" />
          </Link>
          <div className="space-y-2.5">
            {benchmarks.map(item => {
              const userPct = Math.min((snapshot.hours / maxHours) * 100, 100);
              const avgPct  = Math.min((item.avgHours / maxHours) * 100, 100);
              const ahead   = snapshot.hours >= item.avgHours;
              return (
                <div key={item.id}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`text-[11px] font-semibold ${text}`}>{item.label}</span>
                    <span className={`font-mono text-[10px] font-bold ${ahead ? "text-emerald-500" : "text-red-500"}`}>
                      {formatDelta(snapshot.hours - item.avgHours)}
                    </span>
                  </div>
                  <div className={`relative h-2 overflow-hidden rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${avgPct}%` }}
                      transition={{ type: "spring", stiffness: 70, damping: 18 }}
                      className={`absolute inset-y-0 right-0 rounded-full ${isDark ? "bg-zinc-700" : "bg-slate-300"}`} />
                    <motion.div initial={{ width: 0 }} animate={{ width: `${userPct}%` }}
                      transition={{ type: "spring", stiffness: 70, damping: 18, delay: 0.08 }}
                      className="absolute inset-y-0 right-0 rounded-full"
                      style={{ backgroundColor: ahead ? "#0B3D2E" : "#ef4444" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
