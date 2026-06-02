"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import {
  Graph, Scales, UserFocus, UserCircle,
  FileText, Buildings, Handshake, ShieldCheck
} from "@phosphor-icons/react";

// Mock graph data for a typical labor/commercial case
const MOCK_NODES = [
  { id: "1", type: "court", label: "المحكمة التجارية بالرياض", x: 400, y: 50 },
  { id: "2", type: "client", label: "شركة الأفق للمقاولات (المدعي)", x: 200, y: 200 },
  { id: "3", type: "defendant", label: "مؤسسة النور (المدعى عليه)", x: 600, y: 200 },
  { id: "4", type: "evidence", label: "عقد المقاولة الأساسي", x: 400, y: 350 },
  { id: "5", type: "evidence", label: "مراسلات البريد الإلكتروني", x: 250, y: 350 },
  { id: "6", type: "claim", label: "مطالبة مالية (١.٢ مليون)", x: 400, y: 150 },
  { id: "7", type: "lawyer", label: "سلمان العتيبي (محامي)", x: 100, y: 100 },
];

const MOCK_EDGES = [
  { source: "2", target: "6", label: "يطالب بـ" },
  { source: "6", target: "3", label: "ضد" },
  { source: "6", target: "1", label: "منظورة أمام" },
  { source: "4", target: "6", label: "مستند داعم" },
  { source: "5", target: "6", label: "مستند داعم" },
  { source: "7", target: "2", label: "يمثل" },
];

export default function LegalCanvas() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const getNodeStyle = (type: string) => {
    switch (type) {
      case "court": return { bg: isDark ? "bg-amber-900/40" : "bg-amber-100", border: "border-amber-500", text: "text-amber-500", icon: Buildings };
      case "client": return { bg: isDark ? "bg-emerald-900/40" : "bg-emerald-100", border: "border-emerald-500", text: "text-emerald-500", icon: ShieldCheck };
      case "defendant": return { bg: isDark ? "bg-red-900/40" : "bg-red-100", border: "border-red-500", text: "text-red-500", icon: UserCircle };
      case "evidence": return { bg: isDark ? "bg-slate-800" : "bg-slate-100", border: "border-slate-400", text: "text-slate-500", icon: FileText };
      case "claim": return { bg: isDark ? "bg-blue-900/40" : "bg-blue-100", border: "border-blue-500", text: "text-blue-500", icon: Scales };
      case "lawyer": return { bg: isDark ? "bg-royal/20" : "bg-royal/10", border: "border-royal", text: "text-royal", icon: UserFocus };
      default: return { bg: "bg-gray-100", border: "border-gray-300", text: "text-gray-500", icon: Graph };
    }
  };

  return (
    <div className={`${card} h-[600px] relative overflow-hidden flex flex-col`}>
      <div className="p-4 border-b dark:border-white/[0.06] border-slate-100 flex items-center justify-between z-10 bg-inherit">
        <h3 className={`text-[14px] font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}>
          <Graph size={18} className="text-royal" />
          خريطة علاقات القضية (Legal Canvas)
        </h3>
        <span className={`text-[10px] font-mono px-2 py-1 rounded ${isDark ? "bg-white/[0.05] text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
          AI-Generated Map
        </span>
      </div>
      
      <div className="flex-1 relative bg-grid-slate-200/[0.04] dark:bg-grid-white/[0.02]">
        {/* Simple SVG Edges */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {MOCK_EDGES.map((edge, i) => {
            const sourceNode = MOCK_NODES.find(n => n.id === edge.source);
            const targetNode = MOCK_NODES.find(n => n.id === edge.target);
            if (!sourceNode || !targetNode) return null;
            
            // Adjust to center of nodes (approximate)
            const sx = sourceNode.x + 80;
            const sy = sourceNode.y + 20;
            const tx = targetNode.x + 80;
            const ty = targetNode.y + 20;
            
            return (
              <g key={i}>
                <line x1={sx} y1={sy} x2={tx} y2={ty} stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} strokeWidth={2} strokeDasharray="4 4" />
                <rect x={(sx+tx)/2 - 30} y={(sy+ty)/2 - 10} width={60} height={20} rx={4} fill={isDark ? "#18181b" : "#ffffff"} />
                <text x={(sx+tx)/2} y={(sy+ty)/2 + 3} textAnchor="middle" fontSize={8} fill={isDark ? "#a1a1aa" : "#64748b"} fontWeight="bold">
                  {edge.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {MOCK_NODES.map((node) => {
          const style = getNodeStyle(node.type);
          const Icon = style.icon;
          return (
            <motion.div
              key={node.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              drag
              dragMomentum={false}
              className={`absolute cursor-grab active:cursor-grabbing px-3 py-2 rounded-xl border shadow-lg flex items-center gap-2 ${style.bg} ${style.border}`}
              style={{ left: node.x, top: node.y, width: 160 }}
            >
              <Icon size={16} weight="fill" className={style.text} />
              <span className={`text-[10px] font-bold text-center flex-1 ${isDark ? "text-white" : "text-slate-800"}`}>
                {node.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
