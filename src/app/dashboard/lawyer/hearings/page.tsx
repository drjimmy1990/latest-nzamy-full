"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarCheck, Clock, MapPin, Gavel, Plus, Warning,
  CheckCircle, FileText, Buildings, Receipt,
  MagnifyingGlass, Star, CheckSquare,
  Hourglass, CaretRight, CaretLeft, X,
  User, ArrowRight, List, CalendarBlank,
  ArrowSquareOut, Scales, ArrowClockwise, CircleNotch,
} from "@phosphor-icons/react";

// ─── Hijri day label ──────────────────────────────────────────────────────────
// This page used to carry its own tabular-Hijri conversion. It was a JS port of
// a C routine that relies on truncation toward zero, and `Math.floor` is not
// that for the negative `(m-14)/12` term, so the Julian day was wrong for most
// months: it disagreed with the app's own Hijri chip on 674 of 730 consecutive
// days, and with the Umm al-Qura calendar — the one Saudi courts file against —
// on 314 of 400.
//
// Intl's `islamic-umalqura` calendar IS Umm al-Qura, so this asks the platform
// instead of re-deriving it. `en-u-ca-islamic-umalqura` + formatToParts is
// deliberate: `ar-SA` resolves to different calendars across ICU builds, and
// reading the `day` PART gives a plain number rather than a localized numeral
// that would have to be parsed back.
//
// No timeZone is set on purpose — the Date passed in is built at LOCAL midnight
// (`new Date(calYear, calMonth, day)`), so it must be read back in the local
// zone or a UTC+3 reader would see the previous day.
//
// If the runtime has no Umm al-Qura data the label is omitted entirely rather
// than filled with an approximation: a wrong Hijri date under a hearing is worse
// than no Hijri date.
const HIJRI_DAY_FORMAT: Intl.DateTimeFormat | null = (() => {
  try {
    const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric" });
    // Verify the runtime honoured the request instead of silently falling back
    // to Gregorian, which would print the Gregorian day under a "هـ" suffix.
    return fmt.resolvedOptions().calendar === "islamic-umalqura" ? fmt : null;
  } catch {
    return null;
  }
})();

function hijriDayLabel(gDate: Date): string | null {
  if (!HIJRI_DAY_FORMAT) return null;
  try {
    return HIJRI_DAY_FORMAT.formatToParts(gDate).find(part => part.type === "day")?.value ?? null;
  } catch {
    return null;
  }
}
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { getWorkflowRequestsByReceiver } from "@/lib/services/workflowService";
import { apiGet, isSupabaseMode } from "@/lib/services/api";
import type { WorkflowRequest } from "@/lib/workflowStore";
import { useUser } from "@/hooks/useUser";
import AddHearingModal from "../_components/AddHearingModal";

// ─── Types ─────────────────────────────────────────────────────────────────────
type EventType = "hearing"|"deadline"|"gov_review"|"notary"|"client_meet"|"court_collect"|"police"|"expert"|"contract"|"internal";
type ViewMode = "list"|"calendar";
interface WorkflowStep { label: string; done: boolean; }
interface CalEvent {
  id: string; type: EventType; title: string;
  client?: string; caseId?: string; caseName?: string;
  location?: string; date: string; dateSort: number;
  time?: string; urgency: "critical"|"high"|"normal";
  notes?: string; done?: boolean; deadlineDaysLeft?: number;
  workflow?: WorkflowStep[];
}

// ─── Workflow → Hearing mapper (L8) ───────────────────────────────────────────
// Derives a CalEvent from a WorkflowRequest using metadata fields stored by
// AddHearingModal (date/time/type/urgency/location/notes/caseName).
const VALID_EVENT_TYPES: EventType[] = ["hearing","deadline","gov_review","notary","client_meet","court_collect","police","expert","contract","internal"];
const VALID_URGENCIES: CalEvent["urgency"][] = ["critical","high","normal"];

function daysFromToday(dateStr: string): number | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr + "T00:00:00");
  if (isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parsed.getTime() - today.getTime()) / 86400000);
}

/**
 * A service_requests row → a calendar event, or null when the row is not one.
 *
 * `null` is the whole fix for this page. `service_requests` is where FOUR
 * different lawyer-owned shapes live, all with type="service" and
 * receiver="lawyer", told apart only by metadata: hearings (this modal),
 * tasks (`metadata.task`, /api/v1/lawyer/tasks), manually-added clients
 * (`metadata.client`, /api/v1/lawyer/clients) and cases (AddCaseModal). This
 * mapper used to accept all four and paper over the differences with defaults:
 * a missing `metadata.type` became `"hearing"` and a missing `metadata.date`
 * became `dateSort = 0`. Together those two defaults rendered every task, every
 * added client and every case as «جلسة قضائية» happening TODAY, counted in the
 * red «X موعد اليوم» header — a lawyer with five open tasks read five court
 * hearings on today's diary.
 *
 * The gate is the DATE, not a metadata marker, because that is what a calendar
 * actually requires and it does not depend on which writer happens to stamp
 * which key: a row with no parseable event date has no place on a diary at all.
 * Undated rows are dropped rather than parked in a bucket — AddHearingModal now
 * requires a date, so the only rows this can drop are the ones that were never
 * hearings.
 */
