"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  Storefront, MagnifyingGlass, Eye, Clock, CheckCircle,
  X, Warning, Money, Users, ChartLine, Scales, Package,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const ORDERS = [
  { id:"MO-412", client:"شركة الحلول القانونية", provider:"أ. محمد العتيبي", service:"استشارة قانونية", amount:4500, status:"active" as const, date:"منذ يوم" },
  { id:"MO-411", client:"نورة الحارثي", provider:"خالد الشمري — موثّق", service:"توثيق عقد إيجار", amount:1200, status:"active" as const, date:"منذ ٣ أيام" },
  { id:"MO-410", client:"مكتب البراك", provider:"أ. سارة الزهراني", service:"صياغة عقد تأسيس", amount:8000, status:"completed" as const, date:"منذ أسبوع" },
  { id:"MO-409", client:"مؤسسة النور", provider:"أ. فهد القحطاني", service:"تمثيل قضائي", amount:3200, status:"disputed" as const, date:"منذ ١٠ أيام" },
  { id:"MO-408", client:"أ. عبدالله العمري", provider:"محمد البلوي — محكّم", service:"تحكيم تجاري", amount:6500, status:"completed" as const, date:"منذ أسبوعين" },
  { id:"MO-407", client:"شركة التقنية", provider:"أ. نوف العنزي", service:"مراجعة عقود", amount:2800, status:"cancelled" as const, date:"منذ ٣ أسابيع" },
];

const STATUS_CFG: Record<string,{label:string;cls:string}> = {
  new:       { label:"جديد",     cls:"bg-blue-500/10 border-blue-500/20 text-blue-400" },
  active:    { label:"قيد التنفيذ", cls:"bg-amber-500/10 border-amber-500/20 text-amber-400" },
  completed: { label:"مكتمل",    cls:"bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
  cancelled: { label:"ملغي",     cls:"bg-zinc-500/10 border-zinc-500/20 text-zinc-400" },
  disputed:  { label:"متنازع",   cls:"bg-red-500/10 border-red-500/20 text-red-400" },
};

// Top services
const TOP_SERVICES = [
  { name:"استشارة قانونية", count:142, pct:100 },
  { name:"صياغة عقود", count:98, pct:69 },
  { name:"تمثيل قضائي", count:76, pct:54 },
  { name:"توثيق", count:54, pct:38 },
  { name:"تحكيم تجاري", count:31, pct:22 },
];

export default function MarketplaceOrdersPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState("all");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = filter==="all" ? ORDERS : ORDERS.filter(o=>o.status===filter);
  const avgOrderValue = Math.round(ORDERS.reduce((s,o)=>s+o.amount,0)/ORDERS.length);

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
        <h1 className={`text-xl font-bold mb-1 ${isDark?"text-white":"text-slate-800"}`}>طلبات السوق</h1>
        <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>مراقبة وإدارة كل طلبات سوق المهنيين</p>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label:"إجمالي الطلبات", val:ORDERS.length.toString(), icon:Package, c:"text-blue-400" },
          { label:"نشطة", val:ORDERS.filter(o=>o.status==="active").length.toString(), icon:Clock, c:"text-amber-400" },
          { label:"مكتملة", val:ORDERS.filter(o=>o.status==="completed").length.toString(), icon:CheckCircle, c:"text-emerald-400" },
          { label:"متنازعة", val:ORDERS.filter(o=>o.status==="disputed").length.toString(), icon:Scales, c:"text-red-400" },
          { label:"متوسط قيمة الطلب", val:`${avgOrderValue.toLocaleString("ar-SA")} ر.س`, icon:Money, c:"text-[#C8A762]" },
        ].map((k,i)=>(
          <motion.div key={i} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
            className={`${card} p-4`}>
            <div className="flex items-center gap-2 mb-1">
              <k.icon size={14} weight="duotone" className={k.c}/>
              <p className={`text-[10px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{k.label}</p>
            </div>
            <p className={`text-[18px] font-bold ${k.c}`}>{k.val}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-5 gap-4">
        {/* Daily orders line */}
        <div className={`${card} p-5 col-span-3`}>
          <p className={`text-[12px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>حجم الطلبات اليومي</p>
          <svg viewBox="0 0 300 70" className="w-full h-16" preserveAspectRatio="none">
            <defs>
              <linearGradient id="orders-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C8A762" stopOpacity="0.2"/>
                <stop offset="100%" stopColor="#C8A762" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d="M0,55 L30,48 L60,52 L90,40 L120,35 L150,42 L180,30 L210,25 L240,28 L270,18 L300,12 L300,70 L0,70 Z" fill="url(#orders-fill)"/>
            <path d="M0,55 L30,48 L60,52 L90,40 L120,35 L150,42 L180,30 L210,25 L240,28 L270,18 L300,12" fill="none" stroke="#C8A762" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Top services */}
        <div className={`${card} p-5 col-span-2`}>
          <p className={`text-[12px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>أكثر الخدمات طلباً</p>
          <div className="space-y-2.5">
            {TOP_SERVICES.map((s,i)=>(
              <div key={i}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-[10px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{s.name}</span>
                  <span className={`text-[10px] font-bold ${isDark?"text-zinc-400":"text-slate-500"}`}>{s.count}</span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${isDark?"bg-white/[0.05]":"bg-slate-100"}`}>
                  <motion.div initial={{width:0}} animate={{width:`${s.pct}%`}} transition={{delay:i*0.08,duration:0.6,type:"spring",stiffness:100,damping:20}}
                    className="h-full rounded-full bg-gradient-to-l from-[#C8A762] to-amber-600"/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5">
        {[["all","الكل"],["active","نشطة"],["completed","مكتملة"],["disputed","متنازعة"],["cancelled","ملغاة"]].map(([v,l])=>(
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
            {["الرقم","الطالب","المزود","الخدمة","المبلغ","الحالة","التاريخ",""].map(h=>(
              <th key={h} className={`px-4 py-3 text-[10px] font-bold uppercase ${isDark?"text-zinc-600":"text-slate-400"}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map((o,i)=>{
              const sc = STATUS_CFG[o.status];
              return (
                <motion.tr key={o.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.04}}
                  className={`border-b ${isDark?"border-white/[0.04] hover:bg-white/[0.02]":"border-slate-50 hover:bg-slate-50/50"} group transition-colors`}>
                  <td className="px-4 py-3"><span className={`text-[11px] font-bold ${isDark?"text-zinc-300":"text-slate-600"}`}>{o.id}</span></td>
                  <td className="px-4 py-3"><span className={`text-[11px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{o.client}</span></td>
                  <td className="px-4 py-3"><span className={`text-[11px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{o.provider}</span></td>
                  <td className="px-4 py-3"><span className={`text-[10px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{o.service}</span></td>
                  <td className="px-4 py-3"><span className={`text-[12px] font-bold ${isDark?"text-white":"text-slate-800"}`}>{o.amount.toLocaleString("ar-SA")} <span className="text-[9px] font-normal text-zinc-500">ر.س</span></span></td>
                  <td className="px-4 py-3"><span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span></td>
                  <td className="px-4 py-3"><span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{o.date}</span></td>
                  <td className="px-4 py-3">
                    <button className={`h-7 w-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${isDark?"bg-white/[0.04] text-zinc-400 hover:text-white":"bg-slate-50 text-slate-400 hover:text-slate-700"}`}>
                      <Eye size={12}/>
                    </button>
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
