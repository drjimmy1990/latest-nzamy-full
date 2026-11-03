"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarBlank, CheckCircle, Warning, Info, SealWarning } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { computeDueDate, resolveHolidayDates, parseIsoDate, type HolidayRule } from "@/lib/services/deadlineEngine";
import { getDeadlineRules, getCourtHolidays, type DeadlineRule } from "@/lib/services/deadlinesService";
import { itemsOf, type ListRead } from "@/lib/services/listRead";
import { LEGAL_DEADLINE_PRESETS, presetInputs } from "@/lib/services/legalDeadlinePresets";
import { useRiyadhToday } from "@/hooks/useRiyadhToday";
import { daysBetween } from "@/lib/riyadhDay";
import { toArabicDigits } from "@/lib/services/hijri";
import DualDatePicker from "@/components/ui/DualDatePicker";

/**
 * «المواعيد القانونية» — the legal calculator's deadlines tab, on the same
 * engine, rules and court holidays as the deadline radar (LIVE-F33). Every
 * result says which rule it used, whether the owner reviewed it, and what it
 * was rolled past. Guidance only — not a legal opinion.
 */

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
function formatAr(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${toArabicDigits(d.getDate())} ${AR_MONTHS[d.getMonth()]} ${toArabicDigits(d.getFullYear())}`;
}

export default function CalcLegalDeadlines() {
  const { isDark } = useTheme();
  const today = useRiyadhToday();
  const [presetId, setPresetId] = useState<string>("appeal");
  const [trigger, setTrigger] = useState<string>("");
  const [rulesRead, setRulesRead] = useState<ListRead<DeadlineRule> | null>(null);
  const [holidaysRead, setHolidaysRead] = useState<ListRead<HolidayRule> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDeadlineRules().then((r) => { if (!cancelled) setRulesRead(r); });
    getCourtHolidays().then((r) => { if (!cancelled) setHolidaysRead(r); });
    return () => { cancelled = true; };
  }, []);

  const preset = LEGAL_DEADLINE_PRESETS.find((p) => p.id === presetId) ?? LEGAL_DEADLINE_PRESETS[0];
  const rules = itemsOf(rulesRead);
  const holidaysUnreadable = !!holidaysRead && !holidaysRead.ok;

  const computed = useMemo(() => {
    if (!trigger) return null;
    const inputs = presetInputs(preset, trigger, rules);
    const year = parseIsoDate(trigger)?.getFullYear();
    if (!inputs || !year) return null;
    const span = Math.ceil(inputs.periodDays / 365) + 1;
    const result = computeDueDate({
      triggerDate: trigger,
      ...inputs,
      holidays: resolveHolidayDates(itemsOf(holidaysRead), year, year + span),
    });
    return result ? { inputs, result } : null;
  }, [preset, trigger, rules, holidaysRead]);

  const left = computed && today ? daysBetween(today, computed.result.dueDate) : null;
  const expired = left !== null && left < 0;

  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-slate-100"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-500";

  return (
    <div className="space-y-5">
      <div className={`${card} p-6 space-y-5`}>
        <fieldset>
          <legend className={`block text-xs font-bold mb-2 uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>نوع الموعد القانوني</legend>
          <div className="grid grid-cols-2 gap-2">
            {LEGAL_DEADLINE_PRESETS.map((d) => (
              <button key={d.id} type="button" aria-pressed={presetId === d.id} onClick={() => setPresetId(d.id)}
                className={`flex items-start gap-2 p-3 rounded-xl border text-start text-[12px] font-medium transition-all ${
                  presetId === d.id ? "bg-[#0B3D2E]/10 border-[#0B3D2E]/30 text-[#0B3D2E] dark:text-emerald-400 dark:border-emerald-700/40" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-[#0B3D2E]/20"
                }`}>
                <CalendarBlank size={14} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold">{d.label}</p>
                  <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    {d.years ? `${toArabicDigits(d.years)} ${d.years === 1 ? "سنة" : "سنوات"}` : `${toArabicDigits(d.days ?? 0)} يوماً`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label className={`block text-xs font-bold mb-2 uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>تاريخ الحدث ({preset.note})</label>
          <DualDatePicker label="تاريخ الحدث" value={trigger} onChange={setTrigger} clearable
            className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-700"}`} />
        </div>

        {holidaysUnreadable && (
          <p className={`flex items-start gap-1.5 text-[11.5px] ${isDark ? "text-amber-400" : "text-amber-700"}`} role="status">
            <Warning size={13} className="mt-0.5 shrink-0" /> تعذّرت قراءة العطل الرسمية — النتيجة تراعي الجمعة والسبت فقط.
          </p>
        )}

        {computed && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl border p-5 space-y-3 ${
              expired ? isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"
              : left !== null && left <= 7 ? isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"
              : isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"
            }`}>
            <div className="flex items-center gap-3">
              {expired ? <Warning size={20} weight="fill" className="text-red-500" /> : <CheckCircle size={20} weight="fill" className="text-emerald-500" />}
              <p className={`font-bold text-[13px] ${expired ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                {left === null ? "" : expired ? `انتهى الميعاد منذ ${toArabicDigits(-left)} يوماً` : left === 0 ? "آخر يوم اليوم" : `متبقٍّ ${toArabicDigits(left)} يوماً`}
              </p>
            </div>
            <div className={`flex items-center justify-between rounded-xl border p-3 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-white"}`}>
              <span className={`text-[12px] ${muted}`}>آخر موعد للتقديم</span>
              <span className="text-[14px] font-bold">
                {formatAr(computed.result.dueDate)}
                {computed.result.dueDateHijri ? <span className={`block text-[11px] font-normal ${muted}`}>{computed.result.dueDateHijri}</span> : null}
              </span>
            </div>
            <ul className={`space-y-1 text-[11.5px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
              <li>
                الحساب: {toArabicDigits(computed.inputs.periodDays)} يوماً
                {computed.inputs.countFromNextDay ? " تبدأ من اليوم التالي للحدث" : " يُحتسب يوم الحدث منها"}
                {computed.inputs.rollForwardIfHoliday ? "، ويُرحَّل آخرها إن صادف جمعة أو سبتاً أو عطلة رسمية (نظام المرافعات م. ٢٢)." : "."}
              </li>
              {computed.result.rolledFromHoliday && (
                <li className={isDark ? "text-amber-400" : "text-amber-700"}>
                  رُحِّل الموعد لأن {computed.result.rolledPast.map((r) => `${formatAr(r.date)} ${r.reason === "weekend" ? "عطلة نهاية الأسبوع" : r.titleAr || "عطلة رسمية"}`).join("، و")}.
                </li>
              )}
              {!computed.result.hijriResolved && <li className={isDark ? "text-amber-400" : "text-amber-700"}>لم يمكن التحقق من العطل الهجرية على هذا الجهاز.</li>}
            </ul>
            <div className="flex flex-wrap items-center gap-1.5">
              {computed.inputs.basis === "platform_rule" ? (
                <>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-600"}`}>
                    {computed.inputs.ruleTitleAr}{computed.inputs.sourceAr ? ` — ${computed.inputs.sourceAr}` : ""}
                  </span>
                  {!computed.inputs.verified && (
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"}`}>
                      <SealWarning size={10} /> قاعدة افتراضية — تحتاج مراجعتك
                    </span>
                  )}
                </>
              ) : (
                <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"}`}>
                  <Info size={10} /> مدة استرشادية — ليست قاعدة مراجَعة على المنصّة
                </span>
              )}
            </div>
            <p className={`text-[10.5px] ${muted}`}>
              نتيجة استرشادية لا تُغني عن مراجعة النظام. لحفظ الموعد وتذكيراته استخدم <Link href="/dashboard/lawyer/deadlines" className="font-bold underline">رادار المهل</Link>.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
