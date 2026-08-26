"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { CalendarBlank } from "@phosphor-icons/react";

import { STATUS_COLOR, type ClientCase } from "../_data";

/**
 * One order the client has open, on the landing page.
 *
 * WHAT IS NOT HERE, AND WHY — this card used to carry a lawyer's name and
 * type, a «مسار القضية» progress percentage, an «عاجل» flag and a
 * «الخطوة القادمة» line. A `service_requests` row supplies none of those: the
 * assignee is a bare user id with no name attached, there is no progress
 * column, and nothing marks a row urgent. They were removed rather than filled
 * with plausible numbers. Everything printed below is read off the row.
 */
export function CaseCard({ cs, isDark }: { cs: ClientCase; isDark: boolean }) {
  // THE BELT. The mapper is the fix — it only ever emits a CaseTone, and
  // STATUS_COLOR is typed Record<CaseTone, …> so a tone with no entry fails
  // the build. This fallback is here anyway because the bug it replaces
  // (STATUS_COLOR[undefined].bg, reached by casting a raw database row into
  // this component's props) took the entire client landing page down for every
  // client who had ever placed an order. A card must never again be the thing
  // that throws.
  const sc = STATUS_COLOR[cs.statusColor] ?? STATUS_COLOR.zinc;

  return (
    <Link href={`/dashboard/client/cases/${cs.id}`}>
      <motion.div
        whileHover={{ y: -3, boxShadow: "0 12px 32px -8px rgba(11,61,46,0.12)" }}
        className={`h-full rounded-2xl border p-5 cursor-pointer transition-all ${
          isDark
            ? "bg-zinc-900 border-white/[0.07] hover:border-royal/30"
            : "bg-white border-zinc-100 hover:border-royal/30"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
                {cs.statusLabel}
              </span>
              {cs.serviceLabel && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  isDark
                    ? "border-white/[0.08] text-zinc-400"
                    : "border-zinc-200 text-zinc-500"
                }`}>
                  {cs.serviceLabel}
                </span>
              )}
            </div>
            <p className={`text-[15px] font-bold leading-snug ${isDark ? "text-white" : "text-zinc-800"}`}>
              {cs.title}
            </p>
            <p className={`text-[11px] mt-1 font-mono ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              رقم الطلب: {cs.caseNo}
            </p>
          </div>
        </div>

        {/* Submission date — omitted entirely when the row's created_at is
            missing or unreadable, rather than printed as a dash or a guess. */}
        {cs.createdAtLabel && (
          <div className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium ${
            isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-50 text-zinc-500"
          }`}>
            <CalendarBlank size={13} className="text-amber-500 flex-shrink-0" />
            قُدّم في {cs.createdAtLabel}
          </div>
        )}
      </motion.div>
    </Link>
  );
}
