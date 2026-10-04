"use client";

import { useState } from "react";
import {
  ListNumbers, MagnifyingGlass, Compass
} from "@phosphor-icons/react";
import { formatLocator } from "./_locator";
import type { BlocksBySection, CompleteSections, ReaderChapter } from "./_reader-model";

/** Chapters rendered at first, and per "show more" — books run to 4,860. */
const CHAPTERS_PER_STEP = 150;

interface SidebarPanelProps {
  isDark: boolean;
  isRTL: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  quickJumpQuery: string;
  setQuickJumpQuery: (q: string) => void;
  handleQuickJump: (q: string) => void;
  jumpError: boolean;
  filteredChapters: ReaderChapter[];
  blocksBySection: BlocksBySection;
  completeSections: CompleteSections;
  loadingSectionId: string | null;
  onOpenSection: (sectionId: string) => void;
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
  blocksBySection,
  completeSections,
  loadingSectionId,
  onOpenSection,
  activeBlockId,
  handleScrollToBlock
}: SidebarPanelProps) {
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`;

  // Render the TOC in steps: thousands of chapter rows at once froze the page.
  // A new search starts again from the first step.
  const [step, setStep] = useState({ query: searchQuery, count: CHAPTERS_PER_STEP });
  const visibleChapters = step.query === searchQuery ? step.count : CHAPTERS_PER_STEP;
  const shownChapters = filteredChapters.slice(0, visibleChapters);
  const remaining = filteredChapters.length - shownChapters.length;

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
            placeholder={isRTL ? "بحث في عناوين الفهرس والمسائل المفتوحة..." : "Search text or keywords..."}
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
          {shownChapters.map((ch) => (
            <div key={ch.id} className="space-y-2">
              <p className="text-[11px] font-black text-amber-600 dark:text-amber-500 border-b pb-1 border-slate-100 dark:border-white/[0.04]">{ch.title}</p>
              {ch.sections.map((sec) => {
                const blocks = blocksBySection[sec.id] ?? [];
                const complete = completeSections[sec.id] === true;
                const isLoading = loadingSectionId === sec.id;
                return (
                  <div key={sec.id} className="pl-2 space-y-1">
                    {/* The section title opens it: its blocks load on demand. */}
                    <button
                      type="button"
                      onClick={() => onOpenSection(sec.id)}
                      disabled={isLoading}
                      className="w-full text-right text-[10px] font-bold text-slate-500 dark:text-zinc-400 hover:text-[#0B3D2E] dark:hover:text-[#C8A762] transition flex items-center justify-between gap-2"
                    >
                      <span>{sec.title}</span>
                      {isLoading ? (
                        <span className="w-3 h-3 border-2 border-[#C8A762] border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : complete && blocks.length === 0 ? (
                        <span className="text-[9px] font-medium opacity-75 shrink-0">لا نص</span>
                      ) : null}
                    </button>
                    {blocks.map(b => (
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
                        {/* Chip omitted entirely when the source states no locator. */}
                        {formatLocator(b, isRTL) && (
                          <span className="text-[9px] opacity-75 px-1.5 py-0.5 bg-black/10 dark:bg-white/5 rounded">
                            {formatLocator(b, isRTL)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setStep({ query: searchQuery, count: visibleChapters + CHAPTERS_PER_STEP })}
              className={`w-full px-3 py-2 rounded-xl text-[11px] font-bold border transition ${
                isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-300" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {`عرض المزيد من الأبواب (${remaining} متبقية)`}
            </button>
          )}
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
