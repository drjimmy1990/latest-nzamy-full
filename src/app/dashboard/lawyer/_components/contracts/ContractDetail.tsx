"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  FileText, PencilSimple, Sparkle, Plus, Trash, DownloadSimple,
  CheckCircle, XCircle, Warning, ArrowClockwise, CircleNotch,
  Timer, CurrencyCircleDollar, Info, UploadSimple,
} from "@phosphor-icons/react";

import {
  getContract, deleteContractVersion, getContractVersionUrl,
  deleteContractParty, updateContractObligation, deleteContractObligation,
  deleteContractPayment,
  type Contract, type ContractDetail as ContractDetailDto,
  type ContractVersion, type ContractParty, type ContractObligation, type ContractPayment,
} from "@/lib/services/contractsService";
import {
  CONTRACT_TYPE_AR, CONTRACT_STATUS_AR, type ContractStatus,
  PARTY_ROLE_AR, PARTY_KIND_AR, ENTITY_TYPE_AR,
  OBLIGATION_KIND_AR, OBLIGATION_STATUS_AR,
  PAYMENT_STAGE_AR, PAYMENT_STATUS_AR, VERSION_LABEL_AR,
} from "@/lib/services/contractVocabulary";
import { contractExpiryState, paymentScheduleTotals, isPaymentOverdue } from "@/lib/services/contractDates";
import { isoDate } from "@/lib/services/deadlineEngine";
import { toArabicDigits } from "@/lib/services/arabicCount";
import { formatGregorianAr } from "../DeadlineCard";
import ContractFormModal from "./ContractFormModal";
import UploadVersionModal from "./UploadVersionModal";
import { PartyFormModal, ObligationFormModal, PaymentFormModal } from "./ContractChildForms";

/**
 * ContractDetail.tsx
 * ─────────────────────────────────────────────────────────
 * The contract file, shared by the lawyer and firm dashboards
 * (basePath picks which one). Self-loading — the page just supplies the id.
 * Every write re-reads the whole detail through getContract afterwards:
 * simplest, and always consistent with what four child tables plus the
 * contract row actually hold now (e.g. a new obligation may also flip
 * `pendingObligations` / `nextDueOn` on the contract itself).
 */

interface Props {
  contractId: string;
  isDark: boolean;
  basePath: "/dashboard/lawyer" | "/dashboard/firm";
}

type LoadState = "loading" | "ready" | "notfound" | "unreadable";
type TabKey = "overview" | "versions" | "parties" | "obligations" | "payments";

function formatSarAr(amount: number): string {
  const grouped = amount.toLocaleString("en-US", { maximumFractionDigits: 2 }).replace(/,/g, "٬");
  return `${toArabicDigits(grouped)} ر.س`;
}

