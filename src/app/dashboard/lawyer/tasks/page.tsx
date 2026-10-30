"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, CheckCircle, Kanban, List,
  Archive, ArrowCounterClockwise,
  Trophy, Timer,
  Warning, ArrowClockwise, CircleNotch, Info,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import EmptyState from "@/components/ui/EmptyState";
import {
  updateLawyerTaskStatus,
  updateLawyerTask,
  updateLawyerTaskSubtasks,
  getTaskAssigneeOptions,
  type LawyerTask,
  type TaskAssigneeOption,
} from "@/lib/services/lawyerTasksService";
import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { SHARED_CASES } from "@/lib/casesStore";
import { useUser } from "@/hooks/useUser";
import { useRiyadhToday } from "@/hooks/useRiyadhToday";
import ReactConfetti from "react-confetti";

// Internal
import type { Task, TaskStatus, TaskCategory, ViewMode, KanbanGroupBy, Priority } from "./_types";
import { KANBAN_COLS, CATEGORY_CONFIG, playSuccessBeep } from "./_data";
import { TaskCard } from "./_components/TaskCard";
import PomodoroPanel from "./_components/PomodoroPanel";
import TaskFilterBar from "./_components/TaskFilterBar";
import { usePomodoroEngine, usePomodoroClock, type PomodoroEngine } from "./_components/_pomodoro/usePomodoroEngine";
import {
  DEFAULT_TASK_FILTERS, visibleTasks, groupTasks, dateFilterPending, activeFilterChips,
  type TaskFilters, type DueSection,
} from "./_components/taskFilters";
import { createRowWriteQueue, revertFields, confirmFields } from "./_components/taskWrites";
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

// Section headings for the list and the kanban. Which tasks go in each comes
// from taskFilters.ts (groupTasks) — this is only how a section is labelled.
const PRIORITY_SECTION: Record<Priority, { label: string; color: string }> = {
  urgent: { label: "عاجل 🔴",    color: "text-red-500" },
  high:   { label: "عالية 🟠",   color: "text-amber-500" },
  normal: { label: "عادية 🔵",   color: "text-blue-500" },
  low:    { label: "منخفضة ⚪️", color: "text-slate-400" },
};
const DUE_SECTION: Record<DueSection, { label: string; color: string }> = {
  overdue:   { label: "متأخرة ⚠️",         color: "text-red-500" },
  today:     { label: "اليوم 📌",           color: "text-orange-500" },
  week:      { label: "هذا الأسبوع",        color: "text-amber-500" },
  later:     { label: "لاحقاً",             color: "text-slate-400" },
  nodate:    { label: "بلا تاريخ",          color: "text-slate-400" },
  past_done: { label: "مضى موعدها — مكتملة", color: "text-emerald-500" },
};

function sectionMeta(groupBy: KanbanGroupBy, key: string, archive: boolean): { label: string; color: string } {
  if (archive) return { label: "الأرشيف", color: "text-amber-500" };
  if (groupBy === "status") {
    const col = KANBAN_COLS.find(c => c.status === key);
    return { label: col?.label ?? key, color: col?.color ?? "" };
  }
  if (groupBy === "priority") return PRIORITY_SECTION[key as Priority];
  if (groupBy === "category") {
    const c = CATEGORY_CONFIG[key as TaskCategory];
    return { label: c.label, color: c.color };
  }
  return DUE_SECTION[key as DueSection];
}

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

/** The open period's clock on the «مؤقت التركيز» button — its own component,
 *  so only it re-renders each second, not the whole board. */
