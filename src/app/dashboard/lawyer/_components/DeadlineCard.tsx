"use client";

import Link from "next/link";
import { Scales, SealWarning, Info } from "@phosphor-icons/react";

import { toArabicDigits } from "@/lib/services/arabicCount";
import type { Deadline, DeadlineStatus } from "@/lib/services/deadlinesService";

/**
 * DeadlineCard.tsx
 * ─────────────────────────────────────────────────────────
 * The single deadline row, shared between رادار المهل
 * (src/app/dashboard/lawyer/deadlines/page.tsx) and any case-file screen
 * that lists a case's own deadlines. formatGregorianAr and daysLeftChip are
 * exported alongside the component so both callers format dates and chips
 * identically without duplicating the logic.
 */

// ─── Arabic date formatting (Gregorian only — the Hijri half comes straight
// from the row's own `dueDateHijri`, never recomputed here, so a runtime
// without Umm al-Qura data cannot silently disagree with the server that
// already checked). ──────────────────────────────────────────────────────
export const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export function formatGregorianAr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const monthName = AR_MONTHS[month - 1];
  if (!monthName) return iso;
  return `${toArabicDigits(day)} ${monthName} ${toArabicDigits(year)}`;
}

// ─── Days-left chip ──────────────────────────────────────────────────────────
export function daysLeftChip(daysLeft: number | null, isDark: boolean): { label: string; cls: string } | null {
  if (daysLeft === null) return null;
  const red = isDark ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-50 text-red-600 border-red-200";
  const amber = isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-600 border-amber-200";
  const neutral = isDark ? "bg-white/[0.06] text-zinc-300 border-white/[0.08]" : "bg-slate-100 text-slate-600 border-slate-200";
  if (daysLeft < 0) return { label: `متأخرة ${toArabicDigits(Math.abs(daysLeft))} يوماً`, cls: red };
  if (daysLeft === 0) return { label: "اليوم", cls: red };
  if (daysLeft <= 3) return { label: `متبقٍّ ${toArabicDigits(daysLeft)} أيام`, cls: amber };
  return { label: `متبقٍّ ${toArabicDigits(daysLeft)} يوماً`, cls: neutral };
}

// ─── Status chip for non-open rows — ADDED alongside the days-left chip (not
// instead of it) so a case-file list mixing statuses (done, cancelled,
// missed) reads at a glance without losing how overdue a missed deadline
// was. Returns null for "open" so open rows render nothing extra: they keep
// only the days-left chip, exactly as رادار المهل rendered before this
// component existed. ───────────────────────────────────────────────────────
function statusChip(status: DeadlineStatus, isDark: boolean): { label: string; cls: string } | null {
  if (status === "done") {
    return {
      label: "تمّت",
      cls: isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }
  if (status === "cancelled") {
    return {
      label: "أُلغيت",
      cls: isDark ? "bg-white/[0.06] text-zinc-400 border-white/[0.08]" : "bg-slate-100 text-slate-500 border-slate-200",
    };
  }
  if (status === "missed") {
    return {
      label: "فاتت",
      cls: isDark ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-rose-50 text-rose-600 border-rose-200",
    };
  }
  return null;
}

export interface DeadlineCardProps {
  deadline: Deadline;
  isDark: boolean;
  busy?: boolean;
  error?: string | null;
  /** Hide the «القضية» link — e.g. inside a case file that already shows the case. Defaults to true. */
  showCaseLink?: boolean;
  onAction?: (next: "done" | "cancelled") => void;
}

export default function DeadlineCard({
  deadline, isDark, busy = false, error = null, showCaseLink = true, onAction,
}: DeadlineCardProps) {
  const status = statusChip(deadline.status, isDark);
  const days = daysLeftChip(deadline.daysLeft, isDark);
  const canAct = (deadline.status === "open" || deadline.status === "missed") && !!onAction;

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className={`${card} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={`font-bold text-[13px] ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{deadline.title}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
            <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              {formatGregorianAr(deadline.dueDate)}{deadline.dueDateHijri ? ` · ${deadline.dueDateHijri}` : ""}
            </span>
            {showCaseLink && deadline.caseRequestId && (
              <Link
                href={`/dashboard/lawyer/cases/${deadline.caseRequestId}`}
                className={`flex items-center gap-1 text-[11px] font-semibold hover:underline ${isDark ? "text-emerald-300" : "text-emerald-700"}`}
              >
                <Scales size={11} /> القضية
              </Link>
            )}
          </div>
          {deadline.rolledFromHoliday && (
            <p className={`mt-1.5 text-[10.5px] flex items-center gap-1 ${isDark ? "text-amber-400" : "text-amber-600"}`}>
              <Info size={11} /> رُحِّلت لأول يوم عمل بعد عطلة/عطلة نهاية الأسبوع
            </p>
          )}
          {deadline.ruleTitleAr && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-600"}`}>
                {deadline.ruleTitleAr}
              </span>
              {deadline.ruleVerified === false && (
                <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"}`}>
                  <SealWarning size={10} /> قاعدة افتراضية — تحتاج مراجعتك
                </span>
              )}
            </div>
          )}
          {error && (
            <p className={`mt-1.5 text-[10.5px] ${isDark ? "text-red-400" : "text-red-600"}`}>{error}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {status && (
            <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-bold ${status.cls}`}>{status.label}</span>
          )}
          {days && (
            <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-bold ${days.cls}`}>{days.label}</span>
          )}
          {canAct && (
            <div className="flex gap-1.5">
              <button
                disabled={busy}
                onClick={() => onAction?.("done")}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${isDark ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
              >
                تمّ
              </button>
              <button
                disabled={busy}
                onClick={() => onAction?.("cancelled")}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${isDark ? "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
              >
                إلغاء
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
