"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import {
  PaperPlaneTilt, Microphone, Robot, User, Sparkle,
  Lightning, Books, Paperclip, X, CaretDown,
  ClockCountdown, MagicWand, Warning, Copy, ThumbsUp, ThumbsDown,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import EscalationFlow from "@/components/EscalationFlow";

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageRole = "user" | "ai" | "system";
interface Message {
  id: string;
  role: MessageRole;
  text: string;
  time: string;
  credits?: number;
  sources?: string[];
}

// ─── Quick prompts ────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  "ما هي شروط رفع دعوى تعسف الفصل أمام محكمة العمل؟",
  "كيف يُحتسب مكافأة نهاية الخدمة في نظام العمل السعودي؟",
  "ما حقوق المستأجر عند إنهاء عقد الإيجار قبل موعده؟",
  "هل يمكن للمرأة توقيع عقد عمل دون موافقة وليّ الأمر؟",
];

// ─── Legal area auto-detector ────────────────────────────────────────────
const AREA_KEYWORDS: { id: string; keywords: string[] }[] = [
  { id: "labor",       keywords: ["عمال","موظف","راتب","فصل","عقد عمل","نهاية خدمة","الموارد البشرية","labor","employee","salary","termination"] },
  { id: "commercial", keywords: ["تجاري","شركة","عقد تجاري","捊يك","بيع","شراء","تجارة","commercial","company","contract"] },
  { id: "real_estate",keywords: ["عقار","أرض","شقة","إيجار","مستأجر","مؤجر","ملكية","property","rent","lease","real estate"] },
  { id: "family",     keywords: ["طلاق","حضانة","نفقة","زواج","خلع","ميراث","أحوال شخصية","family","divorce","custody"] },
  { id: "criminal",   keywords: ["جنائي","جريمة","حكم قضائي","استئناف","نقض","عقوبة","صلح","criminal","criminal case","appeal"] },
  { id: "admin",      keywords: ["ديوان المظالم","حكومي","جهة حكومية","ترخيص","إداري","administrative","government","ministry"] },
];

function detectLegalArea(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const area of AREA_KEYWORDS) {
    if (area.keywords.some(kw => lower.includes(kw))) return area.id;
  }
  return undefined;
}

// ─── Mock AI response generator ──────────────────────────────────────────

function getMockResponse(question: string): { text: string; sources: string[] } {
  return {
    text: `بناءً على نظام العمل السعودي وأحدث لوائحه التنفيذية، إليك الإجابة التفصيلية حول سؤالك:\n\n**أولاً: الإطار النظامي**\nيُعدّ هذا الموضوع من المسائل التي تناولها نظام العمل الصادر بالمرسوم الملكي رقم م/51 بتاريخ 1426/8/23هـ، في المواد من (73) إلى (81) منه.\n\n**ثانياً: الشروط والضوابط**\n• يجب توافر ثلاثة عناصر أساسية: الركن المادي، والركن المعنوي، والإضرار بالطرف الآخر.\n• تُقدَّر الأضرار من قِبل المحكمة العمالية وفق ملابسات كل قضية.\n• مدة التقادم: لا تُسمع الدعوى بعد مرور 12 شهراً من تاريخ انتهاء العقد.\n\n**ثالثاً: توصيتي**\nيُنصح بتوثيق جميع المراسلات وجمع الإثباتات قبل رفع الدعوى. هل تودّ أن أساعدك في صياغة مذكرة مبدئية؟`,
    sources: ["نظام العمل م/51 • المادة 77", "لائحة العمل التنفيذية • الباب الخامس", "قرار وزارة الموارد البشرية رقم 4786"],
  };
}

// ─── Streaming text animation ─────────────────────────────────────────────────

