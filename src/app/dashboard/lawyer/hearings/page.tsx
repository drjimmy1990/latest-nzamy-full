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
// The Umm al-Qura conversion that stood here — an Intl.DateTimeFormat built and
// probed inline, plus a hijriDayLabel() wrapper — moved to
// src/lib/services/hijri.ts on 2026-08-27, unchanged in behaviour.
//
// It moved because it was the CORRECT half of a pair. This page had already
// been repaired to ask the runtime; HijriDateWidget was still doing tabular
// arithmetic and was a full day out (Umm al-Qura 14 Rabiʿ al-Awwal 1448, the
// widget 13). Two implementations is how they came to disagree on 674 of 730
// days in the first place, so fixing the second one by copying this one would
// have rebuilt the same trap. There is now one module, with a 400-day
// round-trip test, and two callers.

/** The Hijri day NUMBER for the calendar strip, or null when unavailable. */
function hijriDayOnly(gDate: Date): string | null {
  const parts = hijriPartsOf(gDate);
  return parts ? String(parts.day) : null;
}
// `import Link from "next/link"` was removed with the linked-tasks UI on
// 2026-08-28 — its only two uses were the «N مهام» chip and «عرض كل المهام»,
// both inside a block that could never render. See the note at LINKED_TASKS.
import { useTheme } from "@/components/ThemeProvider";
import { countPhraseAr, type ArabicCountForms } from "@/lib/services/arabicCount";

/**
 * «٠ مجدولة» in shots 19 and 24 — a Western zero in an Arabic heading, with
 * the plural adjective attached to it. Both halves of this line now agree with
 * their number, and neither writes a digit where Arabic writes none.
 */
const SCHEDULED_COUNT: ArabicCountForms = {
  zero: "لا مواعيد مجدولة",
  one: "موعد واحد مجدول",
  two: "موعدان مجدولان",
  few: "مواعيد مجدولة",
  many: "موعداً مجدولاً",
};

const TODAY_COUNT: ArabicCountForms = {
  // Never rendered — the caller guards on `todayCount > 0` — but a form table
  // with a hole in it is an invitation to render the hole.
  zero: "لا مواعيد اليوم",
  one: "موعد واحد اليوم",
  two: "موعدان اليوم",
  few: "مواعيد اليوم",
  many: "موعداً اليوم",
};
import { getWorkflowRequestsByReceiver } from "@/lib/services/workflowService";
import { hijriPartsOf, toArabicDigits } from "@/lib/services/hijri";
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
  // `caseId?: string` was removed on 2026-08-28. Round 1 stopped the mapper
  // setting it (it had been pointing at the hearing's own id), and its only
  // reader was the LINKED_TASKS lookup, which is gone — see the note there.
  client?: string; caseName?: string;
  // `date` is the row's own stored "YYYY-MM-DD" — an ABSOLUTE day, and the only
  // one of the two that is actually stored. EVERYTHING the lawyer reads as a
  // date is derived from it: the card's date line (formatEventDateAr), the
  // calendar grid, the notice under the grid, and the Google Calendar link.
  //
  // `dateSort` is a whole-day offset from TODAY, kept because bucketing,
  // filtering and the counters read naturally in it. It is no longer frozen at
  // fetch: the page re-derives it from `date` whenever the local day rolls over
  // (see `todayKey`), so «اليوم» still means today on a tab left open all night.
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

