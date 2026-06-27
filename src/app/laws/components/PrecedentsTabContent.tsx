"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSubscription } from "@/hooks/useSubscription";
import { useRouter } from "next/navigation";
import { Gavel, Scales, Lock, Sparkle, ArrowRight, CaretLeft, CaretRight } from "@phosphor-icons/react";
import {
  type DemoPrinciple,
  type DemoPrecedent,
  PRINCIPLE_SOURCES,
} from "../demo-data";
import {
  PREC_MODES,
  PRINCIPLE_SOURCE_LABELS_EN,
} from "@/constants/lawsLibraryData";
import {
  PrincipleCard,
  PrincipleRow,
  PrecedentCard,
  PrecedentRow,
  EmptyState,
} from "./ListItems";

interface PrecedentsTabContentProps {
  isDark: boolean;
  isRTL: boolean;
  muted: string;
  precMode: string;
  setPrecMode: (mode: string) => void;
  precTrack: "all" | "ordinary" | "admin" | "semi";
  setPrecTrack: (track: "all" | "ordinary" | "admin" | "semi") => void;
  precSource: string;
  setPrecSource: (source: string) => void;
  filteredCollections: any[];
  filteredPrinciples: DemoPrinciple[];
  filteredPrecedents: DemoPrecedent[];
  layoutMode: "grid" | "list";
  isLoggedIn: boolean;
  setShowPaywall: (show: boolean) => void;
  activeCat: string;
  q: string;
  setSelectedHashtag: (tag: string | null) => void;
  precPage: number;
  setPrecPage: (page: number) => void;
  precSort: "relevance" | "year-desc" | "year-asc" | "date-desc";
  setPrecSort: (sort: "relevance" | "year-desc" | "year-asc" | "date-desc") => void;
}

