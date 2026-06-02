"use client";

/**
 * نظامي عالمي — Global Legal Research ("Research-First, Database-Later")
 * ──────────────────────────────────────────────────────────────────────────
 * نموذج "Perplexity القانوني": يحدّد الولاية القضائية ← يبحث حياً في مصادر رسمية
 * ← يبني إجابة مهيكلة بمصادر مرقمة قابلة للنقر + مقياس ثقة أمين + مقارنة بالنظام
 * السعودي + إخلاء مسؤولية تلقائي + جسر تصعيد لمحامٍ محلي مرخّص.
 *
 * ما يميّزه عن LLM عام (ChatGPT/Claude/Gemini): تحديد دقيق للولاية والمناطق الحرة،
 * مصادر موثّقة بتواريخ تحقّق، صدق صريح حول الثقة، وتحويل فعلي لمحامٍ عند الحاجة.
 *
 * النطاق: Frontend + mock research engine (backend-ready). لا بحث إنترنت فعلي بعد.
 */

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/hooks/useUser";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, ArrowLeft, ArrowRight, PaperPlaneTilt,
  CheckCircle, Warning, CaretDown, Scales, ShieldCheck,
  Bank, Books, Scroll, Storefront, GraduationCap, Link as LinkIcon,
  ClockCounterClockwise, UserCircleCheck, Sparkle, Scan, Quotes,
  Check, Clock,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import Link from "next/link";
import {
  JURISDICTIONS, PILOT_JURISDICTION_IDS, SOURCE_TIER_META, READINESS_META,
  GLOBAL_DISCLAIMER_AR, getJurisdiction,
  type Jurisdiction, type SourceTier, type SubJurisdiction,
} from "@/constants/globalJurisdictions";

import {
  toAr,
  TODAY_AR,
  TIER_ICON,
  type Phase,
  type ConfidenceLevel,
  type ResearchResult,
  runResearch,
} from "./globalResearchHelper";

// ─── المكوّن ────────────────────────────────────────────────────────────────

