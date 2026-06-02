"use client";
// ─── NoiseMixer — Premium Multi-channel noise UI ─────────────────────────────

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SpeakerHigh, SpeakerX, Waveform } from "@phosphor-icons/react";
import { NOISE_CONFIG, type ActiveNoise, type NoiseChannel } from "./_pomodoro/types";
import { useMultiNoise } from "./_pomodoro/useMultiNoise";

interface NoiseMixerProps {
  isDark:   boolean;
  noises:   ActiveNoise[];
  onChange: (n: ActiveNoise[]) => void;
}

// Custom Equalizer Animation Component
const ActiveEqualizer = ({ isDark }: { isDark: boolean }) => {
  return (
    <div className="flex items-end gap-[2px] h-3 w-3">
      {[1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className={`w-[2px] rounded-t-sm ${isDark ? "bg-emerald-400" : "bg-emerald-600"}`}
          animate={{ height: ["20%", "100%", "40%", "80%", "20%"] }}
          transition={{
            duration: 0.8 + (i * 0.2),
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
};

export function NoiseMixer({ isDark, noises, onChange }: NoiseMixerProps) {
  const [expanded, setExpanded] = useState(false);
  const { apply } = useMultiNoise();

  useEffect(() => { apply(noises); }, [noises, apply]);

  const isActive = (ch: NoiseChannel) => noises.some(n => n.channel === ch);
  const getVol   = (ch: NoiseChannel) => noises.find(n => n.channel === ch)?.volume ?? 0.7;

  function toggle(ch: NoiseChannel) {
    if (isActive(ch)) {
      onChange(noises.filter(n => n.channel !== ch));
    } else {
      onChange([...noises, { channel: ch, volume: 0.7 }]);
    }
  }

  function setVol(ch: NoiseChannel, volume: number) {
    onChange(noises.map(n => n.channel === ch ? { ...n, volume } : n));
  }

  const activeCount = noises.length;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className={`p-1.5 rounded-lg ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>
          <Waveform size={14} className={isDark ? "text-zinc-400" : "text-slate-500"} weight={activeCount > 0 ? "bold" : "regular"} />
        </div>
        <p className={`text-[10px] font-black uppercase tracking-widest ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
          الصوت البيئي
        </p>
        {activeCount > 0 && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={`flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border border-emerald-200"}`}>
            <ActiveEqualizer isDark={isDark} />
            {activeCount} نشط
          </motion.div>
        )}
        <button
          onClick={() => setExpanded(e => !e)}
          className={`ms-auto text-[10px] font-bold px-3 py-1.5 rounded-xl transition-all ${
            expanded 
              ? isDark ? "bg-white/[0.08] text-white" : "bg-slate-200 text-slate-800"
              : isDark ? "text-zinc-500 hover:text-zinc-300 bg-white/[0.02] hover:bg-white/[0.04]" : "text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100"
          }`}
        >
          {expanded ? "إخفاء التفاصيل" : "تخصيص مستويات الصوت"}
        </button>
      </div>

      {/* Quick icon row (always visible) */}
      <div className="flex flex-wrap gap-2">
        {NOISE_CONFIG.map(cfg => {
          const active = isActive(cfg.key);
          return (
            <motion.button
              whileTap={{ scale: 0.95 }}
              key={cfg.key}
              onClick={() => toggle(cfg.key)}
              title={cfg.label}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold overflow-hidden transition-all duration-300 ${
                active
                  ? isDark 
                    ? "bg-[#0B3D2E]/80 text-[#C8A762] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_15px_rgba(11,61,46,0.5)] border border-[#0B3D2E]" 
                    : "bg-[#0B3D2E] text-white shadow-md border border-[#0a3328]"
                  : isDark
                    ? "bg-white/[0.02] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-white/[0.02]"
                    : "bg-slate-50 text-slate-500 hover:text-slate-700 hover:bg-slate-100 border border-slate-200/60"
              }`}
            >
              {active && <div className="absolute inset-0 opacity-20 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />}
              <span className="relative z-10">{cfg.icon}</span>
              <span className="hidden sm:inline relative z-10">{cfg.label}</span>
            </motion.button>
          );
        })}
        {activeCount > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange([])}
            title="إيقاف الكل"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${
              isDark ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/10" : "bg-red-50 text-red-500 hover:bg-red-100 border border-red-100"
            }`}
          >
            <SpeakerX size={12} weight="bold" />
            <span className="hidden sm:inline">إيقاف الصوت</span>
          </motion.button>
        )}
      </div>

      {/* Expanded volume sliders */}
      <AnimatePresence>
        {expanded && noises.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }}
            exit={{ opacity: 0, height: 0, filter: "blur(4px)" }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
            className="overflow-hidden"
          >
            <div className={`space-y-3 p-4 mt-2 rounded-[1.5rem] shadow-inner ${isDark ? "bg-black/20 border border-white/[0.03]" : "bg-slate-50 border border-slate-100"}`}>
              {noises.map(({ channel, volume }) => {
                const cfg = NOISE_CONFIG.find(c => c.key === channel)!;
                return (
                  <div key={channel} className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${isDark ? "bg-white/[0.04]" : "bg-white shadow-sm"}`}>
                      <span className="text-[14px]">{cfg.icon}</span>
                    </div>
                    <span className={`text-[11px] font-bold w-16 truncate ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{cfg.label}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <SpeakerX size={12} className={isDark ? "text-zinc-600" : "text-slate-300"} />
                      <input
                        type="range" min={0} max={1} step={0.01}
                        value={volume}
                        onChange={e => setVol(channel, parseFloat(e.target.value))}
                        className={`flex-1 h-1.5 rounded-full cursor-pointer appearance-none ${isDark ? "bg-zinc-800" : "bg-slate-200"}`}
                        style={{
                          backgroundImage: `linear-gradient(to right, ${isDark ? '#C8A762' : '#0B3D2E'} ${volume * 100}%, transparent ${volume * 100}%)`,
                        }}
                      />
                      <SpeakerHigh size={12} className={isDark ? "text-zinc-400" : "text-slate-500"} weight="fill" />
                    </div>
                    <span className={`text-[10px] font-mono font-bold w-9 text-right ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                      {Math.round(volume * 100)}%
                    </span>
                    <button
                      onClick={() => toggle(channel)}
                      className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors ${isDark ? "bg-white/[0.04] text-zinc-500 hover:text-red-400 hover:bg-red-500/10" : "bg-slate-200/50 text-slate-400 hover:text-red-500 hover:bg-red-50"}`}
                    >
                      <span className="text-[10px] font-bold">×</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
