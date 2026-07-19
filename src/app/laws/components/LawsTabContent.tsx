"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSubscription } from "@/hooks/useSubscription";
import {
  BookOpen,
  Lock,
  Sparkle,
  ArrowRight,
  Gavel,
  Scales,
  Scroll,
} from "@phosphor-icons/react";
import { LAW_DOC_TYPES, type DocSubType, getDocAnchorPrefix } from "@/constants/lawsLibraryData";
import { LEGAL_TAXONOMY } from "@/constants/taxonomies";
import {
  PrincipleCard,
  PrincipleRow,
  PrecedentCard,
  PrecedentRow,
  OrderRow,
  OrderCard,
  EmptyState,
} from "./ListItems";

interface LawsTabContentProps {
  isDark: boolean;
  isRTL: boolean;
  muted: string;
  activeType: string;
  setActiveType: (type: any) => void;
  layoutMode: "grid" | "list";
  isLoggedIn: boolean;
  q: string;
  filteredLaws: any[];
  filteredFeqhBooks: any[];
  filteredCollections: any[];
  filteredPrinciples: any[];
  filteredPrecedents: any[];
  filteredOrders: any[];
  setShowPaywall: (show: boolean) => void;
  setPrecMode: (mode: string) => void;
  setSelectedHashtag: (tag: string | null) => void;
  catHasContent: (catId: string) => boolean;
  activeCat: string;
  hasResults: (type: any) => boolean;
  precSort: "relevance" | "year-desc" | "year-asc" | "date-desc";
  setPrecSort: (sort: "relevance" | "year-desc" | "year-asc" | "date-desc") => void;
  // فلتر النوع الفرعي لأنظمة ولوائح
  docSubType: DocSubType;
  setDocSubType: (type: DocSubType) => void;
  // اشتراك المكتبة — يفتح كل محتوى أنظمة ولوائح
  librarySubscribed?: boolean;
}

