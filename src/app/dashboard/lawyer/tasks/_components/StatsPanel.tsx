"use client";
// ─── StatsPanel — Premium 3-view chart panel ──────────────────────────────────

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PomodoroSession } from "./_pomodoro/types";
import { getWeekStats, getHourStats } from "./_pomodoro/storage";

interface StatsPanelProps {
  isDark:    boolean;
  sessions:  PomodoroSession[];
}

type ChartView = "bar" | "donut" | "sparkline";

export function StatsPanel({ isDark, sessions }: StatsPanelProps) {
  const [view, setView] = useState<ChartView>("bar");

  const focus   = sessions.filter(s => s.mode === "focus");
  const total   = focus.reduce((a, s) => a + s.durationMin, 0);
  const done    = focus.filter(s => s.completed).length;
  const partial = focus.length - done;
  const rate    = focus.length ? Math.round((done / focus.length) * 100) : 0;

  const week    = getWeekStats(sessions);
  const hours   = getHourStats(sessions);

  const muted   = isDark ? "text-zinc-500" : "text-slate-500";
  const card    = isDark ? "bg-black/20 border border-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]" : "bg-slate-50 border border-slate-100 shadow-sm";

  // ── KPI row ────────────────────────────────────────────────────────────────
  const kpis = [
    { label: "إجمالي التركيز", value: total >= 60 ? `${Math.round(total/60)}س` : `${total}د` },
    { label: "معدل الإتمام",   value: `${rate}%` },
    { label: "جلسات مكتملة",   value: `${done}` },
  ];

  // ── Bar chart (weekly) ────────────────────────────────────────────────────
  const maxFocus = Math.max(...week.map(d => d.focusMin), 1);

  // ── Donut ─────────────────────────────────────────────────────────────────
  const R = 38, CX = 50, CY = 50, circ = 2 * Math.PI * R;
  const doneOffset    = circ * (1 - (focus.length ? done / focus.length : 0));
  const partialOffset = circ * (1 - (focus.length ? partial / focus.length : 0));

  // ── Sparkline (hourly today) ───────────────────────────────────────────────
  const todayHours = hours.filter(h => {
    const now = new Date();
    return h.hour <= now.getHours();
  });
  const maxH = Math.max(...todayHours.map(h => h.focusMin), 1);
  const sparkPoints = todayHours.map((h, i) => {
    const x = (i / Math.max(todayHours.length - 1, 1)) * 200;
    const y = 50 - (h.focusMin / maxH) * 45;
    return `${x},${y}`;
  }).join(" ");

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 20 } }
  };

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-3 gap-3">
        {kpis.map((k, i) => (
          <motion.div key={k.label} variants={itemVariants} className={`rounded-2xl p-4 text-center ${card}`}>
            <p className={`text-[20px] font-black tracking-tight ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{k.value}</p>
            <p className={`text-[10px] font-bold mt-1 uppercase tracking-widest ${muted}`}>{k.label}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* View switcher */}
      <div className={`flex rounded-xl p-1 gap-1 w-fit ${isDark ? "bg-black/30 border border-white/[0.04]" : "bg-slate-100 border border-slate-200/50"}`}>
        {([
          { key:"bar",       label:"أسبوعي" },
          { key:"donut",     label:"دائري" },
          { key:"sparkline", label:"يومي" },
        ] as { key: ChartView; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`px-4 py-2 rounded-lg text-[11px] font-bold transition-all duration-300 ${
              view === t.key
                ? isDark ? "bg-zinc-800 text-white shadow-md border border-white/[0.05]" : "bg-white text-slate-800 shadow-md border border-slate-200/50"
                : isDark ? "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* Charts */}
      <AnimatePresence mode="wait">
        {view === "bar" && (
          <motion.div key="bar" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`rounded-3xl p-5 ${card}`}>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-4 ${muted}`}>دقائق التركيز — آخر 7 أيام</p>
            <div className="flex items-end gap-2 h-24">
              {week.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="w-full relative h-full flex items-end justify-center">
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: `${(d.focusMin / maxFocus) * 100}%` }}
                      transition={{ type: "spring", stiffness: 100, damping: 20, delay: i * 0.05 }}
                      className="w-full max-w-[28px] rounded-t-lg relative overflow-hidden"
                      style={{ backgroundColor: d.focusMin > 0 ? (isDark ? "#0B3D2E" : "#0B3D2E") : isDark ? "#27272a" : "#e2e8f0", minHeight: 4 }}
                    >
                      {d.focusMin > 0 && <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />}
                    </motion.div>
                  </div>
                  <span className={`text-[9px] font-bold transition-colors ${isDark ? "text-zinc-500 group-hover:text-zinc-300" : "text-slate-400 group-hover:text-slate-600"}`}>{d.label.slice(0,2)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {view === "donut" && (
          <motion.div key="donut" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`rounded-3xl p-6 flex items-center justify-center gap-8 ${card}`}>
            <div className="relative">
              <svg viewBox="0 0 100 100" width={110} height={110} className="drop-shadow-lg">
                <circle cx={CX} cy={CY} r={R} fill="none" strokeWidth={16} stroke={isDark ? "#27272a" : "#f1f5f9"} />
                <motion.circle cx={CX} cy={CY} r={R} fill="none" strokeWidth={16}
                  stroke="#0B3D2E" strokeDasharray={circ} strokeDashoffset={doneOffset}
                  strokeLinecap="round" transform={`rotate(-90 ${CX} ${CY})`} 
                  initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: doneOffset }} transition={{ duration: 1, ease: "easeOut" }}
                />
                <motion.circle cx={CX} cy={CY} r={R} fill="none" strokeWidth={16}
                  stroke="#C8A762" strokeDasharray={circ}
                  strokeDashoffset={circ - (circ - partialOffset) - (circ - doneOffset)}
                  strokeLinecap="round" transform={`rotate(-90 ${CX} ${CY})`} 
                  initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ - (circ - partialOffset) - (circ - doneOffset) }} transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-[20px] font-black ${isDark ? "text-white" : "text-slate-800"}`}>{rate}%</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[#0B3D2E] shadow-[0_0_8px_rgba(11,61,46,0.6)]" />
                <span className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>مكتملة ({done})</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[#C8A762] shadow-[0_0_8px_rgba(200,167,98,0.6)]" />
                <span className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>جزئية ({partial})</span>
              </div>
              <div className={`text-[10px] uppercase tracking-widest mt-2 ${muted}`}>من إجمالي {focus.length} جلسة</div>
            </div>
          </motion.div>
        )}

        {view === "sparkline" && (
          <motion.div key="sparkline" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`rounded-3xl p-5 ${card}`}>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-4 ${muted}`}>توزيع تركيزك اليوم بالساعة</p>
            {todayHours.length > 1 ? (
              <div className="relative h-16 w-full">
                <svg viewBox="0 0 200 55" width="100%" height="100%" preserveAspectRatio="none" className="overflow-visible">
                  <defs>
                    <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0B3D2E" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#0B3D2E" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <motion.polyline 
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, ease: "easeInOut" }}
                    points={sparkPoints} fill="none" stroke="#0B3D2E" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" 
                  />
                  <motion.polygon 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.5 }}
                    points={`0,50 ${sparkPoints} 200,50`} fill="url(#spark-grad)" 
                  />
                </svg>
              </div>
            ) : (
              <div className="flex items-center justify-center h-16">
                <p className={`text-[11px] font-bold ${muted}`}>لا يوجد بيانات كافية اليوم بعد</p>
              </div>
            )}
            <div className={`flex justify-between text-[9px] font-bold mt-2 ${muted}`}>
              <span>00:00</span><span>12:00</span><span>الآن</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
