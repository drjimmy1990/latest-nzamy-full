"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, CaretDown } from "@phosphor-icons/react";

// ── FAQItem ───────────────────────────────────────────────────────────────────
export function FAQItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }} transition={{ delay: index * 0.07 }}
      className="overflow-hidden rounded-2xl border border-slate-200/50 bg-white dark:border-white/10 dark:bg-dark-card"
    >
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-start">
        <span className="text-sm font-semibold text-ink dark:text-gray-100">{q}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <CaretDown size={16} className="shrink-0 text-ink-faint dark:text-gray-500" />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <p className="border-t border-slate-100 px-6 pb-5 pt-4 text-sm leading-relaxed text-ink-muted dark:border-white/10 dark:text-gray-400">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── CellValue ─────────────────────────────────────────────────────────────────
export function CellValue({ value }: { value: boolean | string | null }) {
  if (value === false || value === null) return <X size={16} className="mx-auto text-slate-300 dark:text-white/20" />;
  if (value === true)  return <Check size={16} weight="bold" className="mx-auto text-emerald-500" />;
  return <span className="text-xs font-medium text-ink-muted dark:text-gray-400">{value}</span>;
}