// ─── Days, absolutely ─────────────────────────────────────────────────────────
// Every date this page SHOWS is derived from an absolute local day — the row's
// own stored "YYYY-MM-DD" — and never from an offset captured at fetch time.
//
// The offset was the bug. `getEventDate(dateSort)` used to live below: it read
// `new Date()` at render time and added an offset computed when the diary was
// fetched, so everything it produced was a day late from the moment the tab
// crossed local midnight. `load` runs on mount, on `user.userId`, and on
// «nzamy-workflow-updated»; there is no interval refetch, so nothing corrected
// it. Reproduced in node before this fix: a fetch at 22:00 on 29 Sept with a
// sitting on 30 Sept freezes dateSort = 1; after midnight `getEventDate(1)`
// resolves to 1 October, so the calendar drew the dot on 1 أكتوبر and put a card
// reading «٣٠ سبتمبر ٢٠٢٦» under a heading reading «١ أكتوبر» — and on the
// September grid it printed «لا يقع أيّ من المواعيد … في سبتمبر ٢٠٢٦» over a
// sitting that was happening THAT DAY, on the last day of the month, at the
// hour the claim costs most.
//
// `eventDayDate` is the single parse. It is the expression `formatEventDateAr`
// already used, so the card, the grid and the notice now read one day from one
// source and cannot disagree BY CONSTRUCTION — not merely while a clock is
// fresh.

/** The row's own stored day as a local-midnight Date, or null if unparseable. */
function eventDayDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

/** A local day as "YYYY-MM-DD" — the same shape the rows store. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Whole local days from one stored day to another, or null if either is unreadable.
 *
 * Both ends are built at LOCAL midnight and the quotient is rounded, so a 23- or
 * 25-hour DST day still counts as one day. The Kingdom keeps no DST; a lawyer
 * reading the diary from abroad does.
 */
