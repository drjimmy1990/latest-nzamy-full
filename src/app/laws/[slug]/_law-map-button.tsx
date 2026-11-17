"use client";

/**
 * _law-map-button.tsx — the «خريطة التشابك التشريعي» button and its panel.
 * The map itself (_law-map.tsx, @xyflow/react) is a next/dynamic import made
 * only when the panel opens; nothing is fetched or downloaded before that.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Graph, X } from "@phosphor-icons/react";

const LawMap = dynamic(() => import("./_law-map"), {
  ssr: false,
  loading: () => <p className="p-6 text-center text-[12px] text-zinc-500">جارٍ تحميل الخريطة…</p>,
});

export function LawMapButton({ slug, lawTitle, lawStatus, isDark, isRTL }: { slug: string; lawTitle: string; lawStatus: string | null; isDark: boolean; isRTL: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition print:hidden ${isDark ? "border-white/[0.08] bg-zinc-900 text-zinc-200 hover:border-[#C8A762]/40" : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 shadow-sm"}`}
      >
        <Graph size={14} className="text-[#C8A762]" />
        {isRTL ? "خريطة التشابك التشريعي" : "Legislative links map"}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 print:hidden" role="dialog" aria-modal="true" aria-label={isRTL ? "خريطة التشابك التشريعي" : "Legislative links map"}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div dir={isRTL ? "rtl" : "ltr"} className={`relative w-full max-w-4xl rounded-2xl border p-4 shadow-2xl ${isDark ? "bg-zinc-950 border-white/[0.1] text-zinc-200" : "bg-white border-slate-200 text-zinc-800"}`}>
            <div className="flex items-center gap-2 mb-3">
              <Graph size={16} className="text-[#C8A762]" />
              <h2 className="flex-1 font-black text-[14px]">{isRTL ? "خريطة التشابك التشريعي" : "Legislative links map"}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={isRTL ? "إغلاق" : "Close"} className={`p-1.5 rounded-lg ${isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-100"}`}>
                <X size={14} />
              </button>
            </div>
            <p className={`mb-3 text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
              {isRTL
                ? "الأنظمة التي تُحيل إليها مواد هذا النظام أو تُحيل إليه، من شبكة الإحالات في المكتبة. اضغط نظاماً لفتحه."
                : "Laws this law's articles cite or that cite it, from the library's links network. Click a law to open it."}
            </p>
            <LawMap slug={slug} lawTitle={lawTitle} lawStatus={lawStatus} isDark={isDark} />
          </div>
        </div>
      )}
    </>
  );
}