export function PrecedentsTabContent({
  isDark,
  isRTL,
  muted,
  precMode,
  setPrecMode,
  precTrack,
  setPrecTrack,
  precSource,
  setPrecSource,
  filteredCollections,
  filteredPrinciples,
  filteredPrecedents,
  layoutMode,
  isLoggedIn,
  setShowPaywall,
  activeCat,
  q,
  setSelectedHashtag,
  precPage,
  setPrecPage,
  precSort,
  setPrecSort,
}: PrecedentsTabContentProps) {
  const router = useRouter();
  const { can } = useSubscription();
  const hasLibraryAccess = can("library-full-access");

  // Digit normalizer and Hijri year parser
  function parseYear(yearStr: string): number {
    const clean = yearStr.replace(/هـ/g, '').replace(/[\u0660-\u0669]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
    const val = parseInt(clean);
    return isNaN(val) ? 0 : val;
  }

  // Precedent relevance score matching mockup
  function getPrecedentScore(id: string): number {
    if (id === "prec-moj-01") return 96;
    if (id === "prec-01") return 94;
    if (id === "prec-02") return 91;
    if (id === "prec-03") return 89;
    if (id === "prec-04") return 87;
    if (id === "prec-05") return 85;
    if (id === "prec-06") return 82;
    return 80;
  }

  // ─── Sorting logic ───
  const sortedPrecedents = [...filteredPrecedents].sort((a, b) => {
    if (precSort === "year-desc") return parseYear(b.year) - parseYear(a.year);
    if (precSort === "year-asc") return parseYear(a.year) - parseYear(b.year);
    if (precSort === "relevance") return getPrecedentScore(b.id) - getPrecedentScore(a.id);
    return 0;
  });

  const sortedPrinciples = [...filteredPrinciples].sort((a, b) => {
    if (precSort === "year-desc") return parseYear(b.year) - parseYear(a.year);
    if (precSort === "year-asc") return parseYear(a.year) - parseYear(b.year);
    return 0;
  });

  // ─── Pagination parameters ───
  const itemsPerPage = 3;
  const totalPrecedents = sortedPrecedents.length;
  const totalPrinciples = sortedPrinciples.length;

  const totalPrecedentsPages = Math.ceil(totalPrecedents / itemsPerPage);
  const totalPrinciplesPages = Math.ceil(totalPrinciples / itemsPerPage);

  let maxPages = 1;
  if (precMode === "principles") {
    maxPages = Math.max(1, totalPrinciplesPages);
  } else if (precMode === "precedents") {
    maxPages = Math.max(1, totalPrecedentsPages);
  } else {
    maxPages = Math.max(1, Math.max(totalPrinciplesPages, totalPrecedentsPages));
  }

  // Sliced lists for current page view
  const paginatedPrecedents = sortedPrecedents.slice((precPage - 1) * itemsPerPage, precPage * itemsPerPage);
  const paginatedPrinciples = sortedPrinciples.slice((precPage - 1) * itemsPerPage, precPage * itemsPerPage);

  const sortOptions = [
    { id: "relevance", labelAr: "مدى المطابقة (الافتراضي)", labelEn: "Relevance" },
    { id: "year-desc", labelAr: "الأحدث حكماً", labelEn: "Newest" },
    { id: "year-asc", labelAr: "الأقدم حكماً", labelEn: "Oldest" }
  ];

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (maxPages <= 7) {
      for (let i = 1; i <= maxPages; i++) {
        pages.push(i);
      }
    } else {
      if (precPage <= 4) {
        pages.push(1, 2, 3, 4, 5, "...", maxPages);
      } else if (precPage >= maxPages - 3) {
        pages.push(1, "...", maxPages - 4, maxPages - 3, maxPages - 2, maxPages - 1, maxPages);
      } else {
        pages.push(1, "...", precPage - 1, precPage, precPage + 1, "...", maxPages);
      }
    }
    return pages;
  };

  return (
    <motion.div
      key="precedents-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
    >
      {/* Dual filter bar */}
      <div className="mb-6 space-y-3">
        {/* Mode toggle: الكل | مبادئ | سوابق */}
        <div className={`inline-flex p-1 rounded-xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
          {PREC_MODES.map((m) => {
            const MIcon = m.icon;
            const isActive = precMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setPrecMode(m.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  isActive
                    ? isDark
                      ? "bg-[#0B3D2E] text-[#C8A762]"
                      : "bg-[#0B3D2E] text-white shadow-sm"
                    : isDark
                    ? "text-gray-400 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <MIcon size={14} weight={isActive ? "fill" : "duotone"} />
                {isRTL ? m.label : m.labelEn}
              </button>
            );
          })}
        </div>



        {/* Source filter — Clean Hierarchical Layout */}
        <div className="space-y-3 pt-2">
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${muted}`}>
              {isRTL ? "جهة الإصدار (المسار القضائي)" : "Issuing Authority (Judicial Track)"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "all", label: "الكل", labelEn: "All Tracks" },
                { id: "ordinary", label: "القضاء العادي", labelEn: "Ordinary Judiciary" },
                { id: "admin", label: "ديوان المظالم (إداري)", labelEn: "Administrative (BOG)" },
                { id: "semi", label: "لجان شبه قضائية", labelEn: "Semi-Judicial Committees" },
              ].map((t) => {
                const isAct = precTrack === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setPrecTrack(t.id as any);
                      setPrecSource("all");
                    }}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all duration-200 ${
                      isAct
                        ? isDark
                          ? "border-[#C8A762] bg-[#C8A762]/10 text-[#C8A762]"
                          : "border-[#0B3D2E] bg-[#0B3D2E]/10 text-[#0B3D2E]"
                        : isDark
                        ? "border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
                        : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-800"
                    }`}
                  >
                    {isRTL ? t.label : t.labelEn}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Secondary Level: Sub-bodies row (shown only when a track other than "all" is selected) */}
          {precTrack !== "all" && (() => {
            const groupMap: Record<string, string> = {
              ordinary: "القضاء العادي",
              admin: "ديوان المظالم",
              semi: "شبه قضائية",
            };
            const activeGroup = groupMap[precTrack];
            const groupSources = PRINCIPLE_SOURCES.filter((s) => s.group === activeGroup);

            return (
              <div className="p-3.5 rounded-2xl border bg-slate-500/5 dark:bg-white/5 border-dashed border-slate-200 dark:border-white/[0.06] animate-fadeIn">
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${muted}`}>
                  {isRTL ? "الجهة القضائية التفصيلية" : "Detailed Judicial Body"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setPrecSource("all")}
                    className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all duration-200 ${
                      precSource === "all"
                        ? "bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-sm"
                        : isDark
                        ? "border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
                        : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-800"
                    }`}
                  >
                    {isRTL ? "الكل" : "All"}
                  </button>
                  {groupSources.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setPrecSource(s.id)}
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all duration-200 ${
                        precSource === s.id
                          ? "bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-sm"
                          : isDark
                          ? "border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
                          : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-800"
                      }`}
                    >
                      {isRTL ? s.label : PRINCIPLE_SOURCE_LABELS_EN[s.id]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Sorting & Results Stats Bar */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 p-4 rounded-2xl border ${
        isDark ? "bg-[#161b22]/50 border-[#2d3748]/50" : "bg-gray-50/50 border-gray-200/60"
      }`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            {isRTL ? "ترتيب النتائج:" : "Sort results by:"}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {sortOptions.map((opt) => {
              const isSelected = precSort === opt.id;
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

        <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
          {(() => {
            const total = precMode === "principles" ? totalPrinciples : precMode === "precedents" ? totalPrecedents : (totalPrinciples + totalPrecedents);
            if (total === 0) return null;
            const from = (precPage - 1) * itemsPerPage + 1;
            const to = Math.min(precPage * itemsPerPage, total);
            return isRTL ? (
              <span>
                عرض النتائج <strong className="text-[#C8A762]">{from}-{to}</strong> من أصل <strong className="text-[#C8A762]">{total}</strong>
              </span>
            ) : (
              <span>
                Showing <strong className="text-[#0B3D2E] dark:text-[#C8A762]">{from}-{to}</strong> of <strong className="text-[#0B3D2E] dark:text-[#C8A762]">{total}</strong> results
              </span>
            );
          })()}
        </div>
      </div>

      {/* Judicial Collections Grid */}
      {precMode !== "precedents" && filteredCollections.length > 0 && (
        <div className="mb-8">
          <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
            <Gavel size={13} />
            {isRTL ? "مجموعات ومدونات المبادئ القضائية" : "Judicial Collections & Digests"}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>
              {filteredCollections.length}
            </span>
          </p>
          <div className={layoutMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" : "flex flex-col gap-4"}>
            {filteredCollections.map((col, idx) => {
              const isColFree = col.free || hasLibraryAccess;
              return (
                <motion.div
                  key={col.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`group relative rounded-2xl border p-5 transition-all ${
                    isColFree
                      ? `hover:border-[#0B3D2E]/40 cursor-pointer ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`
                      : `${isDark ? "bg-[#161b22]/60 border-[#2d3748]/60" : "bg-gray-50 border-gray-200/80"}`
                  } ${layoutMode === "grid" ? "min-h-[340px] h-full flex flex-col" : ""}`}
                >
                  {!isColFree && (
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
                    href={isColFree ? `/precedents/${col.slug}` : "#"}
                    onClick={(e) => {
                      if (!isColFree) {
                        e.preventDefault();
                        setShowPaywall(true);
                      }
                    }}
                    className={layoutMode === "grid" ? "flex flex-col flex-1 justify-between" : "flex flex-col md:flex-row md:items-center justify-between w-full gap-5"}
                  >
                    {layoutMode === "grid" ? (
                      <>
                        <div className={!isColFree ? "opacity-40 filter blur-[2px]" : ""}>
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
                            {isColFree && (
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
                          <p className={`text-xs mb-5 line-clamp-3 leading-relaxed ${muted}`}>{col.desc}</p>
                        </div>

                        <div className={!isColFree ? "opacity-40 filter blur-[2px]" : ""}>
                           <div className={`grid grid-cols-2 gap-4 mb-4 p-4 rounded-xl border ${isDark ? "border-[#2d3748] bg-white/5" : "border-gray-100 bg-gray-50/50"}`}>
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

                          {isLoggedIn && col.progress > 0 && (
                            <div className="mb-4">
                              <div className="flex justify-between items-center mb-1 text-[10px]">
                                <span className={muted}>{isRTL ? "نسبة التصفح" : "Progress"}</span>
                                <span className={`font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{col.progress}%</span>
                              </div>
                              <div className="h-1 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500" style={{ width: `${col.progress}%` }} />
                              </div>
                            </div>
                          )}

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
                        <div className={`flex-1 ${!isColFree ? "opacity-40 filter blur-[2px]" : ""}`}>
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
                            {isColFree && (
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

                        <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-8 md:shrink-0 ${!isColFree ? "opacity-40 filter blur-[2px]" : ""}`}>
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
              );
            })}
          </div>
        </div>
      )}

      {/* Principles list */}
      {(precMode === "all" || precMode === "principles") && filteredPrinciples.length > 0 && (
        <div className="mb-6">
          <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
            <Scales size={13} />
            {isRTL ? "المبادئ القضائية" : "Judicial Principles"}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>
              {filteredPrinciples.length}
            </span>
          </p>
          <div className={layoutMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" : "space-y-3"}>
            <AnimatePresence mode="popLayout">
              {paginatedPrinciples.map((p, idx) =>
                layoutMode === "grid" ? (
                  <PrincipleCard key={p.id} p={p} isDark={isDark} idx={idx} isRTL={isRTL} q={q} />
                ) : (
                  <PrincipleRow key={p.id} p={p} isDark={isDark} idx={idx} isRTL={isRTL} q={q} />
                )
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Precedents list */}
      {(precMode === "all" || precMode === "precedents") && filteredPrecedents.length > 0 && (
        <div className="mb-6">
          <p className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${muted}`}>
            <Gavel size={13} />
            {isRTL ? "السوابق القضائية" : "Judicial Precedents"}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isDark ? "bg-purple-900/20 text-purple-400" : "bg-purple-50 text-purple-700"}`}>
              {filteredPrecedents.length}
            </span>
          </p>
          <div className={layoutMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" : "space-y-3"}>
            <AnimatePresence mode="popLayout">
              {paginatedPrecedents.map((pr, idx) =>
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
        </div>
      )}

      {/* Empty state */}
      {filteredPrinciples.length === 0 && filteredPrecedents.length === 0 && (
        <EmptyState
          type="no-results"
          catId={activeCat}
          isDark={isDark}
          isRTL={isRTL}
          hasSearch={!!q}
        />
      )}

      {/* Pagination controls */}
      {maxPages >= 1 && (
        <div className={`flex items-center justify-center gap-2 mt-8 pt-6 border-t ${
          isDark ? "border-[#2d3748]/50" : "border-gray-100"
        }`} dir={isRTL ? "rtl" : "ltr"}>
          {/* Previous Button */}
          <button
            onClick={() => setPrecPage(Math.max(1, precPage - 1))}
            disabled={precPage === 1}
            className={`p-2 rounded-xl border transition-all ${
              precPage === 1
                ? "opacity-40 cursor-not-allowed border-transparent text-gray-500"
                : isDark
                ? "border-white/10 text-gray-300 hover:bg-white/5 hover:text-white"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title={isRTL ? "الصفحة السابقة" : "Previous Page"}
          >
            {isRTL ? <CaretRight size={16} weight="bold" /> : <CaretLeft size={16} weight="bold" />}
          </button>

          {/* Page numbers */}
          {getPageNumbers().map((page, i) => {
            if (page === "...") {
              return (
                <span
                  key={`ellipsis-${i}`}
                  className={`w-9 h-9 flex items-center justify-center text-xs font-bold ${
                    isDark ? "text-gray-500" : "text-gray-400"
                  }`}
                >
                  ...
                </span>
              );
            }
            const pageNum = page as number;
            const isCurrent = precPage === pageNum;
            return (
              <button
                key={pageNum}
                onClick={() => setPrecPage(pageNum)}
                className={`w-9 h-9 rounded-xl border text-xs font-bold transition-all ${
                  isCurrent
                    ? isDark
                      ? "bg-[#C8A762]/10 border-[#C8A762] text-[#C8A762] scale-105"
                      : "bg-[#0B3D2E] border-[#0B3D2E] text-white shadow-sm scale-105"
                    : isDark
                    ? "border-white/10 text-gray-400 hover:border-white/20 hover:text-white hover:bg-white/5"
                    : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800"
                }`}
              >
                {isRTL ? pageNum.toLocaleString('ar-EG') : pageNum}
              </button>
            );
          })}

          {/* Next Button */}
          <button
            onClick={() => setPrecPage(Math.min(maxPages, precPage + 1))}
            disabled={precPage === maxPages}
            className={`p-2 rounded-xl border transition-all ${
              precPage === maxPages
                ? "opacity-40 cursor-not-allowed border-transparent text-gray-500"
                : isDark
                ? "border-white/10 text-gray-300 hover:bg-white/5 hover:text-white"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title={isRTL ? "الصفحة التالية" : "Next Page"}
          >
            {isRTL ? <CaretLeft size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
          </button>
        </div>
      )}
    </motion.div>
  );
}
