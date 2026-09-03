"use client";

/**
 * Firm cases list — rewritten 2026-09-03.
 *
 * ── WHAT THIS PAGE READS ────────────────────────────────────────────────────
 * `apiGet("/api/v1/service-requests", { limit: 200 })` — NO `receiver` filter.
 * The lawyer list filters on `receiver: "lawyer"` because a lawyer only ever
 * appears as `assigned_to`; a firm account can be BOTH the requester (it filed
 * a case for a client) and the assignee (a case was routed to it), so a
 * receiver filter would silently drop half the firm's own rows. The route's
 * RLS already scopes the result to rows where the signed-in user is the
 * requester or the assignee — the fetch does not (and could not) ask for more
 * than that.
 *
 * Rows are filtered with `isCaseRow` (copied from
 * `src/app/dashboard/lawyer/cases/page.tsx`'s `isLawyerCaseRow`) to drop tasks,
 * clients, invoices and hearings — the other four things that live on this
 * same endpoint — then mapped through `workflowToCase` from
 * `@/constants/lawyerCasesData`, the same mapper the lawyer list uses.
 *
 * ── FIRM-WIDE VIEW (since migration 20260903_phase2, run 2026-09-04) ───────
 * "قضايا المكتب" = the firm account's own rows (requester or assignee) PLUS
 * every `service_requests` row carrying the firm's `firm_id`, which the
 * "firm members read firm service requests" policy admits to active members.
 * `firm_id` is stamped server-side at creation from the creator's active
 * `firm_members` row (POST /api/v1/service-requests), so only cases created
 * AFTER a lawyer joined the firm carry it — older rows stay personal. The firm
 * owner is an automatic managing_partner member; colleagues are added from
 * /dashboard/firm/team. Nothing on this page changed for that: RLS returns
 * the wider set through the same fetch.
 *
 * ── WHAT WAS REMOVED ─────────────────────────────────────────────────────────
 * The previous 580-line version rendered `ACTIVE_CASES`/`ARCHIVE_CASES`, two
 * hand-written arrays of eight and five fictional cases (invented client
 * names, court dates, SAR values) from `@/constants/firmCasesData.ts`. Every
 * derived screen built on top of that mock has no equivalent here because
 * nothing on `service_requests` backs it:
 *   • urgency/`daysLeft`/`isAppealDeadline` — no deadline column exists on the
 *     row (same gap the lawyer list's `hasDeadline` comment documents); the
 *     red "critical appeal" banner, the urgent tab and its countdown cards are
 *     gone with it.
 *   • `importance` (1/2/3) — an invented ranking with no source field.
 *   • reminder popovers ("إضافة تذكير") — the button opened a modal whose
 *     "حفظ التذكير" button called nothing; no reminder table exists.
 *   • Kanban board — the mock's 3-status board (active/pending/suspended)
 *     dragged nothing anywhere; there was no persistence path at all, unlike
 *     the lawyer list's Kanban which does PATCH a real row.
 *   • sort-by-urgency/importance — sorted on fields that no longer exist.
 *   • `FirmCase`'s own `AddCaseModal` (`@/components/dashboard/firm/`) wrote
 *     nowhere; its submit handler was never wired to any request. Replaced
 *     with the lawyer dashboard's real `AddCaseModal`, which does insert a
 *     `service_requests` row via `createWorkflowRequest`.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel, MagnifyingGlass, Plus, CalendarCheck, CaretLeft,
  Clock, Archive, Warning,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { apiGet } from "@/lib/services/api";
import type { WorkflowRequest } from "@/lib/workflowStore";
import { workflowToCase, STATUS_CONFIG, TYPE_LABELS } from "@/constants/lawyerCasesData";
import type { Case, CaseStatus } from "@/app/dashboard/lawyer/cases/_types";
import AddCaseModal from "@/app/dashboard/lawyer/_components/AddCaseModal";
import EmptyState from "@/components/ui/EmptyState";
import { toArabicDigits } from "@/lib/services/arabicCount";
import {
  type ListRead,
  listFromApi,
  listViewState,
  itemsOf,
} from "@/lib/services/listRead";

// How many rows to ask the list endpoint for. The route's own default is 20,
// and tasks/clients/invoices/hearings all share that same budget alongside
// actual cases — see `isCaseRow` below.
const LIST_LIMIT = 200;

/**
 * Which rows on this endpoint are actually cases. Copied from
 * `isLawyerCaseRow` in the lawyer cases list — same endpoint, same four
 * non-case shapes riding along on it (tasks/clients/invoices/hearings). See
 * that file for the full reasoning behind each check; kept in sync here.
 */
