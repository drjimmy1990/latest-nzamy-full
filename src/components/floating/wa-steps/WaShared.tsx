"use client";

import { motion } from "framer-motion";

// ─── Shared sub-components used across WA step files ─────────────────────────

export function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1 mb-3 justify-center" role="progressbar" aria-valuenow={current} aria-valuemax={total} aria-label={`الخطوة ${current + 1} من ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all ${
            i < current
              ? "bg-[#0B3D2E] w-5"
              : i === current
              ? "bg-[#C8A762] w-5"
              : "bg-gray-200 dark:bg-white/15 w-3"
          }`}
        />
      ))}
    </div>
  );
}

export function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-xl px-3 py-2 text-xs font-semibold border transition-all ${
        selected
          ? "bg-[#0B3D2E] text-white border-[#0B3D2E]"
          : "bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-[#0B3D2E]/40"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Shared style builders ─────────────────────────────────────────────────────

export function rowBtnClass(isDark: boolean) {
  return `w-full flex items-center gap-3.5 px-4 py-3.5 rounded-[1.25rem] border text-start transition-all duration-300 relative overflow-hidden group
    ${
      isDark
        ? "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] text-white"
        : "border-gray-200/70 bg-white hover:bg-gray-50/80 text-gray-800"
    }
    hover:border-[#0B3D2E]/30 hover:shadow-sm active:scale-[0.98]`;
}

// ─── Animation Variants ────────────────────────────────────────────────────────
export const staggerListVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

export const staggerItemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  show: { 
    opacity: 1, 
    y: 0, 
    scale: 1, 
    transition: { type: "spring", stiffness: 260, damping: 24 } 
  },
};
