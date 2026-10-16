"use client";

/**
 * «ملخص القضية» — the client's view of a case's litigation (owner decisions
 * ١٥ and ١٩): the current degree, the next hearing and the final ruling, plus
 * the client-visible hearings. Used by the individual's case file
 * (/dashboard/client/cases/[id]) and the company's (/dashboard/business/cases/[id]).
 *
 * The data comes from GET /api/v1/client/cases/[id]/summary, a fixed server
 * projection: the team's internal notes, hearing minutes, judge and circuit
 * never leave the server, so nothing here could show them by mistake.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Scales, CalendarCheck, Gavel, Lock, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { isSupabaseMode } from "@/lib/services/api";
import type { ClientCaseSummary, ClientHearing } from "@/lib/clientCaseSummary";

type Load =
  | { state: "loading" }
  | { state: "ok"; summary: ClientCaseSummary }
  | { state: "failed"; message: string }
  | { state: "demo" };

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** YYYY-MM-DD (a Riyadh wall-clock date) → «٢٠ أكتوبر ٢٠٢٦». No Date object, so no timezone shift. */
function dayAr(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const toAr = (n: number) => n.toLocaleString("ar-SA", { useGrouping: false });
  return `${toAr(Number(m[3]))} ${AR_MONTHS[Number(m[2]) - 1] ?? ""} ${toAr(Number(m[1]))}`;
}

