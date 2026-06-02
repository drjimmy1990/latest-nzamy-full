"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  UsersThree, Gavel, ChartBarHorizontal, Warning,
  CheckCircle, Clock, ArrowLeft, ArrowsCounterClockwise,
  SortAscending, MagnifyingGlass, SquaresFour, Rows,
  TrendUp, TrendDown, Scales, FileText, Handshake,
  MagnifyingGlassPlus, ChatCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────
type LoadStatus = "overloaded" | "busy" | "normal" | "light";

interface TaskBreakdown {
  litigation: number;
  memos: number;
  contracts_complex: number;
  contracts_standard: number;
  due_diligence: number;
  advisory: number;
  negotiations: number;
}

interface MemberLoad {
  id: string;
  name: string;
  role: "partner" | "associate" | "trainee";
  specialization: string;
  tasks: TaskBreakdown;
  utilizationRate: number;
  deadlineAdherence: number;
  winRate?: number;
  trend: "up" | "down" | "stable";
}

// ─── Weights (UTBMS-aligned) ──────────────────────────────────────────────────
const TASK_WEIGHTS: Record<keyof TaskBreakdown, { weight: number; label: string; icon: typeof Gavel }> = {
  litigation:          { weight: 8, label: "ترافع",           icon: Scales },
  memos:               { weight: 5, label: "مذكرات",          icon: FileText },
  contracts_complex:   { weight: 5, label: "عقود معقدة",      icon: Handshake },
  contracts_standard:  { weight: 2, label: "عقود نمطية",      icon: FileText },
  due_diligence:       { weight: 6, label: "عناية واجبة",     icon: MagnifyingGlassPlus },
  advisory:            { weight: 3, label: "استشارات وبحث",   icon: ChatCircle },
  negotiations:        { weight: 4, label: "تفاوض",           icon: Handshake },
};

const MAX_POINTS = 50;

function calcPoints(tasks: TaskBreakdown): number {
  return (Object.keys(tasks) as (keyof TaskBreakdown)[])
    .reduce((sum, k) => sum + tasks[k] * TASK_WEIGHTS[k].weight, 0);
}

