"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Sparkle, CheckCircle } from "@phosphor-icons/react";
import type { StepKey } from "../_types";

// ─── StepProgress ────────────────────────────────────────────────────────────────

export function StepProgress({ steps, currentStep, isDark, onStepClick }: {
  steps: StepKey[]; currentStep: StepKey; isDark: boolean; onStepClick?: (step: StepKey) => void;
}) {
  const LABELS: Record<StepKey, string> = {
    type: "النوع", context: "السياق", settings: "الإعدادات",
    processing: "المعالجة", result: "النتيجة",
  };
  const ci = steps.indexOf(currentStep);
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => {
        const isActive = i === ci;
        const isDone = i < ci;
        return (
          <button
            key={s}
            type="button"
            onClick={() => isDone && onStepClick && onStepClick(s)}
            disabled={!isDone || !onStepClick}
            className={`flex items-center gap-1 flex-1 text-right ${isDone && onStepClick ? 'cursor-pointer hover:opacity-80 active:scale-95 transition-all' : 'cursor-default'}`}
          >
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0 transition-all ${
              isDone  ? "bg-emerald-500 text-white" :
              isActive ? "bg-[#0B3D2E] text-white shadow-md" :
              isDark ? "bg-zinc-800 text-zinc-600" : "bg-slate-100 text-slate-400"
            }`}>
              {isDone ? <Check size={10} weight="bold" /> : i + 1}
            </div>
            <span className={`text-[10px] hidden lg:block truncate ${
              isActive ? isDark ? "text-white font-semibold" : "text-slate-900 font-semibold" :
              isDone ? "text-emerald-500" : isDark ? "text-zinc-600" : "text-slate-400"
            }`}>{LABELS[s]}</span>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-1 ${isDone ? "bg-emerald-500/40" : isDark ? "bg-zinc-800" : "bg-slate-200"}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── SourceBadge ────────────────────────────────────────────────────────────────

import { Database } from "@phosphor-icons/react";

export function SourceBadge({ source, isDark }: { source: string; isDark: boolean }) {
  const configs: Record<string, { label: string; color: string; bg: string }> = {
    gemini: { label: "Gemini", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
    claude:  { label: "Claude",  color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/20" },
    nzamy:   { label: "نظامي DB", color: isDark ? "text-emerald-400" : "text-emerald-700", bg: isDark ? "bg-emerald-900/30 border-emerald-700/30" : "bg-emerald-50 border-emerald-200" },
  };
  const cfg = configs[source] ?? configs["nzamy"];
  return (
    <span className={`flex items-center gap-1 text-[9px] font-bold rounded-full px-2 py-0.5 border ${cfg.bg} ${cfg.color}`}>
      <Database size={7} />{cfg.label}
    </span>
  );
}

// ─── ProcessingView ──────────────────────────────────────────────────────────────

type Agent = { key: string; label: string; desc: string; icon: React.ElementType; color: string; bg: string; border: string };

export function ProcessingView({ agents, isDark }: {
  agents: Agent[]; isDark: boolean;
}) {
  const [activeAgent, setActiveAgent] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      if (i < agents.length - 1) {
        i++; setActiveAgent(i);
      } else {
        clearInterval(iv); setDone(true);
      }
    }, 900);
    return () => clearInterval(iv);
  }, [agents.length]);

  const progress = done ? 100 : Math.round(((activeAgent + 1) / agents.length) * 100);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center gap-2">
        <motion.div animate={{ rotate: done ? 0 : 360 }} transition={{ duration: 1.5, repeat: done ? 0 : Infinity, ease: "linear" }}>
          <Sparkle size={14} className="text-[#C8A762]" />
        </motion.div>
        <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          {done ? "اكتملت المعالجة ✓" : "جاري التحليل متعدد الوكلاء..."}
        </span>
        <span className={`ms-auto text-[12px] font-black ${done ? "text-emerald-500" : "text-[#C8A762]"}`}>{progress}%</span>
      </div>

      <div className={`grid gap-2 ${agents.length <= 2 ? "grid-cols-2" : agents.length <= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
        {agents.map((agent, i) => {
          const Icon = agent.icon;
          const isActive = !done && activeAgent === i;
          const isDoneAgent = done || activeAgent > i;
          return (
            <motion.div key={agent.key}
              initial={{ opacity: 0.3 }} animate={{ opacity: isActive || isDoneAgent ? 1 : 0.35 }}
              className={`rounded-2xl border p-3 text-center transition-all ${
                isDoneAgent ? "border-emerald-500/25 bg-emerald-500/5" :
                isActive ? `${agent.border} ${agent.bg}` :
                isDark ? "border-white/[0.06]" : "border-slate-200"
              }`}>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                {isDoneAgent ? (
                  <CheckCircle size={14} weight="fill" className="text-emerald-500" />
                ) : isActive ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}>
                    <Icon size={14} className={agent.color} />
                  </motion.div>
                ) : (
                  <Icon size={14} className={isDark ? "text-zinc-600" : "text-slate-400"} />
                )}
                <span className={`text-[10px] font-bold ${
                  isActive ? agent.color : isDoneAgent ? "text-emerald-500" : isDark ? "text-zinc-600" : "text-slate-400"
                }`}>{agent.label}</span>
              </div>
              <p className={`text-[9px] ${isDark ? "text-zinc-700" : "text-slate-400"}`}>{agent.desc}</p>
            </motion.div>
          );
        })}
      </div>

      <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
        <motion.div animate={{ width: `${progress}%` }}
          className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-gradient-to-l from-[#0B3D2E] to-[#C8A762]"}`}
          transition={{ duration: 0.5 }} />
      </div>

      <p className={`text-[11px] text-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
        {done ? `استُخدم ${agents.length} وكيل ذكاء اصطناعي · جارٍ تجهيز النتيجة...` :
        `الوكيل النشط: ${agents[activeAgent]?.label}`}
      </p>
    </motion.div>
  );
}
