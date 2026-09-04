'use client';

/**
 * /dashboard/client/contracts — «عقودي», REWRITTEN on the Phase 3 contract
 * manager (src/lib/services/contractsService.ts).
 * ─────────────────────────────────────────────────────────
 * Replaces the previous version, which read `service_requests` rows of
 * `type === 'ai_draft'` and fabricated everything a real contract needs:
 * `signedAt`/`expiresAt` were invented from the request's own status, the
 * "activity timeline" was one synthetic «created» event per row, and the
 * e-signature button was permanently disabled behind a hardcoded «قريباً».
 *
 * A contract now reaches this page only when a lawyer's contract carries this
 * client's `client_user_id` (see the server addition in
 * /api/v1/lawyer/contracts POST and PATCH) — a real row with real versions,
 * obligations and a payment schedule, never a request re-labelled as one.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  FileText, MagnifyingGlass, WarningCircle, ArrowClockwise, CalendarBlank,
  UserCircle, X, DownloadSimple, ListChecks, Receipt, Info, PlusCircle,
  ClockCountdown, CheckCircle, SealWarning,
} from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';
import { itemsOf, listViewState, type ListRead } from '@/lib/services/listRead';
import {
  getClientContracts, getClientContract, getClientContractVersionUrl,
  type Contract, type ContractDetail, type ContractVersion,
} from '@/lib/services/contractsService';
import {
  CONTRACT_STATUSES, CONTRACT_STATUS_AR, CONTRACT_TYPE_AR,
  VERSION_LABEL_AR, OBLIGATION_KIND_AR, OBLIGATION_STATUS_AR,
  PAYMENT_STAGE_AR, PAYMENT_STATUS_AR, type ContractStatus,
} from '@/lib/services/contractVocabulary';
import { contractExpiryState, paymentScheduleTotals, isPaymentOverdue } from '@/lib/services/contractDates';
import { formatGregorianAr } from '@/app/dashboard/lawyer/_components/DeadlineCard';
import { toArabicDigits } from '@/lib/services/arabicCount';

// ─── formatting helpers (Arabic-Indic throughout — never a bare Western digit
// beside an Arabic-Indic one on the same screen) ────────────────────────────

/** `date` columns (starts_on/ends_on/signed_on/due_on/paid_on) are already `yyyy-mm-dd`. */
function dateAr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return formatGregorianAr(iso);
}

/** `created_at` on a version is a timestamptz — only the date is shown here. */
function timestampDateAr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return formatGregorianAr(`${y}-${m}-${day}`);
}

function sarAr(amount: number): string {
  return `${toArabicDigits(amount.toLocaleString('en-US', { maximumFractionDigits: 2 }))} ر.س`;
}

