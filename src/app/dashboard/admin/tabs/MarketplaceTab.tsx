"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { Storefront, Check, X, Eye, MagnifyingGlass, Money, Warning, User, Buildings, Scales, CurrencyDollar } from "@phosphor-icons/react";

const REQUESTS = [
  { id:"MKT-221", client:"أ. نورة الحارثي", clientType:"فرد",         service:"مراجعة عقد إيجار", provider:"أ. فهد العتيبي", amount:350,  commission:28,  status:"pending",   date:"منذ ٢ ساعة" },
  { id:"MKT-220", client:"مؤسسة النور",     clientType:"منشأة",       service:"توثيق عقد تجاري", provider:"خالد الشمري",   amount:800,  commission:64,  status:"active",    date:"منذ ٥ ساعات" },
  { id:"MKT-219", client:"شركة التقنية",    clientType:"شركة",        service:"استشارة نظام PDPL", provider:"مكتب البراك", amount:1500, commission:75,  status:"active",    date:"أمس" },
  { id:"MKT-218", client:"فهد القحطاني",   clientType:"فرد",         service:"صياغة إنذار قانوني", provider:"—",           amount:200,  commission:0,   status:"pending",   date:"منذ ٣ ساعات" },
  { id:"MKT-217", client:"محمد العتيبي",   clientType:"محامي",       service:"خبير اقتصادي للقضية ١٢٢", provider:"د. علي سالم", amount:2200, commission:176, status:"completed", date:"منذ يومين" },
  { id:"MKT-216", client:"مكتب الرياض",    clientType:"شركة محاماة", service:"مترجم قانوني معتمد", provider:"Translate Pro", amount:600, commission:48,  status:"dispute",   date:"منذ ٣ أيام" },
];

const card = "bg-[#0f0f16] border border-white/[0.07] rounded-2xl";
const STATUS_CFG: Record<string,{cls:string;label:string}> = {
  pending:   { cls:"bg-amber-500/15 border-amber-500/30 text-amber-400",   label:"انتظار" },
  active:    { cls:"bg-blue-500/15 border-blue-500/30 text-blue-400",      label:"جارٍ" },
  completed: { cls:"bg-emerald-500/15 border-emerald-500/30 text-emerald-400", label:"مكتمل" },
  dispute:   { cls:"bg-red-500/15 border-red-500/30 text-red-400",         label:"نزاع" },
};
const ROLE_ICON: Record<string, React.ElementType> = { فرد:User, شركة:Buildings, محامي:Scales, "شركة محاماة":Buildings, منشأة:Buildings };

export default function MarketplaceTab() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = REQUESTS.filter(r =>
    (filter==="all"||r.status===filter) &&
    (r.client.includes(search)||r.service.includes(search)||r.id.includes(search))
  );

  const totalCommission = REQUESTS.filter(r=>r.status==="completed"||r.status==="active").reduce((s,r)=>s+r.commission,0);
  const pending = REQUESTS.filter(r=>r.status==="pending").length;
  const disputes = REQUESTS.filter(r=>r.status==="dispute").length;

  return (
    <motion.div key="mkt" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:"عمولات الشهر", val:`${totalCommission.toLocaleString("ar-SA")} ر.س`, c:"text-emerald-400", icon:Money },
          { label:"طلبات معلّقة", val:pending, c:"text-amber-400", icon:Warning },
          { label:"إجمالي الطلبات", val:REQUESTS.length, c:"text-blue-400", icon:Storefront },
          { label:"نزاعات مفتوحة", val:disputes, c:"text-red-400", icon:Warning },
        ].map((s,i)=>(
          <div key={i} className={`${card} p-4 flex items-center gap-3`}>
            <s.icon size={18} className={s.c} weight="duotone"/>
            <div><p className="text-[10px] text-zinc-500">{s.label}</p><p className={`text-[18px] font-black ${s.c}`}>{s.val}</p></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={`${card} p-4 flex items-center gap-3 flex-wrap`}>
        <div className="flex items-center gap-2 flex-1 min-w-[180px] rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
          <MagnifyingGlass size={13} className="text-zinc-500"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث برقم الطلب، العميل، الخدمة..." className="bg-transparent text-[12px] text-zinc-200 w-full outline-none placeholder:text-zinc-700"/>
        </div>
        {[["all","الكل"],["pending","انتظار"],["active","جارٍ"],["completed","مكتمل"],["dispute","نزاع"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${filter===v?"bg-[#C8A762] text-black":"bg-white/[0.04] text-zinc-500 hover:text-zinc-300"}`}>{l}</button>
        ))}
      </div>

      {/* Table */}
      <div className={`${card} overflow-hidden`}>
        <table className="w-full text-right">
          <thead><tr className="border-b border-white/[0.06]">
            {["الطلب","العميل","الخدمة","المزود","القيمة","العمولة","الحالة","تاريخ","إجراءات"].map(h=>(
              <th key={h} className="px-3 py-3 text-[10px] font-bold text-zinc-600 uppercase">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map((r,i)=>{
              const sc = STATUS_CFG[r.status];
              const Icon = ROLE_ICON[r.clientType] || User;
              return (
                <motion.tr key={r.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.04}}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] group">
                  <td className="px-3 py-3"><p className="text-[10px] font-mono text-zinc-500">{r.id}</p></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-zinc-500"/>
                      <div><p className="text-[11px] text-zinc-200">{r.client}</p><p className="text-[9px] text-zinc-600">{r.clientType}</p></div>
                    </div>
                  </td>
                  <td className="px-3 py-3"><p className="text-[11px] text-zinc-300 max-w-[160px] truncate">{r.service}</p></td>
                  <td className="px-3 py-3"><p className="text-[11px] text-zinc-400">{r.provider}</p></td>
                  <td className="px-3 py-3"><p className="text-[12px] font-bold text-white">{r.amount} <span className="text-[9px] text-zinc-600">ر.س</span></p></td>
                  <td className="px-3 py-3"><p className="text-[12px] font-bold text-emerald-400">{r.commission} <span className="text-[9px] text-zinc-600">ر.س</span></p></td>
                  <td className="px-3 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span></td>
                  <td className="px-3 py-3"><span className="text-[10px] text-zinc-600">{r.date}</span></td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {r.status==="pending" && <>
                        <button className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-colors"><Check size={12}/></button>
                        <button className="h-7 w-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors"><X size={12}/></button>
                      </>}
                      <button className="h-7 w-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"><Eye size={12}/></button>
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
