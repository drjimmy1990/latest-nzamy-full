"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  ClockCounterClockwise, MagnifyingGlass, Download, Funnel,
  SignIn, UserCirclePlus, CreditCard, ShieldCheck, Robot,
  Warning, Eye, Trash, Crown, LockSimple, UserSwitch,
  ArrowSquareOut, Scales, CheckCircle, X,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

/* ── Mock ──────────────────────────────────────────────────────────────────── */
const LOGS = [
  { id:1, actor:"أدمن — أنت", target:"أ. سعد المالكي (U-0005)", action:"user.suspend", detail:"تعليق الحساب — سبب: مخالفة شروط الاستخدام", severity:"critical" as const, time:"منذ ١٢ دق" },
  { id:2, actor:"أ. محمد العتيبي", target:"—", action:"ai.request", detail:"استخدم الصائغ القانوني — ١,٢٤٠ tokens", severity:"info" as const, time:"منذ ١٨ دق" },
  { id:3, actor:"النظام", target:"مكتب البراك (U-0090)", action:"subscription.renew", detail:"تجديد تلقائي — Enterprise — ٢,٤٩٩ ر.س", severity:"info" as const, time:"منذ ساعة" },
  { id:4, actor:"أدمن — أنت", target:"خالد الشمري (PV-037)", action:"provider.approve", detail:"اعتماد مقدم خدمة — معقّب", severity:"warning" as const, time:"منذ ٣ ساعات" },
  { id:5, actor:"أدمن — أنت", target:"—", action:"admin.impersonate", detail:"تصفح المنصة كـ أ. محمد العتيبي لمدة ٤ دقائق", severity:"critical" as const, time:"منذ ٥ ساعات" },
  { id:6, actor:"أ. سارة الزهراني", target:"—", action:"user.login", detail:"تسجيل دخول — Chrome/Windows — الرياض", severity:"info" as const, time:"منذ ٦ ساعات" },
  { id:7, actor:"النظام", target:"—", action:"system.backup", detail:"نسخ احتياطي ناجح — ٤.٢ GB", severity:"info" as const, time:"منذ ٨ ساعات" },
  { id:8, actor:"أدمن — أنت", target:"ESC-298", action:"escrow.release", detail:"تحرير ضمان — ٣,٢٠٠ ر.س لصالح المزود", severity:"warning" as const, time:"أمس" },
  { id:9, actor:"النظام", target:"أ. نوف العنزي (U-0036)", action:"subscription.cancel", detail:"إلغاء اشتراك — Starter", severity:"warning" as const, time:"أمس" },
  { id:10, actor:"أ. فهد القحطاني", target:"—", action:"user.login.failed", detail:"٣ محاولات دخول فاشلة — IP: 185.23.xx.xx", severity:"critical" as const, time:"منذ يومين" },
];

const ACTION_ICONS: Record<string,React.ElementType> = {
  "user.suspend": LockSimple, "user.login": SignIn, "user.login.failed": Warning,
  "ai.request": Robot, "subscription.renew": CreditCard, "subscription.cancel": X,
  "provider.approve": CheckCircle, "admin.impersonate": UserSwitch,
  "system.backup": ShieldCheck, "escrow.release": ArrowSquareOut,
};

const SEV_CFG: Record<string,{cls:string;label:string}> = {
  info:     { cls:"bg-blue-500/10 border-blue-500/20 text-blue-400", label:"معلومة" },
  warning:  { cls:"bg-amber-500/10 border-amber-500/20 text-amber-400", label:"تنبيه" },
  critical: { cls:"bg-red-500/10 border-red-500/20 text-red-400", label:"حرج" },
};

