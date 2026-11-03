"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ShieldCheck, Warning, LockSimple, Users, Bug, BookOpenText, Hourglass } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import LibraryLocksPanel from "./LibraryLocksPanel";
import LibraryActivityPanel from "./LibraryActivityPanel";

// "library_activity" (20261031_10) and "library_locks" (owner note ١٣ C09,
// public.library_security_locks) are real and read the database. The other
// four tabs keep their place with a «قريباً» badge: nothing in the system
// collects duplicate-account, bot or threat data yet. S6-T19 (slice A §1.6)
// removed the invented accounts, IPs, percentages and the KPI row that used
// to fill them, as promised in the Wave 1 owner report.
type SecTab = "library_activity"|"library_locks"|"overview"|"duplicates"|"scraping"|"threats";
const SEC_TABS: readonly SecTab[] = ["library_activity","library_locks","overview","duplicates","scraping","threats"];

export default function SecurityPage() {
  const { isDark } = useTheme();
  const [tab, setTab] = useState<SecTab>("library_activity");
  // ?tab=… — the admins' notifications link straight to a tab. Read after
  // mount (no useSearchParams, so the page needs no Suspense boundary).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted && (SEC_TABS as readonly string[]).includes(wanted)) setTab(wanted as SecTab);
  }, []);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const TABS:{id:SecTab;label:string;icon:React.ElementType;soon?:true}[] = [
    { id:"library_activity", label:"نشاط المكتبة", icon:BookOpenText },
    { id:"library_locks", label:"قفل المكتبة", icon:LockSimple },
    { id:"overview", label:"نظرة عامة", icon:ShieldCheck, soon:true },
    { id:"duplicates", label:"حسابات مكررة", icon:Users, soon:true },
    { id:"scraping", label:"حماية البوتات", icon:Bug, soon:true },
    { id:"threats", label:"التهديدات", icon:Warning, soon:true },
  ];
  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="max-w-6xl mx-auto space-y-5" dir="rtl">
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
        <h1 className={`text-xl font-bold mb-1 ${isDark?"text-white":"text-slate-800"}`}>الأمان والحماية</h1>
        <p className={`text-[12px] ${isDark?"text-zinc-500":"text-slate-400"}`}>كشف التهديدات، الحسابات المكررة، وحماية المنصة من الهجمات</p>
      </motion.div>

      {/* Tabs */}
      <div className={`flex gap-1 overflow-x-auto border-b pb-0.5 ${isDark?"border-white/[0.06]":"border-slate-100"}`}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-t-xl transition-all ${
              tab===t.id?isDark?"text-white border-b-2 border-[#C8A762]":"text-slate-800 border-b-2 border-[#0B3D2E]"
              :isDark?"text-zinc-500":"text-slate-400"
            }`}>
            <t.icon size={13}/>{t.label}
            {t.soon && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${isDark?"bg-white/[0.06] text-zinc-400":"bg-slate-100 text-slate-500"}`}>
                قريباً
              </span>
            )}
          </button>
        ))}
      </div>

      {tab==="library_activity" && <LibraryActivityPanel isDark={isDark} card={card} />}
      {tab==="library_locks" && <LibraryLocksPanel isDark={isDark} card={card} />}

      {current?.soon && (
        <motion.div key={tab} initial={{opacity:0}} animate={{opacity:1}}
          className={`${card} flex flex-col items-center gap-3 p-10 text-center`}>
          <Hourglass size={28} weight="duotone" className={isDark?"text-zinc-500":"text-slate-400"} />
          <p className={`text-[13px] font-bold ${isDark?"text-zinc-300":"text-slate-600"}`}>
            قريباً — لا يجمع النظام هذه البيانات بعد
          </p>
        </motion.div>
      )}
    </div>
  );
}
