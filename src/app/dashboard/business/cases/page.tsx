'use client';

/**
 * قضايا الشركة — /dashboard/business/cases.
 *
 * ── WHAT THIS PAGE READS, AND WHY ───────────────────────────────────────────
 * A corporate account is a REQUESTER, exactly like an individual client — it
 * files a case through the same catalogue (owner ruling س٢, 26 August, see
 * `../page.tsx`'s file-top comment) and never appears as `assigned_to` on a
 * `service_requests` row; that column is written for lawyers/admins only. So
 * this page reads the SAME table through the SAME client-scoped helper
 * «قضاياي» uses — `listClientWorkflowRequestsPage` from
 * `@/lib/clientWorkflowRepository` — rather than the firm list's pattern
 * (`../../firm/cases/page.tsx`), which additionally reads rows where the
 * account is the *assignee*. A firm can be handed a case; a company cannot.
 *
 * ── WHY THIS IS "ITS OWN ROWS ONLY", AND WHY THAT IS CORRECT ────────────────
 * "قضايا الشركة" reads as "every case anyone at the company filed", but no
 * code path in this repo ever inserts a `firm_members`-style row for a
 * corporate account, and `service_requests` RLS admits only
 * `requester_user_id = auth.uid()` (`OR assigned_to = auth.uid()`, which never
 * matches a company). There is no company-wide membership model yet, so this
 * page shows exactly the rows filed under THIS LOGIN — one signed-in user's
 * own activity, not a roster of colleagues' filings. That is the honest
 * behaviour of the data as it exists today; a real company-wide view needs a
 * membership table plus an RLS policy that joins through it, which is not
 * this page's work to fake with a client-side merge.
 *
 * ── WHAT WAS HERE, AND WHAT DID NOT SURVIVE ─────────────────────────────────
 * The previous 569-line version rendered `MOCK_CASES`, seven fabricated cases
 * (named clients, court dates, SAR values) from `@/constants/businessCasesData`,
 * behind a list/kanban/archive switch. Every derived screen built on that mock
 * has no equivalent here because nothing on `service_requests` backs it:
 *   • court / degree / stage / team / value / nextDate — no such columns exist
 *     on the row; a case file here can name a status and a service, nothing
 *     else (see `toClientCase`, `@/lib/services/clientDashboardCards`).
 *   • the red "N قضية لديها مواعيد طعون قادمة" banner and `criticalCount` —
 *     computed from `hasDeadline`, an invented field.
 *   • the Kanban board (`KANBAN_COLS`, drag-and-drop) — its columns encoded a
 *     workflow stage no table stores, and dropping a card into one PATCHed
 *     nothing anywhere.
 *   • the team filter (`allTeam`) — built from `MOCK_CASES[].team`, a roster
 *     that was never real.
 *   • `AddCaseModal` (`@/components/dashboard/business/AddCaseModal`) — a
 *     two-step form whose only handler was `onClose`; nothing it collected
 *     was ever sent anywhere. The «قضية جديدة» action now points at the same
 *     three-step intake `../page.tsx`'s «اطلب خدمة قانونية» and «قضاياي»'s
 *     «اطلب خدمة قانونية» both use — a link, not a modal, per the same owner
 *     ruling cited above.
 *
 * `@/constants/businessCasesData.ts` and
 * `@/components/dashboard/business/AddCaseModal.tsx` are deleted in this same
 * change — this page was their only importer.
 *
 * ── WHAT WAS NOT FIXED HERE ──────────────────────────────────────────────────
 * `./[id]/page.tsx` — the case-file destination these cards link to — is still
 * a fabricated screen (a `ShareGraphModal` that claims to encrypt and send an
 * external share, a graph view over data no table holds). Its cards will now
 * point real companies at a fake case file; that page is not this change's
 * file, and the fix is reported as a follow-up rather than attempted here.
 * Also unchanged: the layout's hidden-section gate, which today keeps this
 * whole route unreachable for `corporate` accounts — that gate is the
 * layout's business, not this file's.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  Scales, CalendarBlank, ArrowUpRight, ArrowClockwise, Clock, Warning,
  CheckCircle, Hourglass, XCircle, MagnifyingGlass, FileText,
} from '@phosphor-icons/react';
import { useUser } from '@/hooks/useUser';
import { listClientWorkflowRequestsPage } from '@/lib/clientWorkflowRepository';
import type { WorkflowRequest, WorkflowRequestStatus } from '@/lib/workflowStore';
import { toClientCase, type ClientCase } from '@/lib/services/clientDashboardCards';
import {
  listOk,
  listFailed,
  listViewState,
  itemsOf,
  type ListRead,
} from '@/lib/services/listRead';
import { matchesOrderReference } from '@/lib/services/orderReference';
import { SkeletonList } from '@/app/dashboard/client/_components/DashboardSkeleton';
import { normalizeDigits } from '@/utils/normalizeDigits';
import { useTheme } from '@/components/ThemeProvider';
import { RoleGuard } from '@/components/dashboard/RoleGuard';
import { SubscriptionGuard } from '@/components/dashboard/SubscriptionGuard';

// ─── Status wording ───────────────────────────────────────────────────────────

/**
 * All SEVEN statuses the `service_requests_type_check` lifecycle allows, with
 * the labels copied VERBATIM from «قضاياي» (`../../client/cases/page.tsx`'s
 * `STATUS_CFG`, itself copied from «طلباتي») so no two case lists in this app
 * can ever disagree about the same status. See that file's own comment for
 * why `draft`/`pending_payment` are named rather than folded into "unknown".
 */
