"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  ChartBar, ChartLine, Download, Users, Money, Robot,
  TrendUp, TrendDown, Globe, Funnel, Calendar, FileArrowDown,
  MapPin, Buildings,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

type ReportTab = "daily"|"weekly"|"monthly"|"custom";

// Cohort heatmap data
const COHORT_DATA = [
  { cohort:"يناير", months:[100,82,71,65,58,52,48] },
  { cohort:"فبراير", months:[100,85,74,68,61,55,0] },
  { cohort:"مارس", months:[100,88,78,72,64,0,0] },
  { cohort:"أبريل", months:[100,86,76,69,0,0,0] },
  { cohort:"مايو", months:[100,90,80,0,0,0,0] },
  { cohort:"يونيو", months:[100,87,0,0,0,0,0] },
];

// City distribution
const CITIES = [
  { name:"الرياض", users:4210, pct:100 },
  { name:"جدة", users:2890, pct:69 },
  { name:"الدمام", users:1420, pct:34 },
  { name:"مكة المكرمة", users:980, pct:23 },
  { name:"المدينة المنورة", users:620, pct:15 },
  { name:"أخرى", users:2367, pct:56 },
];

// Conversion funnel
const FUNNEL_DATA = [
  { stage:"زائر", count:48200, pct:100 },
  { stage:"مسجل", count:12487, pct:26 },
  { stage:"مشترك", count:506, pct:4 },
  { stage:"محتفظ (٣+ أشهر)", count:387, pct:3 },
];

// Role distribution
const ROLE_DIST = [
  { role:"محامي فرد", count:312, pct:62, color:"#3b82f6" },
  { role:"مكتب محاماة", count:89, pct:18, color:"#8b5cf6" },
  { role:"شركة", count:54, pct:11, color:"#10b981" },
  { role:"عميل فرد", count:31, pct:6, color:"#f59e0b" },
  { role:"مزود خدمة", count:12, pct:2, color:"#ef4444" },
  { role:"أخرى", count:8, pct:1, color:"#6b7280" },
];

