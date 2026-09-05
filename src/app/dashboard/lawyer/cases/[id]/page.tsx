"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Gavel, ArrowRight, CalendarCheck, Clock, User, Buildings,
  FileText, ChatDots, ChartLine, Plus, Download, UploadSimple,
  ArrowUpRight, CheckCircle, Warning, PencilSimple, Scales,
  MapPin, MoneyWavy, Robot, FolderOpen, Eye, CheckSquare,
  Graph, UsersThree, Circle, DotsThree,
  ArrowsOut, ArrowsIn, Spinner, ArrowClockwise, Timer, SortAscending,
  Trash,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { countPhraseAr, type ArabicCountForms } from "@/lib/services/arabicCount";
import { getLawyerHearings, type HearingDto } from "@/lib/services/lawyerHearingsService";
import { getCaseStages, type CaseStage } from "@/lib/services/caseStagesService";
import { caseEventLabel } from "@/lib/services/caseEventLabels";
import {
  getDeadlines,
  updateDeadline,
  type Deadline,
} from "@/lib/services/deadlinesService";
import AddHearingModal from "../../_components/AddHearingModal";
import AddCaseStageModal from "../../_components/AddCaseStageModal";
import AddDeadlineModal from "../../_components/AddDeadlineModal";
import RecordStageOutcomeModal from "../../_components/RecordStageOutcomeModal";
import DeadlineCard, { daysLeftChip } from "../../_components/DeadlineCard";
import dynamic from "next/dynamic";
import {
  itemsOf,
  listFailed,
  listOk,
  listViewState,
  type ListRead,
} from "@/lib/services/listRead";
import {
  getServiceRequestDetail,
  type ServiceRequestDetail,
  type ServiceRequestEvent,
  type ServiceRequestAttachment,
} from "@/lib/services/casesService";
import {
  uploadDocumentFile,
  getDocumentFileUrl,
  isDocumentTimeoutError,
} from "@/lib/services/documentService";
import {
  getLawyerTasks,
  createLawyerTask,
  updateLawyerTaskStatus,
  updateLawyerTaskSubtasks,
  type LawyerTask,
  type LawyerSubtask,
  type LawyerTaskStatus,
} from "@/lib/services/lawyerTasksService";
import { urgentCaseTasks, nextOpenDeadline } from "@/lib/services/caseOverviewCockpit";
import {
  getCaseNotes,
  addCaseNote,
  updateCaseNote,
  deleteCaseNote,
  type CaseNote,
  type CaseNoteVisibility,
} from "@/lib/services/caseNotesService";

/**
 * Arabic counted-noun tables for this page's two tab counters.
 *
 * Both used to be `{n} جلسات` / `{n} مستندات` — a Western digit beside this
 * page's Arabic-Indic dates, and the plural noun for every count including
 * zero and one. The owner's shots 22 and 23 caught «0 جلسات مسجّلة» and
 * «1 مستندات» on one case file.
 */
const HEARINGS_COUNT: ArabicCountForms = {
  zero: "لا جلسات مسجّلة",
  one: "جلسة واحدة مسجّلة",
  two: "جلستان مسجّلتان",
  few: "جلسات مسجّلة",
  many: "جلسة مسجّلة",
};

const DOCUMENTS_COUNT: ArabicCountForms = {
  zero: "لا مستندات",
  one: "مستند واحد",
  two: "مستندان",
  few: "مستندات",
  many: "مستنداً",
};

const DEADLINES_COUNT: ArabicCountForms = {
  zero: "لا مهل مسجَّلة",
  one: "مهلة واحدة مسجَّلة",
  two: "مهلتان مسجَّلتان",
  few: "مهل مسجَّلة",
  many: "مهلة مسجَّلة",
};


const CaseGraphView = dynamic(
  () => import("@/app/dashboard/business/kanban/CaseGraphView"),
  { ssr: false, loading: () => <div className="h-96 flex items-center justify-center text-sm text-slate-400">جارٍ تحميل خريطة القضية...</div> }
);

// ─── Types ────────────────────────────────────────────────────────────────────
/**
 * حالات العرض في هذه الصفحة وحدها — ليست `CaseStatus` المشتركة في `_types.ts`.
 * أُضيفت "cancelled" هنا: كان `mapStatus` يطوي `completed` و`cancelled` في
 * "closed" الواحدة، فتقرأ القضية الملغاة «مغلقة» ويمتلئ شريط المراحل حتى «إغلاق»
 * كأنها اكتملت — بينما هي نفسها في قائمة القضايا داخل تبويب الأرشيف.
 */
type CaseStatus = "active" | "pending" | "suspended" | "closed" | "cancelled";
type TaskStatus = "todo" | "inprogress" | "done";

interface HearingRow {
  date: string;
  court: string;
  result: string;
  status: "done" | "upcoming";
}

interface NoteRow {
  author: string;
  text: string;
  date: string;
}

interface TimelineRow {
  event: string;
  date: string;
  icon: React.ElementType;
  color: string;
}

// ─── Config ────────────────────────────────────────────────────────────────────

/** The four stages of the file, in order. `stageIdx` indexes into this. */
const CASE_STAGES = ["تقديم", "قيد التداول", "مراجعة", "إغلاق"] as const;

/**
 * Arabic labels for `service_requests.type` — every value the
 * `service_requests_type_check` CHECK constraint allows
 * (supabase/migrations/20260814_service_orders_types.sql). The header badge
 * used to print this column raw, so a case a lawyer created themselves — its
 * type is the literal "service" (AddCaseModal.tsx) — showed the English word
 * "service" on an otherwise fully Arabic card. Same words the client sees for
 * the same type in dashboard/client/requests/page.tsx's TYPE_CFG.
 */
const CASE_TYPE_LABELS: Record<string, string> = {
  service: "خدمة",
  consultation: "استشارة",
  business_case: "قضية",
  ngo_volunteer: "متطوع",
  ai_draft: "صياغة مذكرة",
  ai_contracts: "عقود",
  ai_wargaming: "محاكاة",
  ai_legal_opinion: "رأي قانوني",
};

