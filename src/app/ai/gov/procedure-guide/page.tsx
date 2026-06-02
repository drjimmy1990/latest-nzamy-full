"use client";
import { useState, useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { ListBullets, ArrowLeft, ArrowRight, MagnifyingGlass } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
const PROCEDURES = [
  { id: 1, title: "التعامل مع بلاغ جريمة", category: "استجابة أولى", steps: ["التحقق من صحة البلاغ","التوجه للموقع فوراً","تأمين المشهد الجنائي","إبلاغ النيابة العامة","توثيق الأدلة وجمعها","استجواب الشهود أولياً"] },
  { id: 2, title: "إجراءات التوقيف المؤقت", category: "ضبط وإيقاف", steps: ["التأكد من مسوّغ التوقيف","إبلاغ الموقوف بحقوقه","تحرير محضر الضبط","إخطار ذوي الموقوف خلال ٢٤ ساعة","إحالة الأوراق للنيابة خلال ٥ أيام"] },
  { id: 3, title: "إجراءات تفتيش المسكن", category: "تفتيش", steps: ["الحصول على إذن نيابي مسبق","التحقق من صحة العنوان","الدخول بحضور مالك المسكن أو شاهدين","توثيق كل ما يُضبط","تحرير محضر تفصيلي"] },
  { id: 4, title: "التعامل مع حوادث السير الجسيمة", category: "حوادث", steps: ["تأمين مكان الحادث","الإسعاف الفوري للمصابين","إبلاغ المرور والمدني","تصوير المشهد قبل تحريكه","استيفاء شهادات الشهود","إعداد تقرير الحادث"] },
];
export default function ProcedureGuidePage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const filtered = PROCEDURES.filter(p => p.title.includes(search) || p.category.includes(search));
  const selectedProcedure = PROCEDURES.find((procedure) => procedure.id === selected);
  const selectedProcedureText = selectedProcedure
    ? [
        "دليل إجراء أمني",
        "====================",
        `الإجراء: ${selectedProcedure.title}`,
        `التصنيف: ${selectedProcedure.category}`,
        "",
        "الخطوات:",
        ...selectedProcedure.steps.map((step, index) => `${index + 1}. ${step}`),
      ].join("\n")
    : "";
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-sky-500/10" : "bg-sky-50"}`}><ListBullets size={22} weight="duotone" className={isDark ? "text-sky-400" : "text-sky-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>دليل الإجراءات الأمنية</h1><p className={`text-xs ${muted}`}>مرجع إجراءات الضبط والتحقيق وفق نظام الإجراءات الجزائية</p></div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-sky-500/10 text-sky-400" : "bg-sky-100 text-sky-600"}`}>أداة ضابط</span>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${isDark ? "border-[#2d3748] bg-[#161b22]" : "border-gray-200 bg-white"}`}>
          <MagnifyingGlass size={15} className={muted} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث في الإجراءات..."
            className={`bg-transparent outline-none text-sm flex-1 ${isDark ? "text-gray-200 placeholder:text-gray-600" : "text-gray-800 placeholder:text-gray-400"}`} />
        </div>
        <div className="space-y-3">
          {filtered.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className={`${card} overflow-hidden shadow-sm`}>
              <button onClick={() => setSelected(selected === p.id ? null : p.id)}
                className={`w-full flex items-center justify-between p-4 text-start transition ${isDark ? "hover:bg-white/2" : "hover:bg-gray-50"}`}>
                <div>
                  <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{p.title}</p>
                  <p className={`text-xs mt-0.5 ${muted}`}>{p.category} · {p.steps.length} خطوات</p>
                </div>
                <motion.div animate={{ rotate: selected === p.id ? 90 : 0 }} transition={{ duration: 0.2 }}>
                  <ArrowRight size={16} className={isDark ? "text-gray-500" : "text-gray-400"} />
                </motion.div>
              </button>
              {selected === p.id && (
                <BetaReviewGate toolId="gov.procedure-guide" toolName="دليل الإجراءات الأمنية" reviewScope="legal-data">
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ duration: 0.25 }}
                  className={`px-4 pb-4 border-t ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                  <ol className="space-y-2 mt-3">
                    {p.steps.map((s, si) => (
                      <li key={si} className={`flex items-center gap-3 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${isDark ? "bg-sky-500/10 text-sky-400" : "bg-sky-100 text-sky-700"}`}>{si + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                  <AiResultActions text={selectedProcedureText} filename="gov-procedure-guide" showShare className="mt-4" />
                </motion.div>
                </BetaReviewGate>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
