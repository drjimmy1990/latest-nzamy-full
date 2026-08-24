"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, Robot, Gavel, CheckCircle, FileText, Receipt,
  User, Scales, ChatCircle, ArrowSquareOut, MagnifyingGlass,
  CalendarBlank, Download, Warning, Archive, X,
  FunnelSimple, CaretDown, ClipboardText, Package, XCircle, Bell,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import HijriDateWidget from "@/components/HijriDateWidget";
import { apiGet, isSupabaseMode } from "@/lib/services/api";

// ─── Types ─────────────────────────────────────────────────────────────────────
// The first eight are the demo vocabulary; the last four are what real
// request_events map to (see `describeRequestEvent` in src/lib/events.ts).
type ActivityType =
  |"hearing"|"task"|"document"|"ai"|"contract"|"client"|"case_update"|"deadline"
  |"order"|"delivery"|"cancelled"|"notice";

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  entityLabel?: string;
  entityHref?: string;
  timestamp: string; // display string
  timeAgo: string;   // e.g. "منذ ١٠ دقائق"
  dayGroup: "today"|"yesterday"|"this_week"|"older";
  caseId?: string;
  caseName?: string;
  user?: string;
  meta?: string;
}

// ─── Config ────────────────────────────────────────────────────────────────────
const ACTIVITY_CONFIG: Record<ActivityType,{icon:React.ElementType;label:string;color:string;bg:string}> = {
  hearing:     {icon:Gavel,        label:"جلسة قضائية",  color:"#6366f1", bg:"bg-indigo-500/10"},
  task:        {icon:CheckCircle,  label:"مهمة",          color:"#10b981", bg:"bg-emerald-500/10"},
  document:    {icon:FileText,     label:"مستند",         color:"#3b82f6", bg:"bg-blue-500/10"},
  ai:          {icon:Robot,        label:"ذكاء اصطناعي",  color:"#C8A762", bg:"bg-amber-500/10"},
  contract:    {icon:Receipt,      label:"عقد",           color:"#ec4899", bg:"bg-pink-500/10"},
  client:      {icon:User,         label:"موكل",          color:"#8b5cf6", bg:"bg-violet-500/10"},
  case_update: {icon:Scales,       label:"قضية",          color:"#0ea5e9", bg:"bg-sky-500/10"},
  deadline:    {icon:Warning,      label:"ميعاد",         color:"#ef4444", bg:"bg-red-500/10"},
  order:       {icon:ClipboardText,label:"طلب",           color:"#C8A762", bg:"bg-amber-500/10"},
  delivery:    {icon:Package,      label:"تسليم",         color:"#10b981", bg:"bg-emerald-500/10"},
  cancelled:   {icon:XCircle,      label:"ملغى",          color:"#ef4444", bg:"bg-red-500/10"},
  notice:      {icon:Bell,         label:"إشعار",         color:"#0ea5e9", bg:"bg-sky-500/10"},
};

