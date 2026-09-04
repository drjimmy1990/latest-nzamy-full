"use client";

import { motion } from "framer-motion";
import { PencilLine, SealCheck } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Main Component ──────────────────────────────────────────────────────────

interface DraftPreStepProps {
  onStartDraft: () => void;
  initialMode?: string;
}

// Mode labels for the context banner
const MODE_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  arbitration: { label: "صائغ حكم التحكيم",  desc: "سيبدأ الصائغ في وضع حكم التحكيم التجاري مباشرةً",  color: "indigo" },
  notary:      { label: "صائغ عقد التوثيق",   desc: "سيبدأ الصائغ في وضع عقد التوثيق الرسمي مباشرةً",    color: "emerald" },
  report:      { label: "صياغة تقرير",         desc: "سيبدأ الصائغ في وضع تقرير احترافي مباشرةً",         color: "blue" },
  minutes:     { label: "صياغة محضر",          desc: "سيبدأ الصائغ في وضع محضر اجتماع مباشرةً",           color: "amber" },
  reply:       { label: "رد احترافي",           desc: "سيبدأ الصائغ في صياغة رد قانوني احترافي مباشرةً",    color: "rose" },
};

export function DraftPreStep({ onStartDraft, initialMode = "" }: DraftPreStepProps) {
  const { isDark } = useTheme();

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" dir="rtl">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
              الصائغ القانوني
            </h1>
            <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-black text-[#C8A762] tracking-wider">PRO</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>اختر المسار المناسب لمهمتك</p>
        </div>

        {/* Mode context banner — shown when arriving from a sidebar link with ?mode= */}
        {initialMode && MODE_LABELS[initialMode] && (() => {
          const m = MODE_LABELS[initialMode];
          return (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
                isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-[#0B3D2E]/15 bg-[#0B3D2E]/5"
              }`}>
              <SealCheck size={16} weight="fill" className={isDark ? "text-[#C8A762] mt-0.5 flex-shrink-0" : "text-[#0B3D2E] mt-0.5 flex-shrink-0"} />
              <div>
                <p className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                  تم تحديد المسار: {m.label}
                </p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{m.desc}</p>
              </div>
            </motion.div>
          );
        })()}

        {/* Single card — was a 2-card grid before "مراجعة مذكرة" (Card B,
            owner items ٨٧/٨٨) was removed: a fake "processing" delay over
            MOCK_PARAS presented as an AI reading of the client's memo, with
            no five-dimension review engine behind it. */}
        <div className="grid grid-cols-1 gap-5 sm:max-w-sm">

          {/* A — صياغة جديدة */}
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onStartDraft}
            className={`group relative overflow-hidden rounded-3xl border p-6 text-start transition-all duration-300 ${
              isDark
                ? "border-[#0B3D2E]/40 bg-[#0B3D2E]/10 hover:border-[#0B3D2E]/70 hover:bg-[#0B3D2E]/20"
                : "border-[#0B3D2E]/20 bg-gradient-to-br from-[#0B3D2E]/5 to-emerald-50/80 hover:border-[#0B3D2E]/40 hover:shadow-lg hover:shadow-[#0B3D2E]/10"
            }`}
          >
            {/* Glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl group-hover:bg-emerald-500/20 transition-all" />

            {/* Icon */}
            <div className="relative mb-5">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#155e41] flex items-center justify-center shadow-lg shadow-[#0B3D2E]/30">
                <PencilLine size={24} weight="duotone" className="text-[#C8A762]" />
              </div>
            </div>

            {/* Content */}
            <div className="relative space-y-2">
              <p className={`font-bold text-[17px] ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>صياغة جديدة</p>
              <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                مذكرة · دعوى · رد · استئناف · طعن — صياغة احترافية من الصفر يعدّها فريق نظامي
              </p>
            </div>

            {/* Features */}
            <div className="relative flex flex-wrap gap-2 mt-5">
              {["تحديد نوع المذكرة", "رفع المستندات", "صياغة يدوية من الفريق", "استلام الملف النهائي"].map(f => (
                <span key={f} className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                  isDark
                    ? "border-emerald-700/30 text-emerald-400 bg-emerald-900/20"
                    : "border-[#0B3D2E]/20 text-[#0B3D2E] bg-[#0B3D2E]/5"
                }`}>✓ {f}</span>
              ))}
            </div>

            {/* CTA */}
            <div className={`relative mt-5 flex items-center gap-2 text-[12px] font-bold ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>
              <span>ابدأ الصياغة</span>
              <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>←</motion.span>
            </div>
          </motion.button>
        </div>

        {/* Bottom hint */}
        <p className={`text-center text-[11px] ${isDark ? "text-zinc-700" : "text-zinc-400"}`}>
          لصياغة خطاب رسمي أو إنذار قانوني ← انتقل لـ{" "}
          <a href="/ai/legal-opinion" className={`font-bold underline ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>الرأي الفصل</a>
        </p>
      </motion.div>
  );
}
