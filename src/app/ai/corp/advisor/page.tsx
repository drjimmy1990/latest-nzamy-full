"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import {
  Buildings, ChatCircleDots, Sparkle, ArrowRight,
  Lightning, Robot, Copy, CheckCircle, Warning,
  Handshake, Scroll, ShieldCheck, ChartLine,
} from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import { useTheme } from "@/components/ThemeProvider";

const QUICK_TOPICS = [
  { icon: Handshake,  label: "إتمام صفقة أو شراكة",      desc: "مخاطر قانونية وشروط التفاوض" },
  { icon: Scroll,     label: "صياغة / مراجعة عقد تجاري", desc: "توريد، وكالة، امتياز، SaaS" },
  { icon: ShieldCheck,label: "الامتثال التنظيمي",         desc: "هيئة السوق المالية، وزارة التجارة" },
  { icon: ChartLine,  label: "دخول سوق جديد",             desc: "التراخيص، المتطلبات، المخاطر" },
];

const EXAMPLE_QUESTIONS = [
  "ما متطلبات الترخيص لتأسيس شركة تقنية في السعودية؟",
  "هل يلزمني نظام حماية البيانات الشخصية في نشاطي التجاري؟",
  "ما حقوق الشركة عند إخلال الموزع ببنود العقد؟",
  "كيف أحمي علامتي التجارية من التقليد؟",
];

const MOCK_RESPONSE = `بناءً على استفسارك حول متطلبات ترخيص شركة تقنية في المملكة العربية السعودية:

**أولاً: أنواع التراخيص المطلوبة**
• **السجل التجاري:** من وزارة التجارة — يُستخرج إلكترونياً عبر منصة "بلدي"
• **ترخيص النشاط التقني:** من هيئة الاتصالات وتقنية المعلومات (CITC) للأنشطة المرخصة
• **الحساب البنكي التجاري:** شرط مسبق لاستكمال الإجراءات

**ثانياً: رأس المال الأدنى**
• للشركة ذات مسؤولية محدودة (LLC): لا يوجد حد أدنى للشركات السعودية بالكامل
• للشركات الأجنبية 100%: يتراوح بين ٥٠٠,٠٠٠ — ٣٠,٠٠٠,٠٠٠ ريال حسب النشاط

**ثالثاً: المدة الزمنية**
يستغرق التأسيس الكامل ٧–٣٠ يوم عمل في الغالب عبر منصة "نظام الاستثمار".

> [تحذير] **تنبيه:** هذه معلومات إرشادية — يُنصح بالتحقق من آخر الاشتراطات عبر منصة استثمر في السعودية.`;

function StreamingText({ text }: { text: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown(""); let i = 0;
    const iv = setInterval(() => {
      if (i < text.length) { setShown(text.slice(0, i + 4)); i += 4; }
      else { setShown(text); clearInterval(iv); }
    }, 10);
    return () => clearInterval(iv);
  }, [text]);
  return <pre className="whitespace-pre-wrap font-sans text-[13px] leading-[1.9]">{shown}</pre>;
}

export default function CorpAdvisorPage() {
  const { isDark } = useTheme();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  async function ask(q?: string) {
    const query = q || input;
    if (!query.trim()) return;
    setLoading(true); setResponse(null);
    await new Promise(r => setTimeout(r, 2200));
    setResponse(MOCK_RESPONSE); setLoading(false);
  }

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>المستشار التجاري</h1>
            <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#C8A762]">PRO</span>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">جديد</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            استشارة قانونية تجارية فورية مخصصة للشركات — امتثال، عقود، صفقات، تراخيص
          </p>
        </div>
        <div className={`flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-blue-900/30" : "bg-blue-50"}`}>
          <Buildings size={22} weight="duotone" className="text-blue-500" />
        </div>
      </div>

      {/* Quick topics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK_TOPICS.map((topic, i) => (
          <motion.button key={i} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => { setInput(topic.label); }}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`${card} p-3.5 text-start shadow-sm hover:border-blue-500/30 transition-colors`}>
            <topic.icon size={18} className="text-blue-500 mb-2" weight="duotone" />
            <p className={`text-[12px] font-semibold mb-0.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{topic.label}</p>
            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{topic.desc}</p>
          </motion.button>
        ))}
      </div>

      {/* Input */}
      <div className={`${card} p-4 shadow-sm`}>
        <div className={`flex items-start gap-3 rounded-xl border p-3 mb-3 ${isDark ? "border-white/[0.07] bg-zinc-800/50 focus-within:border-blue-500/30" : "border-zinc-200 bg-zinc-50 focus-within:border-blue-400/40"}`}>
          <ChatCircleDots size={18} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), ask())}
            placeholder="اسأل عن أي موضوع قانوني يخص نشاطك التجاري..."
            rows={2}
            className={`flex-1 bg-transparent resize-none text-[13px] outline-none leading-relaxed ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-zinc-400"}`}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.slice(0, 2).map((q, i) => (
              <button key={i} onClick={() => { setInput(q); }}
                className={`text-[10px] rounded-xl px-2.5 py-1 border transition-colors ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-500 hover:text-zinc-300" : "border-zinc-200 bg-white text-zinc-400 hover:text-zinc-600"}`}>
                <Lightning size={8} className="inline me-1 text-blue-500" />{q}
              </button>
            ))}
          </div>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            onClick={() => ask()} disabled={!input.trim() || loading}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-[13px] font-bold text-white shadow-md disabled:opacity-40">
            <Sparkle size={14} weight="fill" />
            {loading ? "جارٍ التحليل..." : "استشر"}
          </motion.button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${card} p-5 flex items-center gap-3 shadow-sm`}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
            <Robot size={20} weight="duotone" className="text-blue-500" />
          </motion.div>
          <div>
            <p className={`text-[14px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>جارٍ تحليل سؤالك...</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>يراجع الأنظمة التجارية والتعاميم السارية</p>
          </div>
        </motion.div>
      )}

      {/* Response */}
      {response && (
        <BetaReviewGate toolId="corp.advisor" toolName="رأي المستشار التجاري" reviewScope="legal-data">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} overflow-hidden shadow-sm`}>
          <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
            <div className="flex items-center gap-2">
              <Robot size={14} className="text-blue-500" />
              <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>رأي المستشار التجاري</span>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(response); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className={`flex items-center gap-1 text-[11px] ${isDark ? "text-zinc-600 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
              {copied ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
              {copied ? "تم" : "نسخ"}
            </button>
          </div>
          <AiResultActions
            text={response}
            filename="corp-advisor-response"
            showShare
            className="px-5 pt-4"
          />
          <div className={`p-5 ${isDark ? "bg-zinc-800/20" : "bg-zinc-50/50"}`}>
            <StreamingText text={response} />
          </div>
          <div className={`px-5 py-3 border-t ${isDark ? "border-white/[0.04]" : "border-zinc-50"}`}>
            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
              <Warning size={12} weight="fill" className="inline ml-1 text-amber-500" /> هذا رأي إرشادي لا يُغني عن الاستشارة القانونية الرسمية
            </p>
          </div>
        </motion.div>
        </BetaReviewGate>
      )}
    </div>
  );
}
