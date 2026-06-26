"use client";

import { motion } from "framer-motion";
import * as PhosphorIcons from "@phosphor-icons/react";

interface LibraryHeroProps {
  isDark: boolean;
  isRTL: boolean;
  muted: string;
}

export function LibraryHero({ isDark, isRTL, muted }: LibraryHeroProps) {
  return (
    <section className="relative pt-24 pb-8 overflow-hidden mt-6">
      <div className="absolute top-0 right-0 -mr-32 -mt-32 opacity-20 pointer-events-none">
        <svg width="404" height="404" fill="none" viewBox="0 0 404 404">
          <defs>
            <pattern id="dot-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="2" fill={isDark ? "#ffffff" : "#0B3D2E"} />
            </pattern>
          </defs>
          <rect width="404" height="404" fill="url(#dot-pattern)" />
        </svg>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C8A762]/10 border border-[#C8A762]/20 text-[#C8A762] text-xs font-bold"
        >
          <PhosphorIcons.Crown size={14} weight="fill" />
          {isRTL ? "المكتبة القانونية الشاملة" : "Comprehensive Legal Library"}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className={`text-3xl md:text-4xl font-black tracking-tight mb-3 ${isDark ? "text-white" : "text-[#0B3D2E]"}`}
        >
          {isRTL ? "الأنظمة والتشريعات" : "Laws & Regulations"}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className={`max-w-2xl mx-auto text-xs md:text-sm leading-relaxed ${muted}`}
        >
          {isRTL
            ? "مرجعك الشامل والمحدث لكافة الأنظمة والمبادئ القضائية بالمملكة."
            : "Your comprehensive and updated reference for all laws, regulations, and judicial principles."}
        </motion.p>
      </div>
    </section>
  );
}
