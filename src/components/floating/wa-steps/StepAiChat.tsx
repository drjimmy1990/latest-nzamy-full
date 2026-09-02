"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Briefcase,
  Buildings,
  CalendarCheck,
  ChartBar,
  ChartLineUp,
  ChatCircle,
  ClipboardText,
  FileText,
  Gavel,
  HandHeart,
  House,
  Lightning,
  Lock,
  Money,
  PaperPlaneRight,
  Paperclip,
  PencilSimple,
  Robot,
  Scales,
  ShieldCheck,
  Storefront,
  Users,
  ArrowRight,
} from "@phosphor-icons/react";
import { staggerListVariants, staggerItemVariants } from "./WaShared";
import Link from "next/link";
import type { UserCategory } from "../types";
import { AI_QUESTIONS, AI_WELCOME } from "../types";

interface Props {
  isDark: boolean;
  isRTL: boolean;
  userCategory: UserCategory;
  isLoggedIn: boolean;
  onClose: () => void;
}

type Question = { q: string; placeholder: string; allowsFile: boolean };

type ChatMsg =
  | { role: "user"; text: string; id: number }
  | { role: "ai"; text: string; id: number }
  | { role: "ai_form"; category: string; questions: Question[]; id: number; submitted?: boolean }
  | { role: "escalation"; category: string; id: number };

const QUESTION_ICON_MAP: Record<string, React.ElementType> = {
  Lightning,
  House,
  Users,
  ClipboardText,
  Money,
  Lock,
  Storefront,
  Briefcase,
  FileText,
  ChartLineUp,
  Scales,
  CalendarCheck,
  PencilSimple,
  BookOpen,
  Gavel,
  ShieldCheck,
  HandHeart,
  ChartBar,
  Buildings,
  ChatCircle,
  Robot,
};

function getEscalationActions(userCategory: UserCategory, category: string) {
  switch (userCategory) {
    case "lawyer":
      return {
        primaryHref: "/ai/draft",
        primaryLabel: "فتح الصائغ القانوني",
        secondaryHref: "/dashboard/lawyer/cases",
        secondaryLabel: "ملفات القضايا",
      };
    case "firm":
      return {
        primaryHref: "/dashboard/firm/cases/assign",
        primaryLabel: "توزيع على الفريق",
        secondaryHref: "/dashboard/firm/compliance/conflict",
        secondaryLabel: "فحص التعارض",
      };
    case "corporate":
    case "business":
      return {
        primaryHref: "/dashboard/business/reviews/new",
        primaryLabel: "طلب مراجعة داخلية",
        secondaryHref: "/dashboard/business/seconded-counsel",
        secondaryLabel: "ندب مستشار",
      };
    case "micro":
      return {
        primaryHref: "/dashboard/micro/requests",
        primaryLabel: "إنشاء طلب للمنشأة",
        secondaryHref: "/dashboard/micro/requirements",
        secondaryLabel: "فحص الاشتراطات",
      };
    case "provider":
      return {
        primaryHref: "/dashboard/provider/requests",
        primaryLabel: "طلبات مناسبة",
        secondaryHref: "/dashboard/provider/profile",
        secondaryLabel: "تقوية الملف",
      };
    case "government":
      return {
        primaryHref: "/dashboard/government/external-counsel",
        primaryLabel: "ربط بمستشار خارجي",
        secondaryHref: "/dashboard/government/cases",
        secondaryLabel: "قضايا الجهة",
      };
    case "ngo":
      return {
        primaryHref: "/dashboard/ngo/contracts",
        primaryLabel: "عقود الجمعية",
        secondaryHref: "/dashboard/ngo/compliance",
        secondaryLabel: "الحوكمة",
      };
    case "admin":
      return {
        primaryHref: "/dashboard/admin/disputes",
        primaryLabel: "فتح التصعيد",
        secondaryHref: "/dashboard/admin/platform",
        secondaryLabel: "تناغم المنصة",
      };
    default:
      return {
        primaryHref: "/dashboard/client/consultation/new",
        primaryLabel: `محامٍ ${category}`,
        secondaryHref: "/dashboard/client/services",
        secondaryLabel: "خدمات أخرى",
      };
  }
}

