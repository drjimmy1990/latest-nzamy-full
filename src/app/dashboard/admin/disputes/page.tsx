"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  Scales, Clock, CheckCircle, Money, Warning, Eye,
  ArrowClockwise, User, ChartLine, X, ArrowSquareOut,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const DISPUTES = [
  { id:"D-028", clientName:"مؤسسة النور التجارية", providerName:"أ. فهد القحطاني",
    amount:3200, reason:"عدم إكمال الخدمة المتفق عليها", status:"open" as const,
    date:"منذ ٣ أيام", orderId:"MO-409" },
  { id:"D-027", clientName:"شركة التقنية والقانون", providerName:"أ. نوف العنزي",
    amount:2800, reason:"تأخر في التسليم يتجاوز ١٤ يوم", status:"open" as const,
    date:"منذ أسبوع", orderId:"MO-407" },
  { id:"D-026", clientName:"نورة الحارثي", providerName:"محمد البلوي — محكّم",
    amount:6500, reason:"جودة العمل لا تتوافق مع المتفق عليه", status:"resolved_client" as const,
    date:"منذ أسبوعين", orderId:"MO-405" },
  { id:"D-025", clientName:"أ. عبدالله العمري", providerName:"أ. سارة الزهراني",
    amount:5400, reason:"خلاف على نطاق العمل", status:"resolved_provider" as const,
    date:"منذ ٣ أسابيع", orderId:"MO-401" },
  { id:"D-024", clientName:"مكتب البراك للمحاماة", providerName:"خالد الشمري — موثّق",
    amount:1200, reason:"عدم الحضور للموعد المحدد", status:"resolved_split" as const,
    date:"منذ شهر", orderId:"MO-398" },
];