// ─── Mock Activity Data ────────────────────────────────────────────────────────
const MOCK_ACTIVITIES: Activity[] = [
  // ── Today ──
  {id:"a1",type:"hearing",title:"حضرت جلسة استماع — نزاع تجاري",description:"تم حضور الجلسة وتدوين المحضر",entityLabel:"نزاع تجاري — الأفق",entityHref:"/dashboard/lawyer/cases/1",timestamp:"٩:٣٠ ص",timeAgo:"منذ ساعتين",dayGroup:"today",caseId:"1",caseName:"نزاع تجاري — الأفق",user:"أ. فيد العتيبي"},
  {id:"a2",type:"ai",title:"استخدام الصائغ القانوني",description:"تم صياغة لائحة اعتراضية باستخدام الذكاء الاصطناعي",entityLabel:"الصائغ القانوني",entityHref:"/ai/draft",timestamp:"٨:١٥ ص",timeAgo:"منذ ٣ ساعات",dayGroup:"today",caseName:"نزاع تجاري — الأفق"},
  {id:"a3",type:"task",title:"أكملت مهمة: مراجعة مذكرة الخبير",description:"تمت مراجعة مذكرة الخبير وإرسالها للموكل",entityLabel:"مهامي",entityHref:"/dashboard/lawyer/tasks",timestamp:"٧:٤٥ ص",timeAgo:"منذ ٤ ساعات",dayGroup:"today",caseId:"1",caseName:"نزاع تجاري — الأفق"},
  {id:"a4",type:"document",title:"رُفع مستند: تقرير الخبير الهندسي",description:"تم رفع تقرير الخبير على النظام",entityLabel:"المستندات",entityHref:"/dashboard/lawyer/documents",timestamp:"٧:٠٠ ص",timeAgo:"منذ ٥ ساعات",dayGroup:"today",caseId:"1"},

  // ── Yesterday ──
  {id:"a5",type:"case_update",title:"تحديث القضية: استئناف العقار ٢١٣",description:"تم إضافة مستجدات الاستئناف وتحديث الحالة",entityLabel:"قضية ٢١٣",entityHref:"/dashboard/lawyer/cases/2",timestamp:"٣:٠٠ م",timeAgo:"أمس",dayGroup:"yesterday",caseId:"2",caseName:"استئناف العقار ٢١٣"},
  {id:"a6",type:"ai",title:"استشارة المرشد القضائي",description:'سُئل عن "رقم الدائرة التجارية الأولى"',entityLabel:"المرشد القضائي",entityHref:"/ai/procedures",timestamp:"١:٣٠ م",timeAgo:"أمس",dayGroup:"yesterday"},
  {id:"a7",type:"deadline",title:"ميعاد وشيك: آخر موعد طعن — استئناف العقار",description:"تم تسجيل تحذير: يتبقى يوم واحد فقط",entityLabel:"جلساتي",entityHref:"/dashboard/lawyer/hearings",timestamp:"١٢:٠٠ م",timeAgo:"أمس",dayGroup:"yesterday",caseId:"4"},
  {id:"a8",type:"client",title:"إضافة موكل جديد: ريم المطيري",description:"تم إضافة الموكلة وربطها بقضية الطلاق والحضانة",entityLabel:"الموكلين",entityHref:"/dashboard/lawyer/clients",timestamp:"١٠:٠٠ ص",timeAgo:"أمس",dayGroup:"yesterday"},

  // ── This week ──
  {id:"a9",type:"contract",title:"تم توثيق عقد: إيجار الأفلاج",description:"وُقّع العقد في كتابة العدل وتم رفع النسختين",entityLabel:"مدير العقود",entityHref:"/dashboard/lawyer/contracts",timestamp:"الأربعاء ١١:٠٠ ص",timeAgo:"منذ يومين",dayGroup:"this_week",caseName:"عقد إيجار — الأفلاج"},
  {id:"a10",type:"ai",title:"صياغة عقد باستخدام الذكاء الاصطناعي",description:"تم صياغة عقد شراكة للطرف الثاني بناءً على النموذج القانوني",entityLabel:"صائغ العقود",entityHref:"/ai/contracts",timestamp:"الثلاثاء ٤:٠٠ م",timeAgo:"منذ ٣ أيام",dayGroup:"this_week"},
  {id:"a11",type:"document",title:"رُفع مستند: كشف حساب بنكي — القحطاني",description:"تم رفع كشف الحساب لدعم قضية العمالية",entityLabel:"المستندات",entityHref:"/dashboard/lawyer/documents",timestamp:"الثلاثاء ١٠:٣٠ ص",timeAgo:"منذ ٣ أيام",dayGroup:"this_week",caseId:"3"},
  {id:"a12",type:"task",title:"أضفت مهمة جديدة: تجديد الاشتراك في النظام",entityLabel:"مهامي",entityHref:"/dashboard/lawyer/tasks",timestamp:"الإثنين ٩:٠٠ ص",timeAgo:"منذ ٤ أيام",dayGroup:"this_week"},

  // ── Older ──
  {id:"a13",type:"hearing",title:"حضرت جلسة: فسخ عقد إيجار — الزاهد",description:"جلسة الاستماع الأولى — تم تقديم دفع الشكل",entityLabel:"قضية الزاهد",entityHref:"/dashboard/lawyer/cases/5",timestamp:"١٥ مارس",timeAgo:"منذ ٣ أسابيع",dayGroup:"older",caseName:"فسخ إيجار — الزاهد"},
  {id:"a14",type:"case_update",title:"فتح قضية جديدة: نزاع تجاري — شركة الأفق",entityLabel:"نزاع تجاري",entityHref:"/dashboard/lawyer/cases/1",timestamp:"١ مارس",timeAgo:"منذ شهر",dayGroup:"older",caseId:"1"},
];

