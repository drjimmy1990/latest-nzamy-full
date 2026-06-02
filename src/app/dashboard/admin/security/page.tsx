"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  ShieldCheck, Warning, CheckCircle, LockSimple, Eye,
  Users, Globe, Robot, Fingerprint, Detective,
  Prohibit, Clock, TrendUp, ChartLine, X, Bug,
  UserCircleMinus, ArrowsLeftRight, Desktop, Scan,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

type SecTab = "overview"|"duplicates"|"scraping"|"threats";

/* ── Mock ──────────────────────────────────────────────────────────────────── */
const DUP_ACCOUNTS = [
  { primary:"أ. سعد المالكي (U-0005)", suspects:["saad.m@gmail.com (U-0412)","s.malki@outlook.com (U-0503)"],
    reason:"نفس Device Fingerprint + نفس IP", risk:"high" as const },
  { primary:"مجهول (U-0891)", suspects:["test123@temp.com (U-0892)"],
    reason:"أنماط بريد مشابهة + تسجيل بفارق ٣ دقائق", risk:"medium" as const },
  { primary:"فاطمة الحربي (U-0124)", suspects:["f.harbi2@gmail.com (U-0567)"],
    reason:"نفس رقم الجوال", risk:"high" as const },
];

const BLOCKED_IPS = [
  { ip:"185.243.xx.xx", requests:12400, country:"هولندا", type:"bot" as const, blocked:"منذ ٣ أيام" },
  { ip:"45.89.xx.xx", requests:8900, country:"رومانيا", type:"scraper" as const, blocked:"منذ أسبوع" },
  { ip:"103.21.xx.xx", requests:5200, country:"الصين", type:"brute_force" as const, blocked:"منذ ٢ أسبوع" },
];

const FAILED_LOGINS = [
  { user:"أ. فهد القحطاني (U-0087)", attempts:7, lastAttempt:"منذ ساعتين", ip:"185.23.xx.xx" },
  { user:"مجهول — admin@nzamy.com", attempts:23, lastAttempt:"منذ ٤ ساعات", ip:"45.89.xx.xx" },
  { user:"نورة العتيبي (U-0003)", attempts:3, lastAttempt:"أمس", ip:"78.12.xx.xx" },
];

const THREAT_TYPES = [
  { type:"محاولة Brute Force", count:34, color:"#ef4444" },
  { type:"Web Scraping", count:28, color:"#f59e0b" },
  { type:"حسابات مكررة", count:12, color:"#6366f1" },
  { type:"محاولة SQL Injection", count:3, color:"#3b82f6" },
  { type:"أخرى", count:5, color:"#6b7280" },
];

