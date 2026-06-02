"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CalendarBlank, ArrowsLeftRight, SunDim, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ── Hijri conversion ──────────────────────────────────────────────────
const HM = ["محرم","صفر","ربيع الأول","ربيع الثاني","جمادى الأولى","جمادى الثانية","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
const GM_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const DAYS_AR = ["أح","اث","ث","أر","خ","ج","س"];
const DAYS_FULL = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

function toJD(y:number,m:number,d:number){const a=Math.floor((14-m)/12);const yr=y+4800-a;const mn=m+12*a-3;return d+Math.floor((153*mn+2)/5)+365*yr+Math.floor(yr/4)-Math.floor(yr/100)+Math.floor(yr/400)-32045;}
function jdToG(jd:number){const a=jd+32044;const b=Math.floor((4*a+3)/146097);const c=a-Math.floor(146097*b/4);const d=Math.floor((4*c+3)/1461);const e=c-Math.floor(1461*d/4);const mn=Math.floor((5*e+2)/153);return{day:e-Math.floor((153*mn+2)/5)+1,month:mn+3-12*Math.floor(mn/10),year:100*b+d-4800+Math.floor(mn/10)};}
function toHijri(date:Date){const jd=toJD(date.getFullYear(),date.getMonth()+1,date.getDate());let l=jd-1948440+10632;const n=Math.floor((l-1)/10631);l=l-10631*n+354;const J=Math.floor((10985-l)/5316)*Math.floor(50*l/17719)+Math.floor(l/5670)*Math.floor(43*l/15238);const lf=l-Math.floor((30-J)/15)*Math.floor(17719*J/50)-Math.floor(J/16)*Math.floor(15238*J/43)+29;const hm=Math.floor(24*lf/709);const hd=lf-Math.floor(709*hm/24);return{d:hd,m:hm,y:30*n+J-30,monthName:HM[(hm-1)%12]};}
function fromHijri(hd:number,hm:number,hy:number):Date{const n=Math.floor((hy-1)/30);const yr=hy-30*n-1;const J=Math.floor((yr*11+3)/30)+354*yr+30*hm-Math.floor((hm-1)/2)+hd+29+10631*n+1948440-385;const{year,month,day}=jdToG(J);return new Date(year,month-1,day);}
function ar(n:number|string){return String(n).replace(/[0-9]/g,d=>"٠١٢٣٤٥٦٧٨٩"[+d]);}

// ── Mock tasks for calendar dots ──────────────────────────────────────
const MOCK_TASKS: Record<string,{type:"hearing"|"task"|"deadline";label:string}[]> = {
  [new Date().toDateString()]: [{type:"hearing",label:"جلسة: المحكمة التجارية - ٩ ص"},{type:"task",label:"مراجعة عقد الشركاء"}],
  [new Date(Date.now()+86400000).toDateString()]: [{type:"deadline",label:"موعد تقديم مذكرة الطعن"}],
  [new Date(Date.now()+2*86400000).toDateString()]: [{type:"hearing",label:"جلسة: محكمة الاستئناف - ٢ م"}],
  [new Date(Date.now()+4*86400000).toDateString()]: [{type:"task",label:"إعداد عقد الخدمات"},{type:"task",label:"رد على بريد الموكل"}],
};

const TYPE_COLOR = {hearing:"bg-blue-500",task:"bg-emerald-500",deadline:"bg-red-500"} as const;
const TYPE_LABEL = {hearing:"جلسة",task:"مهمة",deadline:"موعد حرج"} as const;

// ── Component ─────────────────────────────────────────────────────────
export default function HijriDateWidget() {
  const { isDark, calendarType } = useTheme();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"calendar"|"converter">("calendar");
  const [now, setNow] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Converter state
  const [dir, setDir] = useState<"g2h"|"h2g">("g2h");
  const [gD,setGD]=useState(""); const [gM,setGM]=useState(""); const [gY,setGY]=useState("");
  const [hD,setHD]=useState(""); const [hM,setHM]=useState(""); const [hY,setHY]=useState("");
  const [result,setResult]=useState<string|null>(null);

  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),60_000);return()=>clearInterval(t);},[]);

  const hijriToday = toHijri(now);
  const dayName = DAYS_FULL[now.getDay()];
  const gStr = `${ar(now.getDate())} ${GM_AR[now.getMonth()]} ${ar(now.getFullYear())} م`;
  const hStr = `${ar(hijriToday.d)} ${hijriToday.monthName} ${ar(hijriToday.y)} هـ`;

  // Calendar grid
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth()+1, 0).getDate();
  const startDow = firstDay.getDay(); // 0=Sun
  const cells: (Date|null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({length:daysInMonth},(_,i)=>new Date(viewDate.getFullYear(),viewDate.getMonth(),i+1)),
  ];
  while(cells.length%7!==0) cells.push(null);

  const prevMonth=()=>setViewDate(d=>new Date(d.getFullYear(),d.getMonth()-1,1));
  const nextMonth=()=>setViewDate(d=>new Date(d.getFullYear(),d.getMonth()+1,1));

  const convert=useCallback(()=>{
    setResult(null);
    if(dir==="g2h"){const d=+gD,m=+gM,y=+gY;if(!d||!m||!y||m>12||d>31){setResult("تحقق من الأرقام");return;}const h=toHijri(new Date(y,m-1,d));setResult(`${ar(h.d)} ${h.monthName} ${ar(h.y)} هـ`);}
    else{const d=+hD,m=+hM,y=+hY;if(!d||!m||!y||m>12||d>30){setResult("تحقق من الأرقام");return;}const g=fromHijri(d,m,y);setResult(`${ar(g.getDate())} ${GM_AR[g.getMonth()]} ${ar(g.getFullYear())} م`);}
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
        {(calendarType==="hijri"||calendarType==="both") && (
          <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-bold ${isDark?"bg-emerald-500/15 text-emerald-400":"bg-emerald-50 text-emerald-700"}`}>
            {ar(hijriToday.d)} {hijriToday.monthName.split(" ")[0]}
          </span>
        )}
        {(calendarType==="miladi"||calendarType==="both") && (
          <span className={`text-[10px] ${isDark?"text-[#C8A762]":"text-amber-700"}`}>
            {ar(now.getDate())}/{ar(now.getMonth()+1)}
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
                <p className={`text-[18px] font-black leading-tight ${isDark?"text-emerald-400":"text-emerald-700"}`} style={{fontFamily:"var(--font-brand)"}}>
                  {hStr}
                </p>
                <p className={`text-[12px] font-semibold mt-0.5 ${isDark?"text-[#C8A762]":"text-amber-700"}`}>{gStr}</p>
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
                        {toHijri(firstDay).monthName} {ar(toHijri(firstDay).y)} هـ
                      </p>
                      {/* Miladi month = secondary */}
                      <p className={`text-[10px] font-semibold ${isDark?"text-[#C8A762]":"text-amber-600"}`}>
                        {GM_AR[viewDate.getMonth()]} {viewDate.getFullYear()}
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
                      const isToday = cell.toDateString()===now.toDateString();
                      const isSelected = selectedDay?.toDateString()===cell.toDateString();
                      const tasks = MOCK_TASKS[cell.toDateString()]??[];
                      const hijriDay = toHijri(cell).d;
                      return (
                        <button key={i} onClick={()=>setSelectedDay(isSelected?null:cell)}
                          className={`relative flex flex-col items-center py-1.5 rounded-xl transition-all ${
                            isSelected?(isDark?"bg-royal text-white":"bg-royal text-white"):
                            isToday?(isDark?"bg-royal/20 text-royal":"bg-royal/10 text-royal font-bold"):
                            isDark?"text-zinc-300 hover:bg-white/[0.05]":"text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {/* Hijri day = primary (big, emerald) */}
                          <span className={`text-[13px] font-bold leading-none ${isSelected?"text-white":isDark?"text-emerald-400":"text-emerald-700"}`}>{ar(hijriDay)}</span>
                          {/* Miladi day = secondary (small, muted) */}
                          <span className={`text-[9px] mt-0.5 ${isSelected?"text-white/60":isDark?"text-zinc-500":"text-slate-400"}`}>{ar(cell.getDate())}</span>
                          {tasks.length>0&&(
                            <div className="flex gap-0.5 mt-0.5">
                              {tasks.slice(0,3).map((t,ti)=>(
                                <span key={ti} className={`w-1 h-1 rounded-full ${TYPE_COLOR[t.type]} ${isSelected?"opacity-80":""}`}/>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected day events */}
                  <AnimatePresence>
                    {selectedDay&&(
                      <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                        transition={{type:"spring",stiffness:200,damping:25}} className="overflow-hidden mt-3"
                      >
                        <div className={`rounded-xl p-3 border ${isDark?"border-white/[0.06] bg-white/[0.02]":"border-slate-100 bg-slate-50"}`}>
                          <p className={`text-[11px] font-bold mb-2 ${isDark?"text-zinc-400":"text-slate-500"}`}>
                            {ar(selectedDay.getDate())} {GM_AR[selectedDay.getMonth()]}
                          </p>
                          {(MOCK_TASKS[selectedDay.toDateString()]??[]).length===0?(
                            <p className={`text-[11px] ${isDark?"text-zinc-600":"text-slate-400"}`}>لا توجد أحداث في هذا اليوم</p>
                          ):(MOCK_TASKS[selectedDay.toDateString()]).map((t,i)=>(
                            <div key={i} className="flex items-center gap-2 mb-1.5 last:mb-0">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TYPE_COLOR[t.type]}`}/>
                              <span className={`text-[11px] font-medium ${isDark?"text-zinc-300":"text-slate-700"}`}>{t.label}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ms-auto flex-shrink-0 ${isDark?"bg-white/[0.06] text-zinc-500":"bg-slate-200 text-slate-500"}`}>{TYPE_LABEL[t.type]}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Legend */}
                  <div className="flex items-center gap-3 mt-3 justify-center">
                    {(["hearing","task","deadline"] as const).map(type=>(
                      <div key={type} className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${TYPE_COLOR[type]}`}/>
                        <span className={`text-[10px] ${isDark?"text-zinc-600":"text-slate-400"}`}>{TYPE_LABEL[type]}</span>
                      </div>
                    ))}
                  </div>
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
