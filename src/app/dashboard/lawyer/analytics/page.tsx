"use client";

import { useState, useRef, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChartBar, Gavel, CalendarCheck, Clock, Trophy, Star,
  ArrowUp, ArrowDown, PencilSimple, Robot, Scales, Target,
  Smiley, SmileyMeh, SmileySad, ChatCircleDots, FileText,
  Briefcase, Warning,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "أسبوع" | "شهر" | "سنة";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const ACTIVITY_DATA: Record<Period, { label: string; cases: number; contracts: number; consults: number }[]> = {
  "أسبوع": [
    { label: "أحد",   cases: 1, contracts: 0, consults: 2 },
    { label: "اثنين", cases: 2, contracts: 1, consults: 3 },
    { label: "ثلاثاء",cases: 0, contracts: 2, consults: 1 },
    { label: "أربعاء",cases: 3, contracts: 1, consults: 4 },
    { label: "خميس", cases: 2, contracts: 0, consults: 2 },
  ],
  "شهر": [
    { label: "أسبوع 1", cases: 5, contracts: 3, consults: 8  },
    { label: "أسبوع 2", cases: 7, contracts: 4, consults: 11 },
    { label: "أسبوع 3", cases: 4, contracts: 2, consults: 7  },
    { label: "أسبوع 4", cases: 8, contracts: 5, consults: 13 },
  ],
  "سنة": [
    { label: "يول", cases: 4,  contracts: 6,  consults: 9  },
    { label: "أغس", cases: 6,  contracts: 8,  consults: 11 },
    { label: "سبت", cases: 5,  contracts: 5,  consults: 9  },
    { label: "أكت", cases: 8,  contracts: 9,  consults: 14 },
    { label: "نوف", cases: 7,  contracts: 7,  consults: 12 },
    { label: "ديس", cases: 10, contracts: 11, consults: 17 },
  ],
};

const WORK_DIST = [
  { label: "قضايا",     icon: Gavel,       pct: 41, color: "#0B3D2E", sub: ["تجاري ٣٨٪","مدني ٢٧٪","عمالي ٢٠٪","جنائي ١٠٪","إداري ٥٪"] },
  { label: "عقود",      icon: FileText,    pct: 28, color: "#C8A762", sub: ["توظيف ٣١٪","تجارة ٢٨٪","عقارات ٢٤٪","شراكة ١٧٪"] },
  { label: "استشارات",  icon: ChatCircleDots, pct: 19, color: "#3b82f6", sub: ["مدفوعة ٦١٪","عاجلة ٢٣٪","مجدولة ١٦٪"] },
  { label: "وثائق",     icon: Briefcase,   pct: 12, color: "#8b5cf6", sub: ["مذكرات ٥٢٪","صحف دعوى ٣١٪","عقارية ١٧٪"] },
];

const PROMOTER = { promoters: 61, passives: 24, detractors: 15 };
const NPS = PROMOTER.promoters - PROMOTER.detractors; // 46

const AI_TOOLS = [
  { label: "الصائغ القانوني", uses: 47, color: "#0B3D2E" },
  { label: "محلّل الملف",     uses: 38, color: "#C8A762" },
  { label: "المحاكي الشامل",  uses: 22, color: "#3b82f6" },
  { label: "السكرتير الذكي",  uses: 16, color: "#8b5cf6" },
  { label: "خبير العقود",     uses: 31, color: "#10b981" },
  { label: "المجيب السريع",   uses: 29, color: "#f59e0b" },
];

const WIN = { won: 31, settled: 12, lost: 8, pending: 9 };
const WIN_TOTAL = WIN.won + WIN.settled + WIN.lost + WIN.pending;
const WIN_RATE = Math.round((WIN.won / (WIN.won + WIN.lost)) * 100);

const PRO_SCORES = [
  { label: "إتقان الصياغة", score: 88, color: "#0B3D2E" },
  { label: "سرعة الإنجاز",  score: 74, color: "#C8A762" },
  { label: "رضا الموكلين",  score: 92, color: "#10b981" },
  { label: "تنوع التخصص",   score: 67, color: "#8b5cf6" },
];

// ─── Isolated Animated Components (CPU safety) ────────────────────────────────

const ActivityBar = memo(function ActivityBar({
  data, isDark,
}: { data: { label: string; cases: number; contracts: number; consults: number }[]; isDark: boolean }) {
  const max = Math.max(...data.flatMap(d => [d.cases, d.contracts, d.consults])) || 1;
  return (
    <div className="flex items-end gap-2 h-36 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end gap-px h-28">
            {[
              { val: d.cases,     bg: "bg-[#0B3D2E]" },
              { val: d.contracts, bg: "bg-[#C8A762]" },
              { val: d.consults,  bg: "bg-blue-500/70" },
            ].map((bar, j) => (
              <motion.div
                key={j}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                style={{ height: `${(bar.val / max) * 100}%`, transformOrigin: "bottom" }}
                transition={{ type: "spring", stiffness: 120, damping: 18, delay: i * 0.04 + j * 0.03 }}
                className={`flex-1 rounded-t-sm ${bar.bg}`}
              />
            ))}
          </div>
          <span className={`text-[9px] font-mono ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{d.label}</span>
        </div>
      ))}
    </div>
  );
});

const RingScore = memo(function RingScore({
  score, color, size = 80,
}: { score: number; color: string; size?: number }) {
  const r = 36; const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible" }}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-100 dark:text-white/[0.06]" />
      {/* FIX B5: use CSS transform instead of SVG transform attr to avoid react-hooks/immutability warning */}
      <motion.circle
        cx="50" cy="50" r={r} fill="none"
        stroke={color} strokeWidth="10" strokeLinecap="round"
        style={{ transformOrigin: "50px 50px", rotate: "-90deg" }}
        initial={{ strokeDasharray: `0 ${circ}` }}
        animate={{ strokeDasharray: `${(score / 100) * circ} ${circ}` }}
        transition={{ duration: 0.9, delay: 0.2 }}
      />
    </svg>
  );
});

// Spotlight border card (design-taste-frontend)
function SpotlightCard({ children, className, isDark }: { children: React.ReactNode; className?: string; isDark: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, visible: false });

  function handleMouse(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true });
  }

  const base = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70 relative overflow-hidden"
    : "rounded-2xl border border-slate-200/60 bg-white shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)] relative overflow-hidden";

  return (
    <div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={() => setPos(p => ({ ...p, visible: false }))}
      className={`${base} ${className ?? ""}`}
    >
      {pos.visible && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            background: `radial-gradient(320px circle at ${pos.x}px ${pos.y}px, ${isDark ? "rgba(200,167,98,0.06)" : "rgba(11,61,46,0.04)"}, transparent 70%)`,
          }}
        />
      )}
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LawyerAnalyticsPage() {
  const { isDark } = useTheme();
  const [period, setPeriod] = useState<Period>("سنة");
  const [activeWorkIdx, setActiveWorkIdx] = useState<number | null>(null);

  const tx = isDark ? "text-zinc-200" : "text-slate-800";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <div className="max-w-[1160px] mx-auto space-y-5 pb-10" dir="rtl">

      {/* بيانات تجريبية Banner */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl p-4 border flex items-center gap-3 mb-5 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
          <Warning size={18} weight="fill" className="text-amber-500" />
        </div>
        <div>
          <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>بيانات تجريبية</p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/60"}`}>التحليلات ستتوفر تلقائياً بعد استخدام المنصة</p>
        </div>
      </motion.div>

      {/* ── Header + Period ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <ChartBar size={18} weight="duotone" className="text-[#0B3D2E]" />
            <h1 className={`text-lg font-bold tracking-tight ${tx}`} style={{ fontFamily: "var(--font-brand)" }}>
              إحصائيات الأداء المهني
            </h1>
          </div>
          <p className={`text-[12px] ${muted}`}>نظرة شاملة على مسيرتك القانونية ومؤشرات الأداء</p>
        </div>

        <div className={`flex gap-1 p-1 rounded-xl self-start sm:self-auto ${isDark ? "bg-zinc-800/60 border border-white/[0.06]" : "bg-slate-100"}`}>
          {(["أسبوع", "شهر", "سنة"] as Period[]).map(t => (
            <button
              key={t}
              onClick={() => setPeriod(t)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-200 ${
                period === t
                  ? isDark ? "bg-white/10 text-white shadow-sm" : "bg-white text-slate-800 shadow-sm"
                  : `${muted} hover:text-slate-700`
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bento Row 1: Work Distribution (2fr) | Win Rate (1fr) | Promoter (1fr) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr] gap-4">

        {/* Work Distribution */}
        <SpotlightCard isDark={isDark} className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={14} weight="duotone" className="text-[#C8A762]" />
            <h2 className={`text-sm font-bold ${tx}`}>توزيع نوع العمل</h2>
            <span className={`text-[10px] mr-auto font-mono ${muted}`}>إجمالي أعمالك</span>
          </div>

          <div className="space-y-3">
            {WORK_DIST.map((w, i) => {
              const Icon = w.icon;
              const isOpen = activeWorkIdx === i;
              return (
                <div key={i}>
                  <button
                    onClick={() => setActiveWorkIdx(isOpen ? null : i)}
                    className={`w-full flex items-center gap-3 rounded-xl p-2.5 transition-all duration-200 text-right ${
                      isOpen
                        ? isDark ? "bg-white/[0.06]" : "bg-slate-50"
                        : "hover:bg-black/[0.02]"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${w.color}20` }}>
                      <Icon size={16} weight="duotone" style={{ color: w.color }} />
                    </div>
                    <span className={`text-[13px] font-semibold flex-1 ${tx}`}>{w.label}</span>
                    <span className={`text-[11px] font-mono font-bold`} style={{ color: w.color }}>{w.pct}٪</span>
                    <div className={`w-24 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                      <motion.div
                        animate={{ width: `${w.pct}%` }}
                        initial={{ width: 0 }}
                        transition={{ duration: 0.7, delay: i * 0.1 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: w.color }}
                      />
                    </div>
                    <ArrowDown size={12} className={`transition-transform ${isOpen ? "rotate-180" : ""} ${muted}`} />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-1">
                          {w.sub.map(s => (
                            <span key={s} className={`text-[10px] px-2 py-0.5 rounded-full border ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                              {s}
                            </span>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </SpotlightCard>

        {/* Win Rate */}
        <SpotlightCard isDark={isDark} className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={14} weight="duotone" className="text-amber-500" />
            <h2 className={`text-sm font-bold ${tx}`}>نتائج القضايا</h2>
          </div>
          <div className="flex flex-col items-center mb-4">
            <div className="relative w-24 h-24">
              <RingScore score={WIN_RATE} color="#C8A762" size={96} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-black font-mono ${tx}`}>{WIN_RATE}٪</span>
                <span className={`text-[9px] ${muted}`}>فوز</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: "مكسوبة",   val: WIN.won,     color: "#10b981" },
              { label: "تسوية",    val: WIN.settled, color: "#3b82f6" },
              { label: "خسارة",    val: WIN.lost,    color: "#ef4444" },
              { label: "قيد النظر",val: WIN.pending, color: "#94a3b8" },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className={`text-[11px] flex-1 ${muted}`}>{s.label}</span>
                <span className={`text-[11px] font-mono font-bold ${tx}`}>{s.val}</span>
                <div className={`w-12 h-1 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(s.val / WIN_TOTAL) * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SpotlightCard>

        {/* Promoter Score */}
        <SpotlightCard isDark={isDark} className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Star size={14} weight="duotone" className="text-amber-500" />
            <h2 className={`text-sm font-bold ${tx}`}>رضا الموكلين</h2>
          </div>

          {/* NPS Score */}
          <div className="flex flex-col items-center mb-5">
            <div className="relative w-24 h-24">
              <RingScore score={NPS} color="#10b981" size={96} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-black font-mono ${tx}`}>{NPS}</span>
                <span className={`text-[9px] ${muted}`}>NPS</span>
              </div>
            </div>
          </div>

          {/* Levels */}
          <div className="space-y-2.5">
            {[
              { label: "مروّجون",  pct: PROMOTER.promoters,  icon: Smiley,    color: "#10b981" },
              { label: "محايدون",  pct: PROMOTER.passives,   icon: SmileyMeh, color: "#C8A762" },
              { label: "منتقدون",  pct: PROMOTER.detractors, icon: SmileySad, color: "#ef4444" },
            ].map(row => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-center gap-2">
                  <Icon size={14} weight="duotone" style={{ color: row.color }} />
                  <span className={`text-[11px] flex-1 ${muted}`}>{row.label}</span>
                  <span className={`text-[11px] font-mono font-bold ${tx}`}>{row.pct}٪</span>
                  <div className={`w-12 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${row.pct}%` }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className={`text-[10px] mt-3 pt-3 border-t ${isDark ? "border-white/[0.05] text-zinc-600" : "border-slate-100 text-slate-400"}`}>
            بناءً على تقييمات {Math.round(WIN_TOTAL * 1.4)} موكل
          </p>
        </SpotlightCard>
      </div>

      {/* ── Bento Row 2: Activity (1fr) | AI Carousel (3fr) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_3fr] gap-4">

        {/* Activity bars */}
        <SpotlightCard isDark={isDark} className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarCheck size={14} weight="duotone" className="text-[#0B3D2E]" />
            <h2 className={`text-sm font-bold ${tx}`}>نشاط {period === "أسبوع" ? "الأسبوع" : period === "شهر" ? "الشهر" : "السنة"}</h2>
          </div>
          <div className="flex items-center gap-3 text-[9px] mb-3">
            {[["قضايا","bg-[#0B3D2E]"],["عقود","bg-[#C8A762]"],["استشارات","bg-blue-500/70"]].map(([l,c]) => (
              <span key={l} className={`flex items-center gap-1 ${muted}`}>
                <span className={`w-2 h-2 rounded-sm ${c}`} />{l}
              </span>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={period} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <ActivityBar data={ACTIVITY_DATA[period]} isDark={isDark} />
            </motion.div>
          </AnimatePresence>
        </SpotlightCard>

        {/* AI Usage */}
        <SpotlightCard isDark={isDark} className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Robot size={14} weight="duotone" className="text-[#C8A762]" />
            <h2 className={`text-sm font-bold ${tx}`}>أكثر أدوات نظامي AI استخداماً</h2>
            <span className={`text-[10px] font-mono mr-auto ${muted}`}>
              إجمالي: {AI_TOOLS.reduce((s,a) => s+a.uses, 0)} استخدام
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {AI_TOOLS.map((tool, i) => (
              <motion.div
                key={tool.label}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 120, damping: 18, delay: i * 0.07 }}
                className="space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tool.color }} />
                    <span className={`text-[12px] font-medium ${tx}`}>{tool.label}</span>
                  </div>
                  <span className={`text-[11px] font-mono font-bold ${muted}`}>{tool.uses}×</span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(tool.uses / 47) * 100}%` }}
                    transition={{ duration: 0.7, delay: 0.1 * i }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: tool.color }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </SpotlightCard>
      </div>

      {/* ── Bento Row 3: Professional Scores ── */}
      <SpotlightCard isDark={isDark} className="p-5">
        <div className="flex items-center gap-2 mb-5">
          <Target size={14} weight="duotone" className="text-[#0B3D2E]" />
          <h2 className={`text-sm font-bold ${tx}`}>مؤشرات التطوير المهني</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {PRO_SCORES.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 100, damping: 20, delay: i * 0.1 }}
              className="flex flex-col items-center gap-2"
            >
              <div className="relative">
                <RingScore score={item.score} color={item.color} size={84} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-xl font-black font-mono ${tx}`}>{item.score}</span>
                </div>
              </div>
              <p className={`text-[11px] font-semibold text-center ${muted}`}>{item.label}</p>
            </motion.div>
          ))}
        </div>
      </SpotlightCard>

    </div>
  );
}
