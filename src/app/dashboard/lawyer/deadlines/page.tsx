"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  Timer, Plus, ArrowClockwise, CircleNotch, Warning, CalendarBlank,
  ClockCountdown, SealCheck, SealWarning, Info,
} from "@phosphor-icons/react";

import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { toArabicDigits, countPhraseAr, type ArabicCountForms } from "@/lib/services/arabicCount";
import {
  listViewState, itemsOf, listOk, type ListRead,
} from "@/lib/services/listRead";
import {
  getDeadlines, getDeadlineRules, getCourtHolidays, updateDeadline, setRuleVerified,
  type Deadline, type DeadlineRule, type HolidayRule, type DeadlineStatus,
} from "@/lib/services/deadlinesService";
import AddDeadlineModal from "../_components/AddDeadlineModal";
import DeadlineCard, { formatGregorianAr, AR_MONTHS } from "../_components/DeadlineCard";

// ─── «العطل الرسمية» shape in words ────────────────────────────────────────────
function holidayShapeAr(h: HolidayRule): string {
  if (h.kind === "gregorian_fixed" && h.gregDay && h.gregMonth) {
    const monthName = AR_MONTHS[h.gregMonth - 1] ?? "";
    const span = h.lengthDays > 1 ? ` — لمدة ${toArabicDigits(h.lengthDays)} أيام` : "";
    return `كل عام، ${toArabicDigits(h.gregDay)} ${monthName}${span}`;
  }
  if (h.kind === "hijri_recurring" && h.hijriDay && h.hijriMonth) {
    const span = h.lengthDays > 1 ? ` — لمدة ${toArabicDigits(h.lengthDays)} أيام` : "";
    return `هجري متكرر، يبدأ ${toArabicDigits(h.hijriDay)}/${toArabicDigits(h.hijriMonth)} هـ${span}`;
  }
  if (h.kind === "date_range" && h.startDate && h.endDate) {
    return `من ${formatGregorianAr(h.startDate)} إلى ${formatGregorianAr(h.endDate)}`;
  }
  return "—";
}

const TABS: { key: DeadlineStatus | "all"; label: string }[] = [
  { key: "open", label: "مفتوحة" },
  { key: "done", label: "تمّت" },
  { key: "missed", label: "فائتة" },
  { key: "all", label: "الكل" },
];

const OPEN_COUNT_FORMS: ArabicCountForms = {
  zero: "لا مهل مفتوحة", one: "مهلة واحدة مفتوحة", two: "مهلتان مفتوحتان",
  few: "مهل مفتوحة", many: "مهلة مفتوحة",
};

