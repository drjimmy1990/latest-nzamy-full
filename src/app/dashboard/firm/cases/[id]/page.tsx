"use client";

/**
 * Firm case file — rewritten 2026-09-03.
 *
 * WHAT CHANGED: this page used to be a static mock (CASE_INFO
 * «شركة الأفق ضد مؤسسة النور», TEAM_MEMBERS, TASKS, TIMELINE_EVENTS,
 * AI_SUGGESTION, an hours-breakdown bar chart) — none of it read the URL
 * `id`, so every firm case file on the platform rendered the same fake
 * lawsuit. Only the canvas tab was ever real. It now reads the SAME real
 * source as the lawyer case file (src/app/dashboard/lawyer/cases/[id]/
 * page.tsx): getServiceRequestDetail for the case itself, and the Phase 1
 * tables (public.hearings, public.tasks, public.case_stages) for the three
 * tabs that need their own lists. The loading states, retry wording, status
 * mapping, event labels and date formatting are copied from that file on
 * purpose — a firm user and a lawyer looking at the same case should read
 * the same facts in the same words.
 *
 * WHAT DID NOT COME BACK: the team strip (+ "assign member" button), the AI
 * assignment suggestion, the hours-per-member breakdown, and the chat tab.
 * None of them had a backend — no table ever recorded who worked how many
 * hours, no endpoint ever suggested a team member, and no chat channel
 * exists for a case. They are removed, not re-skinned, and nothing stands in
 * their place.
 *
 * FIRM-WIDE VISIBILITY: since migration 20260903_phase2 (run 2026-09-04) a
 * case created by an active firm member carries `service_requests.firm_id`,
 * and the firm's other active members — the owner is one automatically —
 * can read it under the "firm members read firm service requests" policy.
 * This page needs no code for that: getServiceRequestDetail goes through
 * RLS, so a firm account opening a member's case gets the row. Rows created
 * before the lawyer joined the firm have no firm_id and stay personal.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase, ArrowRight, CalendarCheck, Clock, Buildings,
  FileText, ChartLine, Plus, Download, UploadSimple,
  ArrowUpRight, CheckCircle, Warning, Scales,
  CheckSquare, FolderOpen, Eye, Graph, Spinner, ArrowClockwise, Timer,
  ChatDots, PencilSimple, Trash, User,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { orderReference } from "@/lib/services/orderReference";
import { caseEventLabel } from "@/lib/services/caseEventLabels";
import { countPhraseAr, type ArabicCountForms } from "@/lib/services/arabicCount";
import {
  itemsOf,
  listFailed,
  listOk,
  listViewState,
} from "@/lib/services/listRead";
import type { ListRead } from "@/lib/services/listRead";
import {
  getServiceRequestDetail,
  type ServiceRequestDetail,
  type ServiceRequestAttachment,
} from "@/lib/services/casesService";
import { getLawyerHearings, type HearingDto } from "@/lib/services/lawyerHearingsService";
import {
  getLawyerTasks,
  createLawyerTask,
  updateLawyerTaskStatus,
  type LawyerTask,
  type LawyerTaskStatus,
} from "@/lib/services/lawyerTasksService";
import { getCaseStages, type CaseStage } from "@/lib/services/caseStagesService";
import {
  getDeadlines,
  updateDeadline,
  type Deadline,
} from "@/lib/services/deadlinesService";
import {
  uploadDocumentFile,
  getDocumentFileUrl,
  isDocumentTimeoutError,
} from "@/lib/services/documentService";
import AddHearingModal from "../../../lawyer/_components/AddHearingModal";
import AddCaseStageModal from "../../../lawyer/_components/AddCaseStageModal";
import AddDeadlineModal from "../../../lawyer/_components/AddDeadlineModal";
import DeadlineCard from "../../../lawyer/_components/DeadlineCard";
import RecordStageOutcomeModal from "../../../lawyer/_components/RecordStageOutcomeModal";
import LegalCanvas from "./LegalCanvas";
import {
  getCaseNotes,
  addCaseNote,
  updateCaseNote,
  deleteCaseNote,
  type CaseNote,
  type CaseNoteVisibility,
} from "@/lib/services/caseNotesService";

// ─── Types ────────────────────────────────────────────────────────────────────

type CaseTab = "overview" | "tasks" | "hearings" | "stages" | "deadlines" | "documents" | "notes" | "canvas";
type CaseStatus = "active" | "pending" | "suspended" | "closed" | "cancelled";
type TaskStatus = "todo" | "inprogress" | "done";

interface HearingRow {
  date: string;
  court: string;
  result: string;
  status: "done" | "upcoming";
}

interface TimelineRow {
  event: string;
  date: string;
  icon: React.ElementType;
  color: string;
}

interface CaseTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  dueDate?: string | null;
  notes?: string;
  subtasks: { id: string; title: string; done: boolean }[];
}

// ─── Config — copied verbatim from the lawyer case file so both screens
// agree on labels and colors for the same underlying status/outcome. ──────────

const TABS: { id: CaseTab; label: string; icon: React.ElementType }[] = [
  { id: "overview",  label: "نظرة عامة",     icon: Briefcase },
  { id: "tasks",     label: "المهام",         icon: CheckSquare },
  { id: "hearings",  label: "الجلسات",        icon: CalendarCheck },
  { id: "stages",    label: "درجات التقاضي",  icon: Scales },
  { id: "deadlines", label: "المهل",          icon: Timer },
  { id: "documents", label: "المستندات",      icon: FolderOpen },
  { id: "notes",     label: "الملاحظات",      icon: ChatDots },
  { id: "canvas",    label: "خريطة القضية",   icon: Graph },
];

const STATUS_CONFIG: Record<CaseStatus, { label: string; color: string; dot: string }> = {
  active:    { label: "نشطة",   color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400 animate-pulse" },
  pending:   { label: "انتظار", color: "text-amber-500 bg-amber-500/10 border-amber-500/20",       dot: "bg-amber-400" },
  suspended: { label: "معلقة",  color: "text-blue-500 bg-blue-500/10 border-blue-500/20",          dot: "bg-blue-400" },
  closed:    { label: "مغلقة",  color: "text-slate-400 bg-slate-100 border-slate-200",             dot: "bg-slate-300" },
  cancelled: { label: "ملغاة",  color: "text-rose-500 bg-rose-500/10 border-rose-500/20",          dot: "bg-rose-400" },
};

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  pending:   { label: "قيد النظر", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  won:       { label: "كسب القضية", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  lost:      { label: "خسارة",     color: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
  partial:   { label: "حكم جزئي",  color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  settled:   { label: "تسوية",     color: "text-royal bg-royal/10 border-royal/20" },
  withdrawn: { label: "تنازل",     color: "text-slate-400 bg-slate-100 border-slate-200" },
};

const HEARINGS_COUNT: ArabicCountForms = {
  zero: "لا جلسات مسجّلة",
  one: "جلسة واحدة مسجّلة",
  two: "جلستان مسجّلتان",
  few: "جلسات مسجّلة",
  many: "جلسة مسجّلة",
};

const STAGES_COUNT: ArabicCountForms = {
  zero: "لا درجات تقاضٍ مسجّلة",
  one: "درجة تقاضٍ واحدة",
  two: "درجتا تقاضٍ",
  few: "درجات تقاضٍ",
  many: "درجة تقاضٍ",
};

const DEADLINES_COUNT: ArabicCountForms = {
  zero: "لا مهل مسجّلة",
  one: "مهلة واحدة",
  two: "مهلتان",
  few: "مهل",
  many: "مهلة",
};

const DOCUMENTS_COUNT: ArabicCountForms = {
  zero: "لا مستندات",
  one: "مستند واحد",
  two: "مستندان",
  few: "مستندات",
  many: "مستنداً",
};

const TASK_STATUS: Record<TaskStatus, { label: string; color: string; dot: string }> = {
  todo:       { label: "لم تبدأ",     color: "text-slate-500 bg-slate-100",         dot: "bg-slate-300" },
  inprogress: { label: "قيد التنفيذ", color: "text-blue-600 bg-blue-500/10",       dot: "bg-blue-400 animate-pulse" },
  done:       { label: "مكتملة",      color: "text-emerald-600 bg-emerald-500/10", dot: "bg-emerald-400" },
};

function toPageTaskStatus(apiStatus: string): TaskStatus {
  if (apiStatus === "in_progress") return "inprogress";
  if (apiStatus === "done") return "done";
  return "todo";
}
const PAGE_TO_API_STATUS: Record<TaskStatus, LawyerTaskStatus> = {
  todo: "todo",
  inprogress: "in_progress",
  done: "done",
};
const NEXT_TASK_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: "inprogress",
  inprogress: "done",
  done: "todo",
};

function toCaseTask(t: LawyerTask): CaseTask {
  return {
    id: t.id,
    title: t.title || "مهمة بدون عنوان",
    status: toPageTaskStatus(t.status),
    priority: t.priority || "normal",
    dueDate: t.dueDate ?? null,
    notes: t.notes,
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
  };
}

function mapStatus(s: string | undefined): CaseStatus {
  switch (s) {
    case "assigned":
    case "in_review":
      return "active";
    case "pending_payment":
    case "pending_assignment":
    case "draft":
      return "pending";
    case "completed":
      return "closed";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

function eventIcon(ev: string): React.ElementType {
  const e = ev.toLowerCase();
  if (e.includes("created") || e.includes("note") || e.includes("document")) return FileText;
  if (e.includes("status") || e.includes("assigned") || e.includes("updated")) return ArrowUpRight;
  if (e.includes("completed")) return CheckCircle;
  if (e.includes("cancelled")) return Warning;
  if (e.includes("hearing") || e.includes("session")) return CalendarCheck;
  return ChartLine;
}

function eventColor(ev: string): string {
  const e = ev.toLowerCase();
  if (e.includes("completed")) return "text-emerald-500";
  if (e.includes("cancelled")) return "text-amber-500";
  if (e.includes("hearing") || e.includes("session")) return "text-royal";
  return "text-royal";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return String(iso);
  }
}

/**
 * `formatDate` parses through `new Date(iso)`, correct for a timestamptz
 * instant but wrong for a wall-clock "YYYY-MM-DD" hearing date — see the
 * same helper on the lawyer case file for the timezone bug this avoids.
 */
function formatHearingDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
}

/** Today as "YYYY-MM-DD" in the viewer's local zone, for comparing against `hearings.hearing_date` (also a wall-clock string) — no `new Date()` instant-vs-wall-clock drift. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FirmCaseDetailsPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined) ?? "";
  const user = useUser();

  const [request, setRequest] = useState<ServiceRequestDetail | null>(null);
  const [detailState, setDetailState] = useState<"loading" | "unreadable" | "notfound" | "ready">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState<CaseTab>("overview");

  // ── Tasks (public.tasks, this case) ──
  const [tasksRead, setTasksRead] = useState<ListRead<CaseTask> | null>(null);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  // ── Hearings (public.hearings, this case) ──
  const [hearingsRead, setHearingsRead] = useState<ListRead<HearingDto> | null>(null);
  const [hearingsLoading, setHearingsLoading] = useState(true);
  const [showAddHearing, setShowAddHearing] = useState(false);

  // ── درجات التقاضي (public.case_stages, this case) ──
  const [stagesRead, setStagesRead] = useState<ListRead<CaseStage> | null>(null);
  const [stagesLoading, setStagesLoading] = useState(true);
  const [showAddStage, setShowAddStage] = useState(false);
  const [outcomeStage, setOutcomeStage] = useState<CaseStage | null>(null);

  // ── المهل (public.deadlines, this case) ──
  const [deadlinesRead, setDeadlinesRead] = useState<ListRead<Deadline> | null>(null);
  const [deadlinesLoading, setDeadlinesLoading] = useState(true);
  const [showAddDeadline, setShowAddDeadline] = useState(false);
  const [deadlineRowBusy, setDeadlineRowBusy] = useState<Record<string, boolean>>({});
  const [deadlineRowError, setDeadlineRowError] = useState<Record<string, string>>({});

  // ── Documents ──
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [fileInputEl, setFileInputEl] = useState<HTMLInputElement | null>(null);

  // ── الملاحظات (owner item 65, public.case_notes, this case) ──
  const [caseNotesRead, setCaseNotesRead] = useState<ListRead<CaseNote> | null>(null);
  const [caseNotesLoading, setCaseNotesLoading] = useState(true);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [newNoteVisibility, setNewNoteVisibility] = useState<CaseNoteVisibility>("private");
  const [addingNote, setAddingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteBody, setEditNoteBody] = useState("");
  const [editNoteVisibility, setEditNoteVisibility] = useState<CaseNoteVisibility>("private");
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetailState("loading");
    getServiceRequestDetail(id)
      .then((r) => {
        if (cancelled) return;
        setRequest(r);
        setDetailState(r ? "ready" : "notfound");
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[firm case detail] fetch failed:", e);
        setRequest(null);
        setDetailState("unreadable");
      });
    return () => { cancelled = true; };
  }, [id, reloadKey]);

  const caseData = request;
  const status: CaseStatus = useMemo(() => mapStatus(caseData?.status), [caseData?.status]);
  const statusConf = STATUS_CONFIG[status];

  // ── Hearings ──
  const loadCaseHearings = useCallback(() => {
    if (!id) return;
    setHearingsLoading(true);
    getLawyerHearings({ caseId: id })
      .then(({ hearings: rows }) => setHearingsRead(listOk(rows)))
      .catch(() => setHearingsRead(listFailed<HearingDto>()))
      .finally(() => setHearingsLoading(false));
  }, [id]);

  useEffect(() => { loadCaseHearings(); }, [loadCaseHearings]);

  useEffect(() => {
    const onUpdated = () => loadCaseHearings();
    window.addEventListener("nzamy-workflow-updated", onUpdated);
    return () => window.removeEventListener("nzamy-workflow-updated", onUpdated);
  }, [loadCaseHearings]);

  const hearingsView = listViewState(hearingsLoading, hearingsRead);
  const caseHearings = itemsOf(hearingsRead);

  const hearings: HearingRow[] = useMemo(() => {
    return caseHearings.map((h): HearingRow => ({
      date: formatHearingDate(h.date),
      court: h.location || "—",
      result: h.title,
      status: h.status === "scheduled" && h.date >= todayIso() ? "upcoming" : "done",
    }));
  }, [caseHearings]);

  const nextHearing = hearings.find((h) => h.status === "upcoming");

  // ── Timeline from events ──
  const timeline: TimelineRow[] = useMemo(() => {
    if (!caseData?.events) return [];
    return [...caseData.events]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((e) => ({
        event: caseEventLabel(e.event),
        date: formatDate(e.created_at),
        icon: eventIcon(e.event),
        color: eventColor(e.event),
      }));
  }, [caseData]);

  const documents = caseData?.attachments ?? [];

  // ── Tasks ──
  const loadCaseTasks = useCallback(() => {
    if (!id) return;
    setTasksLoading(true);
    getLawyerTasks({ caseId: id })
      .then(read => {
        setTasksRead(
          read.ok
            ? listOk(read.items.filter(t => t.status !== "archived").map(toCaseTask))
            : listFailed<CaseTask>(),
        );
      })
      .catch(() => setTasksRead(listFailed<CaseTask>()))
      .finally(() => setTasksLoading(false));
  }, [id]);

  useEffect(() => { loadCaseTasks(); }, [loadCaseTasks]);

  const tasksView = listViewState(tasksLoading, tasksRead);
  const tasks = itemsOf(tasksRead);

  const patchTasks = useCallback((fn: (prev: CaseTask[]) => CaseTask[]) => {
    setTasksRead(prev => (prev?.ok ? listOk(fn(prev.items), prev.total) : prev));
  }, []);

  const addCaseTask = async () => {
    const title = newTaskTitle.trim();
    if (!title || addingTask) return;
    setAddingTask(true);
    setTaskError(null);
    try {
      const created = await createLawyerTask({
        title,
        category: "case",
        priority: "normal",
        caseId: id,
        caseRef: caseData?.title || undefined,
      });
      if (tasksRead?.ok) patchTasks(prev => [toCaseTask(created), ...prev]);
      else loadCaseTasks();
      setNewTaskTitle("");
    } catch (e) {
      console.error("[firm case detail] addTask failed:", e);
      setTaskError(e instanceof Error && e.message ? e.message : "تعذّر إضافة المهمة.");
    } finally {
      setAddingTask(false);
    }
  };

  const cycleTaskStatus = async (task: CaseTask) => {
    const next = NEXT_TASK_STATUS[task.status];
    const previous = task.status;
    patchTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status: next } : t)));
    const ok = await updateLawyerTaskStatus(task.id, PAGE_TO_API_STATUS[next]);
    if (!ok) {
      patchTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status: previous } : t)));
      setTaskError("تعذّر تحديث حالة المهمة.");
    }
  };

  // ── درجات التقاضي ──
  const loadCaseStages = useCallback(() => {
    if (!id) return;
    setStagesLoading(true);
    getCaseStages(id)
      .then(({ items }) => setStagesRead(listOk(items)))
      .catch(() => setStagesRead(listFailed<CaseStage>()))
      .finally(() => setStagesLoading(false));
  }, [id]);

  useEffect(() => { loadCaseStages(); }, [loadCaseStages]);

  const stagesView = listViewState(stagesLoading, stagesRead);
  const caseStages = itemsOf(stagesRead);

  // ── المهل ──
  const loadCaseDeadlines = useCallback(() => {
    if (!id) return;
    setDeadlinesLoading(true);
    getDeadlines({ caseId: id, status: "all", limit: 200 })
      .then(setDeadlinesRead)
      .finally(() => setDeadlinesLoading(false));
  }, [id]);

  useEffect(() => { loadCaseDeadlines(); }, [loadCaseDeadlines]);

  const deadlinesView = listViewState(deadlinesLoading, deadlinesRead);
  const caseDeadlines = itemsOf(deadlinesRead);
  const deadlinesKnown = deadlinesView === "ready" || deadlinesView === "empty";
  // Open/missed need attention first (soonest due date on top); done/cancelled
  // are history, most recent first. Together the two filters are exhaustive
  // over DeadlineStatus — every row lands in exactly one of them. Mirrors the
  // lawyer case page's sortedDeadlines so the same case reads the same way
  // from either dashboard.
  const sortedDeadlines = [
    ...caseDeadlines
      .filter((d) => d.status === "open" || d.status === "missed")
      .slice()
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    ...caseDeadlines
      .filter((d) => d.status === "done" || d.status === "cancelled")
      .slice()
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
  ];

  // Optimistic «تمّ»/«إلغاء» — copied from رادار المهل's handleRowAction so
  // the same row action feels identical on both screens.
  async function handleDeadlineRowAction(deadline: Deadline, next: "done" | "cancelled") {
    setDeadlineRowBusy((b) => ({ ...b, [deadline.id]: true }));
    setDeadlineRowError((e) => { const n = { ...e }; delete n[deadline.id]; return n; });
    setDeadlinesRead((prev) => prev && prev.ok
      ? listOk(prev.items.map((d) => (d.id === deadline.id ? { ...d, status: next } : d)), prev.total)
      : prev);
    try {
      await updateDeadline(deadline.id, { status: next });
      loadCaseDeadlines();
    } catch (err) {
      setDeadlinesRead((prev) => prev && prev.ok
        ? listOk(prev.items.map((d) => (d.id === deadline.id ? deadline : d)), prev.total)
        : prev);
      setDeadlineRowError((e) => ({
        ...e,
        [deadline.id]: err instanceof Error && err.message ? err.message : "تعذّر تحديث المهلة.",
      }));
    } finally {
      setDeadlineRowBusy((b) => ({ ...b, [deadline.id]: false }));
    }
  }

  // ── الملاحظات ──
  const loadCaseNotes = useCallback(() => {
    if (!id) return;
    setCaseNotesLoading(true);
    getCaseNotes(id)
      .then(setCaseNotesRead)
      .finally(() => setCaseNotesLoading(false));
  }, [id]);

  useEffect(() => { loadCaseNotes(); }, [loadCaseNotes]);

  const caseNotesView = listViewState(caseNotesLoading, caseNotesRead);
  const caseNotesItems = itemsOf(caseNotesRead);

  const submitCaseNote = async () => {
    const body = newNoteBody.trim();
    if (!body || addingNote) return;
    setAddingNote(true);
    setNoteError(null);
    try {
      await addCaseNote(id, { body, visibility: newNoteVisibility });
      setNewNoteBody("");
      loadCaseNotes();
    } catch (e) {
      console.error("[firm case detail] addCaseNote failed:", e);
      setNoteError(e instanceof Error && e.message ? e.message : "تعذّر حفظ الملاحظة.");
    } finally {
      setAddingNote(false);
    }
  };

  const startEditNote = (note: CaseNote) => {
    setEditingNoteId(note.id);
    setEditNoteBody(note.body);
    setEditNoteVisibility(note.visibility);
    setNoteError(null);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditNoteBody("");
  };

  const saveEditNote = async (noteId: string) => {
    const body = editNoteBody.trim();
    if (!body) return;
    setSavingNoteId(noteId);
    setNoteError(null);
    try {
      await updateCaseNote(id, noteId, { body, visibility: editNoteVisibility });
      setEditingNoteId(null);
      loadCaseNotes();
    } catch (e) {
      console.error("[firm case detail] updateCaseNote failed:", e);
      setNoteError(e instanceof Error && e.message ? e.message : "تعذّر حفظ التعديل.");
    } finally {
      setSavingNoteId(null);
    }
  };

  const removeCaseNote = async (noteId: string) => {
    setDeletingNoteId(noteId);
    setNoteError(null);
    try {
      await deleteCaseNote(id, noteId);
      loadCaseNotes();
    } catch (e) {
      console.error("[firm case detail] deleteCaseNote failed:", e);
      setNoteError(e instanceof Error && e.message ? e.message : "تعذّر حذف الملاحظة.");
    } finally {
      setDeletingNoteId(null);
    }
  };

  // ── Documents ──
  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadNotice(null);
    try {
      await uploadDocumentFile(file, { requestId: id });
    } catch (e: any) {
      console.error("[firm case detail] upload failed:", e);
      setUploadError(e?.message ?? "تعذّر رفع المستند.");
      setUploading(false);
      return;
    }
    try {
      const r = await getServiceRequestDetail(id);
      if (r) setRequest(r);
      else setUploadNotice("تم رفع المستند. تعذّرت إعادة قراءة القضية، فقد لا تظهر القائمة أدناه محدَّثة.");
    } catch (e) {
      console.error("[firm case detail] post-upload refetch failed:", e);
      setUploadNotice("تم رفع المستند بنجاح، لكن تعذّرت إعادة قراءة القضية. حدّث الصفحة لعرضه في القائمة.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: ServiceRequestAttachment) => {
    setDownloadError(null);
    const label = doc.name || "المستند";
    try {
      const url = await getDocumentFileUrl(doc.storage_path);
      if (!url) {
        setDownloadError(`تعذّر فتح «${label}» — حاول مرة أخرى.`);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("[firm case detail] download failed:", e);
      setDownloadError(
        isDocumentTimeoutError(e)
          ? `تعذّر فتح «${label}» — استغرق إنشاء الرابط وقتاً طويلاً. تحقق من اتصالك وحاول مجدداً.`
          : `تعذّر فتح «${label}» — حاول مرة أخرى.`,
      );
    }
  };

  // ── Render: loading ──
  if (detailState === "loading") {
    return (
      <div className="max-w-[1100px] mx-auto py-20 text-center" dir="rtl">
        <div className="inline-flex flex-col items-center gap-3">
          <Spinner size={32} className="text-royal animate-spin" />
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جاري تحميل القضية...</p>
        </div>
      </div>
    );
  }

  // ── Render: unreadable ──
  if (detailState === "unreadable") {
    return (
      <div className="max-w-[1100px] mx-auto py-20 text-center" dir="rtl">
        <div className={`inline-flex flex-col items-center gap-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
          <Warning size={40} weight="duotone" className="text-red-500" />
          <p className="text-lg font-bold">تعذّرت قراءة بيانات القضية</p>
          <p className={`text-sm max-w-md ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            لم تنجح القراءة — هذا لا يعني أن القضية غير موجودة أو محذوفة.
          </p>
          <button
            onClick={() => setReloadKey(k => k + 1)}
            className="mt-1 flex items-center gap-1.5 text-sm font-bold text-royal hover:underline"
          >
            <ArrowClockwise size={14} /> إعادة المحاولة
          </button>
          <Link href="/dashboard/firm/cases" className="text-sm text-[#0B3D2E] hover:underline">← العودة للقضايا</Link>
        </div>
      </div>
    );
  }

  // ── Render: not-found ──
  if (detailState === "notfound" || !caseData) {
    return (
      <div className="max-w-[1100px] mx-auto py-20 text-center" dir="rtl">
        <div className={`inline-flex flex-col items-center gap-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
          <Warning size={40} className={isDark ? "text-zinc-700" : "text-slate-300"} />
          <p className="text-lg font-bold">القضية غير موجودة</p>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>قد يكون الرابط غير صحيح أو أن القضية محذوفة.</p>
          <Link href="/dashboard/firm/cases" className="mt-2 text-sm text-[#0B3D2E] hover:underline">← العودة للقضايا</Link>
        </div>
      </div>
    );
  }

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filedDate = formatDate(caseData.createdAt);
  const court = String((caseData.metadata as any)?.court ?? "بانتظار تحديد الجهة");

  return (
    <div className="max-w-[1100px] mx-auto space-y-5 p-5 md:p-7" dir="rtl">

      {/* Breadcrumb */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link href="/dashboard/firm/cases"
          className={`inline-flex items-center gap-1.5 text-[13px] transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
          <ArrowRight size={13} />
          ملف القضايا
        </Link>
      </motion.div>

      {/* Header card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5`}>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${statusConf.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
                {statusConf.label}
              </span>
              <span className={`text-[11px] font-mono px-2 py-1 rounded-lg ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>
                {orderReference(caseData.id)}
              </span>
            </div>
            <h1 className={`text-xl font-bold mb-2 leading-snug ${isDark ? "text-white" : "text-slate-800"}`}>
              {caseData.title || "بدون عنوان"}
            </h1>
            <div className={`flex items-center gap-4 text-[12px] flex-wrap ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <span className="flex items-center gap-1.5">
                <Buildings size={13} />الموكل: {caseData.requester?.name ?? "—"}
              </span>
              <span className="flex items-center gap-1.5"><Scales size={13} />المحكمة: {court}</span>
              <span className="flex items-center gap-1.5"><CalendarCheck size={13} />تاريخ التقديم: {filedDate}</span>
            </div>
          </div>
          {nextHearing && (
            <div className={`px-3 py-2 rounded-xl text-center flex-shrink-0 ${isDark ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"}`}>
              <p className={`text-[10px] font-semibold mb-0.5 ${isDark ? "text-amber-500/70" : "text-amber-600"}`}>الجلسة القادمة</p>
              <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                <CalendarCheck size={12} className="inline ml-1" />{nextHearing.date}
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-2xl overflow-x-auto ${isDark ? "bg-zinc-900/60 border border-white/[0.06]" : "bg-slate-100/80"}`}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all whitespace-nowrap flex-shrink-0 min-w-[70px] ${activeTab === tab.id
                ? isDark ? "bg-white/[0.08] text-white shadow-sm" : "bg-white text-slate-800 shadow-sm"
                : isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-500 hover:text-slate-700"
              }`}>
              <Icon size={13} weight={activeTab === tab.id ? "duotone" : "regular"} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}>

          {/* ── Overview ── */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className={`lg:col-span-2 ${card} p-5`}>
                <h2 className={`text-sm font-bold mb-2 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                  <Scales size={14} className="text-royal" />وقائع القضية
                </h2>
                <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                  {caseData.description || "لا يوجد وصف متاح لهذه القضية."}
                </p>
              </div>
              <div className={`${card} p-5`}>
                <h2 className={`text-sm font-bold mb-3 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                  <ChartLine size={14} className="text-royal" />المخطط الزمني
                </h2>
                {timeline.length === 0 ? (
                  <div className="text-center py-8">
                    <ChartLine size={24} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                    <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد أحداث مسجّلة بعد</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {timeline.map((ev, i) => {
                      const Icon = ev.icon;
                      return (
                        <div key={i} className="flex items-start gap-3">
                          <div className={`w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                            <Icon size={13} weight="duotone" className={ev.color} />
                          </div>
                          <div>
                            <p className={`text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{ev.event}</p>
                            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{ev.date}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tasks ── */}
          {activeTab === "tasks" && (
            <div className="space-y-4">
              <div className={`${card} p-3 flex items-center gap-2`}>
                <input
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addCaseTask(); }}
                  disabled={addingTask}
                  placeholder="أضف مهمة لهذه القضية..."
                  className={`flex-1 rounded-xl border px-3 py-2 text-[12px] outline-none disabled:opacity-50 ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`}
                />
                <button onClick={addCaseTask} disabled={addingTask || !newTaskTitle.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold bg-[#0B3D2E] text-[#C8A762] disabled:opacity-40 transition-opacity">
                  {addingTask
                    ? <Spinner size={12} className="animate-spin" />
                    : <Plus size={12} weight="bold" />}
                  {addingTask ? "جارٍ الإضافة..." : "إضافة مهمة"}
                </button>
              </div>

              {taskError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[11px] font-semibold text-red-500">
                  <Warning size={13} weight="fill" className="mt-0.5 flex-shrink-0" />
                  <span className="flex-1">{taskError}</span>
                  <button onClick={() => setTaskError(null)} className="opacity-70 hover:opacity-100">إخفاء</button>
                </div>
              )}

              {tasksView === "loading" ? (
                <div className={`${card} p-10 flex items-center justify-center gap-2`}>
                  <Spinner size={20} className="text-royal animate-spin" />
                  <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جاري تحميل المهام...</span>
                </div>
              ) : tasksView === "unreadable" ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <Warning size={32} weight="duotone" className="mb-3 text-red-500" />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة المهام</p>
                  <p className={`text-[11px] mt-1 text-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    هذه ليست لوحة فارغة — قد تكون لهذه القضية مهام لم تُقرأ.
                  </p>
                  <button onClick={loadCaseTasks}
                    className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-royal hover:underline">
                    <ArrowClockwise size={13} /> إعادة المحاولة
                  </button>
                </div>
              ) : tasks.length === 0 ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <CheckSquare size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا توجد مهام لهذه القضية بعد</p>
                  <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>أضف أول مهمة من الحقل أعلاه.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((t, i) => {
                    const conf = TASK_STATUS[t.status];
                    return (
                      <motion.div key={t.id}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        className={`${card} p-4 flex items-start gap-3`}>
                        <button onClick={() => cycleTaskStatus(t)}
                          title="تغيير حالة المهمة"
                          className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center border transition-colors ${
                            t.status === "done"
                              ? "border-emerald-400 bg-emerald-500/20"
                              : isDark ? "border-white/[0.14] hover:border-royal" : "border-slate-300 hover:border-royal"
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-[13px] font-semibold ${t.status === "done" ? "line-through opacity-50" : ""} ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                              {t.title}
                            </p>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${conf.color}`}>{conf.label}</span>
                            {t.priority === "urgent" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-500">عاجلة</span>}
                            {t.priority === "high" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-500">عالية</span>}
                          </div>
                          {t.notes && (
                            <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{t.notes}</p>
                          )}
                          {t.dueDate && (
                            <p className={`text-[10px] mt-1 flex items-center gap-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                              <CalendarCheck size={11} />تاريخ التسليم: {t.dueDate}
                            </p>
                          )}
                          {/* Subtasks are read-only here — the checklist toggle
                              lives on the lawyer's Kanban board and the lawyer
                              case file; this tab only shows progress. */}
                          {t.subtasks.length > 0 && (
                            <div className={`mt-2.5 pt-2.5 border-t border-dashed space-y-1 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                              {t.subtasks.map(sub => (
                                <div key={sub.id} className="flex items-center gap-2 px-0.5 py-0.5">
                                  <span className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border ${
                                    sub.done ? "border-emerald-400 bg-emerald-500" : isDark ? "border-white/[0.16]" : "border-slate-300"
                                  }`}>
                                    {sub.done && <CheckCircle size={9} weight="fill" className="text-white" />}
                                  </span>
                                  <span className={`text-[11px] leading-tight ${
                                    sub.done
                                      ? isDark ? "line-through text-zinc-600" : "line-through text-slate-400"
                                      : isDark ? "text-zinc-300" : "text-slate-600"
                                  }`}>
                                    {sub.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Hearings ── */}
          {activeTab === "hearings" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {countPhraseAr(hearings.length, HEARINGS_COUNT)}
                </p>
                <button onClick={() => setShowAddHearing(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22] transition-colors">
                  <Plus size={12} weight="bold" />إضافة جلسة
                </button>
              </div>
              {hearingsView === "loading" ? (
                <div className={`${card} p-10 flex items-center justify-center gap-2`}>
                  <Spinner size={20} className="text-royal animate-spin" />
                  <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ تحميل الجلسات...</span>
                </div>
              ) : hearingsView === "unreadable" ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <Warning size={32} weight="duotone" className="mb-3 text-red-500" />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة الجلسات</p>
                  <p className={`text-[11px] mt-1 text-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    هذه ليست لوحة فارغة — قد تكون لهذه القضية جلسات لم تُقرأ.
                  </p>
                  <button onClick={loadCaseHearings}
                    className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-royal hover:underline">
                    <ArrowClockwise size={13} /> إعادة المحاولة
                  </button>
                </div>
              ) : hearings.length === 0 ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <CalendarCheck size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا توجد جلسات مسجّلة</p>
                  <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>أضِف أول جلسة لهذه القضية بالزر أعلاه.</p>
                </div>
              ) : (
                hearings.map((h, i) => (
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
                ))
              )}
            </div>
          )}

          {/* ── درجات التقاضي ── */}
          {activeTab === "stages" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {countPhraseAr(caseStages.length, STAGES_COUNT)}
                </p>
                <button onClick={() => setShowAddStage(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22] transition-colors">
                  <Plus size={12} weight="bold" />إضافة درجة تقاضٍ
                </button>
              </div>
              {stagesView === "loading" ? (
                <div className={`${card} p-10 flex items-center justify-center gap-2`}>
                  <Spinner size={20} className="text-royal animate-spin" />
                  <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ تحميل درجات التقاضي...</span>
                </div>
              ) : stagesView === "unreadable" ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <Warning size={32} weight="duotone" className="mb-3 text-red-500" />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة درجات التقاضي</p>
                  <p className={`text-[11px] mt-1 text-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    هذه ليست لوحة فارغة — قد تكون لهذه القضية درجات تقاضٍ لم تُقرأ.
                  </p>
                  <button onClick={loadCaseStages}
                    className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-royal hover:underline">
                    <ArrowClockwise size={13} /> إعادة المحاولة
                  </button>
                </div>
              ) : caseStages.length === 0 ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <Scales size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا توجد درجات تقاضٍ مسجّلة</p>
                  <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>سجِّل الدرجة الحالية للقضية (ابتدائي، استئناف...) بالزر أعلاه.</p>
                </div>
              ) : (
                caseStages.map((s, i) => {
                  const outcome = OUTCOME_CONFIG[s.outcome ?? "pending"] ?? OUTCOME_CONFIG.pending;
                  return (
                    <motion.div key={s.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className={`${card} p-4`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                            <Scales size={16} weight="duotone" className="text-royal" />
                          </div>
                          <div>
                            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{s.degree}</p>
                            {s.courtName && (
                              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{s.courtName}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border whitespace-nowrap ${outcome.color}`}>{outcome.label}</span>
                          <button onClick={() => setOutcomeStage(s)}
                            className={`text-[10.5px] font-bold hover:underline ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                            {s.outcome ? "تعديل النتيجة" : "تسجيل النتيجة"}
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px]">
                        {s.courtCaseNo && (
                          <span className={isDark ? "text-zinc-500" : "text-slate-400"}>رقم القضية: {s.courtCaseNo}</span>
                        )}
                        {s.circuit && (
                          <span className={isDark ? "text-zinc-500" : "text-slate-400"}>الدائرة: {s.circuit}</span>
                        )}
                        {s.judgeName && (
                          <span className={isDark ? "text-zinc-500" : "text-slate-400"}>القاضي: {s.judgeName}</span>
                        )}
                        {s.openedOn && (
                          <span className={isDark ? "text-zinc-500" : "text-slate-400"}>فُتحت في {formatHearingDate(s.openedOn)}</span>
                        )}
                        {s.closedOn && (
                          <span className={isDark ? "text-zinc-500" : "text-slate-400"}>أُغلقت في {formatHearingDate(s.closedOn)}</span>
                        )}
                      </div>
                      {s.notes && (
                        <p className={`text-[12px] mt-2 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{s.notes}</p>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
          )}

          {/* ── المهل ── */}
          {activeTab === "deadlines" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {deadlinesKnown ? countPhraseAr(caseDeadlines.length, DEADLINES_COUNT) : "المهل"}
                </p>
                <button onClick={() => setShowAddDeadline(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22] transition-colors">
                  <Plus size={12} weight="bold" />إضافة مهلة
                </button>
              </div>
              {deadlinesView === "loading" ? (
                <div className={`${card} p-10 flex items-center justify-center gap-2`}>
                  <Spinner size={20} className="text-royal animate-spin" />
                  <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ تحميل المهل...</span>
                </div>
              ) : deadlinesView === "unreadable" ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <Warning size={32} weight="duotone" className="mb-3 text-red-500" />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة المهل</p>
                  <p className={`text-[11px] mt-1 text-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    هذه ليست قائمة فارغة — قد توجد مهل لم تُقرأ.
                  </p>
                  <button onClick={loadCaseDeadlines}
                    className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-royal hover:underline">
                    <ArrowClockwise size={13} /> إعادة المحاولة
                  </button>
                </div>
              ) : caseDeadlines.length === 0 ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <Timer size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا مهل لهذه القضية بعد</p>
                  <p className={`text-[11px] mt-1 text-center max-w-[320px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    أضف مهلة، أو سجّل نتيجة درجة تقاضٍ بتاريخ إغلاق وستُحسب مهلة الاعتراض تلقائياً.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sortedDeadlines.map((d) => (
                    <DeadlineCard
                      key={d.id}
                      deadline={d}
                      isDark={isDark}
                      showCaseLink={false}
                      busy={!!deadlineRowBusy[d.id]}
                      error={deadlineRowError[d.id] ?? null}
                      onAction={(next) => handleDeadlineRowAction(d, next)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Documents ── */}
          {activeTab === "documents" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {countPhraseAr(documents.length, DOCUMENTS_COUNT)}
                </p>
                <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${uploading ? "opacity-60 pointer-events-none" : ""} ${isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"}`}>
                  <UploadSimple size={12} />{uploading ? "جاري الرفع..." : "رفع مستند"}
                  <input
                    ref={setFileInputEl}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                      if (fileInputEl) fileInputEl.value = "";
                    }}
                  />
                </label>
              </div>
              {uploadError && (
                <div className={`p-3 rounded-xl border text-[12px] ${isDark ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-red-200 bg-red-50 text-red-600"}`}>
                  <Warning size={12} className="inline ml-1" />{uploadError}
                </div>
              )}
              {uploadNotice && (
                <div className={`p-3 rounded-xl border text-[12px] ${isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                  <CheckCircle size={12} weight="fill" className="inline ml-1" />{uploadNotice}
                </div>
              )}
              {downloadError && (
                <div className={`flex items-start gap-2 p-3 rounded-xl border text-[12px] ${isDark ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-red-200 bg-red-50 text-red-600"}`}>
                  <Warning size={13} weight="fill" className="mt-0.5 flex-shrink-0" />
                  <span className="flex-1">{downloadError}</span>
                  <button onClick={() => setDownloadError(null)} className="opacity-70 hover:opacity-100 font-semibold">إخفاء</button>
                </div>
              )}
              {documents.length === 0 ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <FolderOpen size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا توجد مستندات</p>
                  <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>ارفع أول مستند لهذه القضية.</p>
                </div>
              ) : (
                documents.map((doc, i) => (
                  <motion.div key={doc.id ?? i}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                    className={`group ${card} p-4 flex items-center gap-3 hover:border-royal/20 transition-all`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${(doc.mime_type ?? "").includes("pdf") ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"}`}>
                      <FileText size={18} weight="duotone" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{doc.name}</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{formatFileSize(doc.file_size)} · {formatDate(doc.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleDownload(doc)} title="عرض/تحميل"
                        className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Eye size={14} /></button>
                      <button onClick={() => handleDownload(doc)} title="تحميل"
                        className={`p-2 rounded-xl ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><Download size={14} /></button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {/* ── الملاحظات — owner item 65: this tab did not exist on the firm
              case file at all. Same table, same routes, same shape as the
              lawyer case file's «الملاحظات» tab (public.case_notes). ── */}
          {activeTab === "notes" && (
            <div className="space-y-4">
              <div className={`${card} p-4`}>
                <div className={`flex flex-col gap-2 p-3 rounded-xl border ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-slate-200 bg-slate-50"}`}>
                  <textarea
                    value={newNoteBody}
                    onChange={(e) => setNewNoteBody(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) submitCaseNote(); }}
                    placeholder="أضف ملاحظة على ملف هذه القضية..."
                    rows={2}
                    disabled={addingNote}
                    className={`w-full bg-transparent text-[12px] outline-none resize-none disabled:opacity-50 ${isDark ? "text-zinc-300 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-[10px]">
                      <button type="button" onClick={() => setNewNoteVisibility("private")}
                        className={`px-2 py-1 rounded-lg font-bold transition-colors ${
                          newNoteVisibility === "private"
                            ? isDark ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"
                            : isDark ? "text-zinc-600" : "text-slate-400"
                        }`}>خاصة بي</button>
                      <button type="button" onClick={() => setNewNoteVisibility("firm")}
                        className={`px-2 py-1 rounded-lg font-bold transition-colors ${
                          newNoteVisibility === "firm"
                            ? isDark ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"
                            : isDark ? "text-zinc-600" : "text-slate-400"
                        }`}>للمكتب</button>
                    </div>
                    <button onClick={submitCaseNote} disabled={!newNoteBody.trim() || addingNote}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold bg-[#0B3D2E] text-[#C8A762] disabled:opacity-40 transition-opacity">
                      {addingNote ? <Spinner size={12} className="animate-spin" /> : <Plus size={12} weight="bold" />}
                      {addingNote ? "جارٍ الحفظ..." : "إضافة ملاحظة"}
                    </button>
                  </div>
                </div>
                <p className={`mt-2 text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  «خاصة بي» لا يراها أحد سواك. «للمكتب» تصل لزملائك النشطين في مكتبك فقط — الموكّل لا يرى أي ملاحظة هنا مطلقاً.
                </p>
                {noteError && <p className="mt-2 text-[11px] font-semibold text-red-500">{noteError}</p>}
              </div>

              <div className="space-y-3">
                {caseNotesView === "loading" ? (
                  <div className={`${card} p-8 flex items-center justify-center gap-2`}>
                    <Spinner size={18} className="text-royal animate-spin" />
                    <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ تحميل الملاحظات...</span>
                  </div>
                ) : caseNotesView === "unreadable" ? (
                  <div className={`${card} p-8 flex flex-col items-center justify-center`}>
                    <Warning size={28} weight="duotone" className="mb-2 text-red-500" />
                    <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة الملاحظات</p>
                    <p className={`text-[11px] mt-1 text-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      هذه ليست قائمة فارغة — قد تكون لهذه القضية ملاحظات لم تُقرأ.
                    </p>
                    <button onClick={loadCaseNotes} className="mt-2 flex items-center gap-1.5 text-[12px] font-bold text-royal hover:underline">
                      <ArrowClockwise size={13} /> إعادة المحاولة
                    </button>
                  </div>
                ) : caseNotesItems.length === 0 ? (
                  <div className={`${card} p-8 text-center`}>
                    <ChatDots size={24} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                    <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد ملاحظات محفوظة على هذه القضية بعد</p>
                  </div>
                ) : (
                  caseNotesItems.map((note, i) => (
                    <motion.div key={note.id} layout
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                      className={`${card} p-4`}>
                      {editingNoteId === note.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editNoteBody}
                            onChange={(e) => setEditNoteBody(e.target.value)}
                            rows={2}
                            className={`w-full rounded-xl border px-3 py-2 text-[12px] outline-none resize-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-800"}`}
                          />
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-[10px]">
                              <button type="button" onClick={() => setEditNoteVisibility("private")}
                                className={`px-2 py-1 rounded-lg font-bold transition-colors ${
                                  editNoteVisibility === "private"
                                    ? isDark ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"
                                    : isDark ? "text-zinc-600" : "text-slate-400"
                                }`}>خاصة بي</button>
                              <button type="button" onClick={() => setEditNoteVisibility("firm")}
                                className={`px-2 py-1 rounded-lg font-bold transition-colors ${
                                  editNoteVisibility === "firm"
                                    ? isDark ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"
                                    : isDark ? "text-zinc-600" : "text-slate-400"
                                }`}>للمكتب</button>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={cancelEditNote}
                                className={`text-[11px] font-semibold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>إلغاء</button>
                              <button onClick={() => saveEditNote(note.id)} disabled={!editNoteBody.trim() || savingNoteId === note.id}
                                className="px-3 py-1.5 rounded-lg bg-[#0B3D2E] text-[#C8A762] text-[11px] font-bold disabled:opacity-40">
                                {savingNoteId === note.id ? "جارٍ الحفظ..." : "حفظ"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-2 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-xl bg-royal/10 flex items-center justify-center flex-shrink-0">
                                {/* بلا اسم لا يوجد حرف أول: أيقونة، لا خانة من المعرّف. */}
                                {note.authorNameKnown
                                  ? <span className="text-[11px] font-bold text-royal">{note.authorName.charAt(0)}</span>
                                  : <User size={13} weight="duotone" className="text-royal" />}
                              </div>
                              <p className={`text-[12px] font-semibold truncate ${
                                note.authorNameKnown
                                  ? isDark ? "text-zinc-300" : "text-slate-700"
                                  : isDark ? "text-zinc-500" : "text-slate-400"
                              }`}>{note.authorName}</p>
                              <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                note.visibility === "firm"
                                  ? isDark ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-50 text-indigo-600"
                                  : isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500"
                              }`}>{note.visibility === "firm" ? "للمكتب" : "خاصة بي"}</span>
                            </div>
                            <p className={`flex-shrink-0 text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{formatDate(note.createdAt)}</p>
                          </div>
                          <p className={`text-[13px] leading-relaxed whitespace-pre-wrap ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{note.body}</p>
                          {note.mine && (
                            <div className={`flex items-center gap-3 mt-2.5 pt-2.5 border-t border-dashed ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                              <button onClick={() => startEditNote(note)}
                                className={`flex items-center gap-1 text-[10px] font-bold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                                <PencilSimple size={11} /> تعديل
                              </button>
                              <button onClick={() => removeCaseNote(note.id)} disabled={deletingNoteId === note.id}
                                className={`flex items-center gap-1 text-[10px] font-bold disabled:opacity-40 ${isDark ? "text-zinc-500 hover:text-red-400" : "text-slate-400 hover:text-red-500"}`}>
                                <Trash size={11} /> حذف
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── Canvas — unchanged, already reads the real per-case graph ── */}
          {activeTab === "canvas" && (
            <LegalCanvas caseId={id} />
          )}
        </motion.div>
      </AnimatePresence>

      {showAddHearing && (
        <AddHearingModal
          onClose={() => setShowAddHearing(false)}
          isDark={isDark}
          user={{ userId: user.userId, name: user.name, userType: user.userType, tier: user.tier }}
          caseRequestId={id}
          defaultCaseName={caseData?.title}
        />
      )}

      {showAddStage && (
        <AddCaseStageModal
          onClose={() => setShowAddStage(false)}
          isDark={isDark}
          caseRequestId={id}
          onCreated={(created) => {
            if (stagesRead?.ok) setStagesRead(listOk([...stagesRead.items, created]));
          }}
        />
      )}

      {outcomeStage && (
        <RecordStageOutcomeModal
          onClose={() => setOutcomeStage(null)}
          isDark={isDark}
          caseRequestId={id}
          stage={outcomeStage}
          onSaved={(stage, autoDeadline) => {
            setOutcomeStage(null);
            if (stagesRead?.ok) {
              setStagesRead(listOk(stagesRead.items.map((s) => (s.id === stage.id ? stage : s))));
            }
            if (autoDeadline?.created) loadCaseDeadlines();
          }}
        />
      )}

      {showAddDeadline && (
        <AddDeadlineModal
          onClose={() => setShowAddDeadline(false)}
          isDark={isDark}
          caseRequestId={id}
          onCreated={() => {
            setShowAddDeadline(false);
            loadCaseDeadlines();
          }}
        />
      )}
    </div>
  );
}
