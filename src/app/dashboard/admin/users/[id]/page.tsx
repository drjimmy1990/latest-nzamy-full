"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft, User, Robot, Ticket, Money, Star, Eye,
  LockSimple, Crown, ChatCircle, ShieldCheck, Clock,
  CheckCircle, Warning, Globe, DeviceMobile, Desktop,
  SignIn, SignOut, CreditCard, ChartLine, Scales,
  ArrowSquareOut, Envelope, Prohibit, UserSwitch,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

/* ── Mock ──────────────────────────────────────────────────────────────────── */
const U = {
  id:"U-0091", name:"أ. محمد العتيبي", email:"m.otaibi@lawfirm.sa",
  phone:"+966 55 482 9371", role:"lawyer" as const, plan:"Pro",
  status:"active" as const, joined:"2024-11-02", lastActive:"منذ ٣ دقائق",
  city:"الرياض", revenue:14970, aiCalls:1240, tickets:3, rating:4.8,
};

const ACTIVITY = [
  { action:"استخدم الصائغ القانوني", time:"منذ ٣ دق", type:"ai" },
  { action:"رفع مذكرة جديدة", time:"منذ ١٨ دق", type:"doc" },
  { action:"أنشأ قضية جديدة #٤٢", time:"منذ ساعة", type:"case" },
  { action:"دفع فاتورة الاشتراك — ٤٩٩ ر.س", time:"منذ ٣ أيام", type:"pay" },
  { action:"تسجيل دخول من الرياض", time:"منذ ٣ أيام", type:"login" },
  { action:"فتح تذكرة دعم #١٢٨", time:"منذ أسبوع", type:"ticket" },
];

const SESSIONS = [
  { device:"Chrome — Windows", ip:"185.23.xx.xx", loc:"الرياض", active:true },
  { device:"Safari — iPhone 15", ip:"185.23.xx.xx", loc:"الرياض", active:false },
];

const PAYMENTS = [
  { date:"2024-12-01", amount:499, status:"paid" },
  { date:"2024-11-01", amount:499, status:"paid" },
  { date:"2024-10-01", amount:499, status:"paid" },
];

const AI_USAGE = [
  { tool:"الصائغ القانوني", calls:420, pct:34 },
  { tool:"محترف العقود", calls:310, pct:25 },
  { tool:"محاكي المعركة", calls:280, pct:23 },
  { tool:"الرأي الفصل", calls:130, pct:10 },
  { tool:"السكرتير الذكي", calls:100, pct:8 },
];

const ROLE_MAP: Record<string,string> = {
  lawyer:"محامي", firm:"مكتب محاماة", corporate:"شركة",
  micro:"منشأة صغيرة", provider:"مزود خدمة", individual:"عميل فرد",
};

