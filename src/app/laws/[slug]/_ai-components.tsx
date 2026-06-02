"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CaretDown, CaretUp, Microphone, PaperPlaneTilt, Sparkle, X,
} from "@phosphor-icons/react";
import type { LawArticle } from "../data";

const QUICK_PROMPTS = [
  "استخرج بنود التأسيس والتسجيل",
  "ما إجراءات رفع التظلم؟",
  "اجمع مواد مسؤولية الشركاء",
  "ما متطلبات رأس المال؟",
  "اشرح لي شروط الميثاق العائلي",
  "استخرج المواد المتعلقة بالقوائم المالية",
];

const QUICK_PROMPTS_EN = [
  "Extract incorporation and registration clauses",
  "What are the objection procedures?",
  "Collect partner liability articles",
  "What are the capital requirements?",
  "Explain the family charter conditions",
  "Extract the financial statement articles",
];

interface AIMessage { role: "user" | "ai"; text: string; }

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function getSpeechRecognition() {
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function readTranscript(event: SpeechRecognitionEventLike) {
  return event.results[0]?.[0]?.transcript ?? "";
}

export function LibraryAI({ isDark, isRTL = true }: { isDark: boolean; isRTL?: boolean }) {
  const [input, setInput]     = useState("");
  const [msgs, setMsgs]       = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const bottomRef             = useRef<HTMLDivElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      alert(isRTL ? "متصفحك لا يدعم خاصية التحدث الصوتي." : "Your browser does not support voice input.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = isRTL ? "ar-SA" : "en-US";
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = readTranscript(e);
      setInput(prev => prev ? prev + " " + transcript : transcript);
    };
    recognition.onerror  = () => setIsRecording(false);
    recognition.onend    = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const handleSend = async (q: string) => {
    const query = q.trim();
    if (!query) return;
    setInput("");
    setOpen(true);
    setMsgs(m => [...m, { role: "user", text: query }]);
    setLoading(true);
    await new Promise(r => setTimeout(r, 1400));
    let reply = "";
    if (!isRTL)
      reply = "I found the closest relevant areas in the Companies Law. The current legal text is preserved in Arabic, but you can use the draft tools, article index, principles, and precedents from the English interface.";
    else if (query.includes("تأسيس") || query.includes("تسجيل"))
      reply = "المواد ذات الصلة بالتأسيس:\n• المادة السادسة: طلب تأسيس الشركة\n• المادة السابعة: وثائق التأسيس\n• المادة الثامنة: القيد لدى السجل التجاري\n• المادة التاسعة: اكتساب الشخصية الاعتبارية";
    else if (query.includes("مسؤولية") || query.includes("شركاء"))
      reply = "المواد المتعلقة بمسؤولية الشركاء:\n• المادة الثالثة عشرة: حصة الشريك\n• المادة الرابعة عشرة: تقديم الحصة\n• المادة الخامسة عشرة: التأخر في تقديم الحصة";
    else if (query.includes("مالي") || query.includes("قوائم"))
      reply = "المواد المتعلقة بالمالية:\n• المادة السادسة عشرة: السنة المالية\n• المادة السابعة عشرة: السجلات المحاسبية والقوائم المالية";
    else if (query.includes("ميثاق") || query.includes("عائلي"))
      reply = "المادة الحادية عشرة تنظم الميثاق العائلي:\n• يجوز للمساهمين إبرام ميثاق عائلي\n• ينظم الملكية وحوكمة الأسرة وسياسة التوظيف\n• يكون ملزماً ويجوز أن يكون جزءاً من النظام الأساس";
    else if (query.includes("رأس المال") || query.includes("متطلبات"))
      reply = "متطلبات رأس المال تجدها في:\n• المادة الثالثة عشرة: الحصص النقدية والعينية\n• المادة الرابعة عشرة: أحكام الضمان\n• المادة الخامسة عشرة: عواقب التأخر في التسديد";
    else if (query.includes("تظلم"))
      reply = "الحق في التظلم وارد في:\n• المادة السادسة (فقرة 4): يجوز التظلم أمام الوزارة خلال 60 يوماً من رفض الطلب\n• المادة السادسة (فقرة 5): عند رفض التظلم أو التأخر في البت، يحق اللجوء للقضاء";
    else
      reply = "سؤالك يتعلق بنظام الشركات السعودي. يمكنك استخدام الأوامر السريعة أعلاه لاستخراج نصوص محددة، أو اكتب سؤالاً أكثر تفصيلاً مثل: \"ما المواد المتعلقة بالشركة ذات المسؤولية المحدودة؟\"";
    setMsgs(m => [...m, { role: "ai", text: reply }]);
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };
  const quickPrompts = isRTL ? QUICK_PROMPTS : QUICK_PROMPTS_EN;
  const textStart = isRTL ? "text-right" : "text-left";

  return (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}>
      <button onClick={() => setOpen(!open)} className={`w-full flex items-center gap-3 px-4 py-3 transition ${isDark ? "hover:bg-white/[0.03]" : "hover:bg-slate-50"}`}>
        <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
          <Sparkle size={13} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div className={`flex-1 ${textStart}`}>
          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{isRTL ? "مساعد المكتبة — نظامي AI" : "Library Assistant — Nezamy AI"}</p>
          <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{isRTL ? "اسأل عن أي مادة أو استخرج نصوصاً محددة من النظام" : "Ask about any article or extract specific legal text"}</p>
        </div>
        {open ? <CaretUp size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} /> : <CaretDown size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className={`border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              {msgs.length === 0 && (
                <div className="p-3">
                  <p className={`text-[10px] font-bold mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{isRTL ? "أوامر سريعة:" : "Quick prompts:"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPrompts.map((p, i) => (
                      <button key={i} onClick={() => handleSend(p)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition ${isDark ? "border-white/[0.07] text-zinc-400 hover:border-[#C8A762]/30 hover:text-[#C8A762]" : "border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-700"}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.length > 0 && (
                <div className="max-h-64 overflow-y-auto p-3 space-y-2">
                  {msgs.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-xl text-[12px] leading-relaxed ${
                        m.role === "user"
                          ? "bg-[#0B3D2E] text-white"
                          : isDark ? "bg-zinc-800 text-zinc-300 border border-white/[0.06]" : "bg-slate-100 text-zinc-700"
                      }`}>
                        {m.role === "ai" && (
                          <p className={`text-[10px] font-bold mb-1 ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>{isRTL ? "✦ نظامي AI" : "✦ Nezamy AI"}</p>
                        )}
                        <p className="whitespace-pre-wrap">{m.text}</p>
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className={`px-3 py-2 rounded-xl border flex gap-1 ${isDark ? "bg-zinc-800 border-white/[0.06]" : "bg-slate-100"}`}>
                        {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#C8A762] animate-bounce" style={{ animationDelay: `${i*150}ms` }} />)}
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
              <div className={`flex items-center gap-2 p-3 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                <div className={`flex items-center gap-2 flex-1 p-1 pl-3 pr-1 rounded-xl border transition-colors ${
                  input.trim() ? (isDark ? "border-[#C8A762]/50 bg-zinc-800/80" : "border-amber-400 bg-white") : (isDark ? "border-white/[0.08] bg-zinc-800/50" : "border-slate-200 bg-slate-50")
                }`}>
                  <button onClick={toggleRecording} className={`p-2 rounded-xl transition flex items-center justify-center ${isRecording ? "bg-red-500/10 text-red-500 animate-pulse" : isDark ? "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200"}`} title={isRecording ? (isRTL ? "إيقاف التسجيل" : "Stop recording") : (isRTL ? "تحدث صوتياً" : "Voice input")}>
                    {isRecording ? <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute" /> : null}
                    <Microphone size={16} weight={isRecording ? "fill" : "regular"} className={isRecording ? "relative z-10" : ""} />
                  </button>
                  <input
                    value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); }}}
                    placeholder={isRTL ? "مثال: استخرج لي كل بنود مسؤولية الشركاء..." : "Example: extract all partner liability clauses..."}
                    className={`flex-1 text-[12px] bg-transparent outline-none transition ${isDark ? "text-zinc-200 placeholder-zinc-600" : "text-zinc-800 placeholder-slate-400"}`}
                  />
                  <button onClick={() => handleSend(input)} disabled={!input.trim() || loading}
                    className={`p-2 rounded-lg flex items-center justify-center transition disabled:opacity-40 ${
                      input.trim() ? "bg-[#0B3D2E] text-white hover:opacity-90" : isDark ? "bg-zinc-700 text-zinc-500" : "bg-slate-200 text-slate-400"
                    }`}>
                    <PaperPlaneTilt size={14} weight={input.trim() ? "fill" : "regular"} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Preamble collapsible ──────────────────────────────────────────────────────

export function ArticleExplainModal({ article, isDark, onClose, isRTL = true }: { article: LawArticle; isDark: boolean; onClose: () => void; isRTL?: boolean }) {
  const [input, setInput] = useState("");
  const [msgs, setMsgs]   = useState<AIMessage[]>([
    {
      role: "ai",
      text: isRTL
        ? `أهلاً بك. أنا المساعد الذكي لنظام الشركات. هل تريدني أن أشرح لك ${article.num} المتضمنة لـ "${article.title}" أم لديك استفسار محدد حولها؟`
        : `Welcome. I am the smart assistant for the Companies Law. Would you like an explanation of ${article.num} (${article.title}), or do you have a specific question about it?`
    }
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      alert(isRTL ? "متصفحك لا يدعم خاصية التحدث الصوتي." : "Your browser does not support voice input.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = isRTL ? "ar-SA" : "en-US";
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = readTranscript(e);
      setInput(prev => prev ? prev + " " + transcript : transcript);
    };
    recognition.onerror  = () => setIsRecording(false);
    recognition.onend    = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const handleSend = async (q: string) => {
    const query = q.trim();
    if (!query) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", text: query }]);
    setLoading(true);
    await new Promise(r => setTimeout(r, 1500));
    const reply = isRTL
      ? `بناءً على ${article.num}، نصها يشير إلى أن: ${article.text.split("\\n")[0]}...\nهذا يعني أن النظام اشترط ذلك لضمان استقرار المراكز القانونية. هل تحتاج توضيحاً لأي فقرة محددة في المادة؟`
      : `Based on ${article.num}, the article starts with: ${article.text.split("\\n")[0]}...\nThe legal text is currently preserved in Arabic, but I can help you identify the relevant paragraph, summarize it, or prepare it for your draft.`;
    setMsgs(m => [...m, { role: "ai", text: reply }]);
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-[500px] overflow-hidden rounded-2xl border shadow-2xl flex flex-col ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200"}`} dir={isRTL ? "rtl" : "ltr"}>
        {/* Header */}
        <div className={`flex items-start gap-3 p-4 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
            <Sparkle size={20} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div className="flex-1 mt-0.5">
            <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{isRTL ? "اشرح لي" : "Explain"} — {article.num}</p>
            <p className={`text-[11px] mt-0.5 line-clamp-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{article.title}</p>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl transition ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
            <X size={16} />
          </button>
        </div>

        {/* Chat */}
        <div className={`h-[400px] overflow-y-auto p-4 space-y-3 ${isDark ? "bg-black/20" : "bg-slate-50/50"}`}>
          <div className={`p-3 rounded-xl border text-[11px] leading-relaxed mb-4 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5 text-[#C8A762]/80" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            <p className="font-bold mb-1 opacity-80 border-b border-current pb-1 inline-block">{isRTL ? "نص المادة للاختصار:" : "Article text excerpt:"}</p>
            <p className="line-clamp-3 mt-1.5">{article.text}</p>
          </div>

          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[12px] leading-relaxed ${
                m.role === "user"
                  ? "bg-[#0B3D2E] text-white rounded-tr-sm"
                  : isDark ? "bg-zinc-800 text-zinc-300 border border-white/[0.06] rounded-tl-sm" : "bg-white border border-slate-200 text-zinc-700 shadow-sm rounded-tl-sm"
              }`}>
                {m.role === "ai" && (
                  <p className={`text-[10px] font-bold mb-1.5 flex items-center gap-1 ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}><Sparkle size={10} weight="fill" /> {isRTL ? "مساعد الفهم" : "Explanation assistant"}</p>
                )}
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className={`px-4 py-3 rounded-2xl border flex gap-1.5 rounded-tl-sm ${isDark ? "bg-zinc-800 border-white/[0.06]" : "bg-white border-slate-200"}`}>
                {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#C8A762] animate-bounce" style={{ animationDelay: `${i*150}ms` }} />)}
              </div>
            </div>
          )}
          <div ref={bottomRef} className="h-1" />
        </div>

        {/* Input */}
        <div className={`p-3 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
          <div className={`flex items-center gap-2 p-1.5 pl-3 pr-1.5 rounded-2xl border transition-colors ${
            input.trim() ? (isDark ? "border-[#C8A762]/50 bg-zinc-800/80" : "border-amber-400 bg-white") : (isDark ? "border-white/[0.08] bg-zinc-800/50" : "border-slate-200 bg-slate-50")
          }`}>
            <button onClick={toggleRecording} className={`p-2 rounded-xl transition flex items-center justify-center ${isRecording ? "bg-red-500/10 text-red-500 animate-pulse" : isDark ? "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]" : "text-slate-400 hover:text-slate-600 hover:bg-slate-200"}`} title={isRecording ? (isRTL ? "إيقاف التسجيل" : "Stop recording") : (isRTL ? "تحدث صوتياً" : "Voice input")}>
              {isRecording ? <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute" /> : null}
              <Microphone size={16} weight={isRecording ? "fill" : "regular"} className={isRecording ? "relative z-10" : ""} />
            </button>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); }}}
              placeholder={isRTL ? "اكتب استفسارك عن المادة هنا..." : "Ask your question about this article..."}
              className={`flex-1 text-[12px] bg-transparent outline-none ${isDark ? "text-zinc-200 placeholder-zinc-600" : "text-zinc-800 placeholder-slate-400"}`}
            />
            <button onClick={() => handleSend(input)} disabled={!input.trim() || loading}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition disabled:opacity-40 ${
                input.trim() ? "bg-[#0B3D2E] text-white hover:opacity-90" : isDark ? "bg-zinc-700 text-zinc-500" : "bg-slate-200 text-slate-400"
              }`}>
              <PaperPlaneTilt size={14} weight={input.trim() ? "fill" : "regular"} />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
