"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CalendarBlank, ArrowsLeftRight, SunDim, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  hijriPartsOf,
  gregorianFromHijri,
  toArabicDigits,
} from "@/lib/services/hijri";

// ── Hijri conversion ──────────────────────────────────────────────────
//
// THE ARITHMETIC THAT USED TO LIVE HERE WAS A DAY WRONG. `toJD`/`toHijri`/
// `fromHijri` were a JS port of a tabular C routine that relies on truncation
// toward zero; `Math.floor` is not that for the negative `(14 - m) / 12` term,
// so the Julian day came out wrong for most months. Measured on 2026-08-27:
// Umm al-Qura — the calendar Saudi courts file against — said 14 Rabiʿ al-Awwal
// 1448; this widget said 13. It is mounted in three places, including
// SharedSidebar, so every account type saw it.
//
// The lawyer hearings page hit the same class of bug and was repaired by asking
// the runtime instead of re-deriving. That answer now lives in one module with
// a 400-day round-trip test, and this file is its second caller.
//
// Every helper there returns `null` when the runtime has no Umm al-Qura data,
// and this component renders NOTHING for the Hijri half in that case. A gap is
// honest; a Gregorian day printed under a «هـ» is not.
const GM_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const DAYS_AR = ["أح","اث","ث","أر","خ","ج","س"];
const DAYS_FULL = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

/** Kept as a local alias so the JSX below reads unchanged. */
const ar = toArabicDigits;

// ── This widget shows dates. It does NOT show a schedule. ─────────────
//
// Audit 2026-08-27 — deleted from here: a `MOCK_TASKS` literal whose keys were
// computed from `new Date()` at module load, so it never went stale and always
// looked like today's real agenda. It put «جلسة: المحكمة التجارية - ٩ ص» on
// today's cell, «موعد تقديم مذكرة الطعن» on tomorrow's, and «جلسة: محكمة
// الاستئناف - ٢ م» two days out — a named court, a time and an appeal deadline,
// rendered as this lawyer's own calendar, on every one of the six real accounts,
// with nothing on screen marking it as sample data. It was rendered, not dead:
// coloured dots on the month grid and labelled «جلسة/مهمة/موعد حرج» rows on
// day-click. The colour/label maps and the legend went with it.
//
// It was NOT replaced with a real feed. This component takes no props, has no
// query, and is mounted in three places (the lawyer overview header, the
// activity page header, the shared sidebar) — two of which are not lawyer
// surfaces at all, so there is no one hearings source it could honestly read.
// The lawyer's real schedule already has a screen: /dashboard/lawyer/hearings,
// backed by `service_requests.metadata.date`. Wiring this widget to it is a
// feature with an owner and a data contract, not a hole to plug with a literal.
//
// Clicking a day now shows that day's date in both calendars, which is the one
// thing this component can state truthfully — and is what a Hijri date tool is
// actually for.

