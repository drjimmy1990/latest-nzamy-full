"use client";
// ─── PomodoroPanel Pro (Premium Gamification & Liquid Glass) ──────────────────

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  Play, Pause, ArrowCounterClockwise, Coffee, Lightning, Leaf,
  BellRinging, ChartBar, Bird, ClockCounterClockwise,
} from "@phosphor-icons/react";

import { usePomodoroEngine } from "./_pomodoro/usePomodoroEngine";
import { MODE_COLORS, MODE_LABELS, DURATIONS } from "./_pomodoro/types";
import type { PomodoroMode } from "./_pomodoro/types";
import { NoiseMixer }     from "./NoiseMixer";
import { StatsPanel }     from "./StatsPanel";
import { RankLevelBadge, SmartInsights, ShareButton } from "./PomodoroExtras";

// ─── Premium Magnetic Button ───────────────────────────────────────────────────
const MagneticButton = ({ children, onClick, className, style, title }: any) => {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const springX = useSpring(x, { stiffness: 150, damping: 15, mass: 0.1 });
  const springY = useSpring(y, { stiffness: 150, damping: 15, mass: 0.1 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct * 15);
    y.set(yPct * 15);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{ ...style, x: springX, y: springY }}
      whileTap={{ scale: 0.92 }}
      className={`relative ${className}`}
      title={title}
    >
      {children}
    </motion.button>
  );
};

// ─── CircularTimer ────────────────────────────────────────────────────────────
const CircularTimer = ({ pct, mode, isDark }: { pct: number; mode: PomodoroMode; isDark: boolean }) => {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const color = MODE_COLORS[mode];
  return (
    <div className="relative">
      <svg width={160} height={160} viewBox="0 0 160 160" className="drop-shadow-lg">
        {/* Glow behind the active stroke */}
        <motion.circle
          cx={80} cy={80} r={radius} fill="none" strokeWidth={14}
          stroke={color} strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: circumference * (1 - pct) }}
          transition={{ duration: 0.5, ease: "linear" }}
          transform="rotate(-90 80 80)"
          className="opacity-20 blur-md"
        />
        <circle cx={80} cy={80} r={radius} fill="none" strokeWidth={10} stroke={isDark ? "rgba(255,255,255,0.03)" : "rgba(148,163,184,0.15)"} />
        <motion.circle
          cx={80} cy={80} r={radius} fill="none" strokeWidth={10}
          stroke={color} strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: circumference * (1 - pct) }}
          transition={{ duration: 0.5, ease: "linear" }}
          transform="rotate(-90 80 80)"
        />
      </svg>
      {/* Liquid Glass Overlay Effect on the Timer Center */}
      <div className="absolute inset-4 rounded-full pointer-events-none bg-gradient-to-br from-white/10 to-transparent opacity-50 blur-[2px]" />
    </div>
  );
};