// Filter chips read as plurals; the row badge stays singular. Types absent
// here fall back to their badge label.
const TYPE_FILTER_LABELS: Partial<Record<ActivityType,string>> = {
  hearing:"جلسات", task:"مهام", document:"مستندات", ai:"ذكاء اصطناعي",
  contract:"عقود", deadline:"مواعيد", client:"موكلين", case_update:"قضايا",
  order:"طلبات", delivery:"تسليمات", cancelled:"ملغاة", notice:"إشعارات",
};

const DAY_GROUP_LABELS: Record<string,string> = {
  today:"اليوم",
  yesterday:"أمس",
  this_week:"هذا الأسبوع",
  older:"أقدم",
};

// ─── Stats ─────────────────────────────────────────────────────────────────────
// Demo showcase values only — never shown in supabase mode.
const STATS = [
  {label:"إجراء هذا الشهر",value:"٢٨",icon:Clock,         color:"text-[#C8A762]",  bg:"bg-amber-500/10"},
  {label:"استخدامات AI",   value:"١٢",icon:Robot,          color:"text-indigo-400", bg:"bg-indigo-500/10"},
  {label:"مواعيد اليوم",   value:"٣", icon:CalendarBlank,  color:"text-red-400",    bg:"bg-red-500/10"},
  {label:"مهام مكتملة",   value:"٩", icon:CheckCircle,    color:"text-emerald-400",bg:"bg-emerald-500/10"},
];

// Supabase-mode cards. Each one is an exact head-count the route already runs,
// so every label says precisely what is being counted. The demo pair
// «استخدامات AI» / «مواعيد اليوم» has no honest equivalent here — AI tool usage
// isn't recorded anywhere this route can read, and this user's appointments
// live in `consultations` keyed by lawyer, not by requester — so they are
// replaced rather than faked.
const LIVE_STATS = [
  {key:"ordersThisMonth" as const,label:"طلبات هذا الشهر",  icon:Clock,         color:"text-[#C8A762]",  bg:"bg-amber-500/10"},
  {key:"ordersActive"    as const,label:"طلبات قيد التنفيذ",icon:ClipboardText, color:"text-blue-400",   bg:"bg-blue-500/10"},
  {key:"ordersCompleted" as const,label:"طلبات مكتملة",     icon:CheckCircle,   color:"text-emerald-400",bg:"bg-emerald-500/10"},
  {key:"ordersTotal"     as const,label:"إجمالي طلباتي",    icon:FileText,      color:"text-violet-400", bg:"bg-violet-500/10"},
];

// ─── Live feed shape (GET /api/v1/lawyer/activity) ─────────────────────────────
interface ActivityApiItem {
  id: string;
  badge: ActivityType;
  title: string;        // already Arabic — the route never returns raw tokens
  description?: string;
  requestId: string | null;
  requestHref: string | null;   // null when the request has no page to open
  requestTitle: string | null;
  serviceTitleAr: string | null;
  createdAt: string;
}

