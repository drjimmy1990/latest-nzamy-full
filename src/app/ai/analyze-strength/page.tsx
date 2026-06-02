"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useRef } from "react";
import {
  ChartBar, Shield, Target, Scales,
  Warning, CheckCircle, Minus, ArrowRight,
  Gauge, Books, Users, Clock,
  Lightning, ShieldStar, Crosshair, TrendUp,
  CloudArrowUp, Plus, X, BookOpen,
  Brain, Sword, FileText,
  PaperclipHorizontal, UploadSimple, FileArrowUp,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { VoiceInput } from "@/components/ui/VoiceInput";
import AiResultActions from "@/components/AiResultActions";

import { TabKey, Attachment } from "./types";
import { ANALYSIS, OPPONENT_MOVES, DEVIL_ADVOCATE, RISKS_MATRIX, TABS } from "./data";
import { ScoreGauge } from "./components/ScoreGauge";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIStrengthPage() {
  const { isDark } = useTheme();
  const [caseDesc, setCaseDesc] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("strength");

  const [caseFile, setCaseFile] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [hasOpponentMemo, setHasOpponentMemo] = useState(false);
  const [useFirmMemory, setUseFirmMemory] = useState(false);
  const [bulkUpload, setBulkUpload] = useState(false);

  const caseFileRef  = useRef<HTMLInputElement>(null);
  const attachRefs   = useRef<(HTMLInputElement | null)[]>([]);

  function addAtt() { setAttachments(prev => [...prev, { id: Date.now(), description: "", file: null }]); }
  function removeAtt(id: number) { setAttachments(prev => prev.filter(a => a.id !== id)); }
  function updateAtt(id: number, field: "description" | "file", val: string | null) {
    setAttachments(prev => prev.map(a => a.id === id ? { ...a, [field]: val } : a));
  }

  const analyze = useCallback(async () => {
    if (!caseDesc.trim()) return;
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 2500));
    setAnalyzed(true);
    setAnalyzing(false);
  }, [caseDesc]);

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className={`p-5 md:p-7 max-w-6xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>محلل الموقف والخصم</h1>
          <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#C8A762]">PRO</span>
        </div>
        <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          قيّم قوة قضيتك + توقّع حجج الخصم + حدد الفرص والمخاطر — تحليل شامل قبل الترافع
        </p>
      </div>

      {!analyzed ? (
        /* ── Input workflow ── */
        <div className="space-y-4">

          {/* 1. Case file upload */}
          <div className={`${card} p-5 shadow-sm`}>
            <div className="flex items-center gap-2 mb-1">
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>ملف القضية</p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${isDark ? "border-orange-500/30 bg-orange-900/15 text-orange-400" : "border-orange-300 bg-orange-50 text-orange-700"}`}>ارفع ملف القضية أولاً</span>
            </div>

            <div
              className={`mt-3 rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${caseFile
                ? isDark ? "border-emerald-700/30 bg-emerald-900/8" : "border-emerald-200 bg-emerald-50"
                : isDark ? "border-white/[0.08] hover:border-[#C8A762]/30" : "border-zinc-200 hover:border-[#C8A762]/40"
              }`}
              onClick={() => caseFileRef.current?.click()}
            >
              <input ref={caseFileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png"
                onChange={e => { const f = e.target.files?.[0]; if (f) setCaseFile(f.name); }} />
              {caseFile ? (
                <div className="flex items-center justify-center gap-2">
                  <UploadSimple size={14} className="text-emerald-500" />
                  <span className={`text-[12px] font-medium truncate ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{caseFile}</span>
                  <button onClick={e => { e.stopPropagation(); setCaseFile(null); }}><X size={13} className="text-emerald-500" /></button>
                </div>
              ) : (
                <>
                  <CloudArrowUp size={22} className={`mx-auto mb-2 ${isDark ? "text-zinc-600" : "text-zinc-400"}`} />
                  <p className={`text-[12px] font-semibold mb-0.5 ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>ارفع ملف القضية</p>
                  <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>PDF · Word · صور — اسحب وأفلت أو اضغط للاختيار</p>
                </>
              )}
            </div>

            <p className={`text-center text-[11px] my-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`}>أو</p>

            <div className="relative">
              <textarea
                value={caseDesc} onChange={e => setCaseDesc(e.target.value)}
                placeholder={caseFile ? "أضف ملاحظات إضافية (اختياري)..." : "اكتب ملخص القضية: الأطراف · الوقائع · التسلسل الزمني · الأدلة المتاحة · الشهود · الأساس القانوني..."}
                rows={5}
                className={`w-full resize-none rounded-xl border p-4 pe-14 text-[13px] outline-none leading-relaxed ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40"}`}
              />
              <div className="absolute bottom-3 start-3">
                <VoiceInput onTranscript={(t) => setCaseDesc(prev => prev ? `${prev} ${t}` : t)} compact />
              </div>
            </div>
          </div>

          {/* 2. Supporting attachments */}
          <div className={`${card} p-5 shadow-sm space-y-4`}>
            <div className="flex items-center gap-2">
              <PaperclipHorizontal size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>هل لديك مرفقات تدعم موقفك؟</p>
            </div>

            {!bulkUpload ? (
              <div className="space-y-3">
                {attachments.length === 0 && (
                  <div className={`rounded-xl p-4 flex items-center gap-3 ${isDark ? "bg-white/[0.02] border border-white/[0.05]" : "bg-zinc-50 border border-zinc-100"}`}>
                    <Plus size={14} className={isDark ? "text-zinc-600" : "text-zinc-300"} />
                    <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>لا توجد مرفقات — اضغط "إضافة مرفق" لإضافة أدلة ومستندات داعمة</p>
                  </div>
                )}

                {attachments.map((att, idx) => (
                  <motion.div key={att.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className={`rounded-xl border p-4 space-y-3 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50/50"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${isDark ? "bg-[#C8A762]/20 text-[#C8A762]" : "bg-amber-200 text-amber-800"}`}>{idx + 1}</span>
                        <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>المرفق رقم {idx + 1}</p>
                      </div>
                      <button onClick={() => removeAtt(att.id)}>
                        <X size={14} className={isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"} />
                      </button>
                    </div>

                    <div className="relative">
                      <textarea
                        value={att.description}
                        onChange={e => updateAtt(att.id, "description", e.target.value)}
                        placeholder="اشرح هذا المرفق وما الذي تعوّل عليه فيه (الدليل، التاريخ، الصلة بالقضية...)"
                        rows={2}
                        className={`w-full resize-none rounded-xl border px-3 py-2 pe-14 text-[12px] outline-none leading-relaxed ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`}
                      />
                      <div className="absolute bottom-2 start-2">
                        <VoiceInput onTranscript={(t) => updateAtt(att.id, "description", att.description ? `${att.description} ${t}` : t)} compact />
                      </div>
                    </div>

                    {att.file ? (
                      <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] ${isDark ? "bg-emerald-900/15 border border-emerald-700/25" : "bg-emerald-50 border border-emerald-200"}`}>
                        <UploadSimple size={11} className="text-emerald-500" />
                        <span className={`flex-1 truncate ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{att.file}</span>
                        <button onClick={() => updateAtt(att.id, "file", null)}><X size={11} /></button>
                      </div>
                    ) : (
                      <button
                        onClick={() => attachRefs.current[idx]?.click()}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold border transition-colors ${isDark ? "border-white/[0.08] text-zinc-500 hover:border-[#C8A762]/30 hover:text-[#C8A762]" : "border-zinc-200 text-zinc-400 hover:border-amber-400 hover:text-amber-600"}`}>
                        <PaperclipHorizontal size={13} /> ارفع ملف الدليل
                      </button>
                    )}
                    <input ref={el => { attachRefs.current[idx] = el; }} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png"
                      onChange={e => { const f = e.target.files?.[0]; if (f) updateAtt(att.id, "file", f.name); }} />
                  </motion.div>
                ))}

                <div className="flex items-center gap-3 flex-wrap">
                  <motion.button whileTap={{ scale: 0.96 }}
                    onClick={addAtt}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[12px] font-bold transition-colors ${isDark ? "border-[#C8A762]/30 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-amber-300 text-amber-700 hover:bg-amber-100"}`}>
                    <Plus size={13} /> إضافة مرفق
                  </motion.button>
                  <button onClick={() => setBulkUpload(true)}
                    className={`text-[11px] underline transition-colors ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"}`}>
                    أو ارفع كافة المرفقات دفعةً واحدة
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className={`rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-all ${isDark ? "border-white/[0.08] hover:border-[#C8A762]/30" : "border-zinc-200 hover:border-amber-300"}`}>
                  <FileArrowUp size={18} className={`mx-auto mb-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`} />
                  <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>ارفع المذكرة أو الحكم، وAI سيقرؤه تلقائياً</p>
                  <p className={`text-[10px] mt-0.5 flex items-center justify-center gap-1 ${isDark ? "text-amber-600" : "text-amber-500"}`}><Warning size={12} weight="fill" /> يتطلب وقتاً أطول للتحليل وليس الأمثل</p>
                </div>
                <button onClick={() => setBulkUpload(false)}
                  className={`text-[11px] underline ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                  عودة للإضافة الفردية
                </button>
              </div>
            )}
          </div>

          {/* 3. Opponent memo (optional) */}
          <div className={`${card} p-4 shadow-sm`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${isDark ? "bg-red-900/20" : "bg-red-50"}`}>
                <FileText size={17} weight="duotone" className="text-red-500" />
              </div>
              <div className="flex-1">
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>هل لديك مذكرة الخصم أو دفاعه؟</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>ارفعها وسيحللها AI من منظور الخصم الكامل</p>
              </div>
              <button onClick={() => setHasOpponentMemo(v => !v)}
                className={`relative h-6 w-11 rounded-full transition-colors flex-shrink-0 ${hasOpponentMemo ? "bg-red-500" : isDark ? "bg-zinc-700" : "bg-zinc-300"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${hasOpponentMemo ? "start-5" : "start-0.5"}`} />
              </button>
            </div>
            <AnimatePresence>
              {hasOpponentMemo && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-3">
                  <div className={`rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${isDark ? "border-red-700/30 hover:border-red-600/40" : "border-red-200 hover:border-red-300"}`}>
                    <CloudArrowUp size={18} className="mx-auto mb-1.5 text-red-500" />
                    <p className={`text-[12px] font-semibold ${isDark ? "text-red-300" : "text-red-700"}`}>ارفع مذكرة الخصم / دفاعه</p>
                    <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>PDF · Word · صور</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 4. Firm memory */}
          <div className={`${card} p-4 shadow-sm`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
                <BookOpen size={17} weight="duotone" className="text-[#C8A762]" />
              </div>
              <div className="flex-1">
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>استخدم ذاكرة مكتبك</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>AI يجمع قاعدة نظامي + سوابق مكتبك لتحليل أعمق وحجج أقوى</p>
              </div>
              <button onClick={() => setUseFirmMemory(v => !v)}
                className={`relative h-6 w-11 rounded-full transition-colors flex-shrink-0 ${useFirmMemory ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-700" : "bg-zinc-300"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${useFirmMemory ? "start-5" : "start-0.5"}`} />
              </button>
            </div>
          </div>

          {/* 5. Analyze CTA */}
          <div className="flex justify-between items-center">
            <span className={`text-[12px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>متاح ضمن الباقة</span>
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              onClick={analyze} disabled={!caseDesc.trim() || analyzing}
              className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-2.5 text-[13px] font-bold text-white shadow-md disabled:opacity-40">
              <ChartBar size={15} />
              {analyzing ? "جارٍ التحليل الشامل..." : "حلّل الموقف"}
            </motion.button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Tab bar ── */}
          <div className={`rounded-xl p-1 flex gap-1 ${isDark ? "bg-zinc-800/60" : "bg-zinc-100"}`}>
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              const isDevil = tab.key === "devil";
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`relative flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[11px] font-semibold transition-all ${
                    isActive
                      ? isDevil
                        ? "bg-red-600 text-white shadow-md"
                        : isDark ? "bg-[#0B3D2E] text-white shadow-md" : "bg-white text-[#0B3D2E] shadow-sm"
                      : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-700"
                  }`}>
                  <Icon size={14} weight={isActive ? "fill" : "regular"} />
                  {tab.label}
                  {isDevil && !isActive && (
                    <span className="absolute -top-1 -start-1 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Unified result actions ── */}
          <AiResultActions
            text={[
              `تقرير محلل الموقف والخصم`,
              `مؤشر قوة القضية: ${ANALYSIS.overallScore}/100`,
              `الحكم: ${ANALYSIS.verdict}`,
              ``,
              `نقاط القوة:\n${ANALYSIS.strengths.map((s: string) => `• ${s}`).join("\n")}`,
              ``,
              `نقاط الضعف:\n${ANALYSIS.weaknesses.map((w: string) => `• ${w}`).join("\n")}`,
              ``,
              `التوصيات:\n${ANALYSIS.recommendations.map((r: string) => `• ${r}`).join("\n")}`,
              ``,
              `توقعات الخصم (${OPPONENT_MOVES.length} حركة):\n${OPPONENT_MOVES.map((m: { move: string; counter: string }) => `• هجوم: ${m.move}\n  الدفع: ${m.counter}`).join("\n")}`,
            ].join("\n")}
            filename="case-strength-analysis"
            showVault
            showHumanReview
            className="justify-start"
          />

          {/* ── Tab: قوة موقفك ── */}
          {activeTab === "strength" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className={`${card} p-6 shadow-sm flex flex-col items-center text-center`}>
                  <p className={`text-[11px] font-bold uppercase tracking-wider mb-4 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>مؤشر قوة القضية</p>
                  <ScoreGauge score={ANALYSIS.overallScore} isDark={isDark} />
                  <div className={`mt-4 rounded-2xl px-4 py-2.5 border ${isDark ? "border-amber-700/30 bg-amber-900/20" : "border-amber-200 bg-amber-50"}`}>
                    <p className={`text-[12px] leading-relaxed ${isDark ? "text-amber-300" : "text-amber-800"}`}>{ANALYSIS.verdict}</p>
                  </div>
                </div>
                <div className={`xl:col-span-2 ${card} p-5 shadow-sm`}>
                  <p className={`text-[11px] font-bold uppercase tracking-wider mb-4 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>تقييم حسب المحور</p>
                  <div className="space-y-3">
                    {ANALYSIS.dimensions.map((d, i) => {
                      const Icon = d.icon;
                      const color = d.score >= 75 ? "bg-emerald-500" : d.score >= 50 ? "bg-amber-500" : "bg-red-500";
                      return (
                        <div key={d.key} className="flex items-center gap-3">
                          <Icon size={14} className={isDark ? "text-zinc-500 flex-shrink-0" : "text-zinc-400 flex-shrink-0"} />
                          <span className={`text-[12px] w-36 flex-shrink-0 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{d.label}</span>
                          <div className={`h-1.5 flex-1 rounded-full ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${d.score}%` }}
                              transition={{ delay: 0.1 + i * 0.07, duration: 0.8 }}
                              className={`h-full rounded-full ${color}`} />
                          </div>
                          <span className={`font-mono text-[12px] font-bold w-8 text-center flex-shrink-0 ${d.score >= 75 ? "text-emerald-500" : d.score >= 50 ? "text-amber-500" : "text-red-500"}`}>
                            {d.score}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                  { title: "نقاط القوة", items: ANALYSIS.strengths, icon: CheckCircle, color: "text-emerald-500", bg: isDark ? "border-emerald-700/30 bg-emerald-900/15" : "border-emerald-200 bg-emerald-50" },
                  { title: "نقاط الضعف", items: ANALYSIS.weaknesses, icon: Warning, color: "text-red-500", bg: isDark ? "border-red-700/30 bg-red-900/15" : "border-red-100 bg-red-50" },
                  { title: "التوصيات", items: ANALYSIS.recommendations, icon: Target, color: "text-[#C8A762]", bg: isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50" },
                ].map(({ title, items, icon: Icon, color, bg }) => (
                  <div key={title} className={`rounded-2xl p-4 border ${bg}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon size={15} className={color} weight={title === "التوصيات" ? "duotone" : "fill"} />
                      <h3 className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-800"}`}>{title}</h3>
                    </div>
                    <ul className="space-y-2">
                      {items.map((item, i) => (
                        <li key={i} className={`flex items-start gap-2 text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                          <Minus size={10} className={`flex-shrink-0 mt-1 ${color}`} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Tab: توقعات الخصم ── */}
          {activeTab === "opponent" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className={`rounded-2xl p-4 border ${isDark ? "border-purple-700/30 bg-purple-900/15" : "border-purple-200 bg-purple-50"}`}>
                <div className="flex items-center gap-2">
                  <ShieldStar size={16} className="text-purple-500" />
                  <p className={`text-[13px] font-bold ${isDark ? "text-purple-300" : "text-purple-800"}`}>
                    تم رصد {OPPONENT_MOVES.length} هجمات محتملة من الخصم مع الدفوع الموصى بها
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {OPPONENT_MOVES.map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                    className={`${card} p-5 shadow-sm`}>
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl ${m.type === "attack" ? "bg-red-500/10" : "bg-blue-500/10"}`}>
                        {m.type === "attack" ? <Warning size={15} className="text-red-500" /> : <Target size={15} className="text-blue-500" />}
                      </div>
                      <div>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${m.type === "attack" ? "text-red-500" : "text-blue-500"}`}>
                          {m.type === "attack" ? `هجوم #${i + 1} — الخصم` : "دفاع — الخصم"}
                        </p>
                        <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{m.move}</p>
                      </div>
                    </div>
                    <div className={`rounded-xl p-3 border ${isDark ? "border-emerald-700/30 bg-emerald-900/15" : "border-emerald-200 bg-emerald-50"}`}>
                      <div className="flex items-start gap-2">
                        <Lightning size={12} className="flex-shrink-0 mt-0.5 text-emerald-500" />
                        <div>
                          <p className="text-[10px] font-bold text-emerald-500 mb-0.5">الدفع المضاد الموصى به</p>
                          <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{m.counter}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Tab: الفرص والمخاطر ── */}
          {activeTab === "risks" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "قوة الموقف", value: `${ANALYSIS.overallScore}/100`, color: "text-[#C8A762]", bg: isDark ? "bg-[#C8A762]/5 border-[#C8A762]/20" : "bg-amber-50 border-amber-200" },
                  { label: "هجمات الخصم المتوقعة", value: `${OPPONENT_MOVES.length}`, color: "text-red-500", bg: isDark ? "bg-red-500/5 border-red-700/20" : "bg-red-50 border-red-200" },
                  { label: "مخاطر عالية", value: `${RISKS_MATRIX.filter(r => r.impact >= 80).length}`, color: "text-orange-500", bg: isDark ? "bg-orange-500/5 border-orange-700/20" : "bg-orange-50 border-orange-200" },
                  { label: "فرص متاحة", value: `${ANALYSIS.strengths.length}`, color: "text-emerald-500", bg: isDark ? "bg-emerald-500/5 border-emerald-700/20" : "bg-emerald-50 border-emerald-200" },
                ].map((stat, i) => (
                  <div key={i} className={`rounded-xl border p-3 text-center ${stat.bg}`}>
                    <p className={`text-[10px] font-semibold mb-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{stat.label}</p>
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>
              <div className={`${card} p-5 shadow-sm`}>
                <p className={`text-[11px] font-bold uppercase tracking-wider mb-4 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>مصفوفة المخاطر</p>
                <div className="space-y-3">
                  {RISKS_MATRIX.map((risk, i) => {
                    const severity = (risk.likelihood / 100) * (risk.impact / 100);
                    const severityColor = severity >= 0.5 ? "bg-red-500" : severity >= 0.25 ? "bg-amber-500" : "bg-emerald-500";
                    const severityLabel = severity >= 0.5 ? "حرج" : severity >= 0.25 ? "متوسط" : "منخفض";
                    return (
                      <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                        className={`rounded-xl border p-4 ${isDark ? "border-white/[0.06] bg-zinc-800/40" : "border-zinc-200/70 bg-zinc-50"}`}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${severityColor}`} />
                            <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{risk.risk}</p>
                          </div>
                          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                            severityColor === "bg-red-500" ? "bg-red-500/15 text-red-500" :
                            severityColor === "bg-amber-500" ? "bg-amber-500/15 text-amber-500" :
                            "bg-emerald-500/15 text-emerald-500"
                          }`}>{severityLabel}</span>
                        </div>
                        <div className="flex gap-4 mb-2">
                          <div className="flex items-center gap-1">
                            <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>الاحتمالية:</span>
                            <span className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{risk.likelihood}%</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>التأثير:</span>
                            <span className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{risk.impact}%</span>
                          </div>
                        </div>
                        <div className={`rounded-lg p-2.5 border ${isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200/70 bg-emerald-50/50"}`}>
                          <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                            <span className="font-bold text-emerald-500">التخفيف: </span>{risk.mitigation}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Tab: محاكي الخصم ── */}
          {activeTab === "devil" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* Intro */}
              <div className={`rounded-2xl p-4 border ${isDark ? "border-red-700/30 bg-red-900/15" : "border-red-200 bg-red-50"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Brain size={16} className="text-red-500" weight="duotone" />
                  <p className={`text-[13px] font-bold ${isDark ? "text-red-300" : "text-red-800"}`}>محاكي الخصم — AI يتقمص دور خصمك الكامل</p>
                </div>
                <p className={`text-[12px] leading-relaxed ${isDark ? "text-red-400/70" : "text-red-600/80"}`}>
                  AI يهاجم موقفك كما سيفعل الخصم الذكي — الثغرات، الاستراتيجية، والطعون المحتملة
                </p>
              </div>

              {/* Devil cards */}
              <div className="space-y-3">
                {DEVIL_ADVOCATE.map((item, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.12 }}
                    className={`${card} p-5 shadow-sm border-s-4 ${
                      item.severity === "critical"
                        ? "border-s-red-600"
                        : item.severity === "high"
                        ? "border-s-orange-500"
                        : "border-s-amber-400"
                    }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        item.severity === "critical"
                          ? isDark ? "bg-red-900/40 text-red-400" : "bg-red-100 text-red-700"
                          : item.severity === "high"
                          ? isDark ? "bg-orange-900/40 text-orange-400" : "bg-orange-100 text-orange-700"
                          : isDark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700"
                      }`}>
                        {item.severity === "critical" ? <span className="flex items-center gap-1"><Warning size={10} weight="bold" /> حرج</span> : item.severity === "high" ? "↑ عالي" : "متوسط"}
                      </span>
                      <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{item.label}</p>
                    </div>
                    <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{item.text}</p>
                  </motion.div>
                ))}
              </div>

              {/* Ask a specific question */}
              <div className={`${card} p-4 shadow-sm`}>
                <p className={`text-[12px] font-semibold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  اسأل محاكي الخصم عن نقطة بعينها
                </p>
                <div className="relative">
                  <textarea
                    placeholder="مثال: ما أضعف نقطة في حجتي بشأن المادة ٧٧؟ أو: كيف يمكن للخصم تفنيد الدليل الرئيسي؟"
                    rows={2}
                    className={`w-full resize-none rounded-xl border p-3 pe-14 text-[12px] outline-none leading-relaxed ${isDark ? "border-white/[0.07] bg-zinc-800/50 text-zinc-200 placeholder:text-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400"}`}
                  />
                  <div className="absolute bottom-2 start-3">
                    <VoiceInput onTranscript={() => {}} compact />
                  </div>
                </div>
                <button className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold py-2.5 transition-colors">
                  <Brain size={13} /> حاكِ الخصم
                </button>
              </div>
            </motion.div>
          )}

          {/* Reset button */}
          <div className="flex justify-end">
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setAnalyzed(false); setCaseDesc(""); setActiveTab("strength"); setAttachments([]); setHasOpponentMemo(false); }}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
              <ArrowRight size={14} /> تحليل قضية جديدة
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}
