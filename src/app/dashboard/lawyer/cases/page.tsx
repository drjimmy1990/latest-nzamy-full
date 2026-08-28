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
import { useUser } from "@/hooks/useUser";
import { getWorkflowRequestsByReceiver, updateWorkflowRequestById } from "@/lib/services/workflowService";
import { apiGet, isSupabaseMode } from "@/lib/services/api";
import type { WorkflowRequest } from "@/lib/workflowStore";
import type { CaseStatus, CaseType, CourtDegree, Priority, ViewMode, KanbanGroupBy, Case } from "./_types";
import AddCaseModal from "../_components/AddCaseModal";
import EmptyState from "@/components/ui/EmptyState";




/**
 * `TIME_FILTERS` و`COLLAB_TABS` لم تعودا مستوردتين: أُزيل القسمان اللذان كانا
 * يعرضانهما من هذه الصفحة. السبب الكامل مكتوب مكانهما في
 * `src/constants/lawyerCasesData.ts` — باختصار: خمسة أزرار «نطاق زمني» تُرشّح على
 * حقلين لا يكتبهما شيء (`nextDateSort` و`metadata.deadline`)، وشريط تعاون تبويباته
 * مبنية على `collab` ثابتة لا مصدر لها.
 */
import {
  workflowToCase,
  COURTS_LIST,
  DEGREE_LABELS,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  TYPE_LABELS,
} from "@/constants/lawyerCasesData";

/**
 * Which `receiver: "lawyer"` rows on this endpoint are actually CASES.
 *
 * There is no cases table. A lawyer's whole workspace is service_requests rows
 * with `receiver: "lawyer"` + `assigned_to = the lawyer`, so this page's fetch
 * returns FOUR other things besides cases, and each one used to render as a case
 * and inflate the header counts:
 *   • tasks     — POST /api/v1/lawyer/tasks     stamps `metadata.task = true`
 *   • clients   — POST /api/v1/lawyer/clients   stamps `metadata.client = true`,
 *                 status "assigned", so every CRM client counted as an ACTIVE case
 *                 («موكّل: فلان» in the case list)
 *   • invoices  — POST /api/v1/lawyer/finance   stamps `metadata.invoice = true`,
 *                 status "completed" and a real `payment.amount`, so an invoice
 *                 rendered as a closed case whose "value" was the invoice total —
 *                 and ≥800 SAR turned it into a HIGH-PRIORITY case, because
 *                 workflowToCase derives priority from the amount
 *   • hearings  — AddHearingModal, «جلسة — {اسم القضية}», status
 *                 "pending_assignment", so every hearing added a phantom «انتظار» case
 * Only the task marker was checked before. The other three are excluded here.
 *
 * Hearings are the one writer with no boolean marker, so they are matched on the
 * metadata SHAPE AddHearingModal writes (`caseName` + `time`, keys no other
 * writer on this endpoint produces). `metadata.hearing === true` is accepted too
 * so this keeps working once that modal stamps a proper marker — see the follow-up.
 * Key presence, not truthiness: the modal writes `caseName: ""` when the field is
 * left blank.
 *
 * A denylist rather than an allowlist ON PURPOSE: the alternative (accept only
 * rows carrying `metadata.court`, which AddCaseModal writes) would silently hide
 * any case that reaches the lawyer by a path we have not enumerated. Hiding a
 * real case from a practising lawyer is worse than showing one extra row.
 */
// How many rows to ask the list endpoint for. The route's own default is 20.
const LIST_LIMIT = 200;