const STATUS_CFG: Record<string,{label:string;cls:string}> = {
  open:              { label:"مفتوح",          cls:"bg-red-500/10 border-red-500/20 text-red-400" },
  resolved_client:   { label:"لصالح الطالب",   cls:"bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
  resolved_provider: { label:"لصالح المزود",   cls:"bg-blue-500/10 border-blue-500/20 text-blue-400" },
  resolved_split:    { label:"تسوية جزئية",    cls:"bg-amber-500/10 border-amber-500/20 text-amber-400" },
};

// Donut — reasons
const REASONS = [
  { label:"عدم إكمال الخدمة", count:12, color:"#ef4444" },
  { label:"تأخر في التسليم", count:8, color:"#f59e0b" },
  { label:"جودة غير مرضية", count:6, color:"#6366f1" },
  { label:"خلاف على النطاق", count:4, color:"#3b82f6" },
  { label:"أخرى", count:2, color:"#6b7280" },
];

export default function DisputesPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState("all");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = filter==="all" ? DISPUTES : DISPUTES.filter(d=>d.status===filter);
  const openCount = DISPUTES.filter(d=>d.status==="open").length;
  const resolvedCount = DISPUTES.filter(d=>d.status!=="open").length;
  const totalDisputed = DISPUTES.filter(d=>d.status==="open").reduce((s,d)=>s+d.amount,0);
  const reasonsTotal = REASONS.reduce((s,r)=>s+r.count,0);
  const reasonSegments = REASONS.reduce<Array<(typeof REASONS)[number] & { pct: number; offset: number }>>((segments, reason) => {
    const offset = segments.reduce((sum, segment) => sum + segment.pct, 0);
    const pct = (reason.count / reasonsTotal) * 100;
    return [...segments, { ...reason, pct, offset }];
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
        <h1 className={`text-xl font-bold mb-1 ${isDark?"text-white":"text-slate-800"}`}>النزاعات</h1>
        <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>إدارة خلافات الخدمات بين الطالبين والمزودين</p>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"نزاعات مفتوحة", val:openCount.toString(), icon:Warning, c:"text-red-400" },
          { label:"تم حلها (الشهر)", val:resolvedCount.toString(), icon:CheckCircle, c:"text-emerald-400" },
          { label:"مبالغ متنازعة", val:`${totalDisputed.toLocaleString("ar-SA")} ر.س`, icon:Money, c:"text-amber-400" },
          { label:"متوسط وقت الحل", val:"٤.٢ يوم", icon:Clock, c:"text-blue-400" },
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

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        {/* Donut — Reasons */}
        <div className={`${card} p-5`}>
          <p className={`text-[12px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>أسباب النزاعات</p>
          <div className="flex gap-6">
            <svg viewBox="0 0 120 120" className="w-24 h-24 flex-shrink-0">
              {reasonSegments.map((r,i)=>{
                  const c = 2*Math.PI*45;
                  const dash = (r.pct/100)*c;
                  return <circle key={i} cx="60" cy="60" r="45" fill="none" stroke={r.color} strokeWidth="12"
                    strokeDasharray={`${dash} ${c-dash}`} strokeDashoffset={-(r.offset/100)*c}
                    strokeLinecap="round" className="transition-all duration-700"/>;
                })}
              <text x="60" y="60" textAnchor="middle" dominantBaseline="central"
                className={`text-[18px] font-bold ${isDark?"fill-white":"fill-slate-800"}`}>
                {REASONS.reduce((s,r)=>s+r.count,0)}
              </text>
            </svg>
            <div className="space-y-2 flex-1">
              {REASONS.map((r,i)=>(
                <div key={i} className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full flex-shrink-0" style={{backgroundColor:r.color}}/>
                  <span className={`text-[10px] flex-1 ${isDark?"text-zinc-400":"text-slate-500"}`}>{r.label}</span>
                  <span className={`text-[10px] font-bold ${isDark?"text-zinc-300":"text-slate-600"}`}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monthly trend */}
        <div className={`${card} p-5`}>
          <p className={`text-[12px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>معدل النزاعات الشهري</p>
          <svg viewBox="0 0 200 60" className="w-full h-14" preserveAspectRatio="none">
            <path d="M0,50 L33,45 L66,42 L100,38 L133,32 L166,35 L200,28" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
            {[[0,50],[33,45],[66,42],[100,38],[133,32],[166,35],[200,28]].map(([x,y],i)=>(
              <circle key={i} cx={x} cy={y} r="3" fill="#ef4444"/>
            ))}
          </svg>
          <p className={`text-[10px] mt-2 ${isDark?"text-zinc-500":"text-slate-400"}`}>
            اتجاه تنازلي — معدل النزاعات انخفض ٢٨% عن الربع السابق
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5">
        {[["all","الكل"],["open","مفتوح"],["resolved_client","لصالح الطالب"],["resolved_provider","لصالح المزود"],["resolved_split","تسوية"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              filter===v?"bg-[#C8A762] text-black":isDark?"bg-white/[0.04] text-zinc-500":"bg-slate-100 text-slate-500"
            }`}>{l}</button>
        ))}
      </div>

      {/* Disputes List */}
      <div className="space-y-3">
        {filtered.map((d,i)=>{
          const sc = STATUS_CFG[d.status];
          return (
            <motion.div key={d.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
              className={`${card} p-5 group hover:border-red-500/15 transition-all`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[12px] font-bold ${isDark?"text-zinc-200":"text-slate-700"}`}>{d.id}</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span>
                    <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{d.date}</span>
                  </div>
                  <p className={`text-[11px] mb-2 ${isDark?"text-zinc-400":"text-slate-500"}`}>{d.reason}</p>
                  <div className={`flex items-center gap-4 text-[10px] ${isDark?"text-zinc-500":"text-slate-400"}`}>
                    <span className="flex items-center gap-1"><User size={10}/> الطالب: {d.clientName}</span>
                    <span>←→</span>
                    <span className="flex items-center gap-1"><User size={10}/> المزود: {d.providerName}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className={`text-[16px] font-bold ${isDark?"text-white":"text-slate-800"}`}>{d.amount.toLocaleString("ar-SA")} <span className={`text-[10px] font-normal ${isDark?"text-zinc-500":"text-slate-400"}`}>ر.س</span></p>
                  {d.status==="open" && (
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20">لصالح الطالب</button>
                      <button className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20">لصالح المزود</button>
                      <button className="px-2.5 py-1.5 rounded-lg text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20">تسوية</button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
