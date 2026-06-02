"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlayCircle, YoutubeLogo, BookOpenText, PaintBrush,
  Lock, ArrowUpRight, ArrowLeft, ArrowRight,
  Clock, Eye, Sparkle, Lightning, Check, Star,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { REELS, EPISODES, NOVELS, COMICS, MARQUEE } from "./data";

type Tab = "reels" | "youtube" | "novels" | "comics";

// ─── Lock overlay ────────────────────────────────────────────────────────────
function GateOverlay({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-3 z-10"
      style={{ backdropFilter:"blur(12px)", background:"rgba(5,10,8,.7)" }}>
      <div className="h-10 w-10 rounded-xl bg-[#C8A762]/15 border border-[#C8A762]/30 flex items-center justify-center">
        <Lock size={18} className="text-[#C8A762]" weight="duotone"/>
      </div>
      <p className="text-[12px] font-bold text-white text-center px-4">
        {isLoggedIn ? "اشتراك ميديا نظامي مطلوب" : "سجّل دخولك للوصول"}
      </p>
      <Link href={isLoggedIn ? "/pricing" : "/login"}
        className="text-[11px] font-bold px-4 py-2 rounded-xl bg-[#C8A762] text-[#050a08] hover:bg-[#C8A762]/90 transition-colors active:scale-[.97]">
        {isLoggedIn ? "اشترك — ٩ ر.س/شهر" : "دخول مجاني"}
      </Link>
    </div>
  );
}

