"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import {
  MagnifyingGlass, Check, X, Clock, Warning,
  FileText, Robot, Eye,
  CheckCircle, IdentificationCard, Buildings,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

/* ── Mock ──────────────────────────────────────────────────────────────────── */
const REQUESTS = [
  { id:"PV-042", name:"شركة السند للمحاماة والاستشارات", type:"firm" as const, date:"منذ ساعة",
    docs:["سجل تجاري","ترخيص شركة مهنية","بيانات الشركاء","تفويض الشريك المدير"], aiScore:89, status:"pending" as const },
  { id:"PV-041", name:"أ. سلطان المطيري", type:"lawyer" as const, date:"منذ ساعتين",
    docs:["رخصة محاماة","بطاقة هوية","شهادة جامعية"], aiScore:92, status:"pending" as const },
  { id:"PV-040", name:"عبدالرحمن الغامدي — موثّق", type:"notary" as const, date:"منذ ٥ ساعات",
    docs:["تصريح وزاري","بطاقة هوية"], aiScore:78, status:"pending" as const },
  { id:"PV-039", name:"أ. فاطمة الحربي", type:"lawyer" as const, date:"منذ يوم",
    docs:["رخصة محاماة","بطاقة هوية","شهادة جامعية","خبرة عملية"], aiScore:97, status:"approved" as const },
  { id:"PV-038", name:"محمد البلوي — محكّم", type:"arbitrator" as const, date:"منذ ٣ أيام",
    docs:["شهادة تحكيم","بطاقة هوية"], aiScore:45, status:"rejected" as const },
  { id:"PV-037", name:"خالد الشهري — معقّب", type:"bailiff" as const, date:"منذ ٤ أيام",
    docs:["تصريح معقّب","بطاقة هوية"], aiScore:88, status:"approved" as const },
  { id:"PV-036", name:"أ. نوف العنزي", type:"lawyer" as const, date:"منذ أسبوع",
    docs:["رخصة محاماة","بطاقة هوية"], aiScore:61, status:"needs_docs" as const },
];

const TYPE_CFG: Record<string,{label:string;color:string}> = {
  firm:{ label:"شركة محاماة", color:"text-[#C8A762]" },
  lawyer:{ label:"محامي", color:"text-blue-400" },
  notary:{ label:"موثّق", color:"text-emerald-400" },
  arbitrator:{ label:"محكّم", color:"text-purple-400" },
  bailiff:{ label:"معقّب", color:"text-orange-400" },
};

