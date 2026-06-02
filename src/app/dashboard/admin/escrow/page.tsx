"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  Vault, Money, Clock, CheckCircle, Warning, ArrowSquareOut,
  MagnifyingGlass, Funnel, Eye, ArrowClockwise, Scales,
  TrendUp, ChartLine, X,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

/* ── Mock ──────────────────────────────────────────────────────────────────── */
const ESCROW_ITEMS = [
  { id:"ESC-301", client:"شركة الحلول القانونية", provider:"أ. محمد العتيبي", amount:4500, status:"held" as const, service:"استشارة قانونية", date:"منذ ٣ أيام", daysHeld:3 },
  { id:"ESC-300", client:"نورة الحارثي", provider:"خالد الشمري — موثّق", amount:1200, status:"held" as const, service:"توثيق عقد", date:"منذ ٥ أيام", daysHeld:5 },
  { id:"ESC-299", client:"مكتب البراك للمحاماة", provider:"أ. سارة الزهراني", amount:8000, status:"released" as const, service:"صياغة عقد", date:"منذ أسبوع", daysHeld:0 },
  { id:"ESC-298", client:"مؤسسة النور التجارية", provider:"أ. فهد القحطاني", amount:3200, status:"disputed" as const, service:"تمثيل قضائي", date:"منذ ١٠ أيام", daysHeld:10 },
  { id:"ESC-297", client:"أ. عبدالله العمري", provider:"محمد البلوي — محكّم", amount:6500, status:"released" as const, service:"تحكيم تجاري", date:"منذ أسبوعين", daysHeld:0 },
  { id:"ESC-296", client:"شركة التقنية والقانون", provider:"أ. نوف العنزي", amount:2800, status:"refunded" as const, service:"مراجعة عقود", date:"منذ ٣ أسابيع", daysHeld:0 },
];