interface ActivityStats {
  ordersThisMonth: number;
  ordersActive: number;
  ordersCompleted: number;
  ordersTotal: number;
}

interface ActivityApiResponse {
  items: ActivityApiItem[];
  stats: ActivityStats | null;
  nextCursor: string | null;
}

// ─── Formatting helpers ────────────────────────────────────────────────────────
/** Arabic-Indic digits, matching the demo card values (٢٨ / ١٢ / ٣ / ٩). */
const arNum = (n:number) => n.toLocaleString("ar-EG");

const RELATIVE_AR = new Intl.RelativeTimeFormat("ar",{numeric:"auto"});

/** "منذ ٣ ساعات" / "أمس" — the feed used to hardcode this to an empty string. */
function relativeTimeAr(iso:string):string{
  const mins = Math.round((Date.now()-new Date(iso).getTime())/60000);
  if(mins<1)  return "الآن";
  if(mins<60) return RELATIVE_AR.format(-mins,"minute");
  const hours = Math.round(mins/60);
  if(hours<24) return RELATIVE_AR.format(-hours,"hour");
  const days = Math.round(hours/24);
  if(days<30) return RELATIVE_AR.format(-days,"day");
  const months = Math.round(days/30);
  if(months<12) return RELATIVE_AR.format(-months,"month");
  return RELATIVE_AR.format(-Math.round(months/12),"year");
}

/**
 * Which day bucket a timestamp falls in. Compared at local midnight (and via a
 * rounded day difference) so a DST shift can't push an item into the wrong
 * group — the feed used to stamp every real row "today".
 */
function dayGroupOf(iso:string):Activity["dayGroup"]{
  const midnight = (d:Date) => new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  const diff = Math.round((midnight(new Date())-midnight(new Date(iso)))/86_400_000);
  if(diff<=0) return "today";
  if(diff===1) return "yesterday";
  if(diff<7)  return "this_week";
  return "older";
}

