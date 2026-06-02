"use client";
import { useState, useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { Bell, CheckCircle } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
const RIGHTS = [
  { article: "م ١٠٢", text: "إبلاغ الموقوف بأسباب توقيفه فور الضبط." },
  { article: "م ١٠٢", text: "تمكين الموقوف من الاتصال بأهله ومحاميه دون تأخير." },
  { article: "م ١٠٢ / م ٨٥", text: "عدم إكراه المتهم على الإدلاء بأي إفادة أو اعتراف." },
  { article: "م ١٠٢", text: "إبلاغ ذوي الموقوف خلال مدة لا تتجاوز ٢٤ ساعة." },
  { article: "م ١٠٢", text: "إحالة الموقوف للنيابة العامة خلال ٥ أيام من تاريخ الضبط." },
  { article: "م ١٠١", text: "حق الموقوف في الاستعانة بمحامٍ أثناء التحقيق." },
  { article: "م ٩٨", text: "عدم احتجاز الموقوف في أماكن غير رسمية معتمدة." },
  { article: "م ١٠٢", text: "تزويد الموقوف بالغذاء والرعاية الصحية اللازمة." },
];
export default function RightsReminderPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [checked, setChecked] = useState<number[]>([]);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const toggle = (i: number) => setChecked(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  const allDone = checked.length === RIGHTS.length;
  const rightsText = [
    "تقرير حقوق الموقوف",
    "====================",
    `اكتمال الضمانات: ${checked.length}/${RIGHTS.length}`,
    "",
    ...RIGHTS.map((right, index) => `- ${checked.includes(index) ? "مستوفى" : "غير مستوفى"}: ${right.article} — ${right.text}`),
  ].join("\n");
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-sky-500/10" : "bg-sky-50"}`}><Bell size={22} weight="duotone" className={isDark ? "text-sky-400" : "text-sky-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>مُذكّر حقوق الموقوف</h1><p className={`text-xs ${muted}`}>قائمة مرجعية لاستيفاء ضمانات الموقوف قبل إتمام الإجراءات</p></div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-sky-500/10 text-sky-400" : "bg-sky-100 text-sky-600"}`}>أداة ضابط</span>
        </div>
        {/* Progress */}
        <div className={`${card} p-4 shadow-sm`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-xs font-bold ${isDark ? "text-gray-200" : "text-gray-700"}`}>اكتمال الضمانات</p>
            <p className={`text-xs font-black ${allDone ? "text-emerald-500" : isDark ? "text-sky-400" : "text-sky-600"}`}>{checked.length}/{RIGHTS.length}</p>
          </div>
          <div className={`h-2 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
            <motion.div animate={{ width: `${(checked.length / RIGHTS.length) * 100}%` }} transition={{ duration: 0.4 }}
              className={`h-full rounded-full ${allDone ? "bg-emerald-500" : "bg-sky-500"}`} />
          </div>
          {allDone && <p className="text-xs text-emerald-500 font-bold mt-2 text-center">تم استيفاء جميع الحقوق</p>}
        </div>
        <BetaReviewGate toolId="gov.rights-reminder" toolName="قائمة ضمانات الموقوف" reviewScope="legal-data">
          {/* Checklist */}
          <div className={`${card} overflow-hidden shadow-sm`}>
            {RIGHTS.map((r, i) => (
              <button key={i} onClick={() => toggle(i)}
                className={`w-full flex items-center gap-4 p-4 text-start border-b last:border-0 transition ${isDark ? "border-[#2d3748] hover:bg-white/2" : "border-gray-100 hover:bg-gray-50"}`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${checked.includes(i) ? "border-emerald-500 bg-emerald-500" : isDark ? "border-gray-600" : "border-gray-300"}`}>
                  {checked.includes(i) && <CheckCircle size={14} weight="fill" className="text-white" />}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${checked.includes(i) ? "line-through opacity-50" : isDark ? "text-gray-200" : "text-gray-800"}`}>{r.text}</p>
                  <p className={`text-xs mt-0.5 font-bold ${isDark ? "text-sky-400/70" : "text-sky-600"}`}>{r.article}</p>
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => setChecked([])} className={`w-full py-2.5 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            إعادة تعيين
          </button>
          <AiResultActions text={rightsText} filename="gov-rights-checklist" showShare />
        </BetaReviewGate>
      </div>
    </div>
  );
}