export default function SecurityPage() {
  const { isDark } = useTheme();
  const [tab, setTab] = useState<SecTab>("overview");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const TABS:{id:SecTab;label:string;icon:React.ElementType}[] = [
    { id:"overview", label:"نظرة عامة", icon:ShieldCheck },
    { id:"duplicates", label:"حسابات مكررة", icon:Users },
    { id:"scraping", label:"حماية البوتات", icon:Bug },
    { id:"threats", label:"التهديدات", icon:Warning },
  ];

  // Traffic timeline (24h)
  const trafficData = [4,6,3,2,1,1,2,8,18,34,28,22,15,19,42,31,24,16,12,8,6,4,3,2];
  const maxT = Math.max(...trafficData);

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
        <h1 className={`text-xl font-bold mb-1 ${isDark?"text-white":"text-slate-800"}`}>الأمان والحماية</h1>
        <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>كشف التهديدات، الحسابات المكررة، وحماية المنصة من الهجمات</p>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"حسابات مشتبهة", val:DUP_ACCOUNTS.length.toString(), icon:Detective, c:"text-red-400" },
          { label:"IPs محظورة", val:BLOCKED_IPS.length.toString(), icon:Prohibit, c:"text-amber-400" },
          { label:"محاولات فاشلة (٢٤ ساعة)", val:"٣٣", icon:LockSimple, c:"text-orange-400" },
          { label:"Bot Traffic", val:"٢.١%", icon:Robot, c:"text-blue-400" },
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

      {/* Tabs */}
      <div className={`flex gap-1 border-b pb-0.5 ${isDark?"border-white/[0.06]":"border-slate-100"}`}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-t-xl transition-all ${
              tab===t.id?isDark?"text-white border-b-2 border-[#C8A762]":"text-slate-800 border-b-2 border-[#0B3D2E]"
              :isDark?"text-zinc-600":"text-slate-400"
            }`}>
            <t.icon size={13}/>{t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab==="overview" && (
        <motion.div key="ov" initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
          {/* Traffic Anomalies */}
          <div className={`${card} p-5`}>
            <p className={`text-[12px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>حركة المرور — ٢٤ ساعة (طلبات مشبوهة)</p>
            <div className="flex items-end gap-1 h-20">
              {trafficData.map((v,i)=>(
                <motion.div key={i} initial={{height:0}} animate={{height:`${(v/maxT)*100}%`}}
                  transition={{delay:i*0.02,duration:0.4,type:"spring",stiffness:120,damping:20}}
                  className="flex-1 rounded-t-sm"
                  style={{
                    backgroundColor:v>30?"#ef4444":v>15?"#f59e0b":v>5?"#3b82f6":"#374151",
                    minHeight:2, opacity:0.6+v/maxT*0.4
                  }}/>
              ))}
            </div>
            <div className="flex justify-between mt-1">
              {[0,6,12,18,23].map(h=><span key={h} className={`text-[8px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{h}:00</span>)}
            </div>
          </div>

          {/* Threat Types Donut + SSL/Security Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`${card} p-5`}>
              <p className={`text-[12px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>أنواع التهديدات (الشهر)</p>
              <div className="flex gap-4">
                <svg viewBox="0 0 120 120" className="w-24 h-24 flex-shrink-0">
                  {(()=>{
                    const total = THREAT_TYPES.reduce((s,t)=>s+t.count,0);
                    let offset = 0;
                    return THREAT_TYPES.map((t,i)=>{
                      const pct=(t.count/total)*100; const c=2*Math.PI*45;
                      const dash=(pct/100)*c;
                      const el = <circle key={i} cx="60" cy="60" r="45" fill="none" stroke={t.color} strokeWidth="12"
                        strokeDasharray={`${dash} ${c-dash}`} strokeDashoffset={-(offset/100)*c} strokeLinecap="round"/>;
                      offset+=pct; return el;
                    });
                  })()}
                  <text x="60" y="60" textAnchor="middle" dominantBaseline="central"
                    className={`text-[18px] font-bold ${isDark?"fill-white":"fill-slate-800"}`}>
                    {THREAT_TYPES.reduce((s,t)=>s+t.count,0)}
                  </text>
                </svg>
                <div className="space-y-1.5 flex-1">
                  {THREAT_TYPES.map((t,i)=>(
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{backgroundColor:t.color}}/>
                      <span className={`text-[10px] flex-1 ${isDark?"text-zinc-400":"text-slate-500"}`}>{t.type}</span>
                      <span className={`text-[10px] font-bold ${isDark?"text-zinc-300":"text-slate-600"}`}>{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`${card} p-5`}>
              <p className={`text-[12px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>حالة الأمان</p>
              {[
                { label:"شهادات SSL", val:"صالحة حتى مارس ٢٠٢٦", ok:true },
                { label:"2FA للأدمن", val:"مفعّل", ok:true },
                { label:"WAF", val:"Cloudflare — نشط", ok:true },
                { label:"Rate Limiting", val:"٦٠ طلب/دقيقة", ok:true },
                { label:"آخر فحص أمني", val:"منذ ٣ أيام", ok:true },
              ].map((r,i)=>(
                <div key={i} className={`flex items-center justify-between py-2 ${i<4?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                  <span className={`text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{r.label}</span>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle size={12} weight="fill" className="text-emerald-400"/>
                    <span className={`text-[11px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{r.val}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Duplicates Tab */}
      {tab==="duplicates" && (
        <motion.div key="dup" initial={{opacity:0}} animate={{opacity:1}} className="space-y-3">
          <div className={`${card} p-4 flex items-center gap-3 border-amber-500/20 ${isDark?"bg-amber-500/[0.03]":"bg-amber-50"}`}>
            <Detective size={16} className="text-amber-500"/>
            <p className={`text-[12px] flex-1 ${isDark?"text-zinc-300":"text-slate-600"}`}>
              تم رصد <strong>{DUP_ACCOUNTS.length} حالات مشتبهة</strong> بحسابات مكررة — يرجى المراجعة
            </p>
          </div>
          {DUP_ACCOUNTS.map((d,i)=>(
            <motion.div key={i} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.06}}
              className={`${card} p-5 group`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className={`text-[12px] font-bold mb-1 ${isDark?"text-zinc-200":"text-slate-700"}`}>{d.primary}</p>
                  <p className={`text-[10px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{d.reason}</p>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                  d.risk==="high"?"bg-red-500/10 border-red-500/20 text-red-400":"bg-amber-500/10 border-amber-500/20 text-amber-400"
                }`}>{d.risk==="high"?"خطورة عالية":"خطورة متوسطة"}</span>
              </div>
              <div className="space-y-1.5 mb-3">
                {d.suspects.map((s,j)=>(
                  <div key={j} className={`flex items-center gap-2 text-[11px] ${isDark?"text-zinc-400":"text-slate-500"}`}>
                    <ArrowsLeftRight size={10}/> {s}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">حظر المكرر</button>
                <button className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20">دمج الحسابات</button>
                <button className={`px-3 py-1.5 rounded-lg text-[10px] font-bold ${isDark?"bg-white/[0.04] text-zinc-400":"bg-slate-50 text-slate-500"}`}>تجاهل</button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Scraping Tab */}
      {tab==="scraping" && (
        <motion.div key="scr" initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
          <div className={`${card} p-5`}>
            <p className={`text-[12px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>عناوين IP المحظورة</p>
            <table className="w-full text-right">
              <thead><tr className={`border-b ${isDark?"border-white/[0.06]":"border-slate-100"}`}>
                {["IP","الطلبات","الدولة","النوع","تاريخ الحظر",""].map(h=>(
                  <th key={h} className={`px-4 py-2 text-[10px] font-bold ${isDark?"text-zinc-600":"text-slate-400"}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {BLOCKED_IPS.map((b,i)=>(
                  <tr key={i} className={`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`}>
                    <td className="px-4 py-2.5"><span className={`text-[11px] font-mono ${isDark?"text-zinc-300":"text-slate-600"}`}>{b.ip}</span></td>
                    <td className="px-4 py-2.5"><span className="text-[11px] font-bold text-red-400">{b.requests.toLocaleString()}</span></td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{b.country}</span></td>
                    <td className="px-4 py-2.5"><span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      b.type==="bot"?"bg-amber-500/10 text-amber-400":b.type==="scraper"?"bg-purple-500/10 text-purple-400":"bg-red-500/10 text-red-400"
                    }`}>{b.type==="bot"?"بوت":b.type==="scraper"?"سكرابر":"Brute Force"}</span></td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{b.blocked}</span></td>
                    <td className="px-4 py-2.5">
                      <button className={`text-[9px] px-2 py-1 rounded-lg ${isDark?"bg-white/[0.04] text-zinc-400":"bg-slate-50 text-slate-500"} hover:text-emerald-400`}>
                        إلغاء الحظر
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Threats Tab */}
      {tab==="threats" && (
        <motion.div key="thr" initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
          <div className={`${card} p-5`}>
            <p className={`text-[12px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>محاولات دخول فاشلة</p>
            {FAILED_LOGINS.map((f,i)=>(
              <div key={i} className={`flex items-center gap-3 py-3 ${i<FAILED_LOGINS.length-1?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                <Warning size={14} className={f.attempts>10?"text-red-400":"text-amber-400"}/>
                <div className="flex-1">
                  <p className={`text-[11px] font-bold ${isDark?"text-zinc-200":"text-slate-700"}`}>{f.user}</p>
                  <p className={`text-[9px] ${isDark?"text-zinc-600":"text-slate-400"}`}>IP: {f.ip} · {f.lastAttempt}</p>
                </div>
                <span className={`text-[11px] font-bold ${f.attempts>10?"text-red-400":"text-amber-400"}`}>{f.attempts} محاولة</span>
                <button className="px-2 py-1 rounded-lg text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">
                  حظر IP
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
