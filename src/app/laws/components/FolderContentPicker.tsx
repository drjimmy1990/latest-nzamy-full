"use client";

/**
 * FolderContentPicker — the search box, the five tabs and the result list of
 * «إدارة محتوى مجلد», shared by the «مجلداتي» widget (SmartFolders.tsx) and
 * the reader pages' save dialog (FolderSelectionModal.tsx). It reads the real
 * library through useFolderLibrarySearch (owner notes ٠٤ §٢, ٠٥ §٢.٢); the
 * container owns the folder and the save calls.
 */

import { useState, type ReactNode } from "react";
import { BookOpen, Check, Gavel, MagnifyingGlass, Plus, Scroll, WarningCircle, CircleNotch } from "@phosphor-icons/react";
import type { LibraryDoc } from "./SmartFolderTypes";
import { FOLDER_PICKER_TABS, MIN_QUERY_LENGTH, docKey, type FolderPickerTab } from "./folderLibrarySearch";
import { useFolderLibrarySearch } from "./useFolderLibrarySearch";

interface FolderContentPickerProps {
  isDark: boolean;
  isRTL: boolean;
  folderColor: string;
  isInFolder: (doc: { slug: string; type?: string | null }) => boolean;
  onToggle: (doc: LibraryDoc) => void;
  /** docKey()s whose save/remove request is still in flight. */
  pendingKeys?: ReadonlySet<string>;
  /** Shown above the library list while nothing is typed (current items, recent sessions). */
  children?: (tab: FolderPickerTab) => ReactNode;
  autoFocusSearch?: boolean;
}

export function DocTypeIcon({ type, color }: { type?: string | null; color: string }) {
  if (type === "order") return <Scroll size={13} className="text-emerald-500" />;
  if (type === "precedent") return <Gavel size={13} className="text-purple-500" />;
  if (type === "book") return <BookOpen size={13} className="text-amber-500" />;
  return <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />;
}

export default function FolderContentPicker({
  isDark, isRTL, folderColor, isInFolder, onToggle, pendingKeys, children, autoFocusSearch,
}: FolderContentPickerProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<FolderPickerTab>("all");
  const search = useFolderLibrarySearch(query, tab, true);
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <>
      {/* Search input */}
      <div className="relative mb-3 flex-shrink-0">
        <input
          type="search"
          value={query}
          autoFocus={autoFocusSearch}
          onChange={e => setQuery(e.target.value)}
          aria-label={isRTL ? "البحث في المكتبة" : "Search the library"}
          placeholder={isRTL ? "ابحث في كامل المكتبة: نظام، مبدأ، حكم، تعميم أو كتاب فقهي..." : "Search the whole library..."}
          className={`w-full text-xs pl-3 pr-8 py-2 rounded-xl border outline-none ${
            isDark
              ? "bg-[#0c0f12] border-white/5 text-white placeholder-gray-600 focus:border-[#C8A762]/40"
              : "bg-slate-50 border-slate-200 text-gray-900 placeholder-gray-400 focus:border-[#0B3D2E]"
          }`}
        />
        <MagnifyingGlass size={14} className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? "left-3" : "right-3"} text-gray-400`} />
      </div>

      {/* Category tabs */}
      <div role="tablist" aria-label={isRTL ? "نوع المحتوى" : "Content type"} className="flex gap-1.5 overflow-x-auto pb-3 mb-3 border-b border-slate-100 dark:border-white/[0.04] flex-shrink-0">
        {FOLDER_PICKER_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all border whitespace-nowrap ${
              tab === t.id
                ? isDark ? "border-[#C8A762]/40 text-[#C8A762] bg-[#C8A762]/10" : "border-[#0B3D2E]/20 text-[#0B3D2E] bg-[#0B3D2E]/5"
                : isDark ? "border-white/[0.04] text-zinc-500 hover:border-white/10" : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            {isRTL ? t.label : t.labelEn}
          </button>
        ))}
      </div>

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
        {!query.trim() && children?.(tab)}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className={`block text-[10px] font-bold tracking-wider ${muted}`}>
              {search.showingDefaults
                ? (isRTL ? "أحدث محتوى المكتبة" : "Latest in the library")
                : (isRTL ? "نتائج البحث في المكتبة" : "Library search results")}
            </span>
            {search.status === "loading" && (
              <span role="status" className={`flex items-center gap-1 text-[10px] ${muted}`}>
                <CircleNotch size={11} className="animate-spin" />
                {isRTL ? "جارٍ البحث..." : "Searching..."}
              </span>
            )}
          </div>

          {search.queryTooShort && (
            <p className={`text-[10px] ${muted}`}>
              {isRTL ? "اكتب حرفين على الأقل للبحث في كامل المكتبة." :`Type at least ${MIN_QUERY_LENGTH} letters to search.`}
            </p>
          )}

          {search.status === "error" || search.status === "closed" ? (
            <div className="py-6 flex flex-col items-center gap-1.5 text-center">
              <WarningCircle size={22} weight="duotone" className="text-amber-500" />
              <p className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                {search.status === "closed"
                  ? (isRTL ? "المكتبة مغلقة مؤقتاً." : "The library is temporarily closed.")
                  : (isRTL ? "تعذّر البحث في المكتبة الآن — هذه ليست نتيجة فارغة. أعد المحاولة بعد قليل." : "Could not search the library right now.")}
              </p>
            </div>
          ) : (
            <ul className="space-y-2 pb-4">
              {search.docs.map(doc => {
                const inFolder = isInFolder(doc);
                const pending = pendingKeys?.has(docKey(doc)) ?? false;
                return (
                  <li key={`lib-${docKey(doc)}`}>
                    <button
                      type="button"
                      aria-pressed={inFolder}
                      disabled={pending}
                      onClick={() => onToggle(doc)}
                      className={`w-full text-start flex items-center justify-between p-2.5 rounded-xl border transition-all disabled:opacity-60 ${
                        inFolder
                          ? isDark ? "bg-[#0B3D2E]/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-900"
                          : isDark ? "bg-white/[0.02] border-white/5 text-gray-300 hover:bg-white/5" : "bg-slate-50 border-slate-200 text-gray-700 hover:bg-slate-100"
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="flex-shrink-0"><DocTypeIcon type={doc.type} color={folderColor} /></span>
                        <span className="text-xs font-semibold truncate">{doc.title}</span>
                      </span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        {inFolder && (
                          <span className="text-[9px] font-bold">{isRTL ? "في المجلد" : "In folder"}</span>
                        )}
                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                          inFolder ? "bg-emerald-500 border-emerald-500 text-white" : isDark ? "border-white/20" : "border-gray-300"
                        }`}>
                          {pending
                            ? <CircleNotch size={10} className="animate-spin" />
                            : inFolder ? <Check size={12} weight="bold" /> : <Plus size={10} weight="bold" />}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {search.status === "ready" && search.docs.length === 0 && (
                <li className={`text-xs text-center py-8 ${muted}`}>
                  {search.showingDefaults
                    ? (isRTL ? "لا يوجد محتوى في هذا القسم بعد." : "Nothing in this section yet.")
                    : (isRTL ? "لا توجد نتائج مطابقة لبحثك." : "No matching items found.")}
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
