"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Timer, CalendarBlank, Warning, CheckCircle, Plus, Trash, Info, BookmarkSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import { getDeadlineRules, getCourtHolidays, type DeadlineRule, type HolidayRule } from "@/lib/services/deadlinesService";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import {
  computeDueDate, resolveHolidayDates, daysUntil,
  type ComputeResult, type ResolvedHolidays,
} from "@/lib/services/deadlineEngine";
import { toArabicDigits } from "@/lib/services/arabicCount";

/**
 * حاسبة المواعيد الإجرائية — item 48.
 * ─────────────────────────────────────────────────────────
 * Was: hardcoded PRESETS array + a naive `date.setDate(date.getDate() + days)`
 * that knew nothing of weekends, official holidays, أو المادة ٢٢ (period
 * starts the day AFTER the event). Now: presets ARE public.deadline_rules
 * (getDeadlineRules), holidays ARE public.court_holidays (getCourtHolidays),
 * and every due date is computeDueDate() from deadlineEngine.ts — the SAME
 * function the server uses for /api/v1/lawyer/deadlines, so this page and
 * رادار المهل can never disagree on what a date means.
 *
 * This page still does not WRITE anything — it never did, and Phase 5 did
 * not change that. «احفظها في رادار المهل» only links to the real feature.
 */

interface DeadlineItem {
  id: number;
  label: string;
  triggerDate: string;
  periodDays: number;
  category: string;
  countFromNextDay: boolean;
  rollForwardIfHoliday: boolean;
  ruleId: string | null;
  ruleSourceAr: string | null;
  ruleVerified: boolean | null;
}

const CATEGORIES = ["نيابة", "ضابط", "قاضي", "مستشار"];

// Wide enough to cover any trigger date entered around today, plus a period
// of up to a year or two, without re-deriving the range per item.
function holidayYearRange(): [number, number] {
  const y = new Date().getFullYear();
  return [y - 1, y + 3];
}

function computeForItem(item: DeadlineItem, holidays: ResolvedHolidays): ComputeResult | null {
  if (!item.triggerDate) return null;
  return computeDueDate({
    triggerDate: item.triggerDate,
    periodDays: item.periodDays,
    countFromNextDay: item.countFromNextDay,
    rollForwardIfHoliday: item.rollForwardIfHoliday,
    holidays,
  });
}

function reasonAr(reason: "weekend" | "holiday", titleAr?: string): string {
  return reason === "weekend" ? "عطلة نهاية الأسبوع" : titleAr || "عطلة رسمية";
}