function timeAr(time: string | null): string | null {
  if (!time) return null;
  const [h, min] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return time;
  const suffix = h < 12 ? "ص" : "م";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12.toLocaleString("ar-SA")}:${min.toLocaleString("ar-SA", { minimumIntegerDigits: 2 })} ${suffix}`;
}

function hearingLine(h: ClientHearing): string {
  return [dayAr(h.date), timeAr(h.time), h.place].filter(Boolean).join(" · ");
}

export function ClientCaseSummaryCard({ caseId }: { caseId: string }) {
  const { isDark } = useTheme();
  // Demo mode has no server to ask; decided once, not in the effect.
  const [load, setLoad] = useState<Load>(() => (isSupabaseMode ? { state: "loading" } : { state: "demo" }));

  useEffect(() => {
    if (!isSupabaseMode) return;
    let cancelled = false;
    fetch(`/api/v1/client/cases/${encodeURIComponent(caseId)}/summary`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body?.data) {
          const msg = typeof body?.error === "string" && /[؀-ۿ]/.test(body.error) ? body.error : "تعذّر قراءة ملخص القضية.";
          setLoad({ state: "failed", message: msg });
          return;
        }
        setLoad({ state: "ok", summary: body.data as ClientCaseSummary });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: "failed", message: "تعذّر قراءة ملخص القضية. تحقق من اتصالك." });
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const sm = isDark ? "text-zinc-500" : "text-slate-400";
  const strong = isDark ? "text-zinc-200" : "text-slate-700";
  const tile = `rounded-xl px-3 py-3 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`;

  if (load.state === "demo") return null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className={`${card} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Scales size={14} className="text-[#0B3D2E] dark:text-emerald-400" />
        <h2 className={`text-[13px] font-bold ${strong}`}>ملخص القضية</h2>
      </div>

      {load.state === "loading" && (
        <div className="py-6 text-center">
          <div className="inline-block w-6 h-6 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
        </div>
      )}

      {load.state === "failed" && (
        <p className="flex items-center gap-1.5 text-[12px] text-amber-600 dark:text-amber-400">
          <Warning size={13} /> {load.message}
        </p>
      )}

      {load.state === "ok" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className={tile}>
              <p className={`text-[10px] mb-1 ${sm}`}>المرحلة الحالية</p>
              {load.summary.currentStage ? (
                <>
                  <p className={`text-[13px] font-black ${strong}`}>{load.summary.currentStage.degree}</p>
                  {load.summary.currentStage.courtName && (
                    <p className={`text-[10px] mt-0.5 ${sm}`}>{load.summary.currentStage.courtName}</p>
                  )}
                </>
              ) : (
                <p className={`text-[11px] ${sm}`}>لم يسجّل محاميك درجة التقاضي بعد</p>
              )}
            </div>

            <div className={tile}>
              <p className={`text-[10px] mb-1 flex items-center gap-1 ${sm}`}>
                <CalendarCheck size={11} /> الجلسة القادمة
              </p>
              {load.summary.nextHearing ? (
                <>
                  <p className={`text-[12px] font-bold ${strong}`}>{dayAr(load.summary.nextHearing.date)}</p>
                  <p className={`text-[10px] mt-0.5 ${sm}`}>
                    {[timeAr(load.summary.nextHearing.time), load.summary.nextHearing.place].filter(Boolean).join(" · ") ||
                      load.summary.nextHearing.kindLabel}
                  </p>
                </>
              ) : (
                <p className={`text-[11px] ${sm}`}>لا توجد جلسة قادمة مسجّلة</p>
              )}
            </div>

            <div className={tile}>
              <p className={`text-[10px] mb-1 flex items-center gap-1 ${sm}`}>
                <Gavel size={11} /> الحكم النهائي
              </p>
              {load.summary.finalRuling ? (
                <>
                  <p className={`text-[12px] font-bold ${strong}`}>{load.summary.finalRuling.outcomeLabel ?? "صدر الحكم"}</p>
                  <p className={`text-[10px] mt-0.5 ${sm}`}>
                    {load.summary.finalRuling.degree}
                    {load.summary.finalRuling.closedOn ? ` · ${dayAr(load.summary.finalRuling.closedOn)}` : ""}
                  </p>
                </>
              ) : (
                <p className={`text-[11px] ${sm}`}>لم يصدر حكم نهائي بعد</p>
              )}
            </div>
          </div>

          {load.summary.stages.length > 1 && (
            <div className="mt-3">
              <p className={`text-[11px] font-bold mb-1.5 ${sm}`}>درجات التقاضي</p>
              <div className="flex flex-wrap gap-1.5">
                {load.summary.stages.map((s) => (
                  <span key={s.id} className={`text-[10px] px-2 py-1 rounded-lg ${isDark ? "bg-white/[0.04] text-zinc-300" : "bg-slate-100 text-slate-600"}`}>
                    {s.degree}{s.outcomeLabel ? ` — ${s.outcomeLabel}` : " — قيد النظر"}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3">
            <p className={`text-[11px] font-bold mb-1.5 ${sm}`}>الجلسات والمواعيد</p>
            {load.summary.hearings.length === 0 ? (
              <p className={`text-[11px] py-2 ${sm}`}>لا توجد جلسات مسجّلة لهذه القضية بعد</p>
            ) : (
              <div className="space-y-1.5">
                {load.summary.hearings.map((h) => (
                  <div key={h.id} className={`flex items-start justify-between gap-3 rounded-xl px-3 py-2 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
                    <div>
                      <p className={`text-[12px] font-bold ${strong}`}>{h.kindLabel}</p>
                      <p className={`text-[10px] mt-0.5 ${sm}`}>{hearingLine(h)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                      h.status === "cancelled" ? "bg-red-500/10 text-red-500"
                        : h.status === "held" ? "bg-emerald-500/10 text-emerald-500"
                          : h.status === "adjourned" ? "bg-zinc-500/10 text-zinc-500"
                            : "bg-amber-500/10 text-amber-500"
                    }`}>
                      {h.statusLabel}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className={`mt-3 flex items-center gap-1.5 text-[10px] ${sm}`}>
            <Lock size={10} />
            تظهر لك المرحلة والمواعيد ونتيجة الحكم فقط؛ ملاحظات فريق المحاماة الداخلية ومحاضر المداولة لا تُعرض هنا.
          </p>
        </>
      )}
    </motion.div>
  );
}
