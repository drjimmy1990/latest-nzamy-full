"use client";
import { useCallback, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Money, MagnifyingGlass, DownloadSimple, Warning, ArrowClockwise } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { listFailed, listFromApi, listOk, listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";

interface PaymentRow {
  id: string;
  user: string;
  plan: string;
  amount: string;
  date: string;
  method: string;
  status: string;
}

/* ── No mock ledger ──────────────────────────────────────────────────────────
 *
 * Six invented payments («أ. خالد الجهني — MAX — ٣٩٩ — ناجح») used to be shown
 * whenever the fetch failed or the ledger came back empty. On a money screen
 * that is not a placeholder, it is a fabricated financial record: an admin
 * reconciling a client's balance would have been reading names and amounts
 * that never existed, with nothing on the page marking them.
 *
 * The route keeps its HTTP 200 on a partial failure (it has rows worth handing
 * over and a 500 has nowhere to put them) and says so with `degraded: true`
 * plus `failedSources`. listFromApi() maps `degraded` to a FAILED read, which
 * is the right default here: two thirds of the money that moved, presented as
 * all of it, is the specific error an incomplete ledger causes. What this page
 * adds is naming which third is missing.
 */

/** DB table name → what an admin calls it. */
const SOURCE_AR: Record<string, string> = {
  payments: "الدفعات",
  wallet_transactions: "معاملات المحفظة",
  credit_transactions: "معاملات النقاط",
};

/** Arabic-Indic digits, to match the rest of the screen. */
function arNum(n: number): string {
  return n.toLocaleString("ar-SA");
}

// Ledger entry returned by GET /api/v1/admin/payments (unified across
// payments / wallet_transactions / credit_transactions).
interface LedgerEntry {
  id: string;
  source: "payment" | "wallet" | "credit";
  user_id?: string | null;
  amount: number;
  currency?: string | null;
  status?: string | null;
  description: string;
  created_at: string;
}

// Map a ledger source to the "plan" column badge (which is repurposed as a
// source/type badge for the real ledger).
const SOURCE_LABEL: Record<LedgerEntry["source"], string> = {
  payment: "دفعة",
  wallet: "محفظة",
  credit: "نقاط",
};

// Map a raw DB status/kind to the page's Arabic status vocabulary so the
// existing STATUS_COLOR map keeps working (unknown values pass through).
const STATUS_LABEL: Record<string, string> = {
  paid: "ناجح",
  purchase: "ناجح",
  credit: "ناجح",
  refunded: "مسترجع",
  refund: "مسترجع",
  reversal: "مسترجع",
  failed: "فشل",
  requires_payment: "قيد الدفع",
  not_required: "غير مطلوب",
  pending: "قيد الدفع",
  debit: "خصم",
  usage: "استخدام",
  expiry: "انتهاء",
};

// Method label derived from the ledger source.
const METHOD_LABEL: Record<LedgerEntry["source"], string> = {
  payment: "بوابة",
  wallet: "محفظة",
  credit: "نقاط",
};

function mapLedgerToRow(entry: LedgerEntry): PaymentRow {
  const rawStatus = entry.status ?? "";
  const status = STATUS_LABEL[rawStatus] ?? (rawStatus || "—");
  let date = "—";
  try {
    date = new Date(entry.created_at).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    date = entry.created_at;
  }
  const amount =
    entry.currency && entry.currency !== "SAR"
      ? `${entry.amount} ${entry.currency}`
      : String(entry.amount);
  return {
    id: entry.id,
    user: entry.description || entry.user_id || entry.id,
    plan: SOURCE_LABEL[entry.source],
    amount,
    date,
    method: METHOD_LABEL[entry.source],
    status,
  };
}

export default function AdminPaymentsPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [read, setRead] = useState<ListRead<PaymentRow> | null>(null);
  // Which of the three money tables did not answer. Read off the envelope
  // BEFORE listFromApi() collapses a degraded body to a bare failure — the
  // failure is the same either way, but «تعذّر تحميل معاملات المحفظة» tells an
  // admin which part of the ledger they are missing and a generic
  // «تعذّرت القراءة» does not.
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/payments");
      if (!res.ok) {
        setFailedSources([]);
        setRead(listFailed<PaymentRow>());
        return;
      }
      const json = (await res.json()) as {
        data?: LedgerEntry[];
        total?: number | null;
        degraded?: boolean;
        failedSources?: string[];
      };
      setFailedSources(Array.isArray(json.failedSources) ? json.failedSources : []);
      const base = listFromApi<LedgerEntry>(json);
      setRead(base.ok ? listOk(base.items.map(mapLedgerToRow), base.total) : listFailed<PaymentRow>());
    } catch {
      setFailedSources([]);
      setRead(listFailed<PaymentRow>());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const STATUS_COLOR: Record<string, string> = { "ناجح": "text-emerald-500 bg-emerald-500/10", "مسترجع": "text-amber-500 bg-amber-500/10", "فشل": "text-rose-500 bg-rose-500/10" };
  const state = listViewState(loading, read);
  const entries = itemsOf(read);
  const filtered = entries.filter(p => p.user.includes(search) || p.id.includes(search));

  // The count under the title. It was a bare `filtered.length`, which on a
  // failed read printed «٠ عملية» — a statement that no money moved.
  const countLabel =
    state === "loading" ? "جارٍ التحميل…"
      : state === "unreadable" ? "تعذّرت القراءة"
        : `${arNum(filtered.length)} عملية معروضة`;

  // truncationNoticeAr() is deliberately not used. Its sentence ends «استخدم
  // البحث للوصول إلى الباقي», and here that is doubly false: the search box
  // filters the rows already in memory, and the route accepts no offset or page
  // parameter at all, so there is no way from this screen to reach row 101.
  // `total` counts the whole ledger while `data` is capped at 100, so this
  // fires on essentially every real ledger — which is exactly why the sentence
  // has to state the cap honestly instead of sending an admin looking.
  const truncation =
    read && read.ok && read.truncated && read.total !== null
      ? `يُعرض أحدث ${arNum(read.items.length)} حركة من ${arNum(read.total)} — لا تتوفّر صفحات إضافية على هذه الشاشة.`
      : null;
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}><Money size={22} weight="duotone" className={isDark ? "text-emerald-400" : "text-emerald-600"} /></div>
            <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>سجل المدفوعات</h1><p className={`text-xs ${muted}`}>{countLabel}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "border-[#2d3748] bg-[#161b22]" : "border-gray-200 bg-white"}`}>
              <MagnifyingGlass size={13} className={muted} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className={`bg-transparent outline-none text-sm w-28 ${isDark ? "text-gray-200 placeholder:text-gray-600" : "text-gray-800 placeholder:text-gray-400"}`} />
            </div>
            <button className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              <DownloadSimple size={14} /> تصدير
            </button>
          </div>
        </div>
        {truncation && (
          <div className={`${card} px-4 py-3 text-xs flex items-center gap-2 ${isDark ? "text-amber-400" : "text-amber-700"}`}>
            <Warning size={14} weight="fill" className="shrink-0" /> {truncation}
          </div>
        )}

        {state === "unreadable" && (
          <div className={`${card} p-8 text-center shadow-sm`}>
            <Warning size={22} weight="fill" className="mx-auto mb-2 text-amber-500" />
            <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>تعذّرت قراءة سجل المدفوعات</p>
            <p className={`text-xs mt-1 ${muted}`}>
              {/* Naming the missing table is the whole reason `failedSources`
                  is on the envelope. «تعذّرت القراءة» alone leaves an admin
                  unable to tell a dead ledger from a missing third of one. */}
              {failedSources.length > 0
                ? `تعذّر تحميل: ${failedSources.map((s) => SOURCE_AR[s] ?? s).join("، ")}. لا يُعرض السجل ناقصاً — سجل مدفوعات ناقص يُقرأ كأنه كامل.`
                : "هذه ليست قائمة فارغة — لم نتمكن من القراءة، فلا يمكن الاستنتاج من هذه الشاشة أن أي مبلغ لم يتحرّك."}
            </p>
            <button type="button" onClick={() => { void load(); }}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition">
              <ArrowClockwise size={12} weight="bold" /> إعادة المحاولة
            </button>
          </div>
        )}

        {state !== "unreadable" && (
        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`grid grid-cols-12 text-xs font-bold px-5 py-3 border-b ${isDark ? "border-[#2d3748] text-gray-500 bg-[#0c0f12]" : "border-gray-100 text-gray-400 bg-gray-50"}`}>
            <span className="col-span-2">المرجع</span>
            <span className="col-span-3">المستخدم</span>
            <span className="col-span-2">الخطة</span>
            <span className="col-span-2">التاريخ</span>
            <span className="col-span-1">الطريقة</span>
            <span className="col-span-1 text-center">الحالة</span>
            <span className="col-span-1 text-end">المبلغ</span>
          </div>
          <div className={`divide-y ${isDark ? "divide-[#2d3748]" : "divide-gray-100"}`}>
            {filtered.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                className={`grid grid-cols-12 items-center px-5 py-4 transition ${isDark ? "hover:bg-white/2" : "hover:bg-gray-50"}`}>
                <span className={`col-span-2 text-[10px] font-mono font-bold ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>{p.id}</span>
                <span className={`col-span-3 text-xs font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{p.user}</span>
                <span className={`col-span-2 text-[10px] font-black px-2 py-0.5 rounded-full w-fit ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-700"}`}>{p.plan}</span>
                <span className={`col-span-2 text-xs ${muted}`}>{p.date}</span>
                <span className={`col-span-1 text-xs ${muted}`}>{p.method}</span>
                <div className="col-span-1 text-center">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[p.status]}`}>{p.status}</span>
                </div>
                <span className={`col-span-1 text-xs font-black text-end ${p.status === "مسترجع" ? "text-amber-500" : p.status === "فشل" ? "text-rose-500" : isDark ? "text-emerald-400" : "text-emerald-600"}`}>{p.amount}</span>
              </motion.div>
            ))}

            {state === "loading" && (
              <div className={`px-5 py-12 text-center text-sm ${muted}`}>جارٍ تحميل السجل…</div>
            )}
            {state === "empty" && (
              <div className={`px-5 py-12 text-center text-sm ${muted}`}>لا توجد حركات مالية مسجّلة.</div>
            )}
            {/* Rows exist, but none match the search box. Not the same fact as
                an empty ledger, and must not borrow its wording. */}
            {state === "ready" && filtered.length === 0 && (
              <div className={`px-5 py-12 text-center text-sm ${muted}`}>لا توجد حركات مطابقة لبحثك.</div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
