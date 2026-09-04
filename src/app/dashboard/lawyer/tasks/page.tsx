"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, CheckCircle, Kanban, List,
  Archive, ArrowCounterClockwise, Trash,
  Trophy,
  FolderOpen, CalendarBlank, CalendarDot, CalendarCheck, ChartBar, CalendarStar, Timer,
  Warning, ArrowClockwise, CircleNotch, MagnifyingGlass,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import EmptyState from "@/components/ui/EmptyState";
import {
  updateLawyerTaskStatus,
  updateLawyerTask,
  updateLawyerTaskSubtasks,
  type LawyerTask,
} from "@/lib/services/lawyerTasksService";
import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { SHARED_CASES } from "@/lib/casesStore";
import ReactConfetti from "react-confetti";

// Internal
import type { Task, TaskStatus, TaskCategory, ViewMode, TimeRange, KanbanGroupBy, Priority } from "./_types";
import { KANBAN_COLS, CATEGORY_CONFIG, PRIORITY_CONFIG, today, playSuccessBeep } from "./_data";
import { TaskCard } from "./_components/TaskCard";
import PomodoroPanel from "./_components/PomodoroPanel";
import AddTaskModal from "../_components/AddTaskModal";
import { toArabicDigits } from "@/lib/services/arabicCount";

// No status translation here any more. Until 2026-09-03 this file carried a
// `taskStatusToDb` mapper to the OLD service_requests enum (todo →
// pending_assignment, done → completed, …). The Phase 1 tasks rewrite made
// `public.tasks.status` the UI vocabulary itself and deleted the shared mapper
// — but this page-local copy survived, so every status change on this page
// (mark done, archive, restore, the dropdown, drag between columns) was sent
// as the old word and refused by the route with a 400, rolled back, and shown
// as «تعذّر تحديث حالة المهمة». Caught by an independent re-verification the
// same day, before deploy. `updateLawyerTaskStatus` now takes the union type,
// so a wrong word here is a type error, not a runtime 400.

