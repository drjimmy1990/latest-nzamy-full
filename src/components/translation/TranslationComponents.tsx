import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Translate, CheckCircle, Spinner, ShareNetwork, DownloadSimple, Check,
  X, Copy, BookOpen, ArrowsLeftRight, MagnifyingGlass, Warning, CaretDown
} from "@phosphor-icons/react";
import Link from "next/link";
import AiResultActions from "@/components/AiResultActions";
import {
  LANGS,
  PROCESSING_STEPS,
  MOCK_TRANSLATED_EN,
  MOCK_DISPUTED,
  MOCK_GLOSSARY_EN,
  MOCK_ORIGINAL,
  type LangCode,
  type DisputedClause,
} from "@/constants/translationData";

// ─── Processing animation ──────────────────────────────────────────────────────
export function ProcessingView({ isDark }: { isDark: boolean }) {
  const [step, setStep] = useState(0);

  // Auto-advance steps
  useEffect(() => {
    let curr = 0;
    const run = () => {
      if (curr >= PROCESSING_STEPS.length) return;
      setTimeout(() => {
        setStep(curr + 1);
        curr++;
        run();
      }, PROCESSING_STEPS[curr]?.duration ?? 800);
    };
    run();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="py-12 flex flex-col items-center gap-8"
    >
      {/* Globe animation */}
      <div className="relative w-20 h-20">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="w-20 h-20 rounded-full border-2 border-dashed border-[#C8A762]/30 flex items-center justify-center"
        >
          <div className="w-14 h-14 rounded-full bg-[#0B3D2E]/20 border border-[#0B3D2E]/40 flex items-center justify-center">
            <Translate size={24} weight="duotone" className="text-[#C8A762]" />
          </div>
        </motion.div>
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border border-[#C8A762]/10"
        />
      </div>

      <div className="text-center">
        <p className={`text-[15px] font-bold mb-1 ${isDark ? "text-white" : "text-zinc-800"}`}>
          جارٍ الترجمة القانونية...
        </p>
        <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          يتم تحليل المصطلحات والسياق القانوني
        </p>
      </div>

      {/* Steps */}
      <div className="w-full max-w-sm space-y-2">
        {PROCESSING_STEPS.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: i <= step ? 1 : 0.25, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-center gap-3"
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
              i < step ? "bg-emerald-500" : i === step ? "bg-[#C8A762]/20 border border-[#C8A762]/40" : isDark ? "bg-zinc-800" : "bg-slate-100"
            }`}>
              {i < step
                ? <CheckCircle size={12} weight="fill" className="text-white" />
                : i === step
                  ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                      <Spinner size={10} className="text-[#C8A762]" />
                    </motion.div>
                  : <span className={`text-[9px] font-bold ${isDark ? "text-zinc-700" : "text-slate-400"}`}>{i + 1}</span>
              }
            </div>
            <p className={`text-[12px] ${i < step ? "text-emerald-500" : i === step ? isDark ? "text-zinc-200 font-semibold" : "text-zinc-700 font-semibold" : isDark ? "text-zinc-700" : "text-slate-400"}`}>
              {s.label}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Result view ───────────────────────────────────────────────────────────────
export function ResultView({
  sourceLang, targetLang, text, isDark,
}: {
  sourceLang: LangCode;
  targetLang: LangCode;
  text: string;
  isDark: boolean;
}) {
  const [copiedOrig,   setCopiedOrig]   = useState(false);
  const [copiedTrans,  setCopiedTrans]  = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [shared,       setShared]       = useState(false);

  const [translatedText, setTranslatedText] = useState(MOCK_TRANSLATED_EN);
  const [disputedClauses, setDisputedClauses] = useState(MOCK_DISPUTED);
  const [showClausePanel, setShowClausePanel] = useState(false);
  const [activeClause, setActiveClause] = useState<number | null>(null);

  const srcLang = LANGS.find(l => l.code === sourceLang)!;
  const tgtLang = LANGS.find(l => l.code === targetLang)!;

  const handleReplace = (id: number) => {
     const clause = disputedClauses.find(c => c.id === id);
     if (!clause) return;
     setTranslatedText(prev => prev.replace(clause.original, clause.suggested));
     setDisputedClauses(prev => prev.map(c => c.id === id ? { ...c, replaced: true } : c));
     setActiveClause(null);
  };

  const renderHighlightedText = () => {
    let parts = [{ text: translatedText, isDisputed: false, clause: null as DisputedClause | null }];

    disputedClauses.forEach(clause => {
      if (clause.replaced) return;
      const newParts: typeof parts = [];
      parts.forEach(part => {
        if (part.isDisputed) {
          newParts.push(part);
          return;
        }
        const splitted = part.text.split(clause.original);
        splitted.forEach((s, i) => {
          newParts.push({ text: s, isDisputed: false, clause: null });
          if (i < splitted.length - 1) {
            newParts.push({ text: clause.original, isDisputed: true, clause: clause });
          }
        });
      });
      parts = newParts;
    });

    return parts.map((part, i) => {
      if (part.isDisputed && part.clause) {
         return (
           <span key={i} className="relative inline-block">
             <mark 
               onClick={(e) => { e.stopPropagation(); setActiveClause(part.clause!.id); }}
               className="bg-[#F59E0B]/20 text-inherit underline decoration-wavy decoration-[#F59E0B] cursor-pointer rounded-sm"
             >
               {part.text}
             </mark>
             <AnimatePresence>
               {activeClause === part.clause.id && (
                 <motion.div 
                   initial={{ opacity: 0, y: 5 }} 
                   animate={{ opacity: 1, y: 0 }} 
                   exit={{ opacity: 0 }}
                   className={`absolute z-50 ${srcLang.dir === 'rtl' ? 'start-0' : 'end-0 lg:start-0 lg:end-auto'} top-full mt-2 w-72 p-4 rounded-xl border shadow-xl ${isDark ? "bg-zinc-800 border-white/[0.08]" : "bg-white border-slate-200"}`} onClick={(e) => e.stopPropagation()}>
                   <div className="flex justify-between items-center mb-3">
                     <p className={`font-black text-[14px] ${isDark ? "text-white" : "text-zinc-800"}`} dir="ltr">{part.text}</p>
                     <button onClick={() => setActiveClause(null)} className="opacity-50 hover:opacity-100"><X size={12} /></button>
                   </div>
                   <div className="space-y-2 mb-4">
                     <div className="flex justify-between text-[11px] pb-2 border-b border-white/[0.05]">
                       <span className={isDark ? "text-zinc-400" : "text-slate-500"}>التفسير الأوسع:</span>
                       <span className={`font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{part.clause.broadInterpretation}</span>
                     </div>
                     <div className="flex justify-between text-[11px] pb-2 border-b border-white/[0.05]">
                       <span className={isDark ? "text-zinc-400" : "text-slate-500"}>التفسير الأضيق:</span>
                       <span className={`font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{part.clause.narrowInterpretation}</span>
                     </div>
                     <div className="flex justify-between text-[11px]">
                       <span className={isDark ? "text-zinc-400" : "text-slate-500"}>البديل المقترح:</span>
                       <span className="text-emerald-500 font-bold">{part.clause.suggested}</span>
                     </div>
                   </div>
                   <button onClick={() => handleReplace(part.clause!.id)} className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-colors ${isDark ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}>
                     <CheckCircle size={14} weight="fill" /> استبدل بالبديل
                   </button>
                 </motion.div>
               )}
             </AnimatePresence>
           </span>
         );
      }
      return <span key={i}>{part.text}</span>;
    });
  };

  useEffect(() => {
    const handleClickOutside = () => setActiveClause(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  function copy(str: string, done: (v: boolean) => void) {
    navigator.clipboard.writeText(str).then(() => { done(true); setTimeout(() => done(false), 2000); });
  }

  function share() {
    const obj = { title: "ترجمة قانونية — نظامي", text: MOCK_TRANSLATED_EN, url: typeof window !== "undefined" ? window.location.href : "" };
    if (navigator.share) navigator.share(obj).catch(() => {});
    else navigator.clipboard.writeText(typeof window !== "undefined" ? window.location.href : "");
    setShared(true); setTimeout(() => setShared(false), 2000);
  }

  function downloadTxt(content: string, name: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  const card   = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70" : "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const badge  = "text-[10px] font-bold px-2 py-0.5 rounded-full border";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      {/* Action bar */}
      <div className={`flex flex-wrap items-center gap-2 p-3 rounded-2xl border ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
        <div className="flex items-center gap-1.5 flex-1">
          <Translate size={13} weight="fill" className="text-[#C8A762]" />
          <p className={`text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            الترجمة جاهزة · {srcLang.label} → {tgtLang.label}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={share}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300 hover:text-white" : "border-slate-200 bg-white text-zinc-600 hover:text-zinc-800"}`}>
            {shared ? <Check size={12} className="text-emerald-500" /> : <ShareNetwork size={12} />}
            {shared ? "تم!" : "مشاركة"}
          </button>
          <button onClick={() => downloadTxt(MOCK_TRANSLATED_EN, "nezamy-translation.txt")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300 hover:text-white" : "border-slate-200 bg-white text-zinc-600 hover:text-zinc-800"}`}>
            <DownloadSimple size={12} /> تحميل
          </button>
        </div>
      </div>

      {/* Unified Result Actions */}
      <AiResultActions
        text={translatedText}
        filename="legal-translation"
        showVault
        showHumanReview
        showShare
        className="justify-start"
      />

      {/* Side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Original */}
        <div className={`${card} flex flex-col`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
                {srcLang.code.toUpperCase()}
              </div>
              <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>النص الأصلي</p>
              <span className={`${badge} ${isDark ? "border-white/[0.08] text-zinc-500 bg-transparent" : "border-slate-200 text-slate-500"}`}>{srcLang.label}</span>
            </div>
            <button onClick={() => copy(MOCK_ORIGINAL, setCopiedOrig)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-400 hover:text-slate-600"}`}>
              {copiedOrig ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
              {copiedOrig ? "تم" : "نسخ"}
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[420px]">
            <p className={`text-[12px] leading-loose whitespace-pre-wrap ${isDark ? "text-zinc-400" : "text-slate-600"}`} dir={srcLang.dir}>
              {MOCK_ORIGINAL}
            </p>
          </div>
        </div>

        {/* Translation */}
        <div className={`${card} flex flex-col border-2 ${isDark ? "border-[#C8A762]/20" : "border-[#C8A762]/30"}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-[#C8A762]/10" : "border-[#C8A762]/20"}`}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black bg-[#C8A762]/15 text-[#C8A762]">
                {tgtLang.code.toUpperCase()}
              </div>
              <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>الترجمة</p>
              <span className={`${badge} border-[#C8A762]/30 text-[#C8A762] bg-[#C8A762]/8`}>{tgtLang.label}</span>
            </div>
            <button onClick={() => copy(MOCK_TRANSLATED_EN, setCopiedTrans)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${isDark ? "border-[#C8A762]/20 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-[#C8A762]/40 text-[#C8A762] hover:bg-[#C8A762]/5"}`}>
              {copiedTrans ? <Check size={10} /> : <Copy size={10} />}
              {copiedTrans ? "تم" : "نسخ"}
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[420px]">
            <div className={`text-[12px] leading-loose whitespace-pre-wrap ${isDark ? "text-zinc-300" : "text-zinc-700"}`} dir={tgtLang.dir}>
              {renderHighlightedText()}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Disputed Clauses Section ─── */}
      {disputedClauses.some(c => !c.replaced) && (
        <div className={`flex items-center justify-between p-4 rounded-xl border ${isDark ? "border-[#F59E0B]/30 bg-[#F59E0B]/10" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center gap-2">
            <MagnifyingGlass size={16} weight="bold" className="text-[#F59E0B]" />
            <p className={`text-[12px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              تم اكتشاف {disputedClauses.filter(c => !c.replaced).length} بنود تحتمل تفسيراً متعدداً — <span className="opacity-70 font-normal">اضغط على الكلمات المظللة لتعديلها.</span>
            </p>
          </div>
          <button onClick={() => setShowClausePanel(v => !v)} className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${isDark ? "bg-zinc-800 border-white/[0.08] hover:bg-zinc-700" : "bg-white border-amber-200 hover:bg-amber-100"}`}>
            {showClausePanel ? "إخفاء التحليل" : "عرض التحليل"}
          </button>
        </div>
      )}

      <AnimatePresence>
        {showClausePanel && disputedClauses.some(c => !c.replaced) && (
           <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
             <div className={`${card} p-4`}>
                 <table className="w-full text-right text-[11px]">
                   <thead>
                     <tr className={`border-b ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-100 text-slate-400"}`}>
                       <th className="pb-2 font-semibold">الكلمة الخلافية</th>
                       <th className="pb-2 font-semibold">التفسير الأوسع</th>
                       <th className="pb-2 font-semibold">التفسير الأضيق</th>
                       <th className="pb-2 font-semibold">البديل المقترح</th>
                       <th className="pb-2 font-semibold w-24">إجراء</th>
                     </tr>
                   </thead>
                   <tbody>
                     {disputedClauses.filter(c => !c.replaced).map(c => (
                       <tr key={c.id} className={`border-b last:border-0 ${isDark ? "border-white/[0.06] text-zinc-300" : "border-slate-100 text-zinc-700"}`}>
                         <td className="py-3 font-mono text-[#F59E0B]" dir="ltr">{c.original}</td>
                         <td className="py-3">{c.broadInterpretation}</td>
                         <td className="py-3">{c.narrowInterpretation}</td>
                         <td className="py-3 text-emerald-500 font-bold">{c.suggested}</td>
                         <td className="py-3">
                            <button onClick={() => handleReplace(c.id)} className={`px-2.5 py-1 rounded-md font-bold transition-colors ${isDark ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}>استبدال</button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
                 <div className={`mt-4 pt-4 border-t flex justify-end items-center gap-3 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                   <Link href="/ai/wargaming" className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold transition-colors ${isDark ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100"}`}>
                     <Warning size={14} weight="bold" />
                     حلّل هذا العقد في محاكي الخصم
                   </Link>
                 </div>
             </div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* Disclaimer */}
      <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
        <div className="w-4 h-4 rounded-full bg-amber-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-[9px] font-black text-amber-500">!</span>
        </div>
        <p className={`text-[10px] leading-relaxed ${isDark ? "text-amber-400/70" : "text-amber-700/70"}`}>
          هذه الترجمة مُولَّدة بالذكاء الاصطناعي لأغراض المعلومات فقط ولا تُغني عن مراجعة مترجم قانوني معتمد. نظامي لا تتحمل المسؤولية عن الاستخدام الرسمي لهذه الترجمة.
        </p>
      </div>

      {/* Glossary */}
      <div className={card}>
        <button
          onClick={() => setShowGlossary(v => !v)}
          className={`w-full flex items-center justify-between p-4 ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50"} transition-colors rounded-2xl`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? "bg-blue-500/10" : "bg-blue-50"}`}>
              <BookOpen size={15} weight="duotone" className="text-blue-500" />
            </div>
            <div className="text-right">
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>قاموس المصطلحات القانونية</p>
              <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{MOCK_GLOSSARY_EN.length} مصطلح مستخرج تلقائياً</p>
            </div>
          </div>
          <motion.span animate={{ rotate: showGlossary ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <CaretDown size={13} className={isDark ? "text-zinc-600" : "text-slate-400"} />
          </motion.span>
        </button>

        <AnimatePresence>
          {showGlossary && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className={`border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                <div className="p-4 space-y-2">
                  {MOCK_GLOSSARY_EN.map((item, i) => (
                    <div key={i} className={`p-3 rounded-xl border ${isDark ? "border-white/[0.05] bg-zinc-800/40" : "border-slate-100 bg-slate-50"}`}>
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`} dir="rtl">{item.original}</p>
                        <div className="flex items-center gap-1">
                          <ArrowsLeftRight size={10} className={isDark ? "text-zinc-600" : "text-slate-400"} />
                          <p className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`} dir="ltr">{item.translated}</p>
                        </div>
                      </div>
                      <p className={`text-[10px] leading-relaxed ${isDark ? "text-zinc-600" : "text-slate-500"}`} dir="ltr">{item.definition}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
