"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, MagnifyingGlass, Plus, Clock, CalendarBlank,
  CheckCircle, Warning, CaretLeft, Pen,
  PaperPlaneTilt, X, Archive, Info,
  ArrowCounterClockwise, ArrowClockwise,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import EmptyState from "@/components/ui/EmptyState";
import { getWorkflowRequestsByReceiver, updateWorkflowRequestById, createWorkflowRequest } from "@/lib/services/workflowService";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import type { WorkflowRequest, WorkflowRequestStatus } from "@/lib/workflowStore";
import { createWorkflowId } from "@/lib/workflowStore";
import { useUser } from "@/hooks/useUser";

// ─── Types & mapping ───────────────────────────────────────────────────────────

type ContractStatus = "active" | "pending_sign" | "draft" | "cancelled";

interface Contract {
  id:        string;
  title:     string;
  party:     string;
  type:      ContractType;
  status:    ContractStatus;
  value?:    string;
  /** The row's own created_at. Labelled «أُنشئ» on screen and nothing else. */
  createdAt?: string;
}

type ContractType = "service_agreement" | "fee_agreement" | "power_of_attorney" | "nda" | "employment" | "other";

const TYPE_LABELS: Record<ContractType, string> = {
  service_agreement: "اتفاقية خدمات",
  fee_agreement:     "عقد أتعاب",
  power_of_attorney: "وكالة قانونية",
  nda:               "اتفاقية سرية",
  employment:        "عقد عمل",
  // «آخر» is one of the six choices in the wizard (CONTRACT_TYPES below) and
  // used to have no entry here at all, so picking it rendered an empty badge.
  other:             "آخر",
};

/**
 * The four workflow statuses this page writes, and nothing else.
 *
 * This map and `contractStatusFromWorkflow` below are exact inverses on
 * purpose: a row saved as «بانتظار التوقيع» has to come back as
 * «بانتظار التوقيع» after a reload. They used not to be — `in_review` was read
 * back as «مسودة» — which is how a lawyer could set a status, refresh, and
 * silently be shown a different one.
 */
const workflowStatusFor: Record<ContractStatus, WorkflowRequestStatus> = {
  draft:        "draft",
  pending_sign: "in_review",
  active:       "completed",
  cancelled:    "cancelled",
};

function contractStatusFromWorkflow(status: WorkflowRequestStatus): ContractStatus | null {
  switch (status) {
    case "draft":     return "draft";
    case "in_review": return "pending_sign";
    case "completed": return "active";
    case "cancelled": return "cancelled";
    // pending_payment / pending_assignment / assigned are never written for a
    // contract row by this page or by anything else (see the type filter in
    // loadContracts). Returning null rather than defaulting to «مسودة» keeps
    // the promise this file now makes: no badge on screen that no column
    // backs. Such a row is dropped from the list instead of being relabelled.
    default:          return null;
  }
}

const READ_STRING = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/**
 * Read a contract back out of the row this page wrote.
 *
 * Every field here now has a source. What was removed, and why:
 *   - `type` was hardcoded `"service_agreement"` for every row, so the badge
 *     always read «اتفاقية خدمات» whatever the lawyer picked. It now reads
 *     `metadata.contractType`, which persistNewContract has always written and
 *     nothing ever read back.
 *   - `value` was computed from `payment.amount`, which this page always sends
 *     as 0 — so the «٢٠٬٠٠٠ ﷼» typed in the wizard vanished on the first
 *     reload. It now reads `metadata.value`, the string the lawyer typed.
 *   - `signDate` is gone. It was `created_at` relabelled as a signing date and
 *     rendered behind a «تم التوقيع» calendar icon. Nothing on this platform
 *     collects a signature, so there is no signing date to show; the row's
 *     creation instant is shown as what it is instead.
 *   - `expiry` is gone: nothing ever set it, and it was rendered and searched.
 */
