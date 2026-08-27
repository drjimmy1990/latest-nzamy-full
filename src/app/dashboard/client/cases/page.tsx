'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  Scales, CalendarBlank, ArrowUpRight, Clock, Warning,
  CheckCircle, Hourglass, XCircle, MagnifyingGlass, FileText,
} from '@phosphor-icons/react';
import { useUser } from '@/hooks/useUser';
import { listClientWorkflowRequestsPage } from '@/lib/clientWorkflowRepository';
import type { WorkflowRequest, WorkflowRequestStatus } from '@/lib/workflowStore';
import { toClientCase, type ClientCase } from '@/lib/services/clientDashboardCards';
import { matchesOrderReference } from '@/lib/services/orderReference';
import { SkeletonList } from '../_components/DashboardSkeleton';
import { normalizeDigits } from '@/utils/normalizeDigits';
import { useTheme } from '@/components/ThemeProvider';

/**
 * «قضاياي» — the client's own legal matters.
 *
 * WHERE THE ROWS COME FROM, AND WHY IT CHANGED
 * This page used to call `getActiveCases()`, which reads the `cases` table.
 * Nothing in this codebase ever writes that table, and the query it sent asked
 * for `status = "active"` — a value the rows it would have found cannot hold.
 * The result was a page that was structurally incapable of ever showing a
 * client anything, under a heading promising «متابعة كاملة لكل قضاياك».
 *
 * The platform already treats a `service_requests` row AS the case: the detail
 * page at `./[id]` reads exactly that table and prints it as a case file. So
 * this list now reads the SAME table through the SAME client-scoped helper
 * «طلباتي» uses (`listClientWorkflowRequestsPage`), and the two agree about
 * what the client has. No new table, no new column, no new endpoint.
 *
 * WHAT IS NOT ON A CARD, AND WHY
 * The old card printed a lawyer name, a court, a case type and a «الجلسة
 * القادمة» date. A `service_requests` row supplies none of those: `assigned_to`
 * is a bare user id with no name joined to it, there is no court column, and
 * nothing anywhere writes a hearing for a client. They are gone rather than
 * filled with a plausible-looking value — the same rule `CaseCard`
 * (../_components/CaseCard.tsx) already applies on the landing page.
 */

// ─── Status wording ───────────────────────────────────────────────────────────