export default function GlobalResearchPage() {
  const { isDark } = useTheme();
  const user = useUser();

  const [phase, setPhase] = useState<Phase>("jurisdiction");
  const [jurId, setJurId] = useState<string | null>(null);
  const [subId, setSubId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [openSrc, setOpenSrc] = useState<number | null>(1);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    if (user.isLoggedIn && user.country && user.country !== "SA") {
      const match = JURISDICTIONS.find(j => j.id.toLowerCase() === user.country?.toLowerCase());
      if (match) {
        setJurId(match.id);
        setPhase("query");
      }
    }
  }, [user.isLoggedIn, user.country]);

  const jur = jurId ? getJurisdiction(jurId) ?? null : null;
  const sub = jur?.subJurisdictions?.find((s) => s.id === subId) ?? null;
  const isLawyer = user.userType === "lawyer" || user.userType === "firm";

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl shadow-sm";
  const sub2 = isDark ? "text-zinc-500" : "text-zinc-400";
  const txt = isDark ? "text-zinc-200" : "text-zinc-700";

  const ordered = useMemo(
    () => [...JURISDICTIONS].sort((a, b) => {
      const pa = PILOT_JURISDICTION_IDS.includes(a.id) ? 0 : 1;
      const pb = PILOT_JURISDICTION_IDS.includes(b.id) ? 0 : 1;
      return pa - pb || a.phase - b.phase;
    }),
    []
  );

  async function research() {
    if (!jur || !query.trim()) return;
    setPhase("researching");
    setResult(null);
    setShowComparison(false);
    await new Promise((r) => setTimeout(r, 3200));
    const res = runResearch(jur, sub, query);
    setResult(res);
    setOpenSrc(res.sources[0]?.n ?? null);
    setPhase("result");
  }

  function reset() {
    setPhase("jurisdiction");
    setJurId(null); setSubId(null); setQuery(""); setResult(null);
    setShowComparison(false);
  }

  const STEPS: { id: Phase; label: string }[] = [
    { id: "jurisdiction", label: "الدولة" },
    { id: "query", label: "السؤال" },
    { id: "result", label: "النتيجة" },
  ];
  const stepIdx = STEPS.findIndex((s) => s.id === phase || (phase === "researching" && s.id === "result"));

  // مقياس الثقة
  const confMeta = (lvl: ConfidenceLevel) =>
    lvl === "high" ? { ar: "ثقة عالية", color: "#10b981" }
    : lvl === "medium" ? { ar: "ثقة متوسطة", color: "#C8A762" }
    : { ar: "ثقة منخفضة", color: "#ef4444" };

  return (
    <div className={`max-w-2xl mx-auto p-5 md:p-8 space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <div className="w-8 h-8 rounded-xl bg-[#0B3D2E]/10 flex items-center justify-center">
            <Globe size={18} weight="duotone" style={{ color: "#0B3D2E" }} className="dark:hidden" />
            <Globe size={18} weight="duotone" className="hidden dark:block text-[#C8A762]" />
          </div>
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>نظامي عالمي</h1>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#C8A762]/15 text-[#C8A762] border border-[#C8A762]/30">
            بحث حي · متعدد الدول
          </span>
        </div>
        <p className={`text-[13px] ${sub2}`}>
          اسأل عن قانون أي دولة — نبحث حياً في المصادر الرسمية، نوثّق كل معلومة، ونصارحك بمستوى الثقة.
        </p>
      </div>

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <button
              onClick={() => { if (i < stepIdx) { if (s.id === "jurisdiction") reset(); else setPhase(s.id); } }}
              className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all ${
                s.id === phase || (phase === "researching" && s.id === "result")
                  ? "bg-[#0B3D2E] text-white"
                  : i < stepIdx
                  ? isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700"
                  : isDark ? "text-zinc-700" : "text-zinc-300"
              }`}
            >
              <span className="w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-mono font-black">
                {toAr(i + 1)}
              </span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && <ArrowLeft size={10} className={isDark ? "text-zinc-700" : "text-zinc-300"} />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ════════════ STEP 1 — Jurisdiction ════════════ */}
        {phase === "jurisdiction" && (
          <motion.div key="jur" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
            <p className={`text-[11px] font-black uppercase tracking-widest px-1 ${sub2}`}>اختر الدولة</p>

            <div className="grid grid-cols-2 gap-2.5">
              {ordered.map((j) => {
                const isActive = jurId === j.id;
                const rm = READINESS_META[j.readiness];
                const pilot = PILOT_JURISDICTION_IDS.includes(j.id);
                return (
                  <motion.button
                    key={j.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                    onClick={() => { setJurId(j.id); setSubId(null); }}
                    className={`text-right p-3 rounded-2xl border transition-all ${
                      isActive
                        ? "border-[#0B3D2E] bg-[#0B3D2E]/[0.06] dark:border-[#C8A762]/50 dark:bg-[#C8A762]/[0.07]"
                        : isDark ? "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.12]" : "border-zinc-200 bg-white hover:border-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-black font-mono px-1.5 py-0.5 rounded-md ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-zinc-100 text-zinc-600"}`}>{j.code}</span>
                      <span className={`text-[12px] font-bold flex-1 truncate ${isActive ? "text-[#0B3D2E] dark:text-[#C8A762]" : txt}`}>{j.nameAr}</span>
                      {isActive && <CheckCircle size={14} weight="fill" className="text-[#0B3D2E] dark:text-[#C8A762] flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: rm.color + "1a", color: rm.color }}>{rm.labelAr}</span>
                      {pilot && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-600"}`}>متاح الآن</span>}
                      {j.referralAvailable && <span className={`text-[9px] ${sub2} flex items-center gap-0.5`}><UserCircleCheck size={10} /> محامون شركاء</span>}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Sub-jurisdiction picker */}
            <AnimatePresence>
              {jur?.subJurisdictions && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={`${card} p-4 space-y-3`}>
                  <div className="flex items-start gap-2">
                    <Warning size={14} weight="fill" className="text-[#C8A762] mt-0.5 flex-shrink-0" />
                    <p className={`text-[12px] ${txt}`}>
                      <b>{jur.nameAr}</b> فيها أنظمة قضائية متعددة — حدِّد النطاق بدقّة (هذا ما تخطئ فيه أدوات الذكاء العامة).
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {jur.subJurisdictions.map((s) => {
                      const on = subId === s.id;
                      return (
                        <button key={s.id} onClick={() => setSubId(s.id)}
                          className={`text-right px-3 py-2 rounded-xl border text-[11px] font-bold transition-all ${
                            on ? "border-[#0B3D2E] bg-[#0B3D2E]/[0.06] text-[#0B3D2E] dark:border-[#C8A762]/50 dark:bg-[#C8A762]/[0.07] dark:text-[#C8A762]"
                               : isDark ? "border-white/[0.07] text-zinc-400" : "border-zinc-200 text-zinc-600"
                          }`}>
                          <div className="flex items-center gap-1">{s.isCommonLaw && <Scales size={11} />}{s.nameAr}</div>
                          {s.noteAr && <span className={`block text-[9px] font-normal mt-0.5 ${sub2}`}>{s.noteAr}</span>}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              onClick={() => setPhase("query")}
              disabled={!jur || (!!jur.subJurisdictions && !subId)}
              className="w-full py-3 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2 bg-[#0B3D2E] text-[#C8A762] disabled:opacity-40">
              متابعة {jur ? `— ${sub ? sub.nameAr : jur.nameAr}` : ""}
              <ArrowLeft size={14} />
            </motion.button>
          </motion.div>
        )}

        {/* ════════════ STEP 2 — Query ════════════ */}
        {phase === "query" && jur && (
          <motion.div key="q" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold ${isDark ? "border-white/[0.07] text-zinc-300" : "border-zinc-200 text-zinc-600"}`}>
                <span className="font-mono">{jur.code}</span> {sub ? sub.nameAr : jur.nameAr}
                <button onClick={() => setPhase("jurisdiction")} className="mr-1 opacity-60 hover:opacity-100"><ArrowRight size={10} /></button>
              </div>
            </div>

            <div className={`${card} p-4 space-y-3`}>
              <textarea autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); research(); } }}
                placeholder={`اكتب سؤالك القانوني عن ${jur.nameAr}…`} rows={4}
                className={`w-full bg-transparent text-[14px] outline-none resize-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-zinc-400"}`} />
              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9" }}>
                <span className={`text-[10px] ${isDark ? "text-zinc-700" : "text-zinc-300"}`}>Enter للبحث · Shift+Enter لسطر جديد</span>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={research} disabled={!query.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] disabled:opacity-40">
                  <PaperPlaneTilt size={13} weight="fill" /> ابحث حياً
                </motion.button>
              </div>
            </div>

            <div>
              <p className={`text-[11px] font-black uppercase tracking-wider mb-2 ${sub2}`}>أسئلة مقترحة</p>
              <div className="flex flex-col gap-2">
                {jur.exampleQuestions.map((eq) => (
                  <button key={eq} onClick={() => { setQuery(eq); }}
                    className={`text-right text-[12px] px-3 py-2 rounded-xl border transition-all ${isDark ? "border-white/[0.07] text-zinc-400 hover:border-[#C8A762]/30" : "border-zinc-200 text-zinc-600 hover:border-[#0B3D2E]/30"}`}>
                    {eq}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ════════════ Researching ════════════ */}
        {phase === "researching" && jur && (
          <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-6 space-y-4`}>
            <div className="flex items-center gap-3">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}>
                <Globe size={22} weight="duotone" className="text-[#C8A762]" />
              </motion.div>
              <div>
                <p className={`text-[14px] font-bold ${txt}`}>نبحث حياً في مصادر {sub ? sub.nameAr : jur.nameAr}…</p>
                <p className={`text-[11px] mt-0.5 ${sub2}`}>نرتّب المصادر حسب مصداقيتها ونوثّق كل ادعاء</p>
              </div>
            </div>
            <div className="space-y-2 pr-1">
              {["تحديد الولاية القضائية المنطبقة", "البحث في المصادر الحكومية الرسمية", "ترتيب المصادر حسب طبقة الثقة", "التحقق من حداثة النصوص", "حساب مستوى الثقة في الإجابة"].map((step, i) => (
                <motion.div key={step} initial={{ opacity: 0.25 }} animate={{ opacity: [0.25, 1, 0.5] }} transition={{ duration: 1.6, delay: i * 0.55, repeat: Infinity, repeatDelay: 1 }} className="flex items-center gap-2">
                  <Scan size={12} className="text-[#C8A762]" />
                  <span className={`text-[12px] ${sub2}`}>{step}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ════════════ STEP 3 — Result ════════════ */}
        {phase === "result" && jur && result && (
          <BetaReviewGate toolId="global.result" toolName="نتيجة نظامي عالمي" reviewScope="legal-data">
            <motion.div key="res" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

              {/* Meta strip */}
              <div className={`${card} p-4`}>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black font-mono px-1.5 py-0.5 rounded-md bg-[#0B3D2E] text-[#C8A762]">{jur.code}</span>
                    <span className={`text-[12px] font-bold ${txt}`}>{sub ? `${jur.nameAr} — ${sub.nameAr}` : jur.nameAr}</span>
                  </div>
                  <span className={`text-[10px] flex items-center gap-1 ${sub2}`}><ClockCounterClockwise size={11} /> تاريخ البحث: {TODAY_AR}</span>
                </div>

                {/* Confidence meter */}
                {(() => {
                  const m = confMeta(result.level);
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[11px] font-bold flex items-center gap-1`} style={{ color: m.color }}><ShieldCheck size={13} weight="fill" /> {m.ar}</span>
                        <span className="text-[12px] font-mono font-black" style={{ color: m.color }}>{toAr(result.score)}٪</span>
                      </div>
                      <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${result.score}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ backgroundColor: m.color }} />
                      </div>
                      <p className={`text-[10px] mt-1.5 ${sub2}`}>
                        {result.level === "high" ? "إجابة موثّقة بمصادر رسمية — تبقى للاطلاع وليست بديلاً عن محامٍ."
                          : result.level === "medium" ? "إجابة توجيهية تحتاج تأكيد التفاصيل الخاصة بحالتك."
                          : "ثقة منخفضة — هذا النوع من الأسئلة يتطلب محامياً مرخصاً محلياً."}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Escalation card (low confidence) — الميزة الأهم: الصدق + الجسر البشري */}
              {result.escalate && (
                <div className={`rounded-2xl p-5 border ${isDark ? "border-red-900/40 bg-red-950/20" : "border-red-200 bg-red-50"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Warning size={18} weight="fill" className="text-red-500" />
                    <p className={`text-[14px] font-bold ${isDark ? "text-red-300" : "text-red-700"}`}>هذا السؤال يحتاج محامياً مرخصاً</p>
                  </div>
                  <p className={`text-[13px] leading-relaxed mb-3 ${txt}`}>{result.summaryAr}</p>
                  {result.escalateReasons && (
                    <ul className="space-y-1.5 mb-4">
                      {result.escalateReasons.map((r) => (
                        <li key={r} className={`text-[12px] flex items-start gap-1.5 ${sub2}`}><span className="text-red-500 mt-1">•</span> {r}</li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Link href="/marketplace" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762]">
                      <UserCircleCheck size={14} weight="fill" />
                      {jur.referralAvailable ? `تواصل مع محامٍ شريك في ${jur.nameAr}` : "اطلب محامياً عبر السوق القانوني"}
                    </Link>
                    <span className={`text-[10px] self-center ${sub2}`}>{jur.referralAvailable ? "شبكة شركاء مرخّصين" : "إحالة عبر منصة نظامي"}</span>
                  </div>
                </div>
              )}

              {/* Answer + claims (medium/high) */}
              {!result.escalate && (
                <div className={`${card} p-6 space-y-6`}>
                  {/* Analytical Summary / Overarching Response */}
                  {result.summaryAr && (
                    <div className={`p-4 rounded-2xl border-2 border-dashed ${isDark ? "border-[#C8A762]/35 bg-[#C8A762]/[0.03]" : "border-[#0B3D2E]/20 bg-[#0B3D2E]/[0.02]"} space-y-2`}>
                      <div className="flex items-center gap-2">
                        <Sparkle size={18} weight="duotone" className="text-[#0B3D2E] dark:text-[#C8A762]" />
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B3D2E] dark:text-[#C8A762]">الخلاصة التحليلية الشاملة</span>
                      </div>
                      <p className={`text-[13.5px] leading-relaxed font-bold ${txt}`}>{result.summaryAr}</p>
                    </div>
                  )}

                  {/* Direct Answer Paragraph Panel */}
                  {result.directAnswer && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-zinc-500">
                        <Sparkle size={18} weight="duotone" className="text-[#C8A762]" />
                        <span className="text-[11px] font-extrabold uppercase tracking-wider">التشخيص القانوني المباشر</span>
                      </div>
                      <p className={`text-[14px] leading-relaxed font-semibold ${txt}`}>{result.directAnswer}</p>
                    </div>
                  )}

                  {/* Summary / Claims Checklist */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-zinc-500">
                      <CheckCircle size={18} weight="duotone" className="text-emerald-500" />
                      <span className="text-[11px] font-extrabold uppercase tracking-wider">موجز استخلاص الادعاءات</span>
                    </div>
                    <div className="space-y-2.5">
                      {result.claims.map((c, i) => (
                        <div key={i} className={`flex items-start gap-2.5 p-3.5 rounded-2xl ${isDark ? "bg-white/[0.02]" : "bg-zinc-50 border border-zinc-100"}`}>
                          <span className={`text-[10px] font-mono font-black w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-white text-zinc-600 border border-zinc-200"}`}>{toAr(i + 1)}</span>
                          <p className={`text-[13px] leading-relaxed flex-1 ${txt}`}>
                            {c.textAr}
                            {c.refs.map((r) => (
                              <button key={r} onClick={() => setOpenSrc(r)} className="inline-flex items-center justify-center align-super text-[9px] font-mono font-black w-4 h-4 rounded mr-0.5 bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/15 dark:text-[#C8A762]">{toAr(r)}</button>
                            ))}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Saudi Law Comparison (المقارنة بالنظام السعودي) — للشركاء المحامين فقط بطلب صريح */}
                  {isLawyer && result.comparison && (
                    <div className="space-y-4 pt-4 border-t border-zinc-200/5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-zinc-500">
                          <Scales size={18} weight="duotone" className="text-[#C8A762]" />
                          <span className="text-[11px] font-extrabold uppercase tracking-wider">التحليل المقارن (للشريك القانوني)</span>
                        </div>
                        <span className="text-[9.5px] px-2 py-0.5 rounded-full font-black bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          ميزة حصرية للمحامين
                        </span>
                      </div>

                      {!showComparison ? (
                        <motion.button
                          whileHover={{ scale: 1.01, backgroundColor: isDark ? "rgba(200, 167, 98, 0.04)" : "rgba(11, 61, 46, 0.02)" }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setShowComparison(true)}
                          className={`w-full py-4 px-5 rounded-2xl border-2 border-dashed flex items-center justify-between text-right transition-all ${
                            isDark 
                              ? "border-[#C8A762]/30 bg-[#C8A762]/[0.02] text-[#C8A762]" 
                              : "border-[#0B3D2E]/20 bg-[#0B3D2E]/[0.01] text-[#0B3D2E]"
                          }`}
                        >
                          <div className="space-y-1">
                            <p className="text-[13px] font-black">أجرِ مقارنة تحليلية فورية بالأنظمة السعودية المقابلة</p>
                            <p className={`text-[10px] ${sub2}`}>يقوم المحرك الآن بتحليل الفروق الجوهرية والضمانات بين الولايتين قضائياً.</p>
                          </div>
                          <div className={`p-2.5 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isDark ? "bg-[#C8A762]/10" : "bg-[#0B3D2E]/10"
                          }`}>
                            <ArrowLeft size={16} className="transform rotate-180" />
                          </div>
                        </motion.button>
                      ) : (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }} 
                          animate={{ opacity: 1, height: "auto" }}
                          className="space-y-4"
                        >
                          <div className={`overflow-hidden rounded-2xl border ${isDark ? "border-white/[0.05] bg-white/[0.01]" : "border-zinc-200 bg-zinc-50/50"}`}>
                            <div className={`p-4 border-b flex items-center justify-between flex-wrap gap-2 ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-zinc-200 bg-zinc-100/40"}`}>
                              <div>
                                <h4 className="text-[13px] font-extrabold text-[#0B3D2E] dark:text-[#C8A762] leading-tight">
                                  {result.comparison.titleAr}
                                </h4>
                                <p className={`text-[10px] mt-1 ${sub2}`}>
                                  تحليل مقارن للمراكز القانونية والضمانات بين الولايتين القضائيتين لتسهيل فهم الفروقات الجوهرية.
                                </p>
                              </div>
                              <button 
                                onClick={() => setShowComparison(false)}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                                  isDark ? "border-white/10 hover:bg-white/5" : "border-zinc-200 hover:bg-zinc-100"
                                }`}
                              >
                                إخفاء المقارنة
                              </button>
                            </div>

                            <div className="divide-y divide-zinc-200/10 dark:divide-white/[0.04]">
                              {/* Table Headers */}
                              <div className={`grid grid-cols-12 gap-3 p-3 text-[10px] font-black text-zinc-400 dark:text-zinc-500 bg-white/20 dark:bg-black/10`}>
                                <div className="col-span-3 text-right">المحور / الجانب</div>
                                <div className="col-span-4 text-right">النظام الأجنبي / المحلي</div>
                                <div className="col-span-5 text-right text-emerald-600 dark:text-emerald-400 font-extrabold">النظام السعودي المقابل</div>
                              </div>

                              {/* Table Rows */}
                              {result.comparison.rows.map((row, idx) => (
                                <motion.div
                                  key={idx}
                                  whileHover={{ backgroundColor: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(11, 61, 46, 0.01)" }}
                                  className="grid grid-cols-12 gap-3 p-4 items-start transition-colors"
                                >
                                  {/* Aspect/Topic */}
                                  <div className="col-span-3 text-[12px] font-extrabold text-[#0B3D2E] dark:text-white leading-tight">
                                    {row.topicAr}
                                  </div>

                                  {/* Foreign/Target Jurisdiction */}
                                  <div className={`col-span-4 text-[11.5px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                                    {row.foreignAr}
                                  </div>

                                  {/* Saudi Jurisdiction (Highlighted Premium Style) */}
                                  <div className={`col-span-5 text-[11.5px] leading-relaxed p-2.5 rounded-xl border ${
                                    isDark 
                                      ? "bg-[#0B3D2E]/10 border-[#C8A762]/20 text-zinc-200" 
                                      : "bg-emerald-500/[0.04] border-[#0B3D2E]/10 text-zinc-700"
                                  }`}>
                                    <div className="flex items-center gap-1 mb-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                      <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">حماية وطنية مقابل</span>
                                    </div>
                                    {row.saudiAr}
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}

                  {/* Glassmorphic Law Cards Map */}
                  {result.statutes && (
                    <div className="space-y-3 pt-4 border-t border-zinc-200/5">
                      <div className="flex items-center gap-2 text-zinc-500">
                        <Scales size={18} weight="duotone" className="text-[#C8A762]" />
                        <span className="text-[11px] font-extrabold uppercase tracking-wider">السندات والمواد النظامية المعول عليها</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2.5">
                        {result.statutes.map((s, idx) => (
                          <div key={idx} className={`p-4 rounded-2xl border ${isDark ? "bg-white/[0.01] border-white/5" : "bg-zinc-50 border-zinc-200/80"}`}>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <h4 className="text-[12px] font-black text-emerald-500">{s.title}</h4>
                              <span className="text-[9px] font-black text-[#C8A762] bg-[#C8A762]/5 px-2 py-0.5 rounded-md">{s.subtitle}</span>
                            </div>
                            <p className={`text-[11.5px] leading-relaxed mt-2.5 pt-2 border-t ${isDark ? "border-white/[0.04] text-zinc-400" : "border-zinc-200/60 text-zinc-600"}`}>{s.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Interactive timeline roadmap */}
                  {result.roadmap && (
                    <div className="space-y-3 pt-4 border-t border-zinc-200/5">
                      <div className="flex items-center gap-2 text-zinc-500">
                        <Clock size={18} weight="duotone" className="text-emerald-500" />
                        <span className="text-[11px] font-extrabold uppercase tracking-wider">خطة العمل والخطوات النظامية المقترحة</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {result.roadmap.map((act) => (
                          <div key={act.step} className={`p-4 rounded-2xl border flex flex-col justify-between ${isDark ? "border-white/5 bg-zinc-900" : "border-zinc-200 bg-zinc-50"}`}>
                            <div>
                              <span className="text-[10px] font-black text-[#C8A762] bg-[#C8A762]/10 px-2 py-0.5 rounded-full">الخطوة {toAr(act.step)}</span>
                              <h5 className="text-[12px] font-black leading-tight mt-2">{act.title}</h5>
                              <p className={`text-[10.5px] mt-1.5 leading-normal ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{act.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={`pt-3 border-t ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`}>
                    <AiResultActions text={result.directAnswer || result.summaryAr} filename={`nzamy-global-${jur.id}`} showVault className="justify-start" />
                  </div>
                </div>
              )}

              {/* Sources — كل ادعاء له مصدر قابل للنقر بتاريخ تحقق */}
              <div>
                <p className={`text-[11px] font-black uppercase tracking-widest mb-2 px-1 ${sub2}`}>المصادر ({toAr(result.sources.length)}) — انقر للاطّلاع على النص</p>
                <div className="space-y-2">
                  {result.sources.map((s) => {
                    const tm = SOURCE_TIER_META[s.tier];
                    const TIcon = TIER_ICON[s.tier];
                    const open = openSrc === s.n;
                    return (
                      <div key={s.n} className={`${card} overflow-hidden`}>
                        <button onClick={() => setOpenSrc(open ? null : s.n)} className="w-full flex items-center gap-3 p-4 text-right">
                          <span className="text-[10px] font-mono font-black w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-[#C8A762]/15 dark:text-[#C8A762]">{toAr(s.n)}</span>
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: tm.color + "18" }}>
                            <TIcon size={13} weight="duotone" style={{ color: tm.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[12px] font-bold truncate ${txt}`}>{s.nameAr}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: tm.color + "18", color: tm.color }}>{tm.labelAr}</span>
                              <span className={`text-[9px] font-mono ${sub2}`}>{s.domain}</span>
                              {s.stale && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 flex items-center gap-0.5"><Warning size={9} weight="fill" /> تحقّق من الحداثة</span>}
                            </div>
                          </div>
                          <motion.div animate={{ rotate: open ? 180 : 0 }}><CaretDown size={12} className={sub2} /></motion.div>
                        </button>
                        <AnimatePresence>
                          {open && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                              <div className={`px-4 pb-4 border-t ${isDark ? "border-white/[0.04]" : "border-zinc-100"}`}>
                                <div className="flex items-start gap-2 pt-3">
                                  <Quotes size={13} className="text-[#C8A762] mt-0.5 flex-shrink-0" weight="fill" />
                                  <p className={`text-[12px] leading-relaxed ${sub2}`}>{s.excerptAr}</p>
                                </div>
                                <div className="flex items-center justify-between mt-3">
                                  <span className={`text-[10px] flex items-center gap-1 ${sub2}`}><ClockCounterClockwise size={10} /> تم التحقق: {TODAY_AR}</span>
                                  <a href={`https://${s.domain}`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold flex items-center gap-1 text-[#0B3D2E] dark:text-[#C8A762]">فتح المصدر <LinkIcon size={11} /></a>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>



              {/* What we cannot confirm — honesty section */}
              {result.cannotConfirm.length > 0 && (
                <div className={`rounded-2xl p-4 border ${isDark ? "border-amber-900/30 bg-amber-950/10" : "border-amber-100 bg-amber-50/60"}`}>
                  <p className={`text-[12px] font-bold mb-2 flex items-center gap-1.5 ${isDark ? "text-amber-300" : "text-amber-700"}`}><Warning size={13} weight="fill" /> ما لا نستطيع تأكيده</p>
                  <ul className="space-y-1">
                    {result.cannotConfirm.map((c) => (
                      <li key={c} className={`text-[11px] flex items-start gap-1.5 ${sub2}`}><span className="text-amber-500 mt-0.5">−</span> {c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Continuity actions */}
              {!result.escalate && (
                <div className={`${card} p-4`}>
                  <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${sub2}`}>الخطوة التالية</p>
                  <div className="flex flex-wrap gap-2">
                    {jur.referralAvailable && (
                      <Link href="/marketplace" className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl bg-[#0B3D2E] text-[#C8A762]">
                        <UserCircleCheck size={12} weight="fill" /> محامٍ في {jur.nameAr}
                      </Link>
                    )}
                    {[
                      { href: "/ai/contract-drafter", label: "صياغة عقد", icon: Sparkle },
                      { href: "/ai/compare", label: "مقارنة أنظمة", icon: Scales },
                    ].map((it) => {
                      const I = it.icon;
                      return (
                        <Link key={it.href} href={it.href}
                          className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-all ${isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-200" : "border-zinc-200 text-zinc-600 hover:text-zinc-800"}`}>
                          <I size={12} /> {it.label} <ArrowLeft size={10} />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Auto disclaimer */}
              <div className={`rounded-2xl p-4 border-2 border-dashed ${isDark ? "border-white/[0.08] bg-white/[0.01]" : "border-zinc-200 bg-zinc-50/50"}`}>
                <p className={`text-[11px] font-bold mb-1.5 flex items-center gap-1.5 ${txt}`}><ShieldCheck size={13} weight="fill" className="text-[#C8A762]" /> إخلاء مسؤولية</p>
                <p className={`text-[11px] leading-relaxed ${sub2}`}>{jur.disclaimerAr}</p>
                <p className={`text-[10px] leading-relaxed mt-2 pt-2 border-t ${sub2} ${isDark ? "border-white/[0.05]" : "border-zinc-200"}`}>{GLOBAL_DISCLAIMER_AR}</p>
              </div>

              <button onClick={reset} className={`w-full py-3 rounded-2xl border text-[13px] font-medium transition-colors ${isDark ? "border-white/[0.07] text-zinc-400 hover:bg-white/[0.04]" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}>
                بحث جديد
              </button>
            </motion.div>
          </BetaReviewGate>
        )}
      </AnimatePresence>
    </div>
  );
}
