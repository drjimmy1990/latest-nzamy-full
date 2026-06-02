"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  ArrowSquareOut, Money, Clock, CheckCircle, Warning, X,
  MagnifyingGlass, Eye, Bank, ChartLine, TrendUp,
  Check, Prohibit, Users,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

/* ── Mock ──────────────────────────────────────────────────────────────────── */
const PAYOUTS = [
  { id:"PO-187", provider:"أ. محمد العتيبي", amount:3200, bank:"الراجحي", iban:"SA44 2000 **** 4821", status:"pending" as const, date:"منذ ساعتين" },
  { id:"PO-186", provider:"خالد الشمري — موثّق", amount:1800, bank:"الأهلي", iban:"SA31 1000 **** 7392", status:"pending" as const, date:"منذ ٥ ساعات" },
  { id:"PO-185", provider:"أ. سارة الزهراني", amount:5400, bank:"الراجحي", iban:"SA12 2000 **** 9181", status:"approved" as const, date:"منذ يوم" },
  { id:"PO-184", provider:"أ. فهد القحطاني", amount:2100, bank:"الإنماء", iban:"SA78 0500 **** 3847", status:"transferred" as const, date:"منذ ٣ أيام" },
  { id:"PO-183", provider:"محمد البلوي — محكّم", amount:7800, bank:"الأهلي", iban:"SA55 1000 **** 6214", status:"transferred" as const, date:"منذ ٥ أيام" },
  { id:"PO-182", provider:"أ. نوف العنزي", amount:900, bank:"الراجحي", iban:"SA88 2000 **** 1029", status:"rejected" as const, date:"منذ أسبوع" },
];

