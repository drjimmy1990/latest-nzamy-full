"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { CheckCircle, Circle, Clock, Warning, ArrowSquareOut, Sparkle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

export type ChecklistStatus = "done" | "pending" | "overdue" | "na";

export interface ChecklistItem {
  id: string;
  title: string;
  detail: string;
  status: ChecklistStatus;
  deadline?: string;
  fee?: string;
  portal?: { label: string; url: string };
}

const STATUS_CFG: Record<ChecklistStatus, { icon: typeof CheckCircle; label: string; colorDark: string; colorLight: string; bgDark: string; bgLight: string }> = {
  done:    { icon: CheckCircle, label: "مكتمل",    colorDark: "text-emerald-400", colorLight: "text-emerald-700", bgDark: "bg-emerald-500/10", bgLight: "bg-emerald-50" },
  pending: { icon: Clock,       label: "قيد التنفيذ", colorDark: "text-amber-400",  colorLight: "text-amber-700",  bgDark: "bg-amber-500/10",   bgLight: "bg-amber-50" },
  overdue: { icon: Warning,     label: "متأخر",     colorDark: "text-red-400",     colorLight: "text-red-700",    bgDark: "bg-red-500/10",     bgLight: "bg-red-50" },
  na:      { icon: Circle,      label: "لا ينطبق",  colorDark: "text-zinc-500",    colorLight: "text-zinc-400",   bgDark: "bg-zinc-800",       bgLight: "bg-zinc-100" },
};

interface Props {
  title: string;
  subtitle: string;
  backHref?: string;
  aiTip?: string;
  items: ChecklistItem[];
}

export default function RequirementsChecklist({ title, subtitle, backHref = "/dashboard/micro/requirements", aiTip, items }: Props) {
  const { isDark } = useTheme();
  const [statuses, setStatuses] = useState<Record<string, ChecklistStatus>>(() =>
    Object.fromEntries(items.map(i => [i.id, i.status]))
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  function toggle(id: string) {
    setStatuses(prev => {
      const cur = prev[id];
      const next: ChecklistStatus = cur === "done" ? "pending" : "done";
      return { ...prev, [id]: next };
    });
  }

  const doneCount = Object.values(statuses).filter(s => s === "done").length;
  const totalActive = items.filter(i => i.status !== "na").length;
  const pct = totalActive > 0 ? Math.round((doneCount / totalActive) * 100) : 100;

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  return (
    <div className="max-w-[900px] mx-auto space-y-5 pb-12" dir="rtl">

      {/* Back */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Link href={backHref}
          className={`inline-flex items-center gap-1.5 text-[13px] mb-3 transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
          ← العودة
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{title}</h1>
            <p className={`text-[13px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{subtitle}</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[12px] font-semibold ${
            pct === 100
              ? (isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700")
              : (isDark ? "border-white/10 bg-white/5 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500")
          }`}>
            <span className="font-mono">{doneCount}/{totalActive}</span>
            <span>مكتمل</span>
          </div>
        </div>
      </motion.div>

      {/* Progress bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className={`${card} p-4`}>
        <div className="flex items-center justify-between mb-2 text-[12px]">
          <span className={isDark ? "text-zinc-400" : "text-slate-500"}>نسبة الاستيفاء</span>
          <span className={`font-mono font-bold ${pct === 100 ? "text-emerald-500" : isDark ? "text-white" : "text-slate-800"}`}>{pct}%</span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
          <motion.div
            className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-[#C8A762]"}`}
            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </motion.div>

      {/* AI Tip */}
      {aiTip && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className={`flex items-start gap-3 p-4 rounded-2xl border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
          <Sparkle size={16} weight="duotone" className="text-[#C8A762] flex-shrink-0 mt-0.5" />
          <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-amber-800"}`}>{aiTip}</p>
        </motion.div>
      )}

      {/* Checklist */}
      <div className="space-y-2">
        {items.map((item, i) => {
          const st = statuses[item.id];
          const cfg = STATUS_CFG[st];
          const Icon = cfg.icon;
          const isExp = expanded === item.id;

          return (
            <motion.div key={item.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${card} overflow-hidden`}>
              <div
                className="flex items-center gap-3 p-4 cursor-pointer"
                onClick={() => setExpanded(isExp ? null : item.id)}
              >
                {/* Toggle check */}
                <button
                  onClick={e => { e.stopPropagation(); if (st !== "na") toggle(item.id); }}
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                    st === "done"
                      ? "border-emerald-500 bg-emerald-500"
                      : st === "overdue"
                      ? "border-red-400"
                      : st === "na"
                      ? "border-zinc-600 opacity-40 cursor-not-allowed"
                      : (isDark ? "border-zinc-600 hover:border-zinc-400" : "border-slate-300 hover:border-slate-500")
                  }`}
                  aria-label={st === "done" ? "إلغاء الإتمام" : "تحديد كمكتمل"}
                >
                  {st === "done" && <CheckCircle size={14} weight="fill" className="text-white" />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] font-semibold ${st === "done" ? (isDark ? "line-through text-zinc-500" : "line-through text-slate-400") : (isDark ? "text-zinc-100" : "text-slate-800")}`}>
                    {item.title}
                  </p>
                  <p className={`text-[11px] mt-0.5 truncate ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{item.detail}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.deadline && (
                    <span className={`text-[10px] font-mono hidden sm:block ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.deadline}</span>
                  )}
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? cfg.bgDark + " " + cfg.colorDark : cfg.bgLight + " " + cfg.colorLight}`}>
                    <Icon size={9} weight="bold" />
                    {cfg.label}
                  </span>
                </div>
              </div>

              {/* Expanded detail */}
              <AnimatePresence>
                {isExp && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className={`border-t px-4 pb-4 pt-3 ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
                    <div className="flex flex-wrap gap-4 text-[12px]">
                      {item.fee && (
                        <span className={isDark ? "text-zinc-400" : "text-slate-500"}>
                          <strong>الرسوم:</strong> {item.fee}
                        </span>
                      )}
                      {item.deadline && (
                        <span className={isDark ? "text-zinc-400" : "text-slate-500"}>
                          <strong>الموعد:</strong> {item.deadline}
                        </span>
                      )}
                    </div>
                    {item.portal && (
                      <a href={item.portal.url} target="_blank" rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0B3D2E] hover:underline">
                        <ArrowSquareOut size={13} />
                        {item.portal.label}
                      </a>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
