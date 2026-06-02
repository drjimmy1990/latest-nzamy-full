"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Users, CreditCard, Robot, TrendUp, TrendDown,
  Buildings, Scales, Warning, CheckCircle, Clock,
  ArrowUpRight, Ticket, Database, ShieldCheck, Eye,
  Sparkle, Money, Star, MagnifyingGlass, DotsThree,
  Download, Bell, ToggleLeft, ToggleRight, Trash,
  ChartBar, ChartLine, ArrowClockwise, X, Funnel,
  UserCirclePlus, Gear, SignOut, Globe, Lock,
  BookOpen, ChatTeardrop, Storefront, UsersThree, ArrowsLeftRight,
} from "@phosphor-icons/react";
import LibraryTab     from "./tabs/LibraryTab";
import CommunityTab   from "./tabs/CommunityTab";
import MarketplaceTab from "./tabs/MarketplaceTab";
import ERPTab         from "./tabs/ERPTab";
import TeamTab        from "./tabs/TeamTab";
import CorporateTab   from "./tabs/CorporateTab";
import Link           from "next/link";

// ─── Data ─────────────────────────────────────────────────────────────────────
const MRR_DATA = [
  { month:"يناير", val:612000 }, { month:"فبراير", val:648000 }, { month:"مارس", val:689000 },
  { month:"أبريل", val:701000 }, { month:"مايو", val:748000 }, { month:"يونيو", val:792000 },
  { month:"يوليو", val:831000 }, { month:"أغسطس", val:869000 }, { month:"سبتمبر", val:891000 },
  { month:"أكتوبر", val:908000 }, { month:"نوفمبر", val:952000 }, { month:"ديسمبر", val:981000 },
];

const USERS_TABLE = [
  { id:"U-0091", name:"أ. محمد العتيبي",         role:"lawyer",    plan:"Pro",        status:"active",  joined:"2024-11-02", revenue:499,  ai:1240 },
  { id:"U-0090", name:"مكتب البراك للمحاماة",    role:"firm",      plan:"Enterprise", status:"active",  joined:"2024-11-01", revenue:2499, ai:8920 },
  { id:"U-0089", name:"أ. سارة الزهراني",         role:"lawyer",    plan:"Pro",        status:"trial",   joined:"2024-10-30", revenue:0,    ai:134 },
  { id:"U-0088", name:"شركة الحلول القانونية",   role:"corporate", plan:"Enterprise", status:"active",  joined:"2024-10-28", revenue:2499, ai:5410 },
  { id:"U-0087", name:"أ. فهد القحطاني",          role:"lawyer",    plan:"Starter",    status:"active",  joined:"2024-10-27", revenue:199,  ai:341 },
  { id:"U-0086", name:"مؤسسة النور التجارية",    role:"micro",     plan:"Starter",    status:"past_due",joined:"2024-10-25", revenue:199,  ai:88 },
  { id:"U-0085", name:"أ. نورة الحارثي",          role:"lawyer",    plan:"Pro",        status:"active",  joined:"2024-10-22", revenue:499,  ai:920 },
  { id:"U-0084", name:"مكتب الرياض للمحاماة",    role:"firm",      plan:"Pro",        status:"active",  joined:"2024-10-20", revenue:1299, ai:3200 },
  { id:"U-0083", name:"خالد الشمري — موثّق",      role:"provider",  plan:"Starter",    status:"active",  joined:"2024-10-18", revenue:199,  ai:210 },
  { id:"U-0082", name:"شركة التقنية والقانون",   role:"corporate", plan:"Pro",        status:"active",  joined:"2024-10-15", revenue:999,  ai:2100 },
];

const PLAN_DIST = [
  { plan:"Enterprise", count:42,  color:"#C8A762", pct:8,  mrr:104958 },
  { plan:"Pro",        count:312, color:"#10b981", pct:62, mrr:519288 },
  { plan:"Starter",    count:98,  color:"#6366f1", pct:19, mrr:91002 },
  { plan:"Trial",      count:54,  color:"#f59e0b", pct:11, mrr:0 },
];

const AI_TOOLS = [
  { name:"الصائغ القانوني",   calls:18420, pct:92, growth:"+14%" },
  { name:"محترف العقود",      calls:12310, pct:78, growth:"+8%" },
  { name:"محاكي المعركة",     calls:9870,  pct:61, growth:"+22%" },
  { name:"الرأي الفصل",       calls:7540,  pct:48, growth:"+5%" },
  { name:"السكرتير الذكي",    calls:5210,  pct:33, growth:"+31%" },
  { name:"حاسبة الأتعاب",     calls:3100,  pct:20, growth:"+2%" },
];

const ALERTS = [
  { type:"warning", msg:"٣ مستخدمين تجاوزوا حد الـ AI اليومي",       time:"منذ ١٠ دق" },
  { type:"error",   msg:"فشل تجديد: مكتب الرياض للمحاماة (U-0084)",  time:"منذ ٢ س" },
  { type:"success", msg:"نسخ احتياطي ناجح — ٤.٢ GB",                  time:"منذ ٣ س" },
  { type:"warning", msg:"تذكرة #٤٢٨ معلقة ٤٨ ساعة بدون رد",          time:"منذ يوم" },
];

