"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  UsersThree, Plus, ChatCircleDots, FileText,
  Sparkle, ArrowSquareOut, Warning, CheckCircle,
  ClipboardText, Gavel, Handshake,
} from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import { useTheme } from "@/components/ThemeProvider";

const HR_QUICK_ACTIONS = [
  { icon: FileText,      label: "صياغة عقد عمل",         desc: "محدد / غير محدد / تدريب" },
  { icon: Gavel,         label: "إنهاء خدمة موظف",        desc: "تعويض، إجراءات، مخاطر" },
  { icon: ClipboardText, label: "سياسة داخلية",           desc: "إجازات، عمل عن بُعد، خصوصية" },
  { icon: Handshake,     label: "تسوية نزاع عمالي",       desc: "قبل التقاضي أو أمام المحكمة" },
];

const LABOR_ALERTS = [
  { severity: "error",   text: "موظفان نسبة السعودة لديهم أقل من الحد الأدنى المطلوب (نيتاقات)" },
  { severity: "warning", text: "٣ موظفين لم يستلموا إشعار تجديد عقودهم بعد ٦٠ يوماً" },
  { severity: "ok",      text: "جميع رواتب أغسطس محوّلة في الموعد — مرتاح نظام حماية الأجور" },
];

const MOCK_HR_RESPONSE = `بناءً على المادة (٧٧) من نظام العمل السعودي وتعديلاته:

**إنهاء عقد العمل غير المحدد المدة**

**الإجراءات الصحيحة:**
١. إشعار مسبق لا يقل عن ٣٠ يوماً تُحدد خلالها مهام التسليم
٢. صرف الراتب الكامل لفترة الإشعار حتى لو أُعفي الموظف من الحضور
٣. احتساب مكافأة نهاية الخدمة: ١/٣ مرتب عن كل سنة للخمس الأولى، ٢/٣ للخمس التالية، مرتب كامل لما زاد عن ١٠ سنوات

**المخاطر القانونية إذا كان الإنهاء تعسفياً:**
• تعويض يساوي أجر شهرين عن كل سنة خدمة
• الإضرار بسمعة الشركة أمام المختصة العمالية

> يُوصى بتوثيق أسباب الإنهاء في ملف الموظف قبل اتخاذ الإجراء.`;

function StreamingText({ text }: { text: string }) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);
  const start = () => {
    let i = 0;
    const iv = setInterval(() => {
      if (i < text.length) { setShown(text.slice(0, i + 4)); i += 4; }
      else { setShown(text); clearInterval(iv); setDone(true); }
    }, 10);
  };
  if (!done && shown === "" && text) { start(); }
  return <pre className="whitespace-pre-wrap font-sans text-[13px] leading-[1.9]">{shown}</pre>;
}

export default function CorpHRPage() {
  const { isDark } = useTheme();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  async function ask(q?: string) {
    const question = q || query;
    if (!question.trim()) return;
    setLoading(true); setResponse(null);
    await new Promise(r => setTimeout(r, 2000));
    setResponse(MOCK_HR_RESPONSE); setLoading(false);
  }

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>مستشار الموارد البشرية</h1>
            <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#C8A762]">PRO</span>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">جديد</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            استشارة قانونية عمالية فورية — عقود، إنهاء خدمة، نزاعات، نيتاقات
          </p>
        </div>
        <div className={`flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-orange-900/20" : "bg-orange-50"}`}>
          <UsersThree size={22} weight="duotone" className="text-orange-500" />
        </div>
      </div>

      {/* Alerts */}
      <div className="space-y-2">
        {LABOR_ALERTS.map((alert, i) => (
          <div key={i} className={`flex items-center gap-3 rounded-xl border p-3.5 ${
            alert.severity === "error"   ? isDark ? "border-red-700/30 bg-red-900/10"     : "border-red-200 bg-red-50"     :
            alert.severity === "warning" ? isDark ? "border-amber-700/30 bg-amber-900/10" : "border-amber-200 bg-amber-50" :
                                          isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"
          }`}>
            {alert.severity === "ok" ? <CheckCircle size={15} className="text-emerald-500 flex-shrink-0" /> : <Warning size={15} className={`flex-shrink-0 ${alert.severity === "error" ? "text-red-500" : "text-amber-500"}`} />}
            <p className={`text-[12px] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{alert.text}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {HR_QUICK_ACTIONS.map((action, i) => (
          <motion.button key={i} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => setQuery(action.label)}
            className={`${card} p-3.5 text-start shadow-sm hover:border-orange-500/30 transition-colors`}>
            <action.icon size={18} className="text-orange-500 mb-2" weight="duotone" />
            <p className={`text-[12px] font-semibold mb-0.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{action.label}</p>
            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{action.desc}</p>
          </motion.button>
        ))}
      </div>

      {/* Chat input */}
      <div className={`${card} p-4 shadow-sm`}>
        <div className={`flex items-start gap-3 rounded-xl border p-3 mb-3 ${isDark ? "border-white/[0.07] bg-zinc-800/50" : "border-zinc-200 bg-zinc-50"}`}>
          <ChatCircleDots size={18} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
          <textarea value={query} onChange={e => setQuery(e.target.value)} rows={2}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), ask())}
            placeholder="اسأل عن أي موضوع عمالي: كيف أنهي عقد موظف؟ كيف أحسب مكافأة نهاية الخدمة؟..."
            className={`flex-1 bg-transparent resize-none text-[13px] outline-none leading-relaxed ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-zinc-400"}`}
          />
        </div>
        <div className="flex justify-end">
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            onClick={() => ask()} disabled={!query.trim() || loading}
            className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2 text-[12px] font-bold text-white shadow-md disabled:opacity-40">
            <Sparkle size={13} weight="fill" />
            {loading ? "جارٍ التحليل..." : "استشر"}
          </motion.button>
        </div>
      </div>

      {/* Response */}
      {loading && (
        <div className={`${card} p-5 flex items-center gap-3`}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
            <UsersThree size={20} className="text-orange-500" />
          </motion.div>
          <p className={`text-[13px] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>يراجع نظام العمل والتعاميم العمالية...</p>
        </div>
      )}
      {response && (
        <BetaReviewGate toolId="corp.hr" toolName="رأي المستشار العمالي" reviewScope="legal-data">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} overflow-hidden shadow-sm`}>
          <div className={`px-5 py-3 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
            <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>رأي المستشار العمالي</p>
          </div>
          <AiResultActions
            text={response}
            filename="corp-hr-response"
            showShare
            className="px-5 pt-4"
          />
          <div className={`p-5 ${isDark ? "bg-zinc-800/20" : "bg-zinc-50/50"}`}>
            <StreamingText text={response} />
          </div>
        </motion.div>
        </BetaReviewGate>
      )}
    </div>
  );
}