type Tab = "activity"|"subscription"|"ai"|"tickets"|"security";

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function UserProfilePage() {
  const { isDark } = useTheme();
  const params = useParams();
  const [tab, setTab] = useState<Tab>("activity");
  const [impersonating, setImpersonating] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const TABS:{id:Tab;label:string;icon:React.ElementType}[] = [
    { id:"activity", label:"النشاط", icon:Clock },
    { id:"subscription", label:"الاشتراك", icon:CreditCard },
    { id:"ai", label:"استخدام AI", icon:Robot },
    { id:"tickets", label:"تذاكر الدعم", icon:Ticket },
    { id:"security", label:"الأمان", icon:ShieldCheck },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">

      {/* Impersonation Banner */}
      {impersonating && (
        <motion.div initial={{y:-40,opacity:0}} animate={{y:0,opacity:1}}
          className="fixed top-0 inset-x-0 z-50 bg-red-600 text-white flex items-center justify-center gap-3 py-2.5 text-[13px] font-bold shadow-lg">
          <UserSwitch size={16} weight="bold"/>
          أنت تتصفح المنصة كـ {U.name} — كل الإجراءات مسجلة
          <button onClick={()=>setImpersonating(false)}
            className="mr-4 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-[11px] font-bold transition-colors">
            إنهاء الانتحال
          </button>
        </motion.div>
      )}

      {/* Back + Header */}
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/admin/users"
            className={`h-10 w-10 rounded-xl flex items-center justify-center ${isDark?"bg-zinc-800 text-zinc-400 hover:bg-zinc-700":"bg-slate-100 text-slate-500 hover:bg-slate-200"} transition-colors`}>
            <ArrowLeft size={16}/>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className={`text-xl font-bold ${isDark?"text-white":"text-slate-800"}`}>{U.name}</h1>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                نشط
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">{U.plan}</span>
            </div>
            <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>
              {ROLE_MAP[U.role]} · {U.email} · {U.id}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={()=>setImpersonating(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-colors">
            <SignIn size={13}/> تصفح كمستخدم
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors">
            <Crown size={13}/> ترقية الباقة
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors">
            <Envelope size={13}/> إرسال رسالة
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
            <Prohibit size={13}/> تعليق الحساب
          </button>
        </div>
      </motion.div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"إيراد تراكمي", val:`${U.revenue.toLocaleString("ar-SA")} ر.س`, icon:Money, c:"text-emerald-400" },
          { label:"طلبات AI (الشهر)", val:U.aiCalls.toLocaleString("ar-SA"), icon:Robot, c:"text-purple-400" },
          { label:"تذاكر الدعم", val:U.tickets.toString(), icon:Ticket, c:"text-orange-400" },
          { label:"التقييم", val:U.rating.toString(), icon:Star, c:"text-[#C8A762]" },
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
      <div className={`flex items-center gap-1 border-b ${isDark?"border-white/[0.06]":"border-slate-100"} pb-0.5`}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-t-xl transition-all ${
              tab===t.id
                ? isDark?"text-white border-b-2 border-[#C8A762]":"text-slate-800 border-b-2 border-[#0B3D2E]"
                : isDark?"text-zinc-600 hover:text-zinc-400":"text-slate-400 hover:text-slate-600"
            }`}>
            <t.icon size={13}/>{t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab==="activity" && (
        <motion.div key="act" initial={{opacity:0}} animate={{opacity:1}} className={`${card} p-5`}>
          <p className={`text-[13px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>سجل النشاط</p>
          <div className="space-y-0">
            {ACTIVITY.map((a,i)=>(
              <motion.div key={i} initial={{opacity:0,x:8}} animate={{opacity:1,x:0}} transition={{delay:i*0.05}}
                className={`flex items-center gap-3 py-3 ${i<ACTIVITY.length-1?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  a.type==="ai"?"bg-purple-500/10 text-purple-400":
                  a.type==="pay"?"bg-emerald-500/10 text-emerald-400":
                  a.type==="login"?"bg-blue-500/10 text-blue-400":
                  a.type==="ticket"?"bg-orange-500/10 text-orange-400":
                  "bg-zinc-500/10 text-zinc-400"
                }`}>
                  {a.type==="ai"?<Robot size={14}/>:a.type==="pay"?<Money size={14}/>:
                   a.type==="login"?<SignIn size={14}/>:a.type==="ticket"?<Ticket size={14}/>:
                   <Eye size={14}/>}
                </div>
                <p className={`flex-1 text-[12px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{a.action}</p>
                <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{a.time}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {tab==="subscription" && (
        <motion.div key="sub" initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
          <div className={`${card} p-5`}>
            <p className={`text-[13px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>تفاصيل الاشتراك</p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label:"الباقة الحالية", val:"Pro — ٤٩٩ ر.س/شهر" },
                { label:"تاريخ التجديد", val:"١ يناير ٢٠٢٥" },
                { label:"طريقة الدفع", val:"Visa **** 4821" },
              ].map((r,i)=>(
                <div key={i}>
                  <p className={`text-[10px] mb-1 ${isDark?"text-zinc-500":"text-slate-400"}`}>{r.label}</p>
                  <p className={`text-[13px] font-bold ${isDark?"text-zinc-200":"text-slate-700"}`}>{r.val}</p>
                </div>
              ))}
            </div>
          </div>
          <div className={`${card} p-5`}>
            <p className={`text-[13px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>سجل المدفوعات</p>
            {PAYMENTS.map((p,i)=>(
              <div key={i} className={`flex items-center justify-between py-2.5 ${i<PAYMENTS.length-1?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                <span className={`text-[12px] ${isDark?"text-zinc-400":"text-slate-500"}`}>{p.date}</span>
                <span className={`text-[12px] font-bold ${isDark?"text-white":"text-slate-700"}`}>{p.amount} ر.س</span>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">مدفوع</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {tab==="ai" && (
        <motion.div key="ai" initial={{opacity:0}} animate={{opacity:1}} className={`${card} p-5`}>
          <p className={`text-[13px] font-bold mb-5 ${isDark?"text-white":"text-slate-800"}`}>استخدام أدوات AI — آخر ٣٠ يوم</p>
          <div className="space-y-4">
            {AI_USAGE.map((t,i)=>(
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className={`text-[12px] font-semibold ${isDark?"text-zinc-300":"text-slate-600"}`}>{t.tool}</p>
                  <span className={`text-[11px] font-bold ${isDark?"text-zinc-400":"text-slate-500"}`}>
                    {t.calls.toLocaleString("ar-SA")} طلب
                  </span>
                </div>
                <div className={`h-2 w-full rounded-full overflow-hidden ${isDark?"bg-white/[0.05]":"bg-slate-100"}`}>
                  <motion.div initial={{width:0}} animate={{width:`${t.pct}%`}} transition={{delay:i*0.1,duration:0.7,type:"spring",stiffness:100,damping:20}}
                    className="h-full rounded-full bg-gradient-to-l from-purple-400 to-purple-700"/>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {tab==="tickets" && (
        <motion.div key="tix" initial={{opacity:0}} animate={{opacity:1}} className={`${card} p-5`}>
          <p className={`text-[13px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>تذاكر الدعم</p>
          {[
            { id:"#١٢٨", title:"مشكلة في تصدير PDF", status:"open", date:"منذ أسبوع" },
            { id:"#١٠٤", title:"طلب ترقية باقة", status:"closed", date:"منذ شهر" },
            { id:"#٨٩", title:"استفسار عن حاسبة الأتعاب", status:"closed", date:"منذ شهرين" },
          ].map((t,i)=>(
            <div key={i} className={`flex items-center gap-3 py-3 ${i<2?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
              <Ticket size={14} className={t.status==="open"?"text-orange-400":"text-zinc-500"}/>
              <p className={`flex-1 text-[12px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{t.title}</p>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                t.status==="open"?"bg-orange-500/10 border-orange-500/20 text-orange-400":"bg-zinc-500/10 border-zinc-500/20 text-zinc-500"
              }`}>{t.status==="open"?"مفتوح":"مغلق"}</span>
              <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{t.date}</span>
            </div>
          ))}
        </motion.div>
      )}

      {tab==="security" && (
        <motion.div key="sec" initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
          <div className={`${card} p-5`}>
            <p className={`text-[13px] font-bold mb-4 ${isDark?"text-white":"text-slate-800"}`}>الأجهزة والجلسات</p>
            {SESSIONS.map((s,i)=>(
              <div key={i} className={`flex items-center gap-3 py-3 ${i<SESSIONS.length-1?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                {s.device.includes("iPhone")?<DeviceMobile size={16} className="text-blue-400"/>:<Desktop size={16} className="text-zinc-400"/>}
                <div className="flex-1">
                  <p className={`text-[12px] font-semibold ${isDark?"text-zinc-200":"text-slate-700"}`}>{s.device}</p>
                  <p className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{s.ip} · {s.loc}</p>
                </div>
                {s.active && <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"/> نشط الآن
                </span>}
                <button className={`text-[10px] px-2 py-1 rounded-lg ${isDark?"bg-red-500/10 text-red-400 hover:bg-red-500/20":"bg-red-50 text-red-500 hover:bg-red-100"} transition-colors`}>
                  إنهاء
                </button>
              </div>
            ))}
          </div>
          <div className={`${card} p-5`}>
            <p className={`text-[13px] font-bold mb-3 ${isDark?"text-white":"text-slate-800"}`}>معلومات الأمان</p>
            {[
              { label:"المصادقة الثنائية (2FA)", val:"غير مفعّل", ok:false },
              { label:"آخر تغيير كلمة مرور", val:"منذ ٤٥ يوم", ok:true },
              { label:"محاولات دخول فاشلة", val:"٠ في آخر ٣٠ يوم", ok:true },
            ].map((r,i)=>(
              <div key={i} className={`flex items-center justify-between py-2.5 ${i<2?`border-b ${isDark?"border-white/[0.04]":"border-slate-50"}`:""}`}>
                <span className={`text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{r.label}</span>
                <div className="flex items-center gap-1.5">
                  {r.ok?<CheckCircle size={12} weight="fill" className="text-emerald-400"/>:<Warning size={12} weight="fill" className="text-amber-400"/>}
                  <span className={`text-[11px] ${isDark?"text-zinc-300":"text-slate-600"}`}>{r.val}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
