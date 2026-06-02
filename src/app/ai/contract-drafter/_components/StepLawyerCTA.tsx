"use client";

import { motion } from "framer-motion";
import { CheckCircle, ShieldCheck, Seal, Star, Clock, Sparkle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { Mode } from "./contractTypes";

interface Props {
  mode: Mode;
  onRestart: () => void;
}

// ─── StepLawyerCTA ────────────────────────────────────────────────────────────

export default function StepLawyerCTA({ mode, onRestart }: Props) {
  const { theme, lang } = useTheme();
  const isDark = theme === "dark";
  const isRTL = lang === "ar";

  const whyItems = [
    { icon: ShieldCheck, ar: "حماية قانونية", en: "Legal Protection", descAr: "تأكيد توافق العقد مع الأنظمة السعودية", descEn: "Ensure contract complies with Saudi law" },
    { icon: Seal, ar: "اعتراف رسمي", en: "Official Recognition", descAr: "عقد موثق ومعترف به أمام الجهات الرسمية", descEn: "A notarized contract recognized by authorities" },
    { icon: Star, ar: "بنود محكمة", en: "Solid Clauses", descAr: "تعزيز العقد بضمانات وشروط جزائية صحيحة", descEn: "Strengthen contract with valid penalties and guarantees" },
  ];

  return (
    <motion.div key="step5" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="max-w-3xl mx-auto">
      {/* Success header */}
      <div className="text-center mb-10">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6 relative"
        >
          <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full" />
          <CheckCircle size={50} weight="fill" className="text-emerald-500 relative z-10" />
        </motion.div>
        <h2 className={`text-3xl font-black mb-3 tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`} style={{ fontFamily: 'var(--font-brand)' }}>
          {isRTL
            ? (mode === "review" ? "تم فحص العقد مبدئياً! 🎉" : "تمّت صياغة المسودة! 🎉")
            : (mode === "review" ? "Contract analyzed! 🎉" : "Draft created successfully! 🎉")}
        </h2>
        <p className={`text-[15px] max-w-lg mx-auto font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          {isRTL
            ? (mode === "review" ? "اكتشفنا بعض النقاط الهامة. الخطوة التالية هي توجيه محامٍ معتمد لسد الثغرات وإحكام العقد." : "مسودتك جاهزة. الخطوة التالية هي مراجعة محامٍ معتمد لضمان سلامتها القانونية قبل التوقيع.")
            : (mode === "review" ? "We detected some flags. Next step: assign a certified lawyer to secure your contract." : "Your draft is ready. Next step: have a certified lawyer review it before signing.")}
        </p>
      </div>

      {/* Why lawyer */}
      <div className={`rounded-[2rem] border p-8 mb-8 ${isDark ? "border-white/10 bg-zinc-900/50 backdrop-blur-xl" : "border-zinc-200 bg-white shadow-lg"}`}>
        <h3 className={`font-black mb-6 text-lg tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
          {isRTL ? "لماذا تحتاج مراجعة المحامي؟" : "Why do you need a lawyer review?"}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {whyItems.map((item) => (
            <div key={item.ar} className={`rounded-[1.5rem] p-5 transition-colors ${isDark ? "bg-white/5 hover:bg-white/10" : "bg-zinc-50 hover:bg-zinc-100"}`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${isDark ? "bg-[#0B3D2E]/20 text-emerald-400" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                <item.icon size={26} weight="duotone" />
              </div>
              <p className={`font-bold text-[14px] mb-1.5 ${isDark ? "text-zinc-200" : "text-zinc-900"}`}>{isRTL ? item.ar : item.en}</p>
              <p className={`text-[12px] leading-relaxed font-medium ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{isRTL ? item.descAr : item.descEn}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className={`relative overflow-hidden rounded-[2rem] border p-8 mb-8 bg-gradient-to-br ${isDark ? "from-[#0B3D2E]/20 to-[#C8A762]/10 border-emerald-500/30" : "from-[#0B3D2E]/5 to-[#C8A762]/5 border-emerald-200 shadow-sm"}`}>
        <div className="absolute top-0 end-0 w-64 h-64 bg-emerald-500/10 blur-[60px] pointer-events-none rounded-full" />
        <div className="flex items-center justify-between flex-wrap gap-6 relative z-10">
          <div>
            <div className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold mb-3 ${isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-800"}`}>
              {isRTL ? "الباقة الأكثر طلباً" : "Most Popular"}
            </div>
            <p className={`text-[16px] font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
              {isRTL ? "مراجعة قانونية من محامٍ معتمد" : "Legal Review by Certified Lawyer"}
            </p>
            <div className="flex items-end gap-1 mb-2">
              <span className={`text-4xl font-black ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>{isRTL ? "٩٩" : "99"}</span>
              <span className={`text-sm pb-1 font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{isRTL ? "ر.س" : "SAR"}</span>
            </div>
            <p className={`text-[13px] font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {isRTL ? "• تقرير مكتوب مفصّل • خلال ٢٤ ساعة" : "• Detailed written report • Within 24 hours"}
            </p>
          </div>
          <div className="flex flex-col gap-3 min-w-[220px]">
            <motion.a
              href="/dashboard/client/consultations/new?service=contract-review"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center justify-center gap-2 bg-[#0B3D2E] text-white font-bold px-6 py-3.5 rounded-[1rem] text-[15px] hover:bg-[#0a3328] transition-colors shadow-[0_4px_14px_0_rgba(11,61,46,0.39)] hover:shadow-[0_6px_20px_rgba(11,61,46,0.23)]"
            >
              <Sparkle size={18} weight="fill" />
              {isRTL ? "اطلب مراجعة الآن" : "Request Review Now"}
            </motion.a>
            <motion.a
              href="/services/consultations"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className={`flex items-center justify-center gap-2 font-bold px-6 py-3.5 rounded-[1rem] text-[15px] transition-colors border ${
                isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm"
              }`}
            >
              <Clock size={18} />
              {isRTL ? "احجز استشارة أشمل" : "Book a Full Consultation"}
            </motion.a>
          </div>
        </div>
      </div>

      {/* Restart */}
      <div className="text-center">
        <button
          onClick={onRestart}
          className={`text-[14px] font-bold transition-colors ${isDark ? "text-zinc-500 hover:text-white" : "text-zinc-400 hover:text-zinc-900"}`}
        >
          {isRTL ? "← إنشاء أو مراجعة عقد آخر" : "← Create or review another contract"}
        </button>
      </div>
    </motion.div>
  );
}