// How many of the lawyer's tasks to read for the board. The route defaults to
// the same 200 server-side; passed explicitly so a change to one default
// cannot silently disagree with the other.
const TASKS_FETCH_LIMIT = 200;

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LawyerTasksPage() {
  const { isDark } = useTheme();
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  // Loading / could-not-read / read-and-genuinely-empty. The page used to have
  // only `loading`, so a failed query rendered as a positive statement that the
  // lawyer has no tasks.
  // Demo mode has no store behind /api/v1/lawyer/tasks, so there is nothing to
  // wait for and an empty board there is the truth, not a pending read.
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">(
    isSupabaseMode ? "loading" : "ready",
  );
  // A write that the server refused must say so — every handler below is
  // optimistic, so a silent failure looks exactly like a save.
  const [saveError, setSaveError] = useState<string | null>(null);
  // True when the server holds more tasks than TASKS_FETCH_LIMIT returned.
  // Phase 1's own acceptance test for this route was "a lawyer adds 60 tasks
  // and sees 60" — raising the old silent 50-row cap is only half of that;
  // the other half is telling the lawyer when a limit was ever hit at all.
  const [truncated, setTruncated] = useState(false);

  const [filter, setFilter] = useState<TaskStatus | "all" | "archived">("all");
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | "all">("all");
  const [priority,  setPriority]  = useState<Priority | "all">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  // Client-side title search — the empty state has claimed a "أو البحث" fallback
  // since before this filter existed; this makes that claim true.
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [kanbanGroup, setKanbanGroup] = useState<KanbanGroupBy>("status");
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

  // ─── Fetch tasks ────────────────────────────────────────────────────────────
  // NOT getLawyerTasks(): that wrapper existed to survive a route that used to
  // swallow failures into `[]`; the route no longer does that, but calling
  // apiGet directly here still means the throw always reaches this page even
  // if the wrapper's own error handling ever regresses. apiGet throws on any
  // non-2xx, which is the whole point.
  // No setState before the first await — the retry button sets "loading" itself,
  // and a refetch after a save keeps the current board on screen.
  const loadTasks = useCallback(async () => {
    if (!isSupabaseMode) return;
    try {
      const res = await apiGet<{ data: LawyerTask[]; total?: number }>("/api/v1/lawyer/tasks", {
        limit: TASKS_FETCH_LIMIT,
      });
      const data = res.data ?? [];
      setTruncated((res.total ?? data.length) > data.length);
      setTasks(data.map((d): Task => ({
        id: d.id,
        title: d.title || "",
        // `d.category`, not `d.type`. The route derives `category` from
        // metadata.category (route.ts:98-101) and returns `type` as the raw DB
        // row type, which is always "service" for a task — so reading `type`
        // here made every task fall back to «قضية» no matter what the lawyer
        // picked, and the التصنيف filter could never match the others.
        category: (d.category === "case" || d.category === "document" || d.category === "admin" || d.category === "deadline" || d.category === "client" ? d.category : "case") as TaskCategory,
        priority: (d.priority === "urgent" || d.priority === "high" || d.priority === "normal" || d.priority === "low" ? d.priority : "normal") as Priority,
        status: (d.status === "todo" || d.status === "in_progress" || d.status === "done" || d.status === "archived" ? d.status : "todo") as TaskStatus,
        dueDate: d.dueDate || undefined,
        caseId: d.caseId || undefined,
        caseRef: d.caseRef || undefined,
        notes: d.notes || undefined,
        subtasks: d.subtasks || [],
      })));
      setLoadState("ready");
    } catch (err) {
      console.error("[tasks] failed to load tasks:", err);
      setLoadState("error");
    }
  }, []);

  // Wrapped rather than `void loadTasks()` so the fetch is not a synchronous call
  // out of the effect body — same shape as src/components/ui/CasePicker.tsx.
  useEffect(() => { (async () => { await loadTasks(); })(); }, [loadTasks]);

  // AddTaskModal dispatches this once the server has CONFIRMED the insert.
  useEffect(() => {
    const onUpdated = () => { void loadTasks(); };
    window.addEventListener("nzamy-workflow-updated", onUpdated);
    return () => window.removeEventListener("nzamy-workflow-updated", onUpdated);
  }, [loadTasks]);

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

  /**
   * True only when there is a board behind these numbers.
   *
   * `counts` is derived from `tasks`, which is `[]` both before the first fetch
   * resolves and after one fails — so every count above is 0 in three states
   * and only one of them means the lawyer has no tasks. The subtitle printed
   * «٠ معلقة · ٠ قيد التنفيذ · ٠ مكتملة» directly under the red
   * «تعذّر قراءة مهامك» banner: a figure asserted on the very screen that
   * admits its source could not be read.
   *
   * Withheld, not zeroed — «٠» is a claim, and on a task board it is the claim
   * "you have nothing outstanding". Same flag the client requests page uses
   * (dashboard/client/requests/page.tsx:606).
   */
  const countsKnown = loadState === "ready";

  const shouldShowArchived = filter === "archived" || showArchive;
  const archivedCaseIds = new Set(
    SHARED_CASES.filter(c => c.status === "archived" || c.status === "closed").map(c => c.id)
  );

  const base = shouldShowArchived
    ? archived
    : active
        .filter(t => filter === "all" || t.status === filter)
        .filter(t => !t.caseId || !archivedCaseIds.has(t.caseId));

  const cutoff = timeRangeCutoff(timeRange);
  // Title search — client-side only, over the tasks already on the board.
  const searchQuery = search.trim().toLowerCase();
  const matchesSearch = (t: Task) => !searchQuery || t.title.toLowerCase().includes(searchQuery);
  // The «priority»/«النوع»/«الموعد» groupings (list and kanban) build their
  // sections straight off `active`/`archived` rather than through
  // `kanbanTasks`, so the search has to be applied here too — otherwise
  // typing in the box only works while grouped by حالة المهمة.
  const activeVisible = active.filter(matchesSearch);
  const archivedVisible = archived.filter(matchesSearch);

  const filtered = base
    .filter(t => categoryFilter === "all" || t.category === categoryFilter)
    .filter(t => priority === "all" || t.priority === priority)
    .filter(matchesSearch)
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
      .filter(t => categoryFilter === "all" || t.category === categoryFilter)
      .filter(t => priority === "all" || t.priority === priority)
      .filter(matchesSearch)
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
  //
  // Every handler here is optimistic and follows one rule, because the two that
  // did not were silently broken: capture the PREVIOUS value inside the state
  // updater, then restore THAT if the server refuses. Reading `t.status` in the
  // rollback restores the value the optimistic write just put there, i.e.
  // nothing. And the service functions resolve `false` on failure rather than
  // rejecting, so a `.catch()` on them never runs — the check has to be on the
  // resolved boolean.
  const onToggle = useCallback((id: string) => {
    let newStatus: TaskStatus = "done";
    let previous: TaskStatus | undefined;
    setTasks(prev => {
      const current = prev.find(t => t.id === id);
      previous = current?.status;
      newStatus = current?.status === "done" ? "todo" : "done";
      return prev.map(t => (t.id === id ? { ...t, status: newStatus } : t));
    });
    // Persist the toggle (optimistic; rollback on failure). Map to DB enum.
    updateLawyerTaskStatus(id, newStatus).then(ok => {
      if (ok || !previous) return;
      const revertTo: TaskStatus = previous;
      setTasks(prev => prev.map(t => (t.id === id ? { ...t, status: revertTo } : t)));
      setSaveError("تعذّر تحديث حالة المهمة. أعد المحاولة.");
    });
    if (newStatus === "done") {
      playSuccessBeep();
      setTasks(prev => {
        const task = prev.find(t => t.id === id);
        showAchievement(task?.title ?? "تم إنجاز المهمة!");
        return prev;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDelete = useCallback((id: string) => {
    // L7: persist as cancelled (DB enum) alongside local removal.
    let removed: Task | undefined;
    let removedAt = 0;
    setTasks(prev => {
      removedAt = prev.findIndex(t => t.id === id);
      removed = removedAt >= 0 ? prev[removedAt] : undefined;
      return prev.filter(t => t.id !== id);
    });
    updateLawyerTaskStatus(id, "archived").then(ok => {
      if (ok || !removed) return;
      const restored: Task = removed;
      const at = removedAt;
      // Put the row back where it was — the list must not claim a deletion the
      // server refused.
      setTasks(prev => {
        if (prev.some(t => t.id === id)) return prev;
        const next = [...prev];
        next.splice(Math.max(0, Math.min(at, next.length)), 0, restored);
        return next;
      });
      setSaveError("تعذّر حذف المهمة. أعد المحاولة.");
    });
  }, []);
  const onArchive = useCallback((id: string) => {
    let previous: TaskStatus | undefined;
    setTasks(prev => {
      previous = prev.find(t => t.id === id)?.status;
      return prev.map(t => t.id === id ? { ...t, status: "archived" } : t);
    });
    updateLawyerTaskStatus(id, "archived").then(ok => {
      if (ok || !previous) return;
      const revertTo: TaskStatus = previous;
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: revertTo } : t));
      setSaveError("تعذّرت أرشفة المهمة. أعد المحاولة.");
    });
  }, []);
  const onRestore = useCallback((id: string) => {
    let previous: TaskStatus | undefined;
    setTasks(prev => {
      previous = prev.find(t => t.id === id)?.status;
      return prev.map(t => t.id === id ? { ...t, status: "todo" } : t);
    });
    updateLawyerTaskStatus(id, "todo").then(ok => {
      if (ok || !previous) return;
      const revertTo: TaskStatus = previous;
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: revertTo } : t));
      setSaveError("تعذّرت استعادة المهمة. أعد المحاولة.");
    });
  }, []);
  const onStatusChange = useCallback((id: string, s: TaskStatus) => {
    let previous: TaskStatus | undefined;
    setTasks(prev => {
      previous = prev.find(t => t.id === id)?.status;
      return prev.map(t => t.id === id ? { ...t, status: s } : t);
    });
    // Persist status change to backend (mapped to DB enum)
    updateLawyerTaskStatus(id, s).then(ok => {
      if (ok || !previous) return;
      // Revert to the status the task actually had before this click.
      const revertTo: TaskStatus = previous;
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: revertTo } : t));
      setSaveError("تعذّر تحديث حالة المهمة. أعد المحاولة.");
    });
  }, []);

  // Ticking a step used to be pure setState: it survived until the next reload.
  // The whole checklist is one metadata.subtasks array, so a tick sends the
  // array back whole; the server merges it over the task's other metadata keys
  // instead of replacing them.
  const onSubtaskToggle = useCallback((taskId: string, subtaskId: string) => {
    let previous: Task["subtasks"];
    let next: Task["subtasks"];
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      previous = t.subtasks;
      next = (t.subtasks ?? []).map(s => s.id === subtaskId ? { ...s, done: !s.done } : s);
      return { ...t, subtasks: next };
    }));
    if (!next) return;
    const sent = next;
    updateLawyerTaskSubtasks(taskId, sent).then(ok => {
      if (ok) return;
      const revertTo = previous;
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subtasks: revertTo } : t));
      setSaveError("تعذّر حفظ خطوة العمل. أعد المحاولة.");
    });
  }, []);

  // Same defect as the subtask toggle: the edit modal's «حفظ التعديلات» only
  // ever touched local state. Only the keys the modal actually sent are
  // persisted, and only those are rolled back.
  const onEditSave = useCallback((taskId: string, patch: Partial<Task>) => {
    let previous: Task | undefined;
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      previous = t;
      return { ...t, ...patch };
    }));

    updateLawyerTask(taskId, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.subtasks !== undefined ? { subtasks: patch.subtasks } : {}),
    }).then(res => {
      if (!previous) return;
      const before: Task = previous;

      // Phase 1: a task row is never secretly a client's own request any
      // more (that was the old service_requests sharing), so a title edit
      // here always lands — no titleSkipped case left to handle.
      if (res.ok) return;

      const revert: Partial<Task> = {};
      if (patch.title !== undefined) revert.title = before.title;
      if (patch.priority !== undefined) revert.priority = before.priority;
      if (patch.category !== undefined) revert.category = before.category;
      if (patch.dueDate !== undefined) revert.dueDate = before.dueDate;
      if (patch.notes !== undefined) revert.notes = before.notes;
      if (patch.subtasks !== undefined) revert.subtasks = before.subtasks;
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...revert } : t));
      setSaveError("تعذّر حفظ تعديلات المهمة. أعد المحاولة.");
    });
  }, []);

  // `addTask` and the inline «تفاصيل المهمة الجديدة» modal it served are gone.
  // That modal called this async function WITHOUT awaiting it and closed
  // immediately, its only failure handling was a console.error, and it cleared
  // the title the lawyer had typed either way — so a failed POST produced a
  // closed modal, an empty field, no row and no message. Its «الأولوية» row was
  // three buttons with no onClick at all: permanently styled as if «حرجة» and
  // «عاجل» were both selected, and never sent. ../_components/AddTaskModal
  // already does this correctly — it awaits the insert, only shows the success
  // screen once the server confirms, surfaces the Arabic error in place, sends
  // the priority and the due date, and disables the form mid-save.

  const onDragStart = useCallback((id: string) => { dragId.current = id; }, []);
  const onDrop = useCallback((targetStatus: TaskStatus) => {
    if (!dragId.current) return;
    const dragIdRef = dragId.current;
    // Capture original for rollback before optimistic update.
    let original: TaskStatus | undefined;
    setTasks(prev => {
      const current = prev.find(t => t.id === dragIdRef);
      original = current?.status;
      return prev.map(t => t.id === dragIdRef ? { ...t, status: targetStatus } : t);
    });
    // Was a `.catch()`, which was dead code: updateLawyerTaskStatus resolves
    // `false` on failure rather than rejecting (lawyerTasksService.ts:130-135),
    // exactly as the comment block above this section warns. A card dragged into
    // «مكتملة» against a failing PATCH stayed there, the header count moved, and
    // the task was still «معلقة» after a reload. Check the resolved boolean, the
    // way the other seven handlers in this file already do.
    updateLawyerTaskStatus(dragIdRef, targetStatus).then(ok => {
      if (ok || !original) return;
      const revertStatus: TaskStatus = original;
      setTasks(prev => prev.map(t => t.id === dragIdRef ? { ...t, status: revertStatus } : t));
      setSaveError("تعذّر نقل المهمة. أعد المحاولة.");
    });
    dragId.current = null;
    setDragOverCol(null);
  }, []);

  return (
    <div className="max-w-[1240px] mx-auto space-y-5 relative" dir="rtl">
      {/* Read state. This banner used to fire on `!loading && tasks.length === 0`
          — one condition for two completely different facts. An expired session,
          an offline browser or an RLS refusal each produced the sentence
          «لا توجد مهام بعد», a positive claim about the account, under a heading
          calling the (nonexistent) contents «بيانات تجريبية». */}
      {loadState === "error" && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-red-500/25 bg-red-900/10" : "border-red-200 bg-red-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-red-500/15" : "bg-red-100"}`}>
            <Warning size={18} weight="fill" className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[13px] font-bold ${isDark ? "text-red-400" : "text-red-700"}`}>تعذّر قراءة مهامك</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-red-600/70"}`}>
              هذه ليست قائمة فارغة — لم نتمكّن من قراءة المهام، وقد تكون لديك مهام لا تظهر هنا الآن.
            </p>
          </div>
          <button onClick={() => { setLoadState("loading"); void loadTasks(); }}
            className="flex items-center gap-1.5 flex-shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold bg-red-500 text-white hover:bg-red-600 transition">
            <ArrowClockwise size={13} weight="bold" />إعادة المحاولة
          </button>
        </motion.div>
      )}
      {truncated && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
            <Warning size={18} weight="fill" className="text-amber-500" />
          </div>
          <p className={`text-[12px] font-semibold ${isDark ? "text-amber-300" : "text-amber-800"}`}>
            {`لديك أكثر من ${toArabicDigits(TASKS_FETCH_LIMIT)} مهمة — يُعرض أحدثها فقط. استخدم الفلاتر أو الأرشفة لتقليل العدد الظاهر.`}
          </p>
        </motion.div>
      )}
      {loadState === "ready" && tasks.length === 0 && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-slate-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-white/[0.05]" : "bg-white"}`}>
            <CheckCircle size={18} weight="duotone" className={isDark ? "text-zinc-500" : "text-slate-400"} />
          </div>
          <div>
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا توجد مهام بعد</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>ابدأ بإضافة مهمة من زر «مهمة جديدة» أعلاه.</p>
          </div>
        </motion.div>
      )}
      {/* Save error — an optimistic write the server refused, rolled back */}
      {saveError && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[12px] font-semibold text-red-500">
          <Warning size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{saveError}</span>
          <button onClick={() => setSaveError(null)} className="opacity-70 hover:opacity-100">إخفاء</button>
        </motion.div>
      )}

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
            {loadState === "loading"
              ? "جارٍ تحميل مهامك…"
              : loadState === "error"
                ? <span className="text-red-500 font-semibold">تعذّر قراءة المهام</span>
                : <>
                    {toArabicDigits(counts.todo)} معلقة · {toArabicDigits(counts.in_progress)} قيد التنفيذ · {toArabicDigits(counts.done)} مكتملة
                    {counts.archived > 0 && ` · ${toArabicDigits(counts.archived)} مؤرشفة`}
                  </>}
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

      {/* The الكل / مهامي / مهام الفريق toggle used to sit here. It filtered on
          `t.ownerId`, which GET /api/v1/lawyer/tasks does not return and
          service_requests has no column for — so it was always undefined,
          «مهام الفريق» was permanently «لا توجد مهام» whatever the account held,
          and «مهامي» was indistinguishable from «الكل». The tab also carried two
          avatar circles built from a hardcoded pair of invented colleagues,
          implying a solo lawyer has a two-person team. There is no team
          membership in this product (zero firm accounts exist), so the control
          is removed rather than wired to something that does not exist. Every
          task the route returns is already this lawyer's own — it filters on
          `assigned_to = user.id`. */}

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
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The «سجل الأداء» panel used to sit here. Every number in it was a
          literal from ../_data/performance.ts — 4.7 ساعات, 3 مهام منجزة, 2 قضايا
          نشطة, 6 جلسات بومودورو, a 75% productivity dial, and
          «أنت في أعلى ٥٤٪ ضمن محامو المملكة», where the 54 is
          Math.round(((4.7 - 4.8) / 4.8) * 45 + 55) against an invented national
          average, and «الرياض» was hardcoded regardless of where the lawyer
          practises. Its «المهام المنجزة ٣» sat directly above this page's own
          real `counts.done`, contradicting it on screen.
          There is no hours-worked, no productivity and no peer-benchmark source
          anywhere in this product, so the panel is removed rather than
          zero-filled: a rendered 0 would be the same lie as a rendered 4.7.
          The Pomodoro timer above still runs — it just no longer feeds two
          points per session into a fabricated score. */}

      {/* Filters — one wrapping row (search, time range, grouping/archive)
          instead of separate stacked bars. Time range and grouping share the
          same pill container style, and the archive toggle now lives inside
          the grouping pill group with the same active/inactive look as its
          neighbours (it used to be a detached chip with its own amber
          highlight). Search is a plain field in the same row — the
          empty-state text below has always mentioned «البحث»; this is what
          makes that word true. */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
        className="flex items-center gap-2 flex-wrap">
        <div className={`flex items-center gap-2 flex-1 min-w-[200px] px-3 py-2 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في عناوين المهام..."
            className={`flex-1 bg-transparent text-[13px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <div className={`flex gap-1.5 overflow-x-auto pb-1 p-1 rounded-2xl w-fit max-w-full ${isDark ? "bg-zinc-800/60" : "bg-slate-100"}`}>
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
        </div>

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
          {/* A thin divider before Archive — same pill group and active style
              as the grouping tabs, but visually set apart so it does not
              read as a fifth grouping option. */}
          <span className={`w-px h-5 self-center mx-0.5 ${isDark ? "bg-white/10" : "bg-slate-300"}`} />
          <button onClick={()=>setShowArchive(v=>!v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold flex-shrink-0 transition-all ${
              showArchive?isDark?"bg-zinc-700 text-white":"bg-white text-[#0B3D2E] shadow-sm":isDark?"text-zinc-500 hover:text-zinc-300":"text-slate-400 hover:text-slate-600"
            }`}>
            <Archive size={12}/>
            {/* Label always, number only when there is a read behind it. */}
            الأرشيف {countsKnown&&counts.archived>0&&`(${toArabicDigits(counts.archived)})`}
          </button>
        </div>
      </motion.div>

      {/* Priority legend — the dot on each row (TaskCard.tsx) previously
          explained itself only via a hover `title`, invisible on a glance
          and on touch. */}
      <div className="flex items-center gap-3 flex-wrap px-1">
        <span className={`text-[10px] font-bold ${isDark?"text-zinc-600":"text-slate-400"}`}>الأولوية:</span>
        {(["urgent","high","normal","low"] as Priority[]).map(p=>(
          <span key={p} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[p].dot}`}/>
            <span className={`text-[10px] font-semibold ${isDark?"text-zinc-500":"text-slate-500"}`}>{PRIORITY_CONFIG[p].label}</span>
          </span>
        ))}
      </div>

      {loadState === "loading" && (
        <div className={`${card} p-12 flex flex-col items-center gap-3`}>
          <CircleNotch size={24} weight="bold" className={`animate-spin ${isDark?"text-zinc-600":"text-slate-300"}`}/>
          <p className={`text-sm ${isDark?"text-zinc-500":"text-slate-400"}`}>جارٍ تحميل مهامك…</p>
        </div>
      )}

      {/* ── List View (grouped) ── */}
      {loadState === "ready" && view === "list" && (() => {
        type GSection = {key:string;label:string;color:string;tasks:Task[]};
        let sections: GSection[] = [];

        if (showArchive) {
          sections = [{key:"archive",label:"الأرشيف",color:"text-amber-500",tasks:archivedVisible}];
        } else if (kanbanGroup==="status") {
          sections = KANBAN_COLS.map(c=>({key:c.status,label:c.label,color:c.color,tasks:kanbanTasks(c.status)}));
        } else if (kanbanGroup==="priority") {
          sections = [
            {key:"urgent",label:"عاجل 🔴",color:"text-red-500",   tasks:activeVisible.filter(t=>t.priority==="urgent")},
            {key:"high",  label:"عالية 🟠",color:"text-amber-500", tasks:activeVisible.filter(t=>t.priority==="high")},
            {key:"normal",label:"عادية 🔵",color:"text-blue-500",  tasks:activeVisible.filter(t=>t.priority==="normal")},
            {key:"low",   label:"منخفضة ⚪️",color:"text-slate-400", tasks:activeVisible.filter(t=>t.priority==="low")},
          ];
        } else if (kanbanGroup==="category") {
          sections = Object.entries(CATEGORY_CONFIG).map(([k,v])=>({
            key:k, label:v.label, color:v.color,
            tasks:activeVisible.filter(t=>t.category===k),
          }));
        } else {
          const todayStr = today();
          const inDays = (n:number)=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
          sections = [
            {key:"overdue",label:"متأخرة ⚠️",color:"text-red-500",   tasks:activeVisible.filter(t=>t.dueDate&&t.dueDate<todayStr&&t.status!=="done")},
            {key:"today",  label:"اليوم 📌",    color:"text-orange-500",tasks:activeVisible.filter(t=>t.dueDate===todayStr)},
            {key:"week",   label:"هذا الأسبوع",color:"text-amber-500", tasks:activeVisible.filter(t=>t.dueDate&&t.dueDate>todayStr&&t.dueDate<=inDays(7))},
            {key:"later",  label:"لاحقاً",     color:"text-slate-400", tasks:activeVisible.filter(t=>!t.dueDate||(t.dueDate>inDays(7)))},
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
      {loadState === "ready" && view === "kanban" && (
        <div className="space-y-4">
          <div className="flex gap-6 overflow-x-auto pb-4 pt-2 snap-x snap-mandatory hide-scrollbar">
            {(()=>{
              type KCol = {key:string;label:string;color:string;colBg:string;tasks:Task[]};
              let cols:KCol[] = [];
              if(kanbanGroup==="status") {
                cols = KANBAN_COLS.map(c=>({key:c.status,label:c.label,color:c.color,colBg:"",tasks:kanbanTasks(c.status)}));
              } else if(kanbanGroup==="priority") {
                cols = [
                  {key:"urgent", label:"عاجل 🔴",  color:"text-red-500",    colBg:"", tasks:activeVisible.filter(t=>t.priority==="urgent")},
                  {key:"high",   label:"عالية 🟠", color:"text-amber-500",  colBg:"", tasks:activeVisible.filter(t=>t.priority==="high")},
                  {key:"normal", label:"عادية 🔵",  color:"text-blue-500",   colBg:"", tasks:activeVisible.filter(t=>t.priority==="normal")},
                  {key:"low",    label:"منخفضة ⚪️", color:"text-slate-400",  colBg:"", tasks:activeVisible.filter(t=>t.priority==="low")},
                ];
              } else if(kanbanGroup==="category") {
                cols = Object.entries(CATEGORY_CONFIG).map(([k,v])=>({
                  key:k, label:v.label, color:v.color, colBg:"",
                  tasks:activeVisible.filter(t=>t.category===k),
                }));
              } else {
                const todayStr = new Date().toISOString().slice(0,10);
                const inDays = (n:number)=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
                cols = [
                  {key:"overdue", label:"متأخرة ⚠️", color:"text-red-500",   colBg:"", tasks:activeVisible.filter(t=>t.dueDate&&t.dueDate<todayStr&&t.status!=="done")},
                  {key:"today",   label:"اليوم 📌",     color:"text-orange-500",colBg:"", tasks:activeVisible.filter(t=>t.dueDate===todayStr)},
                  {key:"week",    label:"هذا الأسبوع", color:"text-amber-500", colBg:"", tasks:activeVisible.filter(t=>t.dueDate&&t.dueDate>todayStr&&t.dueDate<=inDays(7))},
                  {key:"later",   label:"لاحقاً",      color:"text-slate-400", colBg:"", tasks:activeVisible.filter(t=>!t.dueDate||(t.dueDate>inDays(7)))},
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

      {/* Add Task Modal — the shared component, not the inline copy that used to
          live here. See the note where `addTask` was: that copy closed without
          awaiting the save, swallowed the failure to the console, discarded the
          typed title, and rendered a three-button «الأولوية» row with no
          handlers that was never sent. This one confirms with the server first
          and refetches the board on success via `nzamy-workflow-updated`. */}
      <AnimatePresence>
        {showAddModal && (
          <AddTaskModal onClose={() => setShowAddModal(false)} isDark={isDark} />
        )}
      </AnimatePresence>
    </div>
  );
}
