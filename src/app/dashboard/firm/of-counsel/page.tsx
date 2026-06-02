"use client";

import { motion } from "framer-motion";
import { UserCircle, ShieldCheck, Handshake, Link, Scales, Star, CaretRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

export default function OfCounselPage() {
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-slate-100 rounded-2xl shadow-sm";

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir={isAr ? "rtl" : "ltr"}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
          {isAr ? "المستشارون الخارجيون (Of-Counsel)" : "Of-Counsel Network"}
        </h1>
        <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          {isAr ? "تعاون مع خبراء متخصصين لدعم قضايا مكتبك المعقدة بسرية تامة." : "Collaborate with specialized experts to support your firm's complex cases."}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className={`md:col-span-2 ${card} p-6`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
              {isAr ? "المستشارون المرتبطون بالمكتب" : "Associated Counsel"}
            </h2>
            <button className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3D2E] text-white">
              {isAr ? "دعوة مستشار" : "Invite Counsel"}
            </button>
          </div>

          <div className="space-y-4">
            {[
              { name: "د. طارق المالكي", spec: "قضايا الملكية الفكرية", status: "نشط", cases: 2 },
              { name: "المستشار فهد الدوسري", spec: "التحكيم الدولي", status: "نشط", cases: 1 },
            ].map((c, i) => (
              <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <UserCircle size={24} weight="duotone" />
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{c.name}</h3>
                    <p className={`text-xs mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{c.spec}</p>
                  </div>
                </div>
                <div className="text-left">
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-md font-bold">{c.status}</span>
                  <p className={`text-xs mt-1 font-medium ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {c.cases} {isAr ? "قضايا نشطة" : "Active cases"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`md:col-span-1 ${card} p-6 bg-gradient-to-b ${isDark ? "from-royal/10 to-transparent" : "from-royal/5 to-transparent"}`}>
          <div className="w-12 h-12 bg-royal/10 rounded-xl flex items-center justify-center text-royal mb-4">
            <Handshake size={24} weight="duotone" />
          </div>
          <h2 className={`text-lg font-bold mb-2 ${isDark ? "text-white" : "text-slate-800"}`}>
            {isAr ? "سوق الخبراء" : "Expert Network"}
          </h2>
          <p className={`text-xs leading-relaxed mb-6 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            {isAr ? "هل تحتاج لخبرة نادرة في قضية معينة؟ ابحث في شبكة نظامي المغلقة عن مستشارين بدرجة (Of-Counsel)." : "Need rare expertise for a specific case? Search Nezamy's closed network for Of-Counsel experts."}
          </p>
          <button className="w-full py-3 rounded-xl border border-royal text-royal text-sm font-bold flex items-center justify-center gap-2 hover:bg-royal hover:text-white transition-colors">
            <Scales size={16} /> {isAr ? "استكشف الخبراء" : "Explore Experts"}
          </button>
        </div>
      </div>
    </div>
  );
}