function formatSizeAr(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${toArabicDigits(bytes)} بايت`;
  if (bytes < 1024 * 1024) return `${toArabicDigits((bytes / 1024).toFixed(1))} كيلوبايت`;
  return `${toArabicDigits((bytes / (1024 * 1024)).toFixed(1))} ميجابايت`;
}

const STATUS_CHIP_CLS = (status: ContractStatus, isDark: boolean): string => {
  switch (status) {
    case "active":
      return isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "draft":
      return isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-600 border-blue-200";
    case "under_review":
    case "pending_signature":
      return isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200";
    case "expired":
    case "terminated":
    case "cancelled":
      return isDark ? "bg-white/[0.06] text-zinc-400 border-white/[0.08]" : "bg-slate-100 text-slate-500 border-slate-200";
    default:
      return isDark ? "bg-white/[0.06] text-zinc-400 border-white/[0.08]" : "bg-slate-100 text-slate-500 border-slate-200";
  }
};

const OBLIGATION_STATUS_CHIP_CLS = (status: ContractObligation["status"], isDark: boolean): string => {
  switch (status) {
    case "done": return isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "missed": return isDark ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-rose-50 text-rose-600 border-rose-200";
    case "cancelled": return isDark ? "bg-white/[0.06] text-zinc-400 border-white/[0.08]" : "bg-slate-100 text-slate-500 border-slate-200";
    default: return isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200";
  }
};

const PAYMENT_STATUS_CHIP_CLS = (status: ContractPayment["status"], isDark: boolean): string => {
  switch (status) {
    case "paid": return isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "overdue": return isDark ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-50 text-red-600 border-red-200";
    case "cancelled": return isDark ? "bg-white/[0.06] text-zinc-400 border-white/[0.08]" : "bg-slate-100 text-slate-500 border-slate-200";
    default: return isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200";
  }
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "نظرة عامة" },
  { key: "versions", label: "النسخ" },
  { key: "parties", label: "الأطراف" },
  { key: "obligations", label: "الالتزامات" },
  { key: "payments", label: "الدفعات" },
];

export default function ContractDetail({ contractId, isDark, basePath }: Props) {
  const [detail, setDetail] = useState<ContractDetailDto | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  // A post-mutation re-read (`silent: true`) must not tear the screen down to
  // do it — the lawyer is mid-workflow (just saved a party, just marked an
  // obligation done) and a full-page spinner over the whole contract file is
  // its own regression, not a re-read. Only the first load and the retry
  // button flip the page to "loading"/"unreadable"; a silent refresh that
  // fails instead keeps the last good `detail` on screen and surfaces a
  // small banner, matching the reasoning already written into
  // contracts/page.tsx's own re-read effect.
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const load = useCallback((opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (silent) {
      setRefreshError(null);
    } else {
      setState("loading");
      setErrorMsg(null);
    }
    getContract(contractId)
      .then((d) => { setDetail(d); setState("ready"); setRefreshError(null); })
      .catch((err) => {
        console.error("[ContractDetail] load failed:", err);
        const msg = err instanceof Error && err.message ? err.message : "تعذّر تحميل العقد.";
        if (silent) {
          setRefreshError(
            msg === "العقد غير موجود" ? "تعذّر تحديث بيانات العقد — قد يكون حُذف." : `تعذّر تحديث بيانات العقد: ${msg}`,
          );
          return;
        }
        if (msg === "العقد غير موجود") { setState("notfound"); return; }
        setErrorMsg(msg);
        setState("unreadable");
      });
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  // ── Modals ─────────────────────────────────────────────────────────────
  const [showEdit, setShowEdit] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [partyModal, setPartyModal] = useState<{ mode: "add" } | { mode: "edit"; party: ContractParty } | null>(null);
  const [obligationModal, setObligationModal] = useState<{ mode: "add" } | { mode: "edit"; obligation: ContractObligation } | null>(null);
  const [paymentModal, setPaymentModal] = useState<{ mode: "add" } | { mode: "edit"; payment: ContractPayment } | null>(null);

  // ── Row-level busy/error (delete confirms, quick status flips) ──────────
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const setBusy = (id: string, v: boolean) => setRowBusy((b) => ({ ...b, [id]: v }));
  const setErr = (id: string, v: string | null) =>
    setRowError((e) => { const n = { ...e }; if (v) n[id] = v; else delete n[id]; return n; });

  async function handleDownloadVersion(v: ContractVersion) {
    setErr(v.id, null);
    const url = await getContractVersionUrl(contractId, v.id);
    if (!url) { setErr(v.id, "تعذّر إنشاء رابط التنزيل"); return; }
    window.open(url, "_blank");
  }

  async function handleDeleteVersion(v: ContractVersion) {
    if (!window.confirm(`حذف النسخة رقم ${toArabicDigits(v.versionNo)}؟`)) return;
    setBusy(v.id, true);
    setErr(v.id, null);
    try {
      await deleteContractVersion(contractId, v.id);
      load({ silent: true });
    } catch (err) {
      setErr(v.id, err instanceof Error && err.message ? `تعذّر الحذف: ${err.message}` : "تعذّر حذف النسخة.");
    } finally {
      setBusy(v.id, false);
    }
  }

  async function handleDeleteParty(p: ContractParty) {
    if (!window.confirm(`حذف الطرف «${p.name}»؟`)) return;
    setBusy(p.id, true);
    setErr(p.id, null);
    try {
      await deleteContractParty(contractId, p.id);
      load({ silent: true });
    } catch (err) {
      setErr(p.id, err instanceof Error && err.message ? `تعذّر الحذف: ${err.message}` : "تعذّر حذف الطرف.");
    } finally {
      setBusy(p.id, false);
    }
  }

  async function handleObligationStatus(o: ContractObligation, next: "done" | "cancelled") {
    setBusy(o.id, true);
    setErr(o.id, null);
    try {
      await updateContractObligation(contractId, o.id, { status: next });
      load({ silent: true });
    } catch (err) {
      setErr(o.id, err instanceof Error && err.message ? `تعذّر التحديث: ${err.message}` : "تعذّر تحديث الالتزام.");
    } finally {
      setBusy(o.id, false);
    }
  }

  async function handleDeleteObligation(o: ContractObligation) {
    if (!window.confirm(`حذف الالتزام «${o.title}»؟`)) return;
    setBusy(o.id, true);
    setErr(o.id, null);
    try {
      await deleteContractObligation(contractId, o.id);
      load({ silent: true });
    } catch (err) {
      setErr(o.id, err instanceof Error && err.message ? `تعذّر الحذف: ${err.message}` : "تعذّر حذف الالتزام.");
    } finally {
      setBusy(o.id, false);
    }
  }

  async function handleDeletePayment(p: ContractPayment) {
    if (!window.confirm(`حذف الدفعة «${p.label}»؟`)) return;
    setBusy(p.id, true);
    setErr(p.id, null);
    try {
      await deleteContractPayment(contractId, p.id);
      load({ silent: true });
    } catch (err) {
      setErr(p.id, err instanceof Error && err.message ? `تعذّر الحذف: ${err.message}` : "تعذّر حذف الدفعة.");
    } finally {
      setBusy(p.id, false);
    }
  }

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  // ── Loading / notfound / unreadable ──────────────────────────────────────
  if (state === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3" dir="rtl">
        <CircleNotch size={28} className={`animate-spin ${isDark ? "text-zinc-600" : "text-slate-300"}`} />
        <p className={isDark ? "text-zinc-500" : "text-slate-400"}>جارٍ تحميل العقد...</p>
      </div>
    );
  }
  if (state === "unreadable") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-center" dir="rtl">
        <Warning size={32} className={isDark ? "text-red-400" : "text-red-500"} />
        <p className={`font-bold text-[14px] ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{errorMsg}</p>
        <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>هذه ليست قائمة فارغة — قد توجد بيانات لم تُقرأ.</p>
        <button onClick={() => load()} className="flex items-center gap-1.5 text-[12px] font-bold text-royal hover:underline">
          <ArrowClockwise size={13} /> إعادة المحاولة
        </button>
      </div>
    );
  }
  if (state === "notfound" || !detail) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-center" dir="rtl">
        <FileText size={32} className={isDark ? "text-zinc-700" : "text-slate-300"} />
        <p className={`font-bold text-[14px] ${isDark ? "text-zinc-300" : "text-slate-700"}`}>العقد غير موجود</p>
      </div>
    );
  }

  const expiry = contractExpiryState(detail.endsOn);
  const totals = paymentScheduleTotals(detail.payments);

  return (
    <div className="max-w-[900px] mx-auto space-y-5 pb-10" dir="rtl">
      {refreshError && (
        <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-[12px] font-semibold ${isDark ? "border-red-500/20 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"}`}>
          <span>{refreshError}</span>
          <button onClick={() => load({ silent: true })} className="flex items-center gap-1 font-bold hover:underline shrink-0">
            <ArrowClockwise size={12} /> إعادة المحاولة
          </button>
        </div>
      )}
      {/* ── Header ── */}
      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={`text-[17px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{detail.title}</h1>
              <span className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-300 border-white/[0.08]" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                {CONTRACT_TYPE_AR[detail.contractType]}
              </span>
              <span className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold ${STATUS_CHIP_CLS(detail.status, isDark)}`}>
                {CONTRACT_STATUS_AR[detail.status]}
              </span>
              {expiry === "expired" && (
                <span className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold ${isDark ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-50 text-red-600 border-red-200"}`}>
                  منتهٍ
                </span>
              )}
              {expiry === "expiring_soon" && (
                <span className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold ${isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                  ينتهي خلال ٣٠ يوماً
                </span>
              )}
            </div>
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
              {detail.counterpartyName && <span>الطرف الآخر: {detail.counterpartyName}</span>}
              {detail.valueSar !== null && <span className="font-bold text-[#C8A762]">{formatSarAr(detail.valueSar)}</span>}
              {detail.startsOn && <span>من {formatGregorianAr(detail.startsOn)}</span>}
              {detail.endsOn && <span>إلى {formatGregorianAr(detail.endsOn)}</span>}
              {basePath === "/dashboard/firm" && detail.ownerName && <span>المسؤول: {detail.ownerName}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowEdit(true)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold transition ${isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              <PencilSimple size={13} /> تعديل
            </button>
            <Link
              href={`/ai/contracts?contract=${encodeURIComponent(contractId)}`}
              className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3 py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#092e22] transition"
            >
              <Sparkle size={13} /> افحص العقد بالذكاء الاصطناعي
            </Link>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => {
          const count =
            t.key === "versions" ? detail.versions.length
            : t.key === "parties" ? detail.parties.length
            : t.key === "obligations" ? detail.obligations.length
            : t.key === "payments" ? detail.payments.length
            : null;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold transition-all ${
                tab === t.key
                  ? isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-[#0B3D2E] text-white"
                  : isDark ? "bg-white/[0.05] text-zinc-400 hover:bg-white/[0.08]" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {t.label}
              {count !== null && (
                <span className={`rounded-full px-1.5 text-[10px] font-bold ${tab === t.key ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-200"}`}>
                  {toArabicDigits(count)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── نظرة عامة ── */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className={`${card} p-4`}>
            <h2 className={`text-[13px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>ملاحظات</h2>
            <p className={`text-[12.5px] leading-relaxed whitespace-pre-wrap ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
              {detail.notes || "لا توجد ملاحظات."}
            </p>
          </div>

          <div className={`${card} p-4`}>
            <h2 className={`text-[13px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>الأطراف</h2>
            {detail.parties.length === 0 ? (
              <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا يوجد أطراف مسجَّلة بعد.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {detail.parties.map((p) => (
                  <span key={p.id} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-slate-100 text-slate-600"}`}>
                    {PARTY_ROLE_AR[p.role]} — {p.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={`${card} p-4`}>
            <h2 className={`text-[13px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>الاستحقاق القادم</h2>
            <p className={`text-[12.5px] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
              {detail.nextDueOn ? formatGregorianAr(detail.nextDueOn) : "لا يوجد استحقاق قادم"}
            </p>
          </div>

          <div className={`${card} p-4`}>
            <h2 className={`text-[13px] font-bold mb-3 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>الدفعات — الإجمالي</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{formatSarAr(totals.total)}</p>
                <p className={`text-[10.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>الإجمالي</p>
              </div>
              <div>
                <p className={`text-[15px] font-bold text-emerald-500`}>{formatSarAr(totals.paid)}</p>
                <p className={`text-[10.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>مسدَّد</p>
              </div>
              <div>
                <p className={`text-[15px] font-bold text-amber-500`}>{formatSarAr(totals.outstanding)}</p>
                <p className={`text-[10.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>المتبقي</p>
              </div>
              <div>
                <p className={`text-[15px] font-bold text-red-500`}>{formatSarAr(totals.overdue)}</p>
                <p className={`text-[10.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>متأخر</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── النسخ ── */}
      {tab === "versions" && (
        <div className="space-y-2.5">
          <div className="flex justify-end">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3.5 py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#092e22] transition"
            >
              <UploadSimple size={13} /> رفع نسخة
            </button>
          </div>
          {detail.versions.length === 0 ? (
            <div className={`${card} p-8 text-center text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد نسخ مرفوعة بعد.</div>
          ) : (
            detail.versions.map((v) => (
              <div key={v.id} className={`${card} p-4`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className={`font-bold text-[12.5px] ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>الإصدار {toArabicDigits(v.versionNo)}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-600"}`}>
                        {VERSION_LABEL_AR[v.label]}
                      </span>
                      {detail.currentVersionId === v.id && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>الحالية</span>
                      )}
                    </div>
                    <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                      {v.fileName} · {formatSizeAr(v.sizeBytes)} · {v.uploadedByName ?? "—"} · {formatGregorianAr(v.createdAt.slice(0, 10))}
                    </p>
                    {rowError[v.id] && <p className={`text-[10.5px] mt-1 ${isDark ? "text-red-400" : "text-red-600"}`}>{rowError[v.id]}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleDownloadVersion(v)}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      <DownloadSimple size={12} /> تنزيل
                    </button>
                    <button
                      disabled={!!rowBusy[v.id]}
                      onClick={() => handleDeleteVersion(v)}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${isDark ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
                    >
                      <Trash size={12} /> حذف
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── الأطراف ── */}
      {tab === "parties" && (
        <div className="space-y-2.5">
          <div className="flex justify-end">
            <button
              onClick={() => setPartyModal({ mode: "add" })}
              className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3.5 py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#092e22] transition"
            >
              <Plus size={13} /> إضافة طرف
            </button>
          </div>
          {detail.parties.length === 0 ? (
            <div className={`${card} p-8 text-center text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا يوجد أطراف مسجَّلة بعد.</div>
          ) : (
            detail.parties.map((p) => (
              <div key={p.id} className={`${card} p-4`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className={`font-bold text-[12.5px] ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{p.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-600"}`}>{PARTY_ROLE_AR[p.role]}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-600"}`}>{PARTY_KIND_AR[p.partyKind]}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-600"}`}>{ENTITY_TYPE_AR[p.entityType]}</span>
                    </div>
                    <p className={`text-[11px] mt-1.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                      {[
                        p.commercialRegisterNo ? `س.ت ${toArabicDigits(p.commercialRegisterNo)}` : null,
                        p.contactPhone,
                        p.contactEmail,
                      ].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {rowError[p.id] && <p className={`text-[10.5px] mt-1 ${isDark ? "text-red-400" : "text-red-600"}`}>{rowError[p.id]}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setPartyModal({ mode: "edit", party: p })}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      <PencilSimple size={12} /> تعديل
                    </button>
                    <button
                      disabled={!!rowBusy[p.id]}
                      onClick={() => handleDeleteParty(p)}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${isDark ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
                    >
                      <Trash size={12} /> حذف
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── الالتزامات ── */}
      {tab === "obligations" && (
        <div className="space-y-2.5">
          <div className="flex justify-end">
            <button
              onClick={() => setObligationModal({ mode: "add" })}
              className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3.5 py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#092e22] transition"
            >
              <Plus size={13} /> إضافة التزام
            </button>
          </div>
          {detail.obligations.length === 0 ? (
            <div className={`${card} p-8 text-center text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد التزامات مسجَّلة بعد.</div>
          ) : (
            detail.obligations.map((o) => (
              <div key={o.id} className={`${card} p-4`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className={`font-bold text-[12.5px] ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{o.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-600"}`}>{OBLIGATION_KIND_AR[o.kind]}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${OBLIGATION_STATUS_CHIP_CLS(o.status, isDark)}`}>{OBLIGATION_STATUS_AR[o.status]}</span>
                      {o.deadlineId && (
                        basePath === "/dashboard/lawyer" ? (
                          <Link href={`${basePath}/deadlines`} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                            <Timer size={10} /> في الرادار
                          </Link>
                        ) : (
                          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                            <Timer size={10} /> في الرادار
                          </span>
                        )
                      )}
                    </div>
                    <p className={`text-[11px] mt-1.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{formatGregorianAr(o.dueOn)}</p>
                    {rowError[o.id] && <p className={`text-[10.5px] mt-1 ${isDark ? "text-red-400" : "text-red-600"}`}>{rowError[o.id]}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {(o.status === "pending" || o.status === "missed") && (
                      <>
                        <button
                          disabled={!!rowBusy[o.id]}
                          onClick={() => handleObligationStatus(o, "done")}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${isDark ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                        >
                          <CheckCircle size={12} /> تمّ
                        </button>
                        <button
                          disabled={!!rowBusy[o.id]}
                          onClick={() => handleObligationStatus(o, "cancelled")}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${isDark ? "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                        >
                          <XCircle size={12} /> إلغاء
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setObligationModal({ mode: "edit", obligation: o })}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      <PencilSimple size={12} /> تعديل
                    </button>
                    <button
                      disabled={!!rowBusy[o.id]}
                      onClick={() => handleDeleteObligation(o)}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${isDark ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
                    >
                      <Trash size={12} /> حذف
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── الدفعات ── */}
      {tab === "payments" && (
        <div className="space-y-2.5">
          <div className="flex justify-end">
            <button
              onClick={() => setPaymentModal({ mode: "add" })}
              className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-3.5 py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#092e22] transition"
            >
              <Plus size={13} /> إضافة دفعة
            </button>
          </div>
          {detail.payments.length === 0 ? (
            <div className={`${card} p-8 text-center text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد دفعات مسجَّلة بعد.</div>
          ) : (
            <>
              <div className="space-y-2.5">
                {detail.payments.map((p) => {
                  const overdue = isPaymentOverdue(p);
                  return (
                    <div key={p.id} className={`${card} p-4`}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className={`font-bold text-[12.5px] ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{p.label}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-600"}`}>{PAYMENT_STAGE_AR[p.stage]}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${PAYMENT_STATUS_CHIP_CLS(p.status, isDark)}`}>{PAYMENT_STATUS_AR[p.status]}</span>
                            {overdue && (
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${isDark ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-50 text-red-600 border-red-200"}`}>متأخرة</span>
                            )}
                          </div>
                          <p className={`text-[11px] mt-1.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                            {formatSarAr(p.amountSar)}{p.dueOn ? ` · ${formatGregorianAr(p.dueOn)}` : ""}
                          </p>
                          {rowError[p.id] && <p className={`text-[10.5px] mt-1 ${isDark ? "text-red-400" : "text-red-600"}`}>{rowError[p.id]}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          {p.status !== "paid" && p.status !== "cancelled" && (
                            <button
                              onClick={() => setPaymentModal({ mode: "edit", payment: { ...p, status: "paid", paidOn: isoDate(new Date()) } })}
                              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${isDark ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                            >
                              <CurrencyCircleDollar size={12} /> تسجيل السداد
                            </button>
                          )}
                          <button
                            onClick={() => setPaymentModal({ mode: "edit", payment: p })}
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                          >
                            <PencilSimple size={12} /> تعديل
                          </button>
                          <button
                            disabled={!!rowBusy[p.id]}
                            onClick={() => handleDeletePayment(p)}
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${isDark ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
                          >
                            <Trash size={12} /> حذف
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={`${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
                <span className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الإجمالي: {formatSarAr(totals.total)}</span>
                <span className="text-[12px] font-bold text-emerald-500">مسدَّد: {formatSarAr(totals.paid)}</span>
                <span className="text-[12px] font-bold text-amber-500">المتبقي: {formatSarAr(totals.outstanding)}</span>
                {totals.overdue > 0 && <span className="text-[12px] font-bold text-red-500">متأخر: {formatSarAr(totals.overdue)}</span>}
              </div>
            </>
          )}
        </div>
      )}

      <p className={`text-[10.5px] flex items-start gap-1.5 pt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
        <Info size={12} className="mt-0.5 shrink-0" />
        سجل عقد يدوي — التحميل والحذف والتحديث تكتب مباشرة على قاعدة بياناتك.
      </p>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showEdit && (
          <ContractFormModal
            isDark={isDark}
            initial={detail as Contract}
            onClose={() => setShowEdit(false)}
            onSaved={() => { setShowEdit(false); load({ silent: true }); }}
          />
        )}
        {showUpload && (
          <UploadVersionModal
            contractId={contractId}
            isDark={isDark}
            onClose={() => setShowUpload(false)}
            onUploaded={() => { setShowUpload(false); load({ silent: true }); }}
          />
        )}
        {partyModal && (
          <PartyFormModal
            contractId={contractId}
            isDark={isDark}
            initial={partyModal.mode === "edit" ? partyModal.party : undefined}
            parties={detail.parties}
            onClose={() => setPartyModal(null)}
            onSaved={() => { setPartyModal(null); load({ silent: true }); }}
          />
        )}
        {obligationModal && (
          <ObligationFormModal
            contractId={contractId}
            isDark={isDark}
            initial={obligationModal.mode === "edit" ? obligationModal.obligation : undefined}
            parties={detail.parties}
            onClose={() => setObligationModal(null)}
            onSaved={() => { setObligationModal(null); load({ silent: true }); }}
          />
        )}
        {paymentModal && (
          <PaymentFormModal
            contractId={contractId}
            isDark={isDark}
            initial={paymentModal.mode === "edit" ? paymentModal.payment : undefined}
            parties={detail.parties}
            onClose={() => setPaymentModal(null)}
            onSaved={() => { setPaymentModal(null); load({ silent: true }); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
