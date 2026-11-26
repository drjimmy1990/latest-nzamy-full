"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  CaretDown, CaretUp, Microphone, PaperPlaneTilt, Sparkle, X,
} from "@phosphor-icons/react";
import type { LawArticle } from "../data";
import { LiteMarkdown } from "../components/AiTabContent";
import type { LibraryAiAction } from "./_ai-reply";
import { askLibrary, LIBRARY_AI_SOON, loadLibraryHistory, type LibraryHistoryConversation } from "./_library-assistant";
import { libraryAiRefusal } from "./_ai-reply";
import { useToolUsable } from "@/hooks/useToolUsable";
import { aiToolPriceText } from "@/lib/ai/toolPointsDisplay";
import LibraryPointsLowNotice from "@/components/library/LibraryPointsLowNotice";
import { explainRequest, explainSubtitle, spokenArticle } from "./_explain-greeting";
import { asCitations, CitedText, SourceList, type Citation } from "@/components/ai/CitedAnswer";
import { useUser } from "@/hooks/useUser";
import { createCommunityPost } from "@/lib/services/communityService";
import {
  canPostCommunityQuestion, communityLoginHref, communityQuestionHref, communityQuestionPrefill,
  COMMUNITY_QUESTION_CATEGORIES, COMMUNITY_TITLE_MAX, type CommunityQuestionCategory,
} from "./_community-question";


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

interface AIMessage { role: "user" | "ai"; text: string; action?: LibraryAiAction; cites?: Citation[]; }

/** An assistant reply: cited text with its sources when it has them, the page's light Markdown otherwise. */
function AiReplyBody({ m, isDark }: { m: AIMessage; isDark: boolean }) {
  if (!m.cites || m.cites.length === 0) return <LiteMarkdown text={m.text} />;
  return (
    <div className="space-y-2">
      <CitedText text={m.text} cites={m.cites} isDark={isDark} className="leading-relaxed" />
      <SourceList cites={m.cites} isDark={isDark} compact />
    </div>
  );
}

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

