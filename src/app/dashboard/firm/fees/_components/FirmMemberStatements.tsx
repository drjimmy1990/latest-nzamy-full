"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, Receipt, Spinner, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  FIRM_STATEMENT_STATUS_AR,
  FIRM_STATEMENTS_DEFAULT_LIMIT,
  type FirmStatementDto,
  type FirmStatementFilter,
} from "@/lib/finance/firmFeeStatements";

/**
 * «كشوف أتعاب أعضاء المكتب» — O23 (batch l11).
 *
 * GET /api/v1/firm/fee-statements: every fee statement a member of this firm
 * issued, for the firm owner, the managing partner and the finance manager.
 * Anyone else (403) or an account with no firm (404) sees nothing here — their
 * own statements stay on the page below. Read-only: sending, collecting and
 * voiding stay with the member who issued the statement.
 *
 * States: loading, failed (never shown as an empty list), not available yet
 * (the database update has not run), the table or its empty state. No sum is
 * printed: a page of rows is not the firm's total.
 */

type LoadState =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "error" }
  | { kind: "unavailable" }
  | { kind: "ready"; rows: FirmStatementDto[]; total: number | null; members: Array<{ userId: string; name: string }> };

const nf = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });

const FILTER_LABEL: Record<FirmStatementFilter, string> = {
  all: "الكل",
  open: "غير مدفوعة",
  paid: "مدفوعة",
  void: "ملغاة",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "—";
  }
}

