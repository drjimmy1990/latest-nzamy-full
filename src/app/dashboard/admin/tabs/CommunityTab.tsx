"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { ChatTeardrop, Warning, Check, X, Eye, Trash, MagnifyingGlass, PushPin, UserCircleMinus, UsersThree, Flag } from "@phosphor-icons/react";

const POSTS = [
  { id:"P-101", author:"أ. محمد العتيبي", role:"محامي", title:"كيف تتعامل مع نزاعات العمالة الوافدة؟", replies:14, reports:0, status:"active", date:"منذ ٣ ساعات" },
  { id:"P-102", author:"سارة الزهراني", role:"فرد", title:"محامي يطلب رسوم مبالغ فيها — كيف أتصرف؟", replies:8, reports:2, status:"flagged", date:"منذ ٥ ساعات" },
  { id:"P-103", author:"مكتب البراك", role:"شركة", title:"تجربتنا مع منصة نظامي بعد ٦ أشهر", replies:31, reports:0, status:"pinned", date:"منذ يومين" },
  { id:"P-104", author:"فهد القحطاني", role:"محامي", title:"هل يجوز التمثيل أمام المحاكم التجارية بالتوكيل؟", replies:22, reports:0, status:"active", date:"منذ يوم" },
  { id:"P-105", author:"مجهول", role:"فرد", title:"إعلان — خدمات قانونية خارج المنصة", replies:1, reports:7, status:"flagged", date:"منذ ساعة" },
];

const card = "bg-[#0f0f16] border border-white/[0.07] rounded-2xl";
const STATUS_CFG: Record<string,{cls:string;label:string}> = {
  active: { cls:"bg-emerald-500/15 border-emerald-500/30 text-emerald-400", label:"نشط" },
  flagged:{ cls:"bg-red-500/15 border-red-500/30 text-red-400",             label:"مُبلَّغ" },
  pinned: { cls:"bg-blue-500/15 border-blue-500/30 text-blue-400",          label:"مثبّت" },
  hidden: { cls:"bg-zinc-500/15 border-zinc-500/30 text-zinc-400",          label:"مخفي" },
};

export default function CommunityTab() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = POSTS.filter(p =>
    (filter==="all" || p.status===filter) &&
    (p.title.includes(search) || p.author.includes(search))
  );

  const stats = [
    { label:"منشورات اليوم", val:"٤٧", c:"text-blue-400" },
    { label:"إجمالي التعليقات", val:"١,٢٣٤", c:"text-purple-400" },
    { label:"مُبلَّغ عنه", val: POSTS.filter(p=>p.status==="flagged").length, c:"text-red-400" },
    { label:"معدل التفاعل", val:"٦٨%", c:"text-emerald-400" },
  ];

  return (
    <motion.div key="comm" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s,i)=>(
          <div key={i} className={`${card} p-4 flex items-center gap-3`}>
            <ChatTeardrop size={18} className={s.c} weight="duotone"/>
            <div><p className="text-[10px] text-zinc-500">{s.label}</p><p className={`text-[20px] font-black ${s.c}`}>{s.val}</p></div>
          </div>
        ))}
      </div>

      <div className={`${card} p-4 flex items-center gap-3 flex-wrap`}>
        <div className="flex items-center gap-2 flex-1 min-w-[180px] rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
          <MagnifyingGlass size={13} className="text-zinc-500"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث في المنشورات..." className="bg-transparent text-[12px] text-zinc-200 w-full outline-none placeholder:text-zinc-700"/>
        </div>
        {[["all","الكل"],["flagged","مُبلَّغ"],["pinned","مثبّت"],["active","نشط"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${filter===v?"bg-[#C8A762] text-black":"bg-white/[0.04] text-zinc-500 hover:text-zinc-300"}`}>{l}</button>
        ))}
      </div>

      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-right">
          <thead><tr className="border-b border-white/[0.06]">
            {["المنشور","الكاتب","الردود","التبليغات","الحالة","التاريخ","إجراءات"].map(h=>(
              <th key={h} className="px-4 py-3 text-[10px] font-bold text-zinc-600 uppercase">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map((p,i)=>{
              const sc = STATUS_CFG[p.status];
              return (
                <motion.tr key={p.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.04}}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] group">
                  <td className="px-4 py-3 max-w-[280px]"><p className="text-[12px] font-bold text-zinc-200 truncate">{p.title}</p><p className="text-[9px] text-zinc-600">{p.id}</p></td>
                  <td className="px-4 py-3"><div><p className="text-[11px] text-zinc-300">{p.author}</p><p className="text-[9px] text-zinc-600">{p.role}</p></div></td>
                  <td className="px-4 py-3"><span className="text-[12px] text-purple-400 font-bold">{p.replies}</span></td>
                  <td className="px-4 py-3">
                    {p.reports>0
                      ? <span className="flex items-center gap-1 text-[11px] text-red-400 font-bold"><Flag size={11} weight="fill"/>{p.reports}</span>
                      : <span className="text-[11px] text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span></td>
                  <td className="px-4 py-3"><span className="text-[10px] text-zinc-600">{p.date}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button title="تثبيت" className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-blue-400 transition-colors"><PushPin size={12}/></button>
                      <button title="عرض" className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"><Eye size={12}/></button>
                      <button title="إخفاء" className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-amber-400 transition-colors"><UserCircleMinus size={12}/></button>
                      <button title="حذف" className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-red-400 transition-colors"><Trash size={12}/></button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