const STATUS_CFG: Record<string,{label:string;cls:string}> = {
  pending:     { label:"معلق",       cls:"bg-amber-500/10 border-amber-500/20 text-amber-400" },
  approved:    { label:"تمت الموافقة", cls:"bg-blue-500/10 border-blue-500/20 text-blue-400" },
  transferred: { label:"محول",       cls:"bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
  rejected:    { label:"مرفوض",      cls:"bg-red-500/10 border-red-500/20 text-red-400" },
  failed:      { label:"فشل",        cls:"bg-red-500/10 border-red-500/20 text-red-400" },
};

export default function PayoutsPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const pending = PAYOUTS.filter(p=>p.status==="pending");
  const totalPending = pending.reduce((s,p)=>s+p.amount, 0);
  const totalTransferred = PAYOUTS.filter(p=>p.status==="transferred").reduce((s,p)=>s+p.amount, 0);

  const filtered = filter==="all" ? PAYOUTS : PAYOUTS.filter(p=>p.status===filter);

  const toggleSelect = (id:string) => setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);

  // Monthly transfers chart
  const monthlyTransfers = [
    { m:"يناير", val:28000 },{ m:"فبراير", val:34000 },{ m:"مارس", val:41000 },
    { m:"أبريل", val:38000 },{ m:"مايو", val:52000 },{ m:"يونيو", val:61000 },
  ];
  const maxT = Math.max(...monthlyTransfers.map(d=>d.val));

  // Top providers
  const topProviders = [
    { name:"أ. محمد العتيبي", total:18200, pct:100 },
    { name:"محمد البلوي — محكّم", total:14600, pct:80 },
    { name:"أ. سارة الزهراني", total:11400, pct:63 },
    { name:"خالد الشمري — موثّق", total:8900, pct:49 },
    { name:"أ. فهد القحطاني", total:6200, pct:34 },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
        <h1 className={`text-xl font-bold mb-1 ${isDark?"text-white":"text-slate-800"}`}>طلبات السحب (Payouts)</h1>
        <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>إدارة طلبات سحب أرباح مقدمي الخدمات</p>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"طلبات معلقة", val:pending.length.toString(), icon:Clock, c:"text-amber-400" },
          { label:"مبلغ معلق", val:`${totalPending.toLocaleString("ar-SA")} ر.س`, icon:Money, c:"text-amber-400" },
          { label:"محول (الشهر)", val:`${totalTransferred.toLocaleString("ar-SA")} ر.س`, icon:CheckCircle, c:"text-emerald-400" },
          { label:"متوسط وقت المعالجة", val:"١.٤ يوم", icon:TrendUp, c:"text-blue-400" },
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

      {/* Charts Row */}
      <div className="grid grid-cols-5 gap-4">
        {/* Monthly Transfers Line */}
        <div className={`${card} p-5 col-span-3`}>
          <p className={`text-[12px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>حجم التحويلات الشهرية (ر.س)</p>
          <svg viewBox="0 0 300 80" className="w-full h-20" preserveAspectRatio="none">
            <defs>
              <linearGradient id="payout-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.2"/>
                <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {(() => {
              const pts = monthlyTransfers.map((d,i)=>({
                x: 10 + (i/(monthlyTransfers.length-1))*280,
                y: 8 + (1-d.val/maxT)*64,
              }));
              const line = pts.map((p,i)=>i===0?`M${p.x},${p.y}`:`L${p.x},${p.y}`).join(" ");
              const area = line + ` L${pts[pts.length-1].x},80 L${pts[0].x},80 Z`;
              return <>
                <path d={area} fill="url(#payout-fill)"/>
                <path d={line} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
                {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3" fill="#10b981"/>)}
              </>;
            })()}
          </svg>
          <div className="flex justify-between mt-1">
            {monthlyTransfers.map((d,i)=><span key={i} className={`text-[8px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{d.m.slice(0,3)}</span>)}
          </div>
        </div>

        {/* Top Providers */}
        <div className={`${card} p-5 col-span-2`}>
          <p className={`text-[12px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>أعلى ١٠ مزودين أرباحاً</p>
          <div className="space-y-3">
            {topProviders.map((p,i)=>(
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{p.name}</span>
                  <span className={`text-[10px] font-bold ${isDark?"text-zinc-400":"text-slate-500"}`}>{p.total.toLocaleString("ar-SA")} ر.س</span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${isDark?"bg-white/[0.05]":"bg-slate-100"}`}>
                  <motion.div initial={{width:0}} animate={{width:`${p.pct}%`}} transition={{delay:i*0.08,duration:0.6,type:"spring",stiffness:100,damping:20}}
                    className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-emerald-700"/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk Actions + Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {[["all","الكل"],["pending","معلق"],["approved","موافق"],["transferred","محول"],["rejected","مرفوض"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                filter===v?"bg-[#C8A762] text-black":isDark?"bg-white/[0.04] text-zinc-500":"bg-slate-100 text-slate-500"
              }`}>{l}</button>
          ))}
        </div>
        {selected.length>0 && (
          <div className="flex gap-2">
            <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Check size={11}/> موافقة جماعية ({selected.length})
            </button>
            <button onClick={()=>setSelected([])} className={`px-2 py-1.5 rounded-lg text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}>
              <X size={12}/> إلغاء التحديد
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-right">
          <thead><tr className={`border-b ${isDark?"border-white/[0.06]":"border-slate-100"}`}>
            <th className="px-4 py-3 w-8"></th>
            {["الرقم","المزود","المبلغ","البنك","IBAN","الحالة","التاريخ","إجراء"].map(h=>(
              <th key={h} className={`px-4 py-3 text-[10px] font-bold uppercase ${isDark?"text-zinc-600":"text-slate-400"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map((p,i)=>{
              const sc = STATUS_CFG[p.status];
              return (
                <motion.tr key={p.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.04}}
                  className={`border-b ${isDark?"border-white/[0.04] hover:bg-white/[0.02]":"border-slate-50 hover:bg-slate-50/50"} group transition-colors`}>
                  <td className="px-4 py-3">
                    {p.status==="pending" && (
                      <input type="checkbox" checked={selected.includes(p.id)} onChange={()=>toggleSelect(p.id)}
                        className="h-3.5 w-3.5 rounded border-zinc-600 accent-[#C8A762]"/>
                    )}
                  </td>
                  <td className="px-4 py-3"><span className={`text-[11px] font-bold ${isDark?"text-zinc-300":"text-slate-600"}`}>{p.id}</span></td>
                  <td className="px-4 py-3"><span className={`text-[11px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{p.provider}</span></td>
                  <td className="px-4 py-3"><span className={`text-[12px] font-bold ${isDark?"text-white":"text-slate-800"}`}>{p.amount.toLocaleString("ar-SA")} <span className="text-[9px] font-normal text-zinc-500">ر.س</span></span></td>
                  <td className="px-4 py-3"><span className={`text-[10px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{p.bank}</span></td>
                  <td className="px-4 py-3"><span className={`text-[9px] font-mono ${isDark?"text-zinc-600":"text-slate-400"}`}>{p.iban}</span></td>
                  <td className="px-4 py-3"><span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span></td>
                  <td className="px-4 py-3"><span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{p.date}</span></td>
                  <td className="px-4 py-3">
                    {p.status==="pending" && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="h-7 px-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-[9px] font-bold hover:bg-emerald-500/20 flex items-center gap-1">
                          <Check size={10}/> موافقة
                        </button>
                        <button className="h-7 px-2 rounded-lg bg-red-500/10 text-red-400 text-[9px] font-bold hover:bg-red-500/20 flex items-center gap-1">
                          <Prohibit size={10}/> رفض
                        </button>
                      </div>
                    )}
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
