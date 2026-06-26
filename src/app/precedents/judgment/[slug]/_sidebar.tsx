"use client";

import { FolderSimple, TextT, NotePencil, ListNumbers, Gavel, Bookmark } from "@phosphor-icons/react";
import { DemoPrecedent } from "../../../laws/demo-data";

interface SidebarPanelProps {
  isDark: boolean;
  isRTL: boolean;
  precedent: DemoPrecedent;
  activeId: string;
  handleScrollToSection: (id: string) => void;
  noteText: string;
  setNoteText: (text: string) => void;
  noteSaved: boolean;
  handleSaveNote: () => void;
  handleClearNote: () => void;
  setShowFolderModal: (show: boolean) => void;
  isItemInAnyFolder: boolean;
  fontSize: "normal" | "large" | "xlarge";
  setFontSize: (size: "normal" | "large" | "xlarge") => void;
}

export default function SidebarPanel({
  isDark,
  isRTL,
  precedent,
  activeId,
  handleScrollToSection,
  noteText,
  setNoteText,
  noteSaved,
  handleSaveNote,
  handleClearNote,
  setShowFolderModal,
  isItemInAnyFolder,
  fontSize,
  setFontSize
}: SidebarPanelProps) {
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`;

  return (
    <aside className="relative z-50 space-y-3">
      {/* Identity Card */}
      <div className={`p-5 rounded-[2rem] border ${isDark ? "bg-[#161b22]/40 border-white/[0.06]" : "bg-white border-gray-200 shadow-sm"}`}>
        <h3 className={`text-xs font-black uppercase tracking-wider mb-4 pb-2 border-b ${isDark ? "border-white/5 text-zinc-400" : "border-slate-100 text-gray-600"}`}>
          <Gavel size={15} className="inline mr-1" />
          {isRTL ? "بيانات القضية" : "Case Details"}
        </h3>
        <div className="space-y-3 text-xs">
          <div>
            <span className="opacity-55 block mb-0.5">{isRTL ? "المحكمة:" : "Court:"}</span>
            <span className="font-bold">{precedent.court}</span>
          </div>
          <div>
            <span className="opacity-55 block mb-0.5">{isRTL ? "رقم القضية:" : "Case Number:"}</span>
            <span className="font-mono font-bold">{precedent.caseNum}</span>
          </div>
          <div>
            <span className="opacity-55 block mb-0.5">{isRTL ? "السنة القضائية:" : "Judicial Year:"}</span>
            <span className="font-bold">{precedent.year}</span>
          </div>
          <div>
            <span className="opacity-55 block mb-0.5">{isRTL ? "المسار القانوني:" : "Track:"}</span>
            <span className="font-mono font-bold text-purple-500 uppercase">{precedent.subject}</span>
          </div>
          <div>
            <span className="opacity-55 block mb-0.5">{isRTL ? "تصنيف المكتبة:" : "Classification:"}</span>
            <span className="font-bold">{precedent.cat}</span>
          </div>


          {/* Bookmark Button */}
          <button
            onClick={() => setShowFolderModal(true)}
            className={`w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all border active:scale-[0.98] ${
              isDark
                ? "border-white/[0.08] bg-white/[0.02] text-gray-300 hover:bg-white/5 hover:text-white"
                : "border-slate-200 bg-slate-50 text-gray-700 hover:bg-slate-100 hover:text-gray-900"
            }`}
          >
            <Bookmark size={14} className="text-amber-500" weight={isItemInAnyFolder ? "fill" : "regular"} />
            {isRTL ? "حفظ في المجلدات" : "Save to Folders"}
          </button>
        </div>
      </div>

      {/* Navigation Index (TOC) */}
      <div className={`p-4 rounded-[2rem] border ${isDark ? "bg-[#161b22]/40 border-white/[0.06]" : "bg-white border-gray-200 shadow-sm"}`}>
        <h3 className={`text-xs font-black uppercase tracking-wider mb-3 pb-2 border-b ${isDark ? "border-white/5 text-zinc-400" : "border-slate-100 text-gray-600"}`}>
          <ListNumbers size={16} className="inline mr-1" />
          {isRTL ? "أقسام صك الحكم" : "Judgment sections"}
        </h3>
        <div className="space-y-1">
          {[
            { id: "summary", label: "خلاصة الحكم", labelEn: "Summary" },
            precedent.preamble ? { id: "preamble", label: "الديباجة القضائية", labelEn: "Preamble" } : null,
            { id: "facts", label: "وقائع الدعوى", labelEn: "Case Facts" },
            precedent.reasons ? { id: "reasons", label: "أسباب الحكم والتسبيب", labelEn: "Reasons" } : null,
            { id: "ruling", label: "منطوق الحكم", labelEn: "Ruling" },
          ].filter(Boolean).map(sec => {
            const isActive = activeId === sec!.id;
            return (
              <button
                key={sec!.id}
                onClick={() => handleScrollToSection(sec!.id)}
                className={`w-full text-right flex items-center justify-between p-2 rounded-lg text-xs transition-all ${
                  isActive
                    ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E] font-bold"
                    : isDark ? "text-zinc-400 hover:bg-white/5" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>{isRTL ? sec!.label : sec!.labelEn}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