/**
 * Reads the lawyer's rows and reports HOW the read went.
 *
 * This deliberately does NOT go through getWorkflowRequestsByReceiver, which is
 * what this page used before, because that helper cannot express failure:
 *   • the GET route answers a failed Supabase query with HTTP 200 and
 *     `{ data: [], total: 0, degraded: true }` — deliberately, so old callers
 *     keep working — and the helper types the response as `{ data }` only, so
 *     the marker is dropped and the failure arrives as an empty list;
 *   • when the fetch itself throws, the helper catches it and returns the
 *     browser's localStorage rows instead, so a network or auth failure was
 *     served to the lawyer either as «لا توجد قضايا» or, worse, as a handful of
 *     stale local rows presented as their live case file.
 * Reading the endpoint directly keeps both signals. The demo branch below still
 * uses the helper; `isSupabaseMode` is a module-level constant, so in a
 * production build that branch is dead-code-eliminated.
 *
 * `limit: 200` is the other half: the route defaults to 20 rows and this page
 * never passed a limit, so a lawyer's 21st row onward simply did not exist here —
 * and tasks, clients, invoices and hearings all share that budget. `total` is the
 * unfiltered server count, so comparing it against the rows we received is an
 * honest test of whether the page was cut short.
 */
async function fetchLawyerRows(): Promise<{ rows: WorkflowRequest[]; degraded: boolean; truncated: boolean }> {
  if (!isSupabaseMode) {
    return { rows: await getWorkflowRequestsByReceiver("lawyer"), degraded: false, truncated: false };
  }
  const response = await apiGet<{ data?: WorkflowRequest[]; total?: number; degraded?: boolean }>(
    "/api/v1/service-requests",
    { receiver: "lawyer", limit: LIST_LIMIT },
  );
  const rows = response.data ?? [];
  return {
    rows,
    degraded: response.degraded === true,
    truncated: (response.total ?? rows.length) > rows.length,
  };
}

function isLawyerCaseRow(request: WorkflowRequest): boolean {
  if (request.type !== "service") return false;
  const metadata = (request.metadata ?? {}) as Record<string, unknown>;
  if (metadata.task === true) return false;
  if (metadata.client === true) return false;
  if (metadata.invoice === true) return false;
  if (metadata.hearing === true) return false;
  if ("caseName" in metadata && "time" in metadata) return false;
  return true;
}

