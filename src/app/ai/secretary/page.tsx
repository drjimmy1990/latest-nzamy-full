"use client";

import { motion } from "framer-motion";
import { Robot, CaretLeft, HardHat, ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

/**
 * السكرتير القانوني الذكي — مؤجّل بقرار المالك (قريباً).
 *
 * ما حُذف من هذه الصفحة ولماذا:
 *
 * • `INITIAL_RULES` / `INITIAL_DECISIONS` / `INITIAL_ACTIVITY` / `INITIAL_CHAT` —
 *   مصفوفات مُختلَقة كانت تُعرض كقواعد أتمتة نشطة، وقرارات مسجّلة، وأنشطة
 *   "اليوم" (بأوقات ومبالغ وأسماء عملاء)، ورسالة ترحيب موجّهة لمستخدم باسم
 *   ثابت. لم يكن أيٌّ منها مرتبطاً بحساب المستخدم أو بقاعدة بيانات.
 *
 * • ودجت «مستجدات تشريعية» — ثلاث سلاسل نصية ثابتة بتواريخ وشارة «٣ جديد»،
 *   تُقدَّم كتحديثات تشريعية حيّة. لا يوجد مصدر رصد خلفها.
 *
 * • المحادثة — كان الرد التلقائي «تم تسجيل ذلك في السجل، وسأقوم بتذكيرك…»
 *   يَعِد بتسجيل وتذكير لا يحدثان: لا شيء كان يُحفظ، ولا تذكير كان يُرسل.
 *
 * لا تُعِد أي بيانات ثابتة هنا. حين تُبنى الأداة فعلياً، تُقرأ القواعد
 * والقرارات والأنشطة من قاعدة البيانات لكل مستخدم على حدة.
 */
export default function SecretaryPage() {
  const { isDark } = useTheme();

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/ai"
          className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}
        >
          نظامي AI
        </Link>
        <CaretLeft size={12} className={isDark ? "text-zinc-600" : "text-slate-300"} />
        <span className={isDark ? "text-zinc-300" : "text-slate-600"}>السكرتير القانوني</span>
      </div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[#0B3D2E]/10 flex items-center justify-center">
          <Robot size={24} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1
              className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}
              style={{ fontFamily: "var(--font-brand)" }}
            >
              السكرتير القانوني الذكي
            </h1>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              قريباً
            </span>
          </div>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            أداة قيد التطوير — غير مفعّلة على حسابك
          </p>
        </div>
      </motion.div>

      {/* Honest unavailable state */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={`${card} p-6 md:p-10 text-center`}
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

        <h2 className={`text-[17px] font-black mb-3 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
          هذه الأداة غير متاحة حالياً
        </h2>

        <p className={`text-[13px] leading-relaxed mb-4 max-w-[52ch] mx-auto ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
          السكرتير القانوني الذكي مؤجَّل حتى إشعار آخر. قواعد الأتمتة، وسجل
          القرارات، ورصد المستجدات التشريعية لم تُبنَ بعد — ولن تعرض هذه الصفحة
          قواعد أو قرارات أو تنبيهات، لأن أي شيء يُعرض الآن سيكون بيانات
          افتراضية لا تخص حسابك ولا تُشغّل أي إجراء فعلي.
        </p>

        <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
          لا تعتمد عليها في متابعة مواعيد أو التزامات — استخدم تقويمك وأدوات
          المتابعة المعتمدة لديك.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
          <Link
            href="/ai"
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold border transition-colors ${
              isDark
                ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
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