function analyzeInput(text: string): { category: string; questions: Question[] } {
  let category = "عامة";
  let questions: Question[] = [
    { q: "متى حدث ذلك تقريباً؟", placeholder: "أدخل التاريخ أو المدة...", allowsFile: false },
    { q: "هل لديك أي مستندات أو إثباتات؟", placeholder: "عقد، رسائل، إلخ...", allowsFile: true },
    { q: "ما النتيجة التي تتمناها من هذا الإجراء؟", placeholder: "أريد حقي في...", allowsFile: false },
  ];

  if (text.match(/(راتب|فصل|طرد|عمل|وظيفة|مدير|شركة|دوام|استقالة|نهاية خدمة)/)) {
    category = "عمالية";
    questions = [
      { q: "كم راتبك الشهري بالضبط؟", placeholder: "المبلغ بالريال...", allowsFile: false },
      { q: "هل لديك عقد عمل موثق أو إثبات للعلاقة الوظيفية؟", placeholder: "نعم، عقد مسجل / لا يوجد...", allowsFile: true },
      { q: "هل تم إبلاغك بالقرار كتابياً أم شفهياً؟", placeholder: "كتابياً / شفهياً...", allowsFile: false },
    ];
  } else if (text.match(/(إيجار|شقة|عقار|بيت|أرض|إخلاء|مالك|مستأجر)/)) {
    category = "عقارية";
    questions = [
      { q: "هل العقد مسجل في منصة إيجار؟", placeholder: "نعم / لا...", allowsFile: false },
      { q: "متى بدأ الخلاف أو متى انتهى العقد؟", placeholder: "قبل شهر / الأسبوع الماضي...", allowsFile: false },
      { q: "هل تم توجيه إنذار رسمي بالإخلاء أو السداد؟", placeholder: "نعم عبر رسالة / لا...", allowsFile: true },
    ];
  } else if (text.match(/(طلاق|نفقة|حضانة|زواج|زوجي|زوجتي|أطفال|ورث|ميراث|تركة)/)) {
    category = "أحوال شخصية";
    questions = [
      { q: "هل يوجد أطفال قاصرون؟ وكم أعمارهم؟", placeholder: "نعم، طفلين 5 و 7 سنوات...", allowsFile: false },
      { q: "هل تم توثيق الأمر رسمياً (صك طلاق / حصر ورثة)؟", placeholder: "نعم يوجد صك / لا...", allowsFile: true },
      { q: "ما هو طلبك الأساسي بالتحديد؟", placeholder: "طلب حضانة / المطالبة بنفقة...", allowsFile: false },
    ];
  } else if (text.match(/(شيك|سند|كمبيالة|دين|سلف|مبلغ|حوالة|نصب|احتيال|تعويض)/)) {
    category = "مالية وتنفيذية";
    questions = [
      { q: "كم إجمالي المبلغ المتنازع عليه تقريباً؟", placeholder: "المبلغ بالريال...", allowsFile: false },
      { q: "هل لديك سندات تنفيذية (شيك، سند لأمر) أو إثباتات تحويل؟", placeholder: "نعم، سند لأمر / حوالات بنكية...", allowsFile: true },
      { q: "هل تمت المطالبة بالسداد ودياً قبل اللجوء للشكوى؟", placeholder: "نعم / لا...", allowsFile: false },
    ];
  } else if (text.match(/(تأسيس|شركة|شراكة|سجل تجاري|ضرائب|زكاة|علامة تجارية|سهم|حصص)/)) {
    category = "تجارية وشركات";
    questions = [
      { q: "ما هو الكيان القانوني للشركة (ذات مسؤولية محدودة، مؤسسة، إلخ)؟", placeholder: "نوع الشركة...", allowsFile: false },
      { q: "هل يوجد عقد تأسيس موثق أو اتفاقية شراكة مكتوبة؟", placeholder: "نعم / لا...", allowsFile: true },
      { q: "هل النزاع مع شريك آخر أم مع جهة حكومية؟", placeholder: "مع شريك / مع جهة...", allowsFile: false },
    ];
  }

  return { category, questions };
}

