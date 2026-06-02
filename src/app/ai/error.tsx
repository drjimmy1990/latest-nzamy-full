"use client";

import { motion } from "framer-motion";
import { Warning, ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";

export default function AIError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full rounded-2xl border p-8 text-center space-y-5 bg-white border-zinc-200 dark:bg-zinc-900 dark:border-white/[0.07]"
      >
        <div className="h-14 w-14 mx-auto rounded-2xl flex items-center justify-center bg-red-50 dark:bg-red-500/10">
          <Warning size={28} weight="duotone" className="text-red-500" />
        </div>
        <div>
          <h2 className="text-[16px] font-bold mb-1.5 text-zinc-900 dark:text-zinc-100">
            حدث خطأ غير متوقع
          </h2>
          <p className="text-[12px] leading-relaxed text-zinc-500">
            حدث خطأ في تحميل هذه الصفحة. يمكنك المحاولة مجدداً أو العودة للرئيسية.
          </p>
          {process.env.NODE_ENV === "development" && (
            <p className="mt-2 text-[11px] font-mono text-red-400 break-all">
              {error.message}
            </p>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[12px] font-bold text-white"
          >
            إعادة المحاولة
          </button>
          <Link
            href="/ai"
            className="flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[12px] font-semibold border-zinc-200 text-zinc-600 dark:border-white/[0.08] dark:text-zinc-300"
          >
            <ArrowRight size={13} /> العودة
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
