"use client";

import { motion } from "framer-motion";
import { ArrowsLeftRight, Buildings, GraduationCap, Briefcase, Calendar, CaretRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

export default function SecondmentPage() {
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-slate-100 rounded-2xl shadow-sm";

  return (
    <div className="max-w-[800px] mx-auto space-y-6" dir={isAr ? "rtl" : "ltr"}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
          {isAr ? "عرض إعارة محامٍ (Secondment)" : "Offer Lawyer Secondment"}
        </h1>
        <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          {isAr ? "أتح فرصة لمحاميك للعمل لدى إدارة قانونية في شركة أو جهة حكومية لتعزيز خبراته، أو استقطب محامياً مؤقتاً لمكتبك." : "Allow your lawyers to work for a corporate legal department to gain experience, or hire a temporary lawyer."}
        </p>
      </motion.div>

      <div className={`${card} p-8`}>
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className={`p-5 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-colors ${isDark ? "border-emerald-500/30 bg-emerald-500/5" : "border-emerald-500/30 bg-emerald-50"}`}>
            <Buildings size={32} className="text-emerald-500 mx-auto mb-3" weight="duotone" />
            <h3 className={`text-sm font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>{isAr ? "إعارة للشركات" : "Corporate Secondment"}</h3>
            <p className={`text-xs ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{isAr ? "أرسل محامياً للعمل كمسؤول قانوني مؤقت" : "Send a lawyer as temporary in-house counsel"}</p>
          </div>
          <div className={`p-5 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-colors ${isDark ? "border-white/[0.08] hover:border-royal/30" : "border-slate-200 hover:border-royal/30"}`}>
            <Briefcase size={32} className="text-royal mx-auto mb-3" weight="duotone" />
            <h3 className={`text-sm font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>{isAr ? "تبادل بين المكاتب" : "Inter-Firm Exchange"}</h3>
            <p className={`text-xs ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{isAr ? "اكتساب خبرة في قضايا نوعية" : "Gain experience in niche practice areas"}</p>
          </div>
        </div>

        <form className="space-y-5">
          <div>
            <label className={`block text-xs font-bold mb-2 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
              {isAr ? "اختر المحامي المرشح للإعارة" : "Select Lawyer for Secondment"}
            </label>
            <select className={`w-full p-3 rounded-xl border text-sm outline-none ${isDark ? "bg-zinc-800 border-white/[0.08] text-white" : "bg-zinc-50 border-slate-200 text-slate-800"}`}>
              <option>تركي العمر — محامي</option>
              <option>نورة الشمري — محامي</option>
              <option>خالد الحربي — متدرب</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className={`block text-xs font-bold mb-2 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                {isAr ? "مدة الإعارة (أشهر)" : "Duration (Months)"}
              </label>
              <input type="number" defaultValue={6} className={`w-full p-3 rounded-xl border text-sm outline-none ${isDark ? "bg-zinc-800 border-white/[0.08] text-white" : "bg-zinc-50 border-slate-200 text-slate-800"}`} />
            </div>
             <div>
              <label className={`block text-xs font-bold mb-2 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                {isAr ? "تاريخ البدء المتوقع" : "Expected Start Date"}
              </label>
              <input type="date" className={`w-full p-3 rounded-xl border text-sm outline-none ${isDark ? "bg-zinc-800 border-white/[0.08] text-white" : "bg-zinc-50 border-slate-200 text-slate-800"}`} />
            </div>
          </div>
          <button type="button" className="w-full py-3 mt-4 rounded-xl bg-[#0B3D2E] text-white text-sm font-bold flex items-center justify-center gap-2">
            <ArrowsLeftRight size={18} /> {isAr ? "نشر عرض الإعارة" : "Publish Secondment Offer"}
          </button>
        </form>
      </div>
    </div>
  );
}
