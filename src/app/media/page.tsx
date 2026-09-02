"use client";

import { motion } from "framer-motion";
import { PlayCircle, HardHat, ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";

/**
 * ميديا نظامي — قريباً.
 *
 * حُذف `src/app/media/data.ts` بالكامل. كان يحتوي على أربع مصفوفات مُختلَقة
 * تُعرض كمكتبة محتوى قائمة: `REELS` (٦ مقاطع بعناوين وأعداد مشاهدات مثل
 * «٢٣١ك» ومدد زمنية)، و`EPISODES` (٥ حلقات بودكاست مرقّمة)، و`NOVELS`
 * (٣ روايات بعدد فصول وحالة اكتمال)، و`COMICS` (٦ إصدارات بعدد صفحات).
 * لا يوجد أيٌّ من هذا المحتوى — لا مقطع ولا حلقة ولا فصل واحد.
 *
 * وحُذف معه جدار الدفع الذي كان يعرض قفلاً فوق تلك البطاقات ويطلب اشتراكاً
 * بـ «٩ ر.س/شهر» (عبر `requestEntitlement`) مقابل محتوى غير موجود.
 *
 * لا تُعِد أي مصفوفة ثابتة هنا. حين يُنشر محتوى حقيقي، يُقرأ من مصدره.
 */
export default function MediaPage() {
  return (
    <div
      dir="rtl"
      className="min-h-[100dvh] bg-[#050a08] flex items-center justify-center px-4 py-24"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        className="max-w-lg text-center"
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-[1.5rem] border border-[#C8A762]/25 bg-[#C8A762]/10"
        >
          <HardHat size={38} weight="duotone" className="text-[#C8A762]" />
        </motion.div>

        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#C8A762]/30 bg-[#C8A762]/5 px-3 py-1">
          <PlayCircle size={11} weight="fill" className="text-[#C8A762]" />
          <span className="text-[10px] font-black uppercase tracking-widest text-[#C8A762]">
            ميديا نظامي
          </span>
        </div>

        <h1 className="text-[30px] font-black leading-tight tracking-tight text-white md:text-[38px]">
          قريباً
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          ريلز قانونية، وبودكاست، وروايات، وكوميكس — قيد الإعداد. لم يُنشر أي
          محتوى بعد، ولذلك لا تعرض هذه الصفحة قائمة محتوى ولا تفتح أي اشتراك.
        </p>

        <p className="mt-3 text-xs leading-relaxed text-zinc-600">
          سيُفتح القسم فور توفّر أول إصدار حقيقي.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[#C8A762] px-6 py-3 text-[12px] font-bold text-[#050a08] transition-colors hover:bg-[#C8A762]/90"
          >
            الصفحة الرئيسية
          </Link>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-6 py-3 text-[12px] font-bold text-zinc-400 transition-colors hover:bg-white/5"
          >
            المدونة القانونية
            <ArrowLeft size={12} />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
