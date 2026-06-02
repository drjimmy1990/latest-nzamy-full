"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Clock, UserCircle, Warning } from "@phosphor-icons/react";

import { STATUS_COLOR, type ClientCase } from "../_data";

export function CaseCard({ cs, isDark }: { cs: ClientCase; isDark: boolean }) {
  const sc = STATUS_COLOR[cs.statusColor];

  return (
    <Link href={`/dashboard/client/cases/${cs.id}`}>
      <motion.div
        whileHover={{ y: -3, boxShadow: "0 12px 32px -8px rgba(11,61,46,0.12)" }}
        className={`rounded-2xl border p-5 cursor-pointer transition-all ${
          isDark
            ? "bg-zinc-900 border-white/[0.07] hover:border-royal/30"
            : "bg-white border-zinc-100 hover:border-royal/30"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {cs.urgent && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold bg-red-50 text-red-500 border border-red-200 px-1.5 py-0.5 rounded-full dark:bg-red-900/20 dark:border-red-700/30">
                  <Warning size={9} weight="fill" /> عاجل
                </span>
              )}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
                {cs.statusLabel}
              </span>
            </div>
            <p className={`text-[15px] font-bold leading-snug ${isDark ? "text-white" : "text-zinc-800"}`}>
              {cs.title}
            </p>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              رقم القضية: {cs.caseNo}
            </p>
          </div>
          <div className={`flex-shrink-0 text-center rounded-xl border p-2.5 min-w-[80px] ${
            isDark ? "border-white/[0.07] bg-zinc-800/50" : "border-zinc-100 bg-zinc-50"
          }`}>
            <UserCircle size={20} className="text-royal mx-auto mb-0.5" weight="duotone" />
            <p className={`text-[10px] font-bold truncate ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{cs.lawyer}</p>
            <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{cs.lawyerType}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className={`flex items-center justify-between mb-1.5 text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            <span>مسار القضية</span>
            <span className="font-mono font-bold">{cs.progress}%</span>
          </div>
          <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}>
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-royal to-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: `${cs.progress}%` }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.3 }}
            />
          </div>
        </div>

        {/* Next action */}
        <div className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium ${
          isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-50 text-zinc-500"
        }`}>
          <Clock size={13} className="text-amber-500 flex-shrink-0" />
          {cs.nextAction}
        </div>
      </motion.div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
