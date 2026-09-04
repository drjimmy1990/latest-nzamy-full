"use client";

/**
 * /dashboard/micro/contracts — «عقودي» for the SME (micro) account.
 * ─────────────────────────────────────────────────────────
 * Previously a fixed `CONTRACTS` array — four invented rows, identical for
 * every micro account that opened the page, none of them a contract this
 * account actually holds.
 *
 * Now reads the same source «عقودي» reads for an individual client
 * (src/app/dashboard/client/contracts/page.tsx): the Phase 3 contract
 * manager's client-side API, through `getClientContracts` /
 * `getClientContract` / `getClientContractVersionUrl`
 * (src/lib/services/contractsService.ts → GET /api/v1/client/contracts…).
 * That route's `assertRole()` carries no role allowlist — any authenticated
 * account may call it — and the query itself is narrowed with
 * `.eq("client_user_id", user.id)`, so a micro account only ever sees
 * contracts a lawyer explicitly shared with its own platform account. No
 * widening was needed for `micro` to reach it.
 *
 * A contract reaches this list only when a lawyer's contract row carries
 * this account's `client_user_id` — same rule as the client screen.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  FileText, Plus, MagnifyingGlass, DownloadSimple,
  CheckCircle, ListChecks, Receipt, Info,
  FilePdf, X, ArrowClockwise, WarningCircle, CalendarBlank,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import {
  getClientContracts, getClientContract, getClientContractVersionUrl,
  type Contract, type ContractDetail, type ContractVersion,
} from "@/lib/services/contractsService";
import {
  CONTRACT_STATUSES, CONTRACT_STATUS_AR, CONTRACT_TYPE_AR,
  VERSION_LABEL_AR, OBLIGATION_KIND_AR, OBLIGATION_STATUS_AR,
  PAYMENT_STAGE_AR, PAYMENT_STATUS_AR, type ContractStatus,
} from "@/lib/services/contractVocabulary";
import { contractExpiryState, paymentScheduleTotals, isPaymentOverdue } from "@/lib/services/contractDates";
import { formatGregorianAr } from "@/app/dashboard/lawyer/_components/DeadlineCard";
import { toArabicDigits } from "@/lib/services/arabicCount";

// ─── formatting ────────────────────────────────────────────────────────────────

function dateAr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return formatGregorianAr(iso);
}

function sarAr(amount: number): string {
  return `${toArabicDigits(amount.toLocaleString("en-US", { maximumFractionDigits: 2 }))} ر.س`;
}

const STATUS_STYLE: Record<ContractStatus, { bg: string; text: string; border: string }> = {
  draft:             { bg: "bg-zinc-100 dark:bg-zinc-800",          text: "text-zinc-500 dark:text-zinc-400",         border: "border-zinc-200 dark:border-zinc-700" },
  under_review:      { bg: "bg-blue-50 dark:bg-blue-900/20",        text: "text-blue-600 dark:text-blue-400",         border: "border-blue-200 dark:border-blue-700/30" },
  pending_signature: { bg: "bg-amber-50 dark:bg-amber-900/20",      text: "text-amber-600 dark:text-amber-400",       border: "border-amber-200 dark:border-amber-700/30" },
  active:            { bg: "bg-emerald-50 dark:bg-emerald-900/20",  text: "text-emerald-600 dark:text-emerald-400",   border: "border-emerald-200 dark:border-emerald-700/30" },
  expired:           { bg: "bg-red-50 dark:bg-red-900/20",          text: "text-red-500 dark:text-red-400",           border: "border-red-200 dark:border-red-700/30" },
  terminated:        { bg: "bg-zinc-100 dark:bg-zinc-800",          text: "text-zinc-500 dark:text-zinc-400",         border: "border-zinc-200 dark:border-zinc-700" },
  cancelled:         { bg: "bg-zinc-100 dark:bg-zinc-800",          text: "text-zinc-500 dark:text-zinc-400",         border: "border-zinc-200 dark:border-zinc-700" },
};

type FilterKey = ContractStatus | "all";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "الكل" },
  ...CONTRACT_STATUSES.map((s) => ({ key: s, label: CONTRACT_STATUS_AR[s] })),
];

type DetailTab = "overview" | "versions" | "obligations" | "payments";
const DETAIL_TABS: { key: DetailTab; label: string; icon: typeof FileText }[] = [
  { key: "overview", label: "نظرة عامة", icon: FileText },
  { key: "versions", label: "النسخ", icon: DownloadSimple },
  { key: "obligations", label: "الالتزامات", icon: ListChecks },
  { key: "payments", label: "جدول الدفعات", icon: Receipt },
];

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35 } }),
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MicroContractsPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");

  // Read once after mount — never during render/SSR — so a cached server
  // render can never bake in a stale expiry/overdue verdict.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => { setToday(new Date()); }, []);

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
      const matchFilter = filter === "all" || c.status === filter;
      const matchSearch = !q || c.title.includes(q) || (c.counterpartyName ?? "").includes(q) || (c.ownerName ?? "").includes(q);
      return matchFilter && matchSearch;
    });
  }, [contracts, filter, search]);

  useEffect(() => {
    if (selectedId && !filtered.find((c) => c.id === selectedId)) setSelectedId(null);
  }, [filtered, selectedId]);

  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailReloadKey, setDetailReloadKey] = useState(0);

  useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailError(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetailTab("overview");
    getClientContract(selectedId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(err instanceof Error && err.message ? err.message : "تعذّر تحميل العقد.");
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, detailReloadKey]);

  const [versionBusy, setVersionBusy] = useState<Record<string, boolean>>({});
  const [versionError, setVersionError] = useState<Record<string, string>>({});

  async function handleDownloadVersion(contractId: string, version: ContractVersion) {
    setVersionBusy((b) => ({ ...b, [version.id]: true }));
    setVersionError((e) => { const n = { ...e }; delete n[version.id]; return n; });
    const url = await getClientContractVersionUrl(contractId, version.id);
    setVersionBusy((b) => ({ ...b, [version.id]: false }));
    if (!url) {
      setVersionError((e) => ({ ...e, [version.id]: "تعذّر إنشاء رابط التنزيل" }));
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  const countOf = (s: ContractStatus) => contracts.filter((c) => c.status === s).length;
  const countsKnown = view === "ready" || view === "empty";

  return (
    <div className={`p-5 md:p-8 max-w-[900px] mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="flex items-center justify-between">
        <div>
          <h1 className={`text-[22px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>عقودي</h1>
          <p className={`text-[13px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            العقود التي يربطها محاميك بحسابك — نسخها، التزاماتها وجدول دفعاتها
          </p>
        </div>
        <Link href="/ai/corp/contracts">
          <motion.div
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 bg-[#0B3D2E] text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow-md cursor-pointer"
          >
            <Plus size={16} weight="bold" /> عقد جديد
          </motion.div>
        </Link>
      </motion.div>

      {/* Search + Filter */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1} className="space-y-3">
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-zinc-200"}`}>
          <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث بالعنوان أو الطرف الآخر أو المحامي..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-400"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                filter === f.key
                  ? "bg-[#0B3D2E] text-white"
                  : isDark ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "سارية",  status: "active" as const,             color: "text-emerald-500" },
            { label: "توقيع",  status: "pending_signature" as const,  color: "text-amber-500" },
            { label: "مسودات", status: "draft" as const,              color: isDark ? "text-zinc-400" : "text-zinc-500" },
            { label: "منتهية", status: "expired" as const,            color: "text-red-400" },
          ].map(s => (
            <div key={s.label} className={`${card} p-3 text-center`}>
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{countsKnown ? toArabicDigits(countOf(s.status)) : "—"}</p>
              <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Contract List */}
      {view === "loading" ? (
        <div className={`${card} p-10 flex items-center justify-center gap-2 text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          <div className="w-4 h-4 border-2 border-[#C8A762]/30 border-t-[#C8A762] rounded-full animate-spin" />
          جارٍ تحميل العقود...
        </div>
      ) : view === "unreadable" ? (
        <div className={`flex items-start gap-3 p-5 rounded-2xl border ${isDark ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-800"}`}>
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
                isDark ? "border-red-500/40 hover:bg-red-500/10" : "border-red-300 hover:bg-red-100"
              }`}
            >
              <ArrowClockwise size={13} weight="bold" />
              إعادة المحاولة
            </button>
          </div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${card} p-12 text-center`}>
              <FileText size={36} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
              <p className={`font-bold text-[15px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {contracts.length === 0 ? "لا عقود مشارَكة معك بعد" : "لا عقود مطابقة"}
              </p>
              <p className={`text-[13px] mt-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                {contracts.length === 0 ? "تظهر هنا العقود التي يربطها محاميك بحسابك." : "لم نعثر على عقود تطابق بحثك أو الفلتر المحدد."}
              </p>
            </motion.div>
          ) : (
            <motion.div key="list" className="space-y-3">
              {filtered.map((c, i) => {
                const ss = STATUS_STYLE[c.status];
                const badge = today ? contractExpiryState(c.endsOn, today) : null;
                return (
                  <motion.div
                    key={c.id}
                    variants={fadeUp} initial="hidden" animate="show" custom={i}
                    className={`${card} p-5 cursor-pointer hover:border-royal/30 transition-all`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-50 dark:bg-red-900/20">
                        <FilePdf size={20} weight="duotone" className="text-red-500" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${ss.bg} ${ss.text} ${ss.border}`}>
                            {CONTRACT_STATUS_AR[c.status]}
                          </span>
                          {badge === "expired" && (
                            <span className="text-[10px] font-bold text-red-500 flex items-center gap-0.5">
                              <CalendarBlank size={9} weight="fill" /> منتهٍ
                            </span>
                          )}
                          {badge === "expiring_soon" && (
                            <span className="text-[10px] font-bold text-amber-500 animate-pulse flex items-center gap-0.5">
                              <CalendarBlank size={9} weight="fill" /> ينتهي قريباً
                            </span>
                          )}
                        </div>
                        <p className={`text-[14px] font-bold leading-snug ${isDark ? "text-white" : "text-zinc-800"}`}>{c.title}</p>

                        <div className={`flex flex-wrap items-center gap-3 mt-2 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                          {dateAr(c.endsOn) && (
                            <span className="flex items-center gap-1">
                              <CheckCircle size={10} /> ينتهي: {dateAr(c.endsOn)}
                            </span>
                          )}
                          <span>{CONTRACT_TYPE_AR[c.contractType]}</span>
                          <span>{c.ownerName ? `المحامي: ${c.ownerName}` : "بدون محامٍ معيَّن"}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Contract Detail Modal */}
      <AnimatePresence>
        {selectedId && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setSelectedId(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white"}`}
            >
              <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-white/[0.07]" : "border-zinc-100"}`}>
                <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>تفاصيل العقد</h2>
                <button onClick={() => setSelectedId(null)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${isDark ? "hover:bg-white/[0.07] text-zinc-500" : "hover:bg-zinc-100 text-zinc-400"}`}>
                  <X size={15} />
                </button>
              </div>

              {detailLoading ? (
                <div className="p-10 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-4 border-[#C8A762]/30 border-t-[#C8A762] rounded-full animate-spin" />
                  <p className={`text-xs font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>جارٍ تحميل العقد...</p>
                </div>
              ) : detailError ? (
                <div className="p-8 flex flex-col items-center justify-center gap-3 text-center">
                  <WarningCircle size={28} weight="fill" className="text-red-500" />
                  <p className={`text-sm font-bold ${isDark ? "text-red-300" : "text-red-700"}`}>تعذّر التحميل: {detailError}</p>
                  <button
                    type="button"
                    onClick={() => setDetailReloadKey((k) => k + 1)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border ${isDark ? "border-red-500/40 hover:bg-red-500/10" : "border-red-300 hover:bg-red-100"}`}
                  >
                    <ArrowClockwise size={13} weight="bold" />
                    إعادة المحاولة
                  </button>
                </div>
              ) : detail ? (
                <>
                  <div className="p-6 pb-0 space-y-4">
                    <div>
                      <span className={`text-[10px] font-mono ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{CONTRACT_TYPE_AR[detail.contractType]}</span>
                      <h3 className={`text-[16px] font-bold mt-0.5 ${isDark ? "text-white" : "text-zinc-800"}`}>{detail.title}</h3>
                    </div>

                    {detail.status === "pending_signature" && (
                      <div className={`px-4 py-3 rounded-xl flex items-start gap-2 text-[11.5px] font-bold ${isDark ? "bg-amber-900/20 text-amber-300" : "bg-amber-50 text-amber-800"}`}>
                        <WarningCircle size={15} className="mt-0.5 flex-shrink-0" weight="fill" />
                        التوقيع الإلكتروني غير متاح على المنصّة — التوقيع يتم مع محاميك خارجها.
                      </div>
                    )}

                    <div className={`flex items-center gap-1 border-b overflow-x-auto ${isDark ? "border-white/5" : "border-zinc-100"}`}>
                      {DETAIL_TABS.map((t) => {
                        const Icon = t.icon;
                        const active = detailTab === t.key;
                        return (
                          <button
                            key={t.key}
                            onClick={() => setDetailTab(t.key)}
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-bold border-b-2 transition-colors ${
                              active
                                ? isDark ? "border-[#C8A762] text-[#C8A762]" : "border-[#0B3D2E] text-[#0B3D2E]"
                                : isDark ? "border-transparent text-zinc-500 hover:text-zinc-300" : "border-transparent text-zinc-400 hover:text-zinc-600"
                            }`}
                          >
                            <Icon size={13} />{t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-6 pt-4 max-h-[45vh] overflow-y-auto space-y-4">
                    {detailTab === "overview" && (
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "الحالة",         val: CONTRACT_STATUS_AR[detail.status] },
                          { label: "الطرف الآخر",     val: detail.counterpartyName ?? "—" },
                          { label: "المحامي المسؤول",  val: detail.ownerName ?? "—" },
                          { label: "قيمة العقد",      val: detail.valueSar !== null ? sarAr(detail.valueSar) : "—" },
                          { label: "تاريخ البداية",   val: dateAr(detail.startsOn) ?? "—" },
                          { label: "تاريخ الانتهاء",  val: dateAr(detail.endsOn) ?? "—" },
                        ].map(item => (
                          <div key={item.label} className={`p-3 rounded-xl ${isDark ? "bg-zinc-800" : "bg-zinc-50"}`}>
                            <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{item.label}</p>
                            <p className={`text-[13px] font-bold mt-0.5 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{item.val}</p>
                          </div>
                        ))}
                        {detail.notes.trim() && (
                          <div className={`col-span-2 p-3 rounded-xl border text-[12.5px] leading-relaxed whitespace-pre-wrap ${isDark ? "bg-white/[0.02] border-white/5 text-zinc-300" : "bg-zinc-50 border-zinc-100 text-zinc-700"}`}>
                            {detail.notes}
                          </div>
                        )}
                      </div>
                    )}

                    {detailTab === "versions" && (
                      detail.versions.length === 0 ? (
                        <p className={`text-[12.5px] text-center py-8 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>لا نسخ مرفوعة لهذا العقد بعد.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {detail.versions.map((v) => (
                            <div key={v.id} className={`p-3.5 rounded-xl border flex items-center gap-3 ${isDark ? "border-white/5 bg-white/[0.02]" : "border-zinc-100 bg-zinc-50/50"}`}>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className={`text-[12.5px] font-bold truncate ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{v.fileName}</p>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
                                    {VERSION_LABEL_AR[v.label]} · نسخة {toArabicDigits(v.versionNo)}
                                  </span>
                                </div>
                                {versionError[v.id] && <p className="text-[10.5px] mt-1 text-red-500 font-bold">{versionError[v.id]}</p>}
                              </div>
                              <button
                                disabled={!!versionBusy[v.id]}
                                onClick={() => handleDownloadVersion(detail.id, v)}
                                className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition disabled:opacity-50 ${
                                  isDark ? "bg-[#C8A762]/10 text-[#C8A762] hover:bg-[#C8A762]/20" : "bg-[#0B3D2E]/10 text-[#0B3D2E] hover:bg-[#0B3D2E]/20"
                                }`}
                              >
                                <DownloadSimple size={13} weight="bold" />
                                {versionBusy[v.id] ? "جارٍ..." : "تنزيل"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )
                    )}

                    {detailTab === "obligations" && (
                      detail.obligations.length === 0 ? (
                        <p className={`text-[12.5px] text-center py-8 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>لا التزامات مسجَّلة على هذا العقد.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {detail.obligations.map((o) => (
                            <div key={o.id} className={`p-3.5 rounded-xl border ${isDark ? "border-white/5 bg-white/[0.02]" : "border-zinc-100 bg-zinc-50/50"}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className={`text-[12.5px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{o.title}</p>
                                  <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                                    {OBLIGATION_KIND_AR[o.kind]}{dateAr(o.dueOn) ? ` · ${dateAr(o.dueOn)}` : ""}
                                  </p>
                                </div>
                                <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                  o.status === "done"
                                    ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                                    : o.status === "missed"
                                      ? isDark ? "bg-rose-500/10 text-rose-400" : "bg-rose-50 text-rose-600"
                                      : o.status === "cancelled"
                                        ? isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500"
                                        : isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"
                                }`}>
                                  {OBLIGATION_STATUS_AR[o.status]}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    )}

                    {detailTab === "payments" && (
                      detail.payments.length === 0 ? (
                        <p className={`text-[12.5px] text-center py-8 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>لا جدول دفعات مسجَّل لهذا العقد.</p>
                      ) : (
                        <div className="space-y-4">
                          {(() => {
                            const totals = paymentScheduleTotals(detail.payments);
                            return (
                              <div className={`grid grid-cols-2 gap-2 p-3.5 rounded-xl border text-[11px] font-bold ${isDark ? "border-white/5 bg-white/[0.02]" : "border-zinc-100 bg-zinc-50/50"}`}>
                                <div className="flex items-center justify-between"><span className={isDark ? "text-zinc-500" : "text-zinc-400"}>إجمالي الجدول</span><span className={isDark ? "text-white" : "text-zinc-900"}>{sarAr(totals.total)}</span></div>
                                <div className="flex items-center justify-between"><span className={isDark ? "text-zinc-500" : "text-zinc-400"}>المتبقي</span><span className={isDark ? "text-white" : "text-zinc-900"}>{sarAr(totals.outstanding)}</span></div>
                                <div className="flex items-center justify-between"><span className="text-emerald-600 dark:text-emerald-400">مسدَّد</span><span className={isDark ? "text-white" : "text-zinc-900"}>{sarAr(totals.paid)}</span></div>
                                <div className="flex items-center justify-between"><span className="text-red-500">متأخر</span><span className={isDark ? "text-white" : "text-zinc-900"}>{sarAr(totals.overdue)}</span></div>
                              </div>
                            );
                          })()}
                          <div className="space-y-2">
                            {detail.payments.map((p) => {
                              const overdue = isPaymentOverdue(p, today ?? undefined);
                              return (
                                <div key={p.id} className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${isDark ? "border-white/5 bg-white/[0.02]" : "border-zinc-100 bg-zinc-50/50"}`}>
                                  <div className="min-w-0">
                                    <p className={`text-[12px] font-bold truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{p.label}</p>
                                    <p className={`text-[10.5px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{PAYMENT_STAGE_AR[p.stage]}{dateAr(p.dueOn) ? ` · ${dateAr(p.dueOn)}` : ""}</p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`font-mono font-bold text-[12px] ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{sarAr(p.amountSar)}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                      overdue || p.status === "overdue"
                                        ? isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"
                                        : p.status === "paid"
                                          ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                                          : p.status === "cancelled"
                                            ? isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500"
                                            : isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"
                                    }`}>
                                      {PAYMENT_STATUS_AR[p.status]}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer note */}
      <p className={`text-[10.5px] leading-relaxed flex items-start gap-1.5 pt-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
        <Info size={12} className="mt-0.5 shrink-0" />
        العقود هنا للمتابعة فقط — لا تُوقَّع إلكترونياً على المنصّة، ولا تُعدَّل من هذه الصفحة.
      </p>
    </div>
  );
}