function isCaseRow(request: WorkflowRequest): boolean {
  if (request.type !== "service") return false;
  const metadata = (request.metadata ?? {}) as Record<string, unknown>;
  if (metadata.task === true) return false;
  if (metadata.client === true) return false;
  if (metadata.invoice === true) return false;
  if (metadata.hearing === true) return false;
  if ("caseName" in metadata && "time" in metadata) return false;
  return true;
}

// Status chips this page filters by. "suspended" is left out for the same
// reason the lawyer list leaves it out: no backend status round-trips as
// "suspended" (see workflowToCase), so the chip could only ever read a hard 0.
const STATUS_CHIPS: (CaseStatus | "all")[] = ["all", "active", "pending", "closed", "archived"];

export default function FirmCasesPage() {
  const { isDark } = useTheme();
  const user = useUser();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "all">("all");
  const [showArchive, setShowArchive] = useState(false);
  const [showAddCase, setShowAddCase] = useState(false);

  const [loading, setLoading] = useState(true);
  const [read, setRead] = useState<ListRead<Case> | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchCases = async () => {
      setLoading(true);
      try {
        const response = await apiGet<{ data?: WorkflowRequest[]; total?: number; degraded?: boolean }>(
          "/api/v1/service-requests",
          { limit: LIST_LIMIT },
        );
        if (cancelled) return;
        if (response.degraded === true) {
          // The route answers a failed Supabase query with HTTP 200 and
          // `{ data: [], total: 0, degraded: true }` — a failure, not an
          // absence. `listFromApi` treats `degraded: true` as unreadable.
          setRead(listFromApi<Case>({ degraded: true }));
          return;
        }
        const rawRows = response.data ?? [];
        // `response.total` counts every row on this endpoint the RLS admits —
        // cases + tasks + clients + invoices + hearings together, same as the
        // lawyer list's fetch — so truncation is judged against the RAW fetch
        // count, not the case-only count after `isCaseRow`. There is no
        // server-side count of cases alone.
        setTruncated((response.total ?? rawRows.length) > rawRows.length);
        setRead(listFromApi({ data: rawRows.filter(isCaseRow).map(workflowToCase) }));
      } catch {
        if (cancelled) return;
        // A read that failed must never be rendered as "no cases". See
        // listRead.ts for why this stays a distinct state from empty.
        setRead(listFromApi(null));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCases();
    const handler = () => fetchCases();
    window.addEventListener("nzamy-workflow-updated", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("nzamy-workflow-updated", handler);
    };
  }, [reloadKey]);

  const viewState = listViewState(loading, read);
  const cases = itemsOf(read);

  const retryLoad = useCallback(() => {
    setReloadKey(k => k + 1);
  }, []);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const baseCases = useMemo(
    () => cases.filter(c => (showArchive ? c.status === "closed" || c.status === "archived" : c.status !== "closed" && c.status !== "archived")),
    [cases, showArchive],
  );

  const filtered = useMemo(() => {
    return baseCases.filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (search && !c.title.includes(search) && !c.client.includes(search) && !c.court.includes(search)) return false;
      return true;
    });
  }, [baseCases, statusFilter, search]);

  const counts = useMemo(() => ({
    all: cases.filter(c => c.status !== "closed" && c.status !== "archived").length,
    active: cases.filter(c => c.status === "active").length,
    pending: cases.filter(c => c.status === "pending").length,
    // No backend status round-trips as "suspended" (see workflowToCase in
    // lawyerCasesData.ts), so this can only ever be 0 — kept only so `counts`
    // is indexable by every `CaseStatus`, never rendered as a chip.
    suspended: 0,
    closed: cases.filter(c => c.status === "closed").length,
    archived: cases.filter(c => c.status === "archived").length,
  }), [cases]);

  const resetFilters = () => {
    setStatusFilter("all");
    setSearch("");
  };

  function CaseCard({ c }: { c: Case }) {
    const status = STATUS_CONFIG[c.status];
    return (
      <Link href={`/dashboard/firm/cases/${c.id}`}
        className={`group ${card} p-4 flex items-center gap-4 hover:border-royal/30 hover:scale-[1.005] transition-all`}>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.title}</p>
            <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${status.bg} ${status.color}`}>{status.label}</span>
          </div>
          <div className={`flex items-center gap-2 text-[11px] flex-wrap ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            <span>{c.client}</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-40" />
            <span>{c.court}</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-40" />
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>{TYPE_LABELS[c.type]}</span>
          </div>
        </div>
        <div className="flex-shrink-0 text-left hidden sm:block">
          <p className={`text-[11px] flex items-center gap-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}><Clock size={10} />{c.filedDate}</p>
        </div>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${isDark ? "text-zinc-700 group-hover:bg-white/[0.06] group-hover:text-zinc-300" : "text-slate-200 group-hover:bg-royal group-hover:text-white"}`}>
          <CaretLeft size={15} />
        </div>
      </Link>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-4" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>قضايا المكتب</h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {viewState === "loading"
              ? "جاري تحميل القضايا…"
              : viewState === "unreadable"
                ? <span className="text-red-500 font-semibold">تعذّر تحميل القضايا</span>
                : <>{toArabicDigits(counts.all)} قضية · <span className="text-emerald-500 font-semibold">{toArabicDigits(counts.active)} نشطة</span></>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/firm/hearings"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <CalendarCheck size={15} />الجلسات
          </Link>
          <button onClick={() => setShowAddCase(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <Plus size={15} weight="bold" />قضية جديدة
          </button>
        </div>
      </motion.div>

      {/* Search + archive toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في القضايا، العملاء، المحاكم..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <button onClick={() => setShowArchive(p => !p)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[12px] font-bold transition-all flex-shrink-0 ${
            showArchive ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-500"
          }`}>
          <Archive size={14} />الأرشيف
        </button>
      </div>

      {/* Status chips */}
      {viewState !== "loading" && viewState !== "unreadable" && (
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_CHIPS.filter(s => showArchive ? (s === "all" || s === "closed" || s === "archived") : (s === "all" || s === "active" || s === "pending" || s === "closed")).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                statusFilter === s ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"
              }`}>
              {s !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[s]?.dot}`} />}
              {s === "all" ? "الكل" : STATUS_CONFIG[s].label}
              <span className={`text-[9px] rounded-full px-1.5 ${statusFilter === s ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                {toArabicDigits(s === "all" ? (showArchive ? counts.closed + counts.archived : counts.all) : counts[s])}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Body — four states kept apart: loading, unreadable, empty, ready */}
      {viewState === "loading" ? (
        <div className={`${card} p-4 space-y-2`}>
          {[0, 1, 2].map(i => (
            <div key={i} className={`h-16 rounded-2xl animate-pulse ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} />
          ))}
          <p className={`text-[12px] text-center pt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جاري تحميل القضايا…</p>
        </div>
      ) : viewState === "unreadable" ? (
        <div className={`${card} p-6 text-center space-y-3`}>
          <Warning size={26} weight="duotone" className="mx-auto text-red-500" />
          <p className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تعذّرت قراءة قضايا المكتب</p>
          <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            لم يستجب الخادم لطلب القائمة. هذه ليست قائمة فارغة — قد تكون هناك قضايا لم تُقرأ بعد.
          </p>
          <button onClick={retryLoad}
            className="px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          {truncated && (
            <div className={`mb-1 rounded-2xl border p-3 text-[12px] font-semibold ${isDark ? "border-white/[0.08] bg-white/[0.03] text-zinc-400" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
              تُعرض أحدث {LIST_LIMIT} سجل فقط — قد تكون هناك قضايا أقدم غير معروضة في هذه القائمة.
            </div>
          )}
          <div className="space-y-2">
            {filtered.length === 0 ? (
              cases.length === 0 ? (
                <EmptyState
                  icon={<Gavel />}
                  title="لا توجد قضايا بعد"
                  description="القضايا التي يضيفها المكتب أو تُسند إليه ستظهر هنا."
                  action={{ label: "قضية جديدة", onClick: () => setShowAddCase(true) }}
                />
              ) : (
                <EmptyState
                  icon={showArchive ? <Archive /> : <Gavel />}
                  title={showArchive ? "لا توجد قضايا مؤرشفة" : "لا توجد قضايا مطابقة"}
                  description={showArchive ? "القضايا المغلقة أو المؤرشفة ستظهر هنا." : "لم يتم العثور على أي قضايا تطابق شروط البحث الحالية."}
                  action={{ label: "إعادة ضبط الفلاتر", onClick: resetFilters }}
                />
              )
            ) : (
              filtered.map((c, i) => (
                <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <CaseCard c={c} />
                </motion.div>
              ))
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {showAddCase && (
          <AddCaseModal
            onClose={() => setShowAddCase(false)}
            isDark={isDark}
            user={{ userId: user.userId, name: user.name, userType: user.userType, tier: user.tier }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