// ─── Kinetic Marquee ─────────────────────────────────────────────────────────
function Marquee() {
  const items = [...MARQUEE, ...MARQUEE];
  return (
    <div className="overflow-hidden border-y border-white/[0.05] py-3 my-10">
      <motion.div className="flex gap-8 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 24, repeat: Infinity, ease: "linear" }}>
        {items.map((it, i) => (
          <span key={i} className="flex items-center gap-3 text-[11px] font-bold text-zinc-700 tracking-widest uppercase">
            {it}<span className="h-1 w-1 rounded-full bg-[#C8A762] flex-shrink-0"/>
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ─── Subscription Banner ─────────────────────────────────────────────────────
function SubBanner({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#C8A762]/20 bg-gradient-to-l from-[#C8A762]/8 via-[#050a08] to-[#0B3D2E]/15 p-8 my-12">
      <div className="absolute top-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-[#C8A762]/40 to-transparent"/>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C8A762]/30 bg-[#C8A762]/5 px-3 py-1 mb-4">
            <Lightning size={10} weight="fill" className="text-[#C8A762]"/>
            <span className="text-[10px] font-black text-[#C8A762] tracking-widest uppercase">وصول مبكر حصري</span>
          </div>
          <h2 className="text-[28px] md:text-[34px] font-black text-white leading-tight tracking-tighter mb-3">
            نظامي ميديا<br/>
            <span className="text-zinc-600">كل الروايات. كل الكوميكس.</span>
          </h2>
          <div className="flex flex-col gap-2 mb-6">
            {["اقرأ كل الروايات قبل نشرها للعموم","كل الكوميكس القانونية — بلا قيود","محتوى جديد كل أسبوع","إلغاء الاشتراك في أي وقت"].map((f,i)=>(
              <div key={i} className="flex items-center gap-2">
                <Check size={12} className="text-[#C8A762]" weight="bold"/>
                <span className="text-[12px] text-zinc-400">{f}</span>
              </div>
            ))}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[42px] font-black text-white leading-none">٩</span>
            <span className="text-[16px] font-bold text-zinc-500">ريال/شهر</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 min-w-[200px]">
          <Link href={isLoggedIn ? "/pricing" : "/register"}
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#C8A762] hover:bg-[#C8A762]/90 px-6 py-4 text-[14px] font-black text-[#050a08] transition-all active:scale-[.98] shadow-[0_8px_32px_-8px_rgba(200,167,98,.4)]">
            <Star size={14} weight="fill"/>
            {isLoggedIn ? "اشترك الآن" : "ابدأ مجاناً"}
          </Link>
          {!isLoggedIn && (
            <Link href="/login"
              className="text-center text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">
              لديك حساب؟ سجّل دخولك
            </Link>
          )}
          <p className="text-center text-[10px] text-zinc-700">إلغاء مجاني في أي وقت</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MediaPage() {
  const [tab, setTab] = useState<Tab>("reels");
  const { isLoggedIn } = useUser();
  const hasMedia = false; // TODO: check media subscription from useUser when backend ready
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (d: "l"|"r") => scrollRef.current?.scrollBy({ left: d==="l"?-220:220, behavior:"smooth" });

  const TABS: { id: Tab; label: string; icon: React.ElementType; free: boolean }[] = [
    { id:"reels",   label:"ريلز",    icon:PlayCircle,   free:true  },
    { id:"youtube", label:"بودكاست", icon:YoutubeLogo,  free:true  },
    { id:"novels",  label:"روايات",  icon:BookOpenText, free:false },
    { id:"comics",  label:"كوميكس",  icon:PaintBrush,   free:false },
  ];

  return (
    <main className="min-h-[100dvh] bg-[#050a08] text-white pt-28 pb-24" dir="rtl">

      {/* ── HERO (split — text right, visual left in RTL) ── */}
      <section className="mx-auto max-w-[1400px] px-6 grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-12 items-center mb-4">
        {/* Visual */}
        <div className="hidden md:grid grid-cols-2 gap-3 opacity-60">
          {[
            { lbl:"مجاني", sub:"ريلز + بودكاست", cls:"aspect-video col-span-2" },
            { lbl:"روايات", sub:"٩ ر.س/شهر", cls:"aspect-square" },
            { lbl:"كوميكس", sub:"٩ ر.س/شهر", cls:"aspect-square" },
          ].map((c,i)=>(
            <motion.div key={i} initial={{opacity:0,scale:.94}} animate={{opacity:1,scale:1}}
              transition={{delay:i*.1,type:"spring",stiffness:80}}
              className={`${c.cls} rounded-2xl border border-white/[0.06] bg-white/[0.02] flex flex-col items-center justify-center gap-1`}>
              <span className="text-[20px] font-black text-zinc-700">{c.lbl}</span>
              <span className="text-[9px] text-zinc-800 font-bold tracking-widest uppercase">{c.sub}</span>
            </motion.div>
          ))}
        </div>
        {/* Text */}
        <motion.div initial={{opacity:0,x:24}} animate={{opacity:1,x:0}} transition={{duration:.7,ease:[.16,1,.3,1]}}>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C8A762]/30 bg-[#C8A762]/5 px-4 py-1.5 mb-6">
            <Sparkle size={11} weight="fill" className="text-[#C8A762]"/>
            <span className="text-[10px] font-black text-[#C8A762] tracking-widest uppercase">ميديا نظامي</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[.9] text-white mb-5">
            القانون<br/><span className="text-zinc-600">بلغة</span><br/>الجميع
          </h1>
          <p className="text-[14px] text-zinc-500 leading-relaxed max-w-[40ch] mb-8">
            ريلز ويوتيوب مجاناً. روايات وكوميكس قانونية حصرية بـ ٩ ريال فقط في الشهر.
          </p>
          <div className="flex items-center gap-3">
            <Link href={isLoggedIn ? "/pricing" : "/register"}
              className="inline-flex items-center gap-2 rounded-xl bg-[#C8A762] hover:bg-[#C8A762]/90 px-5 py-3 text-[13px] font-black text-[#050a08] transition-all active:scale-[.98]">
              <Lightning size={13} weight="fill"/> ٩ ريال/شهر
            </Link>
            <button onClick={()=>setTab("reels")}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] hover:border-white/[0.16] px-5 py-3 text-[13px] font-semibold text-zinc-400 hover:text-white transition-all">
              <PlayCircle size={13}/> تصفح مجاناً
            </button>
          </div>
        </motion.div>
      </section>

      <Marquee/>

      {/* ── TABS ── */}
      <div className="mx-auto max-w-[1400px] px-6">
        <div className="flex items-center gap-1 mb-10">
          {TABS.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-bold transition-all ${
                tab===t.id ? "bg-white/[0.08] text-white border border-white/[0.12]" : "text-zinc-600 hover:text-zinc-400"
              }`}>
              <t.icon size={14}/>
              {t.label}
              {!t.free && <Lock size={9} className="text-[#C8A762]" weight="fill"/>}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── REELS ── */}
          {tab==="reels" && (
            <motion.div key="reels" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
              <div className="flex items-center justify-between mb-5">
                <p className="text-[11px] text-zinc-600 uppercase tracking-widest">مجاني للجميع</p>
                <div className="flex gap-2">
                  {(["r","l"] as const).map(d=>(
                    <button key={d} onClick={()=>scroll(d)}
                      className="h-8 w-8 rounded-full border border-white/[0.08] flex items-center justify-center text-zinc-600 hover:text-white hover:border-white/[0.2] transition-all">
                      {d==="r"?<ArrowRight size={13}/>:<ArrowLeft size={13}/>}
                    </button>
                  ))}
                </div>
              </div>
              <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-4" style={{scrollbarWidth:"none"}}>
                {REELS.map((r,i)=>(
                  <motion.div key={r.id} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
                    transition={{delay:i*.07,type:"spring",stiffness:100}}
                    className="flex-shrink-0 w-40 h-72 rounded-2xl overflow-hidden border border-white/[0.07] hover:border-white/[0.16] transition-colors cursor-pointer group relative bg-gradient-to-b from-[#0B3D2E]/40 to-[#050a08]">
                    <div className="absolute inset-0 flex flex-col justify-between p-3">
                      <div className="flex justify-between items-start">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-[#C8A762]/10 text-[#C8A762] border-[#C8A762]/20">{r.tag}</span>
                        <span className="text-[9px] text-zinc-600 flex items-center gap-0.5"><Clock size={8}/>{r.dur}</span>
                      </div>
                      <div>
                        <PlayCircle size={26} weight="fill" className="text-white/20 group-hover:text-white/50 mb-2 transition-colors"/>
                        <p className="text-[11px] font-bold text-zinc-200 leading-snug">{r.title}</p>
                        <p className="text-[9px] text-zinc-600 mt-1 flex items-center gap-0.5"><Eye size={8}/>{r.views}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── YOUTUBE ── */}
          {tab==="youtube" && (
            <motion.div key="yt" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}
              className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-5">
              <div className="bg-[#0f0f16] border border-white/[0.07] rounded-3xl overflow-hidden group cursor-pointer hover:border-white/[0.14] transition-all">
                <div className="aspect-video bg-gradient-to-br from-red-950/40 to-[#050a08] flex items-center justify-center relative">
                  <PlayCircle size={52} weight="fill" className="text-white/20 group-hover:text-white/40 group-hover:scale-110 transition-all duration-300"/>
                  <div className="absolute bottom-4 right-4 flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-[#C8A762]/10 text-[#C8A762] border-[#C8A762]/20">{EPISODES[4].tag}</span>
                    <span className="text-[10px] text-zinc-500 bg-black/50 px-2 py-0.5 rounded-full">{EPISODES[4].dur}</span>
                  </div>
                </div>
                <div className="p-6">
                  <p className="text-[10px] text-zinc-600 mb-2">ملف نظامي — الحلقة {EPISODES[4].ep}</p>
                  <p className="text-[17px] font-black text-white leading-tight mb-2">{EPISODES[4].title}</p>
                  <p className="text-[11px] text-zinc-600 flex items-center gap-1"><Eye size={10}/>{EPISODES[4].views} مشاهدة</p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {EPISODES.slice(0,-1).map((e,i)=>(
                  <motion.div key={e.id} initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} transition={{delay:.08+i*.07,type:"spring",stiffness:100}}
                    className="group flex items-center gap-4 rounded-2xl border border-white/[0.07] p-4 cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.02] transition-all">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-red-950/30 flex items-center justify-center text-[14px] font-black text-red-500/40 group-hover:text-red-500 transition-colors">{e.ep}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-zinc-300 leading-snug truncate">{e.title}</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5 flex items-center gap-1"><Clock size={8}/>{e.dur}</p>
                    </div>
                    <ArrowUpRight size={12} className="text-zinc-700 group-hover:text-zinc-400 flex-shrink-0 transition-colors"/>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── NOVELS ── */}
          {tab==="novels" && (
            <motion.div key="novels" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
              {!hasMedia && <div className="text-[11px] text-zinc-600 mb-5 flex items-center gap-2"><Lock size={10} className="text-[#C8A762]" weight="fill"/>الفصل الأول مجاني — اشترك للوصول لكل الفصول</div>}
              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-5">
                {/* Featured */}
                <div className="bg-[#0f0f16] border border-white/[0.07] rounded-3xl overflow-hidden">
                  <div className={`h-52 bg-gradient-to-br ${NOVELS[0].from} ${NOVELS[0].to} flex items-end p-6 relative overflow-hidden`}>
                    <div className="absolute inset-0" style={{backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 24px,rgba(255,255,255,.02) 24px,rgba(255,255,255,.02) 25px)"}}/>
                    <div><p className="text-[9px] text-white/40 mb-1">رواية — {NOVELS[0].chapters} فصلاً</p><p className="text-[26px] font-black text-white">{NOVELS[0].title}</p></div>
                  </div>
                  <div className="p-6">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-[#C8A762]/10 text-[#C8A762] border-[#C8A762]/20 mb-3 inline-block">{NOVELS[0].tag}</span>
                    <p className="text-[12px] text-zinc-500 leading-relaxed mb-5">{NOVELS[0].preview}</p>
                    <div className="relative">
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {Array.from({length:4}).map((_,i)=>(
                          <div key={i} className={`rounded-xl border py-2.5 text-center text-[10px] font-bold cursor-pointer transition-all relative overflow-hidden ${
                            i===0
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-white/[0.06] bg-white/[0.02] text-zinc-700"
                          }`}>
                            فصل {i+1}
                            {i>0 && <Lock size={8} className="absolute top-1 left-1 text-[#C8A762]" weight="fill"/>}
                          </div>
                        ))}
                      </div>
                      {!hasMedia && (
                        <div className="mt-4 flex items-center justify-between p-4 rounded-xl border border-[#C8A762]/20 bg-[#C8A762]/5">
                          <p className="text-[11px] text-zinc-400">الفصول ٢–{NOVELS[0].chapters} بـ اشتراك ميديا</p>
                          <Link href={isLoggedIn?"/pricing":"/register"} className="text-[11px] font-black text-[#C8A762] flex items-center gap-1 hover:gap-2 transition-all">
                            اشترك<ArrowUpRight size={11}/>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* Side novels */}
                <div className="flex flex-col gap-4">
                  {NOVELS.slice(1).map((n,i)=>(
                    <motion.div key={n.id} initial={{opacity:0,x:12}} animate={{opacity:1,x:0}} transition={{delay:.1+i*.1,type:"spring",stiffness:90}}
                      className="relative bg-[#0f0f16] border border-white/[0.07] rounded-2xl overflow-hidden flex-1 group hover:border-white/[0.14] transition-all cursor-pointer">
                      <div className={`h-20 bg-gradient-to-br ${n.from} ${n.to} flex items-end px-4 pb-3`}>
                        <p className="text-[17px] font-black text-white/80">{n.title}</p>
                      </div>
                      <div className="p-4">
                        <p className="text-[11px] text-zinc-600 leading-snug line-clamp-2 mb-3">{n.preview}</p>
                        <div className="flex items-center justify-between">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${n.done?"bg-emerald-500/10 text-emerald-400 border-emerald-500/20":"bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                            {n.done?"مكتملة":"جارية"}
                          </span>
                          <span className="text-[10px] text-zinc-700">{n.chapters} فصل</span>
                        </div>
                      </div>
                      {!hasMedia && <GateOverlay isLoggedIn={isLoggedIn}/>}
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── COMICS ── */}
          {tab==="comics" && (
            <motion.div key="comics" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
              {!hasMedia && <div className="text-[11px] text-zinc-600 mb-5 flex items-center gap-2"><Lock size={10} className="text-[#C8A762]" weight="fill"/>كوميكس مجاني واحد — الباقي باشتراك ميديا</div>}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {COMICS.map((c,i)=>(
                  <motion.div key={c.id} initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1}}
                    transition={{delay:i*.07,type:"spring",stiffness:100}}
                    className={`relative border border-white/[0.07] rounded-2xl p-5 cursor-pointer group hover:border-white/[0.14] transition-all flex flex-col justify-between ${
                      i===0?"md:col-span-2 row-span-1":"col-span-1"
                    } min-h-[140px]`}>
                    <div className="flex items-start justify-between">
                      <PaintBrush size={16} className="text-zinc-700 group-hover:text-zinc-400 transition-colors"/>
                      <span className="text-[9px] text-zinc-600">{c.pages} لوحات</span>
                    </div>
                    <div>
                      <p className="text-[15px] font-black text-zinc-200 leading-tight mb-1">{c.title}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-[#C8A762]/10 text-[#C8A762] border-[#C8A762]/20">{c.tag}</span>
                        <ArrowUpRight size={12} className="text-zinc-700 group-hover:text-[#C8A762] transition-colors"/>
                      </div>
                    </div>
                    {!c.free && !hasMedia && <GateOverlay isLoggedIn={isLoggedIn}/>}
                    {c.free && <div className="absolute top-3 left-3 text-[8px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">مجاني</div>}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* ── Sub Banner ── */}
        <SubBanner isLoggedIn={isLoggedIn}/>

        {/* ── Footer CTA ── */}
        <div className="border-t border-white/[0.05] pt-12 grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6 items-center">
          <div>
            <p className="text-[10px] font-bold text-zinc-600 tracking-widest uppercase mb-3">محتوى جديد كل أسبوع</p>
            <h2 className="text-[30px] font-black text-white tracking-tighter leading-tight">
              تابع على يوتيوب<br/><span className="text-zinc-600">الحلقات والريلز مجانية</span>
            </h2>
          </div>
          <div className="flex flex-col gap-3">
            <a href="https://youtube.com/@nzamy" target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl bg-red-600 hover:bg-red-700 px-6 py-3.5 text-[13px] font-bold text-white transition-colors active:scale-[.98]">
              <YoutubeLogo size={15} weight="fill"/> اشترك في القناة
            </a>
            <Link href={isLoggedIn?"/pricing":"/register"}
              className="flex items-center justify-center gap-2 rounded-2xl border border-[#C8A762]/30 hover:border-[#C8A762]/60 px-6 py-3.5 text-[13px] font-bold text-[#C8A762] transition-all active:scale-[.98]">
              <Lightning size={13} weight="fill"/> ميديا نظامي — ٩ ريال/شهر
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
