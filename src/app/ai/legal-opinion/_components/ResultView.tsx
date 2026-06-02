"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkle, SealCheck, Warning, BookmarkSimple,
  PencilSimple, Copy, CheckCircle, DownloadSimple,
  ArrowRight, Tray,
} from "@phosphor-icons/react";
import Link from "next/link";
import { MOCK_RESULT, OUTPUT_TYPES } from "../_constants";
import { SourceBadge } from "./SharedViews";
import { StudyDocumentEditor } from "./StudyDocumentEditor";
import type { OutputType } from "../_types";
import { markdownBoldToSafeHtml } from "@/utils/sanitize";
import AiResultActions from "@/components/AiResultActions";
import { addToInbox } from "@/lib/draftInboxStore";
import BetaReviewGate from "@/components/BetaReviewGate";

export function ResultView({ outputType, isDark, onReset, onEdit }: {
  outputType: OutputType; isDark: boolean; onReset: () => void; onEdit?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "laws" | "thinking">("summary");
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [addedAll, setAddedAll] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);

  const tabs = [
    { key: "summary" as const, label: "الملخص والمستند" },
    { key: "laws" as const, label: "النصوص والسوابق" },
    { key: "thinking" as const, label: "أبحاث الوكلاء" },
  ];

  const opConfig = OUTPUT_TYPES.find(o => o.id === outputType)!;

  return (
    <BetaReviewGate toolId="legal-opinion.result" toolName="الرأي القانوني المدعوم بالنصوص والسوابق" reviewScope="legal-data">
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "النوع", value: opConfig.title, color: opConfig.color, bg: opConfig.bg },
          { label: "النصوص", value: `${MOCK_RESULT.laws.length} نصوص`, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "السوابق", value: `${MOCK_RESULT.precedents.length} سابقة`, color: "text-purple-500", bg: "bg-purple-500/10" },
          { label: "جودة AI", value: "٩٤٪", color: "text-emerald-500", bg: "bg-emerald-500/10" },
        ].map((st, i) => (
          <div key={i} className={`rounded-xl p-3 text-center border ${isDark ? "border-white/[0.06]" : "border-slate-100"} ${st.bg}`}>
            <p className={`text-[10px] mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{st.label}</p>
            <p className={`text-[12px] font-black ${st.color}`}>{st.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-2xl ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all ${
              activeTab === tab.key
                ? isDark ? "bg-zinc-700 text-zinc-100 shadow-sm" : "bg-white text-slate-800 shadow-sm"
                : isDark ? "text-zinc-500" : "text-slate-400"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Summary */}
      {activeTab === "summary" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {/* AI Summary */}
          <div className={`rounded-2xl p-4 border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkle size={13} weight="fill" className="text-[#C8A762]" />
              <span className={`text-[11px] font-black uppercase tracking-wider ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>ملخص AI</span>
              <span className="ms-auto text-[9px] rounded-full px-2 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 font-bold">٣ مصادر مدموجة</span>
            </div>
            <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}
              dangerouslySetInnerHTML={{ __html: markdownBoldToSafeHtml(MOCK_RESULT.summary) }} />
          </div>

          {/* Recommendation */}
          <div className={`rounded-2xl p-4 border ${isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
            <div className="flex items-center gap-2 mb-2">
              <SealCheck size={13} weight="fill" className="text-emerald-500" />
              <span className={`text-[11px] font-black ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>التوصية</span>
            </div>
            <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{MOCK_RESULT.recommendation}</p>
          </div>

          {/* Risks */}
          <div className={`rounded-2xl p-4 border ${isDark ? "border-orange-700/20 bg-orange-900/10" : "border-orange-200 bg-orange-50"}`}>
            <div className="flex items-center gap-2 mb-2">
              <Warning size={13} weight="fill" className="text-orange-500" />
              <span className={`text-[11px] font-black ${isDark ? "text-orange-400" : "text-orange-700"}`}>المخاطر المحتملة</span>
            </div>
            <ul className="space-y-1.5">
              {MOCK_RESULT.risks.map((r, i) => (
                <li key={i} className={`text-[12px] flex items-start gap-2 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  <span className="text-orange-500 flex-shrink-0 mt-0.5">•</span>{r}
                </li>
              ))}
            </ul>
          </div>

          {/* Study Document Editor (replaces plain textarea) */}
          <StudyDocumentEditor draft={MOCK_RESULT.draft} isDark={isDark} />
        </motion.div>
      )}

      {/* Tab: Laws & Precedents */}
      {activeTab === "laws" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

          {/* Bulk add to collector */}
          <div className="flex items-center justify-between">
            <p className={`text-[11px] font-black uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              النصوص والسوابق ({MOCK_RESULT.laws.length + MOCK_RESULT.precedents.length})
            </p>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => {
                MOCK_RESULT.laws.forEach(law => {
                  addToInbox("legal-opinion", "text", law.article, law.text);
                });
                MOCK_RESULT.precedents.forEach(p => {
                  addToInbox("legal-opinion", "precedent", p.title, p.summary);
                });
                setAddedAll(true);
                setTimeout(() => setAddedAll(false), 2500);
              }}
              className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                addedAll
                  ? isDark ? "border-emerald-700/30 bg-emerald-900/15 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : isDark ? "border-purple-500/30 bg-purple-900/10 text-purple-400 hover:bg-purple-900/20" : "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
              }`}>
              {addedAll
                ? <><CheckCircle size={12} weight="fill" className="text-emerald-400" /> أُضيفت للمجمّع ✓</>  
                : <><Tray size={12} /> أضف الكل للمجمّع</>}
            </motion.button>
          </div>

          {/* Laws Section */}
          <div>
            <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>المواد النظامية ({MOCK_RESULT.laws.length})</p>
            <div className="space-y-3">
              {MOCK_RESULT.laws.map((law, i) => (
                <div key={i} className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white shadow-sm"}`}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[12px] font-black ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{law.article}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-slate-500"}`}>{law.system}</span>
                    <div className={`ms-auto flex items-center gap-1.5 flex-1 max-w-[100px]`}>
                      <div className={`h-1 flex-1 rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${law.relevance}%` }} transition={{ delay: 0.3 + i * 0.1, duration: 0.7 }} className="h-full rounded-full bg-[#0B3D2E]" />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-[#C8A762] flex-shrink-0">{law.relevance}٪</span>
                    </div>
                  </div>
                  <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{law.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Precedents Section */}
          <div>
            <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>السوابق والمبادئ القضائية ({MOCK_RESULT.precedents.length})</p>
            <div className="space-y-3">
              {MOCK_RESULT.precedents.map((p, i) => (
                <div key={i} className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-200 bg-white shadow-sm"}`}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-slate-500"}`}>{p.type}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.support === "مؤيِّد" ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>{p.support}</span>
                    <SourceBadge source={p.source} isDark={isDark} />
                    <button onClick={() => setSaved(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                      className={`ms-auto flex items-center gap-1 text-[10px] ${saved.has(i) ? "text-[#C8A762]" : isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      <BookmarkSimple size={13} weight={saved.has(i) ? "fill" : "regular"} />
                    </button>
                  </div>
                  <p className={`text-[12px] font-black mb-1 ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{p.title}</p>
                  <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{p.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Tab: Thinking */}
      {activeTab === "thinking" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <div className={`p-4 rounded-2xl border ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-100 bg-slate-50"}`}>
            <p className={`text-[12px] font-bold mb-1 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>مسار التفكير وأبحاث الوكلاء</p>
            <p className={`text-[10px] mb-4 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              تفاصيل ما قام به كل وكيل ذكي للوصول إلى النتيجة النهائية
            </p>
            
            <div className="space-y-4 relative before:absolute before:top-2 before:bottom-2 before:start-[15px] before:w-px before:bg-gradient-to-b before:from-[#0B3D2E] before:to-transparent">
              {MOCK_RESULT.thinking.map((th, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="relative ps-10">
                  <div className={`absolute start-0 top-3 w-8 h-8 rounded-full border flex items-center justify-center font-bold text-[10px] ${
                    isDark ? "border-zinc-700 bg-zinc-800 text-zinc-300" : "border-slate-200 bg-white text-slate-600"
                  }`}>
                    {i + 1}
                  </div>
                  <button onClick={() => setExpandedAgent(expandedAgent === i ? null : i)}
                    className={`w-full text-start rounded-xl border p-4 transition-all ${isDark ? "border-white/[0.06] bg-zinc-800/50 hover:bg-zinc-800/80" : "border-slate-200 bg-white shadow-sm hover:border-slate-300"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[12px] font-black ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>{th.agent}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-600 border border-amber-200/50"}`}>{th.model}</span>
                        </div>
                        <span className={`text-[10px] font-medium ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{th.role}</span>
                      </div>
                      <ArrowRight size={14} className={`transition-transform duration-300 ${expandedAgent === i ? "-rotate-90" : "rotate-180"} ${isDark ? "text-zinc-500" : "text-slate-400"}`} />
                    </div>
                    
                    {expandedAgent === i && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="overflow-hidden mt-3 pt-3 border-t border-slate-100 dark:border-white/[0.05]">
                        <ul className="space-y-2">
                          {th.details.map((dt, j) => (
                            <li key={j} className="flex items-start gap-2">
                              <span className={`mt-1.5 w-1 h-1 rounded-full flex-shrink-0 ${isDark ? "bg-[#C8A762]" : "bg-emerald-500"}`} />
                              <span className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{dt}</span>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[12px] font-bold text-white">
          <DownloadSimple size={14} /> تنزيل Word
        </motion.button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[12px] font-semibold ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-white text-slate-600"}`}>
          <DownloadSimple size={14} /> تنزيل PDF
        </motion.button>
        <Link href="/ai/draft"
          className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[12px] font-semibold ${isDark ? "border-[#C8A762]/30 bg-[#C8A762]/5 text-[#C8A762]" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
          <PencilSimple size={14} /> حسّن بالصائغ
        </Link>

        <div className="ms-auto flex items-center gap-2">
          {onEdit && (
            <button onClick={onEdit}
              className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold rounded-xl border transition-colors ${
                isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}>
              <ArrowRight size={13} className="rotate-180" /> تعديل المعطيات
            </button>
          )}
          <button onClick={onReset}
            className={`flex items-center gap-1.5 text-[12px] px-3 py-2 ${isDark ? "text-red-400 hover:text-red-300" : "text-red-500 hover:text-red-600"}`}>
            إغلاق
          </button>
        </div>
      </div>

      {/* Unified Result Actions */}
      <div className={`pt-3 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
        <AiResultActions
          text={`${MOCK_RESULT.summary}\n\n${MOCK_RESULT.recommendation}`}
          filename="legal-opinion"
          showCollector
          collectorSource="legal-opinion"
          showHumanReview={false}
          className="justify-start"
        />
      </div>

    </motion.div>
    </BetaReviewGate>

  );
}