// ── Component ─────────────────────────────────────────────────────────
export default function HijriDateWidget() {
  const { isDark, calendarType } = useTheme();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"calendar"|"converter">("calendar");
  // ── `now` STARTS null, AND THAT IS THE FIX ──────────────────────────
  //
  // It used to be `useState(new Date())`, which is evaluated during server
  // render. The HTML therefore carried the SERVER's clock, and Nginx caches
  // that HTML — so the date pill in the sidebar of every account showed
  // whenever the page was last cached, not today. The owner's screenshots
  // prove it, and prove it is a cache and not arithmetic, because DIFFERENT
  // FIELDS are wrong on different days while other days are perfect:
  //
  //   shown ٢٦/٨ الأربعاء ١٢ ربيع   weekday right, Hijri day should be ١٣
  //   shown ٢٧/٨ الأربعاء ١٤ ربيع   Hijri day right, weekday should be الخميس
  //   shown ٣٠/٨ الأحد   ١٧ ربيع   correct
  //   shown ٣١/٨ الاثنين ١٨ ربيع   correct
  //
  // `dayName` and the Gregorian half both read the same `now`, so they can
  // never disagree with each other in one render — the only way the pair can
  // be internally consistent yet wrong is if the render itself is old. The
  // 60-second interval below then refreshed some of it, which is why the two
  // bad shots are each wrong in one field rather than both.
  //
  // With null, the server emits no date at all, so there is nothing to cache
  // wrong; the browser fills it in on mount from the browser's own clock.
  const [now, setNow] = useState<Date | null>(null);
  const [viewDate, setViewDate] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Converter state
  const [dir, setDir] = useState<"g2h"|"h2g">("g2h");
  const [gD,setGD]=useState(""); const [gM,setGM]=useState(""); const [gY,setGY]=useState("");
  const [hD,setHD]=useState(""); const [hM,setHM]=useState(""); const [hY,setHY]=useState("");
  const [result,setResult]=useState<string|null>(null);

  useEffect(()=>{
    setNow(new Date());
    setViewDate(new Date());
    const t=setInterval(()=>setNow(new Date()),60_000);
    return()=>clearInterval(t);
  },[]);

  const hijriToday = now ? hijriPartsOf(now) : null;
  const dayName = now ? DAYS_FULL[now.getDay()] : "";
  const gStr = now ? `${ar(now.getDate())} ${GM_AR[now.getMonth()]} ${ar(now.getFullYear())} م` : "";
  // null on a runtime without Umm al-Qura data. Callers below render the
  // Gregorian half alone rather than a Hijri date nobody can stand behind.
  const hStr = hijriToday
    ? `${ar(hijriToday.day)} ${hijriToday.monthName} ${ar(hijriToday.year)} هـ`
    : null;

  // Calendar grid. `viewDate` is null until mount for the same reason `now` is,
  // so the grid is empty on the server — the modal cannot be open there anyway.
  const firstDay = viewDate ? new Date(viewDate.getFullYear(), viewDate.getMonth(), 1) : null;
  const daysInMonth = viewDate ? new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 0).getDate() : 0;
  const startDow = firstDay ? firstDay.getDay() : 0; // 0=Sun
  const cells: (Date|null)[] = viewDate ? [
    ...Array(startDow).fill(null),
    ...Array.from({length:daysInMonth},(_,i)=>new Date(viewDate.getFullYear(),viewDate.getMonth(),i+1)),
  ] : [];
  while(cells.length%7!==0) cells.push(null);

  const prevMonth=()=>setViewDate(d=>d?new Date(d.getFullYear(),d.getMonth()-1,1):d);
  const nextMonth=()=>setViewDate(d=>d?new Date(d.getFullYear(),d.getMonth()+1,1):d);

  const convert=useCallback(()=>{
    setResult(null);
    if(dir==="g2h"){
      const d=+gD,m=+gM,y=+gY;
      if(!d||!m||!y||m>12||d>31){setResult("تحقق من الأرقام");return;}
      const h=hijriPartsOf(new Date(y,m-1,d));
      setResult(h ? `${ar(h.day)} ${h.monthName} ${ar(h.year)} هـ` : "تعذّر التحويل على هذا الجهاز");
    } else {
      const d=+hD,m=+hM,y=+hY;
      if(!d||!m||!y||m>12||d>30){setResult("تحقق من الأرقام");return;}
      // null has two meanings and both are honest answers: the runtime cannot
      // convert, or that Hijri day does not exist (the 30th of a 29-day month).
      // The old code returned a nearby Gregorian date for the second case,
      // which is a silently shifted deadline.
      const g=gregorianFromHijri(d,m,y);
      setResult(g ? `${ar(g.getDate())} ${GM_AR[g.getMonth()]} ${ar(g.getFullYear())} م` : "لا يوجد هذا التاريخ في التقويم الهجري");
    }
  },[dir,gD,gM,gY,hD,hM,hY]);

  const inputCls=`w-full px-2 py-2 rounded-xl border text-[13px] text-center font-bold outline-none transition-all ${isDark?"bg-zinc-800 border-white/[0.08] text-white placeholder:text-zinc-600 focus:border-royal/40":"bg-slate-50 border-slate-200 text-slate-800 focus:border-royal/40"}`;
  const panelCls=`w-full max-w-[360px] rounded-3xl overflow-hidden shadow-2xl ${isDark?"bg-zinc-900 border border-white/[0.08]":"bg-white border border-slate-100"}`;

  const chipBase = isDark
    ? "border border-white/[0.08] bg-zinc-800/80 text-zinc-300 hover:border-royal/30"
    : "border border-slate-200 bg-white text-slate-700 hover:border-royal/30 shadow-sm";

  return (
    <>
      {/* Chip */}
      <button onClick={()=>setOpen(true)} className={`flex items-center gap-2 px-3 py-2 rounded-2xl text-[12px] font-semibold transition-all cursor-pointer ${chipBase}`}>
        <SunDim size={14} weight="duotone" className="text-amber-500 flex-shrink-0"/>
        <span className="hidden sm:block">{dayName}</span>
        {/* `hijriToday &&` is load-bearing, not defensive noise: the chip is the
            one part of this widget that renders in the header of every page, so
            a runtime with no Umm al-Qura data would otherwise put «undefined»
            next to the date on every screen in the app. */}
        {(calendarType==="hijri"||calendarType==="both") && hijriToday && (
          <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-bold ${isDark?"bg-emerald-500/15 text-emerald-400":"bg-emerald-50 text-emerald-700"}`}>
            {/* THE WHOLE MONTH NAME. This used to be `.split(" ")[0]`, which
                turned «ربيع الأول» and «ربيع الثاني» — and «جمادى الأولى» and
                «جمادى الثانية» — into the same two words. Four of the twelve
                Hijri months are only told apart by the word this dropped, so
                the pill was ambiguous by a whole month for a third of the year,
                on a screen lawyers count filing deadlines from. It showed up in
                ten of the owner's thirty-four screenshots. */}
            {ar(hijriToday.day)} {hijriToday.monthName}
          </span>
        )}
        {(calendarType==="miladi"||calendarType==="both") && now && (
          <span className={`text-[10px] ${isDark?"text-[#C8A762]":"text-amber-700"}`}>
            {ar(now.getDate())}/{ar(now.getMonth()+1)}/{ar(now.getFullYear())}
          </span>
        )}
      </button>

      {/* Modal */}
      <AnimatePresence>
        {open&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={()=>setOpen(false)}
          >
            <motion.div initial={{scale:0.94,y:20}} animate={{scale:1,y:0}} exit={{scale:0.94,y:10}}
              transition={{type:"spring",stiffness:300,damping:28}}
              onClick={e=>e.stopPropagation()} className={panelCls} dir="rtl"
            >
              {/* Header */}
              <div className={`px-5 pt-5 pb-3 border-b ${isDark?"border-white/[0.06]":"border-slate-100"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-royal/10 flex items-center justify-center">
                      <CalendarBlank size={16} weight="duotone" className="text-royal"/>
                    </div>
                    <p className={`text-[14px] font-bold ${isDark?"text-white":"text-slate-800"}`}>التاريخ اليوم</p>
                  </div>
                  <button onClick={()=>setOpen(false)} className={`p-2 rounded-xl transition-colors ${isDark?"hover:bg-white/[0.06] text-zinc-500":"hover:bg-slate-100 text-slate-400"}`}>
                    <X size={16}/>
                  </button>
                </div>
                {/* Today display — Hijri primary, Miladi secondary */}
                <p className={`text-[11px] font-semibold mb-0.5 ${isDark?"text-zinc-500":"text-slate-400"}`}>{dayName}</p>
                {/* When the runtime has no Umm al-Qura data the Gregorian date
                    takes the primary line instead of leaving an empty one above
                    it. Rare, but «التقويم الهجري» over a blank is a worse
                    screen than a Gregorian date shown plainly. */}
                {hStr ? (
                  <>
                    <p className={`text-[18px] font-black leading-tight ${isDark?"text-emerald-400":"text-emerald-700"}`} style={{fontFamily:"var(--font-brand)"}}>
                      {hStr}
                    </p>
                    <p className={`text-[12px] font-semibold mt-0.5 ${isDark?"text-[#C8A762]":"text-amber-700"}`}>{gStr}</p>
                  </>
                ) : (
                  <p className={`text-[18px] font-black leading-tight ${isDark?"text-[#C8A762]":"text-amber-700"}`} style={{fontFamily:"var(--font-brand)"}}>
                    {gStr}
                  </p>
                )}
              </div>

              {/* Tabs */}
              <div className={`flex border-b ${isDark?"border-white/[0.06]":"border-slate-100"}`}>
                {([{id:"calendar",label:"التقويم"},{id:"converter",label:"محوّل التاريخ"}] as const).map(t=>(
                  <button key={t.id} onClick={()=>setTab(t.id)}
                    className={`flex-1 py-2.5 text-[12px] font-bold transition-colors ${tab===t.id?(isDark?"text-white border-b-2 border-royal":"text-royal border-b-2 border-royal"):(isDark?"text-zinc-500 hover:text-zinc-300":"text-slate-400 hover:text-slate-600")}`}
                  >{t.label}</button>
                ))}
              </div>

              {/* ── Calendar Tab ── */}
              {tab==="calendar"&&(
                <div className="p-4">
                  {/* Month nav */}
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={prevMonth} className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark?"hover:bg-white/[0.06] text-zinc-400":"hover:bg-slate-100 text-slate-500"}`}>
                      <CaretRight size={14}/>
                    </button>
                    <div className="text-center">
                      {/* Hijri month = primary */}
                      <p className={`text-[14px] font-bold ${isDark?"text-white":"text-slate-800"}`}>
                        {(() => {
                          const h = firstDay ? hijriPartsOf(firstDay) : null;
                          return h ? `${h.monthName} ${ar(h.year)} هـ` : "";
                        })()}
                      </p>
                      {/* Miladi month = secondary */}
                      <p className={`text-[10px] font-semibold ${isDark?"text-[#C8A762]":"text-amber-600"}`}>
                        {viewDate ? `${GM_AR[viewDate.getMonth()]} ${viewDate.getFullYear()}` : ""}
                      </p>
                    </div>
                    <button onClick={nextMonth} className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark?"hover:bg-white/[0.06] text-zinc-400":"hover:bg-slate-100 text-slate-500"}`}>
                      <CaretLeft size={14}/>
                    </button>
                  </div>

                  {/* Day headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {DAYS_AR.map(d=>(
                      <div key={d} className={`text-center text-[10px] font-bold py-1 ${isDark?"text-zinc-600":"text-slate-400"}`}>{d}</div>
                    ))}
                  </div>

                  {/* Day cells */}
                  <div className="grid grid-cols-7 gap-0.5">
                    {cells.map((cell,i)=>{
                      if(!cell) return <div key={i}/>;
                      const isToday = now !== null && cell.toDateString()===now.toDateString();
                      const isSelected = selectedDay?.toDateString()===cell.toDateString();
                      const hijriDay = hijriPartsOf(cell)?.day ?? null;
                      return (
                        <button key={i} onClick={()=>setSelectedDay(isSelected?null:cell)}
                          className={`relative flex flex-col items-center py-1.5 rounded-xl transition-all ${
                            isSelected?(isDark?"bg-royal text-white":"bg-royal text-white"):
                            isToday?(isDark?"bg-royal/20 text-royal":"bg-royal/10 text-royal font-bold"):
                            isDark?"text-zinc-300 hover:bg-white/[0.05]":"text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {/* Hijri day = primary (big, emerald) */}
                          <span className={`text-[13px] font-bold leading-none ${isSelected?"text-white":isDark?"text-emerald-400":"text-emerald-700"}`}>{hijriDay === null ? "" : ar(hijriDay)}</span>
                          {/* Miladi day = secondary (small, muted) */}
                          <span className={`text-[9px] mt-0.5 ${isSelected?"text-white/60":isDark?"text-zinc-500":"text-slate-400"}`}>{ar(cell.getDate())}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected day — the full date in both calendars. Derived
                      from the clicked cell, so there is nothing here that is
                      not simply true of that day. */}
                  <AnimatePresence>
                    {selectedDay&&(
                      <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                        transition={{type:"spring",stiffness:200,damping:25}} className="overflow-hidden mt-3"
                      >
                        <div className={`rounded-xl p-3 border ${isDark?"border-white/[0.06] bg-white/[0.02]":"border-slate-100 bg-slate-50"}`}>
                          <p className={`text-[10px] font-semibold mb-1 ${isDark?"text-zinc-500":"text-slate-400"}`}>
                            {DAYS_FULL[selectedDay.getDay()]}
                          </p>
                          <p className={`text-[13px] font-bold ${isDark?"text-emerald-400":"text-emerald-700"}`}>
                            {(() => {
                              const h = hijriPartsOf(selectedDay);
                              return h ? `${ar(h.day)} ${h.monthName} ${ar(h.year)} هـ` : "";
                            })()}
                          </p>
                          <p className={`text-[11px] font-semibold mt-0.5 ${isDark?"text-[#C8A762]":"text-amber-700"}`}>
                            {ar(selectedDay.getDate())} {GM_AR[selectedDay.getMonth()]} {ar(selectedDay.getFullYear())} م
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* No legend: there are no event dots left to explain. This
                      line replaces it so a lawyer who remembers the old
                      coloured dots is told they are gone, not left hunting for
                      them. Deliberately role-neutral and with no link — this
                      component is also mounted in SharedSidebar, which every
                      account type renders, so it cannot point at a
                      lawyer-only route. */}
                  <p className={`text-[10px] text-center mt-3 ${isDark?"text-zinc-600":"text-slate-400"}`}>
                    تقويم للتواريخ فقط — لا يعرض المواعيد والجلسات
                  </p>
                </div>
              )}

              {/* ── Converter Tab ── */}
              {tab==="converter"&&(
                <div className="p-5 space-y-4">
                  <div className={`flex rounded-2xl p-1 ${isDark?"bg-zinc-800":"bg-slate-100"}`}>
                    {([{key:"g2h",label:"ميلادي ← هجري"},{key:"h2g",label:"هجري ← ميلادي"}] as const).map(d=>(
                      <button key={d.key} onClick={()=>{setDir(d.key);setResult(null);}}
                        className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all ${dir===d.key?(isDark?"bg-zinc-700 text-white shadow-sm":"bg-white text-royal shadow-sm"):(isDark?"text-zinc-500":"text-slate-400")}`}
                      >{d.label}</button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(dir==="g2h" ? [
                      {label:"اليوم",v:gD,set:setGD,ph:"١٥",max:31},
                      {label:"الشهر",v:gM,set:setGM,ph:"٣",max:12},
                      {label:"السنة",v:gY,set:setGY,ph:"٢٠٢٦",max:9999},
                    ] : [
                      {label:"اليوم",v:hD,set:setHD,ph:"١",max:30},
                      {label:"الشهر",v:hM,set:setHM,ph:"٩",max:12},
                      {label:"السنة",v:hY,set:setHY,ph:"١٤٤٧",max:9999},
                    ] as {label:string;v:string;set:(val:string)=>void;ph:string;max:number}[]
                    ).map(f=>(
                      <div key={f.label}>
                        <p className={`text-[10px] font-bold mb-1 ${isDark?"text-zinc-600":"text-slate-400"}`}>{f.label}</p>
                        <input type="number" value={f.v} onChange={e=>f.set(e.target.value)} placeholder={f.ph} min={1} max={f.max} className={inputCls}/>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button onClick={convert} className="flex-1 py-3 rounded-2xl font-bold text-[13px] bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors flex items-center justify-center gap-2">
                      <ArrowsLeftRight size={16} weight="bold"/> تحويل
                    </button>
                    <button onClick={()=>{setGD("");setGM("");setGY("");setHD("");setHM("");setHY("");setResult(null);}}
                      className={`px-4 py-3 rounded-2xl font-bold text-[12px] border transition-colors ${isDark?"border-white/[0.08] text-zinc-500":"border-slate-200 text-slate-400"}`}
                    >مسح</button>
                  </div>

                  <AnimatePresence>
                    {result&&(
                      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}}
                        className={`p-4 rounded-2xl border text-center ${isDark?"border-royal/30 bg-royal/10":"border-royal/20 bg-royal/5"}`}
                      >
                        <p className={`text-[11px] font-bold mb-1 ${isDark?"text-zinc-500":"text-slate-400"}`}>النتيجة</p>
                        <p className={`text-[18px] font-black ${isDark?"text-white":"text-slate-800"}`} style={{fontFamily:"var(--font-brand)"}}>{result}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