function daysBetweenDays(fromKey: string, toKey: string): number | null {
  const from = eventDayDate(fromKey);
  const to = eventDayDate(toKey);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/**
 * Whole days from today to a stored "YYYY-MM-DD", or null when it will not parse.
 *
 * Kept under this name, with exactly the arithmetic it always had
 * (midnight-to-midnight, rounded), because `daysUntilDate` in
 * /dashboard/lawyer/page.tsx documents itself as «same arithmetic as
 * daysFromToday() in /dashboard/lawyer/hearings» — the two pages must go on
 * agreeing about what «غداً» means, and a cross-file note naming a function that
 * no longer exists is how the next reader stops believing the notes.
 */
function daysFromToday(dateStr: string): number | null {
  return daysBetweenDays(localDayKey(new Date()), dateStr);
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
  // The gate — a row with no readable day is not a diary entry. The number is
  // only correct AS OF THIS MOMENT; the page re-derives `dateSort` from `date`
  // against the current local day, so nothing downstream depends on this one
  // staying true overnight.
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
    // `caseId` is no longer set from this row, and the «القضية» chip is no
    // longer a link (2026-08-28). It used to be `caseName ? request.id : …`,
    // which pointed the chip at /dashboard/lawyer/cases/<this HEARING's own id>
    // — an id that is not a case, so the chip opened a case page that could
    // never resolve. A previous pass knowingly shipped it rather than lose the
    // chip; the chip did not have to go. `caseName` here is free text the lawyer
    // typed into AddHearingModal («القضية / الموكل (اختياري)») and is not linked
    // to any case record, so there is nothing to navigate TO: it is now rendered
    // as a plain label. Giving it a real destination needs a case reference on
    // the row, which is a schema question, not a rendering one.
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

// ─── Linked tasks: REMOVED 2026-08-28 ─────────────────────────────────────────
// What stood here was `const LINKED_TASKS: Record<string, {...}[]> = {}` with
// the comment «empty — will be populated from service». Nothing ever populated
// it: it was written by no code path in the repo, so `LINKED_TASKS[caseId]` was
// `undefined` for every id that could ever be looked up.
//
// It took the whole feature down with it, and all of it is removed rather than
// left dark: the `linkedTasks`/`setLinkedTasks` state (seeded from this map,
// therefore always `[]`), `toggleLinkedTask`, `pendingCount`, the «N مهام» Link
// on the card, the «المهام المرتبطة بهذه القضية» list inside the expander, the
// «عرض كل المهام» link under it, and `CalEvent.caseId` — the key the lookup
// used, which round 1 had already stopped the mapper from setting.
//
// Dead, not dishonest: none of it ever reached a screen, so no lawyer was told
// anything untrue by it. Deleting it is therefore a no-op for the six lawyers
// using this page today and removes ~50 lines that read as a working feature.
// Reviving it needs a real link between a hearing row and a task row — a schema
// question (there is no case/task reference on a service_requests hearing row),
// not a rendering one. Git history keeps the markup.

// ─── Helpers ───────────────────────────────────────────────────────────────────
// ONE definition of «هذا الأسبوع» and «هذا الشهر», used by BOTH the date
// headings in groupByDate and the period filter in the page below.
//
// They had drifted: the heading bucket was `dateSort <= 5` while the `week`
// filter was `dateSort >= 0 && dateSort <= 7`. So a hearing six or seven days
// out was selected by «هذا الأسبوع» and then printed under a heading that said
// «هذا الشهر» — the lawyer filtered to this week and read that the sitting was
// this month. «هذا الشهر» was already sharing 30 with its filter; the week now
// does the same, at 7, because a week is seven days and the filter was the half
// that was right.
const WEEK_HORIZON_DAYS = 7;
const MONTH_HORIZON_DAYS = 30;

const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const AR_DAYS  = ["أحد","إثن","ثلا","أرب","خمي","جمع","سبت"];

// `getEventDate(dateSort)` — «today + N days», re-read at render time — stood
// here and is DELETED rather than repaired: it was the single source of the
// day-drift described at `eventDayDate`, and a helper that turns an offset back
// into a date is exactly the shape the next reader would reach for again. Its
// two callers, `googleCalUrl` and the calendar's `eventsByDay` memo, read
// `ev.date` now.

/**
 * «١٥ سبتمبر ٢٠٢٦» from the row's own stored "YYYY-MM-DD".
 *
 * The card used to print `ev.date` raw — the "2026-09-15" string straight out
 * of `<input type="date">` — dropped into an Arabic RTL line, beside a calendar
 * strip that carries Arabic-Indic Hijri numerals. Wrong script and wrong order
 * for the reader. This is the shape the rest of the platform already uses for a
 * date in Arabic prose (`formatArabicDate`, src/lib/services/clientDashboardCards.ts).
 *
 * Formatted from `ev.date`, the absolute stored day. It was already the one
 * date on this page that could not go stale; as of 2026-08-28 it is also what
 * the calendar grid and the grid's notice count from, through the same
 * `eventDayDate` parse — which is what makes it impossible for the grid to place
 * a row on a day the card does not name. See the note at `eventDayDate`.
 *
 * `workflowToHearing` drops any row whose date fails this same parse, so the
 * raw-string branch is unreachable in practice. It returns the raw string rather
 * than «Invalid Date» anyway, because printing English on an Arabic screen is
 * the worse of the two.
 *
 * Latin numerals stay in the calendar GRID — a seven-column day cell is chrome,
 * not prose.
 */
function formatEventDateAr(dateStr: string): string {
  const d = eventDayDate(dateStr);
  const month = d ? AR_MONTHS[d.getMonth()] : undefined;
  if (!d || !month) return dateStr;
  return `${toArabicDigits(d.getDate())} ${month} ${toArabicDigits(d.getFullYear())}`;
}

/**
 * "HH:MM" → {h,m}, or null when there is no readable hour.
 *
 * Deliberately not `^\d{2}:\d{2}$`: `<input type="time">` emits "HH:MM:SS" once
 * its step is sub-minute, and `metadata.time` on older rows is whatever string
 * was stored. A regex that misses would fall back to the all-day URL silently —
 * i.e. straight back to the defect below — so this accepts a leading H:MM and a
 * trailing remainder, and range-checks what it read.
 */
function parseTimeOfDay(raw: string | undefined): {h:number;m:number} | null {
  const hit = /^\s*(\d{1,2}):(\d{2})/.exec(raw ?? "");
  if (!hit) return null;
  const h = Number(hit[1]);
  const m = Number(hit[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

const pad2 = (n:number) => String(n).padStart(2,"0");
const gcalDay = (d:Date) => `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`;
const gcalStamp = (d:Date) => `${gcalDay(d)}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;

function googleCalUrl(ev: CalEvent): string | null {
  // The event's own stored day, not «today + dateSort». The old form handed
  // Google the WRONG DAY on any tab that had crossed midnight since the fetch —
  // a sitting on 30 Sept, fetched the evening before, was offered to Google as
  // 1 October. The `Math.max(0, …)` that wrapped it is gone with it, and it is
  // worth being exact about why: that clamp never actually bound, because the
  // callsite already gates on `ev.dateSort>=0`. It was dead reassurance, not
  // protection. The day is right now because it is the row's own, not because
  // anything clamped it.
  //
  // A day that will not parse yields NO link rather than a link to a guess;
  // `workflowToHearing` has already proved this string parseable, so that branch
  // is unreachable in practice.
  const start = eventDayDate(ev.date);
  if (!start) return null;
  // `dates` used to carry YYYYMMDD only, so the hour the lawyer typed was
  // dropped and every hearing reached Google as an ALL-DAY event — no reminder
  // at the hour of the sitting. `ev.time` was in hand the whole time; the card
  // that renders this link prints it two lines above.
  //
  // The stamp is written with no `Z` and no `ctz` on purpose: a floating local
  // time is the one Google reads in the viewer's own calendar zone, and that is
  // exactly the zone the lawyer typed the hour in. Stamping a zone would mean
  // asserting one — the row records none — so the meaning is left where it
  // already is rather than pinned to a guess.
  //
  // One hour is the TEMPLATE's default block, not a claim about the sitting —
  // nothing on the row records a duration, and Google's compose screen opens
  // with the end time editable before anything is saved. A row with no readable
  // time keeps the old all-day form rather than inventing an hour for it.
  const at = parseTimeOfDay(ev.time);
  let dates: string;
  if (at) {
    start.setHours(at.h, at.m, 0, 0);
    const end = new Date(start.getTime() + 60*60*1000);
    dates = `${gcalStamp(start)}/${gcalStamp(end)}`;
  } else {
    const day = gcalDay(start);
    dates = `${day}/${day}`;
  }
  const details = [ev.notes||"", ev.client?`الموكل: ${ev.client}`:"", ev.caseName?`القضية: ${ev.caseName}`:"", "منصة نظامي القانونية"].filter(Boolean).join("\n");
  const p = new URLSearchParams({action:"TEMPLATE",text:ev.title,dates,details,location:ev.location||""});
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function groupByDate(events: CalEvent[]): [string,CalEvent[]][] {
  const deadlines = events.filter(e => e.type==="deadline");
  const rest = events.filter(e => e.type!=="deadline");
  const groups: Record<string,CalEvent[]> = {};
  // Both ends of this used to be open. «هذا الشهر» was the final, unbounded
  // branch, so a hearing ninety days — or three years — out sat under a heading
  // that said this month; and anything with a NEGATIVE dateSort fell through to
  // `<=5` and was headed «هذا الأسبوع», which is how the الأرشيف view titled
  // last year's sittings. Each row prints its own date, so the heading was the
  // only thing lying, but a heading is what the eye reads first on a diary.
  // Both headings now read their boundary from the SAME constant the matching
  // time-filter reads, so «هذا الأسبوع» cannot again mean 5 days here and 7
  // days there.
  rest.forEach(e => {
    const key = e.dateSort<0?"سابقة"
      :e.dateSort===0?"اليوم"
      :e.dateSort===1?"غداً"
      :e.dateSort<=WEEK_HORIZON_DAYS?"هذا الأسبوع"
      :e.dateSort<=MONTH_HORIZON_DAYS?"هذا الشهر"
      :"لاحقاً";
    if(!groups[key]) groups[key]=[];
    groups[key].push(e);
  });
  const order = ["سابقة","اليوم","غداً","هذا الأسبوع","هذا الشهر","لاحقاً"];
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
  // ── Mutable local state so the workflow steps are interactive ────────────────
  // The `linkedTasks`/`setLinkedTasks` state and `toggleLinkedTask` that stood
  // here were removed on 2026-08-28 with LINKED_TASKS — see the note there.
  const [steps, setSteps] = useState<WorkflowStep[]>(ev.workflow ?? []);

  const toggleStep = (i: number) =>
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, done: !s.done } : s));

  const cfg = EVENT_CONFIG[ev.type];
  const Icon = cfg.icon;
  const donePct = steps.length > 0 ? Math.round((steps.filter(s=>s.done).length / steps.length) * 100) : null;
  const isDeadline = ev.type==="deadline";
  const accentColor = ev.urgency==="critical"?"#ef4444":ev.urgency==="high"?"#f59e0b":cfg.color;
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
                <Clock size={11} />{formatEventDateAr(ev.date)}{ev.time?` — ${ev.time}`:""}
              </span>
              {ev.location&&<span className={`flex items-center gap-1 text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}><MapPin size={11}/>{ev.location}</span>}
              {ev.client&&<span className={`flex items-center gap-1 text-[11px] ${isDark?"text-zinc-500":"text-slate-400"}`}><User size={11}/>{ev.client}</span>}
            </div>
            {/* Links Row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* A label, not a link. This was an <a> to
                  /dashboard/lawyer/cases/<the hearing's own id> — see the note
                  in workflowToHearing. The name the lawyer typed still shows;
                  only the navigation that could not work is gone, and with it
                  the ArrowSquareOut that promised it opened somewhere. */}
              {ev.caseName&&(
                <span
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg ${isDark?"bg-indigo-500/10 text-indigo-400":"bg-indigo-50 text-indigo-600"}`}>
                  <Scales size={9}/>{ev.caseName}
                </span>
              )}
              {/* The «N مهام» Link to /dashboard/lawyer/tasks stood here. It was
                  gated on `linkedTasks.length>0`, and linkedTasks came from
                  LINKED_TASKS, which nothing populated — removed 2026-08-28. */}
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
              {/* REMOVED 2026-08-28: the «المهام المرتبطة بهذه القضية» list —
                  a toggleable task list plus an «عرض كل المهام» link — stood
                  here, gated on `linkedTasks.length>0`. It was fed by
                  LINKED_TASKS, an empty Record nothing wrote to, so the gate was
                  false for every event and no lawyer ever saw it. Restoring it
                  needs a real hearing→task reference on the row; see the note at
                  the top of the file. */}
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

  // The `ev.dateSort>=0 && !ev.done` guard that stood here was removed on
  // 2026-08-28. `events` is already `filtered` — the exact set the lawyer's own
  // period/type/priority/search selection produced — so a SECOND filter here
  // could only contradict the first, and it did: with «الأرشيف» selected, every
  // row is past or done BY DEFINITION, so this guard dropped all of them and
  // drew an empty month grid. The page-level «لا توجد مواعيد مطابقة للفلتر»
  // card could not explain it either, because it is gated on `filtered.length
  // === 0` and `filtered` was full. The calendar now shows exactly what the
  // filter selected, past and done included, matching the list view beside it.
  //
  // `inMonthCount` — how many of the selected events land in the month
  // currently on screen — is counted in the SAME pass, because removing the
  // guard is only half the fix: with «الأرشيف» selected and every archived
  // sitting in a previous month, the grid for THIS month is still legitimately
  // empty, and an empty grid with nothing said is the reported defect whatever
  // the reason for it. The notice under the grid uses this to say which it is.
  const {eventsByDay,inMonthCount} = useMemo(()=>{
    const map: Record<number,CalEvent[]> = {};
    let count = 0;
    events.forEach(ev=>{
      // `ev.date` — the row's own stored day, the SAME value formatEventDateAr
      // prints on the card. This was `getEventDate(ev.dateSort)`, which re-read
      // the clock at memo time and added an offset frozen at fetch: see the
      // reproduction at `eventDayDate`. That is what let the notice below assert
      // a September sitting was not in September, and it did it precisely when
      // the lawyer touched a filter or a month arrow — the action the notice
      // itself recommends.
      const d = eventDayDate(ev.date);
      if(d&&d.getMonth()===calMonth&&d.getFullYear()===calYear){
        const day = d.getDate();
        if(!map[day]) map[day]=[];
        map[day].push(ev);
        count += 1;
      }
    });
    return {eventsByDay:map,inMonthCount:count};
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
            // Urgency colours are read from the OPEN events only. Done rows now
            // reach this grid (see eventsByDay), and a completed sitting must
            // not paint the same red alarm dot as a live one — «حرجة» describes
            // what is still owed, not what has been dealt with. A day whose
            // events are all done gets the muted dot below.
            const openEvs = dayEvs.filter(e=>!e.done);
            const hasCritical = openEvs.some(e=>e.urgency==="critical");
            const hasHigh = openEvs.some(e=>e.urgency==="high");
            const isSelected = selectedDay===day;
            const gDate = new Date(calYear,calMonth,day);
            const hijri = hijriDayOnly(gDate);
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
                    {!hasCritical&&!hasHigh&&openEvs.length>0&&<span className="w-1.5 h-1.5 rounded-full bg-indigo-400"/>}
                    {openEvs.length===0&&<span className={`w-1.5 h-1.5 rounded-full ${isDark?"bg-zinc-600":"bg-slate-300"}`}/>}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* The grid shows one month; the filter does not. When the two disagree
            the grid goes blank, and a blank month with nothing said reads as
            «you have no appointments» — the whole reason «الأرشيف» in calendar
            view was reported. This says which of the two it is. It is gated on
            the IN-MONTH count, not on `events.length===0`: the page-level
            «لا توجد مواعيد مطابقة للفلتر» card already covers a selection that
            is empty outright, and it is exactly the gate that failed to fire
            here, because the archive selection was not empty — it was just
            somewhere else on the calendar.

            This sentence ASSERTS something, which the blank grid it replaced did
            not, so it is only allowed to stand while it cannot be false. It is
            counted in `eventsByDay` above from the same `ev.date` the card
            prints, never from a clock-relative offset, so «none of them falls in
            this month» and a card reading «٣٠ سبتمبر» can no longer occur in one
            render. Do not reintroduce a now-relative count here. */}
        {events.length>0&&inMonthCount===0&&(
          <p className={`mt-3 pt-3 border-t text-center text-[11px] leading-relaxed ${isDark?"border-white/[0.06] text-zinc-400":"border-slate-100 text-slate-500"}`}>
            لا يقع أيّ من المواعيد المطابقة للفلتر المختار ({toArabicDigits(events.length)}) في {AR_MONTHS[calMonth]} {toArabicDigits(calYear)}.
            <br/>
            استخدم سهمَي الشهر أعلاه للتنقّل، أو اعرضها في القائمة.
          </p>
        )}
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
  // The rows exactly as fetched. `events` below is this list with `dateSort`
  // re-derived against the current local day — see `todayKey`.
  const [rawEvents, setRawEvents] = useState<CalEvent[]>([]);
  // The local day the whole screen reasons about, as "YYYY-MM-DD". It is STATE,
  // not a `new Date()` read inside a memo, because a memo only recomputes when
  // its dependencies change: that is how touching a filter after midnight used
  // to re-date every row by a day, silently, in the very render that told the
  // lawyer to touch a filter.
  const [todayKey, setTodayKey] = useState<string>(() => localDayKey(new Date()));
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
      setRawEvents(
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

  // Roll the day anchor over at local midnight, and again whenever the tab comes
  // back — a laptop that slept through 00:00 has its timers throttled or dropped,
  // and «اليوم» has to be right on the screen the lawyer wakes up to. Setting an
  // unchanged string is a no-op as far as React is concerned, so the wake
  // handlers cost nothing. The timeout re-arms itself rather than the effect
  // depending on `todayKey`: an effect keyed on that value would stop re-arming
  // on the one tick that did not change it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const now = new Date();
      // Two seconds past midnight, so a tick can never land on 23:59:59.999.
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2).getTime();
      timer = setTimeout(() => { setTodayKey(localDayKey(new Date())); arm(); }, Math.max(1000, next - now.getTime()));
    };
    arm();
    const sync = () => setTodayKey(localDayKey(new Date()));
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  // `dateSort` re-derived from each row's absolute `date` against today, so the
  // headings, the period filters and the counters go on meaning what they say
  // for as long as the tab stays open. A row whose date stops parsing is dropped
  // rather than parked at offset 0 — the same rule `workflowToHearing` applies,
  // for the same reason: offset 0 is «اليوم», and «اليوم» is a claim.
  const events = useMemo(() => {
    const out: CalEvent[] = [];
    for (const ev of rawEvents) {
      const dateSort = daysBetweenDays(todayKey, ev.date);
      if (dateSort !== null) out.push({ ...ev, dateSort });
    }
    return out;
  }, [rawEvents, todayKey]);

  const card = isDark?"rounded-3xl border border-white/[0.06] bg-zinc-900/50":"rounded-3xl border border-slate-100 bg-white shadow-sm";

  const filtered = useMemo(()=>{
    let evs = events;
    if(timeFilter==="today")     evs=evs.filter(e=>e.dateSort===0);
    // Same constants groupByDate's headings use — see the note beside them.
    if(timeFilter==="week")      evs=evs.filter(e=>e.dateSort>=0&&e.dateSort<=WEEK_HORIZON_DAYS);
    if(timeFilter==="month")     evs=evs.filter(e=>e.dateSort>=0&&e.dateSort<=MONTH_HORIZON_DAYS);
    if(timeFilter==="deadlines") evs=evs.filter(e=>e.type==="deadline");
    if(timeFilter==="archive")   evs=evs.filter(e=>e.done||e.dateSort<0);
    if(timeFilter==="all")       evs=evs.filter(e=>!e.done&&e.dateSort>=0);
    if(showDeadlinesOnly) evs=evs.filter(e=>e.type==="deadline");
    if(typeFilter!=="all")   evs=evs.filter(e=>e.type===typeFilter);
    if(urgencyFilter!=="all") evs=evs.filter(e=>e.urgency===urgencyFilter);
    // The query was lowercased and none of the three haystacks were, so a Latin
    // term typed as it appears on screen («Aramco», «SABIC» — the names that
    // turn up in company and court strings) matched nothing. Arabic has no case
    // and was never affected, which is why this survived. `caseName` is searched
    // too: it is on the card, so it is findable.
    if(search.trim()){
      const q=search.trim().toLowerCase();
      const hit=(s?:string)=>!!s&&s.toLowerCase().includes(q);
      evs=evs.filter(e=>hit(e.title)||hit(e.client)||hit(e.location)||hit(e.caseName));
    }
    return evs;
  },[events,timeFilter,typeFilter,urgencyFilter,search,showDeadlinesOnly]);

  /**
   * True only when a read actually succeeded.
   *
   * `events` is `[]` while the diary is still loading AND after the read
   * failed, so every count below is 0 in three different states — and on a
   * hearings screen «٠ مجدولة» is the single most damaging sentence this
   * platform can print: it tells a practising lawyer their diary is clear.
   * Withheld rather than zeroed everywhere a number appears; «٠» is a claim.
   */
  const countsKnown   = loadState === "ready";
  const deadlineCount = events.filter(e=>e.type==="deadline"&&!e.done&&e.dateSort>=0).length;
  const todayCount    = events.filter(e=>e.dateSort===0&&!e.done).length;
  const scheduledCount= events.filter(e=>!e.done&&e.dateSort>=0).length;
  const groups = groupByDate(filtered);
  const typeCounts = Object.entries(EVENT_CONFIG).map(([k,v])=>({key:k as EventType,label:v.label,count:events.filter(e=>e.type===k&&!e.done&&e.dateSort>=0).length})).filter(t=>t.count>0);

  // The two option lists bake their counts into the LABEL string, so they are
  // gated at the point of construction: an unread diary offers «طعون» and
  // «الكل» with no figure beside them rather than «طعون (٠)», which reads as
  // "you have no appeal deadlines".
  const TIME_OPTIONS = [
    {key:"all" as const,    label:"الكل"},
    {key:"today" as const,  label:"اليوم"},
    {key:"week" as const,   label:"هذا الأسبوع"},
    {key:"month" as const,  label:"هذا الشهر"},
    {key:"deadlines" as const, label: countsKnown ? `طعون (${deadlineCount})` : "طعون"},
    {key:"archive" as const,label:"الأرشيف"},
  ];
  const TYPE_OPTIONS  = [{key:"all" as const,label: countsKnown ? `الكل (${scheduledCount})` : "الكل"},...typeCounts];
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
            {/* This line used to read «٠ مجدولة» whenever the read had not
                landed — including on the failure path, directly under the red
                «تعذّر قراءة جدول المواعيد» banner. A lawyer who is told their
                diary is empty stops looking, and that is how a court date is
                missed. The number is now printed only when it has a source. */}
            <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-500"}`}>
              {loadState==="loading"
                ? "جارٍ قراءة جدول مواعيدك…"
                : loadState==="error"
                  ? <span className="text-red-500 font-bold">تعذّرت قراءة المواعيد — العدد غير معروف</span>
                  : <>
                      {todayCount>0&&<span className="text-red-500 font-bold">{countPhraseAr(todayCount, TODAY_COUNT)} · </span>}
                      {countPhraseAr(scheduledCount, SCHEDULED_COUNT)}
                    </>}
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
          <motion.div key="cal" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-4">
            {/* Was `filtered.length>0?filtered:events`: when the active
                period/type/priority/search filters excluded every row, the
                calendar quietly fell back to the UNFILTERED diary and drew dots
                the lawyer had just filtered away — so the two views answered the
                same question differently, and the calendar's answer was the one
                that ignored the filter. It now shows exactly what the filter
                selected, and says so when that is nothing, in the same words the
                list view directly below already uses — but only when there was
                something to exclude. On a genuinely empty diary the filter is
                not the reason, and the «لا توجد مواعيد مسجّلة» card at the top
                of the page is already saying the true one. */}
            {events.length>0&&filtered.length===0&&(
              <div className={`${card} p-8 text-center`}>
                <CalendarCheck size={32} weight="duotone" className={`mx-auto mb-3 ${isDark?"text-zinc-700":"text-slate-300"}`}/>
                <p className={`text-sm ${isDark?"text-zinc-500":"text-slate-400"}`}>لا توجد مواعيد مطابقة للفلتر المختار</p>
              </div>
            )}
            <CalendarView events={filtered} isDark={isDark}/>
          </motion.div>
        ):(
          <motion.div key="list" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-6">
            {/* The calendar branch above already learned to tell «the filter
                excluded everything» apart from «the diary is empty»; its own
                list sibling, twenty lines below it, did not — so shot 24 caught
                «لا توجد مواعيد مطابقة للفلتر المختار» on a diary with zero rows
                and no filter set, sending a lawyer hunting for a filter that
                was never applied. Same branch, same words, both views. */}
            {groups.length===0&&(
              <div className={`${card} p-12 text-center`}>
                <CalendarCheck size={36} weight="duotone" className={`mx-auto mb-3 ${isDark?"text-zinc-700":"text-slate-300"}`}/>
                {events.length>0 ? (
                  <p className={`text-sm ${isDark?"text-zinc-500":"text-slate-400"}`}>لا توجد مواعيد مطابقة للفلتر المختار</p>
                ) : (
                  <>
                    <p className={`text-sm font-bold ${isDark?"text-zinc-400":"text-slate-500"}`}>لا توجد مواعيد مسجّلة</p>
                    <p className={`text-[12px] mt-1 ${isDark?"text-zinc-600":"text-slate-400"}`}>ابدأ بزر «موعد جديد» في أعلى الصفحة.</p>
                  </>
                )}
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