const STATUS_CHIP_CLS: Record<ContractStatus, { light: string; dark: string }> = {
  draft:             { light: 'bg-slate-100 text-slate-600 border-slate-200', dark: 'bg-white/[0.06] text-zinc-400 border-white/10' },
  under_review:      { light: 'bg-blue-50 text-blue-600 border-blue-200', dark: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  pending_signature: { light: 'bg-amber-50 text-amber-700 border-amber-200', dark: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  active:            { light: 'bg-emerald-50 text-emerald-700 border-emerald-200', dark: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  expired:           { light: 'bg-red-50 text-red-600 border-red-200', dark: 'bg-red-500/10 text-red-400 border-red-500/20' },
  terminated:        { light: 'bg-slate-100 text-slate-500 border-slate-200', dark: 'bg-white/[0.06] text-zinc-500 border-white/10' },
  cancelled:         { light: 'bg-slate-100 text-slate-500 border-slate-200', dark: 'bg-white/[0.06] text-zinc-500 border-white/10' },
};

/** «منتهٍ» / «ينتهي قريباً» — null when there is nothing to warn about. */
function expiryBadge(endsOn: string | null, today: Date | null, isDark: boolean): { label: string; cls: string } | null {
  if (!today) return null;
  const state = contractExpiryState(endsOn, today);
  const red = isDark ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-600 border-red-200';
  const amber = isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200';
  if (state === 'expired') return { label: 'منتهٍ', cls: red };
  if (state === 'expiring_soon') return { label: 'ينتهي قريباً', cls: amber };
  return null;
}

const TABS: { key: ContractStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'الكل' },
  ...CONTRACT_STATUSES.map((s) => ({ key: s, label: CONTRACT_STATUS_AR[s] })),
];

type DetailTab = 'overview' | 'versions' | 'obligations' | 'payments';
const DETAIL_TABS: { key: DetailTab; label: string; icon: typeof FileText }[] = [
  { key: 'overview', label: 'نظرة عامة', icon: FileText },
  { key: 'versions', label: 'النسخ', icon: DownloadSimple },
  { key: 'obligations', label: 'الالتزامات', icon: ListChecks },
  { key: 'payments', label: 'جدول الدفعات', icon: Receipt },
];

// ─── Contract card (list row) ───────────────────────────────────────────────

function ContractCard({
  c, isSelected, onClick, isDark, today,
}: { c: Contract; isSelected: boolean; onClick: () => void; isDark: boolean; today: Date | null }) {
  const chip = STATUS_CHIP_CLS[c.status];
  const badge = expiryBadge(c.endsOn, today, isDark);
  return (
    <motion.div
      layout
      onClick={onClick}
      className={`group p-5 rounded-2xl border cursor-pointer transition-all duration-200 ${
        isSelected
          ? isDark
            ? 'bg-[#0B3D2E]/20 border-[#0B3D2E] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
            : 'border-[#0B3D2E]/40 bg-[#0B3D2E]/5 shadow-[0_0_0_2px_rgba(11,61,46,0.12)]'
          : isDark
            ? 'bg-zinc-900/50 border-white/10 hover:bg-zinc-800/80 hover:border-white/20'
            : 'border-zinc-200 bg-white hover:border-[#0B3D2E]/20 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isSelected ? (isDark ? 'bg-[#0B3D2E]/40' : 'bg-[#0B3D2E]/10') : isDark ? 'bg-white/5' : 'bg-[#0B3D2E]/5'
          }`}>
            <FileText size={18} weight={isSelected ? 'fill' : 'duotone'} className={isDark ? 'text-emerald-400' : 'text-[#0B3D2E]'} />
          </div>
          <p className={`font-bold text-[14px] truncate ${isDark ? 'text-white' : 'text-zinc-900'}`}>{c.title}</p>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-bold ${isDark ? chip.dark : chip.light}`}>
          {CONTRACT_STATUS_AR[c.status]}
        </span>
      </div>
      <div className={`flex items-center justify-between gap-2 text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
        <span className="truncate">{CONTRACT_TYPE_AR[c.contractType]}{c.ownerName ? ` · المحامي: ${c.ownerName}` : ''}</span>
        {badge && (
          <span className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-bold ${badge.cls}`}>
            <CalendarBlank size={11} />{badge.label}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientContractsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ContractStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');

  // «today» is read once, after mount — never during render/SSR, so a cached
  // server render can never bake in a stale expiry/overdue verdict (the SSR
  // cached-date trap this codebase has already been bitten by once).
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => { setToday(new Date()); }, []);

  // ── List ──
  const [read, setRead] = useState<ListRead<Contract> | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getClientContracts().then((result) => { if (!cancelled) setRead(result); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const view = listViewState(loading, read);
  const contracts = useMemo(() => itemsOf(read), [read]);

  const filtered = useMemo(() => {
    const q = search.trim();
    return contracts.filter((c) => {
      const matchFilter = filter === 'all' || c.status === filter;
      const matchSearch = !q || c.title.includes(q) || (c.counterpartyName ?? '').includes(q) || (c.ownerName ?? '').includes(q);
      return matchFilter && matchSearch;
    });
  }, [contracts, filter, search]);

  useEffect(() => {
    if (selectedId && !filtered.find((c) => c.id === selectedId)) setSelectedId(null);
  }, [filtered, selectedId]);

  // ── Detail (throws — loading/error/ready, not a ListRead) ──
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailReloadKey, setDetailReloadKey] = useState(0);

  useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailError(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetailTab('overview');
    getClientContract(selectedId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(err instanceof Error && err.message ? err.message : 'تعذّر تحميل العقد.');
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, detailReloadKey]);

  // ── Version downloads ──
  const [versionBusy, setVersionBusy] = useState<Record<string, boolean>>({});
  const [versionError, setVersionError] = useState<Record<string, string>>({});

  async function handleDownloadVersion(contractId: string, version: ContractVersion) {
    setVersionBusy((b) => ({ ...b, [version.id]: true }));
    setVersionError((e) => { const n = { ...e }; delete n[version.id]; return n; });
    const url = await getClientContractVersionUrl(contractId, version.id);
    setVersionBusy((b) => ({ ...b, [version.id]: false }));
    if (!url) {
      setVersionError((e) => ({ ...e, [version.id]: 'تعذّر إنشاء رابط التنزيل' }));
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const card = isDark
    ? 'rounded-2xl border border-white/10 bg-zinc-900/60'
    : 'rounded-2xl border border-zinc-200 bg-white';

  // ─── Failed list read — a separate screen, same shape as every other honest
  //     unreadable state in this codebase. NOT «لا عقود» — we never asked. ────
  if (view === 'unreadable') {
    return (
      <div className="p-6 md:p-8 max-w-[1300px] mx-auto" dir="rtl">
        <div className={`flex items-start gap-3 p-5 rounded-2xl border ${isDark ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-red-200 bg-red-50 text-red-800'}`}>
          <WarningCircle size={20} weight="fill" className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold">تعذّر تحميل العقود</p>
            <p className="text-xs mt-1 opacity-80">
              لم تصل قائمة عقودك من الخادم. هذه ليست قائمة فارغة — قد تكون لديك عقود لم تُقرأ.
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                isDark ? 'border-red-500/40 hover:bg-red-500/10' : 'border-red-300 hover:bg-red-100'
              }`}
            >
              <ArrowClockwise size={13} weight="bold" />
              إعادة المحاولة
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 md:p-8 max-w-[1300px] mx-auto ${isDark ? 'text-white' : 'text-zinc-900'}`} dir="rtl" suppressHydrationWarning>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ fontFamily: 'var(--font-brand)' }}>عقودي</h1>
          <p className={`text-sm mt-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>العقود التي يربطها محاميك بحسابك — نسخها، التزاماتها وجدول دفعاتها</p>
        </div>
        <Link
          href="/ai/contract-drafter"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#0a3328] transition-colors self-start md:self-auto"
        >
          <PlusCircle size={18} weight="bold" />
          محترف العقود المختصر
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-6">

        {/* ── Left: list ── */}
        <div>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <MagnifyingGlass size={16} className={`absolute right-4 top-1/2 -translate-y-1/2 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالعنوان أو الطرف الآخر أو المحامي…"
                className={`w-full pr-10 pl-4 py-3 text-sm rounded-2xl border outline-none transition-all ${
                  isDark
                    ? 'bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-[#0B3D2E]'
                    : 'bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-[#0B3D2E] focus:ring-4 focus:ring-[#0B3D2E]/5'
                }`}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-6">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-bold transition-all whitespace-nowrap ${
                  filter === t.key
                    ? isDark ? 'bg-[#C8A762]/15 text-[#C8A762]' : 'bg-[#0B3D2E] text-white'
                    : isDark ? 'bg-white/[0.05] text-zinc-400 hover:bg-white/[0.08]' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {view === 'loading' ? (
            <div className={`${card} p-10 flex items-center justify-center gap-2 text-[13px] ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
              <div className="w-4 h-4 border-2 border-[#C8A762]/30 border-t-[#C8A762] rounded-full animate-spin" />
              جارٍ تحميل العقود...
            </div>
          ) : filtered.length === 0 ? (
            <div className={`flex flex-col items-center py-16 px-5 gap-3 text-center rounded-[2rem] border border-dashed ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50/50'}`}>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDark ? 'bg-white/5 text-zinc-600' : 'bg-white border border-zinc-100 text-zinc-300'}`}>
                <FileText size={30} weight="duotone" />
              </div>
              <div>
                <p className={`text-base font-bold mb-1 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  {contracts.length === 0 ? 'لا عقود مشارَكة معك بعد' : 'لا عقود مطابقة'}
                </p>
                <p className={`text-sm max-w-sm ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
                  {contracts.length === 0
                    ? 'تظهر هنا العقود التي يربطها محاميك بحسابك.'
                    : 'لم نعثر على عقود تطابق بحثك أو الفلتر المحدد.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {filtered.map((c) => (
                <ContractCard
                  key={c.id} c={c} today={today}
                  isSelected={selectedId === c.id}
                  onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                  isDark={isDark}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Right: detail panel ── */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          <AnimatePresence mode="wait">
            {!selectedId ? (
              <motion.div
                key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={`rounded-[2rem] border border-dashed p-10 text-center flex flex-col items-center justify-center h-[420px] ${
                  isDark ? 'border-white/10 bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50/50'
                }`}
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDark ? 'bg-white/5 text-zinc-600' : 'bg-white border text-zinc-300'}`}>
                  <FileText size={28} weight="duotone" />
                </div>
                <p className={`text-sm font-bold mb-1 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>اختر عقداً</p>
                <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>تظهر هنا تفاصيل العقد المحدد — النسخ، الالتزامات وجدول الدفعات</p>
              </motion.div>
            ) : detailLoading ? (
              <motion.div
                key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={`rounded-[2rem] border p-10 flex flex-col items-center justify-center gap-3 h-[420px] ${isDark ? 'bg-zinc-900/80 border-white/10' : 'bg-white border-zinc-200'}`}
              >
                <div className="w-9 h-9 border-4 border-[#C8A762]/30 border-t-[#C8A762] rounded-full animate-spin" />
                <p className={`text-xs font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>جارٍ تحميل العقد...</p>
              </motion.div>
            ) : detailError ? (
              <motion.div
                key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={`rounded-[2rem] border p-8 flex flex-col items-center justify-center gap-3 text-center h-[420px] ${
                  isDark ? 'bg-red-500/[0.06] border-red-500/20 text-red-300' : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <WarningCircle size={30} weight="fill" />
                <p className="text-sm font-bold">تعذّر الحفظ: {detailError}</p>
                <button
                  type="button"
                  onClick={() => setDetailReloadKey((k) => k + 1)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border ${isDark ? 'border-red-500/40 hover:bg-red-500/10' : 'border-red-300 hover:bg-red-100'}`}
                >
                  <ArrowClockwise size={13} weight="bold" />
                  إعادة المحاولة
                </button>
              </motion.div>
            ) : detail ? (
              <motion.div
                key={detail.id}
                initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.25, type: 'spring', stiffness: 100, damping: 20 }}
                className={`rounded-[2rem] border overflow-hidden shadow-lg ${isDark ? 'bg-zinc-900/80 border-white/10 backdrop-blur-xl' : 'bg-white border-zinc-200'}`}
              >
                {/* Header */}
                <div className={`p-6 border-b ${isDark ? 'border-white/10 bg-white/5' : 'border-zinc-100 bg-zinc-50/50'}`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <span className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 block ${isDark ? 'text-emerald-400' : 'text-[#0B3D2E]'}`}>
                        {CONTRACT_TYPE_AR[detail.contractType]}
                      </span>
                      <h3 className={`font-black text-lg leading-snug break-words ${isDark ? 'text-white' : 'text-zinc-900'}`}>{detail.title}</h3>
                      {detail.ownerName && (
                        <p className={`text-[12px] font-bold mt-1 flex items-center gap-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          <UserCircle size={14} /> المحامي: {detail.ownerName}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedId(null)}
                      className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isDark ? 'text-zinc-400 hover:text-white hover:bg-white/10' : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100'}`}
                    >
                      <X size={16} weight="bold" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-bold ${isDark ? STATUS_CHIP_CLS[detail.status].dark : STATUS_CHIP_CLS[detail.status].light}`}>
                      {CONTRACT_STATUS_AR[detail.status]}
                    </span>
                    {(() => {
                      const badge = expiryBadge(detail.endsOn, today, isDark);
                      return badge ? (
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-bold ${badge.cls}`}>
                          <CalendarBlank size={12} />{badge.label}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>

                {/* The one honest line where the old e-signature button was */}
                {detail.status === 'pending_signature' && (
                  <div className={`px-6 py-3 border-b flex items-start gap-2 ${isDark ? 'bg-amber-900/20 border-white/5 text-amber-300' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                    <SealWarning size={16} className="mt-0.5 flex-shrink-0" weight="fill" />
                    <p className="text-[11.5px] font-bold leading-relaxed">
                      التوقيع الإلكتروني غير متاح على المنصّة — التوقيع يتم مع محاميك خارجها.
                    </p>
                  </div>
                )}

                {/* Detail tabs */}
                <div className={`flex items-center gap-1 px-4 pt-3 border-b overflow-x-auto ${isDark ? 'border-white/5' : 'border-zinc-100'}`}>
                  {DETAIL_TABS.map((t) => {
                    const Icon = t.icon;
                    const active = detailTab === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => setDetailTab(t.key)}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-bold border-b-2 transition-colors ${
                          active
                            ? isDark ? 'border-[#C8A762] text-[#C8A762]' : 'border-[#0B3D2E] text-[#0B3D2E]'
                            : isDark ? 'border-transparent text-zinc-500 hover:text-zinc-300' : 'border-transparent text-zinc-400 hover:text-zinc-600'
                        }`}
                      >
                        <Icon size={13} />{t.label}
                      </button>
                    );
                  })}
                </div>

                {/* Tab content */}
                <div className="p-6 h-[420px] overflow-y-auto custom-scrollbar">
                  {detailTab === 'overview' && (
                    <div className="space-y-4">
                      <div className={`grid grid-cols-2 gap-3 text-[12.5px] font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {detail.valueSar !== null && (
                          <div className={`col-span-2 flex items-center justify-between py-2.5 border-b ${isDark ? 'border-white/5' : 'border-zinc-100'}`}>
                            <span>قيمة العقد</span>
                            <span className={`font-mono font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>{sarAr(detail.valueSar)}</span>
                          </div>
                        )}
                        {detail.counterpartyName && (
                          <div className="col-span-2 flex items-center justify-between py-2">
                            <span>الطرف الآخر</span>
                            <span className={isDark ? 'text-white' : 'text-zinc-900'}>{detail.counterpartyName}</span>
                          </div>
                        )}
                        {dateAr(detail.startsOn) && (
                          <div className="col-span-2 flex items-center justify-between py-2">
                            <span className="flex items-center gap-1.5"><CalendarBlank size={13} /> تاريخ البداية</span>
                            <span className={isDark ? 'text-white' : 'text-zinc-900'}>{dateAr(detail.startsOn)}</span>
                          </div>
                        )}
                        {dateAr(detail.endsOn) && (
                          <div className="col-span-2 flex items-center justify-between py-2">
                            <span className="flex items-center gap-1.5"><CalendarBlank size={13} /> تاريخ النهاية</span>
                            <span className={detail.status === 'expired' ? 'text-red-500 font-bold' : isDark ? 'text-white' : 'text-zinc-900'}>{dateAr(detail.endsOn)}</span>
                          </div>
                        )}
                        {dateAr(detail.signedOn) && (
                          <div className="col-span-2 flex items-center justify-between py-2">
                            <span className="flex items-center gap-1.5"><CalendarBlank size={13} /> تاريخ التوقيع</span>
                            <span className={isDark ? 'text-white' : 'text-zinc-900'}>{dateAr(detail.signedOn)}</span>
                          </div>
                        )}
                      </div>
                      {detail.notes.trim() && (
                        <div className={`p-4 rounded-xl border text-[12.5px] leading-relaxed whitespace-pre-wrap ${isDark ? 'bg-white/[0.02] border-white/5 text-zinc-300' : 'bg-zinc-50 border-zinc-100 text-zinc-700'}`}>
                          {detail.notes}
                        </div>
                      )}
                      {detail.valueSar === null && !detail.counterpartyName && !dateAr(detail.startsOn) && !dateAr(detail.endsOn) && !dateAr(detail.signedOn) && !detail.notes.trim() && (
                        <p className={`text-[12.5px] text-center py-8 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>لا تفاصيل إضافية مسجَّلة على هذا العقد.</p>
                      )}
                    </div>
                  )}

                  {detailTab === 'versions' && (
                    detail.versions.length === 0 ? (
                      <p className={`text-[12.5px] text-center py-8 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>لا نسخ مرفوعة لهذا العقد بعد.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {detail.versions.map((v) => (
                          <div key={v.id} className={`p-3.5 rounded-xl border flex items-center gap-3 ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-zinc-100 bg-zinc-50/50'}`}>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className={`text-[12.5px] font-bold truncate ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>{v.fileName}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${isDark ? 'bg-white/[0.06] text-zinc-400' : 'bg-slate-100 text-slate-500'}`}>
                                  {VERSION_LABEL_AR[v.label]} · نسخة {toArabicDigits(v.versionNo)}
                                </span>
                              </div>
                              <p className={`text-[11px] mt-1 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                                {[timestampDateAr(v.createdAt), v.uploadedByName].filter(Boolean).join(' · ')}
                              </p>
                              {versionError[v.id] && <p className="text-[10.5px] mt-1 text-red-500 font-bold">{versionError[v.id]}</p>}
                            </div>
                            <button
                              disabled={!!versionBusy[v.id]}
                              onClick={() => handleDownloadVersion(detail.id, v)}
                              className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition disabled:opacity-50 ${
                                isDark ? 'bg-[#C8A762]/10 text-[#C8A762] hover:bg-[#C8A762]/20' : 'bg-[#0B3D2E]/10 text-[#0B3D2E] hover:bg-[#0B3D2E]/20'
                              }`}
                            >
                              <DownloadSimple size={13} weight="bold" />
                              {versionBusy[v.id] ? 'جارٍ...' : 'تنزيل'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {detailTab === 'obligations' && (
                    detail.obligations.length === 0 ? (
                      <p className={`text-[12.5px] text-center py-8 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>لا التزامات مسجَّلة على هذا العقد.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {detail.obligations.map((o) => (
                          <div key={o.id} className={`p-3.5 rounded-xl border ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-zinc-100 bg-zinc-50/50'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={`text-[12.5px] font-bold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>{o.title}</p>
                                <p className={`text-[11px] mt-1 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                                  {OBLIGATION_KIND_AR[o.kind]}{dateAr(o.dueOn) ? ` · ${dateAr(o.dueOn)}` : ''}
                                </p>
                              </div>
                              <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                o.status === 'done'
                                  ? isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                                  : o.status === 'missed'
                                    ? isDark ? 'bg-rose-500/10 text-rose-400' : 'bg-rose-50 text-rose-600'
                                    : o.status === 'cancelled'
                                      ? isDark ? 'bg-white/[0.06] text-zinc-500' : 'bg-slate-100 text-slate-500'
                                      : isDark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-700'
                              }`}>
                                {OBLIGATION_STATUS_AR[o.status]}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {detailTab === 'payments' && (
                    detail.payments.length === 0 ? (
                      <p className={`text-[12.5px] text-center py-8 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>لا جدول دفعات مسجَّل لهذا العقد.</p>
                    ) : (
                      <div className="space-y-4">
                        {(() => {
                          const totals = paymentScheduleTotals(detail.payments);
                          return (
                            <div className={`grid grid-cols-2 gap-2 p-3.5 rounded-xl border text-[11px] font-bold ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-zinc-100 bg-zinc-50/50'}`}>
                              <div className="flex items-center justify-between"><span className={isDark ? 'text-zinc-500' : 'text-zinc-400'}>إجمالي الجدول</span><span className={isDark ? 'text-white' : 'text-zinc-900'}>{sarAr(totals.total)}</span></div>
                              <div className="flex items-center justify-between"><span className={isDark ? 'text-zinc-500' : 'text-zinc-400'}>المتبقي</span><span className={isDark ? 'text-white' : 'text-zinc-900'}>{sarAr(totals.outstanding)}</span></div>
                              <div className="flex items-center justify-between"><span className="text-emerald-600 dark:text-emerald-400">مسدَّد</span><span className={isDark ? 'text-white' : 'text-zinc-900'}>{sarAr(totals.paid)}</span></div>
                              <div className="flex items-center justify-between"><span className="text-red-500">متأخر</span><span className={isDark ? 'text-white' : 'text-zinc-900'}>{sarAr(totals.overdue)}</span></div>
                            </div>
                          );
                        })()}
                        <div className="overflow-x-auto -mx-1 px-1">
                          <table className="w-full text-[11.5px]">
                            <thead>
                              <tr className={`text-right ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                <th className="font-bold pb-2">الدفعة</th>
                                <th className="font-bold pb-2">المبلغ</th>
                                <th className="font-bold pb-2">الاستحقاق</th>
                                <th className="font-bold pb-2">الحالة</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.payments.map((p) => {
                                const overdue = isPaymentOverdue(p, today ?? undefined);
                                return (
                                  <tr key={p.id} className={`border-t ${isDark ? 'border-white/5' : 'border-zinc-100'}`}>
                                    <td className={`py-2.5 font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                                      {p.label}
                                      <span className={`block text-[10px] font-normal mt-0.5 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{PAYMENT_STAGE_AR[p.stage]}</span>
                                    </td>
                                    <td className={`py-2.5 font-mono font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{sarAr(p.amountSar)}</td>
                                    <td className={`py-2.5 ${overdue ? 'text-red-500 font-bold' : isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{dateAr(p.dueOn) ?? '—'}</td>
                                    <td className="py-2.5">
                                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                        overdue || p.status === 'overdue'
                                          ? isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'
                                          : p.status === 'paid'
                                            ? isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                                            : p.status === 'cancelled'
                                              ? isDark ? 'bg-white/[0.06] text-zinc-500' : 'bg-slate-100 text-slate-500'
                                              : isDark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-700'
                                      }`}>
                                        {overdue && p.status === 'pending' ? <ClockCountdown size={10} /> : p.status === 'paid' ? <CheckCircle size={10} weight="fill" /> : null}
                                        {PAYMENT_STATUS_AR[p.status]}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

      </div>

      {/* Footer note */}
      <p className={`text-[10.5px] leading-relaxed flex items-start gap-1.5 pt-6 max-w-[1300px] ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>
        <Info size={12} className="mt-0.5 shrink-0" />
        العقود هنا للمتابعة فقط — لا يوقَّعها العميل إلكترونياً على المنصّة، ولا تُعدَّل من هذه الصفحة.
      </p>
    </div>
  );
}