export default function ReportsPage() {
  const { isDark } = useTheme();
  const [tab, setTab] = useState<ReportTab>("monthly");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex items-start justify-between">
        <div>
          <h1 className={`text-xl font-bold mb-1 ${isDark?"text-white":"text-slate-800"}`}>مركز التقارير</h1>
          <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>تقارير شاملة وقابلة للتصدير لاتخاذ القرارات</p>
        </div>
        <button className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold ${isDark?"bg-white/[0.04] text-zinc-400":"bg-slate-100 text-slate-500"} hover:text-[#C8A762] transition-colors`}>
          <FileArrowDown size={13}/> تصدير PDF
        </button>
      </motion.div>

      {/* Period Tabs */}
      <div className="flex gap-1.5">
        {([["daily","يومي"],["weekly","أسبوعي"],["monthly","شهري"],["custom","مخصص"]] as [ReportTab,string][]).map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)}
            className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all ${
              tab===v?"bg-[#C8A762] text-black":isDark?"bg-white/[0.04] text-zinc-500":"bg-slate-100 text-slate-500"
            }`}>{l}</button>
        ))}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"مستخدمون جدد", val:"+٢٣٤", sub:"هذا الشهر", icon:Users, c:"text-blue-400", trend:"up" },
          { label:"MRR", val:"٩٨١k ر.س", sub:"+٩.٤%", icon:Money, c:"text-emerald-400", trend:"up" },
          { label:"طلبات AI", val:"٤٨٧,٢٣١", sub:"+١٤%", icon:Robot, c:"text-purple-400", trend:"up" },
          { label:"Churn Rate", val:"٢.٤%", sub:"-٠.٣%", icon:TrendDown, c:"text-red-400", trend:"down" },
        ].map((k,i)=>(
          <motion.div key={i} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.06}}
            className={`${card} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <k.icon size={16} weight="duotone" className={k.c}/>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${k.trend==="up"?"text-emerald-400 bg-emerald-500/10":"text-red-400 bg-red-500/10"}`}>
                {k.sub}
              </span>
            </div>
            <p className={`text-[10px] mb-0.5 ${isDark?"text-zinc-500":"text-slate-400"}`}>{k.label}</p>
            <p className={`text-[20px] font-bold ${k.c}`}>{k.val}</p>
          </motion.div>
        ))}
      </div>

      {/* Conversion Funnel */}
      <div className={`${card} p-5`}>
        <p className={`text-[12px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>
          <Funnel size={14} weight="duotone" className="inline ml-1.5 text-[#C8A762]"/>
          قمع التحويل — زائر → مشترك محتفظ
        </p>
        <div className="space-y-3">
          {FUNNEL_DATA.map((f,i)=>(
            <motion.div key={i} initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} transition={{delay:i*0.1}}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] font-semibold ${isDark?"text-zinc-300":"text-slate-600"}`}>{f.stage}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold ${isDark?"text-white":"text-slate-800"}`}>{f.count.toLocaleString("ar-SA")}</span>
                  <span className={`text-[9px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{f.pct}%</span>
                </div>
              </div>
              <div className={`h-7 rounded-lg overflow-hidden ${isDark?"bg-white/[0.03]":"bg-slate-50"}`}>
                <motion.div initial={{width:0}} animate={{width:`${f.pct}%`}}
                  transition={{delay:i*0.12,duration:0.8,type:"spring",stiffness:80,damping:20}}
                  className="h-full rounded-lg bg-gradient-to-l from-[#C8A762]/40 to-[#0B3D2E]/40 flex items-center justify-end px-2">
                  <span className={`text-[9px] font-bold ${isDark?"text-[#C8A762]":"text-[#0B3D2E]"}`}>{f.pct}%</span>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Cohort Heatmap */}
        <div className={`${card} p-5`}>
          <p className={`text-[12px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>احتفاظ المستخدمين — Cohort Heatmap</p>
          <div className="overflow-x-auto">
            <table className="w-full text-center">
              <thead><tr>
                <th className={`px-2 py-1 text-[9px] ${isDark?"text-zinc-500":"text-slate-400"}`}>Cohort</th>
                {["م٠","م١","م٢","م٣","م٤","م٥","م٦"].map(m=>(
                  <th key={m} className={`px-2 py-1 text-[9px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{m}</th>
                ))}
              </tr></thead>
              <tbody>
                {COHORT_DATA.map((c,i)=>(
                  <tr key={i}>
                    <td className={`px-2 py-1 text-[9px] font-bold ${isDark?"text-zinc-400":"text-slate-500"}`}>{c.cohort.slice(0,3)}</td>
                    {c.months.map((v,j)=>(
                      <td key={j} className="px-1 py-1">
                        {v>0 ? (
                          <div className="rounded text-[8px] font-bold py-1 px-1.5"
                            style={{
                              backgroundColor: v>=80?`rgba(16,185,129,${v/200})`:v>=50?`rgba(245,158,11,${v/200})`:`rgba(239,68,68,${v/200})`,
                              color: isDark?"#fff":"#1e293b"
                            }}>
                            {v}%
                          </div>
                        ) : <span className={`text-[8px] ${isDark?"text-zinc-800":"text-slate-200"}`}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* City Distribution */}
        <div className={`${card} p-5`}>
          <p className={`text-[12px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>
            <MapPin size={13} weight="duotone" className="inline ml-1 text-[#C8A762]"/>
            توزيع المستخدمين حسب المدينة
          </p>
          <div className="space-y-2.5">
            {CITIES.map((c,i)=>(
              <div key={i}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-[10px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{c.name}</span>
                  <span className={`text-[10px] font-bold ${isDark?"text-zinc-400":"text-slate-500"}`}>{c.users.toLocaleString("ar-SA")}</span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${isDark?"bg-white/[0.05]":"bg-slate-100"}`}>
                  <motion.div initial={{width:0}} animate={{width:`${c.pct}%`}} transition={{delay:i*0.06,duration:0.6,type:"spring",stiffness:100,damping:20}}
                    className="h-full rounded-full bg-gradient-to-l from-[#0B3D2E] to-emerald-600"/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Role Distribution */}
      <div className={`${card} p-5`}>
        <p className={`text-[12px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>توزيع المشتركين حسب الدور</p>
        <div className="flex items-end gap-4 h-28">
          {ROLE_DIST.map((r,i)=>(
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className={`text-[8px] font-bold ${isDark?"text-zinc-400":"text-slate-500"}`}>{r.pct}%</span>
              <motion.div initial={{height:0}} animate={{height:`${r.pct*1.4}%`}}
                transition={{delay:i*0.08,duration:0.6,type:"spring",stiffness:100,damping:20}}
                className="w-full rounded-t-lg" style={{backgroundColor:r.color, minHeight:4, maxHeight:"95%"}}/>
              <span className={`text-[7px] text-center leading-tight ${isDark?"text-zinc-500":"text-slate-400"}`}>{r.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
