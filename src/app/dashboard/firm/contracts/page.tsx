"use client";

/**
 * مدير العقود — لوحة المكتب.
 * ─────────────────────────────────────────────────────────
 * Same list as the lawyer dashboard's contracts page, on the same
 * `getContracts` read — RLS widens the result to every contract carrying the
 * caller's `firm_id` (see the lawyer/contracts route), so this is naturally
 * firm-wide once colleagues create contracts after joining. Each card adds
 * «المسؤول» (the contract's `ownerName`) so a partner can tell whose file it
 * is. Replaces the six hand-written sample rows nothing on the server ever
 * backed, and the dead «عقد جديد» button that opened no modal.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileText, MagnifyingGlass, Plus, Warning, ArrowClockwise, CircleNotch,
  CheckCircle, Pen, CalendarBlank, Info, Robot,
} from "@phosphor-icons/react";

import { useTheme } from "@/components/ThemeProvider";
import EmptyState from "@/components/ui/EmptyState";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import { toArabicDigits, countPhraseAr, type ArabicCountForms } from "@/lib/services/arabicCount";
import { getContracts, type Contract } from "@/lib/services/contractsService";
import {
  CONTRACT_STATUSES, CONTRACT_STATUS_AR, CONTRACT_TYPE_AR, type ContractStatus,
} from "@/lib/services/contractVocabulary";
import { contractExpiryState } from "@/lib/services/contractDates";
import { formatGregorianAr } from "@/app/dashboard/lawyer/_components/DeadlineCard";
import ContractFormModal from "@/app/dashboard/lawyer/_components/contracts/ContractFormModal";

function formatSarAr(amount: number): string {
  const grouped = amount.toLocaleString("en-US", { maximumFractionDigits: 2 }).replace(/,/g, "٬");
  return `${toArabicDigits(grouped)} ر.س`;
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
    default:
      return isDark ? "bg-white/[0.06] text-zinc-400 border-white/[0.08]" : "bg-slate-100 text-slate-500 border-slate-200";
  }
};

const OBLIGATIONS_FORMS: ArabicCountForms = {
  zero: null,
  one: "التزام واحد قائم",
  two: "التزامان قائمان",
  few: "التزامات قائمة",
  many: "التزام قائم",
};

const VERSIONS_FORMS: ArabicCountForms = {
  zero: "لا نسخ مرفوعة",
  one: "نسخة واحدة",
  two: "نسختان",
  few: "نسخ",
  many: "نسخة",
};

const STATUS_CHIPS: (ContractStatus | "all")[] = ["all", ...CONTRACT_STATUSES];

export default function FirmContractsPage() {
  const { isDark } = useTheme();
  const router = useRouter();

  const [read, setRead] = useState<ListRead<Contract> | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    getContracts({ status: "all", limit: 200 }).then(setRead).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContractStatus | "all">("all");
  const [showAdd, setShowAdd] = useState(false);

  const viewState = listViewState(loading, read);
  const items = itemsOf(read);
  const countersReady = viewState === "ready" || viewState === "empty";

  const activeCount = items.filter((c) => c.status === "active").length;
  const pendingSignatureCount = items.filter((c) => c.status === "pending_signature").length;
  const draftCount = items.filter((c) => c.status === "draft").length;
  const expiringSoonCount = items.filter((c) => contractExpiryState(c.endsOn) === "expiring_soon").length;

  const statusCounts = new Map<ContractStatus, number>();
  for (const s of CONTRACT_STATUSES) statusCounts.set(s, 0);
  for (const c of items) statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);

  const filteredSearch = search.trim();
  const filtered = items.filter((c) => {
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    const matchSearch = !filteredSearch || c.title.includes(filteredSearch) || (c.counterpartyName ?? "").includes(filteredSearch);
    return matchStatus && matchSearch;
  });

  // `truncationNoticeAr` was deliberately NOT used here: its wording («استخدم
  // البحث للوصول إلى الباقي») is only true when search reaches every row on
  // the server. This page's search is client-side over the 200 already
  // fetched (see the spec), so it cannot surface a 201st contract — a promise
  // this notice must not make. Same reasoning and wording as
  // `firm/cases/page.tsx`'s truncation banner.
  const truncated = !!(read && read.ok && read.truncated);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 pb-10" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
            <FileText size={20} weight="duotone" />
          </div>
          <h1 className={`text-[18px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>مدير العقود</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/ai/contracts"
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-medium transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            <Robot size={15} /> محترف العقود AI
          </Link>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[13px] font-bold text-[#C8A762] hover:bg-[#092e22] transition"
          >
            <Plus size={15} /> عقد جديد
          </button>
        </div>
      </div>

      <p className={`flex items-start gap-1.5 text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
        <Info size={13} className="mt-0.5 shrink-0" />
        مدير العقود يحفظ بيانات العقد ونسخ ملفاته وأطرافه والتزاماته ودفعاته، ويضع مواعيده في رادار المهل — ولا يرسل العقد للطرف الآخر ولا يوقّعه إلكترونياً.
      </p>

      {/* ── Counters ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`${card} p-4 flex items-center gap-3`}>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
            <CheckCircle size={16} />
          </div>
          <div>
            <p className={`text-[17px] font-bold leading-none ${isDark ? "text-white" : "text-zinc-900"}`}>{countersReady ? toArabicDigits(activeCount) : "—"}</p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>ساري</p>
          </div>
        </div>
        <div className={`${card} p-4 flex items-center gap-3`}>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"}`}>
            <Warning size={16} />
          </div>
          <div>
            <p className={`text-[17px] font-bold leading-none ${isDark ? "text-white" : "text-zinc-900"}`}>{countersReady ? toArabicDigits(pendingSignatureCount) : "—"}</p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>بانتظار التوقيع</p>
          </div>
        </div>
        <div className={`${card} p-4 flex items-center gap-3`}>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600"}`}>
            <Pen size={16} />
          </div>
          <div>
            <p className={`text-[17px] font-bold leading-none ${isDark ? "text-white" : "text-zinc-900"}`}>{countersReady ? toArabicDigits(draftCount) : "—"}</p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>مسودات</p>
          </div>
        </div>
        <div className={`${card} p-4 flex items-center gap-3`}>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"}`}>
            <CalendarBlank size={16} />
          </div>
          <div>
            <p className={`text-[17px] font-bold leading-none ${isDark ? "text-white" : "text-zinc-900"}`}>{countersReady ? toArabicDigits(expiringSoonCount) : "—"}</p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>تنتهي خلال ٣٠ يوماً</p>
          </div>
        </div>
      </div>

      {truncated && (
        <div className={`rounded-2xl border px-4 py-2.5 text-[12px] ${isDark ? "border-amber-500/15 bg-amber-500/5 text-amber-300" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
          تُعرض أحدث ٢٠٠ عقد فقط — قد تكون هناك عقود أقدم غير معروضة في هذه القائمة.
        </div>
      )}

      {/* ── Search ── */}
      <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white"}`}>
        <MagnifyingGlass size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بعنوان العقد أو الطرف الآخر..."
          className={`flex-1 bg-transparent text-[13px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`}
        />
      </div>

      {/* ── Filter chips ── */}
      {countersReady && (
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {STATUS_CHIPS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold transition-all ${
                statusFilter === s
                  ? isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-[#0B3D2E] text-white"
                  : isDark ? "bg-white/[0.05] text-zinc-400 hover:bg-white/[0.08]" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {s === "all" ? "الكل" : CONTRACT_STATUS_AR[s]}
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${statusFilter === s ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-200"}`}>
                {toArabicDigits(s === "all" ? items.length : statusCounts.get(s) ?? 0)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── List — four distinct states ── */}
      {viewState === "loading" ? (
        <div className={`${card} p-10 flex items-center justify-center gap-2 text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          <CircleNotch size={16} className="animate-spin" /> جارٍ تحميل العقود...
        </div>
      ) : viewState === "unreadable" ? (
        <div className={`${card} p-10 flex flex-col items-center justify-center text-center`}>
          <Warning size={28} className={`mb-3 ${isDark ? "text-red-400" : "text-red-500"}`} />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة العقود</p>
          <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>هذه ليست قائمة فارغة — قد توجد عقود لم تُقرأ.</p>
          <button onClick={load} className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-royal hover:underline">
            <ArrowClockwise size={13} /> إعادة المحاولة
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={items.length === 0 ? "لا عقود بعد — أنشئ الأول" : "لا توجد عقود مطابقة"}
          description={
            items.length === 0
              ? "أنشئ عقد المكتب الأول لتتابع نسخه وأطرافه والتزاماته ودفعاته من مكان واحد."
              : "لم يتم العثور على عقود تطابق شروط البحث أو الفلترة الحالية."
          }
          action={items.length === 0 ? { label: "عقد جديد", onClick: () => setShowAdd(true) } : undefined}
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((c, i) => {
            const expiry = contractExpiryState(c.endsOn);
            const obligationsLine = c.pendingObligations > 0 ? countPhraseAr(c.pendingObligations, OBLIGATIONS_FORMS) : null;
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Link
                  href={`/dashboard/firm/contracts/${c.id}`}
                  className={`group block ${card} p-4 hover:border-royal/30 transition-all`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className={`font-bold text-[13.5px] ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{c.title}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-300 border-white/[0.08]" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {CONTRACT_TYPE_AR[c.contractType]}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_CHIP_CLS(c.status, isDark)}`}>
                        {CONTRACT_STATUS_AR[c.status]}
                      </span>
                      {expiry === "expired" && c.status !== "expired" && (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${isDark ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-50 text-red-600 border-red-200"}`}>
                          منتهٍ
                        </span>
                      )}
                      {expiry === "expiring_soon" && (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                          ينتهي خلال ٣٠ يوماً
                        </span>
                      )}
                    </div>
                    <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-[11.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                      {c.counterpartyName && <span>{c.counterpartyName}</span>}
                      {c.valueSar !== null && <span className="font-bold text-[#C8A762]">{formatSarAr(c.valueSar)}</span>}
                      {c.endsOn && <span>حتى {formatGregorianAr(c.endsOn)}</span>}
                      <span>{countPhraseAr(c.versionsCount, VERSIONS_FORMS)}</span>
                      {c.ownerName && <span>المسؤول: {c.ownerName}</span>}
                    </div>
                    {obligationsLine && (
                      <p className={`mt-1.5 text-[11px] font-semibold ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                        {obligationsLine}
                        {c.nextDueOn ? ` — أقرب استحقاق ${formatGregorianAr(c.nextDueOn)}` : ""}
                      </p>
                    )}
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── New contract modal ── */}
      <AnimatePresence>
        {showAdd && (
          <ContractFormModal
            isDark={isDark}
            onClose={() => setShowAdd(false)}
            onSaved={(saved) => {
              setShowAdd(false);
              router.push(`/dashboard/firm/contracts/${saved.id}`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