export function LawsTabContent({
  isDark,
  isRTL,
  muted,
  activeType,
  setActiveType,
  layoutMode,
  isLoggedIn,
  q,
  filteredLaws,
  filteredFeqhBooks,
  filteredCollections,
  filteredPrinciples,
  filteredPrecedents,
  filteredOrders,
  setShowPaywall,
  setPrecMode,
  setSelectedHashtag,
  catHasContent,
  activeCat,
  hasResults,
  precSort,
  setPrecSort,
  docSubType,
  setDocSubType,
  librarySubscribed = false,
}: LawsTabContentProps) {
  const router = useRouter();
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>({});
  const { can } = useSubscription();
  const hasLibraryAccess = can("library-full-access");

  return (
    <motion.div
      key="laws-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
    >
      {/* Sorting Bar */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 p-4 rounded-2xl border ${
        isDark ? "bg-[#161b22]/50 border-[#2d3748]/50" : "bg-gray-50/50 border-gray-200/60"
      }`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            {isRTL ? "ترتيب النتائج:" : "Sort results by:"}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "relevance", labelAr: "مدى المطابقة (الافتراضي)", labelEn: "Relevance" },
              { id: "year-desc", labelAr: "الأحدث إصداراً/تحديثاً", labelEn: "Newest" },
              { id: "year-asc", labelAr: "الأقدم إصداراً/تحديثاً", labelEn: "Oldest" }
            ].map((opt) => {
              const isSelected = precSort === opt.id || (opt.id === "year-desc" && precSort === "date-desc");
              return (
                <button
                  key={opt.id}
                  onClick={() => setPrecSort(opt.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                    isSelected
                      ? isDark
                        ? "bg-[#C8A762]/10 border border-[#C8A762] text-[#C8A762]"
                        : "bg-[#0B3D2E] text-white border border-[#0B3D2E] shadow-sm"
                      : isDark
                      ? "border border-white/5 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                      : "border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                  }`}
                >
                  {isRTL ? opt.labelAr : opt.labelEn}
                </button>
              );
            })}
          </div>
        </div>
      </div>


      {/* Laws grid */}
      {(activeType === "all" || activeType === "laws") && filteredLaws.length > 0 && (
        <>
          {activeType === "all" && (
            <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
              <BookOpen size={13} />
              {isRTL ? "الأنظمة واللوائح" : "Laws & Regulations"}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
                {filteredLaws.length}
              </span>
            </p>
          )}
          <div className={layoutMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8" : "flex flex-col gap-4 mb-8"}>
            <AnimatePresence mode="popLayout">
              {filteredLaws.map((sys, idx) => {
                const isUnlocked = sys.free || hasLibraryAccess;
                return (
                <motion.div
                  key={sys.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("button") || target.closest("a") || target.closest(".clickable-badge")) {
                      return;
                    }
                    if (!isUnlocked) {
                      setShowPaywall(true);
                    } else {
                      router.push(`/laws/${sys.slug}${getDocAnchorPrefix(docSubType) ? `?fromType=${encodeURIComponent(docSubType)}` : ""}`);
                    }
                  }}
                  className={`group relative rounded-2xl border p-5 transition-all ${
                    isUnlocked
                      ? `hover:border-[#0B3D2E]/40 cursor-pointer ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`
                      : `${isDark ? "bg-[#161b22]/60 border-[#2d3748]/60" : "bg-gray-50 border-gray-200/80"}`
                  }`}
                >
                  {!isUnlocked && (
                    <div
                      className={`absolute inset-0 rounded-2xl ${isDark ? "bg-[#0c0f12]/30" : "bg-white/30"} backdrop-blur-[1px] z-10 flex items-center justify-center cursor-pointer`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPaywall(true);
                      }}
                    >
                      <div className={`rounded-2xl border px-4 py-2 flex items-center gap-2 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"} shadow-lg`}>
                        <Lock size={16} color="#C8A762" weight="fill" />
                        <span className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                          {isRTL ? "يتطلب اشتراكاً" : "Requires Subscription"}
                        </span>
                      </div>
                    </div>
                  )}

                  {layoutMode === "grid" ? (
                    <div className={!isUnlocked ? "opacity-40 filter blur-[2px] h-full flex flex-col items-center text-center" : "h-full flex flex-col items-center text-center"}>
                      <div className="flex items-center justify-between w-full mb-3 text-xs">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-lg ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
                          {isRTL ? "مُحدّث" : "Updated"}
                        </span>
                        {isUnlocked && (
                          <span className="px-2 py-0.5 text-[9px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center gap-1">
                            <Sparkle size={9} weight="fill" />
                            {librarySubscribed && !sys.free ? (isRTL ? "مكتبة" : "SUBSCRIBED") : (isRTL ? "متاح" : "FREE")}
                          </span>
                        )}
                      </div>
                      
                      <h3 className={`text-base font-black mb-2 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition-colors leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                        {isRTL ? sys.title : sys.titleEn}
                      </h3>

                      {/* Rich Metadata Section */}
                      <div className="flex flex-wrap justify-center gap-1 mb-2.5">
                        {sys.cat && (() => {
                          const catObj = LEGAL_TAXONOMY.find(c => c.id === sys.cat);
                          if (!catObj) return null;
                          return (
                            <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded ${isDark ? "bg-white/5 text-gray-400 border border-white/[0.04]" : "bg-gray-100 text-gray-600 border border-gray-200"}`}>
                              {isRTL ? catObj.label : catObj.labelEn}
                            </span>
                          );
                        })()}
                        {sys.doc_type && (
                          <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {sys.doc_type}
                          </span>
                        )}
                        {sys.sub_types && sys.sub_types.map((st: string) => {
                          const isReg = st === "لائحة تنفيذية" || st === "لائحة";
                          return (
                            <span
                              key={st}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!isUnlocked) {
                                  setShowPaywall(true);
                                } else {
                                  router.push(`/laws/${sys.slug}?viewMode=${isReg ? "regulation" : "appendix"}`);
                                }
                              }}
                              className="clickable-badge cursor-pointer hover:bg-blue-500/20 transition-colors text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                            >
                              {st}
                            </span>
                          );
                        })}
                      </div>

                      {/* Expandable Abstract Description */}
                      {(() => {
                        const description = isRTL ? sys.desc : sys.descEn || sys.desc;
                        const isExpanded = !!expandedDesc[sys.id];
                        const isLong = description && description.length > 100;
                        const shownDesc = isExpanded ? description : (isLong ? description.slice(0, 100) + "..." : description);
                        return (
                          <p className={`text-[11.5px] leading-relaxed mb-3 ${muted}`}>
                            {shownDesc}
                            {isLong && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setExpandedDesc(prev => ({ ...prev, [sys.id]: !prev[sys.id] }));
                                }}
                                className="ms-1 font-bold text-[#0B3D2E] dark:text-[#C8A762] hover:underline shrink-0"
                              >
                                {isExpanded ? (isRTL ? "عرض أقل" : "Show less") : (isRTL ? "إظهار المزيد" : "Show more")}
                              </button>
                            )}
                          </p>
                        );
                      })()}

                      {/* Inline Compact Articles/Chapters Summary */}
                      <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mb-4 py-1.5 px-3 rounded-lg text-[10px] font-bold text-center ${isDark ? "bg-white/[0.03] text-gray-400" : "bg-gray-50 text-gray-600"}`}>
                        <span>{isRTL ? `المواد: ${sys.articlesCount}` : `Articles: ${sys.articlesCount}`}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-400 opacity-50" />
                        <span>{isRTL ? `الأبواب: ${sys.chaptersCount}` : `Chapters: ${sys.chaptersCount}`}</span>
                        {sys.issuing_instrument && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-gray-400 opacity-50" />
                            <span className="truncate max-w-[120px]">{sys.issuing_instrument.split(" وتاريخ ")[0]}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center justify-between w-full mt-auto pt-2 border-t border-dashed border-gray-200 dark:border-white/[0.04]">
                        <span className={`text-[11px] flex items-center gap-1 font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                          {isRTL ? "تصفح النظام" : "Browse System"}
                          <ArrowRight size={12} className={isRTL ? "rotate-180 transition-transform group-hover:-translate-x-1" : "transition-transform group-hover:translate-x-1"} />
                        </span>
                        {sys.lastUpdated && (
                          <span className={`text-[10px] ${muted}`}>
                            {isRTL ? `تحديث: ${sys.lastUpdated}` : `Updated: ${sys.lastUpdated}`}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className={`${!isUnlocked ? "opacity-40 filter blur-[2px]" : ""} flex flex-col sm:flex-row sm:items-center gap-3`}>
                      {/* Left: Text info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                            {isRTL ? "مُحدَّث" : "Updated"}
                          </span>
                          {isUnlocked && (
                            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md flex items-center gap-1">
                              <Sparkle size={9} weight="fill" />
                              {librarySubscribed && !sys.free ? (isRTL ? "مكتبة" : "SUBSCRIBED") : (isRTL ? "متاح" : "FREE")}
                            </span>
                          )}
                        </div>

                        <h3 className={`text-sm font-black mb-1.5 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition-colors leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                          {isRTL ? sys.title : sys.titleEn}
                        </h3>

                        {/* Badges */}
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {sys.cat && (() => {
                            const catObj = LEGAL_TAXONOMY.find(c => c.id === sys.cat);
                            if (!catObj) return null;
                            return (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isDark ? "bg-white/5 text-gray-400 border border-white/[0.04]" : "bg-gray-100 text-gray-600 border border-gray-200"}`}>
                                {isRTL ? catObj.label : catObj.labelEn}
                              </span>
                            );
                          })()}
                          {sys.doc_type && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              {sys.doc_type}
                            </span>
                          )}
                          {sys.sub_types && sys.sub_types.map((st: string) => {
                            const isReg = st === "لائحة تنفيذية" || st === "لائحة";
                            return (
                              <span
                                key={st}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!isUnlocked) {
                                    setShowPaywall(true);
                                  } else {
                                    router.push(`/laws/${sys.slug}?viewMode=${isReg ? "regulation" : "appendix"}`);
                                  }
                                }}
                                className="clickable-badge cursor-pointer hover:bg-blue-500/25 transition-colors text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                              >
                                {st}
                              </span>
                            );
                          })}
                          {sys.issuing_instrument && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isDark ? "bg-[#C8A762]/10 border-[#C8A762]/20 text-[#C8A762]" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                              {sys.issuing_instrument}
                            </span>
                          )}
                        </div>

                        {/* Short Description */}
                        {(() => {
                          const description = isRTL ? sys.desc : sys.descEn || sys.desc;
                          const isExpanded = !!expandedDesc[sys.id];
                          const isLong = description && description.length > 100;
                          const shownDesc = isExpanded ? description : (isLong ? description.slice(0, 100) + "..." : description);
                          return (
                            <p className={`text-[11px] leading-relaxed ${muted}`}>
                              {shownDesc}
                              {isLong && (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setExpandedDesc(prev => ({ ...prev, [sys.id]: !prev[sys.id] }));
                                  }}
                                  className="ms-1 font-bold text-[#0B3D2E] dark:text-[#C8A762] hover:underline"
                                >
                                  {isExpanded ? (isRTL ? "عرض أقل" : "Show less") : (isRTL ? "إظهار المزيد" : "Show more")}
                                </button>
                              )}
                            </p>
                          );
                        })()}
                      </div>

                      {/* Right: Stats + CTA */}
                      <div className="flex items-center gap-3 sm:shrink-0">
                        <div className={`grid grid-cols-2 gap-3 px-3 py-2 rounded-lg border ${isDark ? "border-[#2d3748] bg-white/5" : "border-gray-100 bg-gray-50/60"}`}>
                          <div className="flex flex-col items-center">
                            <span className={`text-[9px] uppercase tracking-wider ${muted}`}>{isRTL ? "المواد" : "Articles"}</span>
                            <span className={`text-sm font-black ${isDark ? "text-gray-200" : "text-gray-800"}`}>{sys.articlesCount}</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className={`text-[9px] uppercase tracking-wider ${muted}`}>{isRTL ? "الأبواب" : "Chapters"}</span>
                            <span className={`text-sm font-black ${isDark ? "text-gray-200" : "text-gray-800"}`}>{sys.chaptersCount}</span>
                          </div>
                        </div>
                        <div className="flex flex-col justify-center gap-1">
                          <span className={`text-[11px] flex items-center gap-1 font-bold whitespace-nowrap ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                            {isRTL ? "تصفح النظام" : "Browse"}
                            <ArrowRight size={12} className={isRTL ? "rotate-180 transition-transform group-hover:-translate-x-1" : "transition-transform group-hover:translate-x-1"} />
                          </span>
                          {sys.lastUpdated && (
                            <span className={`text-[9px] ${muted} whitespace-nowrap`}>
                              {isRTL ? `آخر تعديل: ${sys.lastUpdated}` : `Updated: ${sys.lastUpdated}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}

      {activeType === "all" && filteredCollections.length > 0 && (
        <div className="mb-8">
          <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
            <Gavel size={13} />
            {isRTL ? "مجموعات المبادئ القضائية" : "Judicial Collections"}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>
              {filteredCollections.length}
            </span>
          </p>
          <div className={layoutMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-4" : "flex flex-col gap-4 mb-4"}>
            {filteredCollections.slice(0, 3).map((col, idx) => (
              <motion.div
                key={col.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`group relative rounded-2xl border p-5 transition-all ${
                  col.free
                    ? `hover:border-[#0B3D2E]/40 cursor-pointer ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`
                    : `${isDark ? "bg-[#161b22]/60 border-[#2d3748]/60" : "bg-gray-50 border-gray-200/80"}`
                } ${layoutMode === "grid" ? "min-h-[340px] h-full flex flex-col" : ""}`}
              >
                {!col.free && (
                  <div
                    className={`absolute inset-0 rounded-2xl ${isDark ? "bg-[#0c0f12]/30" : "bg-white/30"} backdrop-blur-[1px] z-10 flex items-center justify-center cursor-pointer`}
                    onClick={() => setShowPaywall(true)}
                  >
                    <div className={`rounded-2xl border px-4 py-2 flex items-center gap-2 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"} shadow-lg`}>
                      <Lock size={16} color="#C8A762" weight="fill" />
                      <span className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        {isRTL ? "يتطلب اشتراكاً" : "Requires Subscription"}
                      </span>
                    </div>
                  </div>
                )}

                <Link
                  href={col.free ? `/precedents/${col.slug}` : "#"}
                  onClick={(e) => {
                    if (!col.free) {
                      e.preventDefault();
                      setShowPaywall(true);
                    }
                  }}
                  className={layoutMode === "grid" ? "flex flex-col flex-1 justify-between" : "flex flex-col md:flex-row md:items-center justify-between w-full gap-5"}
                >
                  {layoutMode === "grid" ? (
                    <>
                      <div className={!col.free ? "opacity-40 filter blur-[2px]" : ""}>
                        <div className="flex items-center justify-between mb-4">
                          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg ${
                            col.track === "ordinary"
                              ? isDark
                                ? "bg-[#0B3D2E]/20 text-emerald-400 border border-emerald-500/10"
                                : "bg-emerald-50 text-[#0B3D2E] border border-emerald-200"
                              : col.track === "admin"
                              ? isDark
                                ? "bg-blue-950/40 text-blue-400 border border-blue-500/10"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                              : isDark
                              ? "bg-purple-950/40 text-purple-400 border border-purple-500/10"
                              : "bg-purple-50 text-purple-700 border border-purple-200"
                          }`}>
                            {col.court}
                          </span>
                          {col.free && (
                            <span className="px-2 py-1 text-[10px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center gap-1">
                              <Sparkle size={10} weight="fill" />
                              {isRTL ? "متاح" : "FREE"}
                            </span>
                          )}
                        </div>

                        <h3 className={`text-base font-black mb-1 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition-colors leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                          {col.title}
                        </h3>
                        <p className="text-[11px] text-amber-600 dark:text-[#C8A762] font-semibold mb-2">
                          {isRTL ? `إصدار: ${col.year}` : `Year: ${col.year}`}
                        </p>
                        <p className={`text-xs mb-5 line-clamp-2 leading-relaxed ${muted}`}>{col.desc}</p>
                      </div>

                      <div className={!col.free ? "opacity-40 filter blur-[2px]" : ""}>
                        <div className={`grid grid-cols-2 gap-3 mb-4 p-2.5 rounded-xl border ${isDark ? "border-[#2d3748] bg-white/5" : "border-gray-100 bg-gray-50/50"}`}>
                          <div className="flex flex-col">
                            <span className={`text-[9px] uppercase tracking-wider ${muted}`}>{isRTL ? "عدد المبادئ" : "Principles Count"}</span>
                            <span className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{col.rulingCount}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className={`text-[9px] uppercase tracking-wider ${muted}`}>{isRTL ? "المسار" : "Track"}</span>
                            <span className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                              {col.track === "ordinary"
                                ? isRTL
                                  ? "قضاء عادي"
                                  : "Ordinary"
                                : col.track === "admin"
                                ? isRTL
                                  ? "قضاء إداري"
                                  : "Administrative"
                                : isRTL
                                ? "شبه قضائي"
                                : "Semi-Judicial"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className={`text-xs flex items-center gap-1 font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                            {isRTL ? "تصفح المجموعة" : "Browse Collection"}
                            <ArrowRight size={14} className={isRTL ? "rotate-180 transition-transform group-hover:-translate-x-1" : "transition-transform group-hover:translate-x-1"} />
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={`flex-1 ${!col.free ? "opacity-40 filter blur-[2px]" : ""}`}>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg ${
                            col.track === "ordinary"
                              ? isDark
                                ? "bg-[#0B3D2E]/20 text-emerald-400 border border-emerald-500/10"
                                : "bg-emerald-50 text-[#0B3D2E] border border-emerald-200"
                              : col.track === "admin"
                              ? isDark
                                ? "bg-blue-950/40 text-blue-400 border border-blue-500/10"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                              : isDark
                              ? "bg-purple-950/40 text-purple-400 border border-purple-500/10"
                              : "bg-purple-50 text-purple-700 border border-purple-200"
                          }`}>
                            {col.court}
                          </span>
                          {col.free && (
                            <span className="px-2 py-1 text-[10px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center gap-1">
                              <Sparkle size={10} weight="fill" />
                              {isRTL ? "متاح" : "FREE"}
                            </span>
                          )}
                        </div>
                        <h3 className={`text-base font-black mb-1 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition-colors leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                          {col.title}
                        </h3>
                        <p className="text-[11px] text-amber-600 dark:text-[#C8A762] font-semibold mb-2">
                          {isRTL ? `إصدار: ${col.year}` : `Year: ${col.year}`}
                        </p>
                        <p className={`text-xs line-clamp-2 leading-relaxed ${muted}`}>{col.desc}</p>
                      </div>

                      <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-8 md:shrink-0 ${!col.free ? "opacity-40 filter blur-[2px]" : ""}`}>
                        <div className={`grid grid-cols-2 gap-4 p-4 rounded-xl border min-w-[220px] ${isDark ? "border-[#2d3748] bg-white/5" : "border-gray-100 bg-gray-50/50"}`}>
                          <div className="flex flex-col">
                            <span className={`text-[9px] uppercase tracking-wider ${muted}`}>{isRTL ? "عدد المبادئ" : "Principles Count"}</span>
                            <span className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{col.rulingCount}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className={`text-[9px] uppercase tracking-wider ${muted}`}>{isRTL ? "المسار" : "Track"}</span>
                            <span className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                              {col.track === "ordinary"
                                ? isRTL
                                  ? "قضاء عادي"
                                  : "Ordinary"
                                : col.track === "admin"
                                ? isRTL
                                  ? "قضاء إداري"
                                  : "Administrative"
                                : isRTL
                                ? "شبه قضائي"
                                : "Semi-Judicial"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col justify-center gap-2 sm:min-w-[130px]">
                          <span className={`text-xs flex items-center gap-1 font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                            {isRTL ? "تصفح المجموعة" : "Browse Collection"}
                            <ArrowRight size={14} className={isRTL ? "rotate-180 transition-transform group-hover:-translate-x-1" : "transition-transform group-hover:translate-x-1"} />
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </Link>
              </motion.div>
            ))}
          </div>
          {filteredCollections.length > 3 && (
            <button
              onClick={() => setActiveType("precedents")}
              className={`text-sm font-bold flex items-center gap-1.5 mb-8 ${isDark ? "text-[#C8A762] hover:text-[#C8A762]/80" : "text-[#0B3D2E] hover:text-[#0a3328]"} transition-colors`}
            >
              {isRTL ? `عرض كل ${filteredCollections.length} مجموعات قضائية` : `View all ${filteredCollections.length} collections`}
              <ArrowRight size={14} className={isRTL ? "rotate-180" : ""} />
            </button>
          )}
        </div>
      )}

      {/* "all" mode: also show principles + orders below */}
      {activeType === "all" && filteredPrinciples.length > 0 && (
        <div className="mb-8">
          <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
            <Scales size={13} />
            {isRTL ? "أبرز المبادئ القضائية" : "Featured Principles"}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>
              {filteredPrinciples.length}
            </span>
          </p>
          <div className={layoutMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" : "space-y-3"}>
            <AnimatePresence mode="popLayout">
              {filteredPrinciples.slice(0, 3).map((p, idx) =>
                layoutMode === "grid" ? (
                  <PrincipleCard key={p.id} p={p} isDark={isDark} idx={idx} isRTL={isRTL} q={q} />
                ) : (
                  <PrincipleRow key={p.id} p={p} isDark={isDark} idx={idx} isRTL={isRTL} q={q} />
                )
              )}
            </AnimatePresence>
          </div>
          {filteredPrinciples.length > 3 && (
            <button
              onClick={() => setActiveType("precedents")}
              className={`text-sm font-bold flex items-center gap-1.5 ${isDark ? "text-[#C8A762] hover:text-[#C8A762]/80" : "text-[#0B3D2E] hover:text-[#0a3328]"} transition-colors`}
            >
              {isRTL ? `عرض كل ${filteredPrinciples.length} مبدأ` : `View all ${filteredPrinciples.length} principles`}
              <ArrowRight size={14} className={isRTL ? "rotate-180" : ""} />
            </button>
          )}
        </div>
      )}

      {/* precedents list in 'all' view */}
      {activeType === "all" && filteredPrecedents.length > 0 && (
        <div className="mb-8">
          <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
            <Gavel size={13} />
            {isRTL ? "أبرز السوابق القضائية" : "Featured Precedents"}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-purple-900/20 text-purple-400" : "bg-purple-50 text-purple-700"}`}>
              {filteredPrecedents.length}
            </span>
          </p>
          <div className={layoutMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" : "space-y-3"}>
            <AnimatePresence mode="popLayout">
              {filteredPrecedents.slice(0, 3).map((pr, idx) =>
                layoutMode === "grid" ? (
                  <PrecedentCard
                    key={pr.id}
                    pr={pr}
                    isDark={isDark}
                    idx={idx}
                    isRTL={isRTL}
                    onClick={() => router.push(`/precedents/judgment/${pr.id}`)}
                    onHashtagClick={(tag) => setSelectedHashtag(tag)}
                    q={q}
                  />
                ) : (
                  <PrecedentRow
                    key={pr.id}
                    pr={pr}
                    isDark={isDark}
                    idx={idx}
                    isRTL={isRTL}
                    onClick={() => router.push(`/precedents/judgment/${pr.id}`)}
                    onHashtagClick={(tag) => setSelectedHashtag(tag)}
                    q={q}
                  />
                )
              )}
            </AnimatePresence>
          </div>
          {filteredPrecedents.length > 3 && (
            <button
              onClick={() => {
                setActiveType("precedents");
                setPrecMode("precedents");
              }}
              className={`text-sm font-bold flex items-center gap-1.5 mt-4 ${isDark ? "text-[#C8A762] hover:text-[#C8A762]/80" : "text-[#0B3D2E] hover:text-[#0a3328]"} transition-colors`}
            >
              {isRTL ? `عرض كل ${filteredPrecedents.length} سابقة قضائية` : `View all ${filteredPrecedents.length} precedents`}
              <ArrowRight size={14} className={isRTL ? "rotate-180" : ""} />
            </button>
          )}
        </div>
      )}

      {/* "all" mode: show Feqh books preview */}
      {activeType === "all" && filteredFeqhBooks.length > 0 && (
        <div className="mb-8">
          <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
            <BookOpen size={13} />
            {isRTL ? "الفقه والمراجع" : "Fiqh & References"}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>
              {filteredFeqhBooks.length}
            </span>
          </p>
          <div className={layoutMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-4" : "flex flex-col gap-4 mb-4"}>
            {filteredFeqhBooks.slice(0, 3).map((book, idx) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`group relative rounded-2xl border p-5 transition-all flex flex-col ${
                  layoutMode === "grid" ? "min-h-[340px] h-full" : ""
                } ${
                  book.free
                    ? `hover:border-[#0B3D2E]/40 cursor-pointer ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`
                    : `${isDark ? "bg-[#161b22]/60 border-[#2d3748]/60" : "bg-gray-50 border-gray-200/80"}`
                }`}
              >
                {!book.free && (
                  <div
                    className={`absolute inset-0 rounded-2xl ${isDark ? "bg-[#0c0f12]/30" : "bg-white/30"} backdrop-blur-[1px] z-10 flex items-center justify-center cursor-pointer`}
                    onClick={() => setShowPaywall(true)}
                  >
                    <div className={`rounded-2xl border px-4 py-2 flex items-center gap-2 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"} shadow-lg`}>
                      <Lock size={16} color="#C8A762" weight="fill" />
                      <span className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        {isRTL ? "يتطلب اشتراكاً" : "Requires Subscription"}
                      </span>
                    </div>
                  </div>
                )}

                <Link
                  href={book.free ? `/book/${book.slug}` : "#"}
                  onClick={(e) => {
                    if (!book.free) {
                      e.preventDefault();
                      setShowPaywall(true);
                    }
                  }}
                  className={layoutMode === "grid" ? "flex flex-col flex-1 justify-between" : "w-full"}
                >
                  {layoutMode === "grid" ? (
                    <div className="flex flex-col flex-1 justify-between">
                      <div className={!book.free ? "opacity-40 filter blur-[2px]" : ""}>
                        <div className="flex items-center justify-between mb-4">
                          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg ${
                            book.type === "sharia"
                              ? isDark
                                ? "bg-amber-950/40 text-amber-400 border border-amber-500/10"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                              : book.type === "comparative"
                              ? isDark
                                ? "bg-purple-950/40 text-purple-400 border border-purple-500/10"
                                : "bg-purple-50 text-purple-700 border border-purple-200"
                              : isDark
                              ? "bg-blue-950/40 text-blue-400 border border-blue-500/10"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}>
                            {book.categoryLabel}
                          </span>
                          {book.free && (
                            <span className="px-2 py-1 text-[10px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center gap-1">
                              <Sparkle size={10} weight="fill" />
                              {isRTL ? "متاح" : "FREE"}
                            </span>
                          )}
                        </div>

                        <h3 className={`text-base font-black mb-1 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition-colors leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                          {book.title}
                        </h3>
                        <p className="text-[11px] text-amber-600 dark:text-[#C8A762] font-semibold mb-2">{book.author}</p>
                        <p className={`text-xs mb-5 line-clamp-2 leading-relaxed ${muted}`}>{book.desc}</p>
                      </div>

                      <div className={`grid grid-cols-2 gap-3 mb-4 p-2.5 rounded-xl border ${isDark ? "border-[#2d3748] bg-white/5" : "border-gray-100 bg-gray-50/50"} ${!book.free ? "opacity-40 filter blur-[2px]" : ""}`}>
                        <div className="flex flex-col">
                          <span className={`text-[9px] uppercase tracking-wider ${muted}`}>{isRTL ? "المجلدات" : "Volumes"}</span>
                          <span className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{book.volCount}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className={`text-[9px] uppercase tracking-wider ${muted}`}>{isRTL ? "نوع المرجع" : "Type"}</span>
                          <span className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                            {book.type === "sharia" ? (isRTL ? "شرعي" : "Sharia") : book.type === "comparative" ? (isRTL ? "مقارن" : "Comparative") : (isRTL ? "وضعي" : "Positive")}
                          </span>
                        </div>
                      </div>

                      <div className={`flex items-center justify-between mt-auto ${!book.free ? "opacity-40 filter blur-[2px]" : ""}`}>
                        <span className={`text-xs flex items-center gap-1 font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                          {isRTL ? "تصفح المرجع" : "Browse Reference"}
                          <ArrowRight size={14} className={isRTL ? "rotate-180 transition-transform group-hover:-translate-x-1" : "transition-transform group-hover:translate-x-1"} />
                        </span>
                        <span className={`text-[10px] ${muted}`}>{book.lastUpdated}</span>
                      </div>
                    </div>
                  ) : (
                    <div className={`${!book.free ? "opacity-40 filter blur-[2px]" : ""} flex flex-col md:flex-row md:items-center justify-between gap-5`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg ${
                            book.type === "sharia"
                              ? isDark
                                ? "bg-amber-950/40 text-amber-400 border border-amber-500/10"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                              : book.type === "comparative"
                              ? isDark
                                ? "bg-purple-950/40 text-purple-400 border border-purple-500/10"
                                : "bg-purple-50 text-purple-700 border border-purple-200"
                              : isDark
                              ? "bg-blue-950/40 text-blue-400 border border-blue-500/10"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}>
                            {book.categoryLabel}
                          </span>
                          {book.free && (
                            <span className="px-2 py-1 text-[10px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center gap-1">
                              <Sparkle size={10} weight="fill" />
                              {isRTL ? "متاح" : "FREE"}
                            </span>
                          )}
                        </div>
                        <h3 className={`text-base font-black mb-1 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition-colors leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                          {book.title}
                        </h3>
                        <p className="text-[11px] text-amber-600 dark:text-[#C8A762] font-semibold mb-2">{book.author}</p>
                        <p className={`text-xs line-clamp-2 leading-relaxed ${muted}`}>{book.desc}</p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-8 md:shrink-0">
                        <div className={`grid grid-cols-2 gap-4 p-4 rounded-xl border min-w-[220px] ${isDark ? "border-[#2d3748] bg-white/5" : "border-gray-100 bg-gray-50/50"}`}>
                          <div className="flex flex-col">
                            <span className={`text-[9px] uppercase tracking-wider ${muted}`}>{isRTL ? "المجلدات" : "Volumes"}</span>
                            <span className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{book.volCount}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className={`text-[9px] uppercase tracking-wider ${muted}`}>{isRTL ? "نوع المرجع" : "Type"}</span>
                            <span className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                              {book.type === "sharia" ? (isRTL ? "شرعي" : "Sharia") : book.type === "comparative" ? (isRTL ? "مقارن" : "Comparative") : (isRTL ? "وضعي" : "Positive")}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col justify-center gap-2 sm:min-w-[130px]">
                          <span className={`text-xs flex items-center gap-1 font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                            {isRTL ? "تصفح المرجع" : "Browse Reference"}
                            <ArrowRight size={14} className={isRTL ? "rotate-180 transition-transform group-hover:-translate-x-1" : "transition-transform group-hover:translate-x-1"} />
                          </span>
                          <span className={`text-[10px] ${muted}`}>{book.lastUpdated}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </Link>
              </motion.div>
            ))}
          </div>
          {filteredFeqhBooks.length > 3 && (
            <button
              onClick={() => setActiveType("feqh")}
              className={`text-sm font-bold flex items-center gap-1.5 mb-8 ${isDark ? "text-[#C8A762] hover:text-[#C8A762]/80" : "text-[#0B3D2E] hover:text-[#0a3328]"} transition-colors`}
            >
              {isRTL ? `عرض كل ${filteredFeqhBooks.length} كتب ومراجع` : `View all ${filteredFeqhBooks.length} books`}
              <ArrowRight size={14} className={isRTL ? "rotate-180" : ""} />
            </button>
          )}
        </div>
      )}

      {/* orders list in 'all' view */}
      {activeType === "all" && filteredOrders.length > 0 && (
        <div className="mb-8">
          <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
            <Scroll size={13} />
            {isRTL ? "أحدث الأوامر والتعاميم" : "Latest Orders & Circulars"}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
              {filteredOrders.length}
            </span>
          </p>
          <div className={layoutMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" : "space-y-3"}>
            <AnimatePresence mode="popLayout">
              {filteredOrders.slice(0, 3).map((o, idx) =>
                layoutMode === "grid" ? (
                  <OrderCard
                    key={o.id}
                    o={o}
                    isDark={isDark}
                    idx={idx}
                    isRTL={isRTL}
                    onClick={() => router.push(`/laws/orders/${o.id}`)}
                    onHashtagClick={(tag) => setSelectedHashtag(tag)}
                  />
                ) : (
                  <OrderRow
                    key={o.id}
                    o={o}
                    isDark={isDark}
                    idx={idx}
                    isRTL={isRTL}
                    onClick={() => router.push(`/laws/orders/${o.id}`)}
                    onHashtagClick={(tag) => setSelectedHashtag(tag)}
                  />
                )
              )}
            </AnimatePresence>
          </div>
          {filteredOrders.length > 3 && (
            <button
              onClick={() => setActiveType("orders")}
              className={`text-sm font-bold flex items-center gap-1.5 mt-4 ${isDark ? "text-gray-300 hover:text-white" : "text-gray-600 hover:text-gray-900"} transition-colors`}
            >
              {isRTL ? `عرض كل ${filteredOrders.length} أوامر وتعاميم` : `View all ${filteredOrders.length} orders`}
              <ArrowRight size={14} className={isRTL ? "rotate-180" : ""} />
            </button>
          )}
        </div>
      )}

      {/* Empty states */}
      {!hasResults(activeType) && (
        <EmptyState
          type={catHasContent(activeCat) ? "no-results" : "coming-soon"}
          catId={activeCat}
          isDark={isDark}
          isRTL={isRTL}
          hasSearch={!!q}
        />
      )}
    </motion.div>
  );
}
