"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tray, Monitor, FolderOpen, PaperPlaneTilt, ArrowLeft, CheckCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { getDesktopUnusedCount, getActiveSessions, runAutoArchive } from "@/lib/draftInboxStore";
import { DesktopPanel } from "./_components/DesktopPanel";
import { SessionsPanel } from "./_components/SessionsPanel";
import Link from "next/link";

type Tab = "desktop" | "sessions";

export default function CollectorPage() {
  const { isDark } = useTheme();
  const [tab, setTab] = useState<Tab>("desktop");
  const [desktopCount, setDesktopCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  function refreshCounts() {
    runAutoArchive();
    setDesktopCount(getDesktopUnusedCount());
    setSessionCount(getActiveSessions().length);
  }

  useEffect(() => { refreshCounts(); }, []);

  function handleToast(msg: string) {
    setToast(msg);
    refreshCounts();
    setTimeout(() => setToast(null), 2500);
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-slate-200/70 rounded-2xl shadow-sm";

  const TABS: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "desktop",  label: "الديسك توب", icon: Monitor,    count: desktopCount  },
    { id: "sessions", label: "الجلسات",    icon: FolderOpen, count: sessionCount },
  ];

  return (
    <div className={`p-5 md:p-7 max-w-4xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Tray size={20} weight="duotone" className="text-purple-500" />
          </div>
          <div>
            <h1 className={`text-lg font-bold leading-none ${isDark ? "text-white" : "text-zinc-900"}`}>
              المجمّع البحثي
            </h1>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              ديسك توب شخصي · جلسات منظّمة قابلة للمشاركة · أرشيف تلقائي بعد 7 أيام
            </p>
          </div>
        </div>
        <Link href="/ai/draft"
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold border transition-all ${
            isDark ? "border-[#C8A762]/30 bg-[#C8A762]/5 text-[#C8A762] hover:bg-[#C8A762]/10"
                   : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
          }`}>
          <PaperPlaneTilt size={13} weight="duotone" /> الصائغ القانوني
          <ArrowLeft size={11} />
        </Link>
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-2xl ${isDark ? "bg-zinc-900/60 border border-white/[0.06]" : "bg-slate-100/80"}`}>
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all ${
                tab === t.id
                  ? isDark ? "bg-white/[0.08] text-white shadow-sm" : "bg-white text-slate-800 shadow-sm"
                  : isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-500 hover:text-slate-700"
              }`}>
              <Icon size={14} weight={tab === t.id ? "duotone" : "regular"} />
              {t.label}
              {(t.count ?? 0) > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  tab === t.id
                    ? "bg-purple-500 text-white"
                    : isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-200 text-slate-500"
                }`}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
          {tab === "desktop"  && <DesktopPanel  onToast={handleToast} />}
          {tab === "sessions" && <SessionsPanel onToast={handleToast} />}
        </motion.div>
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-900 text-white text-[12px] font-bold shadow-xl border border-white/10"
          >
            <CheckCircle size={14} weight="fill" className="text-emerald-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