/** A saved conversation's day, for the list (an unreadable time shows nothing). */
function historyDate(iso: string, isRTL: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString(isRTL ? "ar-SA" : "en-GB", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

export function LibraryAI({ isDark, isRTL = true }: { isDark: boolean; isRTL?: boolean }) {
  const [input, setInput]     = useState("");
  const [msgs, setMsgs]       = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const bottomRef             = useRef<HTMLDivElement>(null);
  // Owner Q458: the conversation this chat continues (the server adds its last
  // six turns to a follow-up). L3: the user's saved conversations on this law,
  // from the server, so another device lists them too; null = not loaded / none.
  const conversationRef       = useRef<string | null>(null);
  const user                  = useUser();
  const [history, setHistory] = useState<LibraryHistoryConversation[] | null>(null);
  const historyAsked          = useRef(false);

  const refreshHistory = useCallback(async () => {
    const list = await loadLibraryHistory(window.location.pathname);
    setHistory(list && list.length > 0 ? list : null);
  }, []);

  useEffect(() => {
    if (!open || user.loading || !user.isLoggedIn || historyAsked.current) return;
    historyAsked.current = true;
    void refreshHistory();
  }, [open, user.loading, user.isLoggedIn, refreshHistory]);

  const restoreConversation = (c: LibraryHistoryConversation) => {
    conversationRef.current = c.conversationId;
    setMsgs(c.turns.flatMap((t): AIMessage[] => [
      { role: "user", text: t.question },
      { role: "ai", text: t.answer, cites: asCitations(t.citations) },
    ]));
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const startNewConversation = () => {
    conversationRef.current = null;
    setMsgs([]);
    if (user.isLoggedIn) void refreshHistory();
  };

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

    // The library assistant on the AI pipeline (plan §5 L5): the server's
    // reply with its citations, or the refusal it gave; never an invented answer.
    const answer = await askLibrary(
      { message: query, conversationId: conversationRef.current },
      window.location.pathname + window.location.search,
    );
    if (answer.conversationId) conversationRef.current = answer.conversationId;
    const reply = answer.text;
    const action = answer.action;
    const cites = asCitations(answer.citations);
    setMsgs(m => [...m, { role: "ai", text: reply, action, cites }]);
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
          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{isRTL ? "مساعد المكتبة — ذكاء نظامي" : "Library Assistant — Nezamy AI"}</p>
          <p className={`text-[10px] ${isDark ? "text-zinc-400" : "text-slate-400"}`}>{isRTL ? "اسأل عن أي مادة أو استخرج نصوصاً محددة من النظام" : "Ask about any article or extract specific legal text"}</p>
        </div>
        {open ? <CaretUp size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} /> : <CaretDown size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className={`border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              {msgs.length === 0 && (
                <div className="p-3">
                  <p className={`text-[10px] font-bold mb-2 ${isDark ? "text-zinc-400" : "text-slate-400"}`}>{isRTL ? "أوامر سريعة:" : "Quick prompts:"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPrompts.map((p, i) => (
                      <button key={i} onClick={() => handleSend(p)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition ${isDark ? "border-white/[0.07] text-zinc-400 hover:border-[#C8A762]/30 hover:text-[#C8A762]" : "border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-700"}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                  {history && history.length > 0 && (
                    <div className="mt-3">
                      <p className={`text-[10px] font-bold mb-1.5 ${isDark ? "text-zinc-400" : "text-slate-400"}`}>{isRTL ? "محادثاتك السابقة في هذا النظام:" : "Your earlier conversations on this law:"}</p>
                      <ul className="space-y-1">
                        {history.map((c, i) => (
                          <li key={c.conversationId ?? `single-${i}`}>
                            <button
                              onClick={() => restoreConversation(c)}
                              className={`w-full ${textStart} flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-lg border transition ${isDark ? "border-white/[0.07] text-zinc-300 hover:border-[#C8A762]/30" : "border-slate-200 text-slate-600 hover:border-amber-300"}`}
                            >
                              <span className="flex-1 truncate">{c.turns[0]?.question}</span>
                              <span className={`flex-shrink-0 text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                                {c.turns.length > 1 ? (isRTL ? `${c.turns.length} أسئلة · ` : `${c.turns.length} questions · `) : ""}
                                {historyDate(c.updatedAt, isRTL)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {msgs.length > 0 && (
                <div className={`flex justify-end px-3 pt-2`}>
                  <button
                    onClick={startNewConversation}
                    disabled={loading}
                    className={`text-[10px] font-bold px-2 py-1 rounded-md transition disabled:opacity-40 ${isDark ? "text-zinc-400 hover:text-[#C8A762]" : "text-slate-500 hover:text-amber-700"}`}
                  >
                    {isRTL ? "محادثة جديدة" : "New conversation"}
                  </button>
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
                          <p className={`text-[10px] font-bold mb-1 ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>{isRTL ? "✦ ذكاء نظامي" : "✦ Nezamy AI"}</p>
                        )}
                        {m.role === "ai" ? <AiReplyBody m={m} isDark={isDark} /> : <p className="whitespace-pre-wrap">{m.text}</p>}
                        {m.action && (
                          <Link href={m.action.href} className="inline-block mt-2 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[#0B3D2E] text-white hover:opacity-90 transition">
                            {m.action.label}
                          </Link>
                        )}
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
              {/* 06 ج6 (l12): one question away from the 50-point lock → say so first. */}
              {user.isLoggedIn && <LibraryPointsLowNotice isDark={isDark} refreshKey={msgs.length} className="mx-3 mt-3" />}
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

/** The tool «اشرح لي» runs (POST /api/v1/ai/runs, 5 points a question). */
const EXPLAIN_TOOL = "library-assistant";

/**
 * May the signed-in reader run «اشرح لي» now (useToolUsable)? Mounted only for
 * a signed-in reader, so a guest's window asks the server nothing at all.
 */
function ExplainToolGate({ onAnswer }: { onAnswer: (usable: boolean) => void }) {
  const usable = useToolUsable(EXPLAIN_TOOL);
  useEffect(() => {
    if (usable !== null) onAnswer(usable);
  }, [usable, onAnswer]);
  return null;
}

/**
 * Owner package 25-Nov §2.7 / ٢١٨ (batch l16, B-16 / E-20): «اشرح لي» explains
 * the article as soon as the window opens — no greeting waiting for a typed
 * question. The request goes ONCE per opening (autoSentRef, set at the moment
 * it fires, so React's development double effect cannot send it twice), and
 * never for a guest (the sign-in message, no request) or when the tool is
 * switched off («قيد التفعيل», no request). The price is on the button that
 * opens the window and in the window's header. A refusal the server gives
 * before any charge (tier, points, lock) is shown as it comes.
 */
export function ArticleExplainModal({ article, isDark, onClose, isRTL = true, lawName }: { article: LawArticle; isDark: boolean; onClose: () => void; isRTL?: boolean; lawName?: string }) {
  const user = useUser();
  const [input, setInput] = useState("");
  const [msgs, setMsgs]   = useState<AIMessage[]>([]);
  const subtitle = explainSubtitle(article.title, lawName);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<string | null>(null);
  // One question at a time: a second Enter while one is in flight is not a second charge.
  const sendingRef = useRef(false);
  const autoSentRef = useRef(false);
  const [usable, setUsable] = useState<boolean | null>(null);
  const onGate = useCallback((answer: boolean) => setUsable(answer), []);
  const signedIn = !user.loading && user.isLoggedIn;

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
    if (!query || sendingRef.current) return;
    sendingRef.current = true;
    setInput("");
    setMsgs(m => [...m, { role: "user", text: query }]);
    setLoading(true);
    try {
      // «اشرح لي» on the AI pipeline (plan §5 L5): the open article is sent as
      // the first source, whatever the library search finds around it. Q458: a
      // follow-up in this window carries its conversation (the server adds the
      // last six turns).
      const answer = await askLibrary(
        { message: query, articleId: article.id, conversationId: conversationRef.current },
        window.location.pathname + window.location.search,
      );
      if (answer.conversationId) conversationRef.current = answer.conversationId;
      const reply = answer.text;
      const action = answer.action;
      const cites = asCitations(answer.citations);
      setMsgs(m => [...m, { role: "ai", text: reply, action, cites }]);
    } finally {
      sendingRef.current = false;
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  // B-16 / E-20: the explanation request, once, as soon as it is known that it may go.
  useEffect(() => {
    if (autoSentRef.current || user.loading) return;
    if (!user.isLoggedIn) {
      autoSentRef.current = true;
      const refusal = libraryAiRefusal(401, window.location.pathname + window.location.search);
      setMsgs([{ role: "ai", text: refusal?.text ?? "", action: refusal?.action }]);
      return;
    }
    if (usable === null) return;
    autoSentRef.current = true;
    if (!usable) {
      setMsgs([{ role: "ai", text: LIBRARY_AI_SOON }]);
      return;
    }
    void handleSend(explainRequest({ num: article.num, articleTitle: article.title, lawName, isRTL }));
    // handleSend reads only refs and setters besides the article: the effect keys on the gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.loading, user.isLoggedIn, usable]);

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92%] max-w-[500px] max-h-[85dvh] overflow-hidden rounded-2xl border shadow-2xl flex flex-col ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200"}`} dir={isRTL ? "rtl" : "ltr"}>
        {/* Header */}
        <div className={`flex-shrink-0 flex items-start gap-3 p-4 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
            <Sparkle size={20} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div className="flex-1 mt-0.5 min-w-0">
            <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{isRTL ? "اشرح لي" : "Explain"} — {isRTL ? spokenArticle(article.num) : article.num}</p>
            {subtitle && <p className={`text-[11px] mt-0.5 line-clamp-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{subtitle}</p>}
            <p className={`text-[10.5px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              {isRTL ? `${aiToolPriceText(EXPLAIN_TOOL, "ar")} لكل سؤال، ويبدأ الشرح فور فتح النافذة` : `${aiToolPriceText(EXPLAIN_TOOL, "en")} a question; the explanation starts as the window opens`}
            </p>
          </div>
          <button onClick={onClose} className={`flex-shrink-0 p-2 rounded-xl transition ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}>
            <X size={16} />
          </button>
        </div>

        {signedIn && <ExplainToolGate onAnswer={onGate} />}
        {/* Chat */}
        <div className={`flex-1 min-h-0 overflow-y-auto p-4 space-y-3 ${isDark ? "bg-black/20" : "bg-slate-50/50"}`}>
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
                {m.role === "ai" ? <AiReplyBody m={m} isDark={isDark} /> : <p className="whitespace-pre-wrap">{m.text}</p>}
                {m.action && (
                  <Link href={m.action.href} className="inline-block mt-2 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[#0B3D2E] text-white hover:opacity-90 transition">
                    {m.action.label}
                  </Link>
                )}
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
          {msgs.length === 0 && !loading && (
            <p role="status" className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{isRTL ? "جارٍ التحقق…" : "Checking…"}</p>
          )}
          <div ref={bottomRef} className="h-1" />
        </div>

        {/* Input */}
        <div className={`flex-shrink-0 p-3 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
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

// ─── Community Question Modal ─────────────────────────────────────────────────
// N05-L9 (owner F-22): posts a real question through POST /api/v1/community/posts
// (createCommunityPost, as /community/ask), its details opening with the law and
// the article. Signed-in readers only; a guest is sent to sign in and back.

export function CommunityQuestionModal({
  isDark, isRTL = true, lawName, articleRef, onClose,
}: { isDark: boolean; isRTL?: boolean; lawName?: string; articleRef?: string; onClose: () => void }) {
  const user = useUser();
  const [title, setTitle] = useState("");
  const [body, setBody]   = useState(() => communityQuestionPrefill(lawName, articleRef));
  const [cat, setCat]     = useState<CommunityQuestionCategory | "">("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postedHref, setPostedHref] = useState<string | null>(null);

  const base  = isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200";
  const inp   = isDark ? "bg-zinc-800/60 border-white/10 text-zinc-100 placeholder-zinc-600 focus:border-[#C8A762]/50" : "bg-slate-50 border-slate-200 text-gray-900 placeholder-slate-400 focus:border-amber-400";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  const lbl   = isDark ? "text-zinc-300" : "text-gray-700";
  const canSend = !sending && cat !== "" && canPostCommunityQuestion(title, cat);

  // Success only for a question the server saved; its own error text otherwise.
  const handleSubmit = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const saved = await createCommunityPost({
        title: title.trim(),
        body: body.trim(),
        category: cat,
        asker: user.name || "",
        askerType: user.userType === "lawyer" ? "lawyer" : "user",
      });
      setPostedHref(communityQuestionHref(saved?.id));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : (isRTL ? "تعذّر نشر السؤال — لم يُحفظ." : "The question was not posted."));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${base}`}
        dir={isRTL ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isDark ? "bg-indigo-900/30 text-indigo-400" : "bg-indigo-50 text-indigo-600"}`}>
              <PaperPlaneTilt size={16} weight="duotone" />
            </div>
            <div>
              <p className={`text-[13px] font-black ${isDark ? "text-white" : "text-gray-900"}`}>{isRTL ? "اسأل في المجتمع القانوني" : "Ask the Legal Community"}</p>
              <p className={`text-[10px] ${muted}`}>{isRTL ? "يُنشر سؤالك في مجتمع نظامي القانوني" : "Your question is posted to the Nezamy community"}</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl transition ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><X size={16} /></button>
        </div>

        {/* Body */}
        {postedHref ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 px-6">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isDark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
              <Sparkle size={28} weight="fill" />
            </div>
            <p className={`text-[15px] font-black ${isDark ? "text-white" : "text-gray-900"}`}>{isRTL ? "تم نشر سؤالك" : "Your question was posted"}</p>
            <p className={`text-[12px] text-center ${muted}`}>{isRTL ? "تظهر الإجابات في صفحة السؤال." : "Answers appear on the question's page."}</p>
            <Link href={postedHref} className="px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-white hover:opacity-90 transition">
              {isRTL ? "افتح صفحة السؤال" : "Open the question"}
            </Link>
          </div>
        ) : user.loading ? (
          <p className={`py-12 text-center text-[12px] ${muted}`}>{isRTL ? "جارٍ التحميل…" : "Loading…"}</p>
        ) : !user.isLoggedIn ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 px-6">
            <p className={`text-[13px] font-bold text-center ${isDark ? "text-zinc-200" : "text-gray-700"}`}>
              {isRTL ? "سجّل الدخول لتنشر سؤالك في المجتمع." : "Sign in to post your question."}
            </p>
            <Link href={communityLoginHref(typeof window === "undefined" ? "/" : window.location.pathname)}
              className="px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-white hover:opacity-90 transition">
              {isRTL ? "تسجيل الدخول" : "Sign in"}
            </Link>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            {lawName && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-slate-50 border border-slate-200"}`}>
                <span className={`text-[10px] font-bold ${muted}`}>{isRTL ? "السياق:" : "Context:"}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${isDark ? "bg-[#0B3D2E]/40 text-green-300" : "bg-green-50 text-green-800"}`}>{[lawName, articleRef].filter(Boolean).join(" — ")}</span>
              </div>
            )}
            <div>
              <label className={`text-[11px] font-bold block mb-1.5 ${lbl}`}>{isRTL ? "التصنيف *" : "Category *"}</label>
              <select value={cat} onChange={e => setCat(e.target.value as CommunityQuestionCategory | "")}
                className={`w-full px-3 py-2 rounded-xl border text-[12px] outline-none transition ${inp}`}>
                <option value="">{isRTL ? "اختر التصنيف" : "Choose a category"}</option>
                {COMMUNITY_QUESTION_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className={`text-[11px] font-bold block mb-1.5 ${lbl}`}>{isRTL ? "عنوان السؤال *" : "Question Title *"}</label>
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={COMMUNITY_TITLE_MAX}
                placeholder={isRTL ? "مثال: ما مدة التقادم في عقود العمل؟" : "e.g. Statute of limitations for labor contracts?"}
                className={`w-full px-3 py-2.5 rounded-xl border text-[12px] outline-none transition ${inp}`} />
              <p className={`mt-1 text-[10px] ${muted}`}>{isRTL ? "أكثر من عشرة أحرف." : "More than ten characters."}</p>
            </div>
            <div>
              <label className={`text-[11px] font-bold block mb-1.5 ${lbl}`}>{isRTL ? "تفاصيل السؤال (اختياري)" : "Question Details (optional)"}</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={4}
                placeholder={isRTL ? "اشرح وضعك القانوني أو تساؤلك..." : "Describe your legal question..."}
                className={`w-full px-3 py-2.5 rounded-xl border text-[12px] outline-none resize-none transition leading-relaxed ${inp}`} />
            </div>
            <p className={`text-[10px] ${muted}`}>
              {isRTL ? "يظهر سؤالك دون اسمك، باسم «عضو في المجتمع». لا تكتب فيه رقم جوال أو بريداً." : "Your question shows without your name. Do not include a phone number or email."}
            </p>
            {error && <p role="alert" className={`text-[11px] font-semibold ${isDark ? "text-red-400" : "text-red-600"}`}>{error}</p>}
            <button onClick={handleSubmit} disabled={!canSend}
              className={`w-full py-3 rounded-xl text-[13px] font-black transition disabled:opacity-40 bg-[#0B3D2E] text-white hover:bg-[#0a3226]`}>
              {sending ? (isRTL ? "جارٍ النشر…" : "Posting…") : (isRTL ? "إرسال السؤال للمجتمع" : "Post to Community")}
            </button>
          </div>
        )}
      </motion.div>
    </>
  );
}
