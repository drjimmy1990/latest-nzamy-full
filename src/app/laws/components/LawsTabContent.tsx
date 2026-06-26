"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Lock,
  Sparkle,
  ArrowRight,
  Gavel,
  Scales,
  Scroll,
} from "@phosphor-icons/react";
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
}: LawsTabContentProps) {
  const router = useRouter();

  return (
    <motion.div
      key="laws-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
    >
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
              {filteredLaws.map((sys, idx) => (
                <motion.div
                  key={sys.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`group relative rounded-2xl border p-5 transition-all ${
                    sys.free
                      ? `hover:border-[#0B3D2E]/40 cursor-pointer ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`
                      : `${isDark ? "bg-[#161b22]/60 border-[#2d3748]/60" : "bg-gray-50 border-gray-200/80"}`
                  }`}
                >
                  {!sys.free && (
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
                    href={sys.free ? `/laws/${sys.slug}` : "#"}
                    onClick={(e) => {
                      if (!sys.free) {
                        e.preventDefault();
                        setShowPaywall(true);
                      }
                    }}
                  >
                    {layoutMode === "grid" ? (
                      <div className={!sys.free ? "opacity-40 filter blur-[2px]" : ""}>
                        <div className="flex items-center justify-between mb-4">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                            {isRTL ? "مُحدث" : "Updated"}
                          </span>
                          {sys.free && (
                            <span className="px-2 py-1 text-[10px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center gap-1">
                              <Sparkle size={10} weight="fill" />
                              {isRTL ? "متاح" : "FREE"}
                            </span>
                          )}
                        </div>
                        <h3 className={`text-lg font-black mb-1.5 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition-colors ${isDark ? "text-white" : "text-gray-900"}`}>
                          {isRTL ? sys.title : sys.titleEn}
                        </h3>
                        <p className={`text-xs mb-5 line-clamp-2 leading-relaxed ${muted}`}>{isRTL ? sys.desc : sys.descEn}</p>
                        <div className={`grid grid-cols-2 gap-4 mb-5 p-4 rounded-xl border ${isDark ? "border-[#2d3748] bg-white/5" : "border-gray-100 bg-gray-50/50"}`}>
                          <div className="flex flex-col">
                            <span className={`text-[10px] uppercase tracking-wider ${muted}`}>{isRTL ? "المواد" : "Articles"}</span>
                            <span className={`text-base font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{sys.articlesCount}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className={`text-[10px] uppercase tracking-wider ${muted}`}>{isRTL ? "الأبواب" : "Chapters"}</span>
                            <span className={`text-base font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{sys.chaptersCount}</span>
                          </div>
                        </div>
                        {isLoggedIn && sys.free && (
                          <div className="mb-4">
                            <div className="flex justify-between items-center mb-1.5 text-xs">
                              <span className={muted}>{isRTL ? "نسبة القراءة" : "Progress"}</span>
                              <span className={`font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{sys.progress}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-[#0B3D2E] dark:bg-[#C8A762]" style={{ width: `${sys.progress}%` }} />
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-auto">
                          <span className={`text-xs flex items-center gap-1 font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                            {isRTL ? "تصفح النظام" : "Browse System"}
                            <ArrowRight size={14} className={isRTL ? "rotate-180 transition-transform group-hover:-translate-x-1" : "transition-transform group-hover:translate-x-1"} />
                          </span>
                          <span className={`text-[10px] ${muted}`}>{sys.lastUpdated}</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`${!sys.free ? "opacity-40 filter blur-[2px]" : ""} flex flex-col md:flex-row md:items-center justify-between gap-5`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                              {isRTL ? "مُحدث" : "Updated"}
                            </span>
                            {sys.free && (
                              <span className="px-2 py-1 text-[10px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg flex items-center gap-1">
                                <Sparkle size={10} weight="fill" />
                                {isRTL ? "متاح" : "FREE"}
                              </span>
                            )}
                          </div>
                          <h3 className={`text-lg font-black mb-1.5 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition-colors ${isDark ? "text-white" : "text-gray-900"}`}>
                            {isRTL ? sys.title : sys.titleEn}
                          </h3>
                          <p className={`text-xs line-clamp-2 leading-relaxed ${muted}`}>{isRTL ? sys.desc : sys.descEn}</p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-8 md:shrink-0">
                          <div className={`grid grid-cols-2 gap-4 p-4 rounded-xl border min-w-[220px] ${isDark ? "border-[#2d3748] bg-white/5" : "border-gray-100 bg-gray-50/50"}`}>
                            <div className="flex flex-col">
                              <span className={`text-[10px] uppercase tracking-wider ${muted}`}>{isRTL ? "المواد" : "Articles"}</span>
                              <span className={`text-base font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{sys.articlesCount}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className={`text-[10px] uppercase tracking-wider ${muted}`}>{isRTL ? "الأبواب" : "Chapters"}</span>
                              <span className={`text-base font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{sys.chaptersCount}</span>
                            </div>
                          </div>
                          <div className="flex flex-col justify-center gap-2 sm:min-w-[130px]">
                            <span className={`text-xs flex items-center gap-1 font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                              {isRTL ? "تصفح النظام" : "Browse System"}
                              <ArrowRight size={14} className={isRTL ? "rotate-180 transition-transform group-hover:-translate-x-1" : "transition-transform group-hover:translate-x-1"} />
                            </span>
                            <span className={`text-[10px] ${muted}`}>{sys.lastUpdated}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </Link>
                </motion.div>
              ))}
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
