"use client";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChartLine, TrendUp, TrendDown, DownloadSimple, Warning, ArrowClockwise } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  listFailed,
  listFromApi,
  listViewState,
  itemsOf,
  type ApiListResponse,
  type ListRead,
} from "@/lib/services/listRead";
import { formatSarAr, monthGrowthPct, sumBuckets, type MonthlyBucket } from "@/lib/services/revenueMath";
import { countTileAr, toArabicDigits } from "@/lib/services/arabicCount";

interface RevenueApiResponse extends ApiListResponse<MonthlyBucket> {
  activePaidSubscriptions?: number;
  refundsTotal?: number;
  refundsCount?: number;
}

interface RevenueMeta {
  activePaidSubscriptions: number;
  refundsTotal: number;
  refundsCount: number;
}

/** Real rows only, downloaded as CSV — the reason the export button still exists. */
function downloadMonthsCsv(months: MonthlyBucket[]) {
  const header = "الشهر,الإجمالي (ر.س),عدد الحركات\n";
  const rows = months
    .map((m) => `${m.labelAr} ${m.year},${m.total.toFixed(2)},${m.count}`)
    .join("\n");
  const csv = "﻿" + header + rows; // BOM so Excel reads the Arabic header correctly
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `revenue-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminRevenuePage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [read, setRead] = useState<ListRead<MonthlyBucket> | null>(null);
  const [meta, setMeta] = useState<RevenueMeta | null>(null);
  // Starts `true`: the fetch effect fires on mount, and a `false` start would
  // paint «لا إيرادات مسجَّلة بعد» for one frame before the request is even sent.
  const [loading, setLoading] = useState(true);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/revenue");
      if (!res.ok) {
        setRead(listFailed<MonthlyBucket>());
        setMeta(null);
        return;
      }
      const json: RevenueApiResponse = await res.json();
      setRead(listFromApi<MonthlyBucket>(json));
      setMeta(
        json.degraded
          ? null
          : {
              activePaidSubscriptions: Number(json.activePaidSubscriptions ?? 0),
              refundsTotal: Number(json.refundsTotal ?? 0),
              refundsCount: Number(json.refundsCount ?? 0),
            },
      );
    } catch {
      setRead(listFailed<MonthlyBucket>());
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!mounted) return null;

  const state = listViewState(loading, read);
  const months = itemsOf(read);
  // The signal for "no revenue at all" — NOT `months.length === 0` (the route
  // always returns exactly six month buckets). A month can be a real row that
  // still exists with `count: 0`.
  const hasLedgerData = months.some((m) => m.count > 0);

  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  const lastMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];
  const growthPct = lastMonth && prevMonth ? monthGrowthPct(lastMonth, prevMonth) : null;
  const avgMonthly = months.length > 0 ? sumBuckets(months) / months.length : 0;
  const maxTotal = Math.max(1, ...months.map((m) => m.total));

  const canExport = state === "ready" && hasLedgerData;

  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}><ChartLine size={22} weight="duotone" className={isDark ? "text-emerald-400" : "text-emerald-600"} /></div>
            <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>تقارير الإيرادات</h1><p className={`text-xs ${muted}`}>أداء مالي الستة أشهر الماضية</p></div>
          </div>
          <button
            type="button"
            disabled={!canExport}
            onClick={() => canExport && downloadMonthsCsv(months)}
            title={canExport ? "تصدير الجدول الشهري الحقيقي" : "لا توجد بيانات لتصديرها بعد"}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${
              canExport
                ? isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                : "opacity-40 cursor-not-allowed " + (isDark ? "bg-white/5 text-gray-500" : "bg-gray-100 text-gray-400")
            }`}
          >
            <DownloadSimple size={14} /> تصدير
          </button>
        </div>

        {state === "loading" && (
          <div className={`${card} p-8 text-center text-[13px] ${muted}`}>جارٍ تحميل بيانات الإيرادات…</div>
        )}

        {state === "unreadable" && (
          <div className={`${card} p-8 text-center`}>
            <Warning size={20} weight="fill" className="mx-auto mb-2 text-amber-500" />
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تعذّرت قراءة بيانات الإيرادات</p>
            <p className={`text-[11px] mt-1 ${muted}`}>هذه ليست نتيجة فارغة — لم نتمكن من قراءة السجل المالي.</p>
            <button type="button" onClick={() => { void load(); }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#C8A762] px-4 py-2 text-[11px] font-bold text-black">
              <ArrowClockwise size={12} weight="bold" /> إعادة المحاولة
            </button>
          </div>
        )}

        {state === "ready" && !hasLedgerData && (
          <div className={`${card} p-8 text-center`}>
            <ChartLine size={20} weight="duotone" className={`mx-auto mb-2 ${muted}`} />
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>لا إيرادات مسجَّلة بعد</p>
            <p className={`text-[11px] mt-1 ${muted}`}>لا سندات قبض ولا مدفوعات مسجّلة خلال الستة أشهر الماضية.</p>
          </div>
        )}

        {state === "ready" && hasLedgerData && (
          <>
            {/* KPIs — every figure below comes from public.payments / public.receipts / public.subscriptions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-4 shadow-sm`}>
                <p className={`text-lg font-black mb-0.5 ${isDark ? "text-white" : "text-gray-900"}`}>{formatSarAr(lastMonth?.total ?? 0)}</p>
                {growthPct !== null ? (
                  <div className="flex items-center gap-1.5">
                    {growthPct >= 0 ? <TrendUp size={12} weight="fill" className="text-emerald-500" /> : <TrendDown size={12} weight="fill" className="text-rose-500" />}
                    <span className={`text-[10px] font-bold ${growthPct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{growthPct >= 0 ? "+" : "-"}{toArabicDigits(Math.abs(growthPct).toFixed(0))}٪</span>
                  </div>
                ) : (
                  <p className={`text-[10px] ${muted}`}>لا يوجد شهر سابق للمقارنة</p>
                )}
                <p className={`text-[10px] mt-1 ${muted}`}>إجمالي إيرادات {lastMonth?.labelAr}</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }} className={`${card} p-4 shadow-sm`}>
                <p className={`text-lg font-black mb-0.5 ${isDark ? "text-white" : "text-gray-900"}`}>{formatSarAr(avgMonthly)}</p>
                <p className={`text-[10px] ${muted}`}>خلال {toArabicDigits(months.length)} أشهر</p>
                <p className={`text-[10px] mt-1 ${muted}`}>متوسط الإيراد الشهري</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className={`${card} p-4 shadow-sm`}>
                <p className={`text-lg font-black mb-0.5 ${isDark ? "text-white" : "text-gray-900"}`}>{countTileAr(meta?.activePaidSubscriptions ?? 0)}</p>
                <p className={`text-[10px] ${muted}`}>باقة غير مجانية، نشطة الآن</p>
                <p className={`text-[10px] mt-1 ${muted}`}>الاشتراكات المدفوعة النشطة</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.21 }} className={`${card} p-4 shadow-sm`}>
                <p className={`text-lg font-black mb-0.5 ${isDark ? "text-white" : "text-gray-900"}`}>{formatSarAr(meta?.refundsTotal ?? 0)}</p>
                <p className={`text-[10px] ${muted}`}>{countTileAr(meta?.refundsCount ?? 0)} عملية خلال ٦ أشهر</p>
                <p className={`text-[10px] mt-1 ${muted}`}>المسترجعات</p>
              </motion.div>
            </div>

            {/* Bar chart — real monthly totals from payments (paid) + receipts */}
            <div className={`${card} p-5 shadow-sm`}>
              <h3 className={`text-sm font-bold mb-5 ${isDark ? "text-white" : "text-gray-900"}`}>الإيراد الشهري (ر.س)</h3>
              <div className="flex items-end gap-3 h-36">
                {months.map((m) => (
                  <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className={`text-[9px] font-bold ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                      {m.total >= 1000 ? `${toArabicDigits((m.total / 1000).toFixed(0))}k` : countTileAr(m.total)}
                    </span>
                    <motion.div initial={{ height: 0 }} animate={{ height: `${(m.total / maxTotal) * 100}%` }} transition={{ duration: 0.6 }}
                      className={`w-full rounded-t-lg min-h-[4px] ${m.count > 0 ? "bg-gradient-to-t from-emerald-600 to-emerald-400" : (isDark ? "bg-white/5" : "bg-gray-200")}`} />
                    <span className={`text-[9px] ${muted}`}>{m.labelAr}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