function workflowToContract(request: WorkflowRequest): Contract | null {
  const status = contractStatusFromWorkflow(request.status);
  if (!status) return null;
  const meta = (request.metadata ?? {}) as Record<string, unknown>;
  const rawType = READ_STRING(meta.contractType);
  return {
    id:     request.id,
    title:  request.title,
    party:  READ_STRING(meta.party) ?? READ_STRING(request.requester?.name) ?? "—",
    type:   rawType && rawType in TYPE_LABELS ? (rawType as ContractType) : "other",
    status,
    value:  READ_STRING(meta.value),
    createdAt: request.createdAt ? new Date(request.createdAt).toLocaleDateString("ar-SA") : undefined,
  };
}

const STATUS_CONFIG: Record<ContractStatus, { label: string; color: string }> = {
  active:        { label: "ساري",            color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  pending_sign:  { label: "بانتظار التوقيع",  color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  cancelled:     { label: "ملغي",             color: "text-slate-400 bg-slate-100 border-slate-200 dark:bg-white/[0.04] dark:border-white/[0.06] dark:text-zinc-500" },
  draft:         { label: "مسودة",            color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
};

const STATUS_ICONS: Record<ContractStatus, typeof CheckCircle> = {
  active:       CheckCircle,
  pending_sign: Warning,
  cancelled:    Clock,
  draft:        Pen,
};

const CONTRACT_TYPES: { id: ContractType; label: string }[] = [
  { id: "power_of_attorney", label: "وكالة قانونية" },
  { id: "fee_agreement",     label: "عقد أتعاب" },
  { id: "nda",               label: "اتفاقية سرية" },
  { id: "service_agreement", label: "اتفاقية خدمات" },
  { id: "employment",        label: "عقد عمل" },
  { id: "other",             label: "آخر" },
];

/**
 * How many rows to pull before sieving contracts out of them.
 *
 * GET /api/v1/service-requests takes no `type` parameter and defaults to
 * `limit=20` (route.ts), and `receiver:"lawyer"` is the lawyer's WHOLE private
 * workspace — hearings, cases, tasks, clients and invoices all land in that
 * same stream. So the twenty newest rows can easily contain no contract at all
 * while the lawyer has several, and a `business_case` filter applied after a
 * 20-row cap would render that as «لا توجد عقود». Two hundred is enough head-
 * room for a real practice's first year and still one request.
 *
 * It is a cap, not a guarantee, which is why `truncated` below exists: past it
 * the page says the list is cut rather than quietly showing a short one.
 */
const WORKSPACE_PAGE_LIMIT = 200;

type LoadState = "loading" | "ready" | "failed";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContractsPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const [search,        setSearch]        = useState("");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [filter,        setFilter]        = useState<ContractStatus | "all">("all");
  const [viewMode,      setViewMode]      = useState<"active" | "archive">("active");
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [toast,         setToast]         = useState<string | null>(null);
  // New contract modal
  const [showModal, setShowModal]   = useState(false);
  const [modalStep, setModalStep]   = useState(1);
  const [newType,   setNewType]     = useState<ContractType | "">("");
  const [newParty,  setNewParty]    = useState("");
  const [newValue,  setNewValue]    = useState("");
  const [newTitle,  setNewTitle]    = useState("");
  const [saving,    setSaving]      = useState(false);
  const [contracts, setContracts]   = useState<Contract[]>([]);
  const [loadState, setLoadState]   = useState<LoadState>("loading");
  const [truncated, setTruncated]   = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  /**
   * WHY THIS READS THE ROUTE DIRECTLY instead of going through
   * getWorkflowRequestsByReceiver(): that helper returns `response.data` and
   * drops the route's `degraded` flag — and that flag is the ONLY way to tell
   * «the query failed» from «you have no contracts», because
   * src/app/api/v1/service-requests/route.ts answers a Supabase error with
   * HTTP 200 and an empty list. Through the helper, a database outage reached
   * this screen as a confident «٠ عقد نشط». A lawyer must never be told a
   * record does not exist because the database was unreachable.
   *
   * Demo mode still goes through the helper: there the local store IS the
   * intended source and cannot be degraded.
   *
   * WHY ONLY `business_case`: this list used to include `type === "service"`
   * as well. `service` + `receiver:"lawyer"` is the exact shape AddHearingModal,
   * AddCaseModal and the tasks/clients/finance routes write for the lawyer's
   * own hearings, cases, tasks, clients and invoices — so a court hearing was
   * rendered here as a contract, and the destructive buttons below wrote
   * `status:"cancelled"` onto it, dropping the hearing out of the calendar's
   * default view with no warning and no way back. `business_case` +
   * `receiver:"lawyer"` is written by exactly one thing in this repo:
   * persistNewContract, below. So every row on this page is now a row this
   * page created, and no button here can reach anything else.
   */
  useEffect(() => {
    let cancelled = false;
    // Deliberately does NOT flip to "loading" on every run: the initial state
    // already is, and the `nzamy-workflow-updated` listener re-reads in the
    // background — blanking a list the lawyer is reading, to re-render the
    // same rows, is worse than a stale second. Only retryLoad sets it.
    const read = async () => {
      try {
        let rows: WorkflowRequest[];
        let cut = false;
        if (!isSupabaseMode) {
          rows = await getWorkflowRequestsByReceiver("lawyer");
        } else {
          const response = await apiGet<{ data?: WorkflowRequest[]; total?: number; degraded?: boolean }>(
            "/api/v1/service-requests",
            { receiver: "lawyer", limit: WORKSPACE_PAGE_LIMIT },
          );
          if (response.degraded) throw new Error("service-requests responded degraded");
          rows = response.data ?? [];
          // `total` is the route's exact-count of matching rows, so this is a
          // fact rather than the `rows.length >= limit` guess it replaces.
          cut = typeof response.total === "number"
            ? response.total > WORKSPACE_PAGE_LIMIT
            : rows.length >= WORKSPACE_PAGE_LIMIT;
        }
        if (cancelled) return;
        setTruncated(cut);
        setContracts(
          rows
            .filter(request => request.type === "business_case")
            .map(workflowToContract)
            .filter((c): c is Contract => c !== null),
        );
        setLoadState("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("[contracts] load failed:", err);
        setContracts([]);
        setLoadState("failed");
      }
    };

    read();
    const handler = () => read();
    window.addEventListener("nzamy-workflow-updated", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("nzamy-workflow-updated", handler);
    };
  }, [reloadNonce]);

  // Retry re-runs the effect above rather than duplicating the read. Bumping a
  // nonce is what lets the reader stay defined inside the effect, where its
  // `cancelled` guard belongs.
  const retryLoad = useCallback(() => {
    setLoadState("loading");
    setReloadNonce(n => n + 1);
  }, []);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2800); }
  function openModal() { setShowModal(true); setModalStep(1); setNewType(""); setNewParty(""); setNewValue(""); setNewTitle(""); }
  function closeModal() { setShowModal(false); }

  /**
   * WHY THIS PATCHES THE ROUTE DIRECTLY instead of calling
   * updateWorkflowRequestById(): that helper answers a failed PATCH by writing
   * the patch to localStorage and returning a row (workflowService.ts), which
   * made every `.catch()` on this page unreachable — «تم تحديث حالة العقد» was
   * shown over a 403 and over a 500 alike, and the change existed only in that
   * one browser. Here a failure is a failure, the optimistic change is rolled
   * back, and the lawyer is told the server still holds the old value.
   */
  async function patchStatus(id: string, status: ContractStatus, auditEvent: string): Promise<void> {
    if (!isSupabaseMode) {
      // The local store returns null for a row it has never seen, and that is a
      // failed write — the result was being discarded, so moveStatus() took the
      // success path and toasted «تم تحديث حالة العقد» over a row nothing had
      // updated. Demo-only (module-level constant), but a false «تم» is a false
      // «تم» wherever it is printed.
      const updated = await updateWorkflowRequestById(id, { status: workflowStatusFor[status] }, auditEvent);
      if (!updated) throw new Error("local store did not hold this contract row");
      return;
    }
    await apiMutate(`/api/v1/service-requests/${id}`, "PATCH", {
      status: workflowStatusFor[status],
      auditEvent,
    });
  }

  /**
   * One writer for every status move on this page. The new status is shown
   * immediately and reverted in full if the server refuses — reverted by
   * restoring the whole previous array rather than by inverting the change,
   * so a rollback cannot itself invent a state. The toast is fired on settle,
   * never before: «تم» must mean the server said so.
   */
  function moveStatus(
    id: string,
    status: ContractStatus,
    auditEvent: string,
    copy: { done: string; failed: string },
    opts: { collapse?: boolean } = {},
  ) {
    const previous = contracts;
    setContracts(prev => prev.map(c => (c.id === id ? { ...c, status } : c)));
    if (opts.collapse) setExpandedId(null);
    patchStatus(id, status, auditEvent)
      .then(() => showToast(copy.done))
      .catch(err => {
        console.error(`[contracts] ${auditEvent} failed:`, err);
        setContracts(previous);
        showToast(copy.failed);
      });
  }

  function cancelContract(id: string) {
    moveStatus(id, "cancelled", "contract_cancelled", {
      done:   "تم إلغاء العقد — تجده في «الملغاة»",
      failed: "تعذّر إلغاء العقد — لم يتغيّر شيء على الخادم.",
    }, { collapse: true });
  }
  function markPendingSign(id: string) {
    moveStatus(id, "pending_sign", "contract_marked_pending_sign", {
      done:   "تم تحديث الحالة إلى «بانتظار التوقيع»",
      failed: "تعذّر تحديث الحالة — لم يتغيّر شيء على الخادم.",
    });
  }
  function markActive(id: string) {
    moveStatus(id, "active", "contract_marked_active", {
      done:   "تم تحديث الحالة إلى «ساري»",
      failed: "تعذّر تحديث الحالة — لم يتغيّر شيء على الخادم.",
    });
  }
  function backToDraft(id: string) {
    moveStatus(id, "draft", "contract_back_to_draft", {
      done:   "تم إرجاع العقد إلى المسودات",
      failed: "تعذّر إرجاع العقد — لم يتغيّر شيء على الخادم.",
    }, { collapse: true });
  }

  /**
   * Build and persist the row for the new-contract wizard.
   *
   * Same reason as patchStatus for going straight to the route in supabase
   * mode: createWorkflowRequest() answers a failed POST by writing the row to
   * localStorage and returning it, so the `if (!row)` guard in saveNew() below
   * never fired. The lawyer saw «تم حفظ المسودة» over a
   * 500, and the contract disappeared on the next load with no error ever
   * shown, because a later successful read replaces the list wholesale and
   * never merges the browser-only row back in.
   */
  async function persistNewContract(targetStatus: ContractStatus): Promise<WorkflowRequest | null> {
    const id = createWorkflowId();
    const title = newTitle.trim() || `عقد جديد — ${newParty.trim()}`;
    const input = {
      id,
      type: "business_case" as const,
      title,
      description: "",
      receiver: "lawyer" as const,
      status: workflowStatusFor[targetStatus],
      requester: {
        userId: user.userId,
        name: newParty.trim() || user.name || "عميل نظامي",
        role: user.userType ?? "lawyer",
        tier: user.tier,
      },
      // No money has ever moved through this platform and no provider is
      // connected; `value` below is a free-text note, not a charge.
      payment: { amount: 0, status: "not_required" as const },
      sourcePath: "/dashboard/lawyer/contracts",
      metadata: {
        contractType: newType || "other",
        party: newParty.trim(),
        value: newValue.trim(),
      },
      // Load-bearing, do not drop: service_requests_select_policy admits a row
      // on `requester_user_id = auth.uid()` OR `assigned_to = auth.uid()`.
      // Without this the lawyer could not read back their own contract.
      assignedTo: user.userId ?? null,
    };
    try {
      if (!isSupabaseMode) return await createWorkflowRequest(input);
      const response = await apiMutate<{ data?: WorkflowRequest }>("/api/v1/service-requests", "POST", input);
      return response.data ?? null;
    } catch (err) {
      console.error("[contracts] persistNewContract failed:", err);
      return null;
    }
  }

  async function saveNew(targetStatus: ContractStatus, doneCopy: string, failCopy: string) {
    setSaving(true);
    const row = await persistNewContract(targetStatus);
    setSaving(false);
    if (!row) { showToast(failCopy); return; }
    closeModal();
    showToast(doneCopy);
    // Fired only after the server confirmed the row — and the card is then
    // rendered from a fresh READ rather than from a locally built object.
    // That is deliberate: the old code built the card from the wizard's own
    // state, so the type and the fee looked right until the first refresh
    // silently replaced them with «اتفاقية خدمات» and nothing. Whatever this
    // page shows after a save is now what the server actually holds.
    window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
  }
  const saveDraft = () => saveNew("draft", "تم حفظ المسودة", "تعذّر حفظ المسودة — لم يُسجَّل أي عقد. حاول مرة أخرى.");
  const saveAwaitingSignature = () => saveNew(
    "pending_sign",
    "تم الحفظ بحالة «بانتظار التوقيع»",
    "تعذّر حفظ العقد — لم يُسجَّل أي عقد. حاول مرة أخرى.",
  );

  const isCancelled = (c: Contract) => c.status === "cancelled";

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = contracts.filter(c => {
    if (isCancelled(c)) return false;
    const matchStatus = filter === "all" || c.status === filter;
    const matchSearch = !search || c.title.includes(search) || c.party.includes(search);
    return matchStatus && matchSearch;
  });

  const archivedFiltered = contracts
    .filter(isCancelled)
    .filter(c => {
      const q = archiveSearch.trim();
      return !q || c.title.includes(q) || c.party.includes(q) || !!c.value?.includes(q);
    });

  const counts = {
    all:          contracts.filter(c => !isCancelled(c)).length,
    active:       contracts.filter(c => c.status === "active").length,
    pending_sign: contracts.filter(c => c.status === "pending_sign").length,
    draft:        contracts.filter(c => c.status === "draft").length,
  };
  const cancelledCount = contracts.filter(isCancelled).length;

  // Counts are rendered ONLY once a read has actually succeeded. A «٠ عقد
  // نشط» printed over a failed query is the same lie as a fabricated number.
  const headerLine =
    loadState === "loading" ? "جارٍ تحميل السجل…"
    : loadState === "failed" ? "تعذّر قراءة السجل"
    : `${counts.all} عقد نشط${cancelledCount > 0 ? ` · ${cancelledCount} ملغي` : ""}${counts.pending_sign > 0 ? ` · ${counts.pending_sign} بانتظار التوقيع` : ""}`;

  const failedPanel = (
    <div className={`flex flex-col items-center gap-3 px-4 py-10 rounded-2xl border text-center ${
      isDark ? "border-red-500/20 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"
    }`}>
      <Warning size={28} weight="duotone" />
      <div>
        <p className="text-[13px] font-bold mb-1">تعذّر قراءة سجل العقود</p>
        <p className="text-[12px] leading-relaxed opacity-90">
          لم يصل ردّ من الخادم، وهذه ليست قائمة فارغة — قد تكون لديك عقود مسجّلة لا تظهر الآن. حاول مرة أخرى.
        </p>
      </div>
      <button onClick={retryLoad}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold border ${
          isDark ? "border-red-400/30 text-red-200 hover:bg-red-500/10" : "border-red-300 text-red-700 hover:bg-red-100"
        }`}>
        <ArrowClockwise size={13} weight="bold" />إعادة المحاولة
      </button>
    </div>
  );

  const loadingPanel = (
    <div className={`${card} p-12 text-center`}>
      <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جارٍ التحميل…</p>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
            مدير العقود
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{headerLine}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/ai/contracts"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            صياغة بـ AI
          </Link>
          <button onClick={() => { setViewMode(m => m === "active" ? "archive" : "active"); setExpandedId(null); }}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all ${
              viewMode === "archive"
                ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                : isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}>
            <Archive size={14} />
            الملغاة
            {loadState === "ready" && cancelledCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                viewMode === "archive" ? "bg-amber-500/20 text-amber-600" : isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-400"
              }`}>{cancelledCount}</span>
            )}
          </button>
          <button onClick={openModal} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Plus size={15} weight="bold" />
            عقد جديد
          </button>
        </div>
      </motion.div>

      {/*
        The honest frame for this whole screen. It replaces four controls that
        claimed transmission the platform cannot perform — «مشاركة مع الموكل»
        and «رابط التوقيع» (which toasted «تم نسخ الرابط» with no clipboard call
        and no contract URL to copy, so the lawyer pasted whatever was already
        on their clipboard into a message to their client), «تذكير الطرف الثاني»
        («تم إرسال التذكير», nothing sent) and two «PDF» buttons («جارٍ تحميل
        PDF...», no file). None of those systems exists, so the promises are
        gone rather than stubbed.
      */}
      <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl border text-[12px] leading-relaxed ${
        isDark ? "border-white/[0.08] bg-white/[0.02] text-zinc-400" : "border-slate-200 bg-slate-50 text-slate-600"
      }`}>
        <Info size={15} className="flex-shrink-0 mt-0.5" />
        <p>
          <strong>سجل عقود يدوي.</strong> نظامي لا يرسل العقود ولا يوقّعها إلكترونياً ولا يحفظ ملفاتها ولا يُشعر الطرف الثاني.
          ما تسجّله هنا هو بياناتك أنت عن العقد — اسمه، الطرف الثاني، المبلغ، والحالة التي تحدّدها بنفسك —
          ولا يصل الطرف الثاني أي شيء من هذه الصفحة.
        </p>
      </div>

      {truncated && loadState === "ready" && (
        <div className={`px-4 py-2.5 rounded-2xl border text-[12px] ${
          isDark ? "border-amber-500/15 bg-amber-500/5 text-amber-300" : "border-amber-100 bg-amber-50 text-amber-700"
        }`}>
          عُرضت أحدث {WORKSPACE_PAGE_LIMIT} سجل من مساحة عملك فقط — قد تكون هناك عقود أقدم غير ظاهرة في هذه القائمة.
        </div>
      )}

      {/* ───────────── ACTIVE VIEW ───────────── */}
      {viewMode === "active" && (<>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex flex-col sm:flex-row gap-3">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في العقود..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {(["all", "draft", "pending_sign", "active"] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-xs font-semibold flex-shrink-0 transition-all ${filter === s ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20"}`}>
              {s === "all" ? "الكل" : STATUS_CONFIG[s].label}
              {/* No count badge until a read has succeeded — see headerLine. */}
              {loadState === "ready" && (
                <span className={`rounded-full px-1.5 text-[10px] font-bold ${filter === s ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                  {counts[s]}
                </span>
              )}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Contracts list — three distinct states: loading / could-not-read / empty */}
      <div className="space-y-2">
        {loadState === "loading" ? loadingPanel
        : loadState === "failed" ? failedPanel
        : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={contracts.length === 0 ? "لا توجد عقود مسجّلة" : "لا توجد عقود مطابقة"}
            description={contracts.length === 0
              ? "لم تُسجّل أي عقد في هذا السجل بعد. أضف عقداً لتتابع حالته بنفسك."
              : "لم يتم العثور على أي عقود نشطة تطابق شروط الفلترة أو البحث الحالية."}
            action={{ label: "إضافة عقد", onClick: openModal }}
          />
        ) : filtered.map((c, i) => {
          const sc = STATUS_CONFIG[c.status];
          const StatusIcon = STATUS_ICONS[c.status];
          const isExpanded = expandedId === c.id;
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <div className={`group ${card} overflow-hidden hover:border-royal/30 transition-all`}>
                {/* Row */}
                <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                    <FileText size={18} weight="duotone" className="text-royal" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`text-[14px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.title}</p>
                      <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${sc.color}`}>
                        <StatusIcon size={10} weight="fill" />{sc.label}
                      </span>
                    </div>
                    <div className={`flex items-center gap-2 text-[12px] flex-wrap ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                      <span>{c.party}</span>
                      <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                      <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>{TYPE_LABELS[c.type]}</span>
                      {c.value && <><span className="w-1 h-1 rounded-full bg-current opacity-40" /><span className="text-[#C8A762] font-mono font-semibold">{c.value}</span></>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-left hidden sm:block min-w-[110px]">
                    {/* «أُنشئ», not a signing date: this is the row's created_at
                        and nothing on this platform collects a signature. */}
                    {c.createdAt && (
                      <p className={`text-[11px] flex items-center gap-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                        <CalendarBlank size={10} />أُنشئ {c.createdAt}
                      </p>
                    )}
                  </div>
                  <CaretLeft size={14} className={`flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""} ${isDark ? "text-zinc-600" : "text-slate-300"}`} />
                </div>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className={`px-4 pb-4 pt-2 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                          تحديث الحالة المسجّلة
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {c.status === "draft" && (
                            <button onClick={() => markPendingSign(c.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark?"border-white/[0.08] text-zinc-300":"border-slate-200 text-slate-600"}`}><PaperPlaneTilt size={11}/>بانتظار التوقيع</button>
                          )}
                          {c.status === "pending_sign" && (
                            <button onClick={() => backToDraft(c.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border ${isDark?"border-white/[0.08] text-zinc-300":"border-slate-200 text-slate-600"}`}><ArrowCounterClockwise size={11}/>إرجاع إلى مسودة</button>
                          )}
                          {c.status !== "active" && (
                            <button onClick={() => markActive(c.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#0B3D2E] text-[#C8A762]"><CheckCircle size={11}/>تعليم كـ ساري</button>
                          )}
                          <button onClick={() => cancelContract(c.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-red-500/20 text-red-500"><X size={11}/>إلغاء العقد</button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>

      </> )}{/* end ACTIVE VIEW */}

      {/* ───────────── CANCELLED VIEW ───────────── */}
      {viewMode === "archive" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl border text-[12px] ${
            isDark ? "border-amber-500/15 bg-amber-500/5 text-amber-300" : "border-amber-100 bg-amber-50 text-amber-700"
          }`}>
            <Archive size={14} className="flex-shrink-0 mt-0.5" />
            <p>
              <strong>العقود الملغاة</strong> — العقود التي علّمتها كملغاة. لا تُحذف من الخادم؛ يمكنك إرجاع أيٍّ منها إلى المسودات.
            </p>
          </div>

          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
            isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"
          }`}>
            <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
            <input value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)}
              placeholder="بحث في الملغاة (اسم عقد، طرف، مبلغ...)"
              className={`flex-1 bg-transparent text-sm outline-none ${
                isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"
              }`} />
            {archiveSearch && (
              <button onClick={() => setArchiveSearch("")} className={`text-[11px] px-2 py-0.5 rounded-lg ${
                isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
              }`}>مسح</button>
            )}
          </div>

          {loadState === "loading" ? loadingPanel
          : loadState === "failed" ? failedPanel
          : archivedFiltered.length === 0 ? (
            <EmptyState
              icon={<Archive />}
              title={archiveSearch ? "لم يُعثر على نتائج" : "لا توجد عقود ملغاة"}
              description="العقود التي تُعلّمها كملغاة ستظهر هنا."
              action={archiveSearch ? { label: "عرض الكل", onClick: () => setArchiveSearch("") } : undefined}
            />
          ) : (
            <div className="space-y-2">
              {archivedFiltered.map((c, i) => (
                <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <div className={`group ${card} p-4 flex items-center gap-4 hover:border-amber-500/20 transition-all`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isDark ? "bg-amber-500/10" : "bg-amber-50"
                    }`}>
                      <FileText size={18} weight="duotone" className="text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className={`text-[14px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.title}</p>
                        <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${STATUS_CONFIG.cancelled.color}`}>
                          <Clock size={9} weight="fill" />{STATUS_CONFIG.cancelled.label}
                        </span>
                      </div>
                      <div className={`flex items-center gap-2 text-[11px] flex-wrap ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        <span>{c.party}</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>{TYPE_LABELS[c.type]}</span>
                        {c.value && <span className="text-[#C8A762] font-mono font-semibold">{c.value}</span>}
                      </div>
                    </div>
                    <button onClick={() => backToDraft(c.id)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex-shrink-0 ${
                        isDark
                          ? "border-white/[0.08] text-zinc-400 hover:border-white/[0.15] hover:text-zinc-200"
                          : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                      }`}>
                      <ArrowCounterClockwise size={11} />إرجاع إلى المسودات
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* New Contract Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
            <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }}
              className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}>
              {/* Header */}
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>عقد جديد</h3>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>خطوة {modalStep} من 3</p>
                </div>
                <button onClick={closeModal} className={`w-8 h-8 flex items-center justify-center rounded-full ${isDark ? "bg-white/10 hover:bg-white/20" : "bg-slate-100 hover:bg-slate-200"}`}>
                  <span className="text-sm font-bold">✕</span>
                </button>
              </div>
              {/* Steps progress */}
              <div className="flex gap-1.5 mb-5">
                {[1,2,3].map(s => <div key={s} className={`flex-1 h-1 rounded-full transition-all ${s <= modalStep ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-800" : "bg-slate-100"}`} />)}
              </div>

              <AnimatePresence mode="wait">
                {/* Step 1: نوع العقد */}
                {modalStep === 1 && (
                  <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                    <p className={`text-[12px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>نوع العقد</p>
                    <div className="grid grid-cols-2 gap-2">
                      {CONTRACT_TYPES.map(t => (
                        <button key={t.id} onClick={() => setNewType(t.id)}
                          className={`px-3 py-2.5 rounded-xl border text-[12px] font-semibold text-right transition-all ${
                            newType === t.id ? "bg-[#0B3D2E] text-[#C8A762] border-[#0B3D2E]" : isDark ? "border-white/[0.08] text-zinc-300 hover:border-white/20" : "border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}>{t.label}</button>
                      ))}
                    </div>
                    <button disabled={!newType} onClick={() => setModalStep(2)}
                      className="w-full mt-2 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-bold disabled:opacity-40">التالي</button>
                  </motion.div>
                )}

                {/* Step 2: الأطراف والتفاصيل */}
                {modalStep === 2 && (
                  <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                    <div>
                      <label className={`block text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>اسم العقد</label>
                      <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="مثال: عقد أتعاب — أحمد العتيبي"
                        className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-slate-50 text-slate-800"}`} />
                    </div>
                    <div>
                      <label className={`block text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>الطرف الثاني</label>
                      <input value={newParty} onChange={e => setNewParty(e.target.value)} placeholder="اسم الموكل أو الجهة"
                        className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-slate-50 text-slate-800"}`} />
                      <p className={`text-[10px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        اسم للسجل فقط — لا يُرسل إلى هذا الطرف أي إشعار.
                      </p>
                    </div>
                    <div>
                      <label className={`block text-[11px] font-bold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>المبلغ / الأتعاب (اختياري)</label>
                      <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="مثال: ٢٠,٠٠٠ ﷼"
                        className={`w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-100" : "border-slate-200 bg-slate-50 text-slate-800"}`} />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setModalStep(1)} className={`flex-1 py-2.5 rounded-xl border text-[12px] font-bold ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}>السابق</button>
                      <button disabled={!newParty} onClick={() => setModalStep(3)} className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold disabled:opacity-40">التالي</button>
                    </div>
                  </motion.div>
                )}

                {/* Step 3: مراجعة وحفظ */}
                {modalStep === 3 && (
                  <motion.div key="s3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                    <div className={`rounded-2xl p-4 space-y-2 ${isDark ? "bg-zinc-800/60" : "bg-slate-50"}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>مراجعة العقد</p>
                      <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{newTitle.trim() || `عقد جديد — ${newParty}`}</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{CONTRACT_TYPES.find(t => t.id === newType)?.label} · {newParty}</p>
                      {newValue && <p className="text-[11px] text-[#C8A762] font-mono font-bold">{newValue}</p>}
                    </div>
                    {/*
                      The second button used to read «إرسال للتوقيع» and toast
                      «تم إرسال العقد للتوقيع ✓». Its only effect was — and
                      still is — writing one status value. There is no
                      recipient, no address, no signing link and no
                      notification behind it, so it now says what it does.
                    */}
                    <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      الحفظ يسجّل العقد في سجلك فقط؛ لا يُرسل شيء لأي طرف.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setModalStep(2)} disabled={saving} className={`px-3 py-2.5 rounded-xl border text-[12px] font-bold disabled:opacity-40 ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}>السابق</button>
                      <button onClick={saveDraft} disabled={saving} className={`flex-1 py-2.5 rounded-xl border text-[12px] font-bold disabled:opacity-40 ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}>
                        {saving ? "جارٍ الحفظ…" : "حفظ مسودة"}
                      </button>
                      <button onClick={saveAwaitingSignature} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold disabled:opacity-40">
                        {saving ? "جارٍ الحفظ…" : "حفظ كـ بانتظار التوقيع"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-5 py-2.5 rounded-2xl text-[13px] font-bold text-white bg-[#0B3D2E] shadow-xl">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