const STATUS_CONFIG: Record<CaseStatus, { label: string; color: string; dot: string }> = {
  active:    { label: "نشطة",   color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400 animate-pulse" },
  pending:   { label: "انتظار", color: "text-amber-500 bg-amber-500/10 border-amber-500/20",       dot: "bg-amber-400" },
  suspended: { label: "معلقة",  color: "text-blue-500 bg-blue-500/10 border-blue-500/20",          dot: "bg-blue-400" },
  closed:    { label: "مغلقة",  color: "text-slate-400 bg-slate-100 border-slate-200",             dot: "bg-slate-300" },
  cancelled: { label: "ملغاة",  color: "text-rose-500 bg-rose-500/10 border-rose-500/20",          dot: "bg-rose-400" },
};

/** درجات التقاضي outcomes — `public.case_stages.outcome`, edited from this tab via RecordStageOutcomeModal (PATCH /api/v1/lawyer/case-stages/[caseId]). */
const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  pending:   { label: "قيد النظر", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  won:       { label: "كسب القضية", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  lost:      { label: "خسارة",     color: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
  partial:   { label: "حكم جزئي",  color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  settled:   { label: "تسوية",     color: "text-royal bg-royal/10 border-royal/20" },
  withdrawn: { label: "تنازل",     color: "text-slate-400 bg-slate-100 border-slate-200" },
};

const TASK_STATUS: Record<TaskStatus, { label: string; color: string; dot: string }> = {
  todo:       { label: "لم تبدأ",    color: "text-slate-500 bg-slate-100",         dot: "bg-slate-300" },
  inprogress: { label: "قيد التنفيذ", color: "text-blue-600 bg-blue-500/10",       dot: "bg-blue-400 animate-pulse" },
  done:       { label: "مكتملة",     color: "text-emerald-600 bg-emerald-500/10", dot: "bg-emerald-400" },
};

// The tasks API speaks the Kanban's status vocabulary (todo/in_progress/done/
// archived) directly — public.tasks.status IS that vocabulary now, so there
// is no further DB-enum translation on the way out. This page's TASK_STATUS
// keys are todo/inprogress/done (no "archived" tab here); normalise on the
// way in with toPageTaskStatus, and back out with PAGE_TO_API_STATUS.
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
// Clicking a task's dot walks it forward through the three columns.
const NEXT_TASK_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: "inprogress",
  inprogress: "done",
  done: "todo",
};

interface CaseTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  dueDate?: string | null;
  notes?: string;
  /** metadata.subtasks — the checklist shown and ticked under the task here. */
  subtasks: LawyerSubtask[];
}

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

// «٢ من ٣» — the progress indicator the owner asked for, in Arabic-Indic digits.
const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toArabicDigits = (n: number | string) => String(n).replace(/\d/g, d => AR_DIGITS[Number(d)]);

const TABS = [
  { id: "overview",  label: "نظرة عامة",  icon: Gavel },
  { id: "tasks",     label: "المهام",      icon: CheckSquare },
  { id: "hearings",  label: "الجلسات",     icon: CalendarCheck },
  { id: "stages",    label: "درجات التقاضي", icon: Scales },
  { id: "deadlines", label: "المهل",       icon: Timer },
  { id: "documents", label: "المستندات",   icon: FolderOpen },
  { id: "team",      label: "الفريق",      icon: UsersThree },
  { id: "graph",     label: "خريطة القضية", icon: Graph },
  { id: "notes",     label: "الملاحظات",   icon: ChatDots },
];

// Map service_request statuses to the UI CaseStatus.
//
// `cancelled` كان يعود "closed" مع `completed`: قضية أُلغيت كانت تُطبع «مغلقة»
// وتظهر مكتملة المراحل على شريط التقدّم. الحالة الخام موجودة على الصف، والقائمة
// تعرفها أصلاً (`workflowToCase` تحوّل `cancelled` إلى الأرشيف)، فلا شيء كان
// ينقص سوى عدم طيّ الحالتين في واحدة هنا.
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

// Arabic labels for namespaced + legacy event strings now live in
// @/lib/services/caseEventLabels (caseEventLabel) — this file and
// client/cases/[id] each held their own copy, and the stages kinds
// (case_stage.added / case_stage.outcome_recorded) got added to only one.

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
 * `formatDate` above parses through `new Date(iso)`, which is correct for a
 * timestamptz instant but WRONG for a wall-clock "YYYY-MM-DD" hearing date:
 * `new Date("2026-09-10")` is UTC midnight, so a browser west of Riyadh
 * renders 9 September. Explicit local midnight, same fix as
 * /dashboard/lawyer/hearings's `eventDayDate`.
 */
function formatHearingDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
}

/** Today as "YYYY-MM-DD" in the viewer's local zone — for comparing against `hearings.hearing_date`, itself a wall-clock string. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Was `${bytes} B` / `${n} KB` / `${n} MB` — Western digits with a Latin unit
 * sitting beside this page's Arabic-Indic dates and `toArabicDigits` counters
 * on the same document row (finding 189). `toArabicDigits` here can take the
 * whole formatted string, not just an integer — the decimal point in "1.1"
 * survives untouched, only the digits change.
 */
function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${toArabicDigits(bytes)} بايت`;
  if (bytes < 1024 * 1024) return `${toArabicDigits((bytes / 1024).toFixed(1))} كيلوبايت`;
  return `${toArabicDigits((bytes / (1024 * 1024)).toFixed(1))} ميجابايت`;
}

/**
 * A coarse, honest file-type label from `mime_type` — the real column
 * `attachments.mime_type` already carries (used before only to pick the
 * card's icon colour). The document row had no category at all (finding
 * 190); this is the part of "category" that real data on the row can answer
 * without inventing a taxonomy nothing writes to. Uploader is now the other
 * real column: `attachments.owner_user_id` resolved to `profiles.display_name`
 * server-side (the same service-role join finding 183 added) and returned as
 * `doc.uploaderName` — shown next to the type chip when present. "Source" (an
 * intake channel — email, WhatsApp, portal) still has no column anywhere and
 * stays out rather than be invented.
 */
function fileTypeLabel(mimeType: string | null | undefined): string {
  const mt = (mimeType ?? "").toLowerCase();
  if (mt.startsWith("image/")) return "صورة";
  if (mt.includes("sheet") || mt.includes("excel") || mt.includes("csv")) return "جدول بيانات";
  if (mt.includes("presentation") || mt.includes("powerpoint")) return "عرض تقديمي";
  if (mt.startsWith("text/")) return "ملف نصي";
  if (mt.includes("pdf") || mt.includes("word") || mt.includes("msword") || mt.includes("document")) return "مستند";
  return "ملف";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CaseDetailPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";

  const [request, setRequest] = useState<ServiceRequestDetail | null>(null);
  /**
   * The four outcomes of loading one case, kept apart.
   *
   * `getServiceRequestDetail` keeps its `... | null` signature but null now
   * means HTTP 404 AND NOTHING ELSE — every other failure throws. So "this case
   * does not exist" and "we could not read this case" are finally separable,
   * and they must be: the second one wearing the first one's words tells a
   * lawyer that a live matter has been deleted.
   */
  const [detailState, setDetailState] = useState<"loading" | "unreadable" | "notfound" | "ready">("loading");
  // Bumped by «إعادة المحاولة» so a failed read is retried in place.
  const [reloadKey, setReloadKey] = useState(0);

  // `?tab=` makes every tab linkable — the dashboard's «جراف القضايا» shortcut
  // is a link straight to ?tab=graph. Validated against TABS rather than trusted:
  // an unknown or absent value falls back to the overview instead of rendering a
  // blank panel.
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    TABS.some(t => t.id === requestedTab) ? (requestedTab as string) : "overview",
  );
  const [graphFullscreen, setGraphFullscreen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // "The file is stored, the screen may be stale" — a different message from
  // uploadError, because it is a different fact. See handleUpload.
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  // فشل فتح مستند. كان لا مكان له إطلاقاً في هذا الملف — انظر handleDownload.
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [fileInputEl, setFileInputEl] = useState<HTMLInputElement | null>(null);

  // Tasks tab — held as a ListRead, not an array. As `CaseTask[]` the old
  // `.catch(() => setTasks([]))` turned a failed read into an empty board, and
  // the counts below then printed ٠ open tasks over a case that has ten.
  const [tasksRead, setTasksRead] = useState<ListRead<CaseTask> | null>(null);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<TaskStatus | "all">("all");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  // ── Hearings linked to this case (Phase 1, public.hearings) ──
  const [hearingsRead, setHearingsRead] = useState<ListRead<HearingDto> | null>(null);
  const [hearingsLoading, setHearingsLoading] = useState(true);
  const [showAddHearing, setShowAddHearing] = useState(false);
  // The API already returns hearings date-asc (see the note on `hearings`
  // below), so this tab had no sort control at all. `false` keeps that order
  // (soonest first); `true` flips it (most recent first).
  const [hearingsSortDesc, setHearingsSortDesc] = useState(false);

  // ── درجات التقاضي linked to this case (Phase 1, public.case_stages) ──
  const [stagesRead, setStagesRead] = useState<ListRead<CaseStage> | null>(null);
  const [stagesLoading, setStagesLoading] = useState(true);
  const [showAddStage, setShowAddStage] = useState(false);
  // The stage currently open in RecordStageOutcomeModal — null closes it.
  const [editingStage, setEditingStage] = useState<CaseStage | null>(null);

  // ── المهل linked to this case (Phase 5, public.deadlines) ──
  const [deadlinesRead, setDeadlinesRead] = useState<ListRead<Deadline> | null>(null);
  const [deadlinesLoading, setDeadlinesLoading] = useState(true);
  const [showAddDeadline, setShowAddDeadline] = useState(false);
  // Optimistic «تمّ / إلغاء» on one row, mirroring رادار المهل's handleRowAction.
  const [deadlineRowBusy, setDeadlineRowBusy] = useState<Record<string, boolean>>({});
  const [deadlineRowError, setDeadlineRowError] = useState<Record<string, string>>({});

  // ── Case notes linked to this case (owner item 65, public.case_notes) ──
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

  const user = useUser();
  // Declared here (not beside loadCaseHearings further down) because the
  // `hearings` useMemo below reads it, and hooks below its own declaration
  // in the same component are a TDZ error, not just a style choice.
  const hearingsView = listViewState(hearingsLoading, hearingsRead);
  const caseHearings = itemsOf(hearingsRead);

  useEffect(() => {
    let cancelled = false;
    setDetailState("loading");
    getServiceRequestDetail(id)
      .then((r) => {
        if (cancelled) return;
        setRequest(r);
        // null is a 404 and only a 404 — see the note on `detailState`.
        setDetailState(r ? "ready" : "notfound");
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[lawyer case detail] fetch failed:", e);
        setRequest(null);
        setDetailState("unreadable");
      });
    return () => { cancelled = true; };
  }, [id, reloadKey]);

  const caseData = request;

  const status: CaseStatus = useMemo(() => mapStatus(caseData?.status), [caseData?.status]);
  const statusConf = STATUS_CONFIG[status];
  // One list, one index — read by the caption and by the bar. They used to be
  // an inline literal and a ternary recomputed on every stage of the map.
  const stageIdx =
    status === "active" ? 1 :
    status === "pending" ? 0 :
    status === "closed" ? 3 : 1;

  // ── Derived: hearings, from the real table now (Phase 1) ──
  // Was `caseData.metadata.hearings` (an array nothing wrote) with a fallback
  // to scanning `hearing.*` events. Both are gone: `caseHearings` above is the
  // one real source, GET /api/v1/lawyer/hearings?caseId=<this case>.
  const hearings: HearingRow[] = useMemo(() => {
    return caseHearings.map((h): HearingRow => ({
      // `h.date` is a wall-clock "YYYY-MM-DD", not an instant — parsed with an
      // explicit local midnight so a reader west of Riyadh does not see it
      // roll back a day (the exact bug documented at length in
      // /dashboard/lawyer/hearings's `eventDayDate`).
      date: formatHearingDate(h.date),
      court: h.location || "—",
      result: h.title,
      status: h.status === "scheduled" && h.date >= todayIso() ? "upcoming" : "done",
    }));
  }, [caseHearings]);

  // caseHearings is ordered by the API (date asc, time asc), so the first
  // "upcoming" row is genuinely the soonest.
  const nextHearing = hearings.find((h) => h.status === "upcoming");

  /** The hearings tab's sort toggle — see `hearingsSortDesc` above. `hearings`
   * is already date-asc, so flipping it is a plain reverse, not a re-sort. */
  const sortedHearings = useMemo(
    () => (hearingsSortDesc ? [...hearings].reverse() : hearings),
    [hearings, hearingsSortDesc],
  );

  // ── Derived: timeline from events ──
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

  // ── Derived: notes from events (case.note* or metadata.text) ──
  const notes: NoteRow[] = useMemo(() => {
    if (!caseData?.events) return [];
    return caseData.events
      .filter((e) => {
        const ev = (e.event || "").toLowerCase();
        const hasText = !!((e.metadata as any)?.text);
        return ev.startsWith("case.note") || ev.startsWith("service_request.note") || ev === "note_added" || hasText;
      })
      .map((e) => ({
        author: e.actor_name || "—",
        text: String((e.metadata as any)?.text ?? caseEventLabel(e.event)),
        date: formatDate(e.created_at),
      }))
      .reverse();
  }, [caseData]);

  // ── Case notes (public.case_notes, this case) ──
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
      console.error("[lawyer case detail] addCaseNote failed:", e);
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
      console.error("[lawyer case detail] updateCaseNote failed:", e);
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
      console.error("[lawyer case detail] deleteCaseNote failed:", e);
      setNoteError(e instanceof Error && e.message ? e.message : "تعذّر حذف الملاحظة.");
    } finally {
      setDeletingNoteId(null);
    }
  };

  // ── Derived: documents from attachments ──
  const documents = caseData?.attachments ?? [];

  // ── Derived: team = assigned lawyer + client ──
  //
  // `assignedTo` معرّف حساب (UUID) وليس اسماً، و`api/v1/service-requests/[id]/
  // route.ts`'s GET كان يعيده بلا أي ضمّ لجدول profiles — فكان يُعرض هنا اسماً
  // كاملاً تحت «المحامي المسؤول» وتُشتق منه الحرف الأول للصورة الرمزية، أي خانة
  // سداسية عشرية داخل الدائرة. المسار الآن يضمّ `profiles.display_name` عبر
  // عميل service-role (بحث finding 183) ويعيده كـ`assignedToName`؛ يُعرض عند
  // توفره، وإلا فواقعة الإسناد وحدها كما كانت.
  const team = useMemo(() => {
    if (!caseData) return [] as { name: string; role: string; avatar: string; nameKnown: boolean }[];
    const members: { name: string; role: string; avatar: string; nameKnown: boolean }[] = [];
    if (caseData.assignedTo) {
      const name = caseData.assignedToName?.trim();
      members.push({
        name: name || "الاسم غير متاح",
        role: "المحامي المسؤول",
        avatar: name ? name.charAt(0) : "",
        nameKnown: !!name,
      });
    }
    if (caseData.requester?.name) {
      members.push({
        name: caseData.requester.name,
        role: "الموكل",
        avatar: caseData.requester.name.charAt(0),
        nameKnown: true,
      });
    }
    return members;
  }, [caseData]);

  // ── Tasks linked to this case ──
  // A task is a service_requests row whose metadata.caseId points here, so the
  // whole tab is GET /api/v1/lawyer/tasks?caseId=<this case>. Archived
  // (cancelled) tasks are dropped — this tab has no archive column to put them
  // in, and folding them into "لم تبدأ" would overstate the open workload.
  const loadCaseTasks = useCallback(() => {
    if (!id) return;
    setTasksLoading(true);
    getLawyerTasks({ caseId: id })
      .then(read => {
        // The failure travels with the value now: `ok: false` in, `ok: false`
        // out. No `total` is carried across because the archived rows are
        // filtered out here, so the server's count would no longer describe
        // this list — and getLawyerTasks reports none to begin with.
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

  // ── Hearings linked to this case ──
  // GET /api/v1/lawyer/hearings?caseId=<this case>. Until Phase 1
  // (2026-09-03) there was no hearings table at all — this tab read
  // `caseData.metadata.hearings`, an array nothing ever wrote, and rendered
  // the disabled «إضافة جلسة · قريباً» button underneath the honest empty
  // state saying so.
  const loadCaseHearings = useCallback(() => {
    if (!id) return;
    setHearingsLoading(true);
    getLawyerHearings({ caseId: id })
      .then(({ hearings: rows }) => setHearingsRead(listOk(rows)))
      .catch(() => setHearingsRead(listFailed<HearingDto>()))
      .finally(() => setHearingsLoading(false));
  }, [id]);

  useEffect(() => { loadCaseHearings(); }, [loadCaseHearings]);

  // ── درجات التقاضي linked to this case ──
  // GET /api/v1/lawyer/case-stages/[caseId] (Phase 1, public.case_stages,
  // last of the five surfaces). Ordered server-side (position, opened_on).
  const loadCaseStages = useCallback(() => {
    if (!id) return;
    setStagesLoading(true);
    getCaseStages(id)
      .then(({ items }) => setStagesRead(listOk(items)))
      .catch(() => setStagesRead(listFailed<CaseStage>()))
      .finally(() => setStagesLoading(false));
  }, [id]);

  useEffect(() => { loadCaseStages(); }, [loadCaseStages]);

  // ── المهل linked to this case ──
  // GET /api/v1/lawyer/deadlines?caseId=<this case>&status=all — loaded eagerly
  // on mount, same as hearings/stages above, so the tab's count is right the
  // first time the lawyer opens it rather than only after they click the tab.
  const loadDeadlines = useCallback(() => {
    if (!id) return;
    setDeadlinesLoading(true);
    getDeadlines({ caseId: id, status: "all", limit: 200 })
      .then(setDeadlinesRead)
      .finally(() => setDeadlinesLoading(false));
  }, [id]);

  useEffect(() => { loadDeadlines(); }, [loadDeadlines]);

  // AddHearingModal dispatches this on a confirmed save (same signal the
  // standalone diary listens for) — without it, a hearing added from this
  // very case file would not appear until the page was reloaded.
  useEffect(() => {
    const onUpdated = () => loadCaseHearings();
    window.addEventListener("nzamy-workflow-updated", onUpdated);
    return () => window.removeEventListener("nzamy-workflow-updated", onUpdated);
  }, [loadCaseHearings]);

  const stagesView = listViewState(stagesLoading, stagesRead);
  const caseStages = itemsOf(stagesRead);

  const deadlinesView = listViewState(deadlinesLoading, deadlinesRead);
  const caseDeadlines = itemsOf(deadlinesRead);
  // Open/missed need attention first (soonest due date on top); done/cancelled
  // are history, most recent first. Together the two filters are exhaustive
  // over DeadlineStatus — every row lands in exactly one of them.
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
  // Gates the header count — an unreadable/loading read must never print
  // «لا مهل مسجَّلة» (itemsOf returns [] for a failed read too), which is
  // exactly the false "empty" claim listRead.ts exists to prevent.
  const deadlinesKnown = deadlinesView === "ready" || deadlinesView === "empty";

  // Optimistic «تمّ / إلغاء» on one deadline row, rolled back on failure —
  // mirrors رادار المهل's handleRowAction (src/app/dashboard/lawyer/deadlines/page.tsx).
  const handleDeadlineAction = async (deadline: Deadline, next: "done" | "cancelled") => {
    setDeadlineRowBusy((b) => ({ ...b, [deadline.id]: true }));
    setDeadlineRowError((e) => { const n = { ...e }; delete n[deadline.id]; return n; });
    setDeadlinesRead((prev) => (prev && prev.ok
      ? listOk(prev.items.map((d) => (d.id === deadline.id ? { ...d, status: next } : d)), prev.total)
      : prev));
    try {
      await updateDeadline(deadline.id, { status: next });
      loadDeadlines();
    } catch (err) {
      setDeadlinesRead((prev) => (prev && prev.ok
        ? listOk(prev.items.map((d) => (d.id === deadline.id ? deadline : d)), prev.total)
        : prev));
      setDeadlineRowError((e) => ({
        ...e,
        [deadline.id]: err instanceof Error && err.message ? err.message : "تعذّر تحديث المهلة.",
      }));
    } finally {
      setDeadlineRowBusy((b) => ({ ...b, [deadline.id]: false }));
    }
  };

  const tasksView = listViewState(tasksLoading, tasksRead);
  const tasks = itemsOf(tasksRead);
  // Every count on this page is gated on this. A number rendered over an
  // unreadable read is a claim about the lawyer's workload, and «٠ لم تبدأ» on
  // a case with eight open tasks is the version of it that gets someone hurt.
  const tasksKnown = tasksView === "ready" || tasksView === "empty";

  /**
   * Apply an in-place edit to the loaded tasks.
   *
   * Only a read that SUCCEEDED can be edited: patching items into a failed read
   * would rebuild the very "empty list plus one row" that the ListRead contract
   * exists to prevent.
   */
  const patchTasks = useCallback((fn: (prev: CaseTask[]) => CaseTask[]) => {
    setTasksRead(prev => (prev?.ok ? listOk(fn(prev.items), prev.total) : prev));
  }, []);

  const taskStats = {
    done:       tasks.filter(t => t.status === "done").length,
    inprogress: tasks.filter(t => t.status === "inprogress").length,
    todo:       tasks.filter(t => t.status === "todo").length,
  };

  const visibleTasks = taskFilter === "all" ? tasks : tasks.filter(t => t.status === taskFilter);

  // ── Overview cockpit: مهام عاجلة ──
  // Not-done tasks due within 7 days or already overdue, soonest/most-overdue
  // first — same `tasks` read the Tasks tab renders, so this list and that
  // tab can never disagree about which tasks exist. Gated on `tasksKnown` for
  // the same reason the stat tiles above are: an unreadable read must never
  // present as "no urgent tasks".
  const urgentTasks = useMemo(
    () => (tasksKnown ? urgentCaseTasks(tasks, todayIso()) : []),
    [tasks, tasksKnown],
  );

  // ── Overview cockpit: المهلة القادمة ──
  // The soonest still-open deadline, from the same `caseDeadlines` read the
  // المهل tab renders. The header card above already shows «الجلسة القادمة»
  // on every tab (including this one) — this fills the other half, which
  // nothing on the page surfaced before.
  const nextDeadline = useMemo(
    () => (deadlinesKnown ? nextOpenDeadline(caseDeadlines, todayIso()) : null),
    [caseDeadlines, deadlinesKnown],
  );

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
      // On a list that was never read there is nothing to prepend to — re-read
      // instead, so the new task appears in a list that is actually complete.
      if (tasksRead?.ok) patchTasks(prev => [toCaseTask(created), ...prev]);
      else loadCaseTasks();
      setNewTaskTitle("");
    } catch (e) {
      console.error("[lawyer case detail] addTask failed:", e);
      setTaskError(e instanceof Error && e.message ? e.message : "تعذّر إضافة المهمة.");
    } finally {
      setAddingTask(false);
    }
  };

  // Optimistic, with a real revert — the counts above must never claim a move
  // the server refused.
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

  // The checklist is one metadata.subtasks array on the task row, so a tick
  // sends the array back whole and the server merges it over the task's other
  // metadata (caseId, dueDate, …). Optimistic with a real revert, like above.
  const toggleCaseSubtask = async (task: CaseTask, subtaskId: string) => {
    const previous = task.subtasks;
    const next = previous.map(s => (s.id === subtaskId ? { ...s, done: !s.done } : s));
    patchTasks(prev => prev.map(t => (t.id === task.id ? { ...t, subtasks: next } : t)));
    const ok = await updateLawyerTaskSubtasks(task.id, next);
    if (!ok) {
      patchTasks(prev => prev.map(t => (t.id === task.id ? { ...t, subtasks: previous } : t)));
      setTaskError("تعذّر حفظ خطوة العمل.");
    }
  };

  // ── Notes composer: REMOVED, not re-implemented, and not merely disabled. ──
  //
  // `saveNote` and the textarea it sat under both stood here. The disabled
  // «حفظ الملاحظة · قريباً» button and its amber caption were honest about
  // the button; the still-live, still-editable textarea beside it was not —
  // an empty composer waiting for text is the one shape every interface on
  // earth uses to mean "type here, this will be kept", regardless of what a
  // 10px pill beside it says. There is nowhere for that text to go, so the
  // composer itself had to go, not just the button.
  //
  // Checked before removing (per the owner's item): no `case_notes` /
  // `lawyer_case_notes` table exists, no /api/v1/cases/[id]/notes (or
  // equivalent) route exists, and the Phase 1 case-tables migration
  // (20260903_phase1_case_tables.sql) adds none. The one candidate write path
  // is the POST in src/app/api/v1/service-requests/[id]/events/route.ts, and
  // it cannot carry a note today at two levels, not one: the route forwards
  // only `{ event, actorName }` into `recordEvent`, AND `recordEvent`'s own
  // header (src/lib/events.ts) states `request_events` has NO `metadata`
  // column at all — forwarding the field would still have nowhere to land
  // without a migration. Real note-taking needs a table and a route; neither
  // is this file's to add. The read side stays: `notes` above still maps
  // `metadata.text` off any event that does carry it, so a note recorded any
  // other way (support tooling, a future write path) keeps showing up here.

  // ── Document upload: wire to documentService.uploadDocumentFile ──
  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadNotice(null);
    // ── TWO STEPS, TWO VERDICTS ──────────────────────────────────────────────
    // The upload and the refresh that follows it used to share one try/catch,
    // and `getServiceRequestDetail` now THROWS on any failure that is not a
    // 404. So a document that reached storage, followed by a dropped refetch,
    // reported «تعذّر رفع المستند» — the lawyer re-uploads a file that is
    // already there, or gives up on filing it at all. The upload's own verdict
    // is decided before the refresh is even attempted.
    try {
      await uploadDocumentFile(file, { requestId: id });
    } catch (e: any) {
      console.error("[lawyer case detail] upload failed:", e);
      setUploadError(e?.message ?? "تعذّر رفع المستند.");
      setUploading(false);
      return;
    }
    // Past this line the file IS stored. Nothing below may say otherwise.
    try {
      const r = await getServiceRequestDetail(id);
      if (r) setRequest(r);
      else setUploadNotice("تم رفع المستند. تعذّرت إعادة قراءة القضية، فقد لا تظهر القائمة أدناه محدَّثة.");
    } catch (e) {
      console.error("[lawyer case detail] post-upload refetch failed:", e);
      setUploadNotice("تم رفع المستند بنجاح، لكن تعذّرت إعادة قراءة القضية. حدّث الصفحة لعرضه في القائمة.");
    } finally {
      setUploading(false);
    }
  };

  /**
   * فتح مستند في تبويب جديد — ويقول ما جرى حين لا يُفتح.
   *
   * كان الفشل صامتاً بالكامل: `getDocumentFileUrl` يعيد `null` عند أي خطأ تخزين
   * (documentService.ts:480) ويرمي `DocumentTimeoutError` عند تجاوز المهلة، ولم
   * يكن هنا `else` ولا أي حالة تحمل الخبر — فيضغط المحامي «عرض/تحميل» فلا يحدث
   * شيء إطلاقاً، ثم يضغط مرة أخرى. الفشل كان في اليد أصلاً في كلا الفرعين؛
   * الناقص كان عرضه. الشرَك نفسه في `uploadError` فوقه، واللافتة أدناه جواره.
   *
   * الفعل المكتوب هو «فتح» لا «تنزيل»: الزرّان كلاهما ينادي هذه الدالة، وما تفعله
   * هو `window.open` — تسمية الفشل بغير ما جرى هي بذاتها جملة غير صحيحة.
   * واسم الملف داخل الرسالة لأن اللافتة تعلو قائمة قد تحمل عشرة مستندات.
   */
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
      console.error("[lawyer case detail] download failed:", e);
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
  //
  // Its OWN screen, deliberately not sharing one with «القضية غير موجودة».
  // The old subtitle — «قد يكون الرابط غير صحيح أو أن القضية محذوفة» — is a
  // guess about the case, and printing it after a 500 or a dropped connection
  // told a lawyer their live matter had been deleted.
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
          <Link href="/dashboard/lawyer/cases" className="text-sm text-[#0B3D2E] hover:underline">← العودة للقضايا</Link>
        </div>
      </div>
    );
  }

  // ── Render: not-found (HTTP 404, and only that) ──
  if (detailState === "notfound" || !caseData) {
    return (
      <div className="max-w-[1100px] mx-auto py-20 text-center" dir="rtl">
        <div className={`inline-flex flex-col items-center gap-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
          <Warning size={40} className={isDark ? "text-zinc-700" : "text-slate-300"} />
          <p className="text-lg font-bold">القضية غير موجودة</p>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>قد يكون الرابط غير صحيح أو أن القضية محذوفة.</p>
          <Link href="/dashboard/lawyer/cases" className="mt-2 text-sm text-[#0B3D2E] hover:underline">← العودة للقضايا</Link>
        </div>
      </div>
    );
  }

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const clientType: "individual" | "corporate" =
    String(caseData.requester?.role ?? "").toLowerCase().includes("company") ||
    String(caseData.requester?.role ?? "").toLowerCase().includes("business") ||
    String((caseData.metadata as any)?.clientType ?? "").toLowerCase() === "corporate"
      ? "corporate"
      : "individual";

  const court = String((caseData.metadata as any)?.court ?? "—");
  const valueRaw = (caseData.metadata as any)?.value;
  const value = valueRaw ? String(valueRaw) : undefined;
  const filedDate = formatDate(caseData.createdAt);
  const referenceNo = caseData.id;
  // كان هذا يطبع `assigned_to` كما هو تحت أيقونة شخص في ترويسة القضية — أي UUID
  // في موضع اسم المحامي. الاسم الحقيقي متاح الآن عبر `assignedToName` (اقرأ
  // التعليق على `team` أعلاه)؛ يُعرض عند توفره، وإلا فواقعة الإسناد وحدها.
  const assigneeName = caseData.assignedToName?.trim();
  const assigneeDisplay = assigneeName || (caseData.assignedTo ? "مُسندة إلى محامٍ" : "غير مُسندة");

  return (
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">

      {/* Breadcrumb */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Link href="/dashboard/lawyer/cases"
          className={`inline-flex items-center gap-1.5 text-[13px] transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
          <ArrowRight size={13} />
          ملف القضايا
        </Link>
      </motion.div>

      {/* Header card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className={`${card} p-5`}>
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${statusConf.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
                {statusConf.label}
              </span>
              <span className={`text-[11px] px-2 py-1 rounded-lg ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>
                {CASE_TYPE_LABELS[caseData.type] ?? caseData.type}
              </span>
              <span className={`text-[11px] font-mono ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                {referenceNo}
              </span>
            </div>
            <h1 className={`text-xl font-bold mb-2 leading-snug ${isDark ? "text-white" : "text-slate-800"}`}
              style={{ fontFamily: "var(--font-brand)" }}>
              {caseData.title || "بدون عنوان"}
            </h1>
            <div className={`flex items-center gap-4 text-[12px] flex-wrap ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <span className="flex items-center gap-1.5">
                {clientType === "corporate" ? <Buildings size={13} /> : <User size={13} />}
                {caseData.requester?.name ?? "—"}
              </span>
              <span className="flex items-center gap-1.5"><MapPin size={13} />{court}</span>
              {/* `Scales`, not `User`. The field two rows up — the CLIENT — also
                  drew a person, so the row read as two people with no way to
                  tell which was which (finding 183). The scales are the lawyer
                  in this product's own icon vocabulary; they are what the case
                  tab strip uses.
                  The NAME half of 183 is resolved server-side now — the GET
                  route joins `assigned_to` to `profiles.display_name` via a
                  service-role client (RLS only allows "own row" / admin) and
                  returns it as `assignedToName`; shown when present, else the
                  bare fact of assignment. */}
              <span className="flex items-center gap-1.5"><Scales size={13} />{assigneeDisplay}</span>
              {value && (
                <span className="flex items-center gap-1.5"><MoneyWavy size={13} />{value}</span>
              )}
              <span className="flex items-center gap-1.5"><CalendarCheck size={13} />تاريخ التقديم: {filedDate}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            {nextHearing && (
              <div className={`px-3 py-2 rounded-xl text-center ${isDark ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"}`}>
                <p className={`text-[10px] font-semibold mb-0.5 ${isDark ? "text-amber-500/70" : "text-amber-600"}`}>الجلسة القادمة</p>
                <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                  <CalendarCheck size={12} className="inline ml-1" />{nextHearing.date}
                </p>
              </div>
            )}
            <Link href="/ai/draft"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
              <PencilSimple size={14} />صياغة مذكرة
            </Link>
            <Link href="/ai/wargaming"
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <Robot size={14} />محاكي الخصم
            </Link>
          </div>
        </div>

        {/* Stage bar — derived from status (no mock stage string) */}
        <div className={`mt-4 pt-4 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          {/* Was «الحالة الحالية» + `statusConf.label` — so the caption said
              «انتظار» while the four stages drawn directly beneath it are
              «تقديم / قيد التداول / مراجعة / إغلاق». Two vocabularies for one
              position, one above the other, and «انتظار» is not among the four
              — a lawyer reading the card cannot tell which stage the case is
              in. The status itself is already a chip in the header of this same
              card (line ~743), so this row was also saying it twice.
              It now names the STAGE — the same word that lights up below it. */}
          <div className="flex items-center justify-between text-[12px] mb-1.5">
            <span className={isDark ? "text-zinc-500" : "text-slate-400"}>المرحلة الحالية</span>
            <span className={`font-medium ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{CASE_STAGES[stageIdx]}</span>
          </div>
          {/* القضية الملغاة لا تُعرض على شريط المراحل: الشريط يقول «كم قطعت هذه
              القضية من طريقها»، وطيّ `cancelled` في "closed" كان يملؤه حتى «إغلاق»
              فيقرأ كأنها اكتملت. وشريط فارغ تماماً كان سيُقرأ كهيكل تحميل، فجملة
              واحدة صريحة مكانه. */}
          {status === "cancelled" ? (
            <p className={`text-[12px] font-semibold ${isDark ? "text-rose-400" : "text-rose-600"}`}>
              أُلغيت هذه القضية — لم تُستكمل مراحل التقاضي.
            </p>
          ) : (
          <div className="flex items-center gap-1">
            {CASE_STAGES.map((s, i) => {
              return (
                <div key={s} className="flex-1 flex flex-col items-center">
                  <div className={`h-1.5 w-full rounded-full ${i <= stageIdx ? "bg-royal" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`} />
                  <p className={`text-[9px] mt-1 text-center ${i <= stageIdx ? "text-royal" : isDark ? "text-zinc-700" : "text-slate-300"}`}>{s}</p>
                </div>
              );
            })}
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
              <div className={`lg:col-span-2 ${card} p-5 space-y-4`}>
                <div>
                  <h2 className={`text-sm font-bold mb-2 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                    <Scales size={14} className="text-royal" />وقائع القضية
                  </h2>
                  <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    {caseData.description || "لا يوجد وصف متاح لهذه القضية."}
                  </p>
                </div>
                {/* AI evaluation — neutral "قريباً" state (no fabricated percentage) */}
                <div className={`p-3 rounded-xl border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#C8A762]/30 bg-[#C8A762]/5"}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Robot size={13} className="text-[#C8A762]" />
                    <span className="text-[11px] font-bold text-[#C8A762]">تقييم نظامي AI</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#C8A762]/10 text-[#C8A762]">قريباً</span>
                  </div>
                  <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    تحليل AI لقوة موقف الموكل سيكون متاحاً قريباً عند تفعيل أداة تحليل الملف.
                  </p>
                  <Link href="/ai/analyze-strength"
                    className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-[#C8A762] hover:underline">
                    <ArrowUpRight size={10} />تحليل تفصيلي
                  </Link>
                </div>
                {/* Task quick summary.
                    «٠ لم تبدأ» over a failed read is a statement that this case
                    has no open work — the one thing a lawyer glancing at an
                    overview would act on. On anything but a completed read the
                    figures are withheld and the reason is printed instead. */}
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>حالة المهام</p>
                  <div className={`grid grid-cols-3 gap-2 p-3 rounded-xl ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
                    {[
                      { label: "مكتملة",     value: taskStats.done,       color: "text-emerald-500" },
                      { label: "قيد التنفيذ", value: taskStats.inprogress, color: "text-blue-500" },
                      { label: "لم تبدأ",    value: taskStats.todo,        color: "text-slate-400" },
                    ].map((s, i) => (
                      <div key={i} className="text-center">
                        <p className={`text-lg font-bold ${tasksKnown ? s.color : isDark ? "text-zinc-600" : "text-slate-300"}`}>
                          {tasksKnown ? toArabicDigits(s.value) : "—"}
                        </p>
                        <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {!tasksKnown && (
                  <p className={`text-[11px] -mt-2 text-center font-semibold ${
                    tasksView === "loading" ? isDark ? "text-zinc-600" : "text-slate-400" : "text-amber-500"
                  }`}>
                    {tasksView === "loading" ? "جارٍ قراءة المهام…" : "تعذّرت قراءة المهام — الأرقام أعلاه غير معروفة."}
                  </p>
                )}
              </div>
              {/* Right rail — the cockpit itself: what needs attention first
                  (مهام عاجلة, المهلة القادمة — both from reads the page
                  already makes for the Tasks/المهل tabs), then the existing
                  history (المخطط الزمني), then a peek at آخر الملاحظات. The
                  header card above already shows «الجلسة القادمة» on every
                  tab including this one, so hearings are not repeated here. */}
              <div className="space-y-4">
                {/* مهام عاجلة — not-done tasks due within 7 days or overdue */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-sm font-bold mb-3 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                    <Warning size={14} className="text-amber-500" />مهام عاجلة
                  </h2>
                  {!tasksKnown ? (
                    <p className={`text-[11px] text-center py-4 ${tasksView === "loading" ? (isDark ? "text-zinc-600" : "text-slate-400") : "font-semibold text-amber-500"}`}>
                      {tasksView === "loading" ? "جارٍ التحقق من المهام…" : "تعذّرت قراءة المهام — قائمة العاجلة غير معروفة."}
                    </p>
                  ) : urgentTasks.length === 0 ? (
                    <p className={`text-[11px] text-center py-4 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      لا مهام مستحقة خلال الأيام السبعة القادمة
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {urgentTasks.map((t) => {
                        const chip = daysLeftChip(t.daysLeft, isDark);
                        return (
                          <button key={t.id} onClick={() => setActiveTab("tasks")} title="فتح في تبويب المهام"
                            className={`w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-start transition-colors ${isDark ? "hover:bg-white/[0.05]" : "hover:bg-slate-50"}`}>
                            <span className={`min-w-0 flex-1 truncate text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{t.title}</span>
                            {chip && (
                              <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${chip.cls}`}>{chip.label}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* المهلة القادمة — soonest still-open deadline */}
                <div className={`${card} p-5`}>
                  <h2 className={`text-sm font-bold mb-3 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                    <Timer size={14} className="text-royal" />المهلة القادمة
                  </h2>
                  {!deadlinesKnown ? (
                    <p className={`text-[11px] text-center py-2 ${deadlinesView === "loading" ? (isDark ? "text-zinc-600" : "text-slate-400") : "font-semibold text-amber-500"}`}>
                      {deadlinesView === "loading" ? "جارٍ التحقق من المهل…" : "تعذّرت قراءة المهل — الموعد القادم غير معروف."}
                    </p>
                  ) : nextDeadline === null ? (
                    <p className={`text-[11px] text-center py-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا مهل قادمة مسجّلة</p>
                  ) : (
                    <button onClick={() => setActiveTab("deadlines")} title="فتح في تبويب المهل"
                      className="w-full flex items-center justify-between gap-2 text-start">
                      <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{nextDeadline.title}</span>
                      {(() => {
                        const chip = daysLeftChip(nextDeadline.daysLeft, isDark);
                        return chip ? (
                          <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${chip.cls}`}>{chip.label}</span>
                        ) : null;
                      })()}
                    </button>
                  )}
                </div>

                {/* Timeline */}
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

                {/* آخر الملاحظات — a peek, not the full log; «الملاحظات» tab
                    has that. Closes the other half of the cockpit the header
                    card doesn't. Still the EVENT-derived feed specifically
                    (`caseData.events`, unchanged by owner item 65) — the real
                    saved public.case_notes rows the tab now also shows have
                    no cockpit peek of their own yet. */}
                <div className={`${card} p-5`}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                      <ChatDots size={14} className="text-royal" />آخر الملاحظات
                    </h2>
                    {notes.length > 0 && (
                      <button onClick={() => setActiveTab("notes")} className="text-[11px] font-semibold text-royal hover:underline">
                        عرض الكل
                      </button>
                    )}
                  </div>
                  {notes.length === 0 ? (
                    <p className={`text-[11px] text-center py-4 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد ملاحظات بعد</p>
                  ) : (
                    <div className="space-y-1">
                      {notes.slice(0, 3).map((n, i) => (
                        <button key={i} onClick={() => setActiveTab("notes")} title="فتح في تبويب الملاحظات"
                          className={`w-full text-start rounded-xl px-2.5 py-2 transition-colors ${isDark ? "hover:bg-white/[0.05]" : "hover:bg-slate-50"}`}>
                          <p className={`text-[10px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{n.author} · {n.date}</p>
                          <p className={`text-[12px] mt-0.5 line-clamp-2 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{n.text}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Tasks — service_requests rows carrying metadata.caseId === this case ── */}
          {activeTab === "tasks" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-1.5">
                  {(["all", "todo", "inprogress", "done"] as const).map(s => {
                    const count = s === "all" ? tasks.length : taskStats[s];
                    const on = taskFilter === s;
                    return (
                      <button key={s} onClick={() => setTaskFilter(s)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${
                          on
                            ? "border-[#0B3D2E]/30 bg-[#0B3D2E]/10 text-[#0B3D2E] dark:text-emerald-300"
                            : isDark ? "border-white/[0.06] text-zinc-400 hover:text-zinc-200" : "border-slate-100 text-slate-500 hover:text-slate-700"
                        }`}>
                        {s !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${TASK_STATUS[s].dot}`} />}
                        {s === "all" ? "الكل" : TASK_STATUS[s].label}
                        {/* Same rule as the overview tiles: a chip reading ٠ is
                            a count, and there is no count behind a failed read. */}
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                          {tasksKnown ? count : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick-add — the case id is passed through so the task comes
                  back on this tab, and on the lawyer's Kanban, without a
                  second step. */}
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
                /* The board that used to appear here after a failed read was
                   empty and said «لا توجد مهام لهذه القضية بعد» — a verdict on
                   the case file, delivered by a request that never arrived. */
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
              ) : visibleTasks.length === 0 ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <CheckSquare size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                    {tasks.length === 0 ? "لا توجد مهام لهذه القضية بعد" : "لا توجد مهام بهذه الحالة"}
                  </p>
                  <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    {tasks.length === 0 ? "أضف أول مهمة من الحقل أعلاه." : "جرّب تبويباً آخر."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleTasks.map((t, i) => {
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

                          {/* Subtasks — «المهام والـ Subtasks المرتبطة بالقضية».
                              Tickable here as well as on the Kanban; both write
                              the same metadata.subtasks array. */}
                          {t.subtasks.length > 0 && (() => {
                            const doneCount = t.subtasks.filter(s => s.done).length;
                            const total = t.subtasks.length;
                            return (
                              <div className={`mt-2.5 pt-2.5 border-t border-dashed ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className={`text-[10px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                                    خطوات العمل
                                  </span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                    doneCount === total
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                                      : isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-500"
                                  }`}>
                                    {toArabicDigits(doneCount)} من {toArabicDigits(total)}
                                  </span>
                                  <div className={`flex-1 h-1 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                                    <motion.div
                                      className="h-full rounded-full bg-[#0B3D2E] dark:bg-emerald-400"
                                      initial={false}
                                      animate={{ width: `${(doneCount / total) * 100}%` }}
                                      transition={{ type: "spring", stiffness: 120, damping: 20 }}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  {t.subtasks.map(sub => (
                                    <button key={sub.id} onClick={() => toggleCaseSubtask(t, sub.id)}
                                      title="تغيير حالة الخطوة"
                                      className={`w-full flex items-center gap-2 rounded-lg px-1.5 py-1 text-start transition-colors ${
                                        isDark ? "hover:bg-white/[0.04]" : "hover:bg-slate-50"
                                      }`}>
                                      <span className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                                        sub.done
                                          ? "border-emerald-400 bg-emerald-500"
                                          : isDark ? "border-white/[0.16]" : "border-slate-300"
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
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        <Link href="/dashboard/lawyer/tasks" title="عرض في لوحة المهام"
                          className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]" : "text-slate-300 hover:text-slate-600 hover:bg-slate-100"}`}>
                          <Eye size={14} />
                        </Link>
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
                  {/* Was `{hearings.length} جلسات مسجّلة`, which printed a
                      Western digit beside this page's Arabic-Indic dates and
                      used the plural for every count — «0 جلسات» and
                      «1 جلسات» both. Arabic agreement has five branches, and
                      they live in one place now. */}
                  {countPhraseAr(hearings.length, HEARINGS_COUNT)}
                </p>
                <div className="flex items-center gap-2">
                  {/* No sort, no filter, and no link out to the standalone
                      hearings calendar existed on this tab. The sort here is
                      the one real dimension the data has (date); the link
                      opens the same diary this hearing was added through. */}
                  {hearings.length > 1 && (
                    <button onClick={() => setHearingsSortDesc(v => !v)}
                      title={hearingsSortDesc ? "الأحدث أولاً" : "الأقرب أولاً"}
                      className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-semibold border transition-colors ${isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                      <SortAscending size={13} />
                      {hearingsSortDesc ? "الأحدث أولاً" : "الأقرب أولاً"}
                    </button>
                  )}
                  <Link href="/dashboard/lawyer/hearings" title="فتح تقويم الجلسات العام"
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-semibold border transition-colors ${isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    <CalendarCheck size={13} />تقويم الجلسات
                  </Link>
                  {/* Was `disabled title="قريباً"` — the hearings table did not
                      exist. Phase 1 (2026-09-03) built it; this button opens the
                      same AddHearingModal the standalone diary uses, with the
                      case pre-filled via `caseRequestId` so it cannot be typed
                      wrong or left unlinked. */}
                  <button onClick={() => setShowAddHearing(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22] transition-colors">
                    <Plus size={12} weight="bold" />إضافة جلسة
                  </button>
                </div>
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
                sortedHearings.map((h, i) => (
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
                  {caseStages.length === 0 ? "لا درجات تقاضٍ مسجّلة" : `${toArabicDigits(caseStages.length)} درجة تقاضٍ`}
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
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border whitespace-nowrap ${outcome.color}`}>{outcome.label}</span>
                          <button onClick={() => setEditingStage(s)}
                            className={`text-[11px] font-bold whitespace-nowrap hover:underline ${isDark ? "text-[#C8A762]" : "text-royal"}`}>
                            {!s.outcome || s.outcome === "pending" ? "تسجيل النتيجة" : "تعديل النتيجة"}
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
                  <button onClick={loadDeadlines}
                    className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-royal hover:underline">
                    <ArrowClockwise size={13} /> إعادة المحاولة
                  </button>
                </div>
              ) : deadlinesView === "empty" ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center text-center`}>
                  <Timer size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا مهل لهذه القضية بعد</p>
                  <p className={`text-[11px] mt-1 max-w-[320px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
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
                      onAction={(next) => handleDeadlineAction(d, next)}
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
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{countPhraseAr(documents.length, DOCUMENTS_COUNT)}</p>
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
              {/* رابط لم يُنشأ. حتى الآن كان زرّا «عرض/تحميل» و«تحميل» يفشلان بلا أثر
                  على الشاشة — انظر handleDownload. */}
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
                      <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        {formatFileSize(doc.file_size)} · {formatDate(doc.created_at)}
                        {doc.uploaderName ? ` · رفعه ${doc.uploaderName}` : ""}
                      </p>
                    </div>
                    {/* Always visible — was left to hover-only buttons filling
                        the same corner, so a short file name left most of the
                        row's width blank at rest (finding 191). This is also
                        the honest slice of "category" the row can show: real
                        `mime_type` data, not an invented taxonomy (finding
                        190) — uploader now shows too, on the line above, when
                        the service-role join resolved a name; see the note on
                        `fileTypeLabel` above. */}
                    <span className={`hidden sm:inline-block flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>
                      {fileTypeLabel(doc.mime_type)}
                    </span>
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

          {/* ── Team ── */}
          {activeTab === "team" && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {team.length} أعضاء في الفريق
                </p>
              </div>
              {team.length === 0 ? (
                <div className={`${card} p-10 flex flex-col items-center justify-center`}>
                  <UsersThree size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا يوجد فريق معيّن</p>
                </div>
              ) : (
                team.map((m, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className={`${card} p-4`}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-royal/10 flex items-center justify-center flex-shrink-0">
                        {/* بلا اسم لا يوجد حرف أول: أيقونة، لا خانة من المعرّف. */}
                        {m.nameKnown
                          ? <span className="text-[17px] font-bold text-royal">{m.avatar}</span>
                          : <User size={20} weight="duotone" className="text-royal" />}
                      </div>
                      <div className="flex-1">
                        <p className={`text-[14px] font-semibold ${
                          m.nameKnown
                            ? isDark ? "text-zinc-100" : "text-slate-800"
                            : isDark ? "text-zinc-500" : "text-slate-400"
                        }`}>{m.name}</p>
                        <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{m.role}</p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}

          {/* ── Graph ── */}
          {activeTab === "graph" && (
            <div className={`${card} overflow-hidden`} style={{ height: "580px" }}>
              <div className={`p-3 border-b flex items-center gap-2 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                <Graph size={14} weight="duotone" className="text-royal" />
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                  خريطة القضية البصرية — {caseData.title}
                </p>
                {/* A «نظامي AI» pill sat here, in the same header as the real case
                    title. The platform contributes nothing to this board: the
                    cards are the lawyer's own, the canvas has no analysis engine
                    behind it, and until this pass the pill was worse than
                    decorative — the board underneath it was seeded with an
                    invented contractor dispute (MOCK_NODES, now removed) that the
                    badge attributed to نظامي. Nothing here is AI-produced, so
                    nothing here is labelled as such. The `mr-auto` that pushed the
                    fullscreen button to the far edge lived on that pill and has
                    moved onto the button itself. */}
                <button
                  onClick={() => setGraphFullscreen(f => !f)}
                  className={`mr-auto p-1.5 rounded-xl transition-colors ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}
                  title="ملء الشاشة"
                >
                  <ArrowsOut size={14} />
                </button>
              </div>
              <div className="h-[calc(100%-48px)]">
                <CaseGraphView isDark={isDark} isGlobal={false} caseId={id} />
              </div>
              {graphFullscreen && (
                <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: isDark ? "#0f0f0f" : "#f8f8f8" }}>
                  <div className={`flex items-center gap-3 p-3 border-b ${isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-200 bg-white"}`}>
                    <Graph size={15} weight="duotone" className="text-royal" />
                    <p className={`text-[13px] font-semibold flex-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                      {caseData.title} — خريطة القضية البصرية
                    </p>
                    <button onClick={() => setGraphFullscreen(false)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-colors ${
                        isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/10" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}>
                      <ArrowsIn size={13} /> خروج
                    </button>
                  </div>
                  <div className="flex-1">
                    <CaseGraphView isDark={isDark} isGlobal={false} caseId={id} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Notes ── */}
          {activeTab === "notes" && (
            <div className="space-y-5">
              {/* Real, saved notes — owner item 65: this composer used to be
                  removed here because there was no case-notes table or write
                  route to save into. public.case_notes now exists
                  (20260910_case_notes.sql) and this is that composer. */}
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
                                {/* بلا اسم لا يوجد حرف أول: أيقونة، لا خانة من المعرّف — نفس قاعدة تبويب «الفريق». */}
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

              {/* ── ملاحظات من سجل الأحداث — a DIFFERENT feed from the real,
                  saved notes above: this one is derived read-only from
                  `caseData.events` (case.note* / metadata.text) and existed
                  before public.case_notes did. Kept under its own label so
                  the two are never mistaken for one list. ── */}
              <div className="pt-1">
                <p className={`text-[11px] font-bold uppercase tracking-wider mb-2.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  ملاحظات من سجل الأحداث
                </p>
                <div className="space-y-3">
                  {notes.length === 0 ? (
                    <div className={`${card} p-8 text-center`}>
                      <ChatDots size={24} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
                      <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد ملاحظات في سجل الأحداث</p>
                    </div>
                  ) : (
                    notes.map((note, i) => (
                      <motion.div key={i}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        className={`${card} p-4`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-xl bg-royal/10 flex items-center justify-center">
                              <span className="text-[11px] font-bold text-royal">{note.author.charAt(0)}</span>
                            </div>
                            <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{note.author}</p>
                          </div>
                          <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{note.date}</p>
                        </div>
                        <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{note.text}</p>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {showAddHearing && (
        <AddHearingModal
          onClose={() => setShowAddHearing(false)}
          isDark={isDark}
          user={{ userId: user.userId, name: user.name, userType: user.userType, tier: user.tier }}
          caseRequestId={id}
          // The case-name field is hidden inside the modal when caseRequestId
          // is set, but its value still travels in the save — this fills it
          // with the real case title so the same hearing, read back on the
          // standalone diary (which is not scoped to one case), shows a
          // meaningful «القضية» chip instead of an empty one.
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

      {editingStage && (
        <RecordStageOutcomeModal
          onClose={() => setEditingStage(null)}
          isDark={isDark}
          caseRequestId={id}
          stage={editingStage}
          onSaved={(savedStage, autoDeadline) => {
            if (stagesRead?.ok) {
              setStagesRead(listOk(
                stagesRead.items.map((s) => (s.id === savedStage.id ? savedStage : s)),
                stagesRead.total,
              ));
            }
            setEditingStage(null);
            if (autoDeadline?.created) loadDeadlines();
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
            loadDeadlines();
          }}
        />
      )}
    </div>
  );
}