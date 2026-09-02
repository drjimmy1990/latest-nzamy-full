"use client";

import { motion } from "framer-motion";
import {
  ChatCircleDots, CaretLeft, HardHat, ArrowLeft, BookOpen,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

/**
 * المجيب القانوني السريع — معطّل عمداً (قريباً).
 *
 * كانت هذه الصفحة تعرض `MOCK_RESULT`: إجابة قانونية مُختلَقة (ميعاد الاستئناف
 * ٣٠ يوماً) مع "مصادر" ومقتطفات نصية مُصاغة يدوياً، تُقدَّم للمستخدم كنتيجة بحث
 * حقيقية بعد تأخير صناعي (setTimeout) يحاكي زمن المعالجة. لا يوجد أي محرّك
 * استدلال أو نموذج لغوي خلف هذه الأداة.
 *
 * لا تُعِد أي مصفوفة نتائج ثابتة هنا. حين يُربط محرّك حقيقي، تُبنى النتيجة من
 * استجابته وحدها ومن مصادر قابلة للتتبّع في قاعدة الأنظمة.
 */
export default function QuickAnswerPage() {
  const { isDark } = useTheme();

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl shadow-sm";

  return (
    <div
      className={`max-w-2xl mx-auto p-5 md:p-8 space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}
      dir="rtl"
    >
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/ai"
          className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}
        >
          نظامي AI
        </Link>
        <CaretLeft size={12} className={isDark ? "text-zinc-600" : "text-zinc-300"} />
        <span className={isDark ? "text-zinc-300" : "text-zinc-600"}>المجيب القانوني السريع</span>
      </div>

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <ChatCircleDots size={18} weight="duotone" className="text-blue-500" />
          </div>
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
            المجيب القانوني السريع
          </h1>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            قريباً
          </span>
        </div>
        <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          أداة قيد التطوير — لا تُصدر إجابات في الوقت الحالي
        </p>
      </div>

      {/* ── Honest unavailable state ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${card} p-6 md:p-8 text-center`}
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl ${
            isDark ? "bg-amber-500/10" : "bg-amber-50"
          }`}
        >
          <HardHat size={30} weight="duotone" className="text-amber-500" />
        </motion.div>

        <h2 className={`text-[17px] font-black mb-3 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
          هذه الأداة غير متاحة حالياً
        </h2>

        <p className={`text-[13px] leading-relaxed mb-2 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
          المجيب القانوني السريع لم يُربط بعد بمحرّك بحث أو نموذج قادر على
          الإجابة. حتى يكتمل ربطه، لن تعرض هذه الصفحة أي إجابة — لأن أي إجابة
          تُعرض الآن ستكون نصّاً مُعدّاً مسبقاً، لا نتيجة بحث في الأنظمة.
        </p>

        <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
          لا تعتمد على أي مصدر قانوني دون الرجوع إلى نصّه الرسمي أو إلى محامٍ
          مرخّص.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
          <Link
            href="/laws"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90 transition-colors"
          >
            <BookOpen size={14} weight="duotone" />
            تصفّح الأنظمة واللوائح
          </Link>
          <Link
            href="/ai"
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold border transition-colors ${
              isDark
                ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            العودة لأدوات نظامي AI
            <ArrowLeft size={12} />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