export default function CasesPage() {
  const { isDark } = useTheme();
  const user = useUser();
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
  const [cases,         setCases]         = useState<Case[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState(false);
  const [truncated,     setTruncated]     = useState(false);
  const [reloadKey,     setReloadKey]     = useState(0);
  // A write the server refused. The Kanban drag is optimistic, so without this
  // a rejected move just slid the card back with no explanation at all.
  const [saveError,     setSaveError]     = useState<string | null>(null);
  const [showAddCase,   setShowAddCase]   = useState(false);
  // `timeFilter` بقي رغم إزالة أزرار «نطاق زمني»: شريط الطعون الأحمر أدناه يضبطه
  // بنفسه على "urgent"، وحذف الحالة كان سيحوّل زر ذلك الشريط إلى زر بلا أثر.
  const [archiveSearch, setArchiveSearch] = useState(""); // S82

  // Drag & drop state for Kanban. Column keys are strings (vary by grouping mode);
  // drag is only enabled in "status" mode where keys are active/pending/closed.
  const dragId = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const onKanbanDragStart = useCallback((id: string) => { dragId.current = id; }, []);
  const onKanbanDrop = useCallback((col: string) => {
    if (!dragId.current) return;
    const caseId = dragId.current;
    // Capture the original column + status BEFORE the optimistic update so the
    // .catch() revert restores the real prior values. Reading them inside
    // .catch() would already return the new values (a no-op revert).
    let originalCol: string = col;
    let originalStatus: CaseStatus | undefined;
    // KanbanView status columns filter by c.status, so we must update the
    // case's status field too — otherwise the card stays in the old column
    // even though kanbanCol moved. Column keys are the CaseStatus values.
    setCases(prev => {
      const found = prev.find(c => c.id === caseId);
      if (found) {
        originalCol = found.kanbanCol;
        originalStatus = found.status;
      }
      return prev.map(c => c.id === caseId
        ? { ...c, kanbanCol: col as Case["kanbanCol"], status: col as CaseStatus }
        : c);
    });
    dragId.current = null;
    setDragOverCol(null);
    const revert = () => {
      // Revert to the column/status captured before the optimistic update.
      setCases(prev => prev.map(c => (c.id === caseId
        ? { ...c, kanbanCol: originalCol as Case["kanbanCol"], status: originalStatus ?? c.status }
        : c)));
    };
    // Persist the status change to the backend (optimistic; revert on failure).
    // Keys match the status-mode columns rendered in KanbanView.
    // «معلقة» is deliberately absent: it mapped to "in_review", which
    // workflowToCase reads back as "active" (constants/lawyerCasesData.ts), so a
    // drag into that column appeared to succeed and then silently jumped back to
    // «نشطة» on the very next sync — one this handler triggers itself. There is no
    // backend status that round-trips as "suspended", so the column is gone from
    // KanbanView and from the status filters until one exists.
    const statusForCol: Record<string, WorkflowRequest["status"]> = {
      active: "assigned",
      pending: "pending_assignment",
      closed: "completed",
    };
    const nextStatus = statusForCol[col];
    if (!nextStatus) return;
    updateWorkflowRequestById(caseId, { status: nextStatus })
      .then(updated => {
        // TWO failure shapes, and both must revert AND say so.
        //
        // `updated === null` is the DEMO path: updateLocal() returns null for a
        // row the local store has never seen. In supabase mode the helper now
        // RETHROWS a failed PATCH (workflowService.ts:104-110) rather than
        // quietly patching localStorage and handing back a row — that fallback
        // is what used to make a 403 from the status guard look like a success,
        // and it is gone. The .catch() below is what catches it now; this null
        // check is still load-bearing for demo mode.
        if (!updated) {
          revert();
          setSaveError("تعذّر نقل القضية. لم يتغيّر شيء على الخادم.");
          return;
        }
        // Dispatch the refresh event so list/kanban views re-sync from the
        // backend (matching how other mutations refresh these list pages).
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("nzamy-workflow-updated"));
        }
      })
      .catch(err => {
        // The card used to slide back into its old column with nothing said, so
        // a refused move was indistinguishable from a clumsy drag — and the
        // lawyer's next move was to try again against the same refusal.
        console.error("[cases] kanban status move failed:", err);
        revert();
        setSaveError("تعذّر نقل القضية. لم يتغيّر شيء على الخادم.");
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const syncCases = async () => {
      try {
        const { rows, degraded, truncated } = await fetchLawyerRows();
        if (cancelled) return;
        if (degraded) {
          // The route answers a failed Supabase query with HTTP 200 and
          // `{ data: [], total: 0, degraded: true }`. Read as data, that is an
          // empty case list; it is actually a database that did not answer.
          setLoadError(true);
          return;
        }
        setCases(rows.filter(isLawyerCaseRow).map(workflowToCase));
        setTruncated(truncated);
        setLoadError(false);
      } catch {
        if (cancelled) return;
        // A read that FAILED must never be rendered as «لا توجد قضايا». A lawyer
        // who is told they have no cases over a query that never answered stops
        // looking — and misses whatever was in it. Three states are kept apart
        // from here on: loading / could-not-read (says so, offers retry) /
        // genuinely empty. Note we do NOT wipe `cases`: if a background refresh
        // fails, the last good list stays on screen under a failure banner.
        setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    syncCases();
    const handler = () => syncCases();
    window.addEventListener("nzamy-workflow-updated", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("nzamy-workflow-updated", handler);
    };
  }, [reloadKey]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  // All team members
  const allTeam = useMemo(() => {
    const s = new Set<string>();
    cases.forEach(c => c.team.forEach(m => s.add(m)));
    return Array.from(s);
  }, [cases]);

  // Filtered cases. These two are memoised on `cases` so that the `filtered`
  // memo below can depend on THEM and still recompute when the fetch resolves —
  // see the note on that dependency array.
  const activeCases = useMemo(() => cases.filter(c => c.status !== "archived"), [cases]);
  const archivedCases = useMemo(() => cases.filter(c => c.status === "archived"), [cases]);

  const filtered = useMemo(() => {
    const base = viewMode === "archive" ? archivedCases : activeCases;
    return base.filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (degreeFilter !== "all" && c.degree !== degreeFilter) return false;
      if (courtFilter !== "all" && c.court !== courtFilter) return false;
      if (teamFilter !== "all" && !c.team.includes(teamFilter)) return false;
      if (priorityFilter !== "all" && c.priority !== priorityFilter) return false;
      // شروط "today"/"week"/"month" حُذفت مع أزرارها: كانت تقرأ `c.nextDateSort`،
      // وهو حقل لا يكتبه `workflowToCase` إطلاقاً، فكانت الثلاثة تُرجع لا شيء دائماً.
      // "urgent" باقٍ لأن شريط الطعون هو من يضبطه، ولا يظهر إلا حين يوجد ما يطابقه.
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
    // `activeCases`/`archivedCases` and `courtFilter` were ALL missing from this
    // array. The case list was the one that mattered: the memo body reads it, so
    // the empty first-render result stayed cached after the fetch resolved and
    // every lawyer saw «لا توجد قضايا مطابقة» under a header counting their real
    // cases. The list and the Kanban were blank; the archive tab worked only
    // because ArchiveView computes its own local `filtered` straight from `cases`.
    // Nothing rewrites this for us: the React Compiler is not enabled here (no
    // `reactCompiler` in next.config.ts, no babel-plugin-react-compiler).
    // `collabFilter` خرج من هذه المصفوفة لأنه خرج من الحالة نفسها؛ `timeFilter`
    // باقٍ لأن الشرط الذي يقرؤه ("urgent") ما زال أعلاه.
  }, [activeCases, archivedCases, statusFilter, typeFilter, degreeFilter, courtFilter, teamFilter, timeFilter, priorityFilter, search, viewMode]);

  /**
   * True only when there is a real list behind every figure on this page.
   *
   * `cases` is `[]` before the first fetch resolves and after one fails, so
   * every count below is 0 in three different states. The header, the quick
   * status pills and the footer already gated on exactly this expression; the
   * status chips inside the filter drawer did not, so they printed «الكل ٠»
   * during the whole first paint and again over a failed read. (The
   * collaboration rail was the other ungated counter; it has since been removed
   * outright — see the note where it stood.)
   *
   * The `cases.length === 0` half is deliberate and is NOT the same as
   * `!loadError`: when a background refresh fails but an earlier load
   * succeeded, the last good list stays on screen under an amber
   * «قد لا يكون محدّثاً» banner, and the counts then describe exactly the rows
   * the lawyer is looking at. Withholding them there would be its own
   * inaccuracy.
   */
  const countsKnown = !loading && !(loadError && cases.length === 0);

  // No `suspended` key: nothing can produce a case in that state (see the drag
  // handler above), so the counter could only ever have printed a hard 0.
  const counts = {
    all: activeCases.length,
    active: activeCases.filter(c => c.status === "active").length,
    pending: activeCases.filter(c => c.status === "pending").length,
    closed: activeCases.filter(c => c.status === "closed").length,
    archived: archivedCases.length,
  };

  // Appeal deadlines: `hasDeadline` is `Boolean(metadata.deadline)` and NOTHING in
  // this repo writes that key — not AddCaseModal, not AddHearingModal, not the
  // POST route. So this is 0 for every lawyer, always. The banner and the card
  // badges below stay because they render nothing while that is true and will
  // light up correctly the day a writer exists; what was removed is the footer
  // stat that printed «طعون: 0» as a standing all-clear on a check the platform
  // never performs.
  const criticalCount = cases.filter(c => c.hasDeadline).length;

  const resetFilters = () => {
    setStatusFilter("all"); setTypeFilter("all"); setDegreeFilter("all"); setCourtFilter("all");
    setTeamFilter("all"); setTimeFilter("all"); setPriorityFilter("all");
    setSearch("");
  };

  const retryLoad = () => {
    setLoading(true);
    setLoadError(false);
    setReloadKey(k => k + 1);
  };

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
            // «لا توجد قضايا مطابقة» is only true when there ARE cases and the
            // filters excluded them. With an empty list it told a lawyer their
            // search was at fault when in fact nothing had ever been filed.
            cases.length === 0
              ? (
                <EmptyState
                  icon={<Gavel />}
                  title="لا توجد قضايا بعد"
                  description="القضايا التي تضيفها أو تُسند إليك ستظهر هنا."
                  action={{ label: "إضافة قضية", onClick: () => setShowAddCase(true) }}
                />
              )
              : (
                <EmptyState
                  icon={<Gavel />}
                  title="لا توجد قضايا مطابقة"
                  description="لم يتم العثور على أي قضايا تطابق شروط البحث الحالية."
                  action={{ label: "إعادة ضبط الفلاتر", onClick: resetFilters }}
                />
              )
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
      // «معلقة» removed — see the note in onKanbanDrop: no backend status reads
      // back as "suspended", so the column could only ever be empty and dropping
      // a card into it silently bounced the card back to «نشطة».
      cols = [
        { key:"active",    label:"نشطة",        color:"text-emerald-500", bg:"bg-emerald-500/10",  cases: filtered.filter(c=>c.status==="active") },
        { key:"pending",   label:"انتظار",       color:"text-amber-500",   bg:"bg-amber-500/10",   cases: filtered.filter(c=>c.status==="pending") },
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
                onDragOver={e=>{e.preventDefault();if(isDraggable)setDragOverCol(col.key);}}
                onDrop={()=>{if(isDraggable)onKanbanDrop(col.key);}}
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

      {/* A move the server refused, already rolled back on screen. Same shape as
          the tasks board's `saveError` — an optimistic write that silently
          reverts is indistinguishable from a save that worked and then undid
          itself. */}
      {saveError && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[12px] font-semibold text-red-500">
          <Warning size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{saveError}</span>
          <button onClick={() => setSaveError(null)} className="opacity-70 hover:opacity-100">إخفاء</button>
        </motion.div>
      )}

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
          {/* Counts are only printed once there is a list behind them. While the
              fetch is in flight `counts.all` is 0, and a printed 0 reads as a
              fact — the same lie as any other number with no source. */}
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {loading
              ? "جاري تحميل القضايا…"
              : loadError && cases.length === 0
                ? <span className="text-red-500 font-semibold">تعذّر تحميل القضايا</span>
                : <>
                    {counts.all} قضية · <span className="text-emerald-500 font-semibold">{counts.active} نشطة</span>
                    {criticalCount > 0 && <> · <span className="text-red-500 font-semibold">{criticalCount} طعون</span></>}
                  </>}
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

              {/* قسم «نطاق زمني» (الكل · اليوم · هذا الأسبوع · هذا الشهر · طعون قادمة)
                  أُزيل من هنا كاملاً. الأزرار الثلاثة الوسطى كانت تُرشّح على
                  `Case.nextDateSort` — حقل لا يكتبه `workflowToCase` — و«طعون قادمة»
                  تُرشّح على `metadata.deadline` ولا كاتب له في المستودع، فكانت الخمسة
                  أزراراً حيّة المظهر تُرجع قائمة فارغة لكل محامٍ في كل مرة.
                  التفصيل الكامل مكان `TIME_FILTERS` في constants/lawyerCasesData.ts. */}

              {/* Status filters */}
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>حالة القضية</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(["all", "active", "pending", "closed"] as const).map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                        statusFilter === s ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"
                      }`}>
                      {s !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[s]?.dot}`} />}
                      {s === "all" ? "الكل" : STATUS_CONFIG[s].label}
                      {/* Number only when a read is behind it — the quick pills
                          outside this drawer already did this; these did not. */}
                      {countsKnown && (
                        <span className={`text-[9px] px-1.5 rounded-full ${statusFilter === s ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                          {s === "all" ? counts.all : counts[s]}
                        </span>
                      )}
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
              <button onClick={resetFilters}
                className={`text-[11px] font-semibold underline ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}>
                إعادة ضبط الفلاتر
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* شريط سياق التعاون (S59) — أُزيل بالكامل.
          كان أربعة تبويبات: جميع القضايا · بمفردي · مشتركة · فريقي، تُرشّح على
          `Case.collab`. و`workflowToCase` يضع "solo" ثابتة على كل صف بلا أي مصدر
          على `service_requests`، فـ«مشتركة» و«فريقي» تُرجعان لا شيء لكل محامٍ دائماً —
          أي أن الشريط كان يقرأ للمحامي: «لا تتعاون في أي قضية» — و«بمفردي» تعرض
          القائمة نفسها التي يعرضها «جميع القضايا» بالعدد نفسه، فالضغط عليها لا يغيّر
          شيئاً على الشاشة. تصنيفٌ لا تسنده بيانات، فأُزيل بدل أن يُترك يبدو حيّاً.
          إعادته حقيقةً تحتاج تسجيل التعاون على الصف = عمل خلفي. */}

      {/* Quick status pills — hidden while the counts have no data behind them */}
      {!showFilters && countsKnown && (
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "active", "pending", "closed"] as const).map(s => (
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

      {/* Active View — three states kept apart: loading, could-not-read, data.
          A failed query used to land on the same «لا توجد قضايا» screen as a
          lawyer who genuinely has none. */}
      {loading ? (
        <div className={`${card} p-4 space-y-2`}>
          {[0, 1, 2].map(i => (
            <div key={i} className={`h-16 rounded-2xl animate-pulse ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} />
          ))}
          <p className={`text-[12px] text-center pt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جاري تحميل القضايا…</p>
        </div>
      ) : loadError && cases.length === 0 ? (
        <div className={`${card} p-6 text-center space-y-3`}>
          <Warning size={26} weight="duotone" className="mx-auto text-red-500" />
          <p className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تعذّر تحميل القضايا</p>
          <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            لم يستجب الخادم لطلب القائمة. هذه ليست قائمة فارغة — قد تكون لديك قضايا لم تُقرأ بعد.
          </p>
          <button onClick={retryLoad}
            className="px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          {/* A refresh failed but an earlier load succeeded: show the last good
              list and say plainly that it may be out of date. */}
          {loadError && (
            <div className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-center gap-3">
              <Warning size={15} weight="duotone" className="text-amber-500 flex-shrink-0" />
              <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400 flex-1">
                تعذّر تحديث القائمة — ما تراه هو آخر تحميل ناجح وقد لا يكون محدّثاً.
              </p>
              <button onClick={retryLoad} className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline flex-shrink-0">
                إعادة المحاولة
              </button>
            </div>
          )}
          {/* The server had more rows than it sent. Say so rather than let the
              lawyer read a cut-off list as their complete case file. */}
          {truncated && (
            <div className={`mb-3 rounded-2xl border p-3 text-[12px] font-semibold ${isDark ? "border-white/[0.08] bg-white/[0.03] text-zinc-400" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
              تُعرض أحدث {LIST_LIMIT} سجل فقط — قد تكون هناك قضايا أقدم غير معروضة في هذه القائمة.
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div key={viewMode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {viewMode === "list"    && <ListView />}
              {viewMode === "kanban"  && <KanbanView />}
              {viewMode === "archive" && <ArchiveView />}
            </motion.div>
          </AnimatePresence>
        </>
      )}

      {/* Stats footer */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className={`${card} p-4 flex flex-wrap items-center gap-5`}>
        {/* Counters only while there is a loaded list behind them. The «طعون»
            counter that stood here was removed outright: it read `hasDeadline`,
            which nothing in the repo ever sets, so it was a permanent «0» next to
            a pulsing red dot — an all-clear on a deadline check that is not
            performed. Omitted rather than zero-filled. */}
        {countsKnown && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>نشطة: <strong className="text-emerald-500">{counts.active}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>انتظار: <strong className="text-amber-500">{counts.pending}</strong></span>
            </div>
          </>
        )}
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
        {showAddCase && <AddCaseModal onClose={() => setShowAddCase(false)} isDark={isDark} user={{ userId: user.userId, name: user.name, userType: user.userType, tier: user.tier }} />}
      </AnimatePresence>
    </div>
  );
}
