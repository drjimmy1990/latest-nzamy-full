"use client";

import { motion } from "framer-motion";
import { BookOpen, ArrowRight, Lock } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

/**
 * LibraryClosedNotice — shown across the legal library while the owner has the
 * library closed (platform_settings.library_status = "closed").
 *
 * Honest by design: it says the library is temporarily closed and does NOT
 * promise a reopening date, because inventing one would be a fabricated claim
 * to users. The owner can supply a custom message from the admin console.
 */
export default function LibraryClosedNotice({
  message,
}: {
  message?: string | null;
}) {
  const { isDark } = useTheme();
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";

  return (
    <div className="max-w-2xl mx-auto py-20 px-4 text-center" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
      >
        <div
          className={`relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[1.5rem] ${
            isDark ? "bg-[#C8A762]/10" : "bg-[#C8A762]/10"
          }`}
        >
          <BookOpen size={40} weight="duotone" className="text-[#C8A762]" />
          <span
            className={`absolute -bottom-1 -left-1 flex h-8 w-8 items-center justify-center rounded-full ring-4 ${
              isDark ? "bg-zinc-900 ring-[#0C0F12]" : "bg-white ring-white"
            }`}
          >
            <Lock size={16} weight="fill" className="text-[#C8A762]" />
          </span>
        </div>

        <h1 className={`text-2xl font-bold mb-3 ${tp}`}>
          المكتبة القانونية مغلقة مؤقتاً
        </h1>
        <p className={`text-sm leading-relaxed ${ts}`}>
          {message ||
            "نعمل حالياً على تحديث محتوى المكتبة القانونية للتأكد من دقة النصوص. سنعيد فتحها فور الانتهاء."}
        </p>

        <Link
          href="/"
          className={`mt-8 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
            isDark
              ? "bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1]"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
          }`}
        >
          <ArrowRight size={16} weight="bold" />
          العودة للرئيسية
        </Link>
      </motion.div>
    </div>
  );
}