const STATUS_CFG: Record<string,{label:string;cls:string}> = {
  pending:{ label:"قيد المراجعة", cls:"bg-amber-500/10 border-amber-500/20 text-amber-400" },
  approved:{ label:"معتمد", cls:"bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
  rejected:{ label:"مرفوض", cls:"bg-red-500/10 border-red-500/20 text-red-400" },
  needs_docs:{ label:"يحتاج مستندات", cls:"bg-blue-500/10 border-blue-500/20 text-blue-400" },
};

function ScoreBadge({ score }:{ score:number }) {
  const c = score>=80?"text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    :score>=60?"text-amber-400 bg-amber-500/10 border-amber-500/20"
    :"text-red-400 bg-red-500/10 border-red-500/20";
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${c}`}>
      <Robot size={12} weight="fill"/>
      <span className="text-[11px] font-bold">{score}/100</span>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function ProviderVerificationPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("تحقق المزودين Backend-ready: قرارات الاعتماد والرفض محلية فقط حتى ربط KYC API.");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = REQUESTS.filter(r =>
    (filter==="all" || r.status===filter) &&
    (r.name.includes(search) || r.id.includes(search))
  );

  const stats = {
    pending: REQUESTS.filter(r=>r.status==="pending").length,
    approved: REQUESTS.filter(r=>r.status==="approved").length,
    rejected: REQUESTS.filter(r=>r.status==="rejected").length,
    needsDocs: REQUESTS.filter(r=>r.status==="needs_docs").length,
  };

  // Chart data — weekly applications
  const weeklyData = [
    { week:"الأسبوع ١", val:8 },{ week:"الأسبوع ٢", val:12 },
    { week:"الأسبوع ٣", val:6 },{ week:"الأسبوع ٤", val:14 },
  ];
  const maxWeekly = Math.max(...weeklyData.map(d=>d.val));

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-1 ${isDark?"text-white":"text-slate-800"}`}>
            تحقق المزودين (KYC)
          </h1>
          <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>
            مراجعة طلبات انضمام المحامين ومقدمي الخدمات وشركات المحاماة — مدعوم بتقييم AI تلقائي
          </p>
        </div>
        <Link href="/dashboard/admin/provider-verification/firms" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2.5 text-xs font-black text-[#C8A762]">
          <Buildings size={15} weight="duotone" />
          إدارة شركات المحاماة
        </Link>
      </motion.div>

      <div className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${isDark ? "border-blue-500/20 bg-blue-500/10 text-blue-100" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
        <Warning size={18} weight="fill" className="mt-0.5 shrink-0" />
        <span>{toast}</span>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"قيد المراجعة", val:stats.pending, icon:Clock, c:"text-amber-400" },
          { label:"معتمد", val:stats.approved, icon:CheckCircle, c:"text-emerald-400" },
          { label:"مرفوض", val:stats.rejected, icon:X, c:"text-red-400" },
          { label:"يحتاج مستندات", val:stats.needsDocs, icon:FileText, c:"text-blue-400" },
        ].map((k,i)=>(
          <motion.div key={i} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.06}}
            className={`${card} p-4 flex items-center gap-3`}>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark?"bg-white/[0.04]":"bg-slate-50"} ${k.c}`}>
              <k.icon size={18} weight="duotone"/>
            </div>
            <div>
              <p className={`text-[10px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{k.label}</p>
              <p className={`text-[20px] font-bold ${k.c}`}>{k.val}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Donut — Status Distribution */}
        <div className={`${card} p-5`}>
          <p className={`text-[12px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>توزيع الحالات</p>
          <div className="flex items-center justify-center mb-4">
            <svg viewBox="0 0 120 120" className="w-24 h-24">
              {(() => {
                const total = REQUESTS.length;
                const segments = [
                  { count:stats.pending, color:"#f59e0b" },
                  { count:stats.approved, color:"#10b981" },
                  { count:stats.rejected, color:"#ef4444" },
                  { count:stats.needsDocs, color:"#3b82f6" },
                ];
                let offset = 0;
                return segments.map((s,i) => {
                  const pct = (s.count/total)*100;
                  const circumference = 2*Math.PI*45;
                  const dash = (pct/100)*circumference;
                  const el = <circle key={i} cx="60" cy="60" r="45" fill="none" stroke={s.color} strokeWidth="12"
                    strokeDasharray={`${dash} ${circumference-dash}`}
                    strokeDashoffset={-(offset/100)*circumference} strokeLinecap="round"
                    className="transition-all duration-700"/>;
                  offset += pct;
                  return el;
                });
              })()}
              <text x="60" y="60" textAnchor="middle" dominantBaseline="central"
                className={`text-[22px] font-bold ${isDark?"fill-white":"fill-slate-800"}`}>
                {REQUESTS.length}
              </text>
            </svg>
          </div>
          <div className="space-y-1.5">
            {[
              { label:"قيد المراجعة", val:stats.pending, c:"bg-amber-500" },
              { label:"معتمد", val:stats.approved, c:"bg-emerald-500" },
              { label:"مرفوض", val:stats.rejected, c:"bg-red-500" },
              { label:"يحتاج مستندات", val:stats.needsDocs, c:"bg-blue-500" },
            ].map((s,i)=>(
              <div key={i} className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${s.c}`}/>
                <span className={`text-[10px] flex-1 ${isDark?"text-zinc-400":"text-slate-500"}`}>{s.label}</span>
                <span className={`text-[10px] font-bold ${isDark?"text-zinc-300":"text-slate-600"}`}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar — Weekly Applications */}
        <div className={`${card} p-5`}>
          <p className={`text-[12px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>طلبات أسبوعية</p>
          <div className="flex items-end gap-3 h-28">
            {weeklyData.map((d,i)=>(
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className={`text-[9px] font-bold ${isDark?"text-zinc-400":"text-slate-500"}`}>{d.val}</span>
                <motion.div initial={{height:0}} animate={{height:`${(d.val/maxWeekly)*100}%`}}
                  transition={{delay:i*0.1,duration:0.6,type:"spring",stiffness:100,damping:20}}
                  className="w-full rounded-t-lg bg-gradient-to-t from-[#C8A762] to-amber-400" style={{minHeight:4}}/>
                <span className={`text-[8px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{d.week.replace("الأسبوع ","س")}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Line — Approval Rate */}
        <div className={`${card} p-5`}>
          <p className={`text-[12px] font-bold mb-2 ${isDark?"text-white":"text-slate-800"}`}>معدل الموافقة الشهري</p>
          <p className={`text-[28px] font-bold text-emerald-400 mb-1`}>٧٨.٤%</p>
          <p className={`text-[10px] mb-3 ${isDark?"text-zinc-500":"text-slate-400"}`}>+٥.٢% عن الشهر الماضي</p>
          <svg viewBox="0 0 200 60" className="w-full h-14" preserveAspectRatio="none">
            <defs>
              <linearGradient id="approval-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.2"/>
                <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d="M0,45 L33,38 L66,42 L100,30 L133,25 L166,20 L200,12 L200,60 L0,60 Z" fill="url(#approval-fill)"/>
            <path d="M0,45 L33,38 L66,42 L100,30 L133,25 L166,20 L200,12" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      {/* Filters */}
      <div className={`${card} p-4 flex items-center gap-3 flex-wrap`}>
        <div className={`flex items-center gap-2 flex-1 min-w-[180px] rounded-xl border px-3 py-2 ${isDark?"border-white/[0.08] bg-white/[0.03]":"border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={13} className={isDark?"text-zinc-500":"text-slate-400"}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم..."
            className={`bg-transparent text-[12px] w-full outline-none ${isDark?"text-zinc-200 placeholder:text-zinc-700":"text-slate-700 placeholder:text-slate-400"}`}/>
        </div>
        {[["all","الكل"],["pending","قيد المراجعة"],["approved","معتمد"],["rejected","مرفوض"],["needs_docs","يحتاج مستندات"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              filter===v?"bg-[#C8A762] text-black":isDark?"bg-white/[0.04] text-zinc-500 hover:text-zinc-300":"bg-slate-100 text-slate-500 hover:text-slate-700"
            }`}>{l}</button>
        ))}
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filtered.map((r,i)=>{
          const tc = TYPE_CFG[r.type];
          const sc = STATUS_CFG[r.status];
          return (
            <motion.div key={r.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
              className={`${card} p-5 flex items-start gap-4 group hover:border-[#C8A762]/20 transition-all`}>
              {/* Avatar */}
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark?"bg-white/[0.04]":"bg-slate-50"}`}>
                <IdentificationCard size={20} weight="duotone" className={tc.color}/>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className={`text-[13px] font-bold ${isDark?"text-zinc-100":"text-slate-800"}`}>{r.name}</p>
                  <span className={`text-[9px] font-bold ${tc.color}`}>{tc.label}</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span>
                </div>
                <div className={`flex items-center gap-3 text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>
                  <span>{r.id}</span>
                  <span>{r.date}</span>
                  <span>{r.docs.length} مستند مرفق</span>
                </div>
                {/* Docs Pills */}
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {r.docs.map((d,j)=>(
                    <span key={j} className={`text-[9px] px-2 py-0.5 rounded-lg ${isDark?"bg-white/[0.04] text-zinc-400":"bg-slate-50 text-slate-500"}`}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>

              {/* AI Score + Actions */}
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <ScoreBadge score={r.aiScore}/>
                {r.status==="pending" && (
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setToast(`تم تجهيز اعتماد ${r.name} محليا فقط. الاعتماد الإنتاجي ينتظر KYC/Profile API.`)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                    >
                      <Check size={11} weight="bold"/> اعتماد
                    </button>
                    <button
                      onClick={() => setToast(`تم تجهيز رفض ${r.name} محليا فقط. يلزم لاحقا سبب رفض وسجل تدقيق.`)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                    >
                      <X size={11} weight="bold"/> رفض
                    </button>
                    <button
                      onClick={() => setToast(`معاينة ملف ${r.name}: المستندات mock، ومصدر الحقيقة ينتظر Document/KYC backend.`)}
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-bold ${isDark?"bg-white/[0.04] text-zinc-400":"bg-slate-50 text-slate-500"} hover:text-blue-400 transition-colors`}
                    >
                      <Eye size={12}/>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
