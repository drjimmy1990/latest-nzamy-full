import { motion } from "framer-motion";

export function ScoreGauge({ score, isDark }: { score: number; isDark: boolean }) {
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  const angle = -135 + (score / 100) * 270;
  return (
    <div className="relative flex items-center justify-center">
      <svg width="160" height="100" viewBox="0 0 160 100">
        <path d="M 20 90 A 60 60 0 1 1 140 90" fill="none" stroke={isDark ? "#27272a" : "#e4e4e7"} strokeWidth="10" strokeLinecap="round" />
        <motion.path d="M 20 90 A 60 60 0 1 1 140 90" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 188.5} 188.5`}
          initial={{ strokeDasharray: "0 188.5" }}
          animate={{ strokeDasharray: `${(score / 100) * 188.5} 188.5` }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
        <motion.g initial={{ rotate: -135, originX: 80, originY: 90 }} animate={{ rotate: angle, originX: 80, originY: 90 }} transition={{ duration: 1.5, ease: "easeOut" }}>
          <line x1="80" y1="90" x2="80" y2="45" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="80" cy="90" r="4" fill={color} />
        </motion.g>
      </svg>
      <div className="absolute bottom-2 text-center">
        <p className={`font-mono text-3xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{score}</p>
        <p className="text-[10px] text-zinc-400">/ ١٠٠</p>
      </div>
    </div>
  );
}
