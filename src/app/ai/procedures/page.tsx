"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel, BookOpen, MagnifyingGlass, ArrowRight, CaretRight,
  Clock, CheckCircle, Buildings, Scales, FileText, Warning,
  Info, Shield, Globe, MapPin, Envelope, Phone, ArrowSquareOut,
  ChatCircleDots, ThumbsUp, ThumbsDown, Users, Star, CaretDown,
  Lightning, Robot, SealCheck, HouseSimple, ArrowLeft,
  ClipboardText, Sparkle, Question, BookBookmark,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { VoiceInput } from "@/components/ui/VoiceInput";
import { markdownBoldToSafeHtml } from "@/utils/sanitize";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";


// ─── Types & Imports ─────────────────────────────────────────────────────────
import { CIRCUITS, PROCEDURE_STEPS, COURTS_LIST } from "./_data";
import { SmartAnswer, getSmartAnswer, formatSmartAnswer } from "./_ai";

type Mode = "circuits" | "procedures";


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProceduresPage() {
  const { isDark } = useTheme();
  const [mode, setMode] = useState<Mode>("circuits");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<SmartAnswer | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedCourt, setSelectedCourt] = useState<string | null>(null);
  const [expandedCircuit, setExpandedCircuit] = useState<number | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  async function doSearch(overrideQuery?: string) {
    const q = (overrideQuery || query).trim();
    if (!q) return;
    if (overrideQuery) setQuery(q);
    setSearching(true);
    setAnswer(null);
    await new Promise(r => setTimeout(r, 1400));
    setAnswer(getSmartAnswer(q));
    setSearching(false);
  }

  const procedure = selectedCourt ? PROCEDURE_STEPS[selectedCourt] : null;
  const courtInfo = COURTS_LIST.find(c => c.id === selectedCourt);

  return (
    <div className={`max-w-4xl mx-auto space-y-5 p-5 md:p-7 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Gavel size={20} weight="duotone" className="text-amber-500" />
          </div>
          <div>
            <h1 className={`text-lg font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>المرشد القضائي</h1>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              إجراءات · دوائر قضائية · ذكاء مجتمعي من المحامين
            </p>
          </div>
          <div className="ms-auto hidden sm:flex gap-1.5">
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-500">محدّث ٢٠٢٦</span>
          </div>
        </div>
      </motion.div>

      {/* Mode Tabs */}
      <div className={`flex gap-1 p-1 rounded-2xl ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
        {([
          { key: "circuits" as Mode, label: "الدوائر القضائية", icon: MapPin },
          { key: "procedures" as Mode, label: "الإجراءات", icon: ClipboardText },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setMode(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold transition-all ${
              mode === tab.key
                ? isDark ? "bg-zinc-700 text-zinc-100 shadow-sm" : "bg-white text-slate-800 shadow-sm"
                : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
            }`}>
            <tab.icon size={13} weight={mode === tab.key ? "fill" : "regular"} />
            <span className="hidden sm:block">{tab.label}</span>
            <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {/* ── MODE: ASK ── */}
      {/* ── MODE: CIRCUITS ── */}
      <AnimatePresence mode="wait">
        {mode === "circuits" && (
          <motion.div key="circuits" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            
            {/* Search box */}
            <div className={`${card} p-4 space-y-3`}>
              <p className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                اسأل عن الدوائر القضائية
              </p>
              <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 ${isDark ? "border-white/[0.08] bg-zinc-800/60 focus-within:border-amber-500/40" : "border-slate-200 bg-slate-50 focus-within:border-[#0B3D2E]/40"}`}>
                <ChatCircleDots size={18} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <input value={query} onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doSearch()}
                  placeholder="مثال: رقم الدائرة التجارية الثالثة؟ أو: بريد دائرة الأحوال الشخصية؟"
                  className={`flex-1 bg-transparent text-[13px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-zinc-400"}`} />
                <VoiceInput onTranscript={t => setQuery(prev => prev ? `${prev} ${t}` : t)} compact />
              </div>

              {/* Quick questions */}
              <div className="flex flex-wrap gap-2">
                {[
                  "الدائرة التجارية الأولى",
                  "بريد الدائرة العمالية بالرياض",
                  "مقر الاستئناف التجاري",
                  "هل للاستئناف دوائر عمالية؟",
                ].map(q => (
                  <button key={q} onClick={() => doSearch(q)}
                    className={`rounded-xl px-3 py-1.5 text-[11px] border transition-colors ${isDark ? "border-white/[0.07] bg-zinc-800 hover:bg-zinc-700 text-zinc-400" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-500"}`}>
                    <Lightning size={10} className="inline me-1 text-amber-500" />{q}
                  </button>
                ))}
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={() => doSearch()} disabled={!query.trim() || searching}
                  className="ms-auto rounded-xl bg-[#0B3D2E] px-5 py-2 text-[12px] font-bold text-white disabled:opacity-40">
                  {searching ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white mx-auto" />
                  ) : "اسأل"}
                </motion.button>
              </div>
            </div>

            {/* Searching animation */}
            {searching && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`${card} p-4 flex items-center gap-3`}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}>
                  <Robot size={16} className="text-[#C8A762]" />
                </motion.div>
                <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>أبحث في قاعدة البيانات والذكاء الاجتماعي للمحامين...</p>
              </motion.div>
            )}

            {/* Smart Answer */}
            <AnimatePresence>
              {answer && !searching && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <BetaReviewGate toolId="procedures.smart-answer" toolName="إجابة المرشد القضائي" reviewScope="legal-data">
                  <div className={`${card} p-4 space-y-3`}>
                    {answer.type !== "circuit" && (
                      <div className="flex items-center gap-2">
                        <SealCheck size={15} weight="fill" className="text-emerald-500" />
                        <span className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{answer.answer}</span>
                        <div className="ms-auto flex items-center gap-2">
                          <div className={`h-1.5 w-16 rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${answer.confidence}%` }}
                              className={`h-full rounded-full ${answer.confidence > 90 ? "bg-emerald-500" : "bg-amber-500"}`}
                              transition={{ duration: 0.8 }} />
                          </div>
                          <span className={`text-[11px] font-mono font-bold ${answer.confidence > 90 ? "text-emerald-500" : "text-amber-500"}`}>{answer.confidence}٪</span>
                        </div>
                      </div>
                    )}

                    {/* Direct answer */}
                    {answer.type === "direct" && (
                      <div>
                        <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}
                          dangerouslySetInnerHTML={{ __html: markdownBoldToSafeHtml(answer.answer) }} />
                        {answer.source && (
                          <p className={`mt-2 text-[11px] font-mono ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                            📖 المصدر: {answer.source}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Circuit answer */}
                    {answer.type === "circuit" && answer.circuitData && (
                      <div className={`rounded-xl border p-4 space-y-3 ${isDark ? "border-amber-700/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
                        <p className={`text-[13px] font-bold ${isDark ? "text-amber-300" : "text-amber-800"}`}>{answer.circuitData.name}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { icon: Envelope, label: "البريد", value: answer.circuitData.email },
                            { icon: Phone, label: "الهاتف", value: answer.circuitData.phone },
                            { icon: MapPin, label: "الموقع", value: answer.circuitData.floor },
                            { icon: Globe, label: "ناجز", value: answer.circuitData.najizCode },
                          ].map((item, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <item.icon size={12} className="text-amber-500 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.label}</p>
                                <p className={`text-[11px] font-semibold truncate ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{item.value}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Community answer */}
                    {answer.type === "community" && answer.communityVotes && (
                      <div className="space-y-2">
                        <p className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                          تصويت المحامين في نظامي ({answer.communityVotes.reduce((s, v) => s + v.votes, 0)} محامٍ)
                        </p>
                        {answer.communityVotes.map((vote, i) => (
                          <div key={i} className={`rounded-xl border p-3 ${i === 0
                            ? isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"
                            : isDark ? "border-white/[0.04]" : "border-slate-100"
                          }`}>
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-[12px] leading-relaxed flex-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{vote.answer}</p>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {vote.verified && <SealCheck size={11} weight="fill" className="text-emerald-500" />}
                                <span className={`text-[11px] font-bold ${i === 0 ? "text-emerald-500" : isDark ? "text-zinc-500" : "text-slate-400"}`}>
                                  {vote.votes} ✓
                                </span>
                              </div>
                            </div>
                            {i === 0 && (
                              <div className={`mt-1.5 h-1 rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                                <motion.div initial={{ width: 0 }}
                                  animate={{ width: `${(vote.votes / answer.communityVotes![0].votes) * 100}%` }}
                                  className="h-full rounded-full bg-emerald-500" transition={{ duration: 0.8 }} />
                              </div>
                            )}
                          </div>
                        ))}
                        <p className={`text-[10px] ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
                          💡 هذا الذكاء الاجتماعي مبني على تجارب محامين معتمدين في المنصة
                        </p>
                      </div>
                    )}

                    <AiResultActions
                      text={formatSmartAnswer(answer)}
                      filename="procedures-answer"
                      showShare
                    />
                  </div>
                  </BetaReviewGate>

                  {/* CTA */}
                  <div className={`mt-3 flex items-center gap-3 flex-wrap`}>
                    <Link href="/ai/legal-opinion"
                      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-bold border ${isDark ? "border-[#C8A762]/30 bg-[#C8A762]/5 text-[#C8A762]" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                      <Sparkle size={13} /> احصل على رأي قانوني مفصّل
                    </Link>
                    <Link href="/ai/draft"
                      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-bold border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-white text-slate-600"}`}>
                      <BookOpen size={13} /> اكتب المذكرة
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Disclaimer */}
            <div className={`rounded-xl flex items-start gap-2.5 p-3.5 border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
              <Info size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                المعلومات للإرشاد العام فقط. المدد والإجراءات قد تختلف حسب القضية وتقدير المحكمة. <span className={`font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>استشر محاميك.</span>
              </p>
            </div>
          </motion.div>
        )}

        {/* ── MODE: PROCEDURES ── */}
        {mode === "procedures" && (
          <motion.div key="procedures" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            
            {/* Search box */}
            <div className={`${card} p-4 flex flex-col gap-3`}>
              <p className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                استشر الذكاء الاصطناعي عن الإجراءات
              </p>
              <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 ${isDark ? "border-white/[0.08] bg-zinc-800/60 focus-within:border-[#C8A762]/40" : "border-slate-200 bg-slate-50 focus-within:border-[#0B3D2E]/40"}`}>
                <ChatCircleDots size={18} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <input value={query} onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doSearch()}
                  placeholder="مثال: كيف أرفع دعوى فصل تعسفي؟"
                  className={`flex-1 bg-transparent text-[13px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-zinc-400"}`} />
                <VoiceInput onTranscript={t => setQuery(prev => prev ? `${prev} ${t}` : t)} compact />
              </div>

              {/* Quick questions */}
              <div className="flex flex-wrap gap-2 mt-1">
                {[
                  "إجراءات المحكمة العمالية",
                  "الاعتراض على حكم",
                  "الصلح والتسوية",
                  "إلغاء قرار إداري",
                ].map(q => (
                  <button key={q} onClick={() => doSearch(q)}
                    className={`rounded-xl px-3 py-1.5 text-[11px] border transition-colors ${isDark ? "border-white/[0.07] bg-zinc-800 hover:bg-zinc-700 text-zinc-400" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-500"}`}>
                    <Lightning size={10} className="inline me-1 text-amber-500" />{q}
                  </button>
                ))}
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={() => doSearch()} disabled={!query.trim() || searching}
                  className="ms-auto rounded-xl bg-[#0B3D2E] px-5 py-2 text-[12px] font-bold text-white disabled:opacity-40">
                  {searching ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white mx-auto" />
                  ) : "ابحث"}
                </motion.button>
              </div>
            </div>

            {/* Searching animation */}
            {searching && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`${card} p-4 flex items-center gap-3`}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}>
                  <Robot size={16} className="text-[#C8A762]" />
                </motion.div>
                <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>أبحث في قاعدة البيانات والذكاء الاجتماعي للمحامين...</p>
              </motion.div>
            )}

            {/* Answer Display (reusable) */}
            <AnimatePresence>
              {answer && !searching && answer.type !== "circuit" && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-4 flex flex-col gap-3`}>
                  <BetaReviewGate toolId="procedures.smart-answer" toolName="إجابة المرشد القضائي" reviewScope="legal-data">
                  <div className="flex items-center gap-2">
                    <SealCheck size={15} weight="fill" className="text-emerald-500" />
                    <span className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{answer.answer}</span>
                    <div className="ms-auto flex items-center gap-2">
                      <div className={`h-1.5 w-16 rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${answer.confidence}%` }}
                          className={`h-full rounded-full ${answer.confidence > 90 ? "bg-emerald-500" : "bg-amber-500"}`}
                          transition={{ duration: 0.8 }} />
                      </div>
                      <span className={`text-[11px] font-mono font-bold ${answer.confidence > 90 ? "text-emerald-500" : "text-amber-500"}`}>{answer.confidence}٪</span>
                    </div>
                  </div>
                  
                  {answer.type === "direct" && (
                    <div className="mt-1">
                      <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}
                        dangerouslySetInnerHTML={{ __html: markdownBoldToSafeHtml(answer.answer) }} />
                      {answer.source && (
                        <p className={`mt-2 text-[11px] font-mono ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                          📖 المصدر: {answer.source}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {answer.type === "community" && answer.communityVotes && (
                    <div className="flex flex-col gap-2 mt-1">
                      <p className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                        تصويت المحامين في نظامي ({answer.communityVotes.reduce((s, v) => s + v.votes, 0)} محامٍ)
                      </p>
                      {answer.communityVotes.map((vote, i) => (
                        <div key={i} className={`rounded-xl border p-3 ${i === 0
                          ? isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"
                          : isDark ? "border-white/[0.04]" : "border-slate-100"
                        }`}>
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-[12px] leading-relaxed flex-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{vote.answer}</p>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {vote.verified && <SealCheck size={11} weight="fill" className="text-emerald-500" />}
                              <span className={`text-[11px] font-bold ${i === 0 ? "text-emerald-500" : isDark ? "text-zinc-500" : "text-slate-400"}`}>
                                {vote.votes} ✓
                              </span>
                            </div>
                          </div>
                          {i === 0 && (
                            <div className={`mt-1.5 h-1 rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                              <motion.div initial={{ width: 0 }}
                                animate={{ width: `${(vote.votes / answer.communityVotes![0].votes) * 100}%` }}
                                className="h-full rounded-full bg-emerald-500" transition={{ duration: 0.8 }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <AiResultActions
                    text={formatSmartAnswer(answer)}
                    filename="procedures-answer"
                    showShare
                  />
                  </BetaReviewGate>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Separator */}
            <div className="flex items-center gap-4 py-3">
              <div className={`flex-1 h-px ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
              <p className={`text-[10px] font-black uppercase tracking-wider flex-shrink-0 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                تصفح الإجراءات يدوياً
              </p>
              <div className={`flex-1 h-px ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
            </div>

            {!selectedCourt ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                {COURTS_LIST.map((court, i) => {
                  const Icon = court.icon;
                  return (
                    <motion.button key={court.id}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedCourt(court.id)}
                      className={`${card} p-4 flex items-start gap-3 hover:border-[#0B3D2E]/20 transition-all cursor-pointer text-start`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${court.bg}`}>
                        <Icon size={18} weight="duotone" className={court.color} />
                      </div>
                      <div className="flex-1">
                        <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{court.name}</p>
                        <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                          <ArrowLeft size={10} />عرض الخطوات
                        </p>
                      </div>
                      <CaretRight size={14} className={isDark ? "text-zinc-700" : "text-slate-300"} />
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4 mb-8">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setSelectedCourt(null); setExpandedStep(null); }}
                    className={`flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-xl border transition-colors ${isDark ? "border-white/[0.06] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:text-slate-700"}`}>
                    <ArrowRight size={13} /> العودة
                  </button>
                  <div>
                    <h2 className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{procedure?.title}</h2>
                    <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{procedure?.description}</p>
                  </div>
                </div>

                <BetaReviewGate toolId="procedures.manual-guide" toolName="دليل الإجراءات القضائية" reviewScope="legal-data">
                {/* Steps */}
                <div className="flex flex-col gap-2">
                  {procedure?.steps.map((step, i) => (
                    <motion.div key={i}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      className={`rounded-2xl border overflow-hidden transition-all ${
                        step.critical
                          ? isDark ? "border-orange-700/30 bg-orange-900/10" : "border-orange-200 bg-orange-50"
                          : isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-100 bg-white shadow-sm"
                      }`}>
                      <button onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                        className="w-full flex items-center gap-3 p-4 text-start">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black flex-shrink-0 border ${
                          step.critical
                            ? "border-orange-500/30 bg-orange-500/10 text-orange-500"
                            : isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-400" : "border-slate-200 bg-slate-100 text-slate-500"
                        }`}>{i + 1}</div>
                        <p className={`flex-1 text-[13px] font-semibold text-start ${step.critical ? isDark ? "text-orange-300" : "text-orange-700" : isDark ? "text-zinc-200" : "text-slate-700"}`}>
                          {step.label}
                          {step.critical && <span className="ms-2 text-[9px] font-black bg-orange-500/15 text-orange-500 px-1.5 py-0.5 rounded-full">تنبيه حرج</span>}
                        </p>
                        {step.time && (
                          <span className={`text-[11px] font-mono flex-shrink-0 flex items-center gap-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                            <Clock size={10} />{step.time}
                          </span>
                        )}
                        <CaretDown size={12} className={`flex-shrink-0 transition-transform ${expandedStep === i ? "rotate-180" : ""} ${isDark ? "text-zinc-600" : "text-slate-400"}`} />
                      </button>
                      <AnimatePresence>
                        {expandedStep === i && step.tip && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className={`px-4 pb-3 pt-0`}>
                            <div className={`rounded-xl px-3 py-2.5 flex items-start gap-2 ${isDark ? "bg-[#C8A762]/8 text-[#C8A762]/90" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
                              <Info size={12} className="flex-shrink-0 mt-0.5" />
                              <p className="text-[11px] leading-relaxed">{step.tip}</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>

                {/* Link to drafter */}
                <div className={`p-4 rounded-2xl flex gap-3 items-center ${isDark ? "bg-[#0B3D2E]/10" : "bg-[#0B3D2E]/5"}`}>
                  <div className="w-9 h-9 rounded-xl bg-[#0B3D2E] flex items-center justify-center flex-shrink-0">
                    <BookOpen size={16} weight="duotone" className="text-white" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تحتاج مذكرة أو لائحة للمحكمة؟</p>
                    <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>الصائغ القانوني يساعدك في كتابة كل ما تحتاجه</p>
                  </div>
                  <Link href="/ai/draft" className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B3D2E] text-white text-[12px] font-bold">
                    <BookOpen size={13} /> الصائغ
                  </Link>
                </div>
                </BetaReviewGate>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── MODE: CIRCUITS ── */}
        {mode === "circuits" && (
          <motion.div key="circuits" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className={`${card} p-3 flex items-center gap-2`}>
              <MagnifyingGlass size={16} className={isDark ? "text-zinc-500" : "text-slate-400"} />
              <input placeholder="ابحث: دائرة تجارية، استئناف عمالي، أسرة..."
                className={`flex-1 bg-transparent text-[13px] outline-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-slate-700 placeholder:text-slate-400"}`} />
            </div>

            {CIRCUITS.map((group, gi) => {
              const Icon = group.icon;
              return (
                <div key={gi} className={`${card} overflow-hidden`}>
                  <button onClick={() => setExpandedCircuit(expandedCircuit === gi ? null : gi)}
                    className={`w-full flex items-center gap-3 p-4`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${group.bg}`}>
                      <Icon size={17} weight="duotone" className={group.color} />
                    </div>
                    <p className={`flex-1 text-[13px] font-bold text-start ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{group.court}</p>
                    <span className={`text-[10px] rounded-full px-2 py-0.5 ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-slate-100 text-slate-400"}`}>
                      {group.circuits.length} دوائر
                    </span>
                    <CaretDown size={13} className={`transition-transform flex-shrink-0 ${expandedCircuit === gi ? "rotate-180" : ""} ${isDark ? "text-zinc-600" : "text-slate-400"}`} />
                  </button>

                  <AnimatePresence>
                    {expandedCircuit === gi && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className={`border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                        {group.circuits.map((circuit, ci2) => (
                          <div key={ci2} className={`p-4 ${ci2 < group.circuits.length - 1 ? (isDark ? "border-b border-white/[0.04]" : "border-b border-slate-50") : ""}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-black rounded-full px-2 py-0.5 ${group.bg} ${group.color}`}>
                                  الدائرة {circuit.num}
                                </span>
                                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{circuit.spec}</p>
                              </div>
                              {circuit.avgDays && (
                                <span className={`text-[10px] flex items-center gap-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                                  <Clock size={9} />{circuit.avgDays}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {circuit.email && (
                                <a href={`mailto:${circuit.email}`}
                                  className={`flex items-center gap-1.5 text-[10px] rounded-lg px-2 py-1.5 border transition-colors ${isDark ? "border-white/[0.06] hover:border-blue-500/30 text-zinc-500 hover:text-blue-400" : "border-slate-100 hover:border-blue-200 text-slate-500 hover:text-blue-600"}`}>
                                  <Envelope size={11} className="text-blue-500 flex-shrink-0" />
                                  <span className="truncate">{circuit.email.split("@")[0]}</span>
                                </a>
                              )}
                              {circuit.phone && (
                                <a href={`tel:${circuit.phone}`}
                                  className={`flex items-center gap-1.5 text-[10px] rounded-lg px-2 py-1.5 border ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
                                  <Phone size={11} className="text-emerald-500 flex-shrink-0" />
                                  {circuit.phone}
                                </a>
                              )}
                              {circuit.floor && (
                                <div className={`flex items-center gap-1.5 text-[10px] rounded-lg px-2 py-1.5 border ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
                                  <MapPin size={11} className="text-amber-500 flex-shrink-0" />
                                  {circuit.floor}
                                </div>
                              )}
                              {circuit.najizCode && (
                                <div className={`flex items-center gap-1.5 text-[10px] rounded-lg px-2 py-1.5 border font-mono ${isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-100 text-slate-400"}`}>
                                  <Globe size={11} className="text-purple-500 flex-shrink-0" />
                                  {circuit.najizCode}
                                </div>
                              )}
                            </div>
                            {circuit.notes && (
                              <p className={`mt-2 text-[10px] flex items-start gap-1.5 ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
                                <Info size={10} className="flex-shrink-0 mt-0.5" />{circuit.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            <div className={`text-center py-3`}>
              <p className={`text-[11px] ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
                البيانات تُحدَّث دورياً · للتأكيد الرسمي تواصل مباشرة مع المحكمة
              </p>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