function getStatus(pts: number): LoadStatus {
  if (pts >= 46) return "overloaded";
  if (pts >= 36) return "busy";
  if (pts >= 21) return "normal";
  return "light";
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const TEAM: MemberLoad[] = [
  { id:"1", name:"سارة المنصور",  role:"partner",   specialization:"التجاري والعقاري", tasks:{ litigation:2, memos:1, contracts_complex:1, contracts_standard:2, due_diligence:0, advisory:2, negotiations:1 }, utilizationRate:72, deadlineAdherence:96, winRate:85, trend:"stable" },
  { id:"2", name:"تركي العمر",    role:"associate", specialization:"العمالي والمدني",  tasks:{ litigation:3, memos:2, contracts_complex:0, contracts_standard:1, due_diligence:1, advisory:1, negotiations:0 }, utilizationRate:81, deadlineAdherence:88, winRate:78, trend:"up" },
  { id:"3", name:"نورة الشمري",   role:"associate", specialization:"الأحوال الشخصية", tasks:{ litigation:1, memos:1, contracts_complex:0, contracts_standard:0, due_diligence:0, advisory:3, negotiations:1 }, utilizationRate:65, deadlineAdherence:97, winRate:90, trend:"stable" },
  { id:"4", name:"خالد الحربي",   role:"associate", specialization:"الإداري",          tasks:{ litigation:0, memos:1, contracts_complex:1, contracts_standard:3, due_diligence:0, advisory:1, negotiations:0 }, utilizationRate:55, deadlineAdherence:94, trend:"down" },
  { id:"5", name:"موضي القرشي",   role:"trainee",   specialization:"عام",              tasks:{ litigation:0, memos:1, contracts_complex:0, contracts_standard:2, due_diligence:0, advisory:1, negotiations:0 }, utilizationRate:48, deadlineAdherence:92, trend:"stable" },
  { id:"6", name:"فيصل الدوسري",  role:"trainee",   specialization:"التجاري",          tasks:{ litigation:0, memos:0, contracts_complex:0, contracts_standard:1, due_diligence:0, advisory:2, negotiations:0 }, utilizationRate:40, deadlineAdherence:100, trend:"down" },
];

// ─── Config ───────────────────────────────────────────────────────────────────
const spring = { type: "spring" as const, stiffness: 100, damping: 20 };

const STATUS_CFG: Record<LoadStatus, { label: string; bar: string; text: string; bg: string; icon: typeof Warning }> = {
  overloaded: { label:"مثقّل", bar:"bg-red-500",   text:"text-red-500",   bg:"bg-red-500/8",   icon: Warning },
  busy:       { label:"مشغول", bar:"bg-amber-400", text:"text-amber-500", bg:"bg-amber-500/8", icon: Clock },
  normal:     { label:"معتدل", bar:"bg-[#0B3D2E]", text:"text-[#0B3D2E]", bg:"bg-[#0B3D2E]/8", icon: CheckCircle },
  light:      { label:"خفيف", bar:"bg-blue-400",   text:"text-blue-500",  bg:"bg-blue-500/8",  icon: ChartBarHorizontal },
};

const ROLE_LABEL: Record<string, string> = { partner:"شريك", associate:"محامي", trainee:"متدرب" };

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FirmWorkloadPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"load"|"util"|"deadline">("load");
  const [viewMode, setViewMode] = useState<"list"|"grid">("list");

  const allPoints = TEAM.map(m => ({ ...m, pts: calcPoints(m.tasks) }));
  const teamAvg = Math.round(allPoints.reduce((s,m) => s + m.pts, 0) / allPoints.length);
  const overloaded = allPoints.filter(m => getStatus(m.pts) === "overloaded").length;
  const lightCount = allPoints.filter(m => getStatus(m.pts) === "light").length;
  const totalPts = allPoints.reduce((s,m) => s + m.pts, 0);

  const filtered = allPoints
    .filter(m => !search || m.name.includes(search) || m.specialization.includes(search))
    .sort((a,b) => {
      if (sortBy === "load") return b.pts - a.pts;
      if (sortBy === "util") return b.utilizationRate - a.utilizationRate;
      return b.deadlineAdherence - a.deadlineAdherence;
    });

  const muted = isDark ? "text-zinc-500" : "text-slate-400";
  const card = `rounded-2xl border p-5 ${isDark ? "bg-zinc-900/60 border-white/[0.06]" : "bg-white border-slate-100 shadow-sm"}`;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5" dir="rtl">
      {/* Header */}
      <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>توزيع عبء العمل</h1>
          <p className={`text-sm ${muted}`}>
            {TEAM.length} أعضاء · {totalPts} نقطة إجمالاً · المتوسط {teamAvg} نقطة/فرد
            {overloaded > 0 && <span className="text-red-500 font-bold"> · {overloaded} مثقّل</span>}
          </p>
        </div>
        <Link href="/dashboard/firm/team" className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          <UsersThree size={15} /> إدارة الفريق
        </Link>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:"مثقّلون", value:String(overloaded), color:"text-red-500", bg:"bg-red-500/8", icon:Warning, warn:overloaded>0 },
          { label:"إجمالي النقاط", value:String(totalPts), color:"text-[#0B3D2E]", bg:"bg-[#0B3D2E]/8", icon:Gavel, warn:false },
          { label:"طاقة خفيفة", value:String(lightCount), color:"text-blue-500", bg:"bg-blue-500/8", icon:ArrowsCounterClockwise, warn:false },
          { label:"متوسط نقطة/محامي", value:String(teamAvg), color:"text-amber-500", bg:"bg-amber-500/8", icon:ChartBarHorizontal, warn:false },
        ].map((kpi,i) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={i} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ ...spring, delay:i*0.05 }} className={card}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${kpi.bg}`}>
                <Icon size={16} weight={kpi.warn?"fill":"duotone"} className={kpi.color} />
              </div>
              <p className={`text-[24px] font-black font-mono leading-none ${kpi.warn?"text-red-500":isDark?"text-white":"text-slate-900"}`}>{kpi.value}</p>
              <p className={`text-[11px] mt-1 ${muted}`}>{kpi.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark?"border-white/[0.06] bg-zinc-900/60":"border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={15} className={muted} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث بالاسم أو التخصص..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark?"text-zinc-200 placeholder:text-zinc-600":"text-slate-700 placeholder:text-slate-400"}`} />
        </div>
        <div className="flex gap-1.5">
          {([{key:"load",label:"الأثقل"},{key:"util",label:"الاستغلال"},{key:"deadline",label:"الالتزام"}] as const).map(s=>(
            <button key={s.key} onClick={()=>setSortBy(s.key)}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${sortBy===s.key?"bg-[#0B3D2E] text-white border-[#0B3D2E]":isDark?"border-white/[0.06] text-zinc-500":"border-slate-100 text-slate-500"}`}>
              <SortAscending size={12} /> {s.label}
            </button>
          ))}
        </div>
        <div className={`flex gap-1 p-1 rounded-xl border ${isDark?"border-white/[0.06] bg-zinc-900/40":"border-slate-200 bg-slate-50"}`}>
          {([{mode:"list" as const,icon:Rows},{mode:"grid" as const,icon:SquaresFour}]).map(({mode,icon:Icon})=>(
            <button key={mode} onClick={()=>setViewMode(mode)}
              className={`p-1.5 rounded-lg cursor-pointer transition-all ${viewMode===mode?isDark?"bg-zinc-700 text-white":"bg-white text-slate-700 shadow-sm":isDark?"text-zinc-600":"text-slate-400"}`}>
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>

      {/* Team */}
      <div className={viewMode==="grid"?"grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4":"space-y-3"}>
        {filtered.length===0 ? (
          <div className={`${card} p-12 text-center ${viewMode==="grid"?"md:col-span-3":""}`}>
            <UsersThree size={36} weight="duotone" className={`mx-auto mb-3 ${isDark?"text-zinc-700":"text-slate-300"}`} />
            <p className={`text-sm ${muted}`}>لا توجد نتائج مطابقة</p>
          </div>
        ) : filtered.map(m => {
          const status = getStatus(m.pts);
          const cfg = STATUS_CFG[status];
          const StatusIcon = cfg.icon;
          const pct = Math.min(Math.round((m.pts/MAX_POINTS)*100),100);
          const vsAvg = m.pts - teamAvg;
          const activeTaskTypes = (Object.keys(m.tasks) as (keyof TaskBreakdown)[]).filter(k => m.tasks[k] > 0);

          if (viewMode === "list") {
            return (
              <motion.div key={m.id} layout initial={{opacity:0,x:12}} animate={{opacity:1,x:0}} transition={spring}
                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${isDark?`bg-zinc-900/60 border-white/[0.06] ${status==="overloaded"?"border-red-500/20":""}`:`bg-white border-slate-100 shadow-sm ${status==="overloaded"?"border-red-200":""}`}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm flex-shrink-0 ${m.role==="partner"?"bg-gradient-to-br from-[#0B3D2E] to-[#1a5c45]":"bg-[#0B3D2E]/70"}`}>{m.name.charAt(0)}</div>
                <div className="w-28 flex-shrink-0">
                  <p className={`text-[13px] font-bold ${isDark?"text-zinc-100":"text-slate-800"}`}>{m.name}</p>
                  <p className={`text-[11px] ${muted}`}>{ROLE_LABEL[m.role]} · {m.specialization}</p>
                </div>
                {/* Load bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-mono font-bold ${cfg.text}`}>{m.pts}/{MAX_POINTS}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${cfg.bg} ${cfg.text}`}><StatusIcon size={9} weight="fill" /> {cfg.label}</span>
                  </div>
                  <div className={`w-full h-2 rounded-full ${isDark?"bg-zinc-800":"bg-slate-100"}`}>
                    <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{...spring,delay:0.1}} className={`h-full rounded-full ${cfg.bar} ${pct>=100?"animate-pulse":""}`} />
                  </div>
                  {/* Task chips */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {activeTaskTypes.map(k => {
                      const tw = TASK_WEIGHTS[k];
                      return <span key={k} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDark?"bg-white/[0.05] text-zinc-400":"bg-slate-100 text-slate-500"}`}>{tw.label} ×{m.tasks[k]}</span>;
                    })}
                  </div>
                </div>
                {/* Metrics */}
                <div className="flex gap-3 flex-shrink-0 text-center">
                  <div><p className={`text-[13px] font-black font-mono ${isDark?"text-white":"text-slate-800"}`}>{m.utilizationRate}%</p><p className={`text-[9px] ${muted}`}>استغلال</p></div>
                  <div><p className={`text-[13px] font-black font-mono ${m.deadlineAdherence>=95?"text-emerald-500":m.deadlineAdherence>=90?isDark?"text-white":"text-slate-800":"text-amber-500"}`}>{m.deadlineAdherence}%</p><p className={`text-[9px] ${muted}`}>التزام</p></div>
                  {m.winRate && <div><p className={`text-[13px] font-black font-mono ${isDark?"text-[#C8A762]":"text-[#0B3D2E]"}`}>{m.winRate}%</p><p className={`text-[9px] ${muted}`}>فوز</p></div>}
                </div>
                {/* vs avg */}
                <div className="flex-shrink-0 w-16 text-center">
                  <p className={`text-[12px] font-bold font-mono ${vsAvg>5?"text-red-500":vsAvg<-5?"text-blue-500":isDark?"text-zinc-400":"text-slate-500"}`}>
                    {vsAvg>0?`+${vsAvg}`:String(vsAvg)}
                  </p>
                  <p className={`text-[9px] ${muted}`}>vs المتوسط</p>
                </div>
                <div className="flex-shrink-0">
                  {m.trend==="up"&&<TrendUp size={14} className="text-amber-500"/>}
                  {m.trend==="down"&&<TrendDown size={14} className="text-blue-400"/>}
                  {m.trend==="stable"&&<span className={`text-[10px] font-bold ${muted}`}>—</span>}
                </div>
              </motion.div>
            );
          }

          // Grid card
          return (
            <motion.div key={m.id} layout initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={spring}
              className={`rounded-2xl border p-5 transition-all ${isDark?`bg-zinc-900/60 border-white/[0.06] ${status==="overloaded"?"border-red-500/25 bg-red-500/[0.03]":""}`: `bg-white shadow-sm border-slate-100 ${status==="overloaded"?"border-red-200 bg-red-50/30":""}`}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white text-sm ${m.role==="partner"?"bg-gradient-to-br from-[#0B3D2E] to-[#1a5c45]":"bg-[#0B3D2E]/70"}`}>{m.name.charAt(0)}</div>
                  <div>
                    <p className={`text-[13px] font-bold ${isDark?"text-zinc-100":"text-slate-800"}`}>{m.name}</p>
                    <p className={`text-[11px] ${muted}`}>{ROLE_LABEL[m.role]}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 ${cfg.bg} ${cfg.text}`}><StatusIcon size={10} weight="fill" /> {cfg.label}</span>
              </div>
              {/* Load bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[11px] ${muted}`}>عبء العمل</span>
                  <span className={`text-[12px] font-black font-mono ${cfg.text}`}>{m.pts}/{MAX_POINTS}</span>
                </div>
                <div className={`w-full h-2 rounded-full ${isDark?"bg-zinc-800":"bg-slate-100"}`}>
                  <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{...spring,delay:0.1}} className={`h-full rounded-full ${cfg.bar}`} />
                </div>
              </div>
              {/* Task chips */}
              <div className="flex flex-wrap gap-1 mb-3">
                {activeTaskTypes.map(k => {
                  const tw = TASK_WEIGHTS[k];
                  return <span key={k} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isDark?"bg-white/[0.05] text-zinc-400":"bg-slate-100 text-slate-500"}`}>{tw.label} ×{m.tasks[k]}</span>;
                })}
              </div>
              {/* Stats */}
              <div className={`grid grid-cols-3 gap-2 py-3 border-t border-b mb-3 text-center ${isDark?"border-white/[0.05]":"border-slate-100"}`}>
                <div><p className={`text-[14px] font-black font-mono ${isDark?"text-white":"text-slate-800"}`}>{m.utilizationRate}%</p><p className={`text-[9px] ${muted}`}>استغلال</p></div>
                <div><p className={`text-[14px] font-black font-mono ${m.deadlineAdherence>=95?"text-emerald-500":"text-amber-500"}`}>{m.deadlineAdherence}%</p><p className={`text-[9px] ${muted}`}>التزام</p></div>
                <div><p className={`text-[14px] font-black font-mono ${vsAvg>5?"text-red-500":vsAvg<-5?"text-blue-500":isDark?"text-zinc-400":"text-slate-500"}`}>{vsAvg>0?`+${vsAvg}`:String(vsAvg)}</p><p className={`text-[9px] ${muted}`}>vs المتوسط</p></div>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] ${muted}`}>{m.specialization}</span>
                <Link href={`/dashboard/firm/team/${m.id}`} className={`text-[11px] font-bold flex items-center gap-1 hover:underline ${isDark?"text-zinc-400":"text-slate-500"}`}>الملف <ArrowLeft size={10}/></Link>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Rebalance suggestion */}
      {overloaded > 0 && lightCount > 0 && (
        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:0.3}}
          className={`rounded-2xl border-2 border-dashed p-5 flex items-center gap-4 ${isDark?"border-amber-500/20 bg-amber-500/5":"border-amber-200 bg-amber-50/50"}`}>
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <ArrowsCounterClockwise size={20} className="text-amber-500" weight="duotone" />
          </div>
          <div className="flex-1">
            <p className={`text-sm font-bold ${isDark?"text-white":"text-slate-800"}`}>اقتراح إعادة توزيع</p>
            <p className={`text-xs mt-0.5 ${muted}`}>{overloaded} محامٍ مثقّل و{lightCount} بطاقة خفيفة — يمكن نقل مهام لتحقيق توازن</p>
          </div>
          <button className="shrink-0 px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors cursor-pointer">عرض الاقتراح</button>
        </motion.div>
      )}
    </div>
  );
}
