"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { UsersThree, Briefcase, ChartBar, Eye, MagnifyingGlass, Buildings, Scales, Star, Warning } from "@phosphor-icons/react";

const FIRMS = [
  { id:"F-001", name:"مكتب البراك للمحاماة",       city:"الرياض",  lawyers:12, activeCases:87,  plan:"Enterprise", mrr:2499, rating:4.9, status:"excellent" },
  { id:"F-002", name:"مكتب الرياض للمحاماة",       city:"الرياض",  lawyers:8,  activeCases:54,  plan:"Pro",        mrr:1299, rating:4.6, status:"good" },
  { id:"F-003", name:"مكتب جدة للقانون التجاري",   city:"جدة",     lawyers:5,  activeCases:31,  plan:"Pro",        mrr:1299, rating:4.4, status:"good" },
  { id:"F-004", name:"مكتب الدمام للمحاماة",       city:"الدمام",  lawyers:3,  activeCases:18,  plan:"AI",         mrr:699,  rating:4.2, status:"average" },
  { id:"F-005", name:"مكتب المدينة القانوني",      city:"المدينة", lawyers:2,  activeCases:9,   plan:"AI",         mrr:699,  rating:3.8, status:"warning" },
];

const card = "bg-[#0f0f16] border border-white/[0.07] rounded-2xl";
const STATUS_CFG: Record<string,{cls:string;label:string}> = {
  excellent:{ cls:"bg-emerald-500/15 border-emerald-500/30 text-emerald-400", label:"ممتاز" },
  good:     { cls:"bg-blue-500/15 border-blue-500/30 text-blue-400",          label:"جيد" },
  average:  { cls:"bg-amber-500/15 border-amber-500/30 text-amber-400",       label:"متوسط" },
  warning:  { cls:"bg-red-500/15 border-red-500/30 text-red-400",             label:"تحذير" },
};

export default function ERPTab() {
  const [search, setSearch] = useState("");
  const filtered = FIRMS.filter(f => f.name.includes(search) || f.city.includes(search));
  const totalMRR = FIRMS.reduce((s,f)=>s+f.mrr,0);
  const totalLawyers = FIRMS.reduce((s,f)=>s+f.lawyers,0);
  const totalCases = FIRMS.reduce((s,f)=>s+f.activeCases,0);

  return (
    <motion.div key="erp" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:"مكاتب المحاماة", val:FIRMS.length, c:"text-blue-400", icon:Buildings },
          { label:"إجمالي المحامين", val:totalLawyers, c:"text-purple-400", icon:Scales },
          { label:"القضايا النشطة", val:totalCases, c:"text-emerald-400", icon:Briefcase },
          { label:"إيراد المكاتب", val:`${totalMRR.toLocaleString("ar-SA")} ر.س`, c:"text-[#C8A762]", icon:ChartBar },
        ].map((s,i)=>(
          <div key={i} className={`${card} p-4 flex items-center gap-3`}>
            <s.icon size={18} className={s.c} weight="duotone"/>
            <div><p className="text-[10px] text-zinc-500">{s.label}</p><p className={`text-[18px] font-black ${s.c}`}>{s.val}</p></div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className={`${card} p-4`}>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 max-w-sm">
          <MagnifyingGlass size={13} className="text-zinc-500"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث بالاسم أو المدينة..." className="bg-transparent text-[12px] text-zinc-200 w-full outline-none placeholder:text-zinc-700"/>
        </div>
      </div>

      {/* Firms Grid */}
      <div className="grid grid-cols-1 gap-3">
        {filtered.map((f,i)=>{
          const sc = STATUS_CFG[f.status];
          return (
            <motion.div key={f.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:i*0.06}}
              className={`${card} p-5 hover:border-white/[0.12] transition-all`}>
              <div className="flex items-start justify-between gap-4">
                {/* Info */}
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#C8A762]/10 border border-[#C8A762]/20">
                    <Buildings size={22} className="text-[#C8A762]" weight="duotone"/>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[14px] font-black text-white">{f.name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                      <span>{f.city}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1"><Star size={11} weight="fill" className="text-amber-400"/>{f.rating}</span>
                      <span>•</span>
                      <span className={`font-bold ${f.plan==="Enterprise"?"text-amber-400":f.plan==="Pro"?"text-emerald-400":"text-blue-400"}`}>{f.plan}</span>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className="text-center">
                    <p className="text-[18px] font-black text-purple-400">{f.lawyers}</p>
                    <p className="text-[9px] text-zinc-600">محامي</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[18px] font-black text-emerald-400">{f.activeCases}</p>
                    <p className="text-[9px] text-zinc-600">قضية</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[18px] font-black text-[#C8A762]">{f.mrr.toLocaleString("ar-SA")}</p>
                    <p className="text-[9px] text-zinc-600">ر.س/شهر</p>
                  </div>
                  <button className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] px-4 py-2 text-[11px] font-bold text-zinc-400 hover:text-white hover:border-white/[0.15] transition-all">
                    <Eye size={13}/> عرض ERP
                  </button>
                </div>
              </div>

              {/* Progress bar: cases load */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-zinc-600">نسبة الحمل التشغيلي</span>
                  <span className="text-[10px] text-zinc-500">{Math.round(f.activeCases/f.lawyers)} قضية/محامي</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/[0.05]">
                  <motion.div initial={{width:0}} animate={{width:`${Math.min((f.activeCases/f.lawyers/15)*100,100)}%`}}
                    transition={{delay:i*0.08,duration:0.7}}
                    className={`h-full rounded-full ${f.activeCases/f.lawyers>10?"bg-red-500":f.activeCases/f.lawyers>7?"bg-amber-500":"bg-emerald-500"}`}/>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