const STATUS_CFG: Record<string,{label:string;cls:string}> = {
  held:     { label:"محتجز",  cls:"bg-amber-500/10 border-amber-500/20 text-amber-400" },
  released: { label:"محرر",   cls:"bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
  disputed: { label:"متنازع", cls:"bg-red-500/10 border-red-500/20 text-red-400" },
  refunded: { label:"مسترجع", cls:"bg-blue-500/10 border-blue-500/20 text-blue-400" },
};

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function EscrowPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState("all");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const held = ESCROW_ITEMS.filter(e=>e.status==="held");
  const totalHeld = held.reduce((s,e)=>s+e.amount, 0);
  const totalReleased = ESCROW_ITEMS.filter(e=>e.status==="released").reduce((s,e)=>s+e.amount, 0);
  const totalDisputed = ESCROW_ITEMS.filter(e=>e.status==="disputed").reduce((s,e)=>s+e.amount, 0);
  const avgDays = held.length ? Math.round(held.reduce((s,e)=>s+e.daysHeld,0)/held.length) : 0;

  const filtered = filter==="all" ? ESCROW_ITEMS : ESCROW_ITEMS.filter(e=>e.status===filter);

  // Monthly volume chart
  const monthlyData = [
    { m:"يناير", val:42000 },{ m:"فبراير", val:58000 },{ m:"مارس", val:51000 },
    { m:"أبريل", val:67000 },{ m:"مايو", val:73000 },{ m:"يونيو", val:89000 },
  ];
  const maxM = Math.max(...monthlyData.map(d=>d.val));

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
        <h1 className={`text-xl font-bold mb-1 ${isDark?"text-white":"text-slate-800"}`}>إدارة الضمان (Escrow)</h1>
        <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>متابعة أموال الضمان بين طالبي الخدمات ومقدميها</p>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"أموال محتجزة", val:`${totalHeld.toLocaleString("ar-SA")} ر.س`, icon:Vault, c:"text-amber-400" },
          { label:"محررة (الشهر)", val:`${totalReleased.toLocaleString("ar-SA")} ر.س`, icon:CheckCircle, c:"text-emerald-400" },
          { label:"متنازع عليها", val:`${totalDisputed.toLocaleString("ar-SA")} ر.س`, icon:Scales, c:"text-red-400" },
          { label:"متوسط فترة الاحتجاز", val:`${avgDays} يوم`, icon:Clock, c:"text-blue-400" },
        ].map((k,i)=>(
          <motion.div key={i} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.06}}
            className={`${card} p-4 flex items-center gap-3`}>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark?"bg-white/[0.04]":"bg-slate-50"} ${k.c}`}>
              <k.icon size={18} weight="duotone"/>
            </div>
            <div>
              <p className={`text-[10px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{k.label}</p>
              <p className={`text-[18px] font-bold ${k.c}`}>{k.val}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Chart — Monthly Volume */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <p className={`text-[12px] font-bold ${isDark?"text-white":"text-slate-800"}`}>حجم Escrow الشهري (ر.س)</p>
          <span className="text-[10px] font-bold text-emerald-400">+٢١.٩% نمو</span>
        </div>
        <div className="flex items-end gap-4 h-28">
          {monthlyData.map((d,i)=>(
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className={`text-[8px] font-bold ${isDark?"text-zinc-400":"text-slate-500"}`}>{(d.val/1000).toFixed(0)}k</span>
              <motion.div initial={{height:0}} animate={{height:`${(d.val/maxM)*100}%`}}
                transition={{delay:i*0.08,duration:0.6,type:"spring",stiffness:100,damping:20}}
                className="w-full rounded-t-lg bg-gradient-to-t from-[#C8A762]/80 to-amber-400/60" style={{minHeight:4}}/>
              <span className={`text-[8px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{d.m.slice(0,3)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        {[["all","الكل"],["held","محتجز"],["released","محرر"],["disputed","متنازع"],["refunded","مسترجع"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              filter===v?"bg-[#C8A762] text-black":isDark?"bg-white/[0.04] text-zinc-500":"bg-slate-100 text-slate-500"
            }`}>{l}</button>
        ))}
      </div>

      {/* Table */}
      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-right">
          <thead><tr className={`border-b ${isDark?"border-white/[0.06]":"border-slate-100"}`}>
            {["العملية","الطالب","المزود","الخدمة","المبلغ","الحالة","التاريخ","إجراء"].map(h=>(
              <th key={h} className={`px-4 py-3 text-[10px] font-bold uppercase ${isDark?"text-zinc-600":"text-slate-400"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map((e,i)=>{
              const sc = STATUS_CFG[e.status];
              return (
                <motion.tr key={e.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.04}}
                  className={`border-b ${isDark?"border-white/[0.04] hover:bg-white/[0.02]":"border-slate-50 hover:bg-slate-50/50"} group transition-colors`}>
                  <td className="px-4 py-3"><span className={`text-[11px] font-bold ${isDark?"text-zinc-300":"text-slate-600"}`}>{e.id}</span></td>
                  <td className="px-4 py-3"><span className={`text-[11px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{e.client}</span></td>
                  <td className="px-4 py-3"><span className={`text-[11px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{e.provider}</span></td>
                  <td className="px-4 py-3"><span className={`text-[10px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{e.service}</span></td>
                  <td className="px-4 py-3"><span className={`text-[12px] font-bold ${isDark?"text-white":"text-slate-800"}`}>{e.amount.toLocaleString("ar-SA")} <span className="text-[9px] font-normal text-zinc-500">ر.س</span></span></td>
                  <td className="px-4 py-3"><span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span></td>
                  <td className="px-4 py-3"><span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{e.date}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {e.status==="held" && <>
                        <button className="h-7 px-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-[9px] font-bold hover:bg-emerald-500/20 transition-colors flex items-center gap-1">
                          <ArrowSquareOut size={10}/> تحرير
                        </button>
                        <button className="h-7 px-2 rounded-lg bg-blue-500/10 text-blue-400 text-[9px] font-bold hover:bg-blue-500/20 transition-colors flex items-center gap-1">
                          <ArrowClockwise size={10}/> استرجاع
                        </button>
                      </>}
                      {e.status==="disputed" && (
                        <button className="h-7 px-2 rounded-lg bg-amber-500/10 text-amber-400 text-[9px] font-bold hover:bg-amber-500/20 transition-colors flex items-center gap-1">
                          <Scales size={10}/> حل النزاع
                        </button>
                      )}
                      <button className={`h-7 w-7 rounded-lg flex items-center justify-center ${isDark?"bg-white/[0.04] text-zinc-400 hover:text-white":"bg-slate-50 text-slate-400 hover:text-slate-700"} transition-colors`}>
                        <Eye size={12}/>
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
