"use client";

/**
 * CalcCourtFees — the «التكاليف القضائية» tab of «الحاسبة القانونية»
 * (/ai/fee-calculator). An ESTIMATE, labelled «تقديرية استرشادية» wherever a
 * figure appears.
 *
 * The arithmetic lives in ./judicialCosts.ts and is the owner's rule only
 * (Q149, 2026-10-03): 5% of a monetary claim, an appeal capped at 10,000 SAR,
 * per Article 16 of the costs regulation. This screen used to pick a court and
 * a case type and then apply value bands, per-court rates, stage surcharges
 * and exemption notes that no source backed; all of that is gone rather than
 * re-labelled, and what the rule does not cover is said in plain words below
 * instead of being given a number.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel, Info, ChartBar, Warning, CheckCircle, ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  JUDICIAL_COSTS_ESTIMATE_LABEL,
  estimateJudicialCosts,
  parseClaimAmount,
  type JudicialCostsEstimate,
} from "./judicialCosts";

type Stage = "first" | "appeal";

const STAGES: { id: Stage; label: string }[] = [
  { id: "first", label: "قيد الدعوى (الدرجة الأولى)" },
  { id: "appeal", label: "الاستئناف" },
];

/** What the rule does not cover — said, not computed. */
const NOT_COVERED =
  "لا يشمل هذا التقدير: الدعاوى غير المالية، والنقض أمام المحكمة العليا، ومحكمة التنفيذ، وديوان المظالم، ولا أي حدٍّ أعلى لتكاليف الدرجة الأولى. وقد تُعفى بعض الدعاوى من التكاليف القضائية نظاماً، ولا يحتسب هذا التقدير أي إعفاء.";

const sar = (n: number) => `${n.toLocaleString("ar-SA-u-nu-latn")} ر.س`;

export default function CalcCourtFees() {
  const { isDark } = useTheme();
  const [amount, setAmount] = useState("");
  const [stages, setStages] = useState<Stage[]>(["first"]);
  const [result, setResult] = useState<JudicialCostsEstimate | null>(null);
  const [done, setDone] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  const inp = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`;
  const labelCls = `block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`;

  const toggleStage = (s: Stage) =>
    setStages((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const parsed = parseClaimAmount(amount);
  const canCalc = parsed !== null && stages.length > 0;

  const calc = () => {
    setResult(
      parsed === null
        ? null
        : estimateJudicialCosts({
            claimAmountSar: parsed,
            includeFirstInstance: stages.includes("first"),
            includeAppeal: stages.includes("appeal"),
          }),
    );
    setDone(true);
  };

  const reset = () => { setAmount(""); setStages(["first"]); setResult(null); setDone(false); };

  return (
    <div className="space-y-5">
      {/* The label, before anything is typed */}
      <div className={`flex gap-2.5 rounded-2xl border p-3.5 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
        <Info size={15} weight="duotone" className="flex-shrink-0 mt-0.5 text-[#C8A762]" />
        <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-amber-800"}`}>
          <strong>حاسبة {JUDICIAL_COSTS_ESTIMATE_LABEL}.</strong>{" "}
          تحتسب ٥٪ من قيمة المطالبة المالية، وتكاليف الاستئناف بحد أعلى ١٠٬٠٠٠ ريال، وفق المادة ١٦ من اللائحة التنفيذية لنظام التكاليف القضائية.
        </p>
      </div>

      {/* Form */}
      <div className={`${card} p-5 space-y-5`}>
        <div>
          <label htmlFor="judicial-costs-amount" className={labelCls}>قيمة المطالبة المالية (ريال)</label>
          <input
            id="judicial-costs-amount"
            type="text"
            inputMode="decimal"
            dir="ltr"
            placeholder="250,000"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setDone(false); }}
            className={`${inp} text-left`}
          />
          {amount.trim() !== "" && parsed === null && (
            <p className={`mt-1.5 text-[11px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              أدخل مبلغاً بالأرقام فقط، أكبر من صفر.
            </p>
          )}
        </div>

        <div>
          <p className={labelCls}>المراحل</p>
          <div className="flex gap-2 flex-wrap">
            {STAGES.map(({ id, label }) => {
              const on = stages.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => { toggleStage(id); setDone(false); }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border text-[12px] font-semibold transition-all ${on ? "bg-[#0B3D2E] border-[#0B3D2E] text-white" : isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}
                >
                  {on && <CheckCircle size={12} weight="fill" />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={calc}
            disabled={!canCalc}
            className={`flex-1 py-3 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all ${canCalc ? "bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] text-white shadow-md" : isDark ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}
          >
            <Gavel size={15} weight="duotone" /> احسب التقدير
          </button>
          {done && (
            <button
              type="button"
              onClick={reset}
              aria-label="مسح"
              className={`px-4 py-3 rounded-xl border text-[12px] font-semibold ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}
            >
              <ArrowCounterClockwise size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Result */}
      <AnimatePresence>
        {done && result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2 mb-4">
                <ChartBar size={16} weight="duotone" className="text-[#C8A762]" />
                <h3 className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                  التكاليف القضائية — {JUDICIAL_COSTS_ESTIMATE_LABEL}
                </h3>
              </div>

              <div className="space-y-3 mb-1">
                {result.lines.map((line) => (
                  <div key={line.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{line.label}</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{line.basis}</p>
                    </div>
                    <span className={`text-[13px] font-mono font-bold flex-shrink-0 ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{sar(line.amountSar)}</span>
                  </div>
                ))}
                {result.lines.length > 1 && (
                  <div className={`pt-2.5 border-t flex items-center justify-between ${isDark ? "border-zinc-800" : "border-slate-100"}`}>
                    <span className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>الإجمالي التقديري</span>
                    <span className="text-[16px] font-black font-mono text-[#C8A762]">{sar(result.totalSar)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className={`flex gap-3 p-4 rounded-2xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
              <Warning size={14} weight="fill" className={`flex-shrink-0 mt-0.5 ${isDark ? "text-amber-400" : "text-amber-600"}`} />
              <div className={`space-y-1.5 text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                <p>أرقام {JUDICIAL_COSTS_ESTIMATE_LABEL} وليست مطالبة رسمية؛ المبلغ المعتمد هو ما تحدده الجهة القضائية عند القيد.</p>
                <p>{NOT_COVERED}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
