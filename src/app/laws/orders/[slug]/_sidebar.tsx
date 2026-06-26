"use client";

import { FolderSimple, TextT, NotePencil } from "@phosphor-icons/react";
import { DemoOrder } from "../../demo-data";
import { ResearchWorkspace } from "@/components/ResearchWorkspace";

interface SidebarPanelProps {
  isDark: boolean;
  isRTL: boolean;
  order: DemoOrder;
  issuerLabel: string;
  fontSize: "normal" | "large" | "xlarge";
  setFontSize: (size: "normal" | "large" | "xlarge") => void;
  noteText: string;
  setNoteText: (text: string) => void;
  noteSaved: boolean;
  handleSaveNote: () => void;
  handleClearNote: () => void;
  setShowFolderModal: (show: boolean) => void;
}

export default function SidebarPanel({
  isDark,
  isRTL,
  order,
  issuerLabel,
  fontSize,
  setFontSize,
  noteText,
  setNoteText,
  noteSaved,
  handleSaveNote,
  handleClearNote,
  setShowFolderModal
}: SidebarPanelProps) {
  return (
    <div className="relative z-50 space-y-3">
      {/* Metadata Card */}
      <div className={`p-5 rounded-[2rem] border ${isDark ? "bg-[#161b22]/40 border-white/[0.06]" : "bg-white border-gray-200 shadow-sm"}`}>
        <h3 className={`text-xs font-black uppercase tracking-wider mb-4 pb-2 border-b ${isDark ? "border-white/5 text-zinc-400" : "border-slate-100 text-gray-600"}`}>
          {isRTL ? "تفاصيل المستند" : "Document Meta"}
        </h3>
        <div className="space-y-3.5 text-xs">
          <div className="flex justify-between">
            <span className={isDark ? "text-gray-500" : "text-gray-400"}>{isRTL ? "نوع المستند:" : "Doc Type:"}</span>
            <span className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
              {order.type === "royal" ? (isRTL ? "أمر ملكي" : "Royal Decree") : 
               order.type === "cabinet" ? (isRTL ? "قرار مجلس الوزراء" : "Cabinet Order") : 
               (isRTL ? "تعميم إداري" : "Administrative Circular")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className={isDark ? "text-gray-500" : "text-gray-400"}>{isRTL ? "الجهة المصدرة:" : "Issuer:"}</span>
            <span className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{issuerLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className={isDark ? "text-gray-500" : "text-gray-400"}>{isRTL ? "رقم المرجع:" : "Ref No:"}</span>
            <span className="font-mono font-bold text-amber-500">{order.ref}</span>
          </div>
          <div className="flex justify-between">
            <span className={isDark ? "text-gray-500" : "text-gray-400"}>{isRTL ? "تاريخ الإصدار:" : "Date:"}</span>
            <span className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{order.date}</span>
          </div>
          <div className="flex justify-between">
            <span className={isDark ? "text-gray-500" : "text-gray-400"}>{isRTL ? "تصنيف الملف:" : "Category ID:"}</span>
            <span className={`font-mono font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{order.cat}</span>
          </div>
          {order.official_url && (
            <div className="flex justify-between items-center border-t border-black/5 dark:border-white/5 pt-2.5 mt-1">
              <span className={isDark ? "text-gray-500" : "text-gray-400"}>{isRTL ? "الرابط الرسمي:" : "Official Link:"}</span>
              <a
                href={order.official_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#C8A762] hover:underline flex items-center gap-1"
              >
                <span>{isRTL ? "عرض المصدر" : "View Source"}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
              </a>
            </div>
          )}



          {/* Smart Folders Button */}
          <button
            onClick={() => setShowFolderModal(true)}
            className={`w-full mt-4 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all border ${
              isDark
                ? "bg-white/5 border-white/10 text-white hover:bg-white/10"
                : "bg-[#0B3D2E]/5 border-[#0B3D2E]/10 text-[#0B3D2E] hover:bg-[#0B3D2E]/10"
            }`}
          >
            <FolderSimple size={15} weight="bold" />
            {isRTL ? "حفظ في المجلدات" : "Save to Folders"}
          </button>
        </div>
      </div>

      {/* Research Workspace */}
    </div>
  );
}
