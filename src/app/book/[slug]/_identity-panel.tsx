"use client";

import {
  BookOpen, BookmarkSimple, Buildings, Stack, FolderSimple, BookBookmark, Copy, Check
} from "@phosphor-icons/react";
import type { FeqhBookSystem, FeqhBlock } from "@/app/laws/data";

interface IdentityPanelProps {
  isDark: boolean;
  isRTL: boolean;
  book: FeqhBookSystem;
  activeBlock: FeqhBlock | null;
  setShowFolderModal: (show: boolean) => void;
}

export default function IdentityPanel({
  isDark,
  isRTL,
  book,
  activeBlock,
  setShowFolderModal
}: IdentityPanelProps) {
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <div className="space-y-4">
      {/* Book Identity Card */}
      <div className={`${card} p-3`}>
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full border border-[#C8A762]/20 text-[#C8A762] bg-[#C8A762]/5">
            {isRTL ? "مرجع فقهي" : "Fiqh Reference"}
          </span>
          <span className={`text-[9px] px-2 py-0.5 rounded-full border ${isDark ? "border-white/10 text-zinc-500" : "border-slate-200 text-slate-500"}`}>
            {book.school}
          </span>
        </div>
        
        <div className="space-y-1.5">
          <div className="flex gap-1.5 items-start">
            <BookOpen size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
            <div>
              <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "المؤلف" : "Author"}</p>
              <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{book.author}</p>
            </div>
          </div>
          
          {book.investigator && (
             <div className="flex gap-1.5 items-start">
               <BookmarkSimple size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
               <div>
                 <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "المحقق / الحاشية" : "Investigator"}</p>
                 <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{book.investigator}</p>
               </div>
             </div>
          )}
          
          <div className="flex gap-1.5 items-start">
            <Buildings size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
            <div>
              <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "الناشر وطبعة الإحالة" : "Publisher & Ed."}</p>
              <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{book.publisher}</p>
            </div>
          </div>

          <div className="flex gap-1.5 items-start">
            <Stack size={10} className={`mt-0.5 flex-shrink-0 ${muted}`} />
            <div>
              <p className={`text-[8px] uppercase tracking-wider ${muted}`}>{isRTL ? "عدد الأجزاء" : "Volumes"}</p>
              <p className={`text-[10px] font-semibold leading-tight ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                {isRTL ? `${book.totalVolumes} مجلد` : `${book.totalVolumes} Vol.`}
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