const ROLE_LABELS: Record<string,string> = {
  lawyer:"محامي", firm:"شركة محاماة", corporate:"مؤسسة", micro:"منشأة صغيرة", provider:"مزود خدمة", individual:"فرد",
};

// ─── SVG MRR Chart ────────────────────────────────────────────────────────────
function MRRChart() {
  const W=560, H=120, pad=8;
  const max=Math.max(...MRR_DATA.map(d=>d.val));
  const pts = MRR_DATA.map((d,i)=>({
    x: pad + (i/(MRR_DATA.length-1))*(W-pad*2),
    y: pad + (1-d.val/max)*(H-pad*2),
  }));
  const path = pts.map((p,i)=>i===0?`M${p.x},${p.y}`:`L${p.x},${p.y}`).join(" ");
  const fill = path + ` L${pts[pts.length-1].x},${H} L${pts[0].x},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none">
      <defs>
        <linearGradient id="mrr-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#10b981" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <motion.path d={fill} fill="url(#mrr-fill)" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.8}}/>
      <motion.path d={path} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        initial={{pathLength:0}} animate={{pathLength:1}} transition={{duration:1.2, ease:"easeOut"}}/>
      {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3" fill="#10b981" opacity="0.7"/>)}
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n:number) { return n>=1000000?(n/1000000).toFixed(1)+"م":n>=1000?(n/1000).toFixed(1)+"ك":n.toString(); }

const STATUS_CFG: Record<string,{cls:string;label:string}> = {
  active:   { cls:"bg-emerald-500/15 border-emerald-500/30 text-emerald-400", label:"نشط" },
  trial:    { cls:"bg-blue-500/15 border-blue-500/30 text-blue-400",          label:"تجربة" },
  past_due: { cls:"bg-red-500/15 border-red-500/30 text-red-400",             label:"متأخر" },
  churned:  { cls:"bg-zinc-500/15 border-zinc-500/30 text-zinc-400",          label:"غادر" },
};

// ─── Main Page ─────────────────────────────────────────────────────────────────
type ActiveTab = "overview"|"users"|"revenue"|"ai"|"system"|"library"|"community"|"marketplace"|"erp"|"team"|"corporates";

export default function AdminDashboard() {
  const card = "relative overflow-hidden bg-[#111418]/80 backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] rounded-[2rem]";
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterPlan, setFilterPlan] = useState("all");

  const MRR  = 981000;
  const ARR  = MRR * 12;
  const ARPU = Math.round(MRR / 506);
  const CHURN = 2.4;

  const filtered = USERS_TABLE.filter(u => {
    const matchSearch = u.name.includes(search) || u.id.includes(search);
    const matchRole = filterRole==="all" || u.role===filterRole;
    const matchPlan = filterPlan==="all" || u.plan===filterPlan;
    return matchSearch && matchRole && matchPlan;
  });

  const TABS: {id:ActiveTab;label:string;icon:React.ElementType}[] = [
    {id:"overview",    label:"نظرة عامة",     icon:ChartBar},
    {id:"users",       label:"المستخدمون",    icon:Users},
    {id:"revenue",     label:"الإيرادات",     icon:Money},
    {id:"ai",          label:"مدير AI",        icon:Robot},
    {id:"library",     label:"المكتبة القانونية", icon:BookOpen},
    {id:"community",   label:"المجتمع",        icon:ChatTeardrop},
    {id:"marketplace", label:"سوق المهنيين",   icon:Storefront},
    {id:"erp",         label:"بوابة ERP",      icon:Buildings},
    {id:"corporates",  label:"إدارة الشركات",    icon:Buildings},
    {id:"team",        label:"فريق نظامي",     icon:UsersThree},
    {id:"system",      label:"صحة النظام",     icon:ShieldCheck},
  ];

  return (
    <div className="p-5 md:p-7 space-y-5 min-h-screen text-zinc-100" dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"/>
            <h1 className="text-[22px] font-black text-white">لوحة تحكم المنصة</h1>
            <span className="text-[10px] font-bold bg-red-500/15 border border-red-500/30 text-red-400 rounded-full px-2 py-0.5">أدمن</span>
          </div>
          <p className="text-[13px] text-zinc-500">
            {new Date().toLocaleDateString("ar-SA",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode switch button */}
          <Link href="/dashboard/lawyer"
            className={`${card} flex items-center gap-2 px-5 py-2.5 text-[12px] font-bold text-purple-400 hover:bg-white/[0.06] transition-all hover:scale-105 active:scale-95`}>
            <ArrowsLeftRight size={14}/> وضع المحامي
          </Link>
          <div className={`${card} flex items-center gap-2 px-4 py-2.5`}>
            <Globe size={13} className="text-emerald-400 animate-pulse"/>
            <p className="text-[11px] font-medium text-zinc-300">النظام يعمل بشكل طبيعي</p>
          </div>
          <button className={`${card} flex items-center gap-2 px-5 py-2.5 text-[12px] font-bold text-[#C8A762] hover:bg-white/[0.06] transition-all hover:scale-105 active:scale-95`}>
            <Download size={14}/> تصدير
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 pb-2 overflow-x-auto no-scrollbar mask-fade-right">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-[12px] font-bold rounded-2xl transition-all duration-300 whitespace-nowrap ${
              activeTab===t.id?"bg-white/10 text-white shadow-[0_4px_20px_rgba(0,0,0,0.2)] border border-white/10":"text-zinc-500 hover:bg-white/5 hover:text-zinc-300"}`}>
            <t.icon size={16} weight={activeTab===t.id ? "fill" : "regular"} />{t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

      {/* ═══════════════ OVERVIEW TAB ═══════════════ */}
      {activeTab==="overview" && <motion.div key="ov" initial={{opacity:0,y:20, scale:0.98}} animate={{opacity:1,y:0, scale:1}} exit={{opacity:0, scale:0.98}} transition={{type:"spring", stiffness:100, damping:20}} className="space-y-6">

        {/* Bento Grid: 12-col asymmetric */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Main KPIs (8 cols) */}
          <div className="lg:col-span-8 grid grid-cols-2 gap-6">
            {[
              { label:"MRR المتكرر",       value:`${fmt(MRR)} ر.س`,    sub:"+٩.٤% عن الشهر الماضي", trend:"up",   color:"from-emerald-500 to-teal-700", border:"border-emerald-500/20", icon:Money },
              { label:"ARR السنوي",        value:`${fmt(ARR)} ر.س`,     sub:"الإيراد السنوي المتوقع", trend:"up",   color:"from-[#C8A762] to-amber-700",   border:"border-amber-500/20",   icon:ChartLine },
              { label:"متوسط الإيراد (ARPU)",value:`${ARPU} ر.س`,          sub:"متوسط الإيراد لكل مستخدم", trend:"up",   color:"from-blue-500 to-indigo-700",     border:"border-blue-500/20",    icon:TrendUp },
              { label:"معدل التسرب (Churn)", value:`${CHURN}%`,             sub:"النسبة الشهرية المفقودة",   trend:"down", color:"from-rose-500 to-red-800",       border:"border-red-500/20",     icon:TrendDown },
            ].map((k,i)=>(
              <motion.div key={i} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.1, type:"spring", stiffness:100}}
                className={`${card} border ${k.border} p-6 group hover:border-white/30 transition-all duration-500 hover:-translate-y-1`}>
                <div className={`absolute -inset-24 bg-gradient-to-br ${k.color} opacity-0 group-hover:opacity-10 blur-3xl transition-opacity duration-700 rounded-full pointer-events-none`}/>
                
                <div className="flex items-start justify-between mb-6">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-gradient-to-br ${k.color} shadow-lg`}>
                    <k.icon size={22} weight="duotone" className="text-white"/>
                  </div>
                  <span className={`text-[10px] font-bold rounded-full px-3 py-1 flex items-center gap-1 ${k.trend==="up"?"text-emerald-300 bg-emerald-500/20 border border-emerald-500/30":"text-rose-300 bg-rose-500/20 border border-rose-500/30"}`}>
                    <span className="relative flex h-1.5 w-1.5 mr-1"><span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${k.trend==="up"?"bg-emerald-400":"bg-rose-400"}`}></span><span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${k.trend==="up"?"bg-emerald-500":"bg-rose-500"}`}></span></span>
                    {k.trend==="up"?"↑ صعود":"↓ نزول"}
                  </span>
                </div>
                <p className="text-[12px] font-medium text-zinc-400 mb-2">{k.label}</p>
                <p className="text-[28px] font-black text-white mb-2 tracking-tight">{k.value}</p>
                <p className="text-[11px] font-medium text-zinc-500">{k.sub}</p>
              </motion.div>
            ))}
          </div>

          {/* Secondary KPIs (4 cols) - The Live Status */}
          <div className="lg:col-span-4 flex flex-col gap-6">
             <div className={`${card} p-6 flex-1 flex flex-col`}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2"><Warning size={16} className="text-amber-500"/><p className="text-[14px] font-bold text-white tracking-tight">تنبيهات النظام</p></div>
                  <span className="text-[10px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full px-3 py-1 flex items-center gap-1.5"><span className="animate-pulse h-1.5 w-1.5 bg-amber-400 rounded-full"></span> مباشر</span>
                </div>
                <div className="space-y-3 flex-1 relative">
                  <AnimatePresence>
                    {ALERTS.map((a,i)=>(
                      <motion.div key={i} layoutId={`alert-${i}`} initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}} transition={{delay:i*0.1, type:"spring"}}
                        className={`flex items-start gap-3 rounded-2xl p-4 border transition-all hover:bg-white/5 ${a.type==="error"?"bg-rose-500/5 border-rose-500/20":a.type==="warning"?"bg-amber-500/5 border-amber-500/20":"bg-emerald-500/5 border-emerald-500/20"}`}>
                        {a.type==="success"?<CheckCircle size={16} weight="fill" className="text-emerald-400 flex-shrink-0 mt-0.5"/>:<Warning size={16} weight="fill" className={`flex-shrink-0 mt-0.5 ${a.type==="error"?"text-rose-400":"text-amber-400"}`}/>}
                        <div className="flex-1 min-w-0"><p className="text-[12px] font-medium text-zinc-300 leading-relaxed">{a.msg}</p><p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1"><Clock size={10}/>{a.time}</p></div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
             </div>
          </div>
        </div>

        {/* Second Row Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* MRR Chart (7 cols) */}
          <div className={`lg:col-span-7 ${card} p-6 flex flex-col justify-between group`}>
            <div className="flex items-center justify-between mb-6 relative z-10">
              <div className="flex items-center gap-2"><ChartLine size={16} className="text-emerald-400"/><p className="text-[14px] font-bold text-white tracking-tight">التدفق المالي (MRR)</p></div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">+٦٠.٢% نمو</span>
              </div>
            </div>
            <div className="relative flex-1 min-h-[160px] flex items-end">
              <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent rounded-xl pointer-events-none"/>
              <MRRChart/>
            </div>
            <div className="flex justify-between mt-4 relative z-10 px-2">
              {MRR_DATA.filter((_,i)=>i%2===0).map((d,i)=><span key={i} className="text-[10px] font-bold text-zinc-500">{d.month}</span>)}
            </div>
          </div>

          {/* AI Usage Stream (5 cols) */}
          <div className={`lg:col-span-5 ${card} p-6 flex flex-col justify-between`}>
             <div className="flex items-center gap-2 mb-6"><Robot size={16} className="text-purple-400 animate-pulse"/><p className="text-[14px] font-bold text-white tracking-tight">استهلاك محرك الذكاء الاصطناعي</p></div>
             <div className="space-y-6">
               {AI_TOOLS.slice(0, 4).map((t,i)=>(
                 <div key={i} className="space-y-2.5 group">
                   <div className="flex items-center justify-between">
                     <p className="text-[12px] font-bold text-zinc-300">{t.name}</p>
                     <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">{t.growth}</span>
                       <p className="text-[12px] font-black text-purple-400">{t.pct}%</p>
                     </div>
                   </div>
                   <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden shadow-inner">
                     <motion.div initial={{width:0}} animate={{width:`${t.pct}%`}} transition={{delay:i*0.15,duration:1, type:"spring"}}
                       className="h-full rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-400 relative overflow-hidden">
                       <motion.div animate={{x:["-100%","200%"]}} transition={{repeat:Infinity, duration:2, ease:"linear"}} className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-1/2 skew-x-12"/>
                     </motion.div>
                   </div>
                 </div>
               ))}
             </div>
          </div>

        </div>

        {/* Third Row Quick Actions (Wide Data Stream) */}
        <div className="flex gap-4 overflow-x-auto pb-4 pt-2 no-scrollbar" style={{ maskImage: "linear-gradient(to right, black 80%, transparent 100%)", WebkitMaskImage: "linear-gradient(to right, black 80%, transparent 100%)" }}>
          {[
            {label:"مستخدم جديد",   icon:UserCirclePlus, color:"text-blue-400"},
            {label:"إنشاء كوبون",   icon:Star,            color:"text-[#C8A762]"},
            {label:"تذاكر الدعم",   icon:Ticket,          color:"text-orange-400"},
            {label:"طلبات AI",      icon:Robot,           color:"text-purple-400"},
            {label:"نسخ احتياطي",   icon:Database,        color:"text-zinc-400"},
            {label:"الإعدادات",     icon:Gear,            color:"text-emerald-400"},
            {label:"صلاحيات",       icon:ShieldCheck,     color:"text-rose-400"},
          ].map((a,i)=>(
            <motion.button key={i} whileHover={{scale:1.05, y:-4}} whileTap={{scale:0.95}}
              className={`${card} flex-shrink-0 w-40 h-40 flex flex-col items-center justify-center gap-4 hover:border-white/30 transition-all group`}>
              <div className={`absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`}/>
              <div className={`flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-white/5 group-hover:bg-white/10 transition-colors shadow-inner ${a.color}`}>
                <a.icon size={26} weight="duotone"/>
              </div>
              <p className="text-[12px] font-bold text-zinc-400 group-hover:text-white transition-colors text-center relative z-10">{a.label}</p>
            </motion.button>
          ))}
        </div>
      </motion.div>}

      {/* ═══════════════ USERS TAB ═══════════════ */}
      {activeTab==="users" && <motion.div key="us" initial={{opacity:0,y:20, scale:0.98}} animate={{opacity:1,y:0, scale:1}} exit={{opacity:0, scale:0.98}} transition={{type:"spring", stiffness:100, damping:20}} className="space-y-6">
        {/* Filters */}
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className={`flex items-center gap-2 flex-1 min-w-[200px] rounded-[1rem] border border-white/10 bg-white/5 px-4 py-2.5 focus-within:border-emerald-500/50 focus-within:bg-white/10 transition-all shadow-inner`}>
              <MagnifyingGlass size={16} className="text-zinc-500"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث بالاسم أو المعرف..." className="bg-transparent text-[13px] font-medium text-white w-full outline-none placeholder:text-zinc-600"/>
              {search&&<button onClick={()=>setSearch("")} className="hover:bg-white/10 p-1 rounded-full transition-colors"><X size={12} className="text-zinc-400 hover:text-white"/></button>}
            </div>
            <div className="flex items-center gap-3">
              <select value={filterRole} onChange={e=>setFilterRole(e.target.value)} className="rounded-[1rem] border border-white/10 bg-[#111418] text-zinc-300 text-[13px] font-medium px-4 py-2.5 outline-none hover:border-white/20 transition-colors focus:border-emerald-500/50 cursor-pointer">
                <option value="all">كل الأدوار</option>
                {Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
              <select value={filterPlan} onChange={e=>setFilterPlan(e.target.value)} className="rounded-[1rem] border border-white/10 bg-[#111418] text-zinc-300 text-[13px] font-medium px-4 py-2.5 outline-none hover:border-white/20 transition-colors focus:border-emerald-500/50 cursor-pointer">
                <option value="all">كل الخطط</option>
                {["Enterprise","Pro","Starter","Trial"].map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-[1rem] bg-emerald-500/10 border border-emerald-500/20 mr-auto">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
              <span className="text-[12px] font-bold text-emerald-400">{filtered.length} مستخدم نشط</span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className={`${card} overflow-hidden flex flex-col`}>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-right whitespace-nowrap">
              <thead><tr className="border-b border-white/10 bg-white/5">
                {["المستخدم","الدور","الخطة","الحالة","الإيراد المتكرر","رصيد AI","تاريخ الانضمام","إجراءات"].map(h=>(
                  <th key={h} className="px-6 py-4 text-[11px] font-black text-zinc-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                <AnimatePresence>
                  {filtered.map((u,i)=>{
                    const sc=STATUS_CFG[u.status]||STATUS_CFG.active;
                    return (
                      <motion.tr key={u.id} layoutId={`user-row-${u.id}`} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.95}} transition={{delay:i*0.05, type:"spring", stiffness:100, damping:20}}
                        className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-[1rem] flex items-center justify-center flex-shrink-0 shadow-inner ${u.role==="firm"||u.role==="corporate"?"bg-[#C8A762]/10 border border-[#C8A762]/20":"bg-emerald-500/10 border border-emerald-500/20"}`}>
                              {u.role==="firm"||u.role==="corporate"?<Buildings size={18} weight="duotone" className="text-[#C8A762]"/>:<Scales size={18} weight="duotone" className="text-emerald-400"/>}
                            </div>
                            <div><p className="text-[13px] font-bold text-white mb-0.5 group-hover:text-emerald-400 transition-colors">{u.name}</p><p className="text-[10px] font-mono text-zinc-500">{u.id}</p></div>
                          </div>
                        </td>
                        <td className="px-6 py-4"><span className="text-[12px] font-medium text-zinc-400 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">{ROLE_LABELS[u.role]||u.role}</span></td>
                        <td className="px-6 py-4">
                          <span className={`text-[11px] font-black px-3 py-1 rounded-full border shadow-inner ${u.plan==="Enterprise"?"bg-amber-500/10 border-amber-500/30 text-amber-400":u.plan==="Pro"?"bg-emerald-500/10 border-emerald-500/30 text-emerald-400":"bg-white/5 border-white/10 text-zinc-400"}`}>{u.plan}</span>
                        </td>
                        <td className="px-6 py-4"><span className={`text-[11px] font-bold px-3 py-1 rounded-full border shadow-inner ${sc.cls}`}>{sc.label}</span></td>
                        <td className="px-6 py-4"><p className="text-[14px] font-black text-white">{u.revenue.toLocaleString("ar-SA")} <span className="text-[10px] font-medium text-zinc-500">ر.س</span></p></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <Robot size={14} className="text-purple-400"/>
                            <p className="text-[13px] font-black text-purple-400">{u.ai.toLocaleString("ar-SA")}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4"><p className="text-[12px] font-medium text-zinc-500">{u.joined}</p></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-300">
                            <button className="h-8 w-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all hover:scale-110 active:scale-95"><Eye size={14} weight="bold"/></button>
                            <button className="h-8 w-8 rounded-xl bg-white/5 hover:bg-rose-500/20 hover:border-rose-500/30 border border-transparent flex items-center justify-center text-zinc-400 hover:text-rose-400 transition-all hover:scale-110 active:scale-95"><Trash size={14} weight="bold"/></button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          {filtered.length===0&&<motion.div initial={{opacity:0}} animate={{opacity:1}} className="py-20 text-center flex flex-col items-center justify-center">
            <div className="h-16 w-16 rounded-3xl bg-white/5 flex items-center justify-center mb-4"><Users size={24} className="text-zinc-600"/></div>
            <p className="text-[14px] font-bold text-zinc-400 mb-1">لا توجد نتائج</p>
            <p className="text-[12px] text-zinc-600">حاول تغيير كلمات البحث أو الفلاتر</p>
          </motion.div>}
        </div>
      </motion.div>}

      {/* ═══════════════ REVENUE TAB ═══════════════ */}
      {activeTab==="revenue" && <motion.div key="rv" initial={{opacity:0,y:20, scale:0.98}} animate={{opacity:1,y:0, scale:1}} exit={{opacity:0, scale:0.98}} transition={{type:"spring", stiffness:100, damping:20}} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[
            {label:"الإيراد الشهري المتكرر", value:`${MRR.toLocaleString("ar-SA")} ر.س`,  sub:"ديسمبر ٢٠٢٤",   color:"from-emerald-500/20 to-teal-500/5", text:"text-emerald-400", border:"border-emerald-500/20"},
            {label:"الإيراد السنوي المتوقع", value:`${ARR.toLocaleString("ar-SA")} ر.س`,  sub:"قائم على معدل MRR", color:"from-[#C8A762]/20 to-amber-500/5", text:"text-[#C8A762]", border:"border-amber-500/20"},
            {label:"MRR المفقود (Churn)",  value:"٢٤,٣٠٠ ر.س",                          sub:"الاشتراكات الملغاة هذا الشهر", color:"from-rose-500/20 to-red-500/5", text:"text-rose-400", border:"border-rose-500/20"},
          ].map((k,i)=>(
            <motion.div key={i} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.1, type:"spring"}}
              className={`${card} border ${k.border} p-6 relative group overflow-hidden`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${k.color} opacity-50 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}/>
              <p className="text-[12px] font-bold text-zinc-400 mb-2 relative z-10">{k.label}</p>
              <p className={`text-[28px] font-black mb-1 relative z-10 tracking-tight ${k.text}`}>{k.value}</p>
              <p className="text-[11px] font-medium text-zinc-500 relative z-10">{k.sub}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className={`lg:col-span-8 ${card} p-6 flex flex-col justify-between`}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2"><ChartLine size={18} className="text-emerald-400"/><p className="text-[15px] font-bold text-white tracking-tight">النمو المالي (MRR)</p></div>
              <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-[1rem] text-[11px] text-zinc-400 font-mono">2024 - 2025</div>
            </div>
            <div className="relative flex-1 min-h-[220px] flex items-end mb-4">
              <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent rounded-xl pointer-events-none"/>
              <MRRChart/>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/5">
              {[
                {label:"إيرادات جديدة", val:"٤٢,٣٠٠ ر.س", c:"text-emerald-400", bg:"bg-emerald-500/10"},
                {label:"توسعة باقات", val:"١٨,٩٠٠ ر.س", c:"text-blue-400", bg:"bg-blue-500/10"},
                {label:"إيرادات مفقودة", val:"-٢٤,٣٠٠ ر.س", c:"text-rose-400", bg:"bg-rose-500/10"},
                {label:"صافي النمو", val:"٣٦,٩٠٠ ر.س", c:"text-[#C8A762]", bg:"bg-amber-500/10"},
              ].map((m,i)=>(
                <div key={i} className={`p-4 rounded-2xl ${m.bg} border border-white/5 flex flex-col items-center justify-center text-center`}>
                  <p className="text-[11px] font-bold text-zinc-400 mb-1.5">{m.label}</p>
                  <p className={`text-[15px] font-black tracking-tight ${m.c}`}>{m.val}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={`lg:col-span-4 ${card} p-6 flex flex-col`}>
            <div className="flex items-center gap-2 mb-8"><CreditCard size={18} className="text-[#C8A762]"/><p className="text-[15px] font-bold text-white tracking-tight">توزيع الخطط</p></div>
            <div className="space-y-6 flex-1">
              {PLAN_DIST.map((p,i)=>(
                <div key={i} className="group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full shadow-inner" style={{backgroundColor:p.color}}/>
                      <span className="text-[13px] font-bold text-zinc-200 group-hover:text-white transition-colors">{p.plan}</span>
                    </div>
                    <span className="text-[13px] font-black text-white">{p.mrr.toLocaleString("ar-SA")} <span className="text-[9px] text-zinc-500">ر.س</span></span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/5 overflow-hidden shadow-inner">
                    <motion.div initial={{width:0}} animate={{width:`${(p.mrr/MRR)*100}%`}} transition={{duration:1,delay:i*0.15, type:"spring"}} 
                      className="h-full rounded-full relative overflow-hidden" style={{backgroundColor:p.color}}>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full -translate-x-full animate-[shimmer_2s_infinite]"/>
                    </motion.div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>}

      {/* ═══════════════ AI TAB ═══════════════ */}
      {activeTab==="ai" && <motion.div key="ai" initial={{opacity:0,y:20, scale:0.98}} animate={{opacity:1,y:0, scale:1}} exit={{opacity:0, scale:0.98}} transition={{type:"spring", stiffness:100, damping:20}} className="space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {label:"إجمالي طلبات AI",     val:"٤٨٧,٢٣١", sub:"استعلام معالج هذا الشهر",     icon:Robot,    c:"text-fuchsia-400", bg:"bg-fuchsia-500/10 border-fuchsia-500/20", line:"from-fuchsia-500/20 to-fuchsia-500/0"},
            {label:"معدل نجاح الاستجابة",  val:"٩٩.٢%",    sub:"نسبة الاستجابات الصالحة",  icon:CheckCircle,c:"text-emerald-400", bg:"bg-emerald-500/10 border-emerald-500/20", line:"from-emerald-500/20 to-emerald-500/0"},
            {label:"متوسط وقت الاستجابة", val:"١.٨ ث",     sub:"P95 (أبطأ ٥%): ٤.٢ ثانية",icon:Clock,   c:"text-sky-400", bg:"bg-sky-500/10 border-sky-500/20", line:"from-sky-500/20 to-sky-500/0"},
          ].map((k,i)=>(
            <motion.div key={i} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.1, type:"spring"}}
              className={`${card} p-6 relative overflow-hidden group hover:border-white/20 transition-colors`}>
              <div className={`absolute top-0 right-0 w-full h-1/2 bg-gradient-to-b ${k.line} pointer-events-none`}/>
              <div className="flex items-start gap-4 relative z-10">
                <div className={`h-12 w-12 rounded-[1.25rem] border ${k.bg} flex items-center justify-center flex-shrink-0 shadow-inner group-hover:scale-105 transition-transform`}>
                  <k.icon size={22} weight="duotone" className={k.c}/>
                </div>
                <div>
                  <p className="text-[12px] font-bold text-zinc-400 mb-1">{k.label}</p>
                  <p className="text-[24px] font-black text-white tracking-tight mb-1">{k.val}</p>
                  <p className="text-[10px] font-medium text-zinc-500">{k.sub}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className={`${card} p-6`}>
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shadow-inner">
               <Robot size={20} className="text-purple-400 animate-pulse"/>
            </div>
            <div>
               <p className="text-[16px] font-black text-white tracking-tight">استخدام المحرك حسب الأداة</p>
               <p className="text-[11px] text-zinc-500">تحليل الاستهلاك لآخر ٣٠ يوم</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {AI_TOOLS.map((t,i)=>(
              <div key={i} className="group">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] font-bold text-zinc-200 group-hover:text-purple-300 transition-colors">{t.name}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">{t.growth} نمو</span>
                    <span className="text-[12px] font-black text-white">{t.calls.toLocaleString("ar-SA")} <span className="text-[9px] text-zinc-500">طلب</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                   <div className="h-2 flex-1 rounded-full bg-white/5 overflow-hidden shadow-inner relative">
                     <motion.div initial={{width:0}} animate={{width:`${t.pct}%`}} transition={{delay:i*0.1,duration:1, type:"spring"}}
                       className="h-full rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-400 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full -translate-x-full animate-[shimmer_2s_infinite]"/>
                     </motion.div>
                   </div>
                   <span className="text-[11px] font-black text-purple-400 w-8 text-left">{t.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>}

      {/* ═══════════════ SYSTEM TAB ═══════════════ */}
      {activeTab==="system" && <motion.div key="sys" initial={{opacity:0,y:20, scale:0.98}} animate={{opacity:1,y:0, scale:1}} exit={{opacity:0, scale:0.98}} transition={{type:"spring", stiffness:100, damping:20}} className="space-y-6">
        
        {/* Core Infrastructure Bento */}
        <div className={`${card} p-6`}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-[1.25rem] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-inner">
                <Database size={22} className="text-emerald-400"/>
              </div>
              <div>
                <p className="text-[16px] font-black text-white tracking-tight mb-0.5">البنية التحتية والخوادم</p>
                <div className="flex items-center gap-1.5"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span><span className="text-[11px] font-bold text-emerald-400">جميع الأنظمة تعمل بكفاءة (Operational)</span></div>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl">
               <span className="text-[10px] text-zinc-500 font-mono">UPTIME:</span>
               <span className="text-[14px] font-black text-white">99.99%</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {label:"خوادم الـ API (الرياض)",      pct:99.98,sla:"٩٩.٩%"},
              {label:"قواعد البيانات (PostgreSQL)", pct:99.7, sla:"٩٩.٩%"},
              {label:"شبكة الملفات (CDN)",         pct:100,  sla:"٩٩.٩%"},
              {label:"مزود البريد (Resend)",      pct:97.2, sla:"٩٩%"},
              {label:"بوابة واتساب (WhatsApp)",   pct:94.1, sla:"٩٥%"},
              {label:"بوابة الدفع (Moyasar)",     pct:99.8, sla:"٩٩.٩%"},
            ].map((s,i)=>(
              <motion.div key={i} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.05, type:"spring"}}
                className={`rounded-[1.25rem] p-5 border shadow-inner group transition-all hover:-translate-y-1 ${s.pct>=99?"bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40":s.pct>=95?"bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40":"bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40"}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-2.5 w-2.5 rounded-full ${s.pct>=99?"bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]":s.pct>=95?"bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)] animate-pulse":"bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-ping"}`}/>
                    <p className="text-[13px] font-bold text-white group-hover:text-emerald-400 transition-colors">{s.label}</p>
                  </div>
                  <span className={`text-[14px] font-black tracking-tight ${s.pct>=99?"text-emerald-400":s.pct>=95?"text-amber-400":"text-rose-400"}`}>{s.pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden shadow-inner flex items-center">
                  <div className={`h-full rounded-full relative overflow-hidden ${s.pct>=99?"bg-gradient-to-r from-emerald-600 to-emerald-400":s.pct>=95?"bg-gradient-to-r from-amber-600 to-amber-400":"bg-gradient-to-r from-rose-600 to-rose-400"}`} style={{width:`${Math.min(s.pct,100)}%`}}>
                     <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full -translate-x-full animate-[shimmer_2s_infinite]"/>
                  </div>
                </div>
                <div className="flex justify-between mt-2">
                   <span className="text-[9px] font-medium text-zinc-500">الضمان (SLA): {s.sla}</span>
                   {s.pct<95 && <span className="text-[9px] font-bold text-rose-400">يتطلب تدخل</span>}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Security & Audit Logs Bento */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={`${card} p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <ShieldCheck size={20} className="text-blue-400"/>
              </div>
              <p className="text-[15px] font-bold text-white tracking-tight">بروتوكولات الأمان</p>
            </div>
            <div className="space-y-3">
              {[
                {label:"شهادات تشفير (SSL/TLS)",     val:"صالحة ومفعلة",  desc:"تنتهي في مارس ٢٠٢٦", ok:true},
                {label:"المصادقة الثنائية (2FA)",      val:"مفعلة إجبارياً",  desc:"لجميع حسابات الإدارة", ok:true},
                {label:"نظام كشف التطفل (IDS)",      val:"يعمل ونشط",     desc:"لم يتم رصد هجمات", ok:true},
                {label:"النسخ الاحتياطي السحابي",    val:"مكتمل",          desc:"آخر نسخة: منذ ٣ ساعات", ok:true},
              ].map((r,i)=>(
                <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                  <div>
                    <p className="text-[12px] font-bold text-zinc-200 mb-0.5">{r.label}</p>
                    <p className="text-[10px] text-zinc-500">{r.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                    <CheckCircle size={14} weight="fill" className="text-emerald-400"/>
                    <span className="text-[11px] font-bold text-emerald-400">{r.val}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className={`${card} p-6`}>
             <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <ArrowClockwise size={20} className="text-purple-400"/>
              </div>
              <p className="text-[15px] font-bold text-white tracking-tight">سجل العمليات الآلية</p>
            </div>
            <div className="relative pl-4 border-r-2 border-white/10 space-y-6">
              {[
                {op:"نسخ احتياطي لقاعدة البيانات",      time:"منذ ٣ ساعات",   user:"System_Cron", status:"success"},
                {op:"تجديد شهادات SSL التلقائي",         time:"منذ ٣ أيام",    user:"Cloudflare", status:"success"},
                {op:"تحديث خوارزميات الذكاء الاصطناعي",  time:"منذ أسبوع",     user:"Admin (U-01)", status:"success"},
                {op:"مسح ذاكرة التخزين المؤقت (Redis)",  time:"منذ أسبوعين",    user:"System_Auto", status:"success"},
              ].map((r,i)=>(
                <div key={i} className="relative pr-6">
                  <div className="absolute top-1 right-[-29px] h-4 w-4 rounded-full border-4 border-[#111418] bg-emerald-400"/>
                  <p className="text-[12px] font-bold text-zinc-200 mb-1">{r.op}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-zinc-500">{r.user}</span>
                    <span className="h-1 w-1 rounded-full bg-zinc-700"/>
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1"><Clock size={10}/> {r.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>}

      {activeTab==="library"     && <LibraryTab/>}
      {activeTab==="community"   && <CommunityTab/>}
      {activeTab==="marketplace" && <MarketplaceTab/>}
      {activeTab==="erp"         && <ERPTab/>}
      {activeTab==="corporates"  && <CorporateTab/>}
      {activeTab==="team"        && <TeamTab/>}

      </AnimatePresence>
    </div>
  );
}
