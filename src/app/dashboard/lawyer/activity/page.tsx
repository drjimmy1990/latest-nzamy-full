"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, Robot, Gavel, CheckCircle, FileText, Receipt,
  User, Scales, ChatCircle, ArrowSquareOut, MagnifyingGlass,
  CalendarBlank, Warning, Archive, X,
  FunnelSimple, CaretDown, ClipboardText, Package, XCircle, Bell,
  ArrowClockwise, CircleNotch,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import HijriDateWidget from "@/components/HijriDateWidget";
import { apiGet, isSupabaseMode } from "@/lib/services/api";
import { listFailed, listOk, listViewState } from "@/lib/services/listRead";

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

// ─── Card filters ──────────────────────────────────────────────────────────────
/** The four toggleable cards. Same keys the route counts in `stats`. */
type StatKey = typeof LIVE_STATS[number]["key"];

/**
 * Every card counts SERVICE REQUESTS (orders); every feed row is a REQUEST
 * EVENT. One order emits many events, so a card filter can only ever mean
 * "the events belonging to the orders this card counts" — never "this many
 * rows". Worse, the feed payload carries no order status at all (the route
 * reads `service_requests.status` and drops it, and `badge` is a lossy
 * projection of the raw event token — a claimed-then-delivered order has BOTH
 * a `task` row and a `delivery` row). So the badge cannot stand in for status.
 *
 * The order index closes that gap honestly: one extra read of the caller's own
 * `service_requests` gives `id → {status, createdAt}`, which is the exact
 * ground truth the route counted server-side. It is used ONLY to decide
 * membership — the numbers on the cards stay the server's, never recomputed
 * here, so the two can't drift apart.
 */
interface OrderFacts { status: string; createdAt: string }
type OrderIndex = Map<string, OrderFacts>;

/** Mirrors the `activeRes` head-count in the route — keep the two in step. */
const ACTIVE_ORDER_STATUSES = new Set(["pending_assignment", "assigned", "in_review"]);

/** Same boundary the route uses for `ordersThisMonth` (local first-of-month). */
function monthStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/**
 * Does this row belong to an order the given card counts? Rows with no
 * `requestId` (admin-audit rows, and any request the route couldn't link) can
 * never belong to an order, so they match no card — including «إجمالي طلباتي».
 */
function matchesCardFilter(act: Activity, key: StatKey, index: OrderIndex): boolean {
  if (!act.caseId) return false;
  const order = index.get(act.caseId);
  if (!order) return false; // not visible to this caller — never guessed at
  switch (key) {
    case "ordersThisMonth": return new Date(order.createdAt).getTime() >= monthStartMs();
    case "ordersActive":    return ACTIVE_ORDER_STATUSES.has(order.status);
    case "ordersCompleted": return order.status === "completed";
    case "ordersTotal":     return true;
  }
}

// ─── Order index shape (GET /api/v1/service-requests) ──────────────────────────
interface OrderIndexRow { id: string; status: string; created_at: string }
interface OrderIndexResponse { data?: OrderIndexRow[]; total?: number; degraded?: boolean }

/**
 * One page big enough to hold every order a real practice has. If the account
 * has more than this the list comes back truncated, the index would silently
 * under-select, and the cards go inert instead of filtering to a wrong subset.
 */
const ORDER_INDEX_LIMIT = 400;

interface ActivityApiResponse {
  items: ActivityApiItem[];
  stats: ActivityStats | null;
  nextCursor: string | null;
  /**
   * The route's 200-with-an-empty-feed failure signal: the request_events query
   * errored, so `items` is a gap, not an absence. Same name and same meaning as
   * the flag GET /api/v1/service-requests already returns.
   */
  degraded?: boolean;
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
  // Which stat card is toggled on, and the id→{status,createdAt} index that
  // makes the four cards mean something. Null index = cards stay inert.
  const [cardFilter, setCardFilter] = useState<StatKey | null>(null);
  const [orderIndex, setOrderIndex] = useState<OrderIndex | null>(null);
  /**
   * THREE states, not two. This used to be a single `feedError` boolean, which
   * left «has not been read yet» and «was read and is empty» sharing one
   * rendering — and the empty one won, because `activities` starts `[]` and
   * `feedError` starts `false`. So the FIRST PAINT of this page, before the
   * fetch had even been issued, told every lawyer «لا يوجد نشاط مسجَّل بعد».
   * That is the same false statement as the failure case, just briefer: a
   * positive claim about the account, made with no answer from the server.
   *
   * Demo mode starts "ready" on purpose: it never calls the API at all and
   * MOCK_ACTIVITIES is already in state, so there is nothing to wait for.
   * `isSupabaseMode` is a module-level constant, so this branch is resolved at
   * build time. Same shape as dashboard/lawyer/tasks/page.tsx.
   */
  const [feedState, setFeedState] = useState<"loading" | "error" | "ready">(
    isSupabaseMode ? "loading" : "ready",
  );