function TimerChipClock({ engine }: { engine: PomodoroEngine }) {
  const left = usePomodoroClock(engine);
  return <span className="font-mono tabular-nums">{mmss(left)}</span>;
}

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
  // A plain-information line (not an error): where an archived task went.
  const [notice, setNotice] = useState<string | null>(null);
  // True when the server holds more tasks than TASKS_FETCH_LIMIT returned.
  // Phase 1's own acceptance test for this route was "a lawyer adds 60 tasks
  // and sees 60" — raising the old silent 50-row cap is only half of that;
  // the other half is telling the lawyer when a limit was ever hit at all.
  const [truncated, setTruncated] = useState(false);

  // CODE-F10 / LIVE-F27 / UX09: every filter in one object, applied once by
  // `visibleTasks` below. The old `filter` status state (never set by any
  // control) and the separate priority/category states with no UI at all are
  // gone — the priority and category filters now have their controls in the
  // «فلاتر» panel.
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_TASK_FILTERS);
  const [view, setView] = useState<ViewMode>("list");
  const [kanbanGroup, setKanbanGroup] = useState<KanbanGroupBy>("status");
  const [showAddModal, setShowAddModal] = useState(false);
  const [achievementTitle, setAchievementTitle] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const achieveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // LIVE-F38: «اليوم» is Riyadh's calendar day, read after mount and re-read at
  // Riyadh midnight and on tab return — not `toISOString()` (the UTC day, a
  // day behind Riyadh from 21:00 UTC), and never `useState(new Date())` (the
  // SSR cache would freeze it). "" until known.
  const today = useRiyadhToday();

  const [winSize, setWinSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    setWinSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => setWinSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ─── The board, and its write discipline (CODE-F11) ─────────────────────────
  // `tasksRef` is the latest list, kept in step with every commit, so a
  // handler computes its payload from it OUTSIDE any state updater — see
  // _components/taskWrites.ts for why the old in-updater pattern dropped
  // writes (LIVE-F26). `confirmedRef` is the last state the SERVER accepted,
  // per task: what a failed write rolls back to.
  const tasksRef = useRef<Task[]>([]);
  const confirmedRef = useRef(new Map<string, Task>());
  const writesRef = useRef(createRowWriteQueue());

  const commitTasks = useCallback((next: Task[]) => {
    tasksRef.current = next;
    setTasks(next);
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
      const mapped = data.map((d): Task => ({
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
        assigneeUserId: d.assigneeUserId || undefined,
        assigneeName: d.assigneeName || undefined,
      }));
      confirmedRef.current = new Map(mapped.map(t => [t.id, t]));
      commitTasks(mapped);
      setLoadState("ready");
    } catch (err) {
      console.error("[tasks] failed to load tasks:", err);
      setLoadState("error");
    }
  }, [commitTasks]);

  // Wrapped rather than `void loadTasks()` so the fetch is not a synchronous call
  // out of the effect body — same shape as src/components/ui/CasePicker.tsx.
  useEffect(() => { (async () => { await loadTasks(); })(); }, [loadTasks]);

  // «المحامي المُكلَّف» picker options for every card's edit form, read once
  // here rather than once per card. null (not read, or failed) hides the picker.
  const [assigneeOptions, setAssigneeOptions] = useState<TaskAssigneeOption[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const options = await getTaskAssigneeOptions();
      if (!cancelled) setAssigneeOptions(options);
    })();
    return () => { cancelled = true; };
  }, []);

  // AddTaskModal dispatches this once the server has CONFIRMED the insert.
  useEffect(() => {
    const onUpdated = () => { void loadTasks(); };
    window.addEventListener("nzamy-workflow-updated", onUpdated);
    return () => window.removeEventListener("nzamy-workflow-updated", onUpdated);
  }, [loadTasks]);

  const showAchievement = useCallback((title: string) => {
    setAchievementTitle(title);
    setShowConfetti(true);
    if (achieveTimer.current) clearTimeout(achieveTimer.current);
    achieveTimer.current = setTimeout(() => {
      setAchievementTitle(null);
      setShowConfetti(false);
    }, 4000);
  }, []);

  // ─── Focus timer (CODE-F07 / F08 / F09, LIVE-F17) ───────────────────────────
  // Owned HERE, not by PomodoroPanel: the panel unmounts when «مؤقت التركيز»
  // is closed, and the engine used to die with it. The period, its task and
  // the outbox of finished periods are stored under the signed-in user's id.
  const { userId, loading: userLoading } = useUser();
  const pomodoroScope = !isSupabaseMode ? "demo" : userLoading ? null : (userId ?? null);
  const pomodoro = usePomodoroEngine({ scope: pomodoroScope, useServer: isSupabaseMode && !!userId });
  const { startForTask } = pomodoro;
  const timerOpenOn = pomodoro.phase !== "idle" ? pomodoro.linkedTaskId : null;
  const timerOpenTitle = pomodoro.linkedTaskTitle;

  // CODE-F07: a card's «تتبع الوقت» drives that one engine for that task.
  const onTrackTime = useCallback((task: Task) => {
    const result = startForTask({ id: task.id, title: task.title });
    setShowPomodoro(true);
    if (result === "busy") {
      setSaveError(`مؤقت التركيز يعمل الآن على «${timerOpenTitle || "مهمة أخرى"}» — أنهِ تلك الفترة أولاً من لوحة المؤقت.`);
    }
  }, [startForTask, timerOpenTitle]);

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

  // ─── The ONE visible list (CODE-F10 / LIVE-F27) ─────────────────────────────
  // Every filter, applied once; the list sections, the kanban columns, their
  // counters and the result count are all cut from `visible`, so the list and
  // the kanban cannot disagree. While the day is not read yet, a date filter
  // (or the «الموعد» grouping) waits instead of showing everything.
  const archivedCaseIds = new Set(
    SHARED_CASES.filter(c => c.status === "archived" || c.status === "closed").map(c => c.id)
  );
  const dayPending = dateFilterPending(filters, today) || (kanbanGroup === "due" && !today);
  const visible = dayPending ? [] : visibleTasks(tasks, filters, { today, archivedCaseIds });
  const poolCount = visibleTasks(tasks, { ...DEFAULT_TASK_FILTERS, showArchive: filters.showArchive }, { today, archivedCaseIds }).length;
  const sections = groupTasks(visible, kanbanGroup, { today, archive: filters.showArchive });
  const filtersActive = activeFilterChips(filters).length > 0;

  // ─── Actions ────────────────────────────────────────────────────────────────
  //
  // CODE-F11: one path for every optimistic write. The new value is computed
  // from `tasksRef` here — never inside a state updater, whose body React may
  // run only at the next render, after the request was (not) sent. Writes to
  // one task go out one at a time in click order; a failure rolls back only
  // the fields no later click has touched since, to the last value the server
  // confirmed. Resolves true once the server accepted it.
  //
  // `optimistic: false` (the edit form): nothing changes on screen until the
  // server accepts. An optimistic edit that changed the priority under
  // «التجميع: الأولوية», or stopped matching an active filter, MOVED its card
  // to another section — remounting the TaskCard that holds the open editor,
  // which closed it mid-save and lost the draft if the save then failed.
  const writeFields = useCallback(async (
    taskId: string,
    patch: Partial<Task>,
    send: () => Promise<boolean>,
    failMessage: string | null,
    opts: { optimistic?: boolean } = {},
  ): Promise<boolean> => {
    if (!tasksRef.current.some(t => t.id === taskId)) return false;
    const optimistic = opts.optimistic !== false;
    const fields = Object.keys(patch) as (keyof Task)[];
    const token = writesRef.current.begin(taskId, fields);
    if (optimistic) commitTasks(tasksRef.current.map(t => (t.id === taskId ? { ...t, ...patch } : t)));

    // The service functions resolve false rather than throw; a throw is a
    // failure too.
    const ok = await writesRef.current.enqueue(taskId, send).catch(() => false);
    const confirmed = confirmedRef.current.get(taskId);
    if (ok) {
      if (confirmed) confirmedRef.current.set(taskId, confirmFields(confirmed, patch));
      if (!optimistic) {
        // Apply now — only the fields no later click has claimed since.
        const owned = writesRef.current.ownedFields(token);
        commitTasks(tasksRef.current.map(t => (t.id === taskId ? revertFields(t, { ...t, ...patch }, owned) : t)));
      }
      return true;
    }
    if (!optimistic) return false; // nothing was shown, so nothing to roll back
    const owned = writesRef.current.ownedFields(token);
    if (owned.length > 0 && confirmed) {
      commitTasks(tasksRef.current.map(t => (t.id === taskId ? revertFields(t, confirmed, owned) : t)));
      if (failMessage) setSaveError(failMessage);
    }
    return false;
  }, [commitTasks]);

  const onToggle = useCallback(async (id: string) => {
    const current = tasksRef.current.find(t => t.id === id);
    if (!current) return;
    const next: TaskStatus = current.status === "done" ? "todo" : "done";
    const ok = await writeFields(id, { status: next }, () => updateLawyerTaskStatus(id, next), "تعذّر تحديث حالة المهمة. أعد المحاولة.");
    // CODE-F11: the beep and the confetti only once the server confirmed it —
    // they used to fire on the click, before a refusal rolled the tick back.
    if (ok && next === "done") {
      playSuccessBeep();
      showAchievement(current.title || "تم إنجاز المهمة!");
    }
  }, [writeFields, showAchievement]);

  // CODE-F12: archiving is the one removal there is — the route has no
  // delete. The «حذف» buttons that used to sit beside «أرشفة» sent this same
  // status and then dropped the row locally, so a "deleted" task reappeared in
  // the archive after a reload. They are gone; the notice says where it went.
  const onArchive = useCallback(async (id: string) => {
    const ok = await writeFields(id, { status: "archived" }, () => updateLawyerTaskStatus(id, "archived"), "تعذّرت أرشفة المهمة. أعد المحاولة.");
    if (ok) setNotice("نُقلت المهمة إلى «الأرشيف» — يمكنك عرضها واستعادتها من هناك.");
  }, [writeFields]);

  const onRestore = useCallback(async (id: string) => {
    const ok = await writeFields(id, { status: "todo" }, () => updateLawyerTaskStatus(id, "todo"), "تعذّرت استعادة المهمة. أعد المحاولة.");
    if (ok) setNotice("استُعيدت المهمة إلى «معلقة».");
  }, [writeFields]);

  const onStatusChange = useCallback((id: string, s: TaskStatus) => {
    void writeFields(id, { status: s }, () => updateLawyerTaskStatus(id, s), "تعذّر تحديث حالة المهمة. أعد المحاولة.");
  }, [writeFields]);

  // LIVE-F26: ticking a step showed 1/1 and came back 0/1 after a reload,
  // with no error. The route → task_steps upsert is correct; the most likely
  // cause (inferred from "no error + reverts on reload", not observed) is that
  // the request was never sent: `next` was assigned inside the setTasks
  // updater, which React may not have run yet when `if (!next) return;` read
  // it — this was the only handler whose payload came solely from the
  // updater. Computed here instead.
  // The whole checklist goes back as one array; the server upserts it by step
  // id and prunes what is no longer in it.
  const onSubtaskToggle = useCallback((taskId: string, subtaskId: string) => {
    const current = tasksRef.current.find(t => t.id === taskId);
    if (!current) return;
    const next = (current.subtasks ?? []).map(s => (s.id === subtaskId ? { ...s, done: !s.done } : s));
    void writeFields(taskId, { subtasks: next }, () => updateLawyerTaskSubtasks(taskId, next), "تعذّر حفظ خطوة العمل. أعد المحاولة.");
  }, [writeFields]);

  // The edit form's save: only the keys it sent are persisted. CODE-F12:
  // returns the outcome, and is NOT optimistic — the card keeps its place (and
  // its open editor) until the server answers; on a refusal the form stays
  // open with the typed text and shows its own error.
  const onEditSave = useCallback((taskId: string, patch: Partial<Task>): Promise<boolean> => {
    const send = () => updateLawyerTask(taskId, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.subtasks !== undefined ? { subtasks: patch.subtasks } : {}),
      ...(patch.assigneeUserId !== undefined ? { assigneeUserId: patch.assigneeUserId } : {}),
    }).then(res => res.ok);
    return writeFields(taskId, patch, send, null, { optimistic: false });
  }, [writeFields]);

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
  // A dropped card goes through the same write path as every other status
  // change — `updateLawyerTaskStatus` resolves false on failure rather than
  // rejecting, so a `.catch()` alone never rolled a refused drag back.
  const onDrop = useCallback((targetStatus: TaskStatus) => {
    const id = dragId.current;
    dragId.current = null;
    setDragOverCol(null);
    if (!id) return;
    const current = tasksRef.current.find(t => t.id === id);
    if (!current || current.status === targetStatus) return;
    void writeFields(id, { status: targetStatus }, () => updateLawyerTaskStatus(id, targetStatus), "تعذّر نقل المهمة. أعد المحاولة.");
  }, [writeFields]);

  const renderCard = (task: Task, extra?: { draggable?: boolean }) => (
    <TaskCard task={task} isDark={isDark}
      onToggle={onToggle} onArchive={onArchive}
      onStatusChange={onStatusChange}
      onSubtaskToggle={onSubtaskToggle}
      onEditSave={onEditSave}
      assigneeOptions={assigneeOptions}
      timeTracking={timerOpenOn === task.id ? { running: pomodoro.running } : null}
      onTrackTime={onTrackTime}
      draggable={extra?.draggable}
      onDragStart={extra?.draggable ? onDragStart : undefined}
      onDragEnd={() => { dragId.current = null; }} />
  );

  const emptyState = (
    <EmptyState
      icon={<CheckCircle />}
      title="لا توجد مهام"
      description={filtersActive
        ? "لا توجد مهام تطابق الفلاتر الحالية — امسحها لتظهر كل مهامك."
        : "لا توجد مهام في هذا العرض بعد."}
      action={filtersActive
        ? { label: "مسح الفلاتر", onClick: () => setFilters(DEFAULT_TASK_FILTERS) }
        : { label: "إضافة مهمة", onClick: () => setShowAddModal(true) }}
    />
  );

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
      {/* Save error — an optimistic write the server refused, rolled back */}
      {saveError && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[12px] font-semibold text-red-500">
          <Warning size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{saveError}</span>
          <button onClick={() => setSaveError(null)} className="opacity-70 hover:opacity-100">إخفاء</button>
        </motion.div>
      )}
      {notice && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-semibold ${isDark ? "border-white/[0.08] bg-white/[0.04] text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          <Info size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{notice}</span>
          {!filters.showArchive && notice.includes("الأرشيف") && (
            <button onClick={() => { setFilters(f => ({ ...f, showArchive: true })); setNotice(null); }} className="font-black underline underline-offset-2">عرض الأرشيف</button>
          )}
          <button onClick={() => setNotice(null)} className="opacity-70 hover:opacity-100">إخفاء</button>
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

      {/* A period that ran out while the timer panel was closed still says so. */}
      <AnimatePresence>
        {pomodoro.notif && !showPomodoro && (
          <motion.button
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            onClick={() => setShowPomodoro(true)}
            className="fixed top-5 left-5 z-[9998] flex items-center gap-2 rounded-2xl px-4 py-3 text-[12px] font-bold shadow-2xl bg-emerald-600 text-white">
            <Timer size={16} weight="fill" />
            {pomodoro.notif === "focus" ? "اكتملت فترة التركيز" : "انتهت الاستراحة"}
          </motion.button>
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
            {/* Pomodoro toggle — shows the open period's clock while the panel is closed */}
            <motion.button whileTap={{ scale: 0.95 }}
              onClick={() => setShowPomodoro(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold transition-all ${
                showPomodoro
                  ? "bg-[#0B3D2E] text-[#C8A762] border-[#0B3D2E]"
                  : pomodoro.phase !== "idle"
                    ? isDark ? "border-[#C8A762]/40 text-[#C8A762]" : "border-[#0B3D2E]/40 text-[#0B3D2E]"
                    : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-500 hover:border-[#0B3D2E]/20 hover:text-[#0B3D2E]"
              }`}>
              <Timer size={13} weight={showPomodoro || pomodoro.running ? "fill" : "regular"} className={pomodoro.running && !showPomodoro ? "animate-pulse" : ""} />
              مؤقت التركيز
              {pomodoro.phase !== "idle" && !showPomodoro && (
                <TimerChipClock engine={pomodoro} />
              )}
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
                <button key={mode} onClick={() => setView(mode)} title={title} aria-label={title} aria-pressed={view === mode}
                  className={`px-3 py-2 flex items-center gap-1 text-[11px] font-bold transition-all ${
                    view === mode ? isDark ? "bg-white/[0.08] text-white" : "bg-[#0B3D2E] text-white" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
                  }`}>
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>
      </motion.div>

      {/* Empty state (T28-15) — below the header now, so «أعلاه» is true: it
          used to render ABOVE the page title while pointing «أعلاه» at a
          button that was actually below it. */}
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

      {/* Pomodoro Panel — يظهر أولاً عند التفعيل. Only the VIEW mounts and
          unmounts here; the engine lives on this page (LIVE-F17). */}
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
              engine={pomodoro}
              tasks={tasks.filter(t => t.status !== "archived" && t.status !== "done").map(t => ({ id: t.id, title: t.title }))}
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

      {/* Filters — UX09: search + «الكل/اليوم/الأسبوع» always visible, every
          other filter in one «فلاتر» panel, then the result count, one chip per
          active filter and «مسح الفلاتر». The priority legend that used to be
          its own row is the priority filter's chips now (same dots). */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <TaskFilterBar
          filters={filters}
          onChange={setFilters}
          groupBy={kanbanGroup}
          onGroupChange={setKanbanGroup}
          resultCount={loadState === "ready" && !dayPending ? visible.length : null}
          poolCount={loadState === "ready" && !dayPending ? poolCount : null}
          archivedCount={countsKnown ? counts.archived : null}
          isDark={isDark}
        />
      </motion.div>

      {(loadState === "loading" || (loadState === "ready" && dayPending)) && (
        <div className={`${card} p-12 flex flex-col items-center gap-3`}>
          <CircleNotch size={24} weight="bold" className={`animate-spin ${isDark?"text-zinc-600":"text-slate-300"}`}/>
          <p className={`text-sm ${isDark?"text-zinc-500":"text-slate-400"}`}>جارٍ تحميل مهامك…</p>
        </div>
      )}

      {/* ── List View (grouped) — also the archive view, in both modes ── */}
      {loadState === "ready" && !dayPending && (view === "list" || filters.showArchive) && (() => {
        const nonEmpty = sections.filter(s => s.tasks.length > 0);
        if (nonEmpty.length === 0) return emptyState;

        return (
          <div className="space-y-5">
            {nonEmpty.map(sec => {
              const meta = sectionMeta(kanbanGroup, sec.key, filters.showArchive);
              return (
              <div key={sec.key}>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${meta.color}`}>{meta.label} <span className={`ml-1 ${isDark?"text-zinc-600":"text-slate-400"}`}>({toArabicDigits(sec.tasks.length)})</span></p>
                <div className="space-y-1.5">
                  {sec.tasks.map((task,i)=>(
                    <motion.div key={task.id} layout initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:i*0.02}}>
                      {task.status==="archived" ? (
                        <div className={`group rounded-2xl border px-4 py-3 flex items-center gap-3 opacity-70 hover:opacity-90 transition-all ${isDark?"bg-zinc-900/40 border-white/[0.04]":"bg-slate-50 border-slate-100"}`}>
                          <Archive size={14} className={isDark?"text-zinc-600":"text-slate-400"}/>
                          <p className={`text-[13px] font-medium line-through truncate flex-1 ${isDark?"text-zinc-500":"text-slate-400"}`}>{task.title}</p>
                          {/* Visible on touch (no hover there); hover/focus-revealed from md up. */}
                          <button onClick={()=>{ void onRestore(task.id); }} className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 ${isDark?"bg-white/[0.06] text-zinc-300 hover:bg-white/[0.10]":"bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}>
                            <ArrowCounterClockwise size={11}/> استعادة
                          </button>
                        </div>
                      ) : renderCard(task)}
                    </motion.div>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Kanban View (Bento 2.0 & Liquid Glass) ──
          LIVE-F27: no AnimatePresence `popLayout` and no shared `layoutId`
          on the cards any more. The column counter and its cards were already
          one array, so a column reading «١» above two cards is most likely
          (inferred, not reproduced) a card a filter had removed, kept on
          screen by its exit animation — the task due 1 Nov seen in «اليوم».
          The cards rendered are now exactly `col.tasks`, the same array the
          counter reads, and the groupings no longer bypass the filters. */}
      {loadState === "ready" && !dayPending && view === "kanban" && !filters.showArchive && (
        <div className="space-y-4">
          {visible.length === 0 && emptyState}
          <div className="flex gap-6 overflow-x-auto pb-4 pt-2 snap-x snap-mandatory hide-scrollbar">
            {(()=>{
              const isDraggable = kanbanGroup==="status";
              const cols = sections.filter(c => c.tasks.length > 0 || kanbanGroup === "status");
              if (visible.length === 0) return null;
              return cols.map((col, index) => {
                const meta = sectionMeta(kanbanGroup, col.key, false);
                return (
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
                  style={{ minWidth: 300, width: "min(360px, 85vw)" }}
                  onDragOver={e=>{e.preventDefault();if(isDraggable){e.dataTransfer.dropEffect="move";setDragOverCol(col.key as TaskStatus);}}}
                  onDrop={e=>{
                    e.preventDefault(); // Firefox otherwise navigates to the dropped text/plain
                    if(!isDraggable)return;
                    // The card's dragstart set both; the dataTransfer copy is the fallback.
                    if(!dragId.current)dragId.current=e.dataTransfer.getData("text/plain")||null;
                    onDrop(col.key as TaskStatus);
                  }}
                >
                  <div className="absolute inset-0 pointer-events-none opacity-[0.015] bg-[url('/noise.svg')]" />

                  <div className={`flex items-center gap-3 px-6 py-5 border-b ${isDark?"border-white/[0.04]":"border-slate-100"} relative z-10`}>
                    <div className="flex-1">
                      <h3 className={`text-[12px] font-black uppercase tracking-widest ${meta.color}`}>{meta.label}</h3>
                    </div>
                    <span
                      className={`text-[12px] font-bold px-3 py-1 rounded-full backdrop-blur-md ${isDark?"bg-white/[0.04] text-zinc-400 border border-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]":"bg-slate-50 text-slate-500 border border-slate-200/60 shadow-sm"}`}>
                      {toArabicDigits(col.tasks.length)}
                    </span>
                  </div>

                  <div className="p-4 space-y-4 min-h-[300px] relative z-10">
                    {col.tasks.map(task=>(
                      <motion.div
                        key={task.id}
                        initial={{ opacity: 0, scale: 0.97, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 120, damping: 20 }}
                      >
                        {renderCard(task, { draggable: isDraggable })}
                      </motion.div>
                    ))}
                    {col.tasks.length===0&&(
                      <div
                        className={`flex flex-col items-center justify-center py-12 rounded-[2rem] border border-dashed ${isDark?"border-white/[0.04] bg-white/[0.01]":"border-slate-200 bg-slate-50/50"}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${isDark?"bg-white/[0.02]":"bg-white shadow-sm"}`}>
                          <CheckCircle size={20} className={isDark?"text-zinc-700":"text-slate-300"} weight="duotone"/>
                        </div>
                        <p className={`text-[11px] font-semibold ${isDark?"text-zinc-600":"text-slate-400"}`}>منطقة خالية</p>
                      </div>
                    )}
                  </div>
                </motion.div>
                );
              });
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