/**
 * All SEVEN statuses the `service_requests_type_check` lifecycle allows, with
 * the labels copied VERBATIM from «طلباتي» (requests/page.tsx `STATUS_CFG`) so
 * the two client-facing lists can never disagree about the same row.
 *
 * WHY NOT `toClientCase().statusLabel` — that mapper's own `STATUS_AR` covers
 * five statuses and answers «الحالة غير معروفة» for the other two. That is the
 * honest answer for a status nothing models, but `draft` and `pending_payment`
 * ARE modelled: `find-lawyer/page.tsx:376` creates `pending_payment` rows for
 * clients and `lawyer/contracts/page.tsx:204` creates `draft` ones. Printing
 * «الحالة غير معروفة» over a state the platform knows the name of would be a
 * new falsehood introduced by this fix. Widening `STATUS_AR` is the better
 * answer and belongs in `src/lib/services/clientDashboardCards.ts` — a file
 * this pass does not own — so the table lives here for now.
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
 * The same belt `typeCfg`/`statusCfg` wear in «طلباتي»: this is a client
 * bundle, and a row carrying a status added to the database before this build
 * ships would otherwise index to `undefined` and take the whole list down on
 * `cfg.label`. Degrading to a stated "we cannot read this" beats white-screening,
 * and beats guessing at a state.
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
 * a status is ever added without being placed. Counts and the visible list are
 * both derived from this single map, which is the point: a chip reading ٥ over
 * a list of ٣ is the same class of silent lie this whole pass exists to remove.
 * Grouping copied from «طلباتي» (`STATUS_GROUP`) for the same reason as the
 * labels above.
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
      layoutId={`case-card-${card.id}`}
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

      {/* The service the client actually ordered, when the row carries one.
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
          {/* ONE action. The card used to carry a «رسالة» button beside this
              one, pointing at the undifferentiated /dashboard/client/messages
              inbox — the same destination for every card on the page. A
              per-case control that cannot carry the case is a promise of
              per-case messaging that does not exist, so it is gone. */}
          <Link href={`/dashboard/client/cases/${card.id}`} className={`flex items-center gap-1.5 text-[11px] font-bold transition-colors px-3 py-2 rounded-xl ${
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

export default function ClientCasesPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<CaseRow[]>([]);
  // Three states that must never be confused with one another: nothing has
  // been fetched yet, the fetch failed, and the client genuinely has no cases.
  // Rendering «لا توجد قضايا» over the first two is a statement about the
  // client's own file that this page is not entitled to make.
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Set when the server holds more rows than this page asked for. Stated on
  // screen rather than truncating in silence — see CLIENT_REQUESTS_FETCH_LIMIT.
  const [truncatedAt, setTruncatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await listClientWorkflowRequestsPage({ requesterUserId: user.userId });
      // PER-ROW pairing, never index pairing: `toClientCase` returns null for a
      // row it cannot render (no id), so mapping the two lists separately and
      // zipping them by position would shift every card after the first drop
      // and hang the wrong status badge on the rest of the list.
      setRows(
        page.requests
          .map((raw) => ({
            raw,
            // The local/demo store writes `createdAt`; an API row carries
            // `created_at` (the route's `toWorkflowRequest` spreads the raw row
            // verbatim), which is the name the mapper reads. Supplying the
            // camelCase value as a FALLBACK — `...raw` comes second, so a real
            // `created_at` always wins — keeps the submission date from being
            // silently dropped in demo mode. Same timestamp under two names,
            // not a substituted one.
            card: toClientCase({ created_at: raw.createdAt, ...raw }),
          }))
          .filter((row): row is CaseRow => row.card !== null),
      );
      setLoadFailed(page.degraded);
      // Compare the server's total against the rows it returned BEFORE the
      // requester filter — the only question here is "did the limit cut rows off".
      setTruncatedAt(page.total !== null && page.total > page.fetched ? page.limit : null);
    } catch (err) {
      console.error('[client cases] load failed:', err);
      setRows([]);
      setTruncatedAt(null);
      setLoadFailed(true);
    } finally {
      setHasLoaded(true);
    }
  }, [user.userId]);

  useEffect(() => {
    // Wait for useUser() to resolve first. It starts at a guest session, so
    // `user.userId` is undefined on the first render even in Supabase mode, and
    // a load fired there goes down the no-requester-id branch of
    // `listClientWorkflowRequestsPage` — which correctly refuses every server
    // row. If that one resolved second it would overwrite a correct list with
    // an empty one and leave this page reading «لا توجد قضايا» to a client who
    // has orders. `loading` is cleared by both branches of useUser, so this
    // cannot deadlock. (Same reasoning, same shape, as requests/page.tsx.)
    if (user.loading) return;
    // Every setState in `load` runs after an await, so nothing here is
    // synchronous with the effect body — the rule cannot see past the boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const onUpdated = () => { void load(); };
    window.addEventListener('nzamy-workflow-updated', onUpdated);
    return () => window.removeEventListener('nzamy-workflow-updated', onUpdated);
  }, [load, user.loading]);

  useEffect(() => {
    // `?id=<uuid>` opens the list filtered to that one case. Seeding the search
    // box is the smallest honest answer: `matchesOrderReference` already
    // accepts a full UUID, so the row the caller meant is the one that
    // survives the filter.
    //
    // THIS HANDLER HAS NO LIVE CALLER YET, and an earlier version of this
    // comment claimed otherwise — it named «three places» that link here and
    // presented the handler as a restored entry point. Checked as it stands
    // today, `/dashboard/client/cases?id=` is built in exactly two places, both
    // in messages/page.tsx (:169 and :446), and NEITHER can render: both sit
    // behind a `caseId &&` guard, and `caseId` is assigned from
    // `room.related_id` (messages/page.tsx:205) — a column `chat_rooms` does
    // not have. The table carries `request_id` and `case_id`
    // (20260603_phase1_004_community_features.sql:300-312), the GET at
    // /api/v1/chat/rooms selects `*` off that table, and the POST inserts only
    // `name` + `room_type`, so `related_id` is undefined on every room and
    // `caseId` is always "". (The third caller the old comment named,
    // consultation/page.tsx, does not link here at all — there is no
    // `client/cases` reference anywhere in that file.)
    //
    // Kept anyway, and deliberately: it is four correct lines, it is what the
    // two messages links need the day `related_id` is corrected to
    // `case_id`/`request_id`, and a handler that works before its caller does
    // is the harmless direction of that mismatch. messages/page.tsx is not this
    // pass's file — the fix there is reported as a follow-up.
    //
    // `window.location.search` rather than `useSearchParams()`: this page is not
    // wrapped in a Suspense boundary, and reading the hook here would force one
    // on the whole route for a single read that only needs to happen on mount.
    if (typeof window === 'undefined') return;
    const id = new URLSearchParams(window.location.search).get('id');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) setSearch(id);
  }, []);

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

  if (!hasLoaded) {
    return <div className="max-w-4xl mx-auto p-6" dir="rtl"><SkeletonList count={3} /></div>;
  }

  return (
    <div className={`p-6 md:p-8 max-w-[1200px] mx-auto ${isDark ? 'text-white' : 'text-zinc-900'}`} dir="rtl" suppressHydrationWarning>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ fontFamily: 'var(--font-brand)' }}>قضاياي</h1>
          <p className={`text-sm mt-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>كل طلب قانوني قدّمته إلى مكتب نظامي، وحالته الحالية</p>
        </div>
        {/*
          This used to open «قضية جديدة» — a four-step wizard
          (_components/NewCaseModal) that collected the case type, the legal
          domain, the opposing party, the details, the attachments and a voice
          note, then closed on «تم تسجيل القضية!» having sent nothing anywhere.
          Neither of its two tracks imports the network, the workflow store or
          localStorage; the whole intake was discarded on close. The button now
          goes to the catalogue that really does open a request — the same
          three-step intake «طلباتي» is fed by.
        */}
        <Link
          href="/dashboard/client/services"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#0a3328] transition-colors self-start md:self-auto"
        >
          <ArrowUpRight size={18} weight="bold" />
          اطلب خدمة قانونية
        </Link>
      </div>

      {/* Load failure — said out loud, because an empty list and a broken query
          look identical and only one of them is a fact about the client. */}
      {loadFailed && (
        <div className={`flex items-start gap-3 px-4 py-3 mb-6 rounded-xl border text-[12px] ${
          isDark ? 'bg-red-900/10 border-red-700/20 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <Warning size={16} weight="duotone" className="flex-shrink-0 mt-0.5" />
          <span>تعذّر تحميل قضاياك من الخادم. ما يظهر أدناه قد يكون غير مكتمل — حدّث الصفحة بعد قليل.</span>
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
                  <motion.div layoutId="casesTabActive" className={`absolute inset-0 rounded-xl ${isDark ? 'bg-zinc-800' : 'bg-white'} shadow-sm -z-10`} />
                )}
                {tab.label}
                {/*
                  THE COUNT IS DROPPED ON A FAILED LOAD, not zeroed.

                  `loadFailed` means the server list could not be read —
                  `listClientWorkflowRequestsPage` returned `degraded`, or the
                  call threw and `rows` was emptied. Either way `counts` is
                  derived from whatever survived, which is not a statement about
                  the client's caseload. The strip used to render regardless, so
                  a failed load put «الكل 0 / معلّقة 0 / جارية 0 …» directly
                  between a banner saying «تعذّر تحميل قضاياك من الخادم» and an
                  empty state saying «لا يمكننا تأكيد ما إذا كانت لديك قضايا» —
                  a figure asserted in the same breath as an admission that we
                  could not read where it comes from.

                  Same treatment as `balanceKnown` on ../wallet/page.tsx, with
                  one difference: there, the label «رصيد المحفظة» had to stay
                  and only the number became «—». Here the badge IS the number,
                  so it is omitted whole rather than made to print a dash.

                  The tab itself stays. It still filters what is on screen and
                  claims nothing about what is not.
                */}
                {!loadFailed && (
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

            {/* Three different empty states, because they are three different
                facts. Only the last one is allowed to say the client has no
                cases. */}
            {loadFailed ? (
              <>
                <p className={`text-lg font-bold mb-2 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>تعذّر عرض قضاياك</p>
                <p className={`text-sm max-w-sm ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
                  لم نتمكن من قراءة سجلّك من الخادم، ولا يمكننا تأكيد ما إذا كانت لديك قضايا. حاول تحديث الصفحة.
                </p>
              </>
            ) : rows.length > 0 ? (
              <>
                <p className={`text-lg font-bold mb-2 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>لا توجد قضايا مطابقة</p>
                <p className={`text-sm mb-6 max-w-sm ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
                  لا تطابق أي من قضاياك هذا البحث أو هذا الفلتر. جرّب مسح البحث أو اختيار «الكل».
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
                  لم تقدّم أي طلب قانوني حتى الآن. ابدأ من قائمة الخدمات وسيظهر طلبك هنا فور إرساله.
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

      {/* The cap, stated. There is no pagination UI in this codebase to build
          on, so naming the limit is the honest alternative to dropping the
          oldest rows without saying so.

          `toLocaleString('ar-SA')` because the sentence around it is Arabic and
          a bare `{truncatedAt}` renders Latin «100» mid-sentence. This is the
          same figure, in the same words, that «طلباتي» prints at
          ../requests/page.tsx:751 — matched deliberately so the two cannot
          drift apart.

          «طلب» and not «طلباً»: `truncatedAt` is `page.limit`, and this page
          never passes a limit, so it is always CLIENT_REQUESTS_FETCH_LIMIT =
          100 (src/lib/clientWorkflowRepository.ts:36). ١٠٠ takes its تمييز
          مفرداً مجروراً — «مئة طلبٍ» — which is «طلب», not the منصوب «طلباً»
          that ١١–٩٩ would take. No pluralisation helper for a value that is
          structurally constant. */}
      {truncatedAt !== null && (
        <p className={`mt-6 text-center text-[12px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
          يُعرض أحدث {truncatedAt.toLocaleString('ar-SA')} طلب فقط. للاطلاع على ما هو أقدم، تواصل مع فريق نظامي.
        </p>
      )}

    </div>
  );
}
