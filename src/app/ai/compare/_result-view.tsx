"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, WarningCircle, Copy, Check, Scales,
  MagicWand, Spinner, ArrowsLeftRight, CheckCircle, Warning, Sparkle
} from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import { useTheme } from "@/components/ThemeProvider";
import {
  MOCK_DIFFS, MOCK_ISSUES, SEV_STYLE, formatCompareReport,
} from "./_compare-types";
import { DiffCard } from "./_compare-components";
import { AutoFixPanel } from "./_auto-fix-panel";

export function ResultView({ isDark, docAName, docBName }: { isDark: boolean; docAName: string; docBName: string }) {
  const [activeTab, setActiveTab] = useState<"diff" | "issues" | "verdict">("diff");
  const [copied, setCopied] = useState(false);
  const [fixMode, setFixMode] = useState<"idle" | "fixing" | "done">("idle");

  const added    = MOCK_DIFFS.filter(d => d.status === "added").length;
  const removed  = MOCK_DIFFS.filter(d => d.status === "removed").length;
  const modified = MOCK_DIFFS.filter(d => d.status === "modified").length;
  const identical = MOCK_DIFFS.filter(d => d.status === "identical").length;
  const critical = MOCK_ISSUES.filter(i => i.severity === "critical").length;

  const handleAutoFix = async () => {
    setFixMode("fixing");
    await new Promise(r => setTimeout(r, 1800));
    setFixMode("done");
  };

  const card   = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70" : "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const tabCls = (active: boolean) => `px-4 py-2 rounded-xl text-[12px] font-bold transition-all ${
    active
      ? isDark ? "bg-white/[0.08] text-white" : "bg-[#0B3D2E] text-white"
      : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-700"
  }`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      {/* Scores row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "مُضاف",    value: added,    color: "text-emerald-500", bg: isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50" },
          { label: "محذوف",   value: removed,  color: "text-red-400",     bg: isDark ? "border-red-700/20 bg-red-900/10" : "border-red-200 bg-red-50" },
          { label: "معدَّل",  value: modified, color: "text-amber-400",   bg: isDark ? "border-amber-700/20 bg-amber-900/10" : "border-amber-200 bg-amber-50" },
          { label: "متطابق",  value: identical,color: isDark ? "text-zinc-400" : "text-slate-500", bg: isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50" },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl border p-3 text-center ${s.bg}`}>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className={`text-[10px] font-bold mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Critical alert */}
      {critical > 0 && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isDark ? "border-red-700/20 bg-red-900/10" : "border-red-200 bg-red-50"}`}>
          <WarningCircle size={18} weight="fill" className="text-red-500 flex-shrink-0" />
          <p className={`text-[12px] font-semibold ${isDark ? "text-red-400" : "text-red-700"}`}>
            تم رصد {critical} مشكلة حرجة تستوجب المراجعة قبل توقيع أي وثيقة
          </p>
        </div>
      )}

      <AiResultActions text={formatCompareReport(docAName, docBName)} filename="smart-compare-report" showShare />

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-xl w-fit ${isDark ? "bg-zinc-800/60" : "bg-slate-100"}`}>
        {([
          { key: "diff",    label: `الاختلافات (${MOCK_DIFFS.length})` },
          { key: "issues",  label: `التنبيهات (${MOCK_ISSUES.length})` },
          { key: "verdict", label: "التوصية" },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className={tabCls(activeTab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === "diff" && (
          <motion.div key="diff" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "المستند أ", name: docAName, color: isDark ? "border-white/[0.06] bg-white/[0.02] text-zinc-400" : "border-slate-200 bg-slate-50 text-slate-600" },
                { label: "المستند ب", name: docBName, color: "border-[#C8A762]/30 bg-[#C8A762]/5 text-[#C8A762]" },
              ].map((d, i) => (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold ${d.color}`}>
                  <FileText size={13} weight="duotone" />
                  <span className="truncate">{d.name}</span>
                </div>
              ))}
            </div>
            {MOCK_DIFFS.map(d => <DiffCard key={d.id} diff={d} isDark={isDark} />)}
          </motion.div>
        )}

        {activeTab === "issues" && (
          <motion.div key="issues" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {MOCK_ISSUES.map((issue, i) => {
              const sv = SEV_STYLE[issue.severity];
              return (
                <div key={i} className={`rounded-2xl border p-4 ${isDark ? sv.badge.dark : sv.badge.light}`}>
                  <div className="flex items-start gap-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${sv.dot}`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{issue.title}</p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${isDark ? sv.badge.dark : sv.badge.light}`}>{sv.label}</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-white text-slate-500 border border-slate-200"}`}>
                            {issue.inDoc === "both" ? "كلا المستندين" : `مستند ${issue.inDoc}`}
                          </span>
                        </div>
                      </div>
                      <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{issue.detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}

        {activeTab === "verdict" && (
          <motion.div key="verdict" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className={`${card} p-5 space-y-4`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
                  <Scales size={17} weight="duotone" className="text-[#C8A762]" />
                </div>
                <p className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>الحكم المقارن</p>
              </div>

              <div className={`p-4 rounded-xl border ${isDark ? "border-red-700/20 bg-red-900/10" : "border-red-200 bg-red-50"}`}>
                <p className={`text-[12px] font-bold mb-1 flex items-center gap-1.5 ${isDark ? "text-red-400" : "text-red-600"}`}><Warning size={14} weight="bold" /> المستند ب أضعف قانونياً</p>
                <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                  يتضمن المستند ب بنوداً تتعارض مع نظام العمل السعودي (المادة ١٠٩) بحذف الإجازة السنوية، فضلاً عن شرط عدم منافسة مبهم وسرية مفرطة المدة.
                </p>
              </div>

              <div className={`p-4 rounded-xl border ${isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
                <p className={`text-[12px] font-bold mb-1 flex items-center gap-1.5 ${isDark ? "text-emerald-400" : "text-emerald-700"}`}><CheckCircle size={14} weight="fill" /> المستند أ أكثر توافقاً</p>
                <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                  المستند الأول أقرب للمتطلبات النظامية الأساسية ويوفر حماية معقولة للطرفين. يُنصح باعتماده كأساس ومعالجة البنود الناقصة.
                </p>
              </div>

              <div className="space-y-2">
                <p className={`text-[11px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>الخطوات الموصى بها:</p>
                {[
                  "إعادة بند الإجازة السنوية للمستند ب وفق المادة (١٠٩) عمل",
                  "تحديد نطاق شرط عدم المنافسة جغرافياً ومهنياً بدقة",
                  "تخفيض مدة السرية إلى سنتين مع تحديد النطاق",
                  "إضافة بند للتجديد التلقائي أو على الأقل توضيح الإجراءات",
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold mt-0.5 ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-slate-100 text-slate-500"}`}>{i + 1}</span>
                    <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{step}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => { navigator.clipboard.writeText("نتيجة المقارنة: المستند أ أكثر توافقاً."); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold border transition ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-white" : "border-slate-200 text-slate-500 hover:text-slate-700"}`}
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copied ? "تم النسخ" : "نسخ الملخص"}
              </button>

              {/* Auto Fix */}
              <div className={`border-t pt-4 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                {fixMode === "idle" && (
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleAutoFix}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold transition-all border-2 border-dashed ${
                      isDark
                        ? "border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20"
                        : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    <MagicWand size={16} weight="duotone" />
                    إصلاح المستند ب تلقائياً <Sparkle size={14} weight="fill" className="mr-1 inline text-emerald-400" />
                  </motion.button>
                )}

                {fixMode === "fixing" && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold ${
                      isDark ? "bg-emerald-900/20 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                    }`}>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                      <Spinner size={15} />
                    </motion.div>
                    جارٍ تطبيق الإصلاحات...
                  </motion.div>
                )}

                <AnimatePresence>
                  {fixMode === "done" && <AutoFixPanel isDark={isDark} />}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