function workflowToHearing(request: WorkflowRequest): CalEvent | null {
  const meta = request.metadata ?? {};
  const dateStr = typeof meta.date === "string" ? meta.date : "";
  const dateSort = daysFromToday(dateStr);
  if (dateSort === null) return null;

  const rawType = typeof meta.type === "string" ? meta.type : "";
  // No default to "hearing". An unrecognised type is «مهمة داخلية» — the modal's
  // own «أخرى» option — because putting a court-hearing badge on a row whose
  // type we could not read is the same fabrication as inventing the row.
  const type: EventType = (VALID_EVENT_TYPES as string[]).includes(rawType) ? (rawType as EventType) : "internal";
  const rawUrgency = typeof meta.urgency === "string" ? meta.urgency : "";
  const urgency: CalEvent["urgency"] = (VALID_URGENCIES as string[]).includes(rawUrgency) ? (rawUrgency as CalEvent["urgency"]) : "normal";
  const isDone = request.status === "completed" || request.status === "cancelled";
  const caseName = typeof meta.caseName === "string" ? meta.caseName : undefined;
  return {
    id: request.id,
    type,
    title: request.title,
    client: request.requester.name || undefined,
    // NOTE: this makes the «القضية» chip link to /dashboard/lawyer/cases/<this
    // hearing's own id>, which is not a case. Left as-is deliberately — it is a
    // separate defect on a file this pass does not own to fix end-to-end, and
    // removing the chip would lose the only place the typed case name is shown.
    caseId: caseName ? request.id : undefined,
    caseName,
    location: typeof meta.location === "string" && meta.location ? meta.location : undefined,
    // Always the event's own date now. It used to fall back to the row's
    // CREATION date, rendered under a clock icon in the slot labelled as the
    // appointment time.
    date: dateStr,
    dateSort,
    time: typeof meta.time === "string" && meta.time ? meta.time : undefined,
    urgency,
    notes: typeof meta.notes === "string" && meta.notes ? meta.notes : undefined,
    done: isDone,
    workflow: undefined,
  };
}

// ─── Config ────────────────────────────────────────────────────────────────────
const EVENT_CONFIG: Record<EventType,{icon:React.ElementType;label:string;color:string}> = {
  hearing:       {icon:Gavel,       label:"جلسة قضائية",  color:"#6366f1"},
  deadline:      {icon:Warning,     label:"طعن / نهائي",  color:"#ef4444"},
  gov_review:    {icon:Buildings,   label:"مراجعة حكومية",color:"#f59e0b"},
  notary:        {icon:CheckSquare, label:"كتابة عدل",    color:"#10b981"},
  client_meet:   {icon:User,        label:"موعد موكل",    color:"#8b5cf6"},
  court_collect: {icon:FileText,    label:"استلام وثيقة", color:"#3b82f6"},
  police:        {icon:Star,        label:"مركز شرطة",    color:"#64748b"},
  expert:        {icon:Hourglass,   label:"خبير",         color:"#0ea5e9"},
  contract:      {icon:Receipt,     label:"توقيع عقد",    color:"#ec4899"},
  internal:      {icon:CheckSquare, label:"مهمة داخلية",  color:"#94a3b8"},
};

// How many of the lawyer's service_requests rows to read for the diary. The
// shared endpoint defaults to 20; production holds 29 rows across ALL accounts,
// so this is headroom, not a guess. `total` is checked against what came back so
// a lawyer who ever exceeds it is told rather than quietly shown a partial week.
const HEARINGS_FETCH_LIMIT = 200;

// ─── Linked Tasks Mini-DB (empty — will be populated from service) ─────────────
const LINKED_TASKS: Record<string,{id:string;title:string;done:boolean;priority:string}[]> = {};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const AR_DAYS  = ["أحد","إثن","ثلا","أرب","خمي","جمع","سبت"];

function getEventDate(dateSort: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dateSort);
  return d;
}

