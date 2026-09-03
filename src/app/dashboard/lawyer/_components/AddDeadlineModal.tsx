"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, ArrowClockwise, CircleNotch } from "@phosphor-icons/react";
import { describeDateAr, toArabicDigits } from "@/lib/services/hijri";
import { CasePicker } from "@/components/ui/CasePicker";
import {
  createDeadline,
  getDeadlineRules,
  type Deadline,
  type DeadlineRule,
  type DeadlinePriority,
} from "@/lib/services/deadlinesService";

interface Props {
  onClose: () => void;
  isDark: boolean;
  /**
   * When opened from a case file, the case this deadline belongs to. Passed
   * straight through as `caseRequestId` — the case picker is hidden in that
   * mode since the case is already known, matching AddHearingModal's shape.
   */
  caseRequestId?: string;
  /**
   * Called once, when the lawyer dismisses the confirmation screen — NOT the
   * moment the row is actually written. The computation (due date, Hijri,
   * what it rolled past) has to stay on screen long enough to be read; the
   * parent list is refreshed only when the lawyer says «إغلاق».
   */
  onCreated: (deadline: Deadline) => void;
}

type Mode = "rule" | "manual";

const PRIORITY_OPTIONS: { value: DeadlinePriority; label: string }[] = [
  { value: "urgent", label: "عاجلة" },
  { value: "high", label: "عالية" },
  { value: "normal", label: "عادية" },
];

const OFFSET_OPTIONS = [7, 3, 1] as const;

