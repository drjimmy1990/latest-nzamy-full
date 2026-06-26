"use client";

import {
  ListNumbers, MagnifyingGlass, Compass
} from "@phosphor-icons/react";
import type { FeqhChapter } from "@/app/laws/data";

interface SidebarPanelProps {
  isDark: boolean;
  isRTL: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  quickJumpQuery: string;
  setQuickJumpQuery: (q: string) => void;
  handleQuickJump: (q: string) => void;
  jumpError: boolean;
  filteredChapters: FeqhChapter[];
  activeBlockId: string;
  handleScrollToBlock: (id: string) => void;
}

export default function SidebarPanel({
  isDark,
  isRTL,
  searchQuery,
  setSearchQuery,
  quickJumpQuery,
  setQuickJumpQuery,
  handleQuickJump,
  jumpError,
  filteredChapters,
  activeBlockId,
  handleScrollToBlock
}: SidebarPanelProps) {
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`;

  return (
    <div className="relative z-50 space-y-4">
      {/* Dynamic TOC Card */}
      <div className={`${card} p-4`}>
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-3 flex items-center gap-1.5">
          <ListNumbers size={16} />
          {isRTL ? "فهرس أبواب ومسائل الكتاب" : "Chapters & Topics"}
        </h3>

        {/* Text Search Box */}
        <div className="mb-2 relative">
          <div className={`absolute ${isRTL ? "right-3" : "left-3"} top-2.5 opacity-40`}>
            <MagnifyingGlass size={14} />
          </div>
          <input
            type="text"
            placeholder={isRTL ? "بحث بالكلمات أو النص..." : "Search text or keywords..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full ${isRTL ? "pr-8 pl-8" : "pl-8 pr-8"} py-2 text-xs rounded-xl border transition-all ${
              isDark
                ? "bg-zinc-800/80 border-white/10 text-white placeholder-zinc-500 focus:border-[#C8A762]"
                : "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-[#0B3D2E]"
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className={`absolute ${isRTL ? "left-2.5" : "right-2.5"} top-2 text-[10px] opacity-60 hover:opacity-100 font-bold`}
            >
              ✕
            </button>
          )}
        </div>

        {/* Quick Jump Box */}
        <div className="mb-4 relative">
          <div className={`absolute ${isRTL ? "right-3" : "left-3"} top-2.5 opacity-40`}>
            <Compass size={14} />
          </div>
          <input
            type="text"
            placeholder={isRTL ? "انتقال للصفحة (مثال: 204 أو 1/204)..." : "Quick jump (e.g. 204 or 1/204)..."}
            value={quickJumpQuery}
            onChange={(e) => setQuickJumpQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleQuickJump(quickJumpQuery);
              }
            }}
            className={`w-full ${isRTL ? "pr-8 pl-12" : "pl-8 pr-12"} py-2 text-xs rounded-xl border transition-all duration-300 ${
              jumpError
                ? "border-red-500 ring-1 ring-red-500/20 bg-red-500/5"
                : isDark
                ? "bg-zinc-800/80 border-white/10 text-white placeholder-zinc-500 focus:border-[#C8A762]"
                : "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-[#0B3D2E]"
            }`}
          />
          <button
            onClick={() => handleQuickJump(quickJumpQuery)}
            className={`absolute ${isRTL ? "left-1.5" : "right-1.5"} top-1.5 px-2 py-1 rounded bg-[#0B3D2E] text-white hover:bg-opacity-95 text-[10px] font-bold transition-all`}
          >
            {isRTL ? "انتقال" : "Go"}
          </button>
        </div>
        
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {filteredChapters.map((ch, ci) => (
            <div key={ci} className="space-y-2">
              <p className="text-[11px] font-black text-amber-600 dark:text-amber-500 border-b pb-1 border-slate-100 dark:border-white/[0.04]">{ch.title}</p>
              {ch.sections.map((sec, si) => (
                <div key={si} className="pl-2 space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500">{sec.title}</p>
                  {sec.blocks.map(b => (
                    <button
                      key={b.id}
                      id={`sidebar-item-${b.id}`}
                      onClick={() => handleScrollToBlock(b.id)}
                      className={`w-full text-right flex items-center justify-between p-2 rounded-lg text-xs transition-all ${
                        activeBlockId === b.id
                          ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E]/10 text-[#0B3D2E] font-bold"
                          : isDark ? "text-zinc-400 hover:bg-white/5" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="truncate max-w-[150px]">{b.topic}</span>
                      <span className="text-[9px] opacity-75 px-1.5 py-0.5 bg-black/10 dark:bg-white/5 rounded">
                        {isRTL ? `ج ${b.vol}، ص ${b.page}` : `V ${b.vol}, P ${b.page}`}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
          {filteredChapters.length === 0 && (
            <p className="text-[10px] text-center text-slate-500 py-4">
              {isRTL ? "لا توجد نتائج مطابقة" : "No matching results"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