export default function DeadlineCalculatorPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [form, setForm] = useState<Omit<DeadlineItem, "id">>({
    label: "", triggerDate: "", periodDays: 30, category: "نيابة",
    countFromNextDay: true, rollForwardIfHoliday: true,
    ruleId: null, ruleSourceAr: null, ruleVerified: null,
  });

  const [rulesRead, setRulesRead] = useState<ListRead<DeadlineRule> | null>(null);
  const [holidaysRead, setHolidaysRead] = useState<ListRead<HolidayRule> | null>(null);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [holidaysLoading, setHolidaysLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    getDeadlineRules().then((read) => { if (!cancelled) { setRulesRead(read); setRulesLoading(false); } });
    getCourtHolidays().then((read) => { if (!cancelled) { setHolidaysRead(read); setHolidaysLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const rules = itemsOf(rulesRead);
  const rulesState = listViewState(rulesLoading, rulesRead);
  const holidaysState = listViewState(holidaysLoading, holidaysRead);

  // Holidays that failed to load resolve as "no holidays known" — an honest
  // degrade, not a silent one: `holidaysUnreadable` drives the banner below,
  // and every result explains it did not check them.
  const holidaysUnreadable = holidaysState === "unreadable";
  const holidayItems = itemsOf(holidaysRead);
  const resolvedHolidays = useMemo(() => {
    const [fromYear, toYear] = holidayYearRange();
    return resolveHolidayDates(holidayItems, fromYear, toYear);
  }, [holidayItems]);

  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 focus:border-indigo-500" : "bg-white border-gray-200 text-gray-800 focus:border-indigo-500"}`;

  const applyPreset = (rule: DeadlineRule) => {
    setForm((f) => ({
      ...f,
      label: rule.titleAr,
      periodDays: rule.periodDays,
      countFromNextDay: rule.countFromNextDay,
      rollForwardIfHoliday: rule.rollForwardIfHoliday,
      ruleId: rule.id,
      ruleSourceAr: rule.sourceAr,
      ruleVerified: rule.verifiedByOwner,
    }));
  };

  // Editing the period by hand detaches the entry from whichever rule was
  // selected — the number typed is no longer necessarily what that rule
  // says, so showing its source/verification badge next to it would be a
  // false attribution. It falls back to the same next-day + roll-forward
  // defaults a free-form entry uses.
  const editPeriodDays = (days: number) => {
    setForm((f) => ({
      ...f, periodDays: days, ruleId: null, ruleSourceAr: null, ruleVerified: null,
      countFromNextDay: true, rollForwardIfHoliday: true,
    }));
  };

  const add = () => {
    if (!form.label || !form.triggerDate) return;
    setDeadlines((prev) => [...prev, { ...form, id: Date.now() }]);
    setForm({
      label: "", triggerDate: "", periodDays: 30, category: form.category,
      countFromNextDay: true, rollForwardIfHoliday: true,
      ruleId: null, ruleSourceAr: null, ruleVerified: null,
    });
  };
  const remove = (id: number) => setDeadlines((prev) => prev.filter((d) => d.id !== id));

  const deadlinesText = [
    "تقرير المواعيد الإجرائية",
    "====================",
    ...deadlines.map((d) => {
      const result = computeForItem(d, resolvedHolidays);
      if (!result) return `- ${d.label} (${d.category})\n  تعذّر حساب هذا الموعد.`;
      const left = daysUntil(result.dueDate);
      const status = left === null ? "" : left < 0 ? `انتهى منذ ${toArabicDigits(Math.abs(left))} يوم` : `${toArabicDigits(left)} يوم متبقٍ`;
      const hijri = result.dueDateHijri ? ` (${result.dueDateHijri})` : "";
      const rolled = result.rolledFromHoliday
        ? `\n  تم تأجيله بسبب: ${result.rolledPast.map((r) => reasonAr(r.reason, r.titleAr)).join("، ")}`
        : "";
      const hijriWarn = !result.hijriResolved ? "\n  تنبيه: لم يمكن التحقق من العطل الهجرية." : "";
      return `- ${d.label} (${d.category})\n  تاريخ البداية: ${d.triggerDate}\n  المدة: ${d.periodDays} يوم\n  ينتهي: ${result.dueDate}${hijri}\n  الحالة: ${status}${rolled}${hijriWarn}`;
    }),
  ].join("\n");

  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}><Timer size={22} weight="duotone" className={isDark ? "text-amber-400" : "text-amber-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>حاسبة المواعيد الإجرائية</h1><p className={`text-xs ${muted}`}>يحسب المواعيد القانونية حسب المادة ٢٢ من نظام المرافعات — بحساب العطل ونهاية الأسبوع</p></div>
        </div>

        {holidaysUnreadable && (
          <div className={`rounded-xl border p-3 flex items-start gap-2 text-xs ${isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
            <Warning size={15} weight="fill" className="mt-0.5 shrink-0" />
            <span>تعذّرت قراءة العطل الرسمية — النتائج أدناه لا تأخذ العطل الرسمية بالحسبان (نهاية الأسبوع محسوبة).</span>
          </div>
        )}

        {/* Presets — public.deadline_rules */}
        <div className={`${card} p-4 shadow-sm`}>
          <p className={`text-xs font-bold mb-3 ${muted}`}>قوالب شائعة</p>
          {rulesState === "loading" && <p className={`text-xs ${muted}`}>جارٍ التحميل…</p>}
          {rulesState === "unreadable" && (
            <div className={`flex items-center gap-2 text-xs ${isDark ? "text-rose-400" : "text-rose-600"}`}>
              <Warning size={14} weight="fill" /> تعذّر تحميل القوالب — يمكنك إدخال الموعد يدوياً أدناه.
            </div>
          )}
          {rulesState === "empty" && <p className={`text-xs ${muted}`}>لا توجد قوالب متاحة حالياً.</p>}
          {rulesState === "ready" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {rules.map((r) => (
                <button
                  key={r.id}
                  onClick={() => applyPreset(r)}
                  className={`text-start text-xs px-3 py-2.5 rounded-xl border transition ${form.ruleId === r.id ? (isDark ? "border-amber-500/50 bg-amber-500/10" : "border-amber-300 bg-amber-50") : (isDark ? "border-[#2d3748] bg-white/2 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50")}`}
                >
                  <span className={`block font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{r.titleAr}</span>
                  <span className={`block mt-0.5 ${muted}`}>{r.sourceAr}</span>
                  {!r.verifiedByOwner && (
                    <span className={`inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-100 text-amber-700"}`}>
                      <Info size={10} weight="fill" /> قاعدة افتراضية — تحتاج مراجعتك
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add form */}
        <div className={`${card} p-5 shadow-sm`}>
          <h2 className={`text-sm font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>إضافة موعد إجرائي</h2>
          {form.ruleId && (
            <div className={`mb-3 text-xs px-3 py-2 rounded-lg ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-50 text-gray-600"}`}>
              مبني على قاعدة: {form.ruleSourceAr}
              {form.ruleVerified === false && <span className={`ms-2 font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>قاعدة افتراضية — تحتاج مراجعتك</span>}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>اسم الميعاد</label><input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="الطعن بالاستئناف..." className={inp} /></div>
            <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>تاريخ الواقعة (بداية الحساب)</label><input type="date" value={form.triggerDate} onChange={(e) => setForm({ ...form, triggerDate: e.target.value })} className={inp} /></div>
            <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>المدة (يوم)</label><input type="number" value={form.periodDays} onChange={(e) => editPeriodDays(parseInt(e.target.value) || 0)} className={inp} /></div>
            <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>الجهة</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inp}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <button onClick={add} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition">
            <Plus size={15} /> إضافة
          </button>
        </div>

        {/* Deadlines list */}
        {deadlines.length > 0 && (
          <BetaReviewGate toolId="gov.deadline-calculator" toolName="حساب المواعيد الإجرائية" reviewScope="legal-data">
          <div className="space-y-3">
            {deadlines.map((d) => {
              const result = computeForItem(d, resolvedHolidays);
              if (!result) {
                return (
                  <div key={d.id} className={`${card} p-4 shadow-sm flex items-center gap-3`}>
                    <Warning size={18} weight="fill" className="text-rose-500 shrink-0" />
                    <p className={`text-xs flex-1 ${muted}`}>{d.label}: تعذّر حساب هذا الموعد — تحقق من تاريخ الواقعة والمدة.</p>
                    <button onClick={() => remove(d.id)} className={`p-1.5 rounded-lg ${isDark ? "hover:bg-rose-500/10 text-gray-500 hover:text-rose-400" : "hover:bg-rose-50 text-gray-400 hover:text-rose-600"} transition`}><Trash size={13} /></button>
                  </div>
                );
              }
              const left = daysUntil(result.dueDate);
              const isUrgent = left !== null && left <= 7;
              const isExpired = left !== null && left < 0;
              return (
                <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={`${card} p-4 shadow-sm`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isExpired ? "bg-rose-500/10" : isUrgent ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                      {isExpired ? <Warning size={18} weight="fill" className="text-rose-500" /> : isUrgent ? <Warning size={18} weight="fill" className="text-amber-500" /> : <CheckCircle size={18} weight="fill" className="text-emerald-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${isDark ? "text-white" : "text-gray-900"}`}>{d.label}</p>
                      <p className={`text-xs ${muted}`}>
                        ينتهي: {result.dueDate}{result.dueDateHijri ? ` (${result.dueDateHijri})` : ""} ·{" "}
                        {left !== null && (
                          <span className={`font-bold ms-1 ${isExpired ? "text-rose-500" : isUrgent ? "text-amber-500" : "text-emerald-500"}`}>
                            {isExpired ? `انتهى منذ ${toArabicDigits(Math.abs(left))} يوم` : `${toArabicDigits(left)} يوم متبقٍ`}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-600"}`}>{d.category}</span>
                      <button onClick={() => remove(d.id)} className={`p-1.5 rounded-lg ${isDark ? "hover:bg-rose-500/10 text-gray-500 hover:text-rose-400" : "hover:bg-rose-50 text-gray-400 hover:text-rose-600"} transition`}><Trash size={13} /></button>
                    </div>
                  </div>
                  {(result.rolledFromHoliday || !result.hijriResolved || d.ruleVerified === false) && (
                    <div className={`mt-3 pt-3 border-t space-y-1 ${isDark ? "border-white/5" : "border-gray-100"}`}>
                      {result.rolledFromHoliday && (
                        <p className={`text-[11px] ${muted}`}>
                          تم تأجيله لأن الموعد الأصلي يقع في: {result.rolledPast.map((r) => reasonAr(r.reason, r.titleAr)).join("، ")}.
                        </p>
                      )}
                      {!result.hijriResolved && (
                        <p className={`text-[11px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>لم يمكن التحقق من العطل الهجرية.</p>
                      )}
                      {d.ruleVerified === false && (
                        <p className={`text-[11px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>قاعدة افتراضية — تحتاج مراجعتك ({d.ruleSourceAr}).</p>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2">
              <AiResultActions text={deadlinesText} filename="gov-deadlines-report" showShare />
              <Link
                href="/dashboard/lawyer/deadlines"
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
              >
                <BookmarkSimple size={14} weight="bold" /> احفظها في رادار المهل
              </Link>
            </div>
          </div>
          </BetaReviewGate>
        )}
        {deadlines.length === 0 && (
          <div className={`${card} p-10 text-center shadow-sm`}>
            <CalendarBlank size={36} className={`mx-auto mb-3 ${isDark ? "text-gray-700" : "text-gray-300"}`} />
            <p className={`text-sm ${muted}`}>أضف مواعيدك الإجرائية لتتابعها</p>
          </div>
        )}
      </div>
    </div>
  );
}