export default function AddDeadlineModal({ onClose, isDark, caseRequestId, onCreated }: Props) {
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof createDeadline>> | null>(null);

  // ── قواعد المهل (rule mode) ──
  const [rules, setRules] = useState<DeadlineRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState(false);

  const loadRules = () => {
    setRulesLoading(true);
    setRulesError(false);
    getDeadlineRules()
      .then((read) => {
        if (!read.ok) { setRulesError(true); return; }
        setRules(read.items.filter((r) => r.active));
      })
      .catch(() => setRulesError(true))
      .finally(() => setRulesLoading(false));
  };
  useEffect(() => { loadRules(); }, []);

  // ── Controlled inputs ──
  const [mode, setMode] = useState<Mode>("rule");
  const [ruleId, setRuleId] = useState("");
  const [triggerDate, setTriggerDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [title, setTitle] = useState("");
  const [caseId, setCaseId] = useState(caseRequestId ?? "");
  const [priority, setPriority] = useState<DeadlinePriority>("high");
  const [offsets, setOffsets] = useState<Set<number>>(new Set(OFFSET_OPTIONS));

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;

  function selectRule(id: string) {
    setRuleId(id);
    const rule = rules.find((r) => r.id === id);
    if (rule) setTitle(rule.titleAr);
  }

  function toggleOffset(n: number) {
    setOffsets((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  }

  const modeBtn = (key: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(key)}
      className={`flex-1 rounded-xl border py-2 text-[12px] font-bold transition-all ${
        mode === key
          ? isDark
            ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]"
            : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5 text-[#0B3D2E]"
          : isDark
            ? "border-white/[0.08] bg-zinc-800 text-zinc-400"
            : "border-slate-200 bg-white text-slate-500"
      }`}
    >
      {label}
    </button>
  );

  const priorityBtn = (opt: { value: DeadlinePriority; label: string }) => (
    <button
      key={opt.value}
      type="button"
      onClick={() => setPriority(opt.value)}
      className={`rounded-xl border py-2 text-[12px] font-bold transition-all ${
        priority === opt.value
          ? opt.value === "urgent"
            ? isDark ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-red-200 bg-red-50 text-red-600"
            : opt.value === "high"
              ? isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-600"
              : isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-white text-slate-600"
          : isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-400" : "border-slate-200 bg-white text-slate-500"
      }`}
    >
      {opt.label}
    </button>
  );

  const canSave =
    !!title.trim() &&
    !!triggerDate &&
    (mode === "rule" ? !!ruleId : !!dueDate && dueDate >= triggerDate);

  async function handleSave() {
    if (!title.trim()) { setError("اكتب عنوان المهلة قبل الحفظ."); return; }
    if (!triggerDate) { setError("حدِّد تاريخ الحدث الذي تبدأ منه المهلة."); return; }
    if (mode === "rule" && !ruleId) { setError("اختر قاعدة المهلة، أو بدِّل إلى «تاريخ يدوي»."); return; }
    if (mode === "manual") {
      if (!dueDate) { setError("حدِّد تاريخ الاستحقاق."); return; }
      if (dueDate < triggerDate) { setError("تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الحدث."); return; }
    }

    setSaving(true);
    setError(null);
    try {
      const res = await createDeadline({
        title: title.trim(),
        triggerDate,
        ruleId: mode === "rule" ? ruleId : undefined,
        dueDate: mode === "manual" ? dueDate : undefined,
        caseRequestId: caseId || undefined,
        priority,
        reminderOffsetsDays: Array.from(offsets).sort((a, b) => b - a),
      });
      setResult(res);
      setDone(true);
    } catch (err) {
      console.error("[AddDeadlineModal] save failed:", err);
      setError(
        err instanceof Error && err.message
          ? `تعذّرت إضافة المهلة: ${err.message}`
          : "تعذّرت إضافة المهلة. تحقّق من الاتصال ثم أعد المحاولة.",
      );
    } finally {
      setSaving(false);
    }
  }

  // Every rolled-past step in one Arabic clause, e.g. «نهاية الأسبوع، عطلة اليوم الوطني».
  function rolledReasonsAr(): string {
    if (!result?.computation) return "";
    return result.computation.rolledPast
      .map((r) => (r.reason === "weekend" ? "نهاية الأسبوع" : r.titleAr || "عطلة رسمية"))
      .join("، ");
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>إضافة مهلة جديدة</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}>
            <XCircle size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-4">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`}>تمت إضافة المهلة</p>

            {result && (
              <div className={`mt-4 rounded-xl p-3 text-right space-y-1.5 ${isDark ? "bg-white/[0.04] border border-white/[0.06]" : "bg-slate-50 border border-slate-100"}`}>
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  تاريخ الاستحقاق: {describeDateAr(result.deadline.dueDate) ?? result.deadline.dueDate}
                </p>
                {result.deadline.rolledFromHoliday && result.computation && result.computation.rolledPast.length > 0 && (
                  <p className={`text-[11px] ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                    رُحِّلت {toArabicDigits(result.computation.rolledPast.length)} يوم بسبب: {rolledReasonsAr()}
                  </p>
                )}
                {result.computation && !result.computation.hijriResolved && (
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                    لم يمكن التحقق من العطل الهجرية على هذا الجهاز — قد يتغيّر التاريخ عند توفّر البيانات.
                  </p>
                )}
              </div>
            )}

            <button
              onClick={() => { if (result) onCreated(result.deadline); }}
              className="mt-4 rounded-xl px-5 py-2.5 w-full text-[13px] font-bold bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90 transition"
            >
              إغلاق
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {error}
              </div>
            )}

            <div className="flex gap-2">
              {modeBtn("rule", "من قاعدة")}
              {modeBtn("manual", "تاريخ يدوي")}
            </div>

            {mode === "rule" && (
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>قاعدة المهلة <span className="text-red-500">*</span></label>
                {rulesLoading ? (
                  <p className={`flex items-center gap-2 text-[12px] py-2 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                    <CircleNotch size={13} className="animate-spin" /> جارٍ تحميل القواعد...
                  </p>
                ) : rulesError ? (
                  <div className={`flex items-center justify-between rounded-xl px-3 py-2 text-[12px] ${isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"}`}>
                    <span>تعذّر تحميل القواعد.</span>
                    <button onClick={loadRules} className="flex items-center gap-1 font-bold hover:underline">
                      <ArrowClockwise size={12} /> إعادة المحاولة
                    </button>
                  </div>
                ) : (
                  <select value={ruleId} onChange={(e) => selectRule(e.target.value)} className={inputCls}>
                    <option value="" disabled>اختر قاعدة المهلة...</option>
                    {rules.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.titleAr} — {toArabicDigits(r.periodDays)} يوماً{!r.verifiedByOwner ? " (قاعدة افتراضية — تحتاج مراجعتك)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                {mode === "rule" ? "تاريخ الحدث (بداية المهلة)" : "تاريخ الحدث"} <span className="text-red-500">*</span>
              </label>
              <input type="date" value={triggerDate} onChange={(e) => setTriggerDate(e.target.value)} className={inputCls} />
              {triggerDate && describeDateAr(triggerDate) && (
                <p className={`mt-1.5 text-[11px] font-semibold ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{describeDateAr(triggerDate)}</p>
              )}
            </div>

            {mode === "manual" && (
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>تاريخ الاستحقاق <span className="text-red-500">*</span></label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
                {dueDate && describeDateAr(dueDate) && (
                  <p className={`mt-1.5 text-[11px] font-semibold ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{describeDateAr(dueDate)}</p>
                )}
              </div>
            )}

            {!caseRequestId && (
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>القضية (اختياري)</label>
                <CasePicker
                  value={caseId}
                  onChange={(id) => setCaseId(id)}
                  isDark={isDark}
                />
              </div>
            )}

            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>عنوان المهلة <span className="text-red-500">*</span></label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: الاعتراض بطلب الاستئناف" className={inputCls} />
            </div>

            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>مستوى الأهمية</label>
              <div className="grid grid-cols-3 gap-2">
                {PRIORITY_OPTIONS.map(priorityBtn)}
              </div>
            </div>

            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>التذكير قبل الاستحقاق بـ</label>
              <div className="flex gap-3">
                {OFFSET_OPTIONS.map((n) => (
                  <label key={n} className={`flex items-center gap-1.5 text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    <input type="checkbox" checked={offsets.has(n)} onChange={() => toggleOffset(n)} className="accent-[#0B3D2E]" />
                    {toArabicDigits(n)} أيام
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className={`w-full rounded-xl py-2.5 text-[13px] font-bold transition mt-2 ${
                saving || !canSave
                  ? isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
              }`}
            >
              {saving ? "جارٍ الحفظ..." : "حفظ المهلة"}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
