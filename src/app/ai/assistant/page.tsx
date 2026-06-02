"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Robot, PaperPlaneTilt, Microphone, Stop, Copy, Check,
  ArrowsClockwise, BookOpen, Gavel, FileText, Scales,
  DownloadSimple, Sparkle, ArrowLeft, X, CaretDown,
  ChatsCircle, ClockCounterClockwise, Trash, MicrophoneSlash,
  Lightbulb, ShieldCheck, Warning,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ─────────────────────────────────────────────────────────────────────
type Role = "user" | "assistant";
type Context = "general" | "case" | "contract" | "research";

interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  sources?: { label: string; ref: string }[];
  thinking?: boolean;
}

interface QuickPrompt {
  icon: React.ElementType;
  label: string;
  text: string;
  color: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const CONTEXTS: { id: Context; label: string; icon: React.ElementType }[] = [
  { id: "general",   label: "عام",            icon: Robot    },
  { id: "case",      label: "قضية محددة",     icon: Gavel    },
  { id: "contract",  label: "عقد أو وثيقة",  icon: FileText },
  { id: "research",  label: "بحث قانوني",     icon: BookOpen },
];

const QUICK_PROMPTS: QuickPrompt[] = [
  { icon: Scales,    label: "تحليل قانوني",  text: "حلل الوضع القانوني لتقصير صاحب العمل في صرف الراتب بعد إنذار رسمي.",       color: "text-blue-400"    },
  { icon: FileText,  label: "صياغة",          text: "اكتب بنوداً احترازية لعقد إيجار تجاري لحماية المؤجر عند التأخر في السداد.", color: "text-emerald-400"  },
  { icon: Gavel,     label: "استراتيجية",    text: "ما أفضل استراتيجية للدفاع في قضية فسخ عقد عمل دون سبب مشروع؟",            color: "text-amber-400"   },
  { icon: BookOpen,  label: "بحث قانوني",    text: "ابحث في أحكام نظام الشركات السعودي بشأن مسؤولية أعضاء مجلس الإدارة.",     color: "text-purple-400"  },
  { icon: ShieldCheck, label: "مراجعة",      text: "راجع هذا البند وأخبرني إن كان فيه ثغرات: 'يحق لأي طرف إنهاء العقد دون إشعار مسبق.'", color: "text-rose-400" },
  { icon: Warning,   label: "مخاطر",          text: "ما المخاطر القانونية لشراكة تجارية بدون عقد رسمي؟",                        color: "text-orange-400"  },
];

// Mock responses per context
function getMockResponse(userMessage: string, context: Context): { content: string; sources?: { label: string; ref: string }[] } {
  const responses = [
    {
      content: `بناءً على تحليلي للوضع القانوني في ضوء **نظام العمل السعودي الصادر بالمرسوم الملكي م/٥١**:

## الموقف القانوني

أولاً، يعدّ **التأخر في صرف الأجور** مخالفةً صريحةً للمادة (90) من نظام العمل التي توجب صرف الراتب في تاريخه المحدد.

ثانياً، في حال الإنذار الرسمي الموثّق، يحق للعامل وفق **المادة (81)** إنهاء العقد دون إشعار مسبق مع استحقاق كامل **مكافأة نهاية الخدمة** والتعويض عن الفترة المتبقية.

## التوصيات

- **توثيق الإنذارات** بصورة خطية موثقة أمام الجهات الرسمية
- **التقدم بشكوى** عبر منصة مساند أو هيئة العمل
- المطالبة بـ **المبالغ المستحقة + الفائدة وفق أحكام التأخير**

الحكم الأرجح: **لصالح العامل** في حال توفر الإنذار الرسمي والتوثيق الكافي.`,
      sources: [
        { label: "نظام العمل السعودي — المادة (٨١)",  ref: "م/٥١ — ١٤٢٦هـ" },
        { label: "نظام العمل السعودي — المادة (٩٠)",  ref: "م/٥١ — ١٤٢٦هـ" },
        { label: "قرار وزير الموارد البشرية رقم ٥١٢٠٩", ref: "١٤٤٢هـ"       },
      ],
    },
    {
      content: `فيما يخص **صياغة البنود الاحترازية** لعقد الإيجار التجاري، أقترح الآتي:

## بنود الحماية المقترحة

**البند الأول — الإخلاء عند التأخر:**
> يُعدّ المستأجر مخلاً بالتزاماته إذا تأخر في سداد الإيجار عن الموعد المحدد أكثر من خمسة عشر (١٥) يوماً، ويحق للمؤجر حينئذٍ إعذاره خطياً، وعند مضي سبعة (٧) أيام دون استجابة يحق له اللجوء لإخلاء العين فوراً.

**البند الثاني — الغرامة التأخيرية:**
> يستحق عن كل يوم تأخير في السداد غرامةٌ يومية قدرها (٢٪) من قيمة الإيجار الشهري، لا تتجاوز نسبتها الإجمالية (١٠٪) من قيمة العقد السنوي.

**البند الثالث — الضمان:**
> يُودع المستأجر ضماناً نقدياً قدره إيجار شهرين كاملين يُصادَر كلياً في حال الإخلال الجسيم.`,
      sources: [
        { label: "نظام الإيجار — اللائحة التنفيذية",   ref: "١٤٣٩هـ" },
        { label: "قرار هيئة العقار رقم ١١٢",           ref: "١٤٤٣هـ" },
      ],
    },
    {
      content: `**استراتيجية الدفاع في قضية الفسخ التعسفي** تقوم على ثلاثة محاور:

## المحور الأول — بطلان الفسخ

يستلزم إثبات أن الفسخ جاء دون سبب مشروع وفق **المادة (٧٤) من نظام العمل**. ويتحقق ذلك بـ:
- الطعن في أسباب الفسخ المُدّعاة وإثبات انعدامها أو عدم جسامتها
- إثبات أن الإجراءات التأديبية لم تُستنفد قبل الفسخ

## المحور الثاني — التعويض

حتى في حال قبول الفسخ، يستحق الموظف **وفق المادة (٨٠)**:
- مكافأة نهاية خدمة كاملة
- راتب فترة الإشعار (لا تقل عن ٦٠ يوماً)
- تعويض عادل يقدّره ديوان المظالم

## المحور الثالث — المطالبة العكسية

إن وُجدت مستحقات متأخرة (راتب، بدلات)، يُدرج بها في الدعوى للضغط على الطرف الآخر للتسوية.`,
      sources: [
        { label: "نظام العمل — المادة (٧٤)",  ref: "م/٥١" },
        { label: "نظام العمل — المادة (٨٠)",  ref: "م/٥١" },
        { label: "مبدأ قضائي ديوان المظالم ٢٤١٥", ref: "١٤٤١هـ" },
      ],
    },
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

// ─── Markdown-like renderer (simple) ──────────────────────────────────────────
function RenderContent({ content, isDark }: { content: string; isDark: boolean }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1.5 leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return <p key={i} className={`text-[13px] font-black mt-2 ${isDark ? "text-white" : "text-zinc-900"}`}>{line.slice(3)}</p>;
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return <p key={i} className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{line.slice(2, -2)}</p>;
        }
        if (line.startsWith("> ")) {
          return (
            <div key={i} className={`border-r-2 border-[#C8A762] pr-3 my-1.5 ${isDark ? "bg-white/[0.02]" : "bg-slate-50"} rounded-l-lg py-1.5`}>
              <p className={`text-[11px] leading-relaxed dir-auto ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{line.slice(2)}</p>
            </div>
          );
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[#C8A762] mt-1 flex-shrink-0 text-[10px]">•</span>
              <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{line.slice(2)}</p>
            </div>
          );
        }
        // bold inline
        if (line.includes("**")) {
          const parts = line.split(/\*\*(.*?)\*\*/g);
          return (
            <p key={i} className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
              {parts.map((part, j) => j % 2 === 1 ? <strong key={j} className={isDark ? "text-zinc-200 font-bold" : "text-zinc-800 font-bold"}>{part}</strong> : part)}
            </p>
          );
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i} className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{line}</p>;
      })}
    </div>
  );
}

// ─── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isDark }: { msg: Message; isDark: boolean }) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === "user";

  function copy() {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (msg.thinking) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2.5">
        <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
          <Robot size={14} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div className={`px-4 py-3 rounded-2xl rounded-bl-sm ${isDark ? "bg-zinc-800/80 border border-white/[0.06]" : "bg-white border border-slate-200 shadow-sm"}`}>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map(i => (
              <motion.span key={i} animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                className="w-1.5 h-1.5 rounded-full bg-[#C8A762]" />
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`flex items-end gap-2.5 group ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isUser
          ? isDark ? "bg-[#0B3D2E]/70 text-[#C8A762] font-black text-[10px]" : "bg-[#0B3D2E] text-[#C8A762] font-black text-[10px]"
          : isDark ? "bg-[#C8A762]/10" : "bg-amber-50"
      }`}>
        {isUser ? "م" : <Robot size={14} weight="duotone" className="text-[#C8A762]" />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[82%] space-y-2.5 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`px-4 py-3 rounded-2xl ${
          isUser
            ? isDark ? "bg-[#0B3D2E]/80 rounded-br-sm text-zinc-200" : "bg-[#0B3D2E] rounded-br-sm text-white"
            : isDark ? "bg-zinc-800/80 border border-white/[0.06] rounded-bl-sm" : "bg-white border border-slate-200 shadow-sm rounded-bl-sm"
        }`}>
          {isUser
            ? <p className="text-[13px] leading-relaxed">{msg.content}</p>
            : <RenderContent content={msg.content} isDark={isDark} />
          }
        </div>

        {/* Sources */}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {msg.sources.map((s, i) => (
              <span key={i} className={`flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full border ${
                isDark ? "border-blue-700/20 bg-blue-900/10 text-blue-400" : "border-blue-200 bg-blue-50 text-blue-600"
              }`}>
                <BookOpen size={9} />{s.label}
              </span>
            ))}
          </div>
        )}

        {/* Timestamp + actions */}
        <div className={`flex items-center gap-2 px-1 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? "flex-row-reverse" : ""}`}>
          <span className={`text-[9px] ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
            {msg.timestamp.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {!isUser && (
            <button onClick={copy} className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-lg transition ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}>
              {copied ? <Check size={9} className="text-emerald-500" /> : <Copy size={9} />}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Empty / welcome state ─────────────────────────────────────────────────────
function WelcomeScreen({ onPrompt, isDark }: { onPrompt: (t: string) => void; isDark: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 gap-6">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}
      >
        <Robot size={30} weight="duotone" className="text-[#C8A762]" />
      </motion.div>
      <div className="text-center">
        <h2 className={`text-[18px] font-black mb-1 ${isDark ? "text-white" : "text-zinc-900"}`}>مرحباً، أنا نظامي أسيستنت</h2>
        <p className={`text-[13px] max-w-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          مساعدك القانوني الذكي — اسألني عن أي موضوع قانوني، استراتيجية، صياغة، أو بحث تشريعي
        </p>
      </div>

      {/* Quick prompts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
        {QUICK_PROMPTS.map((qp, i) => {
          const Icon = qp.icon;
          return (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              onClick={() => onPrompt(qp.text)}
              className={`flex items-start gap-3 px-4 py-3 rounded-2xl border text-right transition-all ${
                isDark ? "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12]" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 shadow-sm"
              }`}
            >
              <Icon size={15} weight="duotone" className={`flex-shrink-0 mt-0.5 ${qp.color}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-[10px] font-bold uppercase mb-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{qp.label}</p>
                <p className={`text-[11px] text-right leading-snug line-clamp-2 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{qp.text}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Voice hook ────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySR = any;
function useVoice(onResult: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const ref = useRef<AnySR>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const r = new SR(); r.lang = "ar-SA"; r.continuous = false; r.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => { const t = Array.from(e.results as ArrayLike<SpeechRecognitionResult>).map((x: SpeechRecognitionResult) => x[0].transcript).join(" "); onResult(t); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    ref.current = r;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function toggle() { if (!ref.current) return; if (listening) { ref.current.stop(); setListening(false); } else { ref.current.start(); setListening(true); } }
  return { listening, supported, toggle };
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AssistantPage() {
  const { isDark } = useTheme();
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [context,     setContext]     = useState<Context>("general");
  const [showCtxMenu, setShowCtxMenu] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const ctxRef    = useRef<HTMLDivElement>(null);

  const voice = useVoice(t => setInput(p => p ? p + " " + t : t));

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close context menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setShowCtxMenu(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  }

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content, timestamp: new Date() };
    const thinkingMsg: Message = { id: "thinking", role: "assistant", content: "", timestamp: new Date(), thinking: true };

    setMessages(prev => [...prev, userMsg, thinkingMsg]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setLoading(true);

    // Simulate AI response delay
    await new Promise(r => setTimeout(r, 1800 + Math.random() * 1000));

    const { content: respContent, sources } = getMockResponse(content, context);
    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: respContent,
      timestamp: new Date(),
      sources,
    };

    setMessages(prev => prev.filter(m => m.id !== "thinking").concat(aiMsg));
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([]);
  }

  function downloadChat() {
    const text = messages.map(m => `[${m.role === "user" ? "أنت" : "نظامي"}] ${m.content}`).join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "nezamy-chat.txt"; a.click();
    URL.revokeObjectURL(url);
  }

  const ctxDef   = CONTEXTS.find(c => c.id === context)!;
  const CtxIcon  = ctxDef.icon;
  const hasChat  = messages.length > 0;

  return (
    <div className={`flex flex-col h-[calc(100vh-76px)] ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* ─── Top bar ─── */}
      <div className={`flex items-center gap-3 px-5 py-3 border-b flex-shrink-0 ${isDark ? "border-white/[0.06] bg-zinc-950" : "border-slate-100 bg-white"}`}>
        {/* Logo */}
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
          <Robot size={16} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>نظامي أسيستنت</p>
          <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مساعدك القانوني الذكي</p>
        </div>

        {/* Context selector */}
        <div className="relative" ref={ctxRef}>
          <button
            onClick={() => setShowCtxMenu(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
              isDark ? "border-white/[0.08] text-zinc-400 hover:text-zinc-200 bg-zinc-900" : "border-slate-200 text-slate-600 hover:text-zinc-800 bg-slate-50"
            }`}
          >
            <CtxIcon size={12} weight="duotone" />
            {ctxDef.label}
            <motion.span animate={{ rotate: showCtxMenu ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <CaretDown size={10} />
            </motion.span>
          </button>
          <AnimatePresence>
            {showCtxMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`absolute left-0 top-full mt-1.5 w-44 rounded-2xl border shadow-xl z-50 overflow-hidden ${isDark ? "border-white/[0.08] bg-zinc-900" : "border-slate-200 bg-white"}`}
              >
                {CONTEXTS.map(c => {
                  const Icon = c.icon;
                  return (
                    <button key={c.id} onClick={() => { setContext(c.id); setShowCtxMenu(false); }}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-right transition-colors ${
                        context === c.id
                          ? isDark ? "bg-white/[0.06] text-white" : "bg-slate-50 text-zinc-800 font-semibold"
                          : isDark ? "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200" : "text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <Icon size={13} weight="duotone" />
                      {c.label}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {hasChat && (
            <>
              <button onClick={downloadChat} title="تحميل المحادثة"
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${isDark ? "text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05]" : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"}`}>
                <DownloadSimple size={15} />
              </button>
              <button onClick={clearChat} title="مسح المحادثة"
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${isDark ? "text-zinc-600 hover:text-red-400 hover:bg-red-900/20" : "text-slate-400 hover:text-red-500 hover:bg-red-50"}`}>
                <Trash size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── Messages area ─── */}
      <div className={`flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin ${isDark ? "bg-zinc-950/60" : "bg-slate-50/60"}`}>
        {!hasChat
          ? <WelcomeScreen onPrompt={t => { setInput(t); sendMessage(t); }} isDark={isDark} />
          : messages.map(msg => <MessageBubble key={msg.id} msg={msg} isDark={isDark} />)
        }
        <div ref={bottomRef} />
      </div>

      {/* ─── Input bar ─── */}
      <div className={`flex-shrink-0 px-4 py-3 border-t ${isDark ? "border-white/[0.06] bg-zinc-950" : "border-slate-100 bg-white"}`}>
        <div className={`flex items-end gap-2 px-3 py-2 rounded-2xl border transition-all ${
          isDark ? "border-white/[0.08] bg-zinc-900/80 focus-within:border-[#C8A762]/30" : "border-slate-200 bg-white focus-within:border-[#C8A762]/50 shadow-sm"
        }`}>
          {/* Voice */}
          {voice.supported ? (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={voice.toggle}
              className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                voice.listening
                  ? "bg-red-500/20 text-red-400"
                  : isDark ? "text-zinc-600 hover:text-[#C8A762]" : "text-slate-400 hover:text-[#C8A762]"
              }`}
            >
              {voice.listening
                ? <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Infinity }}><Stop size={15} weight="fill" /></motion.span>
                : <Microphone size={15} weight="duotone" />
              }
            </motion.button>
          ) : null}

          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={voice.listening ? "🎙️ جارٍ الاستماع..." : "اسأل نظامي أسيستنت... (Enter للإرسال، Shift+Enter لسطر جديد)"}
            rows={1}
            disabled={loading}
            className={`flex-1 bg-transparent text-[13px] resize-none outline-none leading-relaxed max-h-[120px] overflow-y-auto ${
              isDark ? "text-zinc-200 placeholder-zinc-600" : "text-zinc-800 placeholder-slate-400"
            } ${voice.listening ? "placeholder-red-400" : ""}`}
            style={{ minHeight: "28px" }}
          />

          {/* Send */}
          <motion.button
            whileHover={input.trim() && !loading ? { scale: 1.08 } : {}}
            whileTap={input.trim() && !loading ? { scale: 0.92 } : {}}
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
              input.trim() && !loading
                ? "bg-[#0B3D2E] text-[#C8A762] shadow"
                : isDark ? "bg-zinc-800 text-zinc-600" : "bg-slate-100 text-slate-400"
            }`}
          >
            {loading
              ? <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><ArrowsClockwise size={14} /></motion.span>
              : <PaperPlaneTilt size={14} />
            }
          </motion.button>
        </div>

        {/* Footer hint */}
        <p className={`text-center text-[10px] mt-2 ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
          نظامي أسيستنت يُقدم معلومات قانونية استرشادية ولا يُغني عن محامٍ معتمد
        </p>
      </div>
    </div>
  );
}
