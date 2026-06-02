"use client";
// ─── SmartInsights + BirdLevel + ShareCard (Premium) ──────────────────────────

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShareNetwork, Eye, EyeSlash, Info } from "@phosphor-icons/react";
import {
  getRankLevel, getNextRankLevel, RANK_LEVELS,
  type PomodoroSession,
} from "./_pomodoro/types";
import { generateInsights } from "./_pomodoro/storage";

// ─── RankLevelBadge ────────────────────────────────────────────────────────────

export function RankLevelBadge({
  isDark, sessions,
}: { isDark: boolean; sessions: PomodoroSession[] }) {
  const [showInfo, setShowInfo] = useState(false);
  const total   = sessions.filter(s => s.mode === "focus" && s.completed).length;
  const current = getRankLevel(total);
  const next    = getNextRankLevel(current);
  const pct     = next
    ? ((total - current.minSessions) / (next.minSessions - current.minSessions)) * 100
    : 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <motion.div
          whileHover={{ scale: 1.05, rotate: 5 }}
          className={`w-14 h-14 rounded-[1.25rem] flex items-center justify-center text-3xl shadow-lg flex-shrink-0 relative overflow-hidden backdrop-blur-sm`}
          style={{ backgroundColor: `${current.color}15`, border: `1px solid ${current.color}40` }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-50" />
          <span className="relative z-10 drop-shadow-md">{current.emoji}</span>
        </motion.div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-black tracking-tight" style={{ color: current.color, textShadow: isDark ? `0 0 15px ${current.color}40` : 'none' }}>
              {current.name}
            </span>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${
              isDark ? "bg-white/[0.08] text-zinc-400 border border-white/[0.05]" : "bg-slate-100 text-slate-500 border border-slate-200"
            }`}>
              المستوى {current.level}
            </span>
            <button onClick={() => setShowInfo(true)}
              className={`flex items-center justify-center w-5 h-5 rounded-full transition-colors ${
                isDark ? "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.12] hover:text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              }`}>
              <Info size={12} weight="bold" />
            </button>
          </div>
          <p className={`text-[10px] mt-1 font-semibold leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{current.desc}</p>
        </div>
      </div>

      {/* Progress to next level */}
      {next && (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center px-0.5">
            <span className={`text-[10px] font-bold ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              {total} جلسة
            </span>
            <span className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              {next.name} ← {next.minSessions}
            </span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-black/40 border border-white/[0.03] shadow-inner" : "bg-slate-200 shadow-inner"}`}>
            <motion.div
              className="h-full rounded-full relative"
              style={{ backgroundColor: current.color }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, pct)}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/30" />
            </motion.div>
          </div>
        </div>
      )}

      {/* All levels mini-map */}
      <div className="flex gap-1.5 pt-1">
        {RANK_LEVELS.map(r => (
          <div
            key={r.level}
            title={r.name}
            className="flex-1 h-1.5 rounded-full transition-all duration-300"
            style={{
              backgroundColor: total >= r.minSessions ? r.color : isDark ? "#27272a" : "#e2e8f0",
              opacity: r.level === current.level ? 1 : 0.4,
              boxShadow: total >= r.minSessions && r.level === current.level ? `0 0 8px ${r.color}60` : 'none'
            }}
          />
        ))}
      </div>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowInfo(false); }}
          >
            <motion.div
              initial={{ y: 20, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 10, opacity: 0, scale: 0.95 }}
              className={`w-full max-w-md max-h-[80vh] overflow-y-auto rounded-[2rem] p-6 shadow-2xl ${
                isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className={`text-[16px] font-black ${isDark ? "text-white" : "text-slate-800"}`}>
                  نظام الترقية والمعادن النفيسة
                </h3>
                <button onClick={() => setShowInfo(false)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isDark ? "bg-white/10 text-zinc-400 hover:bg-white/20 hover:text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>×</button>
              </div>

              <div className="space-y-3">
                {RANK_LEVELS.map(lvl => (
                  <div key={lvl.level} className={`flex items-center gap-3 p-3 rounded-xl border ${
                    lvl.level === current.level 
                      ? (isDark ? "border-[#C8A762]/30 bg-[#C8A762]/10" : "border-amber-200 bg-amber-50")
                      : (isDark ? "border-white/[0.04] bg-white/[0.01]" : "border-slate-100 bg-slate-50")
                  }`}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                         style={{ backgroundColor: `${lvl.color}20`, border: `1px solid ${lvl.color}40` }}>
                      {lvl.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-[13px] font-bold" style={{ color: lvl.color }}>{lvl.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-white/5 text-zinc-400" : "bg-slate-200 text-slate-600"}`}>
                          {lvl.minSessions} جلسة
                        </span>
                      </div>
                      <p className={`text-[10px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{lvl.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SmartInsights ────────────────────────────────────────────────────────────

export function SmartInsights({
  isDark, sessions,
}: { isDark: boolean; sessions: PomodoroSession[] }) {
  const insights = generateInsights(sessions);

  if (insights.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-6 rounded-[1.5rem] border border-dashed ${isDark ? "border-white/[0.06] bg-white/[0.01]" : "border-slate-200 bg-slate-50/50"}`}>
        <p className={`text-[11px] font-bold ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          أكمل بعض الجلسات لتظهر التحليلات هنا
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {insights.map((ins, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
          whileHover={{ y: -2 }}
          className={`flex items-start gap-3 rounded-2xl p-4 transition-colors ${
            isDark ? "bg-black/20 border border-white/[0.03] hover:bg-white/[0.04]" : "bg-slate-50 border border-slate-100 hover:bg-white shadow-sm"
          }`}
        >
          <div className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${isDark ? "bg-white/[0.04]" : "bg-white shadow-sm"}`}>
            <span className="text-[16px]">{ins.icon}</span>
          </div>
          <div className="min-w-0">
            <p className={`text-[9px] font-black uppercase tracking-widest ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              {ins.title}
            </p>
            <p className={`text-[14px] font-black mt-0.5 tracking-tight ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
              {ins.value}
            </p>
            {ins.sub && (
              <p className={`text-[10px] font-bold mt-1 ${
                ins.trend === "up" ? "text-emerald-500" :
                ins.trend === "down" ? "text-red-400" :
                isDark ? "text-zinc-600" : "text-slate-400"
              }`}>{ins.sub}</p>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── ShareModal ───────────────────────────────────────────────────────────────

interface ShareField {
  key:     string;
  label:   string;
  value:   string;
  hidden:  boolean;
}

export function ShareButton({
  isDark, sessions, userName,
}: { isDark: boolean; sessions: PomodoroSession[]; userName?: string }) {
  const [open, setOpen] = useState(false);

  const total   = sessions.filter(s => s.mode === "focus" && s.completed).length;
  const totalMin = sessions.filter(s => s.mode === "focus").reduce((a, s) => a + s.durationMin, 0);
  const rank    = getRankLevel(total);

  const [fields, setFields] = useState<ShareField[]>([
    { key:"name",  label:"الاسم",             value: userName || "محامٍ نظامي",          hidden: false },
    { key:"level", label:"المستوى",            value: `${rank.name} — المستوى ${rank.level}`, hidden: false },
    { key:"total", label:"إجمالي التركيز",     value: `${Math.round(totalMin / 60)} ساعة تركيز`, hidden: false },
    { key:"count", label:"جلسات مكتملة",       value: `${total} جلسة`,                  hidden: false },
  ]);

  function toggleHide(key: string) {
    setFields(f => f.map(x => x.key === key ? { ...x, hidden: !x.hidden } : x));
  }

  function copyShareText() {
    const lines = [
      "💎 إنجازي على منصة نظامي",
      "",
      ...fields.filter(f => !f.hidden).map(f => `${f.label}: ${f.value}`),
      "",
      "nezamy.online",
    ];
    navigator.clipboard?.writeText(lines.join("\n"));
  }

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold transition-all shadow-sm ${
          isDark
            ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.10] border border-white/[0.05]"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
        }`}
      >
        <ShareNetwork size={14} weight="bold" />
        مشاركة الإنجاز
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
            onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            <motion.div
              initial={{ y: 30, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className={`w-full max-w-sm rounded-[2rem] p-6 space-y-5 shadow-2xl ${
                isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className={`text-[16px] font-black ${isDark ? "text-white" : "text-slate-800"}`}>
                  مشاركة الإنجاز
                </h3>
                <button onClick={() => setOpen(false)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isDark ? "bg-white/10 text-zinc-400 hover:bg-white/20 hover:text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}>×</button>
              </div>

              {/* Preview card */}
              <div className={`rounded-2xl p-5 space-y-3 relative overflow-hidden ${
                isDark ? "bg-[#0B3D2E]/20 border border-[#0B3D2E]/30" : "bg-[#0B3D2E]/5 border border-[#0B3D2E]/20"
              }`}>
                <div className="absolute -right-10 -top-10 w-32 h-32 bg-[#0B3D2E]/20 rounded-full blur-3xl" />
                <div className="flex items-center gap-3 mb-4 relative z-10">
                  <span className="text-3xl drop-shadow-md">{rank.emoji}</span>
                  <div>
                    <p className="text-[13px] font-black text-[#0B3D2E]">💎 إنجازي على نظامي</p>
                  </div>
                </div>
                {fields.map(f => (
                  <div key={f.key} className={`flex items-center justify-between relative z-10 ${f.hidden ? "opacity-30" : ""}`}>
                    <span className={`text-[11px] font-bold ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{f.label}</span>
                    <span className={`text-[12px] font-black ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                      {f.hidden ? "••••••" : f.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Toggle hide per field */}
              <div className="space-y-1.5">
                <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  تخصيص البيانات المشاركة
                </p>
                {fields.map(f => (
                  <button key={f.key} onClick={() => toggleHide(f.key)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all ${
                      isDark ? "hover:bg-white/[0.04]" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className={isDark ? "text-zinc-400" : "text-slate-600"}>{f.label}</span>
                    {f.hidden
                      ? <EyeSlash size={16} className="text-zinc-500" weight="fill" />
                      : <Eye size={16} className="text-emerald-500" weight="fill" />
                    }
                  </button>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={copyShareText}
                  className="flex-1 py-3 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[13px] font-black shadow-[0_4px_14px_0_rgba(11,61,46,0.39)] hover:shadow-[0_6px_20px_rgba(11,61,46,0.23)] hover:bg-[#0a3328] transition-all"
                >
                  نسخ المشاركة
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setOpen(false)}
                  className={`px-5 py-3 rounded-xl border text-[13px] font-bold transition-colors ${
                    isDark ? "border-white/[0.08] text-zinc-500 hover:bg-white/[0.05] hover:text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  إغلاق
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
