import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function AreaBarChart({ data, isDark }: { data: { label: string; paid: number; pending: number }[]; isDark: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);
  
  const W = 700; const H = 180; const PAD = { t: 40, r: 20, b: 35, l: 30 };
  const W_INNER = W - PAD.l - PAD.r;
  const H_INNER = H - PAD.t - PAD.b;
  const barW = Math.max((W_INNER / data.length) - 16, 12);
  const maxVal = Math.max(...data.map(d => d.paid + d.pending), 1000);
  
  const barX = (i: number) => PAD.l + i * (W_INNER / data.length) + (W_INNER / data.length - barW) / 2;
  const barH = (v: number) => Math.max(((v / maxVal) * H_INNER), 2);
  const barY = (v: number) => H - PAD.b - barH(v);

  const formatMoney = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v;

  // Catmull-Rom smoothing
  const paidPoints = data.map((d, i) => ({ x: barX(i) + barW / 2, y: barY(d.paid) }));
  function smooth(pts: { x: number; y: number }[]) {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const cp1x = pts[i].x + (pts[i+1].x - pts[i].x) / 3;
        const cp1y = pts[i].y;
        const cp2x = pts[i].x + (pts[i+1].x - pts[i].x) / 1.5;
        const cp2y = pts[i+1].y;
        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pts[i+1].x} ${pts[i+1].y}`;
    }
    return d;
  }
  const pathLine = smooth(paidPoints);
  const pathArea = (pts: { x: number; y: number }[]) => {
    if(!pts.length) return "";
    const first = pts[0]; const last = pts[pts.length - 1];
    return smooth(pts) + ` L ${last.x} ${H - PAD.b} L ${first.x} ${H - PAD.b} Z`;
  };

  return (
    <div className="relative w-full overflow-hidden" style={{ minHeight: 200 }} dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="areaGradPremium" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="barGradPaidPremium" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0B3D2E" />
            <stop offset="100%" stopColor="#146c52" />
          </linearGradient>
          <linearGradient id="barGradPendPremium" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b8974f" />
            <stop offset="100%" stopColor="#e5cca0" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Beautiful Horizontal Grid */}
        {[0, 25, 50, 75, 100].map(pct => {
          const y = H - PAD.b - (pct / 100) * H_INNER;
          return (
            <g key={pct}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"} strokeWidth="1" strokeDasharray="4 4" />
              <text x={PAD.l - 5} y={y + 3} textAnchor="end" fontSize="10" fill={isDark ? "#71717a" : "#94a3b8"} fontWeight="500">
                {formatMoney((pct / 100) * maxVal)}
              </text>
            </g>
          );
        })}

        <path d={pathArea(paidPoints)} fill="url(#areaGradPremium)" />
        <motion.path d={pathLine} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1.2, ease: "easeOut" }} />

        {/* Dynamic Bars */}
        {data.map((d, i) => {
          const total = d.paid + d.pending;
          const x = barX(i);
          const totalBarH = barH(total);
          const paidBarH = barH(d.paid);
          const isHovered = hovered === i;
          return (
            <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} className="cursor-pointer">
              {/* Invisible touch target for easier hover */}
              <rect x={x - 8} y={PAD.t} width={barW + 16} height={H_INNER} fill="transparent" />

              {/* Pending part */}
              {d.pending > 0 && (
                <motion.rect x={x} y={barY(total)} width={barW} height={totalBarH - paidBarH} fill="url(#barGradPendPremium)" rx={barW/2}
                  opacity={isHovered ? 1 : 0.85}
                  initial={{ height: 0, y: H - PAD.b }} animate={{ height: totalBarH - paidBarH, y: barY(total) }}
                  transition={{ duration: 0.6, delay: i * 0.05 }} />
              )}
              {/* Paid part */}
              <motion.rect x={x} y={barY(d.paid)} width={barW} height={paidBarH} fill="url(#barGradPaidPremium)" rx={barW/2}
                opacity={isHovered ? 1 : 0.9}
                initial={{ height: 0, y: H - PAD.b }} animate={{ height: paidBarH, y: barY(d.paid) }}
                transition={{ duration: 0.7, delay: i * 0.05 }} />
                
              {/* Hover highlight circle on the line */}
              <motion.circle cx={paidPoints[i].x} cy={paidPoints[i].y} r={isHovered ? 5 : 3.5} fill={isDark ? "#18181b" : "#ffffff"} stroke="#10b981" strokeWidth="2.5" 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + i * 0.05 }} />

              {/* X Axis label */}
              <text x={x + barW / 2} y={H - PAD.b + 18} textAnchor="middle" fontSize="11" fontWeight={isHovered ? "700" : "600"} fill={isHovered ? (isDark ? "#ffffff" : "#0c0f12") : (isDark ? "#71717a" : "#64748b")} style={{ transition: "all 0.3s ease" }}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      
      {/* Floating Tooltip */}
      <AnimatePresence>
        {hovered !== null && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className={`absolute pointer-events-none z-10 px-4 py-3 rounded-2xl shadow-xl backdrop-blur-md border ${isDark ? "bg-zinc-900/90 border-white/10" : "bg-white/95 border-emerald-900/5"} `}
            style={{ 
              left: `${(barX(hovered) / W) * 100}%`,
              top: `${Math.max(10, (barY(data[hovered].paid + Math.max(data[hovered].pending, 0)) / H) * 100 - 45)}%`,
              transform: 'translate(-50%, -100%)'
            }}
          >
            <p className={`text-xs font-black mb-2 pb-1 border-b ${isDark ? "text-zinc-300 border-white/10" : "text-zinc-800 border-zinc-100"}`}>{data[hovered].label}</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4">
                <span className={`text-[11px] flex items-center gap-1 opacity-80 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}><span className="w-2 h-2 rounded-full bg-[#0B3D2E]"></span>محصّل</span>
                <span className="text-[12px] font-bold tracking-tight">{data[hovered].paid.toLocaleString()} ر.س</span>
              </div>
              {data[hovered].pending > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className={`text-[11px] flex items-center gap-1 opacity-80 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}><span className="w-2 h-2 rounded-full bg-[#b8974f]"></span>معلق</span>
                  <span className="text-[12px] font-bold tracking-tight">{data[hovered].pending.toLocaleString()} ر.س</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DonutChart({ paid, pending, overdue, partial }: { paid: number; pending: number; overdue: number; partial: number }) {
  const [hoveredData, setHoveredData] = useState<{lbl:string, val:number, pct:number, color:string} | null>(null);
  
  const total = paid + pending + overdue + partial;
  if (!total) return null;
  const segs = [
    { value: paid,    color: "#10b981", label: "مسدّد" },
    { value: partial, color: "#3b82f6", label: "جزئي" },
    { value: pending, color: "#f59e0b", label: "معلق" },
    { value: overdue, color: "#ef4444", label: "متأخر" },
  ].filter(s => s.value > 0);
  
  let cumulative = 0;
  const r = 42; const cx = 50; const cy = 50;
  const circ = 2 * Math.PI * r;
  const pct = Math.round(paid / total * 100);

  return (
    <div className="flex items-center gap-6" dir="ltr">
      <div className="relative w-32 h-32 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
          {/* Base Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(128,128,128,0.1)" strokeWidth="10" />
          {segs.map((seg, i) => {
            const segPct = seg.value / total;
            const rotate = (cumulative / total) * 360;
            cumulative += seg.value;
            const isHovered = hoveredData?.lbl === seg.label;
            const strokeW = isHovered ? 14 : 10;
            return (
              <motion.circle key={i} cx={cx} cy={cy} r={r}
                fill="none" stroke={seg.color} strokeWidth={strokeW}
                strokeLinecap="round"
                strokeDasharray={`${segPct * circ} ${circ}`}
                transform={`rotate(${rotate - 90} ${cx} ${cy})`}
                initial={{ strokeDasharray: `0 ${circ}`, strokeWidth: 10 }}
                animate={{ strokeDasharray: `${Math.max(segPct * circ - 4, 1)} ${circ}`, strokeWidth: strokeW }}
                transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
                onMouseEnter={() => setHoveredData({lbl: seg.label, val: seg.value, pct: Math.round(segPct*100), color: seg.color})}
                onMouseLeave={() => setHoveredData(null)}
                className="cursor-pointer transition-all duration-300 hover:drop-shadow-[0_0_4px_currentColor]"
                style={{ filter: isHovered ? `drop-shadow(0 0 6px ${seg.color}80)` : 'none' }}
              />
            );
          })}
          {/* Central content */}
          <AnimatePresence mode="wait">
            {!hoveredData ? (
              <motion.g key="default" initial={{opacity:0, scale:0.8}} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:0.8}}>
                <text x="50" y="47" textAnchor="middle" fill="#10b981" fontSize="16" fontWeight="900" fontFamily="inherit">{pct}%</text>
                <text x="50" y="60" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="600" opacity="0.4" fontFamily="inherit">محصّل</text>
              </motion.g>
            ) : (
              <motion.g key="hover" initial={{opacity:0, scale:0.8}} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:0.8}}>
                <text x="50" y="47" textAnchor="middle" fill={hoveredData.color} fontSize="16" fontWeight="900" fontFamily="inherit">{hoveredData.pct}%</text>
                <text x="50" y="60" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="600" opacity="0.6" fontFamily="inherit">{hoveredData.lbl}</text>
              </motion.g>
            )}
          </AnimatePresence>
        </svg>
      </div>

      {/* Legend list */}
      <div className="space-y-2 flex-1" dir="rtl">
        {segs.map(s => {
          const isHovered = hoveredData?.lbl === s.label;
          return (
            <div key={s.label} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${isHovered ? 'bg-black/5 dark:bg-white/5' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                 onMouseEnter={() => setHoveredData({lbl: s.label, val: s.value, pct: Math.round(s.value/total*100), color: s.color})}
                 onMouseLeave={() => setHoveredData(null)}>
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all ${isHovered ? 'scale-125' : ''}`} style={{ backgroundColor: s.color, boxShadow: isHovered ? `0 0 8px ${s.color}60` : 'none' }} />
              <span className={`text-[11px] font-semibold transition-opacity ${isHovered ? 'opacity-100' : 'opacity-70'}`}>{s.label}</span>
              <span className={`font-black tracking-tight text-[11px] ms-auto ps-3 transition-transform ${isHovered ? 'scale-105 origin-left' : ''}`} style={{color: isHovered ? s.color : 'inherit'}}>{s.value.toLocaleString()} ﷼</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