export default function LawyerDeadlinesPage() {
  const { isDark } = useTheme();
  const user = useUser();

  const [tab, setTab] = useState<DeadlineStatus | "all">("open");
  const [showAdd, setShowAdd] = useState(false);

  // Header counters always read the OPEN list, independent of the active
  // tab — a lawyer looking at «تمّت» must still see how many are overdue.
  const [openRead, setOpenRead] = useState<ListRead<Deadline> | null>(null);
  const [openLoading, setOpenLoading] = useState(true);
  const loadOpen = useCallback(() => {
    setOpenLoading(true);
    getDeadlines({ status: "open" }).then(setOpenRead).finally(() => setOpenLoading(false));
  }, []);
  useEffect(() => { loadOpen(); }, [loadOpen]);

  // The list actually shown, scoped to the active tab.
  const [tabRead, setTabRead] = useState<ListRead<Deadline> | null>(null);
  const [tabLoading, setTabLoading] = useState(true);
  const loadTab = useCallback(() => {
    setTabLoading(true);
    getDeadlines({ status: tab }).then(setTabRead).finally(() => setTabLoading(false));
  }, [tab]);
  useEffect(() => { loadTab(); }, [loadTab]);

  const openState = listViewState(openLoading, openRead);
  const openItems = itemsOf(openRead);
  const countersReady = openState === "ready" || openState === "empty";
  const overdueCount = openItems.filter((d) => d.daysLeft !== null && d.daysLeft < 0).length;
  const dueSoonCount = openItems.filter((d) => d.daysLeft !== null && d.daysLeft >= 0 && d.daysLeft <= 7).length;
  const allOpenCount = openItems.length;

  const tabView = listViewState(tabLoading, tabRead);
  const rows = useMemo(
    () => itemsOf(tabRead).slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [tabRead],
  );

  // ── Row actions: «تمّ» / «إلغاء» — optimistic, rolled back on failure ──────
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  async function handleRowAction(deadline: Deadline, next: "done" | "cancelled") {
    setRowBusy((b) => ({ ...b, [deadline.id]: true }));
    setRowError((e) => { const n = { ...e }; delete n[deadline.id]; return n; });
    setTabRead((prev) => prev && prev.ok
      ? listOk(prev.items.map((d) => (d.id === deadline.id ? { ...d, status: next } : d)), prev.total)
      : prev);
    try {
      await updateDeadline(deadline.id, { status: next });
      loadOpen();
      loadTab();
    } catch (err) {
      setTabRead((prev) => prev && prev.ok
        ? listOk(prev.items.map((d) => (d.id === deadline.id ? deadline : d)), prev.total)
        : prev);
      setRowError((e) => ({
        ...e,
        [deadline.id]: err instanceof Error && err.message ? err.message : "تعذّر تحديث المهلة.",
      }));
    } finally {
      setRowBusy((b) => ({ ...b, [deadline.id]: false }));
    }
  }

  // ── قواعد المهل ──
  const [rulesRead, setRulesRead] = useState<ListRead<DeadlineRule> | null>(null);
  const [rulesLoading, setRulesLoading] = useState(true);
  const loadRules = useCallback(() => {
    setRulesLoading(true);
    getDeadlineRules().then(setRulesRead).finally(() => setRulesLoading(false));
  }, []);
  useEffect(() => { loadRules(); }, [loadRules]);
  const rulesView = listViewState(rulesLoading, rulesRead);
  const rules = itemsOf(rulesRead);

  const [ruleBusy, setRuleBusy] = useState<Record<string, boolean>>({});
  const [ruleError, setRuleError] = useState<Record<string, string>>({});
  async function toggleRuleVerified(rule: DeadlineRule) {
    setRuleBusy((b) => ({ ...b, [rule.id]: true }));
    setRuleError((e) => { const n = { ...e }; delete n[rule.id]; return n; });
    try {
      const updated = await setRuleVerified(rule.id, !rule.verifiedByOwner);
      setRulesRead((prev) => prev && prev.ok
        ? listOk(prev.items.map((r) => (r.id === updated.id ? updated : r)), prev.total)
        : prev);
    } catch (err) {
      setRuleError((e) => ({
        ...e,
        [rule.id]: err instanceof Error && err.message ? err.message : "تعذّر تحديث حالة الاعتماد.",
      }));
    } finally {
      setRuleBusy((b) => ({ ...b, [rule.id]: false }));
    }
  }

  // ── العطل الرسمية ──
  const [holidaysRead, setHolidaysRead] = useState<ListRead<HolidayRule> | null>(null);
  const [holidaysLoading, setHolidaysLoading] = useState(true);
  const loadHolidays = useCallback(() => {
    setHolidaysLoading(true);
    getCourtHolidays().then(setHolidaysRead).finally(() => setHolidaysLoading(false));
  }, []);
  useEffect(() => { loadHolidays(); }, [loadHolidays]);
  const holidaysView = listViewState(holidaysLoading, holidaysRead);
  const holidays = itemsOf(holidaysRead);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="max-w-[860px] mx-auto space-y-5 pb-10" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
            <Timer size={20} weight="duotone" />
          </div>
          <div>
            <h1 className={`text-[18px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>رادار المهل</h1>
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>مواعيد الطعن والنهائيات المحسوبة من تاريخ الحدث</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-[13px] font-bold text-[#C8A762] hover:bg-[#092e22] transition"
        >
          <Plus size={15} /> إضافة مهلة
        </button>
      </div>

      {/* ── Counters ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`${card} p-4 flex items-center gap-3`}>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"}`}>
            <Warning size={16} />
          </div>
          <div>
            <p className={`text-[17px] font-bold leading-none ${isDark ? "text-white" : "text-zinc-900"}`}>{countersReady ? toArabicDigits(overdueCount) : "—"}</p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>متأخرة</p>
          </div>
        </div>
        <div className={`${card} p-4 flex items-center gap-3`}>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"}`}>
            <ClockCountdown size={16} />
          </div>
          <div>
            <p className={`text-[17px] font-bold leading-none ${isDark ? "text-white" : "text-zinc-900"}`}>{countersReady ? toArabicDigits(dueSoonCount) : "—"}</p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>خلال ٧ أيام</p>
          </div>
        </div>
        <div className={`${card} p-4 flex items-center gap-3`}>
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
            <CalendarBlank size={16} />
          </div>
          <div>
            <p className={`text-[17px] font-bold leading-none ${isDark ? "text-white" : "text-zinc-900"}`}>{countersReady ? toArabicDigits(allOpenCount) : "—"}</p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              {countersReady ? (countPhraseAr(allOpenCount, OPEN_COUNT_FORMS) ?? "مفتوحة") : "مفتوحة"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-3.5 py-2 text-[12px] font-bold transition-all ${
              tab === t.key
                ? isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-[#0B3D2E] text-white"
                : isDark ? "bg-white/[0.05] text-zinc-400 hover:bg-white/[0.08]" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      {tabView === "loading" ? (
        <div className={`${card} p-10 flex items-center justify-center gap-2 text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          <CircleNotch size={16} className="animate-spin" /> جارٍ تحميل المهل...
        </div>
      ) : tabView === "unreadable" ? (
        <div className={`${card} p-10 flex flex-col items-center justify-center text-center`}>
          <Warning size={28} className={`mb-3 ${isDark ? "text-red-400" : "text-red-500"}`} />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة المهل</p>
          <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>هذه ليست قائمة فارغة — قد توجد مهل لم تُقرأ.</p>
          <button onClick={loadTab} className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-royal hover:underline">
            <ArrowClockwise size={13} /> إعادة المحاولة
          </button>
        </div>
      ) : tabView === "empty" ? (
        <div className={`${card} p-10 flex flex-col items-center justify-center text-center`}>
          <Timer size={32} className={`mb-3 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا مهل مسجَّلة</p>
          <p className={`text-[11px] mt-1 max-w-[320px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
            أضف الأولى، أو سجّل نتيجة درجة تقاضٍ في ملف القضية وستُحسب المهلة تلقائياً.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((d) => (
            <DeadlineCard
              key={d.id}
              deadline={d}
              isDark={isDark}
              busy={!!rowBusy[d.id]}
              error={rowError[d.id] ?? null}
              onAction={(next) => handleRowAction(d, next)}
            />
          ))}
        </div>
      )}

      {/* ── قواعد المهل ── */}
      <div className="pt-2">
        <h2 className={`text-[14px] font-bold mb-2.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>قواعد المهل</h2>
        {rulesView === "loading" ? (
          <div className={`${card} p-6 flex items-center justify-center gap-2 text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            <CircleNotch size={14} className="animate-spin" /> جارٍ تحميل القواعد...
          </div>
        ) : rulesView === "unreadable" ? (
          <div className={`${card} p-6 flex flex-col items-center text-center`}>
            <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة القواعد</p>
            <button onClick={loadRules} className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-royal hover:underline">
              <ArrowClockwise size={12} /> إعادة المحاولة
            </button>
          </div>
        ) : rulesView === "empty" ? (
          <div className={`${card} p-6 text-center text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد قواعد مهل مسجَّلة.</div>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className={`${card} p-3.5`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className={`font-bold text-[12.5px] ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{r.titleAr}</p>
                      {!r.verifiedByOwner && (
                        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"}`}>
                          <SealWarning size={10} /> قاعدة افتراضية — تحتاج مراجعتك
                        </span>
                      )}
                    </div>
                    <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{toArabicDigits(r.periodDays)} يوماً · {r.sourceAr}</p>
                    {ruleError[r.id] && <p className={`text-[10.5px] mt-1 ${isDark ? "text-red-400" : "text-red-600"}`}>{ruleError[r.id]}</p>}
                  </div>
                  {user.userType === "admin" && (
                    <button
                      disabled={!!ruleBusy[r.id]}
                      onClick={() => toggleRuleVerified(r)}
                      className={`shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${
                        r.verifiedByOwner
                          ? isDark ? "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          : isDark ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      <SealCheck size={12} /> {r.verifiedByOwner ? "إلغاء الاعتماد" : "اعتماد"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── العطل الرسمية ── */}
      <div>
        <h2 className={`text-[14px] font-bold mb-2.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>العطل الرسمية</h2>
        {holidaysView === "loading" ? (
          <div className={`${card} p-6 flex items-center justify-center gap-2 text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            <CircleNotch size={14} className="animate-spin" /> جارٍ تحميل العطل...
          </div>
        ) : holidaysView === "unreadable" ? (
          <div className={`${card} p-6 flex flex-col items-center text-center`}>
            <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة العطل</p>
            <button onClick={loadHolidays} className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-royal hover:underline">
              <ArrowClockwise size={12} /> إعادة المحاولة
            </button>
          </div>
        ) : holidaysView === "empty" ? (
          <div className={`${card} p-6 text-center text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد عطل مسجَّلة.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {holidays.map((h) => (
              <div key={h.id} className={`${card} p-3.5`}>
                <p className={`font-bold text-[12.5px] ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{h.titleAr}</p>
                <p className={`text-[11px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{holidayShapeAr(h)}</p>
                {h.approximate && (
                  <p className={`text-[10.5px] mt-1 flex items-center gap-1 ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                    <Info size={10} /> تقريبية — تُعلن سنوياً
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer note ── */}
      <p className={`text-[10.5px] leading-relaxed flex items-start gap-1.5 pt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
        <Info size={12} className="mt-0.5 shrink-0" />
        الحساب: من اليوم التالي للحدث، ويُرحَّل إن صادف آخر المدة جمعة أو سبتاً أو عطلة رسمية (نظام المرافعات م. ٢٢).
      </p>

      <AnimatePresence>
        {showAdd && (
          <AddDeadlineModal
            onClose={() => setShowAdd(false)}
            isDark={isDark}
            onCreated={() => {
              setShowAdd(false);
              loadOpen();
              loadTab();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