function StreamingText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i += 2;
      } else {
        setDisplayed(text);
        clearInterval(interval);
      }
    }, 15);
    return () => clearInterval(interval);
  }, [text]);
  return <span className="whitespace-pre-wrap leading-relaxed">{displayed}</span>;
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function AIMessageBubble({ msg, isDark, isLatest }: { msg: Message; isDark: boolean; isLatest: boolean }) {
  const [copied, setCopied] = useState(false);

  function copyText() {
    navigator.clipboard.writeText(msg.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (msg.role === "system") {
    return (
      <div className="flex justify-center my-2">
        <span className={`text-[11px] rounded-full px-3 py-1 ${isDark ? "bg-white/[0.05] text-zinc-500" : "bg-zinc-100 text-zinc-400"}`}>{msg.text}</span>
      </div>
    );
  }

  const isUser = msg.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl shadow-sm ${isUser
        ? "bg-gradient-to-br from-zinc-700 to-zinc-600"
        : "bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50]"
      }`}>
        {isUser ? <User size={14} weight="fill" className="text-white" /> : <Robot size={14} weight="duotone" className="text-[#C8A762]" />}
      </div>

      <div className={`max-w-[82%] space-y-2 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {!isUser && (
          <span className="text-[10px] font-bold text-[#C8A762]">نظامي AI</span>
        )}

        {/* Bubble */}
        <div className={`rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${
          isUser
            ? "bg-[#0B3D2E] text-white rounded-tl-md"
            : isDark
              ? "bg-zinc-800/80 text-zinc-200 rounded-tr-md border border-white/[0.06]"
              : "bg-white text-zinc-800 rounded-tr-md shadow-sm border border-zinc-100"
        }`}>
          {isUser ? msg.text : isLatest ? <StreamingText text={msg.text} /> : <span className="whitespace-pre-wrap leading-relaxed">{msg.text}</span>}
        </div>

        {/* Sources */}
        {msg.sources && msg.sources.length > 0 && (
          <div className={`rounded-xl px-3 py-2.5 text-[11px] border ${isDark ? "border-white/[0.06] bg-zinc-900/50" : "border-zinc-100 bg-zinc-50/80"}`}>
            <p className={`font-bold mb-1.5 flex items-center gap-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              <Books size={11} /> المصادر القانونية:
            </p>
            {msg.sources.map((src, i) => (
              <p key={i} className={`${isDark ? "text-zinc-500" : "text-zinc-400"}`}>• {src}</p>
            ))}
          </div>
        )}

        {/* Metadata row */}
        <div className={`flex items-center gap-2 text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
          <span>{msg.time}</span>
          {!isUser && (
            <>
              <button onClick={copyText} aria-label={copied ? "تم النسخ" : "نسخ الرد"} className={`flex items-center gap-0.5 transition-colors hover:text-zinc-300`}>
                <Copy size={10} /> {copied ? "تم" : "نسخ"}
              </button>
              <button aria-label="تقييم الرد إيجابياً" className="hover:text-emerald-400 transition-colors"><ThumbsUp size={10} /></button>
              <button aria-label="تقييم الرد سلبياً" className="hover:text-red-400 transition-colors"><ThumbsDown size={10} /></button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AIConsultPage() {
  const { isDark, lang } = useTheme();
  const isRTL = lang === "ar";
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "sys-1",
      role: "system",
      text: "جلسة استشارة جديدة · نظامي AI MAX · مارس ٢٠٢٦",
      time: "",
    },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [showEscalation, setShowEscalation] = useState(false);
  const [detectedArea, setDetectedArea] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  function now() {
    const d = new Date();
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  async function sendMessage(text?: string) {
    const q = (text ?? input).trim();
    if (!q || isThinking) return;
    setInput("");

    const userMsg: Message = { id: Date.now().toString(), role: "user", text: q, time: now() };
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);

    await new Promise(r => setTimeout(r, 1800));

    const { text: aiText, sources } = getMockResponse(q);
    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "ai",
      text: aiText,
      time: now(),
      sources,
    };
    setMessages(prev => [...prev, aiMsg]);
    setIsThinking(false);
    // Detect legal area from user’s question and pass to escalation
    const area = detectLegalArea(q);
    setDetectedArea(area);
    // Show escalation CTA after first AI response
    setShowEscalation(true);
  }

  const bg = isDark ? "bg-zinc-950" : "bg-zinc-50/50";
  const hasMessages = messages.some(m => m.role !== "system");

  return (
    <div className={`flex flex-col h-[100dvh] md:h-[100dvh] ${bg}`} dir={isRTL ? "rtl" : "ltr"}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className={`flex-shrink-0 flex items-center justify-between px-5 py-3.5 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-200"}`}>
        <div>
          <h1 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>المستشار الذكي</h1>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>اسأل أي سؤال قانوني — نظامي AI يجيب فوراً</p>
        </div>
        <div className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] ${isDark ? "bg-[#0B3D2E]/30 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
          <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 2.5, repeat: Infinity }}
            className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <p className="ms-2 text-[10px] text-zinc-500 font-medium">
            متصل
          </p>
        </div>
      </div>

      {/* ── Messages ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          /* Empty state + quick prompts */
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50] shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)]"
            >
              <Robot size={36} weight="duotone" className="text-[#C8A762]" />
            </motion.div>
            <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
              المستشار القانوني الذكي
            </h2>
            <p className={`text-[13px] max-w-sm leading-relaxed mb-8 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              اطرح أي سؤال قانوني وسأجيبك بناءً على أنظمة المملكة العربية السعودية المحدّثة
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl w-full">
              {QUICK_PROMPTS.map((prompt, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.07 }}
                  whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                  onClick={() => sendMessage(prompt)}
                  className={`text-right rounded-2xl px-4 py-3.5 text-[13px] leading-snug transition-colors border ${isDark
                    ? "border-white/[0.07] bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 shadow-sm"
                  }`}
                >
                  <Lightning size={12} className="inline me-1.5 text-[#C8A762]" />
                  {prompt}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 py-5 space-y-5 max-w-4xl mx-auto">
            {messages.map((msg, i) => (
              <AIMessageBubble
                key={msg.id}
                msg={msg}
                isDark={isDark}
                isLatest={i === messages.length - 1 && msg.role === "ai"}
              />
            ))}

            {/* Thinking indicator */}
            <AnimatePresence>
              {isThinking && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex gap-3"
                >
                  <div className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50]">
                    <Robot size={14} weight="duotone" className="text-[#C8A762]" />
                  </div>
                  <div className={`rounded-2xl rounded-tr-md px-4 py-3 ${isDark ? "bg-zinc-800 border border-white/[0.06]" : "bg-white border border-zinc-100 shadow-sm"}`}>
                    <div className="flex items-center gap-1.5">
                      <motion.div className={`h-1.5 w-1.5 rounded-full ${isDark ? "bg-zinc-500" : "bg-zinc-300"}`}
                        animate={{ y: [0, -4, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0 }} />
                      <motion.div className={`h-1.5 w-1.5 rounded-full ${isDark ? "bg-zinc-500" : "bg-zinc-300"}`}
                        animate={{ y: [0, -4, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }} />
                      <motion.div className={`h-1.5 w-1.5 rounded-full ${isDark ? "bg-zinc-500" : "bg-zinc-300"}`}
                        animate={{ y: [0, -4, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }} />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Escalation Flow ── */}
            <AnimatePresence>
              {showEscalation && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="max-w-2xl"
                >
                  <EscalationFlow
                    complexityScore={68}
                    legalArea={detectedArea}
                    variant="inline"
                    onDismiss={() => setShowEscalation(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Disclaimer ────────────────────────────────────────────────────────── */}
      <div className={`flex-shrink-0 flex items-center justify-center gap-1.5 py-1.5 text-[10px] ${isDark ? "text-zinc-700" : "text-zinc-400"}`}>
        <Warning size={10} />
        الإجابات لأغراض استرشادية فقط ولا تُعدّ استشارة قانونية رسمية
      </div>

      {/* ── Input ─────────────────────────────────────────────────────────────── */}
      <div className={`flex-shrink-0 border-t px-4 pb-4 pt-3 ${isDark ? "border-white/[0.06]" : "border-zinc-200"}`}>
        <div className={`flex items-end gap-2 rounded-2xl border px-3 py-2 ${isDark ? "border-white/[0.08] bg-zinc-900/80 focus-within:border-[#C8A762]/40" : "border-zinc-200 bg-white focus-within:border-[#0B3D2E]/40 shadow-sm"}`}>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            className={`flex-shrink-0 p-1 ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
            <Paperclip size={17} />
          </motion.button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="اسأل عن أي موضوع قانوني..."
            rows={1}
            className={`flex-1 resize-none bg-transparent text-[14px] outline-none leading-relaxed placeholder:text-zinc-400 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}
            style={{ maxHeight: "140px" }}
          />

          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            className={`flex-shrink-0 p-1 ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
            <Microphone size={17} />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => sendMessage()}
            disabled={!input.trim() || isThinking}
            className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-[#0B3D2E] text-white shadow-md disabled:opacity-40"
          >
            <PaperPlaneTilt size={14} weight="fill" />
          </motion.button>
        </div>

        {/* Quick prompts row (when has messages) */}
        {hasMessages && (
          <div className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-none">
            {QUICK_PROMPTS.slice(0, 3).map((p, i) => (
              <button
                key={i}
                onClick={() => sendMessage(p)}
                className={`flex-shrink-0 rounded-xl px-3 py-1.5 text-[11px] border transition-colors ${isDark ? "border-white/[0.07] bg-zinc-900 hover:bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-500 shadow-sm"}`}
              >
                <MagicWand size={10} className="inline me-1 text-[#C8A762]" />
                {p.slice(0, 28)}...
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