function googleCalUrl(ev: CalEvent): string {
  const start = getEventDate(Math.max(0, ev.dateSort));
  const yy = start.getFullYear();
  const mm = String(start.getMonth()+1).padStart(2,"0");
  const dd = String(start.getDate()).padStart(2,"0");
  const dateStr = `${yy}${mm}${dd}`;
  const details = [ev.notes||"", ev.client?`الموكل: ${ev.client}`:"", ev.caseName?`القضية: ${ev.caseName}`:"", "منصة نظامي القانونية"].filter(Boolean).join("\n");
  const p = new URLSearchParams({action:"TEMPLATE",text:ev.title,dates:`${dateStr}/${dateStr}`,details,location:ev.location||""});
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function groupByDate(events: CalEvent[]): [string,CalEvent[]][] {
  const deadlines = events.filter(e => e.type==="deadline");
  const rest = events.filter(e => e.type!=="deadline");
  const groups: Record<string,CalEvent[]> = {};
  rest.forEach(e => {
    const key = e.dateSort===0?"اليوم":e.dateSort===1?"غداً":e.dateSort<=5?"هذا الأسبوع":"هذا الشهر";
    if(!groups[key]) groups[key]=[];
    groups[key].push(e);
  });
  const order = ["اليوم","غداً","هذا الأسبوع","هذا الشهر"];
  const result: [string,CalEvent[]][] = order.filter(k=>groups[k]).map(k=>[k,groups[k].sort((a,b)=>a.dateSort-b.dateSort)]);
  if(deadlines.length) result.unshift(["مواعيد الطعون والنهائية",deadlines.sort((a,b)=>a.dateSort-b.dateSort)]);
  return result;
}

// ─── Smart Filter Pill ─────────────────────────────────────────────────────────
// Behavior: when value===options[0] ("الكل"), show ALL pills.
// When a specific value is active, collapse to just [active pill + X].
function FilterRow<T extends string>({
  options, value, onChange, isDark, colorMap
}: {
  options:{key:T;label:string;dot?:string}[];
  value:T; onChange:(v:T)=>void; isDark:boolean;
  colorMap?:Record<string,string>;
}) {
  const allKey = options[0].key as T;
  const isFiltered = value !== allKey;
  const active = options.find(o=>o.key===value);

  return (
    <div className="flex gap-2 flex-wrap items-center">
      <AnimatePresence mode="popLayout">
        {isFiltered ? (
          // Collapsed: only active pill with X
          <motion.button key="active-pill"
            layout initial={{opacity:0,scale:0.85}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.85}}
            onClick={()=>onChange(allKey)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold text-white transition-all shadow-sm"
            style={{backgroundColor: colorMap?.[value] || "#0B3D2E"}}>
            {active?.dot && <span className={`w-1.5 h-1.5 rounded-full ${active.dot}`} />}
            {active?.label}
            <X size={11} className="opacity-90" />
          </motion.button>
        ) : (
          // Expanded: show all options
          options.map(f=>(
            <motion.button key={f.key}
              layout initial={{opacity:0,scale:0.85}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.85}}
              onClick={()=>{ if(f.key !== allKey) onChange(f.key as T); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold border transition-all flex-shrink-0 ${
                value===f.key
                  ? f.key==="deadlines"?"bg-red-50 text-red-600 border-red-200":f.key==="archive"?"bg-amber-50 text-amber-600 border-amber-200":isDark?"bg-zinc-700 text-white border-transparent":"bg-[#0B3D2E]/5 text-[#0B3D2E] border-[#0B3D2E]/20"
                  : isDark?"border-white/[0.06] text-zinc-500 hover:text-zinc-300":"border-transparent text-slate-500 hover:bg-slate-50"
              }`}>
              {f.dot && <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} />}
              {f.label}
            </motion.button>
          ))
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── EventCard ─────────────────────────────────────────────────────────────────
function EventCard({ev,isDark}:{ev:CalEvent;isDark:boolean}) {
  const [open,setOpen] = useState(false);
  // ── Mutable local state so steps & linked tasks are interactive ──────────────
  const [steps, setSteps] = useState<WorkflowStep[]>(ev.workflow ?? []);
  const [linkedTasks, setLinkedTasks] = useState(
    ev.caseId ? (LINKED_TASKS[ev.caseId] ?? []) : []
  );

  const toggleStep = (i: number) =>
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, done: !s.done } : s));

  const toggleLinkedTask = (id: string) =>
    setLinkedTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));

  const cfg = EVENT_CONFIG[ev.type];
  const Icon = cfg.icon;
  const donePct = steps.length > 0 ? Math.round((steps.filter(s=>s.done).length / steps.length) * 100) : null;
  const isDeadline = ev.type==="deadline";
  const accentColor = ev.urgency==="critical"?"#ef4444":ev.urgency==="high"?"#f59e0b":cfg.color;
  const pendingCount = linkedTasks.filter(t=>!t.done).length;
  const calUrl = ev.dateSort>=0 ? googleCalUrl(ev) : null;

  return (
    <motion.div layout initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
      className={`relative rounded-2xl border overflow-hidden transition-all ${ev.done?"opacity-50":""}
        ${isDark?"bg-zinc-900/80 border-white/[0.07] hover:border-white/[0.12]":"bg-white border-slate-100 shadow-[0_2px_16px_-6px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_-6px_rgba(0,0,0,0.12)]"}
        ${isDeadline&&!ev.done&&ev.urgency==="critical"?isDark?"ring-1 ring-red-500/30":"ring-1 ring-red-400/30":""}`}>
      <div className="absolute right-0 top-0 bottom-0 w-1 rounded-r-2xl" style={{backgroundColor:accentColor}} />
      <div className="pr-4 pl-4 py-4 mr-1">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5" style={{backgroundColor:`${cfg.color}18`}}>
            <Icon size={17} weight="duotone" style={{color:cfg.color}} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md" style={{backgroundColor:`${cfg.color}18`,color:cfg.color}}>{cfg.label}</span>
              {isDeadline && ev.deadlineDaysLeft!==undefined && (
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${ev.deadlineDaysLeft===0?"bg-red-500 text-white animate-pulse":ev.deadlineDaysLeft<=3?"bg-red-500/10 text-red-500":ev.deadlineDaysLeft<=7?"bg-amber-500/10 text-amber-500":isDark?"bg-white/[0.06] text-zinc-400":"bg-slate-100 text-slate-500"}`}>
                  {ev.deadlineDaysLeft===0?"⚠ اليوم":`${ev.deadlineDaysLeft} يوم`}
                </span>
              )}
            </div>
            <p className={`text-[14px] font-bold leading-snug ${isDark?"text-zinc-100":"text-slate-800"}`}>{ev.title}</p>
            <div className="flex items-center flex-wrap gap-3 mt-1.5">
              <span className={`flex items-center gap-1 text-[11px] font-semibold ${ev.urgency==="critical"?"text-red-500":ev.urgency==="high"?"text-amber-500":isDark?"text-zinc-400":"text-slate-500"}`}>
                <Clock size={11} />{ev.date}{ev.time?` — ${ev.time}`:""}
              </span>
              {ev.location&&<span className={`flex items-center gap-1 text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}><MapPin size={11}/>{ev.location}</span>}
              {ev.client&&<span className={`flex items-center gap-1 text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}><User size={11}/>{ev.client}</span>}
            </div>
            {/* Links Row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {ev.caseId&&ev.caseName&&(
                <Link href={`/dashboard/lawyer/cases/${ev.caseId}`}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg transition-colors ${isDark?"bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20":"bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}>
                  <Scales size={9}/>{ev.caseName}<ArrowSquareOut size={8}/>
                </Link>
              )}
              {linkedTasks.length>0&&(
                <Link href="/dashboard/lawyer/tasks"
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg transition-colors ${isDark?"bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20":"bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}>
                  <CheckSquare size={9}/>{linkedTasks.length} مهام
                  {pendingCount>0&&<span className="bg-amber-500 text-white text-[8px] px-1 rounded-full">{pendingCount}</span>}
                  <ArrowSquareOut size={8}/>
                </Link>
              )}
              {calUrl&&(
                <a href={calUrl} target="_blank" rel="noopener noreferrer"
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg transition-colors ${isDark?"bg-blue-500/10 text-blue-400 hover:bg-blue-500/20":"bg-blue-50 text-blue-600 hover:bg-blue-100"}`}>
                  <CalendarBlank size={9}/>أضف لـ Google<ArrowSquareOut size={8}/>
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {donePct!==null&&(
              <div className="text-center">
                <div className={`text-[11px] font-black ${isDark?"text-zinc-400":"text-slate-600"}`}>{donePct}%</div>
                <svg width="32" height="32" className="-mt-0.5">
                  <circle cx="16" cy="16" r="13" fill="none" stroke={isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.05)"} strokeWidth="3"/>
                  <circle cx="16" cy="16" r="13" fill="none" stroke={accentColor} strokeWidth="3"
                    strokeDasharray={`${(donePct/100)*81.7} 81.7`} strokeLinecap="round" transform="rotate(-90 16 16)"
                    style={{transition:"stroke-dasharray 0.5s ease"}}/>
                </svg>
              </div>
            )}
            {ev.workflow&&(
              <button onClick={()=>setOpen(!open)}
                className={`p-2 rounded-xl transition-all ${isDark?"hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300":"hover:bg-slate-100 text-slate-400"}`}>
                <motion.span animate={{rotate:open?90:0}} transition={{duration:0.2}} className="block">
                  <CaretRight size={14}/>
                </motion.span>
              </button>
            )}
          </div>
        </div>

        {ev.notes&&(
          <div className={`mt-2 px-3 py-2 rounded-xl text-[12px] leading-relaxed ${ev.urgency==="critical"?isDark?"bg-red-500/10 text-red-400":"bg-red-50 text-red-600":ev.urgency==="high"?isDark?"bg-amber-500/10 text-amber-400":"bg-amber-50 text-amber-700":isDark?"bg-white/[0.04] text-zinc-500":"bg-slate-50 text-slate-500"}`}>
            {ev.notes}
          </div>
        )}

        {ev.workflow&&donePct!==null&&!open&&(
          <div className="mt-3">
            <div className={`h-1.5 rounded-full overflow-hidden ${isDark?"bg-zinc-800":"bg-slate-100"}`}>
              <div className="h-full rounded-full transition-all" style={{width:`${donePct}%`,backgroundColor:accentColor}}/>
            </div>
            <p className={`text-[10px] mt-1 ${isDark?"text-zinc-600":"text-slate-400"}`}>{ev.workflow.filter(s=>s.done).length}/{ev.workflow.length} خطوات مكتملة</p>
          </div>
        )}

        <AnimatePresence>
          {open&&ev.workflow&&(
            <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}}
              className="overflow-hidden mt-3 pt-3 border-t border-dashed">
              <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark?"text-zinc-600":"text-slate-400"}`}>خطوات العمل</p>
              <p className={`text-[10px] mb-2 ${isDark?"text-amber-400/70":"text-amber-600/70"}`}>ملاحظة: تعديل الخطوات مرئي فقط هذه الجلسة وغير محفوظ بعد — ربط خطوات الجلسة بقاعدة البيانات غير مفعَّل بعد.</p>
              <div className="space-y-1.5 mb-4">
                {steps.map((step, si) => (
                  <button key={si} onClick={() => toggleStep(si)}
                    className={`w-full flex items-center gap-2.5 py-1.5 px-2 rounded-xl text-start transition-all group/step ${
                      step.done
                        ? isDark ? "bg-emerald-500/10 hover:bg-emerald-500/15" : "bg-emerald-50 hover:bg-emerald-100"
                        : isDark ? "bg-white/[0.02] hover:bg-white/[0.05]" : "bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      step.done
                        ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                        : isDark ? "border border-zinc-600 group-hover/step:border-emerald-500/50" : "border border-slate-300 group-hover/step:border-emerald-400"
                    }`}>
                      {step.done && <CheckCircle size={10} weight="fill" className="text-white"/>}
                    </div>
                    <span className={`text-[12px] font-medium transition-all ${
                      step.done
                        ? isDark ? "text-emerald-400 line-through opacity-70" : "text-emerald-700 line-through opacity-70"
                        : isDark ? "text-zinc-300" : "text-slate-700"
                    }`}>{step.label}</span>
                  </button>
                ))}
              </div>
              {linkedTasks.length>0&&(
                <>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark?"text-zinc-600":"text-slate-400"}`}>المهام المرتبطة بهذه القضية</p>
                  <div className="space-y-1.5">
                    {linkedTasks.map(task => (
                      <button key={task.id} onClick={() => toggleLinkedTask(task.id)}
                        className={`w-full flex items-center gap-2.5 py-1.5 px-2 rounded-xl text-start transition-all group/ltask ${
                          task.done
                            ? isDark ? "opacity-50 bg-emerald-500/8 hover:opacity-70" : "opacity-60 bg-emerald-50 hover:opacity-80"
                            : task.priority==="urgent"
                              ? isDark ? "bg-red-500/10 hover:bg-red-500/15" : "bg-red-50 hover:bg-red-100"
                              : isDark ? "bg-white/[0.02] hover:bg-white/[0.05]" : "bg-slate-50 hover:bg-slate-100"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                          task.done
                            ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                            : task.priority==="urgent"
                              ? "border border-red-400 group-hover/ltask:border-red-500"
                              : task.priority==="high"
                                ? "border border-amber-400 group-hover/ltask:border-amber-500"
                                : isDark ? "border border-zinc-600 group-hover/ltask:border-emerald-500/50" : "border border-slate-300 group-hover/ltask:border-emerald-400"
                        }`}>
                          {task.done && <CheckCircle size={10} weight="fill" className="text-white"/>}
                        </div>
                        <span className={`text-[12px] font-medium flex-1 transition-all ${
                          task.done
                            ? isDark ? "text-emerald-400 line-through opacity-60" : "text-emerald-600 line-through opacity-60"
                            : task.priority==="urgent" ? "text-red-500" : isDark ? "text-zinc-300" : "text-slate-700"
                        }`}>{task.title}</span>
                        {!task.done && task.priority==="urgent" && <span className="text-[9px] font-black bg-red-500/15 text-red-500 px-1.5 py-0.5 rounded-full flex-shrink-0">عاجل</span>}
                      </button>
                    ))}
                  </div>
                  <Link href="/dashboard/lawyer/tasks" className={`mt-2 flex items-center gap-1 text-[11px] font-bold ${isDark?"text-zinc-500 hover:text-zinc-300":"text-slate-400 hover:text-slate-600"}`}>
                    <ArrowRight size={11}/> عرض كل المهام
                  </Link>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Calendar View ─────────────────────────────────────────────────────────────
function CalendarView({events,isDark}:{events:CalEvent[];isDark:boolean}) {
  const now = new Date();
  const [calYear,setCalYear] = useState(now.getFullYear());
  const [calMonth,setCalMonth] = useState(now.getMonth());
  const [selectedDay,setSelectedDay] = useState<number|null>(now.getDate());

  const firstDayOfMonth = new Date(calYear,calMonth,1).getDay();
  const daysInMonth = new Date(calYear,calMonth+1,0).getDate();

  const eventsByDay = useMemo(()=>{
    const map: Record<number,CalEvent[]> = {};
    events.forEach(ev=>{
      if(ev.dateSort>=0&&!ev.done){
        const d = getEventDate(ev.dateSort);
        if(d.getMonth()===calMonth&&d.getFullYear()===calYear){
          const day = d.getDate();
          if(!map[day]) map[day]=[];
          map[day].push(ev);
        }
      }
    });
    return map;
  },[events,calMonth,calYear]);

  const isToday = (d:number) => d===now.getDate()&&calMonth===now.getMonth()&&calYear===now.getFullYear();
  const selectedDayEvents = selectedDay?(eventsByDay[selectedDay]||[]):[];
  const cells: (number|null)[] = [];
  for(let i=0;i<firstDayOfMonth;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);

  const cardCls = isDark?"rounded-2xl border border-white/[0.06] bg-zinc-900/60":"rounded-2xl border border-slate-100 bg-white shadow-sm";

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4`}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={()=>{if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1);setSelectedDay(null);}}
            className={`p-2 rounded-xl ${isDark?"hover:bg-white/[0.08] text-zinc-400":"hover:bg-slate-100 text-slate-500"}`}>
            <CaretLeft size={15}/>
          </button>
          <h3 className={`text-[14px] font-bold ${isDark?"text-zinc-200":"text-slate-700"}`}>{AR_MONTHS[calMonth]} {calYear}</h3>
          <button onClick={()=>{if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1);setSelectedDay(null);}}
            className={`p-2 rounded-xl ${isDark?"hover:bg-white/[0.08] text-zinc-400":"hover:bg-slate-100 text-slate-500"}`}>
            <CaretRight size={15}/>
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {AR_DAYS.map(d=><div key={d} className={`text-center text-[10px] font-black py-1 ${isDark?"text-zinc-600":"text-slate-400"}`}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day,i)=>{
            if(!day) return <div key={`e${i}`}/>;
            const dayEvs = eventsByDay[day]||[];
            const hasCritical = dayEvs.some(e=>e.urgency==="critical");
            const hasHigh = dayEvs.some(e=>e.urgency==="high");
            const isSelected = selectedDay===day;
            const gDate = new Date(calYear,calMonth,day);
            const hijri = hijriDayLabel(gDate);
            return (
              <button key={day} onClick={()=>setSelectedDay(isSelected?null:day)}
                className={`relative flex flex-col items-center py-1.5 px-0.5 rounded-xl transition-all ${
                  isSelected?"bg-[#0B3D2E] text-white":isToday(day)?isDark?"bg-zinc-700 text-zinc-100":"bg-slate-200 text-slate-800":isDark?"hover:bg-zinc-800 text-zinc-300":"hover:bg-slate-100 text-slate-600"
                }`}>
                <span className="text-[12px] font-bold">{day}</span>
                {hijri!==null&&(
                  <span className={`text-[8px] font-medium leading-none mt-0.5 ${isSelected?"text-white/70":isDark?"text-zinc-600":"text-slate-400"}`}>{hijri}هـ</span>
                )}
                {dayEvs.length>0&&(
                  <div className="flex gap-0.5 mt-0.5">
                    {hasCritical&&<span className="w-1.5 h-1.5 rounded-full bg-red-500"/>}
                    {!hasCritical&&hasHigh&&<span className="w-1.5 h-1.5 rounded-full bg-amber-500"/>}
                    {!hasCritical&&!hasHigh&&<span className="w-1.5 h-1.5 rounded-full bg-indigo-400"/>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {selectedDay&&(
          <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <p className={`text-[11px] font-black uppercase tracking-wider mb-3 px-1 ${isDark?"text-zinc-500":"text-slate-400"}`}>
              {selectedDay} {AR_MONTHS[calMonth]} — {selectedDayEvents.length>0?`${selectedDayEvents.length} موعد`:"لا توجد مواعيد"}
            </p>
            {selectedDayEvents.length>0?(
              <div className="space-y-3">
                {selectedDayEvents.map(ev=><EventCard key={ev.id} ev={ev} isDark={isDark}/>)}
              </div>
            ):(
              <div className={`text-center py-8 text-[13px] ${isDark?"text-zinc-600":"text-slate-400"}`}>لا توجد مواعيد في هذا اليوم</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function LawyerHearingsPage() {
  const {isDark} = useTheme();
  const user = useUser();
  const [events, setEvents] = useState<CalEvent[]>([]);
  // Three distinct states, never two. A lawyer reading «لا توجد جلسات» over a
  // query that failed misses a hearing, so a failed read has to say so and offer
  // a retry — it must never land on the empty state.
  const [loadState, setLoadState] = useState<"loading"|"error"|"ready">("loading");
  // True when the server holds more rows than this page asked for. Silently
  // showing a partial diary is the same defect as showing an empty one.
  const [truncated, setTruncated] = useState(false);
  const [viewMode,setViewMode] = useState<ViewMode>("list");
  const [timeFilter,setTimeFilter] = useState<"all"|"today"|"week"|"month"|"deadlines"|"archive">("all");
  const [typeFilter,setTypeFilter] = useState<EventType|"all">("all");
  const [urgencyFilter,setUrgencyFilter] = useState<"all"|"critical"|"high"|"normal">("all");
  const [search,setSearch] = useState("");
  const [showAddHearing, setShowAddHearing] = useState(false);
  const [showDeadlinesOnly,setShowDeadlinesOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false); // To toggle advanced filters

  // ─── Fetch hearings ─────────────────────────────────────────────────────────
  // NOT getWorkflowRequestsByReceiver(): that helper sends no `limit`, and
  // GET /api/v1/service-requests defaults to 20 rows ordered by created_at DESC
  // while discarding `total`. A lawyer whose 20 newest rows are tasks, clients
  // and cases would see an EMPTY hearing calendar with nothing saying rows were
  // dropped. src/components/ui/CasePicker.tsx:84 already overrides the same
  // default on the same endpoint for the same reason. It also swallows the
  // route's `degraded` flag — its "this empty list is a failure, not an
  // absence" signal (src/app/api/v1/service-requests/route.ts:84).
  // No setState before the first await: the retry button sets "loading" itself,
  // and a refetch triggered by a save deliberately leaves the current list on
  // screen rather than flashing a spinner over a diary the lawyer is reading.
  const load = useCallback(async () => {
    try {
      let rows: WorkflowRequest[];
      let cut = false;
      if (isSupabaseMode) {
        const res = await apiGet<{ data: WorkflowRequest[]; total?: number; degraded?: boolean }>(
          "/api/v1/service-requests",
          { receiver: "lawyer", limit: HEARINGS_FETCH_LIMIT },
        );
        if (res.degraded) throw new Error("the service-requests query failed server-side (degraded)");
        rows = res.data ?? [];
        cut = (res.total ?? rows.length) > rows.length;
      } else {
        rows = await getWorkflowRequestsByReceiver("lawyer");
      }
      // `receiver: "lawyer"` is not "mine": the marketplace browse policy lets
      // any verified lawyer read unassigned rows with that receiver, so filter
      // to this lawyer's own once the session id is known. Skipped while the id
      // is still resolving — that is a loading condition, not a read failure,
      // and blanking the diary over it would be the bug this page already had.
      const uid = user.userId;
      setEvents(
        rows
          .filter(r => r.type === "service")
          .filter(r => !uid || r.assignedTo === uid)
          .map(workflowToHearing)
          .filter((e): e is CalEvent => e !== null),
      );
      setTruncated(cut);
      setLoadState("ready");
    } catch (err) {
      console.error("[hearings] failed to load the diary:", err);
      setLoadState("error");
    }
  }, [user.userId]);

  // Wrapped rather than `void load()` so the fetch is not a synchronous call
  // out of the effect body — same shape as src/components/ui/CasePicker.tsx.
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  // AddHearingModal dispatches this on a confirmed save. Without the listener
  // the modal's «تم تسجيل الموعد في جدول أعمالك» was written over a جدول أعمال
  // that still said «لا توجد جلسات قادمة» until a full page reload. Same signal
  // the cases, consultations and contracts pages already listen for.
  useEffect(() => {
    const onUpdated = () => { void load(); };
    window.addEventListener("nzamy-workflow-updated", onUpdated);
    return () => window.removeEventListener("nzamy-workflow-updated", onUpdated);
  }, [load]);

  const card = isDark?"rounded-3xl border border-white/[0.06] bg-zinc-900/50":"rounded-3xl border border-slate-100 bg-white shadow-sm";

  const filtered = useMemo(()=>{
    let evs = events;
    if(timeFilter==="today")     evs=evs.filter(e=>e.dateSort===0);
    if(timeFilter==="week")      evs=evs.filter(e=>e.dateSort>=0&&e.dateSort<=7);
    if(timeFilter==="month")     evs=evs.filter(e=>e.dateSort>=0&&e.dateSort<=30);
    if(timeFilter==="deadlines") evs=evs.filter(e=>e.type==="deadline");
    if(timeFilter==="archive")   evs=evs.filter(e=>e.done||e.dateSort<0);
    if(timeFilter==="all")       evs=evs.filter(e=>!e.done&&e.dateSort>=0);
    if(showDeadlinesOnly) evs=evs.filter(e=>e.type==="deadline");
    if(typeFilter!=="all")   evs=evs.filter(e=>e.type===typeFilter);
    if(urgencyFilter!=="all") evs=evs.filter(e=>e.urgency===urgencyFilter);
    if(search.trim()){const q=search.toLowerCase();evs=evs.filter(e=>e.title.includes(q)||e.client?.includes(q)||e.location?.includes(q));}
    return evs;
  },[events,timeFilter,typeFilter,urgencyFilter,search,showDeadlinesOnly]);

  const deadlineCount = events.filter(e=>e.type==="deadline"&&!e.done&&e.dateSort>=0).length;
  const todayCount    = events.filter(e=>e.dateSort===0&&!e.done).length;
  const groups = groupByDate(filtered);
  const typeCounts = Object.entries(EVENT_CONFIG).map(([k,v])=>({key:k as EventType,label:v.label,count:events.filter(e=>e.type===k&&!e.done&&e.dateSort>=0).length})).filter(t=>t.count>0);

  const TIME_OPTIONS = [
    {key:"all" as const,    label:"الكل"},
    {key:"today" as const,  label:"اليوم"},
    {key:"week" as const,   label:"هذا الأسبوع"},
    {key:"month" as const,  label:"هذا الشهر"},
    {key:"deadlines" as const, label:`طعون (${deadlineCount})`},
    {key:"archive" as const,label:"الأرشيف"},
  ];
  const TYPE_OPTIONS  = [{key:"all" as const,label:`الكل (${events.filter(e=>!e.done&&e.dateSort>=0).length})`},...typeCounts];
  const URGENCY_OPTIONS = [
    {key:"all" as const,      label:"جميع المستويات"},
    {key:"critical" as const, label:"حرجة",  dot:"bg-red-500"},
    {key:"high" as const,     label:"عالية", dot:"bg-amber-500"},
    {key:"normal" as const,   label:"عادية", dot:"bg-blue-500"},
  ];

  return (
    <div className="max-w-[860px] mx-auto space-y-5" dir="rtl">

      {/* Read state. The old banner here said «بيانات تجريبية / لا توجد جلسات
          قادمة» for BOTH a genuinely empty diary and a query that failed —
          i.e. it asserted the lawyer had no hearings whenever the read broke,
          and called the (nonexistent) contents demo data while doing it. */}
      {loadState === "error" && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-red-500/25 bg-red-900/10" : "border-red-200 bg-red-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-red-500/15" : "bg-red-100"}`}>
            <Warning size={18} weight="fill" className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[13px] font-bold ${isDark ? "text-red-400" : "text-red-700"}`}>تعذّر قراءة جدول المواعيد</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-red-600/70"}`}>
              هذه ليست قائمة فارغة — لم نتمكّن من قراءة مواعيدك، وقد تكون لديك جلسات لا تظهر هنا الآن. أعد المحاولة قبل الاعتماد على هذه الشاشة.
            </p>
          </div>
          <button onClick={() => { setLoadState("loading"); void load(); }}
            className="flex items-center gap-1.5 flex-shrink-0 rounded-xl px-3 py-2 text-[12px] font-bold bg-red-500 text-white hover:bg-red-600 transition">
            <ArrowClockwise size={13} weight="bold" />إعادة المحاولة
          </button>
        </motion.div>
      )}

      {truncated && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/15" : "bg-amber-100"}`}>
            <Warning size={18} weight="fill" className="text-amber-500" />
          </div>
          <div>
            <p className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>القائمة غير مكتملة</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/70"}`}>
              حسابك يحتوي على سجلات أكثر ممّا تم تحميله، فقد لا تظهر هنا كل مواعيدك. لا تعتمد على هذه الشاشة وحدها لهذا اليوم.
            </p>
          </div>
        </motion.div>
      )}

      {loadState === "ready" && events.length === 0 && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 border flex items-center gap-3 ${isDark ? "border-white/[0.06] bg-zinc-900/50" : "border-slate-200 bg-slate-50"}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-white/[0.05]" : "bg-white"}`}>
            <CalendarCheck size={18} weight="duotone" className={isDark ? "text-zinc-500" : "text-slate-400"} />
          </div>
          <div>
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا توجد مواعيد مسجّلة</p>
            <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>ابدأ بإضافة موعد من زر «موعد جديد» أعلاه.</p>
          </div>
        </motion.div>
      )}

      {/* Deadline banner */}
      {deadlineCount>0&&!showDeadlinesOnly&&timeFilter==="all"&&(
        <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}
          className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border"
          style={{background:isDark?"rgba(239,68,68,0.08)":"rgba(254,242,242,1)",borderColor:isDark?"rgba(239,68,68,0.25)":"rgba(254,202,202,1)"}}>
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0"><Warning size={16} weight="fill" className="text-red-500"/></span>
            <div>
              <p className="text-[13px] font-black text-red-600">{deadlineCount} مواعيد طعون وتقديم نهائية قادمة</p>
              <p className={`text-[11px] ${isDark?"text-red-400/60":"text-red-400"}`}>مواعيد قانونية لا تقبل التأجيل</p>
            </div>
          </div>
          <button onClick={()=>setShowDeadlinesOnly(true)} className="text-[12px] font-bold text-red-500 hover:underline flex items-center gap-1 flex-shrink-0">
            عرض الطعون فقط<ArrowRight size={12}/>
          </button>
        </motion.div>
      )}

      {showDeadlinesOnly&&(
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-red-500/20 bg-red-500/5">
          <Warning size={14} className="text-red-500"/>
          <span className="text-[12px] font-bold text-red-500 flex-1">عرض الطعون فقط</span>
          <button onClick={()=>setShowDeadlinesOnly(false)} className={`p-1.5 rounded-xl ${isDark?"hover:bg-white/[0.06] text-zinc-500":"hover:bg-red-50 text-red-400"}`}><X size={14}/></button>
        </div>
      )}

      {/* Header Area */}
      <div className={`p-5 flex flex-col gap-5 ${card}`}>
        
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className={`text-xl font-bold mb-1 ${isDark?"text-white":"text-slate-800"}`}>المواعيد والجلسات</h1>
            <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-500"}`}>
              {todayCount>0&&<span className="text-red-500 font-bold">{todayCount} موعد اليوم · </span>}
              {events.filter(e=>!e.done&&e.dateSort>=0).length} مجدولة 
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAddHearing(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] text-[#C8A762] shadow-md hover:shadow-lg transition-all">
              <Plus size={15} weight="bold"/>موعد جديد
            </button>
            <div className={`flex items-center p-1 rounded-xl border ${isDark?"border-white/[0.06] bg-zinc-800":"border-slate-200 bg-slate-50"}`}>
              {([{k:"list"as const,icon:List},{k:"calendar"as const,icon:CalendarBlank}]).map(v=>(
                <button key={v.k} onClick={()=>setViewMode(v.k)} className={`p-1.5 rounded-lg transition-all ${viewMode===v.k?isDark?"bg-zinc-700 text-white":"bg-white text-slate-800 shadow-sm":isDark?"text-zinc-500 hover:text-zinc-300":"text-slate-400 hover:text-slate-600"}`}>
                  <v.icon size={16}/>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Search Bar & Quick Filters */}
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${isDark?"border-white/[0.06] bg-zinc-800/80":"border-slate-200 bg-slate-50"}`}>
          <MagnifyingGlass size={16} className={isDark?"text-zinc-500":"text-slate-400"}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث سريع في المواعيد والجلسات..."
            className={`flex-1 text-[13px] font-medium bg-transparent outline-none ${isDark?"text-zinc-200 placeholder:text-zinc-600":"text-slate-700 placeholder:text-slate-400"}`}/>
          <div className={`w-px h-5 mx-1 ${isDark?"bg-zinc-700":"bg-slate-300"}`}/>
          <button onClick={()=>setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[12px] font-bold transition-all ${showFilters?isDark?"bg-zinc-700 text-white":"bg-slate-200 text-[#0B3D2E]":isDark?"text-zinc-400 hover:bg-zinc-700 hover:text-white":"text-slate-500 hover:bg-slate-200 hover:text-slate-800"}`}>
            الفرز المتقدم
          </button>
        </div>

        {/* Advanced Filters Drawer */}
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="overflow-hidden">
              <div className={`pt-4 border-t grid grid-cols-1 md:grid-cols-3 gap-5 ${isDark?"border-zinc-800":"border-slate-100"}`}>
                <div className="space-y-2">
                  <p className={`text-[10px] font-black uppercase tracking-wider ${isDark?"text-zinc-600":"text-slate-400"}`}>الفترة</p>
                  <FilterRow options={TIME_OPTIONS} value={timeFilter} onChange={setTimeFilter} isDark={isDark} colorMap={{deadlines:"#ef4444",archive:"#f59e0b"}}/>
                </div>
                <div className="space-y-2">
                  <p className={`text-[10px] font-black uppercase tracking-wider ${isDark?"text-zinc-600":"text-slate-400"}`}>نوع الموعد</p>
                  <FilterRow options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} isDark={isDark}/>
                </div>
                <div className="space-y-2">
                  <p className={`text-[10px] font-black uppercase tracking-wider ${isDark?"text-zinc-600":"text-slate-400"}`}>الأولوية</p>
                  <FilterRow options={URGENCY_OPTIONS} value={urgencyFilter} onChange={setUrgencyFilter} isDark={isDark}/>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content — only for a read that actually succeeded. Rendering the list
          (and its «لا توجد مواعيد مطابقة للفلتر المختار») under a failed query
          is how an unread hearing becomes an absent one. */}
      {loadState === "loading" && (
        <div className={`${card} p-12 flex flex-col items-center gap-3`}>
          <CircleNotch size={24} className={`animate-spin ${isDark?"text-zinc-600":"text-slate-300"}`} weight="bold"/>
          <p className={`text-sm ${isDark?"text-zinc-500":"text-slate-400"}`}>جارٍ تحميل جدول مواعيدك…</p>
        </div>
      )}
      <AnimatePresence mode="wait">
        {loadState !== "ready" ? null : viewMode==="calendar"?(
          <motion.div key="cal" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <CalendarView events={filtered.length>0?filtered:events} isDark={isDark}/>
          </motion.div>
        ):(
          <motion.div key="list" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-6">
            {groups.length===0&&(
              <div className={`${card} p-12 text-center`}>
                <CalendarCheck size={36} weight="duotone" className={`mx-auto mb-3 ${isDark?"text-zinc-700":"text-slate-300"}`}/>
                <p className={`text-sm ${isDark?"text-zinc-500":"text-slate-400"}`}>لا توجد مواعيد مطابقة للفلتر المختار</p>
              </div>
            )}
            {groups.map(([groupLabel,events])=>{
              const isDL = groupLabel==="مواعيد الطعون والنهائية";
              return (
                <div key={groupLabel}>
                  <div className="flex items-center gap-3 mb-3 px-1">
                    <div className="flex items-center gap-2 flex-1">
                      {isDL?<Warning size={14} weight="fill" className="text-red-500"/>:<CalendarCheck size={14} weight="duotone" className={isDark?"text-zinc-500":"text-slate-400"}/>}
                      <h2 className={`text-[12px] font-black uppercase tracking-wider ${isDL?"text-red-500":isDark?"text-zinc-500":"text-slate-400"}`}>{groupLabel}</h2>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isDL?"bg-red-500/10 text-red-500":isDark?"bg-white/[0.05] text-zinc-500":"bg-slate-100 text-slate-400"}`}>{events.length}</span>
                    </div>
                    <div className={`flex-1 h-px ${isDark?"bg-white/[0.06]":"bg-slate-100"}`}/>
                  </div>
                  <div className="space-y-3">
                    <AnimatePresence>
                      {events.map(ev=><EventCard key={ev.id} ev={ev} isDark={isDark}/>)}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAddHearing && <AddHearingModal onClose={() => setShowAddHearing(false)} isDark={isDark} user={{ userId: user.userId, name: user.name, userType: user.userType, tier: user.tier }} />}
      </AnimatePresence>
    </div>
  );
}