export default function AuditLogPage() {
  const { isDark } = useTheme();
  const [sevFilter, setSevFilter] = useState("all");
  const [search, setSearch] = useState("");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = LOGS.filter(l =>
    (sevFilter==="all" || l.severity===sevFilter) &&
    (l.detail.includes(search) || l.actor.includes(search) || l.action.includes(search))
  );

  // Activity heatmap data (hours)
  const hourlyActivity = [2,5,3,1,0,0,1,4,12,18,22,15,9,14,20,17,11,8,6,4,3,2,1,1];
  const maxH = Math.max(...hourlyActivity);

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex items-start justify-between">
        <div>
          <h1 className={`text-xl font-bold mb-1 ${isDark?"text-white":"text-slate-800"}`}>سجل التدقيق</h1>
          <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>كل إجراء في المنصة مسجّل بتوقيته ومنفّذه</p>
        </div>
        <button className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold ${isDark?"bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]":"bg-slate-100 text-slate-500 hover:bg-slate-200"} transition-colors`}>
          <Download size={13}/> تصدير CSV
        </button>
      </motion.div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:"إجمالي الأحداث (اليوم)", val:"١,٢٤٧", c:"text-blue-400" },
          { label:"إجراءات الأدمن", val:"٢٣", c:"text-purple-400" },
          { label:"تنبيهات", val:"٨", c:"text-amber-400" },
          { label:"أحداث حرجة", val:"٣", c:"text-red-400" },
        ].map((k,i)=>(
          <motion.div key={i} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
            className={`${card} p-4`}>
            <p className={`text-[10px] mb-1 ${isDark?"text-zinc-500":"text-slate-400"}`}>{k.label}</p>
            <p className={`text-[20px] font-bold ${k.c}`}>{k.val}</p>
          </motion.div>
        ))}
      </div>

      {/* Activity Heatmap */}
      <div className={`${card} p-5`}>
        <p className={`text-[12px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>نشاط المنصة حسب الساعة (اليوم)</p>
        <div className="flex items-end gap-1 h-16">
          {hourlyActivity.map((v,i)=>(
            <motion.div key={i} initial={{height:0}} animate={{height:`${(v/maxH)*100}%`}}
              transition={{delay:i*0.02,duration:0.4,type:"spring",stiffness:120,damping:20}}
              className="flex-1 rounded-t-sm transition-colors"
              style={{backgroundColor:v>15?"#ef4444":v>8?"#f59e0b":v>3?"#3b82f6":"#374151", minHeight:2, opacity:0.7+v/maxH*0.3}}
              title={`${i}:00 — ${v} حدث`}/>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          {[0,6,12,18,23].map(h=><span key={h} className={`text-[8px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{h}:00</span>)}
        </div>
      </div>

      {/* Filters */}
      <div className={`${card} p-4 flex items-center gap-3 flex-wrap`}>
        <div className={`flex items-center gap-2 flex-1 min-w-[180px] rounded-xl border px-3 py-2 ${isDark?"border-white/[0.08] bg-white/[0.03]":"border-slate-200 bg-white"}`}>
          <MagnifyingGlass size={13} className={isDark?"text-zinc-500":"text-slate-400"}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث في السجل..."
            className={`bg-transparent text-[12px] w-full outline-none ${isDark?"text-zinc-200 placeholder:text-zinc-700":"text-slate-700 placeholder:text-slate-400"}`}/>
        </div>
        {[["all","الكل"],["info","معلومة"],["warning","تنبيه"],["critical","حرج"]].map(([v,l])=>(
          <button key={v} onClick={()=>setSevFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              sevFilter===v?"bg-[#C8A762] text-black":isDark?"bg-white/[0.04] text-zinc-500":"bg-slate-100 text-slate-500"
            }`}>{l}</button>
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        {filtered.map((l,i)=>{
          const Icon = ACTION_ICONS[l.action] || Eye;
          const sev = SEV_CFG[l.severity];
          return (
            <motion.div key={l.id} initial={{opacity:0,x:6}} animate={{opacity:1,x:0}} transition={{delay:i*0.03}}
              className={`${card} p-4 flex items-start gap-3 hover:border-[#C8A762]/15 transition-all`}>
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                l.severity==="critical"?"bg-red-500/10 text-red-400":
                l.severity==="warning"?"bg-amber-500/10 text-amber-400":
                "bg-blue-500/10 text-blue-400"
              }`}>
                <Icon size={16} weight="duotone"/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className={`text-[11px] font-bold ${isDark?"text-zinc-200":"text-slate-700"}`}>{l.actor}</span>
                  {l.target!=="—" && <>
                    <span className={`text-[9px] ${isDark?"text-zinc-600":"text-slate-400"}`}>→</span>
                    <span className={`text-[10px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{l.target}</span>
                  </>}
                  <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${isDark?"bg-white/[0.04] text-zinc-500":"bg-slate-50 text-slate-400"}`}>{l.action}</span>
                </div>
                <p className={`text-[11px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{l.detail}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${sev.cls}`}>{sev.label}</span>
                <span className={`text-[9px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{l.time}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
