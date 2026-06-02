"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Spinner, ShieldCheck, Sparkle, CaretDown, Sword,
  WarningCircle, CheckFat, CheckCircle, Eye, X, ArrowsClockwise
} from "@phosphor-icons/react";
import BetaReviewGate from "@/components/BetaReviewGate";

import {
  type ItemAction,
  type SimTarget,
  type DraftReviewProps,
  buildChecks,
  MOCK_WARGAME,
  SEV_CONFIG,
  SRC_CONFIG,
  MOCK_MEMO_BASE,
} from "./StepReviewData";

import {
  DownloadBar,
  InlineFixInput,
  ActionCard,
  AppliedMemoPreview
} from "./StepReviewComponents";

export function StepReview({
  isDark, memoType, legalBranch,
  defenseCount, lawCount, hasParties, hasCaseText, hasJudgmentData,
}: DraftReviewProps) {
  const [phase,    setPhase]    = useState<"scanning" | "done">("scanning");
  const [revealed, setRevealed] = useState(0);

  // Wargame state
  const [wargameOpen,    setWargameOpen]    = useState(false);
  const [targets,        setTargets]        = useState<Set<SimTarget>>(new Set(["adversary", "court"]));
  const [simulating,     setSimulating]     = useState(false);
  const [simulated,      setSimulated]      = useState(false);
  const [wargameActions, setWargameActions] = useState<Record<string, ItemAction>>({});
  const [applied,        setApplied]        = useState(false);
  const [wargamePanelOpen, setWargamePanelOpen] = useState(true);

  const checks = buildChecks({ isDark, memoType, legalBranch, defenseCount, lawCount, hasParties, hasCaseText, hasJudgmentData });

  useEffect(() => {
    setPhase("scanning"); setRevealed(0);
    const iv = setInterval(() => {
      setRevealed(prev => {
        if (prev >= checks.length - 1) {
          clearInterval(iv);
          setTimeout(() => setPhase("done"), 300);
          return checks.length;
        }
        return prev + 1;
      });
    }, 300);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors   = checks.filter(c => c.status === "error");
  const warnings = checks.filter(c => c.status === "warn");
  const passed   = checks.filter(c => c.status === "ok");
  const score    = Math.round((passed.length / checks.length) * 100);

  const MEMO_LABEL: Record<string, string> = { case: "تحرير دعوى", reply: "مذكرة رد", appeal: "طعن", contract: "عقد" };

  function toggleTarget(t: SimTarget) {
    setTargets(prev => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  }

  async function runSim() {
    setSimulating(true);
    await new Promise(r => setTimeout(r, 2200));
    setSimulating(false);
    setSimulated(true);
  }

  const wargameFiltered = MOCK_WARGAME
    .filter(p => targets.size === 0 || targets.has(p.source))
    .sort((a, b) => ({ critical: 0, medium: 1, low: 2 }[a.severity] - ({ critical: 0, medium: 1, low: 2 }[b.severity])));

  const appliedIds     = wargameFiltered.filter(p => wargameActions[p.id] === "add" || wargameActions[p.id] === "edit").map(p => p.id);
  const hasAnyApplied  = appliedIds.length > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      {/* Context strip */}
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-[11px] ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50/80"}`}>
        <Sparkle size={12} weight="fill" className="text-[#C8A762] flex-shrink-0" />
        <p className={isDark ? "text-zinc-500" : "text-slate-500"}>
          فحص شامل لـ <strong className={isDark ? "text-zinc-200" : "text-slate-700"}>{MEMO_LABEL[memoType] ?? "مذكرة"}</strong>
          {legalBranch && <> — فرع <strong className={isDark ? "text-zinc-200" : "text-slate-700"}>{legalBranch}</strong></>}
          {" "}· الذكاء الاصطناعي يراجع البنية والاكتمال والجودة
        </p>
      </div>

      <BetaReviewGate toolId="draft.review" toolName="تحليل جودة المذكرة والمحاكاة" reviewScope="legal-data">
        {/* Score header */}
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-royal/10" : "bg-royal/8"}`}>
            {phase === "scanning"
              ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}><Spinner size={20} className="text-royal" /></motion.div>
              : <ShieldCheck size={20} weight="duotone" className="text-royal" />}
          </div>
          <div className="flex-1">
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
              {phase === "scanning" ? "جارٍ فحص المذكرة..." : "تقرير جودة المذكرة"}
            </p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              {phase === "scanning" ? `فحص ${checks.length} معيار...` : `${passed.length} ✅ · ${warnings.length} ⚠️ · ${errors.length} ❌`}
            </p>
          </div>
          {phase === "done" && (
            <div className={`text-center px-3 py-1.5 rounded-xl border ${score >= 80 ? isDark ? "border-emerald-500/30 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50" : score >= 60 ? isDark ? "border-amber-500/30 bg-amber-500/10" : "border-amber-200 bg-amber-50" : isDark ? "border-red-500/30 bg-red-500/10" : "border-red-200 bg-red-50"}`}>
              <p className={`text-[20px] font-black ${score >= 80 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-red-500"}`}>{score}%</p>
              <p className={`text-[9px] font-bold ${score >= 80 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-red-500"}`}>جودة المذكرة</p>
            </div>
          )}
        </div>

        {/* Check items — using unified ActionCard */}
        <div className={`rounded-2xl border overflow-hidden divide-y ${isDark ? "border-white/[0.05] divide-white/[0.03]" : "border-slate-100 divide-slate-50"}`}>
          {checks.map((check, i) => (
            <motion.div key={check.id} animate={{ opacity: i <= revealed ? 1 : 0.25 }}>
              <ActionCard
                id={check.id}
                title={check.label}
                detail={check.detail}
                statusOrSeverity={check.status}
                suggestion={check.suggestion}
                isDark={isDark}
                fixInput={check.status === "error" && check.suggestion
                  ? <InlineFixInput isDark={isDark} placeholder={check.fixHint} />
                  : undefined}
              />
            </motion.div>
          ))}
        </div>

        {/* Done section */}
        <AnimatePresence>
          {phase === "done" && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

              {/* Summary */}
              {errors.length === 0 && warnings.length === 0 ? (
                <div className={`flex items-center gap-3 p-3 rounded-2xl border ${isDark ? "border-emerald-500/20 bg-emerald-500/8" : "border-emerald-200 bg-emerald-50"}`}>
                  <CheckCircle size={18} weight="fill" className="text-emerald-500" />
                  <p className={`text-[12px] font-semibold ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>المذكرة اجتازت جميع الفحوصات — جاهزة للصياغة النهائية</p>
                </div>
              ) : (
                <div className={`p-3 rounded-2xl border ${errors.length > 0 ? isDark ? "border-red-500/15 bg-red-500/5" : "border-red-200 bg-red-50" : isDark ? "border-amber-500/15 bg-amber-500/5" : "border-amber-100 bg-amber-50"}`}>
                  <p className={`text-[12px] font-bold mb-1.5 ${errors.length > 0 ? "text-red-500" : "text-amber-600"}`}>
                    {errors.length > 0 ? `${errors.length} نقطة تحتاج معالجة · ${warnings.length} تحذير` : `${warnings.length} تحذير — يُوصى بالمراجعة`}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...errors, ...warnings].map(c => (
                      <span key={c.id} className={`text-[10px] px-2 py-0.5 rounded-full border ${c.status === "error" ? isDark ? "border-red-700/20 text-red-400 bg-red-900/10" : "border-red-200 text-red-600 bg-red-50" : isDark ? "border-amber-700/20 text-amber-400 bg-amber-900/10" : "border-amber-200 text-amber-700 bg-amber-50"}`}>
                        {c.status === "error" ? "❌" : "⚠️"} {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Downloads */}
              <DownloadBar isDark={isDark} />

              {/* Wargame section */}
              {!wargameOpen ? (
                <div className={`rounded-2xl border-2 border-dashed ${isDark ? "border-amber-700/30 bg-amber-900/5" : "border-amber-200 bg-amber-50/50"}`}>
                  <button onClick={() => setWargameOpen(true)} className="w-full flex items-center gap-3 px-4 py-3.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-900/30" : "bg-amber-100"}`}>
                      <Sword size={16} weight="duotone" className="text-amber-500" />
                    </div>
                    <div className="flex-1 text-right">
                      <div className="flex items-center gap-2">
                        <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>محاكي الخصم والمحكمة</p>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${isDark ? "border-amber-700/30 bg-amber-900/20 text-amber-400" : "border-amber-300 bg-amber-100 text-amber-700"}`}>اختياري</span>
                      </div>
                      <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>اكتشف الثغرات قبل الخصم — اعتراضات · أسئلة المحكمة · تحسينات</p>
                    </div>
                    <CaretDown size={13} className={isDark ? "text-amber-700" : "text-amber-400"} />
                  </button>
                </div>
              ) : (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={`rounded-2xl border overflow-hidden ${isDark ? "border-white/[0.06] bg-zinc-900/70" : "border-slate-200 bg-white shadow-sm"}`}>
                  {/* Header */}
                  <div className={`flex items-center gap-3 px-4 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "bg-amber-900/30" : "bg-amber-100"}`}>
                      <Sword size={15} weight="duotone" className="text-amber-500" />
                    </div>
                    <div className="flex-1">
                      <p className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>محاكي الخصم والمحكمة</p>
                      {simulated && (
                        <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                          {appliedIds.length} إضافة مختارة · {wargameFiltered.filter(p => wargameActions[p.id] === "delete").length} تجاهل
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {simulated && (
                        <button onClick={() => { setSimulated(false); setWargameActions({}); setApplied(false); }}
                          className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border ${isDark ? "border-white/[0.08] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-400 hover:text-slate-600"}`}>
                          <ArrowsClockwise size={10} />إعادة
                        </button>
                      )}
                      <button onClick={() => { setWargameOpen(false); if (!simulated) { setSimulated(false); setTargets(new Set(["adversary","court"])); } }}
                        className={`w-6 h-6 flex items-center justify-center rounded-lg ${isDark ? "text-zinc-600 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {(!applied || wargamePanelOpen) && (
                      <motion.div animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="p-4 space-y-3">

                          {/* Step 1 — target selection */}
                          {!simulating && (
                            <div className="space-y-2">
                              <p className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                                {simulated ? "الأهداف المحاكاة:" : "اختر ما تريد محاكاته:"}
                              </p>
                              <div className="grid grid-cols-3 gap-2">
                                {(Object.keys(SRC_CONFIG) as SimTarget[]).map(t => {
                                  const cfg = SRC_CONFIG[t];
                                  const Icon = cfg.icon;
                                  const active = targets.has(t);
                                  return (
                                    <button key={t}
                                      onClick={() => { if (!simulated) toggleTarget(t); }}
                                      className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all ${simulated ? "cursor-default" : "cursor-pointer"} ${
                                        active ? isDark ? `${cfg.bg.d} border-current` : `${cfg.bg.l} border-current` : isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-200 text-slate-400"
                                      }`}>
                                      <Icon size={14} weight="duotone" className={active ? cfg.color : ""} />
                                      <span className={`text-[10px] font-bold ${active ? cfg.color : ""}`}>{cfg.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              {!simulated && (
                                <motion.button whileTap={{ scale: 0.97 }} onClick={runSim} disabled={targets.size === 0}
                                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold disabled:opacity-40">
                                  <Sword size={13} weight="duotone" />ابدأ المحاكاة
                                </motion.button>
                              )}
                            </div>
                          )}

                          {/* Simulating */}
                          {simulating && (
                            <div className="py-6 flex flex-col items-center gap-3">
                              <div className="relative w-12 h-12">
                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                  className={`absolute inset-0 rounded-full border-2 border-dashed ${isDark ? "border-amber-700/30" : "border-amber-300"}`} />
                                <div className={`absolute inset-2 rounded-full flex items-center justify-center ${isDark ? "bg-zinc-800" : "bg-amber-50"}`}>
                                  <Sword size={16} weight="duotone" className="text-amber-500" />
                                </div>
                              </div>
                              {["تحليل نقاط الضعف", "محاكاة دفوع الخصم", "أسئلة المحكمة", "ترتيب التحسينات"].map((s, i) => (
                                <motion.div key={s} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.55 }} className="flex items-center gap-2">
                                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><Spinner size={10} className="text-[#C8A762]" /></motion.div>
                                  <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{s}</p>
                                </motion.div>
                              ))}
                            </div>
                          )}

                          {/* Results */}
                          {simulated && !simulating && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                              {/* Summary bar */}
                              <div className={`flex items-center justify-between p-2.5 rounded-xl border ${isDark ? "border-amber-700/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
                                <div className="flex items-center gap-1.5">
                                  <WarningCircle size={13} weight="fill" className="text-amber-500" />
                                  <p className={`text-[11px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                                    {wargameFiltered.filter(p => p.severity === "critical").length} حرجة · {wargameFiltered.filter(p => p.severity === "medium").length} متوسطة · {wargameFiltered.filter(p => p.severity === "low").length} تحسين
                                  </p>
                                </div>
                              </div>

                              {/* Action legend */}
                              <div className="flex gap-3 flex-wrap px-0.5">
                                {([["Plus", "إضافة مباشرة", "text-emerald-500"], ["PencilSimple", "تعديل وإضافة", "text-[#C8A762]"], ["Trash", "تجاهل", "text-red-400"]] as const).map(([, label, color]) => (
                                  <span key={label} className={`text-[9px] font-bold ${color}`}>{label}</span>
                                ))}
                              </div>

                              {/* Wargame cards */}
                              {wargameFiltered.map(p => {
                                const sev = SEV_CONFIG[p.severity];
                                return (
                                  <ActionCard
                                    key={p.id}
                                    id={p.id}
                                    title={p.title}
                                    detail={p.detail}
                                    statusOrSeverity={p.severity}
                                    suggestion={p.response}
                                    badgeText={sev.label}
                                    tag={SRC_CONFIG[p.source].label}
                                    tagColor={isDark ? `border border-white/[0.08] ${SRC_CONFIG[p.source].color}` : `border border-slate-200 ${SRC_CONFIG[p.source].color}`}
                                    isDark={isDark}
                                    action={wargameActions[p.id] ?? null}
                                    onAction={a => setWargameActions(prev => ({ ...prev, [p.id]: a }))}
                                  />
                                );
                              })}

                              {/* Selected summary + Apply */}
                              {hasAnyApplied && !applied && (
                                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                  className={`p-3 rounded-2xl border-2 ${isDark ? "border-emerald-700/30 bg-emerald-900/8" : "border-emerald-200 bg-emerald-50"}`}>
                                  <div className="flex items-center gap-2 mb-2">
                                    <CheckFat size={13} weight="fill" className="text-emerald-500" />
                                    <p className={`text-[12px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>مختار للإضافة: {appliedIds.length} بند</p>
                                  </div>
                                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setApplied(true); setWargamePanelOpen(false); }}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold">
                                    <CheckFat size={12} weight="fill" />طبّق على المذكرة
                                  </motion.button>
                                </motion.div>
                              )}

                              {applied && (
                                <div className={`flex items-center justify-between p-2.5 rounded-xl border ${isDark ? "border-emerald-700/20 bg-emerald-900/8" : "border-emerald-200 bg-emerald-50"}`}>
                                  <div className="flex items-center gap-2">
                                    <CheckCircle size={13} weight="fill" className="text-emerald-500" />
                                    <p className={`text-[11px] font-semibold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>تم التطبيق</p>
                                  </div>
                                  <button onClick={() => setWargamePanelOpen(v => !v)}
                                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border ${isDark ? "border-white/[0.08] text-zinc-500" : "border-slate-200 text-slate-400"}`}>
                                    {wargamePanelOpen ? <><X size={9} />أخفِ</> : <><Eye size={9} />اعرض</>}
                                  </button>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* Polish/Apply panel */}
              {applied && appliedIds.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <div className={`rounded-2xl border-2 p-5 ${isDark ? "border-emerald-700/30 bg-emerald-900/8" : "border-emerald-200 bg-emerald-50/80"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-emerald-900/50" : "bg-emerald-100"}`}>
                        <CheckFat size={20} weight="fill" className="text-emerald-500" />
                      </div>
                      <div className="flex-1">
                        <p className={`text-[14px] font-bold ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>نقّح المذكرة بناءً على المحاكاة</p>
                        <p className={`text-[11px] mt-0.5 ${isDark ? "text-emerald-600" : "text-emerald-650"}`}>
                          تم اختيار {appliedIds.length} تحسين — راجع المذكرة أدناه ثم أقر أو عدّل قبل التنزيل
                        </p>
                      </div>
                    </div>
                  </div>
                  <AppliedMemoPreview isDark={isDark} applied={appliedIds} />
                </motion.div>
              )}

            </motion.div>
          )}
        </AnimatePresence>
      </BetaReviewGate>
    </motion.div>
  );
}