export default function StepAiChat({ isDark, isRTL, userCategory, isLoggedIn, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [formAnswers, setFormAnswers] = useState<Record<number, Record<number, string>>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, formAnswers]);

  const isFormPending = messages.some(m => m.role === "ai_form" && !m.submitted);

  const sendMessage = (text?: string) => {
    if (isFormPending) return;
    const msg = (text ?? input).trim();
    if (!msg) return;

    setMessages(prev => [...prev, { role: "user", text: msg, id: Date.now() }]);
    setInput("");
    setIsTyping(true);

    // Phase 1 -> 2: Analyze input and ask dynamic questions
    setTimeout(() => {
      const { category, questions } = analyzeInput(msg);
      setMessages(prev => [
        ...prev,
        { role: "ai", text: "أحتاج لبعض التفاصيل الإضافية لأتمكن من تقديم استشارة قانونية دقيقة لك.", id: Date.now() },
        { role: "ai_form", category, questions, id: Date.now() + 1 }
      ]);
      setIsTyping(false);
    }, 1200);
  };

  const updateFormAnswer = (msgId: number, qIdx: number, val: string) => {
    setFormAnswers(prev => ({
      ...prev,
      [msgId]: { ...(prev[msgId] || {}), [qIdx]: val }
    }));
  };

  const submitForm = (msgId: number, category: string, questions: Question[]) => {
    const answers = formAnswers[msgId] || {};
    const formattedAnswers = questions.map((q, i) => `${i + 1}- ${answers[i] || "لم يتم التحديد"}`).join("\n");

    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, submitted: true } : m));
    setMessages(prev => [...prev, { role: "user", text: `التفاصيل:\n${formattedAnswers}`, id: Date.now() }]);
    setIsTyping(true);

    // Phase 3 -> 4: Generate final result and custom escalation
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        { role: "ai", text: `بناءً على التفاصيل المذكورة، يبدو أن الموقف القانوني يندرج تحت القضايا الـ (${category}). الإجراء الأمثل هو توثيق المطالبة رسمياً وتجهيز كافة المستندات المذكورة. موقفك يتطلب تحركاً خلال المهلة النظامية لتجنب سقوط الحق بالتقادم.`, id: Date.now() },
        { role: "escalation", category, id: Date.now() + 1 }
      ]);
      setIsTyping(false);
    }, 2200);
  };

  const defaultQuestions = AI_QUESTIONS[userCategory ?? "default"] ?? AI_QUESTIONS["default"];
  const welcome = AI_WELCOME[userCategory ?? "default"] ?? AI_WELCOME["default"];

  return (
    <div className="flex flex-col" style={{ minHeight: 260 }}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-3 max-h-[320px] scrollbar-hide px-1 pb-2">
        {messages.length === 0 ? (
          <motion.div variants={staggerListVariants} initial="hidden" animate="show" className="flex flex-col gap-2 relative">
            <motion.div variants={staggerItemVariants} className="rounded-[1.25rem] px-4 py-3.5 text-[12px] font-medium leading-relaxed bg-[#0B3D2E] text-white shadow-lg shadow-[#0B3D2E]/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
              <div className="flex items-center gap-2 mb-2 relative z-10">
                <Robot size={18} weight="fill" className="text-[#C8A762]" />
                <span className="text-[11px] font-black tracking-widest text-[#C8A762]">نظامي AI</span>
              </div>
              <p className="relative z-10">{welcome}</p>
              <span className="block mt-2 text-white/70 text-[10px] font-bold relative z-10">
                كلما كانت التفاصيل أدق، كانت الإجابة أشمل.
              </span>
            </motion.div>

            <motion.p variants={staggerItemVariants} className={`text-[10px] font-bold mt-1 tracking-tight ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              الأسئلة الأكثر طلباً:
            </motion.p>
            {defaultQuestions.slice(0, 3).map((q, i) => (
              (() => {
                const Icon = QUESTION_ICON_MAP[q.icon] ?? ChatCircle;
                return (
              <motion.button
                variants={staggerItemVariants}
                key={i}
                onClick={() => sendMessage(q.text)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-[1.25rem] border text-[12px] font-bold text-start transition-all relative overflow-hidden group active:scale-[0.98]
                  ${isDark ? "bg-white/[0.02] border-white/10 text-gray-300 hover:bg-white/[0.06]" : "bg-white border-gray-200/70 text-gray-700 hover:bg-gray-50"}`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
                <span className={`shrink-0 ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>
                  <Icon size={16} weight="duotone" />
                </span>
                <span className="flex-1 leading-snug">{q.text}</span>
              </motion.button>
                );
              })()
            ))}
          </motion.div>
        ) : (
          <>
            {messages.map(m => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>

                {m.role === "user" || m.role === "ai" ? (
                  /* `text-gray-200` was here on the DARK branch. src/app/globals.css:103
                     redefines --color-gray-200 as rgba(255,255,255,0.1) — a surface
                     tint, not a text colour — so in dark mode this bubble rendered
                     the visitor's own message at 10% white on a 10% white
                     background. They could not read what they had just typed.
                     `zinc-*` is not remapped by that block. */
                  <div className={`max-w-[88%] rounded-[1.25rem] px-4 py-3 text-[12px] font-medium leading-relaxed shadow-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? isDark ? "bg-white/10 text-zinc-200 rounded-tl-sm" : "bg-gray-100/80 text-gray-800 rounded-tl-sm"
                      : "bg-[#0B3D2E] text-white rounded-tr-sm shadow-[#0B3D2E]/20"
                  }`}>
                    {m.text}
                  </div>
                ) : m.role === "ai_form" && !m.submitted ? (
                  <div className={`w-full rounded-[1.25rem] p-4 shadow-sm border-2 ${isDark ? "bg-emerald-950/20 border-emerald-500/20" : "bg-emerald-50/50 border-emerald-200/60"}`}>
                    <p className={`text-[12px] font-black mb-3.5 ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>
                      لأقدم لك استشارة دقيقة، يرجى توضيح التالي:
                    </p>
                    <div className="space-y-3">
                      {m.questions.map((q, idx) => (
                        <div key={idx}>
                          <label className={`text-[11px] font-bold block mb-1.5 ${isDark ? "text-gray-300" : "text-gray-800"}`}>{q.q}</label>
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              placeholder={q.placeholder}
                              value={(formAnswers[m.id] || {})[idx] || ""}
                              onChange={e => updateFormAnswer(m.id, idx, e.target.value)}
                              className={`w-full rounded-xl border px-3 py-2 text-[12px] font-medium outline-none transition-all focus:ring-2 focus:ring-[#0B3D2E]/20 ${
                                isDark ? "bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-emerald-500" : "bg-white border-gray-200/70 text-gray-800 focus:border-[#0B3D2E]"
                              }`}
                            />
                            {q.allowsFile && (
                              <button aria-label="إرفاق ملف" className="absolute left-2 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#0B3D2E] dark:hover:text-emerald-400 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                                <Paperclip size={14} weight="bold" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => submitForm(m.id, m.category, m.questions)}
                      className="w-full mt-4 py-3 rounded-xl bg-[#0B3D2E] text-white text-[12px] font-bold hover:bg-[#0d4d39] active:scale-[0.98] transition-all shadow-md shadow-[#0B3D2E]/20"
                    >
                      إرسال التفاصيل
                    </button>
                  </div>
                ) : m.role === "escalation" ? (
                  (() => {
                    const actions = getEscalationActions(userCategory, m.category);
                    return (
                      <div className={`w-full rounded-[1.25rem] p-3.5 border-2 ${isDark ? "bg-amber-950/20 border-amber-500/20" : "bg-amber-50/50 border-amber-200/60"}`}>
                        <p className={`text-[11px] font-black mb-1.5 ${isDark ? "text-amber-400" : "text-amber-800"}`}>
                          التصنيف الأقرب: {m.category}
                        </p>
                        <p className={`text-[11px] font-medium mb-3 leading-relaxed ${isDark ? "text-amber-100/70" : "text-amber-900/70"}`}>
                          الخطوة التالية تختلف حسب نوع حسابك، لذلك أعددت لك أقصر مسار منطقي من داخل المنصة.
                        </p>
                        <div className="flex gap-2">
                          <Link href={actions.primaryHref} onClick={onClose}
                            className={`flex-1 flex justify-center py-2.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 shadow-sm
                              ${isDark ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30" : "bg-white hover:bg-amber-50 text-amber-800 border border-amber-200"}`}
                          >
                            {actions.primaryLabel}
                          </Link>
                          {/* `text-gray-200` on the dark branch: globals.css:103 makes
                              that token rgba(255,255,255,0.1), so this button's label
                              was invisible against its own bg-white/[0.05]. */}
                          <Link href={actions.secondaryHref} onClick={onClose}
                            className={`flex-1 flex justify-center py-2.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 shadow-sm
                              ${isDark ? "bg-white/[0.05] hover:bg-white/10 text-zinc-200" : "bg-white hover:bg-gray-50 text-gray-800 border border-gray-200/70"}`}
                          >
                            {actions.secondaryLabel}
                          </Link>
                        </div>
                        {!isLoggedIn && (
                          <div className="flex items-center justify-center mt-3">
                            <Link href="/register" onClick={onClose} className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1">
                              سجّل مجاناً للوصول الكامل <ArrowRight size={10} weight="bold" />
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : null}
              </motion.div>
            ))}

            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="bg-[#0B3D2E] rounded-[1.25rem] rounded-tr-sm px-4 py-3.5 flex items-center gap-1.5 shadow-sm shadow-[#0B3D2E]/20">
                  {[0, 1, 2].map(i => (
                    <motion.span
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                      className="w-1.5 h-1.5 rounded-full bg-emerald-400 block"
                    />
                  ))}
                </div>
              </motion.div>
            )}
            <div ref={scrollRef} className="h-1" />
          </>
        )}
      </div>

      {/* Input */}
      <div className={`pt-3 mt-1 border-t relative ${isDark ? "border-white/10" : "border-gray-100"}`}>
        {isFormPending && (
          <div className="absolute inset-0 z-10 bg-white/50 dark:bg-[#09090b]/50 backdrop-blur-[1px] flex items-center justify-center rounded-[1.25rem] mt-3">
            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">الرجاء إكمال التفاصيل أعلاه أولاً</span>
          </div>
        )}
        <div className={`flex items-center gap-3 rounded-[1.25rem] border px-4 py-2.5 shadow-sm transition-all focus-within:ring-4 focus-within:border-[#0B3D2E] ${isDark ? "border-white/10 bg-white/[0.02] focus-within:ring-white/5 focus-within:border-white/30" : "border-gray-200/70 bg-white focus-within:ring-[#0B3D2E]/10"}`}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder="اكتب سؤالك القانوني أو ردك..."
            disabled={isFormPending}
            className="flex-1 bg-transparent text-[13px] font-medium outline-none text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isFormPending}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-[#0B3D2E]/5 dark:bg-emerald-500/10 text-[#0B3D2E] dark:text-emerald-400 disabled:opacity-30 disabled:scale-95 hover:bg-[#0B3D2E] hover:text-white dark:hover:bg-emerald-500 dark:hover:text-white transition-all active:scale-90 shrink-0"
          >
            <PaperPlaneRight size={16} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  );
}
