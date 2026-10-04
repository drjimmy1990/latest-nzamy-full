"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel, BookOpen, ArrowRight, CaretLeft,
  Clock, Info, Globe, MapPin, CaretDown,
  ClipboardText,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import BetaReviewGate from "@/components/BetaReviewGate";
import { toArabicDigits } from "@/lib/services/arabicCount";


// ─── Types & Imports ─────────────────────────────────────────────────────────
import {
  CIRCUITS, PROCEDURE_STEPS, COURTS_LIST,
  CircuitEmail, CircuitsSampleNotice, UnverifiedBadge, isVerifiedCircuit,
} from "./_data";

type Mode = "circuits" | "procedures";


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProceduresPage() {
  const { isDark } = useTheme();
  const [mode, setMode] = useState<Mode>("circuits");
  const [selectedCourt, setSelectedCourt] = useState<string | null>(null);
  const [expandedCircuit, setExpandedCircuit] = useState<number | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  // Owner test 28-9 (T28-33): both tabs used to open with an «اسأل» box whose
  // answer was a 1.4-second setTimeout followed by one of three canned replies
  // (getSmartAnswer in the deleted _ai.ts) — a fixed «الدائرة التجارية الأولى»
  // card for any question mentioning a court, invented community votes with a
  // «موثّق» seal, and a fixed limitation-period answer with a 95% "confidence"
  // bar. Nothing was searched. Removed entirely; the directory and the
  // procedure guides below are what this page actually has.

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
              {/* «ذكاء مجتمعي من المحامين» was the third item here and nothing
                  on this page evidences it: there is no lawyer contribution on
                  the screen, no count, and no path by which a lawyer adds to
                  these procedures. The «الدوائر القضائية» tab beside it carries
                  no count either. A subtitle is a promise about the page under
                  it; this one named a source of knowledge the page does not
                  have. */}
              إجراءات · دوائر قضائية
            </p>
          </div>
          {/* Owner note ٨٨ — «محدّث ٢٠٢٦» claimed currency for data that carries
              no update-date field anywhere in _data.tsx. No real date to show,
              so the badge is removed rather than left asserting one. */}
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

      {/* ── MODE: CIRCUITS ── */}
      <AnimatePresence mode="wait">
        {mode === "circuits" && (
          <motion.div key="circuits" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Owner test 28-9 (T28-33): the entries below are an unverified
                sample (see CIRCUITS_SAMPLE_NOTICE in _data.tsx), so the tab
                opens by saying so. */}
            <CircuitsSampleNotice isDark={isDark} />

            {/* Owner item ٣٥ — the circuits directory used to live in a SECOND
                `{mode === "circuits"}` block further down, carrying the same
                `key="circuits"` as this one. Two children with one key under
                `<AnimatePresence mode="wait">` is what produced the tall empty
                gap in the owner's screenshot: the presence tracker treats them
                as one node, keeps the first, and reserves the space of the
                second while it waits for an exit that never comes. Merged here
                so the tab is a single keyed child. Its «ابحث: دائرة تجارية…»
                input had no value, no onChange and no filter behind it, and was
                deleted for that reason. */}
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
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-[10px] font-black rounded-full px-2 py-0.5 ${group.bg} ${group.color}`}>
                                  الدائرة {circuit.num}
                                </span>
                                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{circuit.spec}</p>
                                {!isVerifiedCircuit(circuit) && <UnverifiedBadge />}
                              </div>
                              {/* Durations, floors and najiz codes are shown only for a verified
                                  entry — the sample ones were never sourced. */}
                              {isVerifiedCircuit(circuit) && circuit.avgDays && (
                                <span className={`text-[10px] flex items-center gap-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                                  <Clock size={9} />{circuit.avgDays}
                                </span>
                              )}
                            </div>
                            {/* The full address — the tab used to print only
                                the part before «@» (owner test 28-9, T28-33). */}
                            {circuit.email && (
                              <div className="mb-2">
                                <CircuitEmail email={circuit.email} isDark={isDark} verified={isVerifiedCircuit(circuit)} />
                              </div>
                            )}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {isVerifiedCircuit(circuit) && circuit.floor && (
                                <div className={`flex items-center gap-1.5 text-[10px] rounded-lg px-2 py-1.5 border ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-500"}`}>
                                  <MapPin size={11} className="text-amber-500 flex-shrink-0" />
                                  {circuit.floor}
                                </div>
                              )}
                              {isVerifiedCircuit(circuit) && circuit.najizCode && (
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

            {/* «البيانات تُحدَّث دورياً» used to sit here — nothing updates
                this sample, and the line contradicted the notice above. */}
            <div className={`text-center py-3`}>
              <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                للتأكيد الرسمي تواصل مباشرة مع المحكمة
              </p>
            </div>

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

            {/* The canned «استشر الذكاء الاصطناعي» box that sat here is gone
                (see the note at the top of this component). */}
            <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
              اختر المحكمة لعرض خطوات التقاضي أمامها
            </p>

            {!selectedCourt ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                {COURTS_LIST.map((court, i) => {
                  const Icon = court.icon;
                  const stepCount = PROCEDURE_STEPS[court.id]?.steps.length ?? 0;
                  const isLastOdd = i === COURTS_LIST.length - 1 && COURTS_LIST.length % 2 === 1;
                  return (
                    <motion.button key={court.id}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedCourt(court.id)}
                      className={`${card} p-4 flex items-start gap-3 hover:border-[#0B3D2E]/20 transition-all cursor-pointer text-start ${isLastOdd ? "sm:col-span-2" : ""}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${court.bg}`}>
                        <Icon size={18} weight="duotone" className={court.color} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{court.name}</p>
                          {stepCount > 0 && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-slate-100 text-slate-400"}`}>
                              {toArabicDigits(stepCount)} خطوات
                            </span>
                          )}
                        </div>
                        <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                          عرض الخطوات
                        </p>
                      </div>
                      <CaretLeft size={14} className={isDark ? "text-zinc-700" : "text-slate-300"} />
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

      </AnimatePresence>
    </div>
  );
}
