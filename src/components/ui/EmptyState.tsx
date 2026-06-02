"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { icon: "h-12 w-12", iconSize: "text-xl", title: "text-base", desc: "text-xs", py: "py-8" },
  md: { icon: "h-16 w-16", iconSize: "text-2xl", title: "text-lg", desc: "text-sm", py: "py-12" },
  lg: { icon: "h-20 w-20", iconSize: "text-3xl", title: "text-xl", desc: "text-sm", py: "py-16" },
};

export default function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = "md",
  className = "",
}: EmptyStateProps) {
  const s = sizeMap[size];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={`flex flex-col items-center justify-center text-center ${s.py} px-6 ${className}`}
    >
      {/* Icon container with subtle pulse ring */}
      <div className="relative mb-5">
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute inset-0 rounded-3xl bg-royal/5 dark:bg-royal/10`}
        />
        <div
          className={`relative flex ${s.icon} items-center justify-center rounded-3xl border border-slate-200/70 bg-white dark:border-white/10 dark:bg-dark-card shadow-[0_4px_20px_-8px_rgba(11,61,46,0.12)] ${s.iconSize} text-ink-faint dark:text-gray-500`}
        >
          {icon}
        </div>
      </div>

      {/* Text */}
      <h3 className={`font-semibold text-ink dark:text-gray-200 ${s.title} mb-1.5`}>
        {title}
      </h3>
      {description && (
        <p className={`text-ink-muted dark:text-gray-400 ${s.desc} max-w-[280px] leading-relaxed`}>
          {description}
        </p>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action && (
            action.href ? (
              <motion.a
                href={action.href}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 rounded-xl bg-royal px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.35)] hover:bg-royal-light transition-colors"
              >
                {action.label}
              </motion.a>
            ) : (
              <motion.button
                onClick={action.onClick}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 rounded-xl bg-royal px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.35)] hover:bg-royal-light transition-colors"
              >
                {action.label}
              </motion.button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <a
                href={secondaryAction.href}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card px-5 py-2.5 text-sm font-medium text-ink-muted dark:text-gray-400 hover:border-royal/20 hover:text-royal dark:hover:text-gold transition-all"
              >
                {secondaryAction.label}
              </a>
            ) : (
              <button
                onClick={secondaryAction.onClick}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card px-5 py-2.5 text-sm font-medium text-ink-muted dark:text-gray-400 hover:border-royal/20 hover:text-royal dark:hover:text-gold transition-all"
              >
                {secondaryAction.label}
              </button>
            )
          )}
        </div>
      )}
    </motion.div>
  );
}
