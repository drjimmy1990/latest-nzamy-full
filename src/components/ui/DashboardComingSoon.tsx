"use client";

import { motion } from "framer-motion";
import { HardHat, ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

/**
 * DashboardComingSoon — honest "قريباً" gate for dashboard sub-pages that
 * have no backend yet. Replaces mock-data screens so nothing fakes being real.
 */
export default function DashboardComingSoon({
  title,
  description,
  backHref,
}: {
  title: string;
  description?: string;
  backHref?: string;
}) {
  const { isDark } = useTheme();
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";

  return (
    <div className="max-w-2xl mx-auto py-16 px-4 text-center" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[1.5rem] ${
            isDark ? "bg-[#C8A762]/10" : "bg-[#C8A762]/10"
          }`}
        >
          <HardHat size={40} weight="duotone" className="text-[#C8A762]" />
        </motion.div>

        <h1 className={`text-2xl font-bold mb-3 ${tp}`}>{title}</h1>
        <p className={`text-sm leading-relaxed ${ts}`}>
          {description ?? "هذه الميزة قيد التطوير وستكون متاحة قريباً. لا توجد بيانات حقيقية لعرضها بعد."}
        </p>

        {backHref && (
          <Link
            href={backHref}
            className={`mt-8 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
              isDark
                ? "bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1]"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            <ArrowRight size={16} weight="bold" />
            العودة
          </Link>
        )}
      </motion.div>
    </div>
  );
}