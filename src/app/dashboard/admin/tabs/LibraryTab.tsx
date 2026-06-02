"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { BookOpen, Plus, Check, X, MagnifyingGlass, Funnel, Eye, PencilSimple, Trash, ArrowUpRight } from "@phosphor-icons/react";

const ENTRIES = [
  { id:"L-001", title:"نظام العمل السعودي — المادة ٨٠", category:"أنظمة عمل", source:"وزارة الموارد البشرية", status:"published", views:4210, date:"2024-09-01" },
  { id:"L-002", title:"نظام الشركات — الفصل الثالث", category:"أنظمة تجارية", source:"وزارة التجارة", status:"published", views:3870, date:"2024-08-15" },
  { id:"L-003", title:"مبدأ المحكمة العليا — التعويض عن الضرر الأدبي", category:"مبادئ قضائية", source:"المحكمة العليا", status:"published", views:2940, date:"2024-07-20" },
  { id:"L-004", title:"نظام مكافحة الغش التجاري", category:"أنظمة تجارية", source:"هيئة التجارة", status:"draft", views:0, date:"2024-11-10" },
  { id:"L-005", title:"مبدأ — حجية الشيء المقضي به", category:"مبادئ قضائية", source:"محكمة الاستئناف", status:"review", views:0, date:"2024-11-12" },
  { id:"L-006", title:"نظام مكافحة الجرائم المعلوماتية", category:"أنظمة جنائية", source:"هيئة الاتصالات", status:"published", views:5100, date:"2024-06-01" },
];

const CATS = ["الكل","أنظمة عمل","أنظمة تجارية","أنظمة جنائية","مبادئ قضائية","تشريعات دولية"];
const STATUS_CFG: Record<string,{cls:string;label:string}> = {
  published:{ cls:"bg-emerald-500/15 border-emerald-500/30 text-emerald-400", label:"منشور" },
  draft:    { cls:"bg-zinc-500/15 border-zinc-500/30 text-zinc-400",          label:"مسودة" },
  review:   { cls:"bg-amber-500/15 border-amber-500/30 text-amber-400",       label:"مراجعة" },
};
const card = "bg-[#0f0f16] border border-white/[0.07] rounded-2xl";

export default function LibraryTab() {
  const [cat, setCat] = useState("الكل");
  const [search, setSearch] = useState("");
  const filtered = ENTRIES.filter(e => (cat==="الكل"||e.category===cat) && (e.title.includes(search)||e.id.includes(search)));

  const stats = [
    { label:"إجمالي السجلات", val: ENTRIES.length, c:"text-blue-400" },
    { label:"منشور", val: ENTRIES.filter(e=>e.status==="published").length, c:"text-emerald-400" },
    { label:"تنتظر مراجعة", val: ENTRIES.filter(e=>e.status==="review").length, c:"text-amber-400" },
    { label:"مسودة", val: ENTRIES.filter(e=>e.status==="draft").length, c:"text-zinc-400" },
  ];

  return (
    <motion.div key="lib" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s,i)=>(
          <div key={i} className={`${card} p-4 flex items-center gap-3`}>
            <BookOpen size={18} className={s.c} weight="duotone"/>
            <div><p className="text-[10px] text-zinc-500">{s.label}</p><p className={`text-[20px] font-black ${s.c}`}>{s.val}</p></div>
          </div>
        ))}
      </div>

      {/* Filters + Add */}
      <div className={`${card} p-4 flex items-center gap-3 flex-wrap`}>
        <div className="flex items-center gap-2 flex-1 min-w-[180px] rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
          <MagnifyingGlass size={13} className="text-zinc-500"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث في المكتبة..." className="bg-transparent text-[12px] text-zinc-200 w-full outline-none placeholder:text-zinc-700"/>
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATS.map(c=>(
            <button key={c} onClick={()=>setCat(c)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${cat===c?"bg-[#C8A762] text-black":"bg-white/[0.04] text-zinc-500 hover:text-zinc-300"}`}>{c}</button>
          ))}
        </div>
        <button className="mr-auto flex items-center gap-2 rounded-xl bg-[#C8A762] px-4 py-2 text-[12px] font-bold text-black hover:bg-amber-400 transition-colors">
          <Plus size={14}/> إضافة سجل جديد
        </button>
      </div>

      {/* Table */}
      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-right">
          <thead><tr className="border-b border-white/[0.06]">
            {["السجل","التصنيف","المصدر","الحالة","المشاهدات","التاريخ","إجراءات"].map(h=>(
              <th key={h} className="px-4 py-3 text-[10px] font-bold text-zinc-600 uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map((e,i)=>{
              const sc = STATUS_CFG[e.status];
              return (
                <motion.tr key={e.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.04}}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group">
                  <td className="px-4 py-3">
                    <div><p className="text-[12px] font-bold text-zinc-200">{e.title}</p><p className="text-[9px] text-zinc-600">{e.id}</p></div>
                  </td>
                  <td className="px-4 py-3"><span className="text-[11px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">{e.category}</span></td>
                  <td className="px-4 py-3"><span className="text-[11px] text-zinc-500">{e.source}</span></td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span></td>
                  <td className="px-4 py-3"><span className="text-[12px] font-bold text-zinc-300">{e.views.toLocaleString("ar-SA")}</span></td>
                  <td className="px-4 py-3"><span className="text-[10px] text-zinc-600">{e.date}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {e.status==="review" && <>
                        <button className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-colors"><Check size={12}/></button>
                        <button className="h-7 w-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors"><X size={12}/></button>
                      </>}
                      <button className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"><Eye size={12}/></button>
                      <button className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"><PencilSimple size={12}/></button>
                      <button className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-red-400 transition-colors"><Trash size={12}/></button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length===0 && <div className="py-12 text-center"><p className="text-zinc-600">لا توجد نتائج</p></div>}
      </div>
    </motion.div>
  );
}