// ─── Mode Config ──────────────────────────────────────────────────────────────
const MODE_ICONS: Record<PomodoroMode, React.ElementType> = {
  focus: Lightning,
  short: Coffee,
  long:  Leaf,
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type Tab = "timer" | "stats" | "insights" | "log";

// ─── Main Panel ───────────────────────────────────────────────────────────────
export default function PomodoroPanel({
  isDark,
  taskTitles = [],
  onPomodoroComplete,
  userName,
}: {
  isDark:               boolean;
  taskTitles?:          string[];
  onPomodoroComplete?:  () => void;
  userName?:            string;
}) {
  const engine = usePomodoroEngine(onPomodoroComplete);
  const {
    mode, timeLeft, running, sessions, pomCount,
    linkedTask, notif, noises,
    setMode, toggleRun, reset, setLinkedTask, setNoises,
  } = engine;

  const [tab, setTab] = useState<Tab>("timer");

  const total = DURATIONS[mode];
  const pct   = timeLeft / total;
  const mins  = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const secs  = String(timeLeft % 60).padStart(2, "0");
  const color = MODE_COLORS[mode];

  const surface = isDark
    ? "bg-zinc-900/60 border border-white/[0.06] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
    : "bg-white/90 border border-slate-200/70 shadow-[0_30px_60px_-20px_rgba(15,23,42,0.15)] backdrop-blur-xl";

  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key:"timer",    label:"التايمر",   icon:Lightning },
    { key:"stats",    label:"الإحصاء",   icon:ChartBar },
    { key:"insights", label:"التحليل",   icon:Bird },
    { key:"log",      label:"السجل",     icon:ClockCounterClockwise },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className={`${surface} w-full rounded-[2.5rem] p-6 relative overflow-hidden space-y-6`}
    >
      {/* ── Completion notification ─────────────────────────────────────────── */}
      <AnimatePresence>
        {notif && (
          <motion.div
            initial={{ opacity:0, y:-20, scale:0.95 }}
            animate={{ opacity:1, y:0, scale:1 }}
            exit={{ opacity:0, y:-20 }}
            transition={{ type:"spring", stiffness:300, damping:25 }}
            className={`absolute left-6 right-6 top-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-3 shadow-2xl backdrop-blur-md ${
              isDark ? "bg-emerald-500/20 border border-emerald-500/40" : "bg-emerald-50 border border-emerald-200"
            }`}
          >
            <BellRinging size={18} weight="fill" className="text-emerald-500" />
            <p className={`text-[13px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
              {mode === "focus" ? "🦅 جلسة تركيز مكتملة! إنجاز عظيم" : "انتهت الاستراحة — هيا بنا"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tab nav ─────────────────────────────────────────────────────────── */}
      <div className={`flex gap-1.5 rounded-2xl p-1.5 ${isDark ? "bg-black/30 border border-white/[0.04]" : "bg-slate-100 border border-slate-200/50"}`}>
        {tabs.map(t => {
          const Icon   = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all duration-300 ${
                active
                  ? isDark ? "bg-zinc-800 text-white shadow-sm border border-white/[0.05]" : "bg-white text-slate-800 shadow-sm border border-slate-200/50"
                  : isDark ? "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]" : "text-slate-400 hover:text-slate-600 hover:bg-white/50"
              }`}
            >
              <Icon size={14} weight={active ? "fill" : "regular"} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* ── TIMER TAB ───────────────────────────────────────────────────────── */}
        {tab === "timer" && (
          <motion.div 
            key="timer"
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
            transition={{ type: "spring", stiffness: 150, damping: 20 }}
            className="space-y-6"
          >
            {/* Mode selector */}
            <div className={`flex w-fit gap-1.5 rounded-[1.25rem] p-1.5 ${isDark ? "bg-black/20 border border-white/[0.03]" : "bg-slate-50 border border-slate-100"}`}>
              {(["focus","short","long"] as PomodoroMode[]).map(m => {
                const Icon   = MODE_ICONS[m];
                const active = mode === m;
                return (
                  <button key={m} onClick={() => setMode(m)}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-bold transition-all duration-300 ${
                      active ? `bg-opacity-15 bg-current shadow-sm` : isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"
                    }`}
                    style={{ color: active ? MODE_COLORS[m] : undefined, backgroundColor: active ? `${MODE_COLORS[m]}20` : undefined }}
                  >
                    <Icon size={14} weight={active ? "fill" : "regular"} />
                    {MODE_LABELS[m]}
                  </button>
                );
              })}
            </div>

            {/* Timer + controls */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              {/* Clock */}
              <div className="relative mx-auto flex-shrink-0 sm:mx-0">
                <CircularTimer pct={pct} mode={mode} isDark={isDark} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`font-mono text-[36px] font-black leading-none tracking-tighter ${isDark ? "text-zinc-100" : "text-slate-800"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {mins}:{secs}
                  </span>
                  <span className={`mt-1.5 text-[10px] font-bold uppercase tracking-widest ${muted}`}>
                    {MODE_LABELS[mode]}
                  </span>
                </div>
              </div>

              {/* Right side */}
              <div className="flex-1 space-y-5">
                {/* Pomodoro dots */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {Array.from({ length: Math.max(4, pomCount + 1) }).map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        transition={{ type:"spring", stiffness:300, damping:20, delay: i * 0.05 }}
                        className={`h-3 w-3 rounded-full transition-all duration-300 ${
                          i < pomCount ? "bg-[#0B3D2E] shadow-[0_0_8px_rgba(11,61,46,0.6)]" : isDark ? "bg-zinc-800 border border-white/[0.05]" : "bg-slate-200 border border-slate-300"
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`mr-2 font-mono text-[11px] font-bold tracking-widest ${muted}`}>{pomCount}/4</span>
                </div>

                {/* Noise Mixer */}
                <NoiseMixer isDark={isDark} noises={noises} onChange={setNoises} />

                {/* Linked task */}
                {taskTitles.length > 0 && (
                  <div>
                    <p className={`mb-2 text-[10px] font-black uppercase tracking-widest ${muted}`}>ربط بمهمة</p>
                    <select
                      value={linkedTask} onChange={e => setLinkedTask(e.target.value)}
                      className={`w-full rounded-2xl border px-4 py-3 text-[12px] font-bold outline-none transition-all ${
                        isDark ? "border-white/[0.08] bg-black/20 text-zinc-200 focus:border-[#C8A762]/50" : "border-slate-200 bg-slate-50 text-slate-700 focus:border-[#0B3D2E]/50"
                      }`}
                    >
                      <option value="">بدون مهمة محددة</option>
                      {taskTitles.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}

                {/* Buttons (Magnetic) */}
                <div className="flex gap-3 pt-2">
                  <MagneticButton onClick={toggleRun}
                    className={`flex flex-1 items-center justify-center gap-2.5 rounded-2xl py-4 text-[14px] font-black uppercase tracking-wider transition-all duration-300 ${
                      running ? isDark ? "bg-white/[0.08] text-zinc-300 border border-white/[0.05]" : "bg-slate-100 text-slate-600 border border-slate-200" : "text-white shadow-[0_10px_20px_-10px_rgba(0,0,0,0.5)] border border-white/10"
                    }`}
                    style={{ backgroundColor: running ? undefined : color }}
                  >
                    {running ? <Pause size={18} weight="bold" /> : <Play size={18} weight="fill" />}
                    {running ? "توقف مؤقت" : "ابدأ الجلسة"}
                  </MagneticButton>
                  
                  <MagneticButton onClick={reset} title="إعادة ضبط"
                    className={`rounded-2xl p-4 transition-all duration-300 flex items-center justify-center ${
                      isDark ? "bg-white/[0.04] border border-white/[0.05] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.08]" : "bg-slate-100 border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <ArrowCounterClockwise size={18} weight="bold" />
                  </MagneticButton>
                </div>
              </div>
            </div>

            {/* Bird Level + Share */}
            <div className={`rounded-3xl p-5 space-y-4 ${isDark ? "bg-black/20 border border-white/[0.03]" : "bg-slate-50 border border-slate-100"}`}>
              <RankLevelBadge isDark={isDark} sessions={sessions} />
              <div className="flex justify-end">
                <ShareButton isDark={isDark} sessions={sessions} userName={userName} />
              </div>
            </div>
          </motion.div>
        )}

        {/* ── STATS TAB ───────────────────────────────────────────────────────── */}
        {tab === "stats" && (
          <motion.div key="stats" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
            <StatsPanel isDark={isDark} sessions={sessions} />
          </motion.div>
        )}

        {/* ── INSIGHTS TAB ────────────────────────────────────────────────────── */}
        {tab === "insights" && (
          <motion.div key="insights" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
            <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>تحليل ذكي بناءً على جلساتك</p>
            <SmartInsights isDark={isDark} sessions={sessions} />
          </motion.div>
        )}

        {/* ── LOG TAB ─────────────────────────────────────────────────────────── */}
        {tab === "log" && (
          <motion.div key="log" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-3">
            <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>
              سجل الجلسات ({sessions.length})
            </p>
            {sessions.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-10 rounded-2xl border border-dashed ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
                <ClockCounterClockwise size={24} className={isDark ? "text-zinc-700" : "text-slate-300"} />
                <p className={`text-[11px] mt-2 ${muted}`}>لا يوجد جلسات محفوظة بعد</p>
              </div>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                {sessions.map(s => {
                  const start = new Date(s.startedAt);
                  const end   = new Date(s.endedAt);
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                      className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors ${
                        isDark ? "bg-black/20 border border-white/[0.03] hover:bg-white/[0.04]" : "bg-slate-50 border border-slate-100 hover:bg-slate-100"
                      }`}
                    >
                      <div
                        className={`h-2.5 w-2.5 flex-shrink-0 rounded-full shadow-sm ${s.completed ? "" : "opacity-40"}`}
                        style={{ backgroundColor: MODE_COLORS[s.mode] }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] font-bold truncate ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
                          {s.taskTitle || MODE_LABELS[s.mode]}
                          {!s.completed && (
                            <span className={`mr-1.5 text-[10px] font-normal px-2 py-0.5 rounded-md ${isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-500"}`}>({s.durationMin}د جزئية)</span>
                          )}
                        </p>
                        {s.noises?.length > 0 && (
                          <p className={`text-[10px] font-semibold mt-0.5 ${muted}`}>
                            {s.noises.slice(0,3).join(" · ")}
                          </p>
                        )}
                      </div>
                      <div className={`text-right flex-shrink-0`}>
                        <p className={`font-mono text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                          {String(start.getHours()).padStart(2,"0")}:{String(start.getMinutes()).padStart(2,"0")}
                          <span className={`${muted} font-normal mx-1`}>←</span>
                          {String(end.getHours()).padStart(2,"0")}:{String(end.getMinutes()).padStart(2,"0")}
                        </p>
                        <p className={`text-[10px] font-bold mt-0.5 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{s.durationMin} دقيقة</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