type StatusTone = { label: string; lightBadge: string; darkBadge: string; icon: typeof CheckCircle };

const STATUS_CFG: Record<WorkflowRequestStatus, StatusTone> = {
  draft:              { label: 'مسودة',           lightBadge: 'bg-slate-100 text-slate-600 border-slate-200',    darkBadge: 'bg-white/5 text-zinc-400 border-white/10',            icon: Hourglass },
  pending_payment:    { label: 'بانتظار الدفع',   lightBadge: 'bg-amber-50 text-amber-700 border-amber-200',     darkBadge: 'bg-amber-900/30 text-amber-400 border-amber-700/50',  icon: Hourglass },
  pending_assignment: { label: 'بانتظار التعيين', lightBadge: 'bg-amber-50 text-amber-700 border-amber-200',     darkBadge: 'bg-amber-900/30 text-amber-400 border-amber-700/50',  icon: Hourglass },
  assigned:           { label: 'مُعيَّن',          lightBadge: 'bg-blue-50 text-blue-700 border-blue-200',        darkBadge: 'bg-blue-900/30 text-blue-400 border-blue-700/50',     icon: Clock },
  in_review:          { label: 'جارٍ التنفيذ',    lightBadge: 'bg-blue-50 text-blue-700 border-blue-200',        darkBadge: 'bg-blue-900/30 text-blue-400 border-blue-700/50',     icon: Clock },
  completed:          { label: 'مكتمل',           lightBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200', darkBadge: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50', icon: CheckCircle },
  cancelled:          { label: 'ملغي',            lightBadge: 'bg-red-50 text-red-700 border-red-200',           darkBadge: 'bg-red-900/20 text-red-400 border-red-700/40',        icon: XCircle },
};

/**
 * Same belt «قضاياي» wears: a status added to the database before this build
 * ships would otherwise index to `undefined` and take the whole list down on
 * `cfg.label`. Stating "we cannot read this" beats white-screening.
 */
const UNKNOWN_STATUS_CFG: StatusTone = {
  label: 'حالة غير معروفة',
  lightBadge: 'bg-slate-100 text-slate-600 border-slate-200',
  darkBadge: 'bg-white/5 text-zinc-300 border-white/10',
  icon: Hourglass,
};

function statusCfg(status: WorkflowRequestStatus): StatusTone {
  return STATUS_CFG[status] ?? UNKNOWN_STATUS_CFG;
}

type FilterKey = 'all' | 'pending' | 'active' | 'completed' | 'cancelled';

/**
 * One status → one chip, as a total Record so TypeScript refuses to compile if
 * a status is ever added without being placed. Copied from «قضاياي» for the
 * same reason as the labels above — see that file for the full reasoning.
 */
const STATUS_GROUP: Record<WorkflowRequestStatus, Exclude<FilterKey, 'all'>> = {
  draft:              'pending',
  pending_payment:    'pending',
  pending_assignment: 'pending',
  assigned:           'active',
  in_review:          'active',
  completed:          'completed',
  cancelled:          'cancelled',
};

/** A row plus the card it maps to. Paired per row, never by index — see below. */
type CaseRow = { raw: WorkflowRequest; card: ClientCase };

// ─── Card ─────────────────────────────────────────────────────────────────────