export default function FirmMemberStatements() {
  const { isDark } = useTheme();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [filter, setFilter] = useState<FirmStatementFilter>("all");
  const [issuer, setIssuer] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (offset: number) => {
      const params = new URLSearchParams({
        limit: String(FIRM_STATEMENTS_DEFAULT_LIMIT),
        offset: String(offset),
        filter,
      });
      if (issuer) params.set("issuer", issuer);
      const res = await fetch(`/api/v1/firm/fee-statements?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 403 || res.status === 404 || res.status === 401) return { kind: "hidden" as const };
      if (!res.ok) return { kind: "error" as const };
      const body = (await res.json()) as {
        available?: boolean;
        statements?: FirmStatementDto[];
        total?: number | null;
        members?: Array<{ userId: string; name: string }>;
      };
      if (body.available === false) return { kind: "unavailable" as const };
      return {
        kind: "ready" as const,
        rows: Array.isArray(body.statements) ? body.statements : [],
        total: typeof body.total === "number" ? body.total : null,
        members: Array.isArray(body.members) ? body.members : [],
      };
    },
    [filter, issuer],
  );

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState(await fetchPage(0));
    } catch {
      setState({ kind: "error" });
    }
  }, [fetchPage]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (state.kind !== "ready" || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(state.rows.length);
      if (next.kind === "ready") {
        setState((cur) => {
          if (cur.kind !== "ready") return cur;
          const seen = new Set(cur.rows.map((r) => r.id));
          return { ...cur, rows: [...cur.rows, ...next.rows.filter((r) => !seen.has(r.id))], total: next.total };
        });
      }
    } catch {
      // the rows already on screen stay; the button stays for another try
    } finally {
      setLoadingMore(false);
    }
  };

  if (state.kind === "hidden") return null;

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const title = isDark ? "text-white" : "text-slate-800";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-300" : "text-slate-700";
  const rule = isDark ? "border-white/[0.06]" : "border-slate-100";
  const input = isDark
    ? "rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200"
    : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700";

  return (
    <section className={`${card} p-5 sm:p-6 mt-10`} dir="rtl" aria-labelledby="firm-statements-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C8A762]/15 text-[#C8A762]">
            <Receipt size={20} weight="duotone" />
          </span>
          <div className="min-w-0">
            <h2 id="firm-statements-title" className={`text-lg font-black ${title}`}>كشوف أتعاب أعضاء المكتب</h2>
            <p className={`mt-1 text-xs ${muted}`}>
              كل بيان أتعاب أصدره عضو في المكتب، للاطلاع فقط. الإرسال والتحصيل والإلغاء تبقى لمن أصدر البيان.
            </p>
          </div>
        </div>
        {state.kind === "ready" && (
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="العضو" value={issuer} onChange={(e) => setIssuer(e.target.value)} className={input}>
              <option value="">كل الأعضاء</option>
              {state.members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
            <select aria-label="الحالة" value={filter} onChange={(e) => setFilter(e.target.value as FirmStatementFilter)} className={input}>
              {(Object.keys(FILTER_LABEL) as FirmStatementFilter[]).map((f) => (
                <option key={f} value={f}>{FILTER_LABEL[f]}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {state.kind === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-10">
          <Spinner size={18} className="text-royal animate-spin" />
          <span className={`text-xs ${muted}`}>جارٍ تحميل كشوف الأتعاب...</span>
        </div>
      ) : state.kind === "error" ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Warning size={26} weight="duotone" className="text-red-500" />
          <p className={`text-sm font-bold ${strong}`}>تعذّرت قراءة كشوف أتعاب المكتب</p>
          <p className={`text-xs ${muted}`}>هذا لا يعني أنه لا توجد بيانات — أعد المحاولة.</p>
          <button type="button" onClick={() => void load()}
            className="mt-1 flex items-center gap-1.5 text-xs font-bold text-royal hover:underline">
            <ArrowClockwise size={13} /> إعادة المحاولة
          </button>
        </div>
      ) : state.kind === "unavailable" ? (
        <p className={`py-8 text-center text-sm ${muted}`}>هذا القسم غير متاح بعد — سيظهر بعد تحديث قاعدة البيانات.</p>
      ) : state.rows.length === 0 ? (
        <p className={`py-8 text-center text-sm ${muted}`}>لا توجد بيانات أتعاب مطابقة.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-right text-xs font-semibold ${muted}`}>
                <th scope="col" className={`px-3 py-2 border-b ${rule}`}>العضو</th>
                <th scope="col" className={`px-3 py-2 border-b ${rule}`}>العميل</th>
                <th scope="col" className={`px-3 py-2 border-b ${rule} hidden md:table-cell`}>البيان</th>
                <th scope="col" className={`px-3 py-2 border-b ${rule}`}>المبلغ</th>
                <th scope="col" className={`px-3 py-2 border-b ${rule} hidden sm:table-cell`}>المدفوع</th>
                <th scope="col" className={`px-3 py-2 border-b ${rule}`}>الحالة</th>
                <th scope="col" className={`px-3 py-2 border-b ${rule} hidden sm:table-cell`}>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.id} className={`border-b ${rule} last:border-b-0`}>
                  <td className={`px-3 py-3 font-bold ${title}`}>{r.issuerName}</td>
                  <td className={`px-3 py-3 ${strong}`}>{r.client}</td>
                  <td className={`px-3 py-3 hidden md:table-cell ${muted}`}>
                    {r.description}
                    {r.caseTitle && <span className="block text-[11px]">{r.caseTitle}</span>}
                    {r.voidReason && <span className="block text-[11px]">سبب الإلغاء: {r.voidReason}</span>}
                  </td>
                  <td className={`px-3 py-3 font-mono font-bold ${strong}`}>{nf.format(r.totalFee)} ﷼</td>
                  <td className={`px-3 py-3 font-mono hidden sm:table-cell ${muted}`}>
                    {r.status === "void" ? "—" : `${nf.format(r.paidAmount)} ﷼`}
                  </td>
                  <td className={`px-3 py-3 text-xs font-bold ${strong}`}>{FIRM_STATEMENT_STATUS_AR[r.status]}</td>
                  <td className={`px-3 py-3 text-xs hidden sm:table-cell ${muted}`}>{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className={`text-[11px] ${muted}`}>
              {state.total !== null
                ? `معروض ${nf.format(state.rows.length)} من ${nf.format(state.total)} بياناً.`
                : `معروض ${nf.format(state.rows.length)} بياناً.`}
            </p>
            {state.total !== null && state.rows.length < state.total && (
              <button type="button" onClick={() => void loadMore()} disabled={loadingMore}
                className="flex items-center gap-1.5 text-xs font-bold text-royal hover:underline disabled:opacity-50">
                {loadingMore ? <Spinner size={13} className="animate-spin" /> : <ArrowClockwise size={13} />} تحميل المزيد
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
