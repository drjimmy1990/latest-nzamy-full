"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tray, Monitor, FolderOpen, PaperPlaneTilt, ArrowLeft, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { getActiveSessions, getDesktopItems } from "@/lib/services/researchService";
import { runAutoArchive } from "@/lib/draftInboxStore";
import { DesktopPanel } from "./_components/DesktopPanel";
import { SessionsPanel } from "./_components/SessionsPanel";
import Link from "next/link";

type Tab = "desktop" | "sessions";

/**
 * A panel reports failure as an error toast, not as a green checkmark.
 * The two collector panels write through `onToast`, and the toast below is the
 * only place either of them can speak to the user — so it has to be able to say
 * that something did NOT happen. Kept structurally identical in both panels.
 */
type ToastKind = "success" | "error";

export default function CollectorPage() {
  const { isDark } = useTheme();
  const [tab, setTab] = useState<Tab>("desktop");
  /*
    THE TAB BADGES ARE `number | null`, AND `null` IS NOT `٠`.

    A count nobody could read is not a count of zero. `null` renders «—» with an
    Arabic title saying the read failed, so a lawyer never sees an empty desktop
    badge over a desktop the server refused to describe. `countsLoading` is kept
    separate because "not asked yet" is a third thing again: during the first
    paint the badge is simply absent rather than claiming either.
  */
  const [desktopCount, setDesktopCount] = useState<number | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; kind: ToastKind } | null>(null);

  /*
    WHY THE DESKTOP BADGE NOW COMES FROM getDesktopItems() AND NOT
    getDesktopUnusedCount().

    getDesktopUnusedCount() reads localStorage in BOTH modes (there is no
    endpoint behind it — see the header of researchService.ts), while the list
    underneath it comes from the server. In supabase mode the two were counting
    different stores: an empty browser store printed no badge beside a desktop
    that had items on the server. The badge and the list now read the same
    source, so they can no longer disagree.

    The number is therefore ALL desktop items, not the unused ones. `used` is a
    local-only flag with no column behind it, so an "unused" count over server
    rows would be a number nobody stored.
  */
  async function refreshCounts() {
    runAutoArchive();
    const [desktop, sessions] = await Promise.all([getDesktopItems(), getActiveSessions()]);
    setDesktopCount(desktop.ok ? desktop.items.length : null);
    setSessionCount(sessions.ok ? sessions.items.length : null);
    setCountsLoading(false);
  }

  useEffect(() => { refreshCounts(); }, []);

  function handleToast(msg: string, kind: ToastKind = "success") {
    setToast({ msg, kind });
    refreshCounts();
    // An error the user has to act on gets longer than a success confirmation.
    setTimeout(() => setToast(null), kind === "error" ? 5000 : 2500);
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-slate-200/70 rounded-2xl shadow-sm";

  const TABS: { id: Tab; label: string; icon: React.ElementType; count: number | null }[] = [
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
              {/* Nothing has been asked yet — no badge asserts anything. */}
              {!countsLoading && t.count === null && (
                <span
                  title="تعذّرت قراءة العدد"
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-100 text-amber-700"
                  }`}
                >—</span>
              )}
              {!countsLoading && t.count !== null && t.count > 0 && (
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

      {/* Toast — an error is never dressed as a confirmation. */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            role={toast.kind === "error" ? "alert" : "status"}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex max-w-[90vw] items-center gap-2 px-4 py-2.5 rounded-2xl text-[12px] font-bold shadow-xl border ${
              toast.kind === "error"
                ? "bg-red-950 text-red-100 border-red-500/30"
                : "bg-zinc-900 text-white border-white/10"
            }`}
          >
            {toast.kind === "error"
              ? <WarningCircle size={14} weight="fill" className="text-red-400 flex-shrink-0" />
              : <CheckCircle   size={14} weight="fill" className="text-emerald-400 flex-shrink-0" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
