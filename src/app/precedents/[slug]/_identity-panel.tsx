"use client";

import {
  Scales, Calendar, Stack, FolderSimple, BookBookmark
} from "@phosphor-icons/react";
import type { JudicialPrinciplesSystem } from "@/app/laws/data";

interface IdentityPanelProps {
  isDark: boolean;
  isRTL: boolean;
  collection: JudicialPrinciplesSystem;
  setShowFolderModal: (show: boolean) => void;
}

export default function IdentityPanel({
  isDark,
  isRTL,
  collection,
  setShowFolderModal
}: IdentityPanelProps) {
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <div className="space-y-4">
      {/* Precedent Collection Identity Card */}
      <div className={`${card} p-3`}>
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full border border-[#C8A762]/20 text-[#C8A762] bg-[#C8A762]/5">
            {isRTL ? "مجموعة مبادئ قضائية" : "Judicial Principles"}
          </span>
          {collection.court && collection.court !== "جهة غير محددة" && (
            <span className={`text-[9px] px-2 py-0.5 rounded-full border ${isDark ? "border-white/10 text-zinc-500" : "border-slate-200 text-slate-500"}`}>
              {collection.court}
            </span>
          )}
        </div>
        
        <div className="space-y-1.5">
          {collection.court && collection.court !== "جهة غير محددة" && (
          <div className="flex gap-1.5 items-start">
            <Scales size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
            <div>
              <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "جهة الإصدار" : "Issuing Body"}</p>
              <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{collection.court}</p>
            </div>
          </div>
          )}
          
          {collection.yearHijri && collection.yearHijri !== 0 && (
          <div className="flex gap-1.5 items-start">
            <Calendar size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
            <div>
              <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "سنة المجموعة" : "Collection Year"}</p>
              <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                {collection.yearHijri}هـ
              </p>
            </div>
          </div>
          )}

          {collection.part && collection.part !== 0 && (
          <div className="flex gap-1.5 items-start">
            <Stack size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
            <div>
              <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "الجزء / المجلد" : "Volume / Part"}</p>
              <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                {isRTL ? `الجزء ${collection.part}` : `Part ${collection.part}`}
              </p>
            </div>
          </div>
          )}

          <div className="flex gap-1.5 items-start">
            <BookBookmark size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
            <div>
              <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "إجمالي المبادئ" : "Total Principles"}</p>
              <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                {isRTL ? `${collection.principles.length} مبدأ` : `${collection.principles.length} Principles`}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-dashed border-slate-100 dark:border-white/[0.05] pt-2.5 mt-2.5">
          <button
            onClick={() => setShowFolderModal(true)}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition ${
              isDark
                ? "border-[#C8A762]/30 text-[#C8A762] bg-[#C8A762]/5 hover:bg-[#C8A762]/10"
                : "border-[#0B3D2E]/20 text-[#0B3D2E] bg-[#0B3D2E]/5 hover:bg-[#0B3D2E]/10"
            }`}
          >
            <FolderSimple size={14} weight="bold" />
            <span>{isRTL ? "حفظ في مجلداتي" : "Save to Folders"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