function toActivity(d:ActivityApiItem):Activity{
  const when = new Date(d.createdAt);
  const dayGroup = dayGroupOf(d.createdAt);
  return {
    id: d.id,
    type: d.badge,
    title: d.title,
    description: d.description,
    // The request id was already in hand and thrown away — the row now opens
    // the order page lawyers already reach from /ai/orders. The route only
    // hands back an href when the request actually has one.
    entityLabel: "عرض الطلب",
    entityHref: d.requestHref ?? undefined,
    timestamp: dayGroup==="today"||dayGroup==="yesterday"
      ? when.toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit"})
      : when.toLocaleDateString("ar-SA",{day:"numeric",month:"long"}),
    timeAgo: relativeTimeAr(d.createdAt),
    dayGroup,
    caseId: d.requestId ?? undefined,
    // The title already carries the Arabic service name, so the subtitle shows
    // the order's own title only when it adds something.
    caseName: d.requestTitle && d.requestTitle!==d.serviceTitleAr ? d.requestTitle : undefined,
  };
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function ActivityLogPage() {
  const {isDark} = useTheme();
  const [search,setSearch] = useState("");
  const [typeFilter,setTypeFilter] = useState<ActivityType|"all">("all");
  const [dayFilter,setDayFilter] = useState<"all"|"today"|"yesterday"|"this_week"|"older">("all");
  const [showFilters,setShowFilters] = useState(false);
  // In supabase mode start from [] so an empty feed shows the honest empty state
  // (no invented history); demo mode keeps MOCK_ACTIVITIES for the showcase.
  const [activities, setActivities] = useState<Activity[]>(isSupabaseMode ? [] : MOCK_ACTIVITIES);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Fetch the real feed; in supabase mode an empty result stays empty. Demo
  // mode never calls the API at all, so MOCK_ACTIVITIES stands untouched.
  useEffect(() => {
    if (!isSupabaseMode) return;
    let cancelled = false;
    apiGet<ActivityApiResponse>("/api/v1/lawyer/activity")
      .then((res) => {
        if (cancelled) return;
        setActivities((res.items ?? []).map(toActivity));
        setStats(res.stats);
        setCursor(res.nextCursor);
      })
      .catch(() => {
        // honest empty state — no invented history
      });
    return () => { cancelled = true; };
  }, []);

  // "تحميل أنشطة أقدم" — pages backwards on the createdAt of the last row held.
  const loadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    apiGet<ActivityApiResponse>("/api/v1/lawyer/activity", { before: cursor })
      .then((res) => {
        setActivities((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...(res.items ?? []).filter((i) => !seen.has(i.id)).map(toActivity)];
        });
        setCursor(res.nextCursor);
      })
      // a failed page retires the button rather than leaving it looping
      .catch(() => setCursor(null))
      .finally(() => setLoadingMore(false));
  };

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = useMemo(()=>{
    let acts = activities;
    if(dayFilter!=="all")  acts = acts.filter(a=>a.dayGroup===dayFilter);
    if(typeFilter!=="all") acts = acts.filter(a=>a.type===typeFilter);
    if(search.trim()){
      const q=search.toLowerCase();
      acts=acts.filter(a=>a.title.toLowerCase().includes(q)||a.description?.toLowerCase().includes(q)||a.caseName?.toLowerCase().includes(q));
    }
    return acts;
  },[activities,dayFilter,typeFilter,search]);

  // Group by day
  const grouped = useMemo(()=>{
    const groups: Record<string,Activity[]> = {};
    const order = ["today","yesterday","this_week","older"];
    filtered.forEach(a=>{
      if(!groups[a.dayGroup]) groups[a.dayGroup]=[];
      groups[a.dayGroup].push(a);
    });
    return order.filter(k=>groups[k]).map(k=>[k,groups[k]] as [string,Activity[]]);
  },[filtered]);

  // Only offer a chip for a type the feed actually contains — the vocabulary
  // now spans both the demo set and the live one, and listing all twelve would
  // hand the user ten filters that can only ever return nothing.
  const TYPE_OPTIONS = useMemo(()=>{
    const present = new Set(activities.map(a=>a.type));
    return [
      {key:"all" as ActivityType|"all", label:"الكل"},
      ...(Object.keys(ACTIVITY_CONFIG) as ActivityType[])
        .filter(t=>present.has(t))
        .map(t=>({key:t as ActivityType|"all", label:TYPE_FILTER_LABELS[t] ?? ACTIVITY_CONFIG[t].label})),
    ];
  },[activities]);

  // Demo keeps its showcase numbers; supabase mode shows the real counts, and
  // an em-dash only while they are still loading (or if the call failed).
  const statCards = isSupabaseMode
    ? LIVE_STATS.map(c=>({...c, value: stats ? arNum(stats[c.key]) : "—"}))
    : STATS;

  return (
    <div className="max-w-[900px] mx-auto space-y-6" dir="rtl">

      {/* بيانات تجريبية Banner (only in demo mode) */}
      {!isSupabaseMode && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 mb-5 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
            <Warning size={18} weight="fill" className="text-amber-500" />
          </div>
          <div>
            <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>بيانات تجريبية</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/60"}`}>تعمل المنصة في الوضع التجريبي — اضبط NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase لعرض سجل نشاطك الفعلي.</p>
          </div>
        </motion.div>
      )}


      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b dark:border-white/[0.06] border-slate-100">
        <div>
          <h1 className={`text-2xl font-bold flex items-center gap-2 mb-1 ${isDark?"text-white":"text-slate-800"}`} style={{fontFamily:"var(--font-brand)"}}>
            <Clock size={26} className="text-[#C8A762]" weight="duotone"/>
            سجل النشاط الموحد
          </h1>
          <p className={`text-sm ${isDark?"text-zinc-500":"text-slate-400"}`}>
            تتبع كافة أنشطتك — جلسات، مهام، استشارات AI، عقود، وموكلين
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <HijriDateWidget/>
          <button className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold border transition-colors ${isDark?"border-white/[0.06] text-zinc-400 hover:text-zinc-200":"border-slate-200 text-slate-500 hover:text-slate-700"}`}>
            <Download size={13}/>تصدير PDF
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((s,i)=>(
          <motion.div key={i} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
            className={`${card} p-4 flex items-center gap-3`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}`}>
              <s.icon size={18} weight="duotone" className={s.color}/>
            </div>
            <div>
              <p className={`text-xl font-black ${isDark?"text-white":"text-slate-800"}`}>{s.value}</p>
              <p className={`text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}>{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className={`${card} p-4 space-y-3`}>
        {/* Search + toggle */}
        <div className="flex items-center gap-2">
          <div className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-2xl border ${isDark?"border-white/[0.07] bg-zinc-800/60":"border-slate-200 bg-slate-50"}`}>
            <MagnifyingGlass size={14} className={isDark?"text-zinc-600":"text-slate-400"}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث في السجل..."
              className={`flex-1 text-sm bg-transparent outline-none ${isDark?"text-zinc-300 placeholder:text-zinc-600":"text-slate-700 placeholder:text-slate-400"}`}/>
            {search&&<button onClick={()=>setSearch("")} className={`${isDark?"text-zinc-600 hover:text-zinc-400":"text-slate-400 hover:text-slate-600"}`}><X size={13}/></button>}
          </div>
          <button onClick={()=>setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-2xl border text-[12px] font-semibold transition-colors ${showFilters?isDark?"border-[#C8A762]/30 bg-[#C8A762]/10 text-[#C8A762]":"border-amber-200 bg-amber-50 text-amber-700":isDark?"border-white/[0.07] text-zinc-400":"border-slate-200 text-slate-500"}`}>
            <FunnelSimple size={13}/> فلاتر
            <motion.span animate={{rotate:showFilters?180:0}} className="block"><CaretDown size={11}/></motion.span>
          </button>
        </div>

        <AnimatePresence>
          {showFilters&&(
            <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
              <div className="space-y-3 pt-1">
                {/* Day filter */}
                <div>
                  <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${isDark?"text-zinc-700":"text-slate-300"}`}>الفترة</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {[{k:"all",l:"الكل"},{k:"today",l:"اليوم"},{k:"yesterday",l:"أمس"},{k:"this_week",l:"هذا الأسبوع"},{k:"older",l:"أقدم"}].map(f=>(
                      <button key={f.k} onClick={()=>setDayFilter(f.k as typeof dayFilter)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${dayFilter===f.k?"bg-[#0B3D2E] text-white border-[#0B3D2E]":isDark?"border-white/[0.06] text-zinc-500 hover:text-zinc-300":"border-slate-200 text-slate-500"}`}>
                        {f.l}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Type filter */}
                <div>
                  <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${isDark?"text-zinc-700":"text-slate-300"}`}>النوع</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {TYPE_OPTIONS.map(f=>{
                      const cfg = f.key!=="all"?ACTIVITY_CONFIG[f.key as ActivityType]:null;
                      return (
                        <button key={f.key} onClick={()=>setTypeFilter(f.key as typeof typeFilter)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${typeFilter===f.key?"text-white border-transparent":isDark?"border-white/[0.06] text-zinc-500":"border-slate-200 text-slate-500"}`}
                          style={typeFilter===f.key&&cfg?{backgroundColor:cfg.color}:{}}>
                          {cfg&&<cfg.icon size={10}/>}{f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {grouped.length===0&&(
          <div className={`${card} p-12 text-center`}>
            <Archive size={36} weight="duotone" className={`mx-auto mb-3 ${isDark?"text-zinc-700":"text-slate-300"}`}/>
            <p className={`text-sm ${isDark?"text-zinc-500":"text-slate-400"}`}>لا توجد أنشطة مطابقة للبحث أو الفلتر المختار</p>
          </div>
        )}
        {grouped.map(([dayKey,activities])=>(
          <div key={dayKey}>
            {/* Day label */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`flex items-center gap-2`}>
                <div className={`w-2 h-2 rounded-full ${dayKey==="today"?"bg-emerald-500":dayKey==="yesterday"?"bg-amber-500":"bg-slate-400"}`}/>
                <h2 className={`text-[12px] font-black uppercase tracking-wider ${dayKey==="today"?isDark?"text-emerald-400":"text-emerald-600":isDark?"text-zinc-500":"text-slate-400"}`}>
                  {DAY_GROUP_LABELS[dayKey]}
                </h2>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isDark?"bg-white/[0.05] text-zinc-500":"bg-slate-100 text-slate-400"}`}>{activities.length}</span>
              </div>
              <div className={`flex-1 h-px ${isDark?"bg-white/[0.05]":"bg-slate-100"}`}/>
            </div>

            {/* Activity items */}
            <div className={`${card} divide-y ${isDark?"divide-white/[0.04]":"divide-slate-50"}`}>
              <AnimatePresence>
                {activities.map((act,i)=>{
                  // Fall back rather than crash if a future event maps to a
                  // badge this page doesn't know yet.
                  const cfg = ACTIVITY_CONFIG[act.type] ?? ACTIVITY_CONFIG.order;
                  const Icon = cfg.icon;
                  const rowClass = "flex items-start gap-4 px-4 py-3.5 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors";
                  // The whole row is the link now, so the entity label below is
                  // a plain span — a Link nested inside a Link is invalid.
                  const row = (
                    <>
                      {/* Icon */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bg}`}>
                        <Icon size={16} weight="duotone" style={{color:cfg.color}}/>
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{backgroundColor:`${cfg.color}18`,color:cfg.color}}>
                                {cfg.label}
                              </span>
                              {act.caseName&&(
                                <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{act.caseName}</span>
                              )}
                            </div>
                            <p className={`text-[13px] font-semibold leading-snug ${isDark?"text-zinc-200":"text-slate-800"}`}>{act.title}</p>
                            {act.description&&(
                              <p className={`text-[12px] mt-0.5 ${isDark?"text-zinc-500":"text-slate-400"}`}>{act.description}</p>
                            )}
                            {act.entityHref&&(
                              <span className={`inline-flex items-center gap-1 mt-1 text-[11px] font-semibold ${isDark?"text-zinc-600":"text-slate-400"}`}>
                                {act.entityLabel}<ArrowSquareOut size={9}/>
                              </span>
                            )}
                          </div>
                          <div className="text-start flex-shrink-0">
                            <p className={`text-[11px] font-mono ${isDark?"text-zinc-600":"text-slate-400"}`}>{act.timeAgo}</p>
                            <p className={`text-[10px] ${isDark?"text-zinc-700":"text-slate-300"}`}>{act.timestamp}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                  return (
                    <motion.div key={act.id}
                      initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} exit={{opacity:0}}
                      transition={{delay:i*0.03}}>
                      {act.entityHref
                        ? <Link href={act.entityHref} className={rowClass}>{row}</Link>
                        : <div className={rowClass}>{row}</div>}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      {/* Load more — only when the API says there is another page. Demo mode
          has no server to page against, so the button stays hidden there. */}
      {cursor&&(
        <div className="text-center pb-4">
          <button onClick={loadMore} disabled={loadingMore}
            className={`px-6 py-2.5 rounded-2xl text-[12px] font-semibold border transition-colors disabled:opacity-50 ${isDark?"border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.12]":"border-slate-200 text-slate-400 hover:text-slate-600"}`}>
            {loadingMore?"جارٍ التحميل...":"تحميل أنشطة أقدم"}
          </button>
        </div>
      )}
    </div>
  );
}