function CaseCard({ row, index, isDark }: { row: CaseRow; index: number; isDark: boolean }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const cfg = statusCfg(row.raw.status);
  const Icon = cfg.icon;
  const { card } = row;

  return (
    <motion.div
      ref={ref}
      layoutId={`business-case-card-${card.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ type: 'spring', stiffness: 100, damping: 20, delay: index * 0.05 }}
      className={`group flex flex-col p-6 rounded-[2rem] border transition-all duration-300 h-full ${
        isDark
          ? 'bg-zinc-900/50 border-white/10 hover:bg-zinc-800/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
          : 'bg-white border-zinc-200 hover:border-[#0B3D2E]/20 hover:shadow-lg hover:shadow-[#0B3D2E]/5'
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-[15px] leading-snug mb-1.5 truncate ${isDark ? 'text-white' : 'text-zinc-900'}`}>{card.title}</p>
          {/* The short, readable reference — never the raw UUID. See
              src/lib/services/orderReference.ts for why six hex characters. */}
          <p className={`text-xs font-mono ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>{card.caseNo}</p>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border font-bold ${isDark ? cfg.darkBadge : cfg.lightBadge}`}>
          <Icon size={12} weight="fill" />
          {cfg.label}
        </span>
      </div>

      {/* The service the company actually ordered, when the row carries one.
          Omitted entirely — not replaced with «عام» — when it does not. */}
      {card.serviceLabel && (
        <div className="mb-5">
          <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${
            isDark ? 'border-white/10 text-zinc-400' : 'border-zinc-200 text-zinc-500'
          }`}>
            <Scales size={12} />
            {card.serviceLabel}
          </span>
        </div>
      )}

      <div className="mt-auto">
        {/* Submission date — dropped when `created_at` is missing or unreadable
            rather than printed as a dash or an invented day. */}
        {card.createdAtLabel && (
          <div className={`flex items-center gap-2 p-3 rounded-xl mb-4 ${
            isDark ? 'bg-white/[0.03] border border-white/10' : 'bg-zinc-50 border border-zinc-100'
          }`}>
            <CalendarBlank size={15} className="text-[#C8A762] flex-shrink-0" />
            <p className={`text-[12px] font-bold ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>قُدّمت في {card.createdAtLabel}</p>
          </div>
        )}

        <div className="flex items-center justify-end pt-4 border-t border-dashed border-zinc-200 dark:border-white/10">
          <Link href={`/dashboard/business/cases/${card.id}`} className={`flex items-center gap-1.5 text-[11px] font-bold transition-colors px-3 py-2 rounded-xl ${
            isDark ? 'bg-[#0B3D2E]/20 text-emerald-400 hover:bg-[#0B3D2E]/40' : 'bg-[#0B3D2E]/10 text-[#0B3D2E] hover:bg-[#0B3D2E]/20'
          }`}>
            <FileText size={14} weight="fill" />
            ملف القضية
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function BusinessCasesPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  /**
   * The three states that must never be confused with one another — nothing
   * has been fetched yet, the fetch failed, and the company genuinely has no
   * cases — carried by `ListRead` + `listViewState()`
   * (src/lib/services/listRead.ts), exactly as «قضاياي» carries them.
   */
  const [read, setRead] = useState<ListRead<CaseRow> | null>(null);
  const [loading, setLoading] = useState(true);
  // Set when the server holds more rows than this page asked for. Stated on
  // screen rather than truncating in silence — see CLIENT_REQUESTS_FETCH_LIMIT.
  const [truncatedAt, setTruncatedAt] = useState<number | null>(null);

  /**
   * Only the NEWEST load may write. This page fires `load()` from the mount
   * effect, the `nzamy-workflow-updated` listener, and «إعادة المحاولة» —
   * routinely two in flight at once. Same sequence guard as «قضاياي», for the
   * same reason: a slower stale reply must not overwrite a newer good one.
   */
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const page = await listClientWorkflowRequestsPage({ requesterUserId: user.userId });
      if (seq !== loadSeq.current) return;
      // PER-ROW pairing, never index pairing: `toClientCase` returns null for a
      // row it cannot render (no id), so mapping the two lists separately and
      // zipping them by position would shift every card after the first drop.
      const mapped = page.requests
        .map((raw) => ({
          raw,
          // The local/demo store writes `createdAt`; an API row carries
          // `created_at`. Supplying the camelCase value as a FALLBACK keeps
          // the submission date from being silently dropped in demo mode.
          card: toClientCase({ created_at: raw.createdAt, ...raw }),
        }))
        .filter((row): row is CaseRow => row.card !== null);
      setRead(page.degraded ? listFailed<CaseRow>() : listOk(mapped));
      // Compare the server's total against the rows it returned BEFORE the
      // requester filter — the only question here is "did the limit cut rows off".
      setTruncatedAt(page.total !== null && page.total > page.fetched ? page.limit : null);
    } catch (err) {
      console.error('[business cases] load failed:', err);
      if (seq !== loadSeq.current) return;
      setRead(listFailed<CaseRow>());
      setTruncatedAt(null);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [user.userId]);

  /** The retry the failure banner and the failure empty-state both press. */
  const retry = useCallback(() => {
    setLoading(true);
    setRead(null);
    void load();
  }, [load]);

  useEffect(() => {
    // Wait for useUser() to resolve first — it starts at a guest session, so
    // `user.userId` is undefined on the first render even in Supabase mode.
    // A load fired there goes down the no-requester-id branch of
    // `listClientWorkflowRequestsPage`, which correctly refuses every server
    // row. Same reasoning as «قضاياي».
    if (user.loading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const onUpdated = () => { void load(); };
    window.addEventListener('nzamy-workflow-updated', onUpdated);
    return () => window.removeEventListener('nzamy-workflow-updated', onUpdated);
  }, [load, user.loading]);

  const view = listViewState(loading, read);
  // itemsOf() answers [] on every branch but 'ready' — which is what the
  // filter and the counts below are entitled to see: on an unreadable read
  // there is nothing this page may count.
  const rows = useMemo(() => itemsOf(read), [read]);

  const filtered = useMemo(() => {
    const nq = normalizeDigits(search.trim().toLowerCase());
    return rows.filter(({ raw, card }) => {
      if (filter !== 'all' && STATUS_GROUP[raw.status] !== filter) return false;
      if (!nq) return true;
      return (
        normalizeDigits(card.title.toLowerCase()).includes(nq) ||
        (card.serviceLabel ? normalizeDigits(card.serviceLabel.toLowerCase()).includes(nq) : false) ||
        matchesOrderReference(card.id, search.trim())
      );
    });
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const base: Record<FilterKey, number> = { all: rows.length, pending: 0, active: 0, completed: 0, cancelled: 0 };
    for (const { raw } of rows) {
      const group = STATUS_GROUP[raw.status];
      if (group) base[group] += 1;
    }
    return base;
  }, [rows]);

  const tabs: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'الكل', count: counts.all },
    { key: 'pending', label: 'معلّقة', count: counts.pending },
    { key: 'active', label: 'جارية', count: counts.active },
    { key: 'completed', label: 'مكتملة', count: counts.completed },
    { key: 'cancelled', label: 'ملغاة', count: counts.cancelled },
  ];

  return (
    <div className={`p-6 md:p-8 max-w-[1200px] mx-auto ${isDark ? 'text-white' : 'text-zinc-900'}`} dir="rtl" suppressHydrationWarning>

      {view === 'loading' ? (
        <SkeletonList count={3} />
      ) : (
        <>
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ fontFamily: 'var(--font-brand)' }}>قضايا الشركة</h1>
              <p className={`text-sm mt-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>كل طلب قانوني قدّمته منشأتك إلى مكتب نظامي، وحالته الحالية</p>
            </div>
            {/*
              The SAME link «قضاياي» and «../page.tsx»'s header both use —
              the real three-step intake, not a modal. The old «قضية جديدة»
              button opened `AddCaseModal`, a two-step form whose only wired
              callback was `onClose`; nothing it collected was ever sent.
            */}
            <Link
              href="/dashboard/client/services"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#0a3328] transition-colors self-start md:self-auto"
            >
              <ArrowUpRight size={18} weight="bold" />
              اطلب خدمة قانونية
            </Link>
          </div>

          {/* Load failure — said out loud, because an empty list and a broken
              query look identical and only one of them is a fact about the
              company. The retry beside it refetches in place. */}
          {view === 'unreadable' && (
            <div className={`flex items-start gap-3 px-4 py-3 mb-6 rounded-xl border text-[12px] ${
              isDark ? 'bg-red-900/10 border-red-700/20 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              <Warning size={16} weight="duotone" className="flex-shrink-0 mt-0.5" />
              <span className="flex-1">تعذّرت قراءة قضايا منشأتك من الخادم.</span>
              <button
                type="button"
                onClick={retry}
                className={`flex-shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                  isDark ? 'border-red-700/40 hover:bg-red-900/20' : 'border-red-300 hover:bg-red-100'
                }`}
              >
                <ArrowClockwise size={12} weight="bold" />
                إعادة المحاولة
              </button>
            </div>
          )}

          {/* Filters & Search */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4 mb-8">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlass size={16} className={`absolute right-4 top-1/2 -translate-y-1/2 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالعنوان أو رقم الطلب (ORD-…)"
                className={`w-full pr-10 pl-4 py-3 text-sm rounded-2xl border outline-none transition-all ${
                  isDark
                    ? 'bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-[#0B3D2E] focus:bg-zinc-900'
                    : 'bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-[#0B3D2E] focus:ring-4 focus:ring-[#0B3D2E]/5'
                }`}
              />
            </div>

            <div className={`flex items-center gap-1.5 p-1.5 rounded-2xl overflow-x-auto ${isDark ? 'bg-white/5' : 'bg-zinc-100'}`}>
              {tabs.map((tab) => {
                const isActive = filter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setFilter(tab.key)}
                    className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap ${
                      isActive
                        ? isDark ? 'bg-zinc-800 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm'
                        : isDark ? 'text-zinc-400 hover:text-white hover:bg-white/5' : 'text-zinc-500 hover:text-zinc-900 hover:bg-white/50'
                    }`}
                  >
                    {isActive && (
                      <motion.div layoutId="businessCasesTabActive" className={`absolute inset-0 rounded-xl ${isDark ? 'bg-zinc-800' : 'bg-white'} shadow-sm -z-10`} />
                    )}
                    {tab.label}
                    {/* THE COUNT IS DROPPED ON A FAILED LOAD, not zeroed —
                        see «قضاياي» for the full reasoning. */}
                    {view !== 'unreadable' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                        isActive
                          ? 'bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-emerald-500/20 dark:text-emerald-400'
                          : isDark ? 'bg-white/10 text-zinc-400' : 'bg-zinc-200 text-zinc-500'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cases Grid */}
          <AnimatePresence mode="popLayout">
            {filtered.length > 0 ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch"
              >
                {filtered.map((row, i) => (
                  <CaseCard key={row.card.id} row={row} index={i} isDark={isDark} />
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`flex flex-col items-center justify-center py-24 px-6 text-center rounded-[2.5rem] border border-dashed ${
                  isDark ? 'border-white/10 bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50/50'
                }`}
              >
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-5 shadow-inner ${
                  isDark ? 'bg-white/5 text-zinc-600' : 'bg-white border border-zinc-100 text-zinc-300'
                }`}>
                  <Scales size={36} weight="duotone" />
                </div>

                {/* Three different empty states, because they are three
                    different facts. Only the last one is allowed to say the
                    company has no cases. */}
                {view === 'unreadable' ? (
                  <>
                    <p className={`text-lg font-bold mb-2 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>تعذّر عرض قضايا منشأتك</p>
                    <p className={`text-sm mb-6 max-w-sm ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
                      لم نتمكن من قراءة السجلّ من الخادم، ولا يمكننا تأكيد ما إذا كانت لدى منشأتك قضايا.
                    </p>
                    <button
                      onClick={retry}
                      className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-colors ${
                        isDark ? 'bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1]' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      <ArrowClockwise size={16} weight="bold" />
                      إعادة المحاولة
                    </button>
                  </>
                ) : rows.length > 0 ? (
                  <>
                    <p className={`text-lg font-bold mb-2 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>لا توجد قضايا مطابقة</p>
                    <p className={`text-sm mb-6 max-w-sm ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
                      لا تطابق أي من قضايا منشأتك هذا البحث أو هذا الفلتر. جرّب مسح البحث أو اختيار «الكل».
                    </p>
                    <button
                      onClick={() => { setSearch(''); setFilter('all'); }}
                      className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-colors ${
                        isDark ? 'bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1]' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      إعادة ضبط البحث
                    </button>
                  </>
                ) : (
                  <>
                    <p className={`text-lg font-bold mb-2 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>لا توجد قضايا بعد</p>
                    <p className={`text-sm mb-6 max-w-sm ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
                      لم تقدّم منشأتك أي طلب قانوني حتى الآن. ابدأ من قائمة الخدمات وسيظهر طلبك هنا فور إرساله.
                    </p>
                    <Link
                      href="/dashboard/client/services"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#0a3328] transition-colors"
                    >
                      تصفّح الخدمات القانونية
                      <ArrowUpRight size={16} />
                    </Link>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* The cap, stated — same figure, same words, as «قضاياي» prints,
              matched deliberately so the two cannot drift apart. */}
          {truncatedAt !== null && (
            <p className={`mt-6 text-center text-[12px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              يُعرض أحدث {truncatedAt.toLocaleString('ar-SA')} طلب فقط. للاطلاع على ما هو أقدم، تواصل مع فريق نظامي.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Guarded export ─────────────────────────────────────────────────────────

export default function CasesPage() {
  return (
    <RoleGuard blockedRoles={["hr_manager", "finance_manager", "employee"]}>
      <SubscriptionGuard featureKey="business-litigation">
        <BusinessCasesPage />
      </SubscriptionGuard>
    </RoleGuard>
  );
}