  // Fetch the real feed; in supabase mode an empty result stays empty. Demo
  // mode never calls the API at all, so MOCK_ACTIVITIES stands untouched.
  const loadFeed = useCallback(async () => {
    if (!isSupabaseMode) return;
    try {
      const res = await apiGet<ActivityApiResponse>("/api/v1/lawyer/activity");
      // The stat cards are exact head-counts and survive a failed feed query,
      // so they are still shown; only the FEED is marked unreadable.
      setStats(res.stats);
      if (res.degraded) {
        setFeedState("error");
        setCursor(null);
        return;
      }
      setActivities((res.items ?? []).map(toActivity));
      setCursor(res.nextCursor);
      setFeedState("ready");
    } catch (err) {
      // Still no invented history — but now the page says the read failed
      // instead of telling the lawyer they have none.
      console.error("[activity] failed to load the feed:", err);
      setFeedState("error");
    }
  }, []);

  // Wrapped rather than a bare call so the fetch is not a synchronous call out
  // of the effect body.
  useEffect(() => { (async () => { await loadFeed(); })(); }, [loadFeed]);

  // The order index behind the card filters. Read once, in parallel with the
  // feed. Every failure mode ends the same way — index stays null and the
  // cards render as plain, unclickable cards — because a filter that quietly
  // drops rows is worse than no filter at all.
  useEffect(() => {
    if (!isSupabaseMode) return;
    let cancelled = false;
    apiGet<OrderIndexResponse>("/api/v1/service-requests", { limit: ORDER_INDEX_LIMIT })
      .then((res) => {
        if (cancelled) return;
        const rows = res.data ?? [];
        // `degraded: true` is the route's 200-with-empty-list failure signal,
        // and a `total` above what came back means the page was cut short.
        // Either way the index is incomplete — don't build one.
        if (res.degraded || (res.total ?? rows.length) > rows.length) return;
        const index: OrderIndex = new Map();
        for (const row of rows) {
          if (row?.id) index.set(row.id, { status: row.status, createdAt: row.created_at });
        }
        setOrderIndex(index);
      })
      .catch(() => {
        // cards stay inert
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

  /**
   * Stat-card chrome. Built here rather than appended to `card` because the
   * selected state overrides the SAME border-colour utility `card` sets, and
   * two competing utilities of equal specificity resolve by stylesheet order,
   * not by their position in the className string.
   *
   * Selected reads as brand gold in both themes: a solid #C8A762 border plus a
   * ring, over a tinted surface that is dark-on-dark and light-on-light. Note
   * no gray-50/100/200 anywhere — globals.css redefines those as dark
   * SURFACES, which would make the label unreadable in dark mode.
   */
  const statCardClass = (selected:boolean, interactive:boolean) => {
    const base = "rounded-2xl border p-4 flex items-center gap-3 w-full text-start transition-all";
    const shadow = isDark ? "" : " shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
    const focus = interactive
      ? " focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] focus-visible:ring-offset-0 cursor-pointer"
      : "";
    if (selected) {
      return `${base}${shadow}${focus} border-[#C8A762] ring-1 ring-[#C8A762]/40 ${isDark?"bg-[#C8A762]/[0.08]":"bg-amber-50"}`;
    }
    const idle = isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-100 bg-white";
    const hover = interactive ? (isDark ? " hover:border-white/[0.14]" : " hover:border-amber-200") : "";
    return `${base}${shadow}${focus} ${idle}${hover}`;
  };

  // Every filter ANDs with every other — the card narrows the same list the
  // search box and the filter panel narrow.
  const filtered = useMemo(()=>{
    let acts = activities;
    if(cardFilter&&orderIndex) acts = acts.filter(a=>matchesCardFilter(a,cardFilter,orderIndex));
    if(dayFilter!=="all")  acts = acts.filter(a=>a.dayGroup===dayFilter);
    if(typeFilter!=="all") acts = acts.filter(a=>a.type===typeFilter);
    if(search.trim()){
      const q=search.toLowerCase();
      acts=acts.filter(a=>a.title.toLowerCase().includes(q)||a.description?.toLowerCase().includes(q)||a.caseName?.toLowerCase().includes(q));
    }
    return acts;
  },[activities,cardFilter,orderIndex,dayFilter,typeFilter,search]);

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

  /**
   * Which of the four states the timeline is in, decided by the shared helper
   * rather than by the order of the `&&` guards in the JSX below.
   *
   * WHY THE HELPER AND NOT A LOCAL TERNARY: `listViewState` is the one place in
   * the app that fixes the precedence — loading beats unreadable beats empty —
   * so the same read cannot be drawn as "empty" here and as "loading" on the
   * next screen. Getting that order wrong by hand is precisely what produced
   * the first-paint «لا يوجد نشاط مسجَّل بعد» this page used to show.
   *
   * WHY THE `ListRead` IS BUILT AT RENDER RATHER THAN HELD IN STATE: this feed
   * is cursor-paginated and `loadMore` APPENDS to `activities`, and the route
   * returns no count at all — so `total` is permanently null, `truncated`
   * permanently false, and `truncationNoticeAr` permanently null. Holding a
   * ListRead in state would carry two fields that can never say anything here
   * while making every append rebuild the envelope. The value of the contract
   * on this page is the state machine, and that is what is used.
   */
  const feedView = listViewState(
    feedState === "loading",
    feedState === "error" ? listFailed<Activity>() : listOk(activities),
  );

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
  //
  // `filterKey` is what makes a card clickable, and it is deliberately null
  // unless BOTH the count and the order index arrived: a card still reading
  // "—" has nothing to filter to, and without the index there is no honest
  // predicate. Demo cards are never clickable — STATS holds invented showcase
  // numbers (٢٨/١٢/٣/٩) with no relation whatsoever to MOCK_ACTIVITIES, so
  // clicking one could only ever contradict itself.
  const statCards: {label:string;value:string;icon:React.ElementType;color:string;bg:string;filterKey:StatKey|null}[] =
    isSupabaseMode
      ? LIVE_STATS.map(c=>({...c, value: stats?arNum(stats[c.key]):"—", filterKey: stats&&orderIndex?c.key:null}))
      : STATS.map(c=>({...c, filterKey:null}));

  // How much of the card's population the loaded feed can actually speak for.
  // The card number is the server's head-count over ALL the user's orders;
  // this counts the DISTINCT orders that card covers which have at least one
  // event in the pages loaded so far. They differ for two honest reasons —
  // older events not paged in yet, and orders that have no events at all — so
  // the gap is stated in the UI rather than papered over.
  const cardCoverage = useMemo(()=>{
    if(!cardFilter||!stats||!orderIndex) return null;
    const ids = new Set<string>();
    activities.forEach(a=>{ if(a.caseId&&matchesCardFilter(a,cardFilter,orderIndex)) ids.add(a.caseId); });
    return {shown:ids.size, total:stats[cardFilter]};
  },[cardFilter,stats,orderIndex,activities]);

  const activeCardLabel = cardFilter ? LIVE_STATS.find(c=>c.key===cardFilter)?.label ?? null : null;
  const anyFilterActive = cardFilter!==null||dayFilter!=="all"||typeFilter!=="all"||search.trim()!=="";
  const clearAllFilters = () => { setCardFilter(null); setDayFilter("all"); setTypeFilter("all"); setSearch(""); };

  // One chip per active filter — each clears just itself.
  const chipClass = isDark
    ? "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-white/[0.08] bg-white/[0.04] text-zinc-300"
    : "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200 bg-slate-50 text-slate-600";

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
          {/* «استشارات AI» was removed from this line on 2026-08-28, and «كافة»
              with it. Nothing in this feed is an AI usage record: every row is a
              `request_events` row on a service_request, and describeRequestEvent
              (src/lib/events.ts) has no AI badge at all — which is the same
              reason the «استخدامات AI» stat card was replaced rather than
              counted (see the note above LIVE_STATS). «كافة» went because the
              feed is scoped to the requests this user participates in, not to
              everything they do on the platform. The four that remain map to
              badges the route really emits: hearing / task / contract / client. */}
          <p className={`text-sm ${isDark?"text-zinc-500":"text-slate-400"}`}>
            تتبّع حركة طلباتك — جلسات، مهام، عقود، وموكلين
          </p>
        </div>
        {/* A «تصدير PDF» button stood here with no onClick and no handler
            anywhere — no export route, no PDF generator, nothing bound to it.
            It was a promise the platform cannot keep, on a page whose whole
            subject is an accurate record, so it is removed rather than wired
            to a stub. */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <HijriDateWidget/>
        </div>
      </div>

      {/* Stats — each live card is a toggle over the feed below */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((s,i)=>{
          const interactive = s.filterKey!==null;
          const selected = interactive && s.filterKey===cardFilter;
          const body = (
            <>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}`}>
                <s.icon size={18} weight="duotone" className={s.color}/>
              </div>
              <div className="min-w-0">
                <p className={`text-xl font-black ${isDark?"text-white":"text-slate-800"}`}>{s.value}</p>
                <p className={`text-[11px] truncate ${selected?"text-[#C8A762] font-semibold":isDark?"text-zinc-500":"text-slate-400"}`}>{s.label}</p>
              </div>
              {selected&&(
                <CheckCircle size={16} weight="fill" className="text-[#C8A762] flex-shrink-0 ms-auto"/>
              )}
            </>
          );
          // motion.button rather than a div with an onClick: focus, Enter and
          // Space come from the element itself, and aria-pressed is only valid
          // on a real button.
          return interactive ? (
            <motion.button key={s.label} type="button"
              initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
              aria-pressed={selected}
              // Clicking the active card clears it — same toggle both ways.
              onClick={()=>setCardFilter(prev=>prev===s.filterKey?null:s.filterKey)}
              title={selected?`إلغاء الفلتر: ${s.label}`:`عرض أنشطة: ${s.label}`}
              className={statCardClass(selected,true)}>
              {body}
            </motion.button>
          ) : (
            <motion.div key={s.label} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
              className={statCardClass(false,false)}>
              {body}
            </motion.div>
          );
        })}
      </div>

      {/* The cards read «—» in two different situations and only one of them is
          temporary: `stats` is null before the first answer arrives, and null
          again when the route could not count (it now returns `stats: null`
          rather than flooring a failed head-count to «٠» — see its
          `countsFailed` note). Once the read has settled, a null is a failure,
          and «—» on its own does not say so. Not shown in demo mode, which
          never calls the route at all. */}
      {isSupabaseMode && feedState!=="loading" && stats===null && (
        <div className={`rounded-xl px-3 py-2 text-[11px] leading-relaxed border ${isDark?"border-amber-500/20 bg-amber-900/10 text-amber-400":"border-amber-200 bg-amber-50 text-amber-700"}`}>
          تعذّر احتساب أرقام البطاقات أعلاه. علامة «—» تعني أن العدد غير معروف الآن، لا أنه صفر.
        </div>
      )}

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

        {/* Active filters — the card toggle, the panel and the search box all
            land here, so there is one place that shows what is narrowing the
            feed and one button that clears every one of them. */}
        {anyFilterActive&&(
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[9px] font-black uppercase tracking-widest ${isDark?"text-zinc-600":"text-slate-400"}`}>الفلاتر النشطة</span>
            {activeCardLabel&&(
              <button onClick={()=>setCardFilter(null)} className={chipClass}>
                {activeCardLabel}<X size={9}/>
              </button>
            )}
            {dayFilter!=="all"&&(
              <button onClick={()=>setDayFilter("all")} className={chipClass}>
                {DAY_GROUP_LABELS[dayFilter]}<X size={9}/>
              </button>
            )}
            {typeFilter!=="all"&&(
              <button onClick={()=>setTypeFilter("all")} className={chipClass}>
                {TYPE_FILTER_LABELS[typeFilter as ActivityType]??ACTIVITY_CONFIG[typeFilter as ActivityType].label}<X size={9}/>
              </button>
            )}
            {search.trim()&&(
              <button onClick={()=>setSearch("")} className={chipClass}>
                «{search.trim()}»<X size={9}/>
              </button>
            )}
            <button onClick={clearAllFilters}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${isDark?"border-[#C8A762]/30 text-[#C8A762] hover:bg-[#C8A762]/10":"border-amber-300 text-amber-700 hover:bg-amber-50"}`}>
              مسح الكل
            </button>
          </div>
        )}

        {/* The card counts orders; the feed lists events on those orders, and
            only the pages loaded so far. Say so instead of letting the two
            numbers quietly disagree. */}
        {cardCoverage&&cardCoverage.shown<cardCoverage.total&&(
          <div className={`rounded-xl px-3 py-2 text-[11px] leading-relaxed border ${isDark?"border-white/[0.07] bg-white/[0.03] text-zinc-400":"border-slate-200 bg-slate-50 text-slate-500"}`}>
            يعرض السجل أنشطة {arNum(cardCoverage.shown)} من أصل {arNum(cardCoverage.total)} من «{activeCardLabel}».
            الرقم على البطاقة يُحتسب على الخادم لكامل طلباتك، بينما يعرض السجل الأحداث المحمَّلة فقط
            {cursor?" — استخدم «تحميل أنشطة أقدم» في الأسفل لعرض المزيد.":" — بقية الطلبات لا تحمل أنشطة مسجَّلة."}
          </div>
        )}

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
        {/* FOUR renderings, one per state of `feedView`, and no two of them can
            overlap because they all read the same value.

            «لا يوجد نشاط مسجَّل بعد» is a positive claim about this lawyer's
            account, and it used to be printed for three completely different
            facts: a read that failed, a read that had not happened yet, and a
            genuinely empty history. A fourth nothing — a feed whose rows the
            current filters excluded — is recoverable and says so. */}
        {feedView==="loading"&&(
          <div className={`${card} p-12 text-center`}>
            <CircleNotch size={28} weight="bold" className={`mx-auto mb-3 animate-spin ${isDark?"text-zinc-700":"text-slate-300"}`}/>
            <p className={`text-sm ${isDark?"text-zinc-500":"text-slate-400"}`}>جارٍ تحميل سجل نشاطك…</p>
          </div>
        )}
        {feedView==="unreadable"&&(
          <div className={`${card} p-8 text-center`}>
            <Warning size={32} weight="fill" className="mx-auto mb-3 text-red-500"/>
            <p className={`text-sm font-semibold ${isDark?"text-red-400":"text-red-700"}`}>تعذّر قراءة سجل النشاط</p>
            <p className={`text-[12px] mt-1 ${isDark?"text-zinc-500":"text-slate-500"}`}>
              هذه ليست قائمة فارغة — لم نتمكّن من قراءة سجلك، وقد تكون هناك حركة لا تظهر هنا الآن.
              {stats!==null&&" الأرقام في البطاقات أعلاه صحيحة ومقروءة من الخادم."}
            </p>
            {/* Back to "loading" first, so the retry shows the spinner rather
                than leaving the failure panel up while the refetch runs. */}
            <button onClick={()=>{ setFeedState("loading"); void loadFeed(); }}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold bg-red-500 text-white hover:bg-red-600 transition">
              <ArrowClockwise size={12} weight="bold"/>إعادة المحاولة
            </button>
          </div>
        )}
        {feedView==="empty"&&(
          <div className={`${card} p-12 text-center`}>
            <Archive size={36} weight="duotone" className={`mx-auto mb-3 ${isDark?"text-zinc-700":"text-slate-300"}`}/>
            <p className={`text-sm font-semibold ${isDark?"text-zinc-400":"text-slate-500"}`}>لا يوجد نشاط مسجَّل بعد</p>
            <p className={`text-[12px] mt-1 ${isDark?"text-zinc-600":"text-slate-400"}`}>ستظهر هنا حركة طلباتك ومواعيدك فور بدء العمل عليها.</p>
          </div>
        )}
        {feedView==="ready"&&grouped.length===0&&(
          <div className={`${card} p-12 text-center`}>
            <Archive size={36} weight="duotone" className={`mx-auto mb-3 ${isDark?"text-zinc-700":"text-slate-300"}`}/>
            <p className={`text-sm font-semibold ${isDark?"text-zinc-400":"text-slate-500"}`}>لا توجد أنشطة مطابقة للفلتر</p>
            <p className={`text-[12px] mt-1 ${isDark?"text-zinc-600":"text-slate-400"}`}>
              السجل يحتوي على {arNum(activities.length)} نشاطًا، لكن لا شيء منها يطابق الفلاتر الحالية.
            </p>
            <button onClick={clearAllFilters}
              className={`mt-4 px-4 py-2 rounded-xl text-[11px] font-bold border transition-colors ${isDark?"border-[#C8A762]/30 text-[#C8A762] hover:bg-[#C8A762]/10":"border-amber-300 text-amber-700 hover:bg-amber-50"}`}>
              مسح كل الفلاتر
            </button>
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
