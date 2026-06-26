"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Lock, Sparkle, ArrowRight, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { type FeqhBookDemo } from "../demo-data";
import { FEQH_TYPES, type FeqhType } from "@/constants/lawsLibraryData";
import { EmptyState } from "./ListItems";

interface FeqhTabContentProps {
  isDark: boolean;
  isRTL: boolean;
  muted: string;
  feqhType: FeqhType;
  setFeqhType: (type: FeqhType) => void;
  feqhSubCat: string;
  setFeqhSubCat: (subCat: string) => void;
  filteredFeqhBooks: FeqhBookDemo[];
  layoutMode: "grid" | "list";
  isLoggedIn: boolean;
  setShowPaywall: (show: boolean) => void;
  activeCat: string;
  q: string;
}

export function FeqhTabContent({
  isDark,
  isRTL,
  muted,
  feqhType,
  setFeqhType,
  feqhSubCat,
  setFeqhSubCat,
  filteredFeqhBooks,
  layoutMode,
  isLoggedIn,
  setShowPaywall,
  activeCat,
  q,
}: FeqhTabContentProps) {
  const [page, setPage] = useState(1);
  const itemsPerPage = 6;

  // Reset page when filter states change
  const prevFilterState = `${feqhType}-${feqhSubCat}-${q}`;
  const [lastFilterState, setLastFilterState] = useState(prevFilterState);
  if (lastFilterState !== prevFilterState) {
    setPage(1);
    setLastFilterState(prevFilterState);
  }

  const totalItems = filteredFeqhBooks.length;
  const maxPages = Math.ceil(totalItems / itemsPerPage);
  const displayedBooks = filteredFeqhBooks.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    for (let i = 1; i <= maxPages; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <motion.div
      key="feqh-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
    >
      {/* Feqh sub-category filters */}
      <div className="mb-6 space-y-3">
        {/* Feqh Type Toggle: الكل | شرعي (فقه إسلامي) | قانوني وضعي */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className={`inline-flex p-1 rounded-xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
            {FEQH_TYPES.map((ft) => {
              const isAct = feqhType === ft.id;
              return (
                <button
                  key={ft.id}
                  onClick={() => {
                    setFeqhType(ft.id);
                    setFeqhSubCat("all");
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    isAct
                      ? isDark
                        ? "bg-white/10 text-white"
                        : "bg-[#0B3D2E] text-white"
                      : isDark
                      ? "text-gray-400 hover:text-white hover:bg-white/5"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  {isRTL ? ft.label : ft.labelEn}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-categories depending on selection */}
        {feqhType === "sharia" && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className={`text-[10px] font-black uppercase tracking-wider ${isRTL ? "ml-2" : "mr-2"} ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              {isRTL ? "التصنيف الشرعي:" : "Sharia Category:"}
            </span>
            {[
              { id: "all", label: "الكل" },
              { id: "mutun", label: "متون فقهية" },
              { id: "sharuh", label: "شروح وحواشي" },
              { id: "encyclopedia", label: "موسوعات وخلاف" },
            ].map((sc) => (
              <button
                key={sc.id}
                onClick={() => setFeqhSubCat(sc.id)}
                className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all duration-200 ${
                  feqhSubCat === sc.id
                    ? isDark
                      ? "border-[#C8A762]/50 bg-[#C8A762]/10 text-[#C8A762]"
                      : "border-amber-400 bg-amber-50 text-amber-800"
                    : isDark
                    ? "border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
                    : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-800"
                }`}
              >
                {sc.label}
              </button>
            ))}
          </div>
        )}

        {feqhType === "wadi" && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className={`text-[10px] font-black uppercase tracking-wider ${isRTL ? "ml-2" : "mr-2"} ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              {isRTL ? "التصنيف القانوني:" : "Legal Category:"}
            </span>
            {[
              { id: "all", label: "الكل" },
              { id: "criminal", label: "جنائي" },
              { id: "civil", label: "مدني" },
              { id: "admin", label: "إداري" },
              { id: "corporate", label: "تجاري وشركات" },
            ].map((sc) => (
              <button
                key={sc.id}
                onClick={() => setFeqhSubCat(sc.id)}
                className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all duration-200 ${
                  feqhSubCat === sc.id
                    ? isDark
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                      : "border-blue-200 bg-blue-50 text-blue-800"
                    : isDark
                    ? "border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
                    : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-800"
                }`}
              >
                {sc.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {displayedBooks.length > 0 ? (
        <div className={layoutMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" : "space-y-4"}>
          {displayedBooks.map((book) => (
            <motion.div
              key={book.id}
              layout
              className={`group relative rounded-2xl border p-5 transition-all duration-300 hover:shadow-lg ${
                isDark
                  ? "bg-[#0c0f12] border-white/5 hover:border-white/10"
                  : "bg-white border-slate-200/60 hover:border-slate-300"
              }`}
            >
              {/* Paywall Overlay */}
              {!book.free && (
                <div className="absolute inset-0 z-10 rounded-2xl bg-black/40 backdrop-blur-[1.5px] flex flex-col items-center justify-center p-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-2">
                    <Lock size={20} className="text-amber-500" weight="fill" />
                  </div>
                  <p className="text-white text-xs font-bold mb-3">{isRTL ? "يتطلب اشتراك الباقة الكاملة" : "Full Plan Required"}</p>
                  <button
                    onClick={() => setShowPaywall(true)}
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-[#0B3D2E] text-[10.5px] font-black rounded-lg transition"
                  >
                    {isRTL ? "ترقية الاشتراك" : "Upgrade Plan"}
                  </button>
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
                className="block"
              >
                {layoutMode === "grid" ? (
                  <div className={!book.free ? "opacity-40 filter blur-[2px]" : ""}>
                    <div className="flex justify-between items-start gap-4 mb-4">
                      <div className="flex-1">
                        <span className={`inline-block px-2.5 py-0.5 text-[9px] font-bold rounded-md mb-2 ${
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
                        <h3 className={`text-[13.5px] font-black group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition-colors leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                          {book.title}
                        </h3>
                        <p className="text-[10px] text-amber-600 dark:text-[#C8A762] font-semibold mt-1">{book.author}</p>
                      </div>
                      {book.free && (
                        <span className="px-2 py-0.5 text-[9px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md flex items-center gap-1">
                          <Sparkle size={9} weight="fill" />
                          {isRTL ? "متاح" : "FREE"}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs line-clamp-3 leading-relaxed mb-5 ${muted}`}>{book.desc}</p>
                    <div className="pt-4 border-t border-dashed dark:border-white/5 border-slate-100 flex flex-col gap-3">
                      <div className="flex justify-between text-[11px]">
                        <span className={muted}>{isRTL ? "المجلدات / الصفحات" : "Volumes / Pages"}</span>
                        <span className={`font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{book.volCount}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className={muted}>{isRTL ? "نوع المرجع" : "Type"}</span>
                        <span className={`font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                          {book.type === "sharia"
                            ? (isRTL ? "شرعي إسلامي" : "Islamic Law")
                            : book.type === "comparative"
                            ? (isRTL ? "مقارن" : "Comparative")
                            : (isRTL ? "قانوني وضعي" : "Positive Law")}
                        </span>
                      </div>
                    </div>

                    {/* Progress bar for logged-in users and free/started books */}
                    {isLoggedIn && book.progress > 0 && (
                      <div className="mb-4">
                        <div className="flex justify-between items-center mb-1 text-[10px]">
                          <span className={muted}>{isRTL ? "نسبة التحصيل" : "Progress"}</span>
                          <span className={`font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{book.progress}%</span>
                        </div>
                        <div className="h-1 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500" style={{ width: `${book.progress}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className={`text-xs flex items-center gap-1 font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                        {isRTL ? "قراءة وتصفح المرجع" : "Read Reference"}
                        <ArrowRight size={14} className={isRTL ? "rotate-180 transition-transform group-hover:-translate-x-1" : "transition-transform group-hover:translate-x-1"} />
                      </span>
                      <span className={`text-[10px] ${muted}`}>{book.lastUpdated}</span>
                    </div>
                  </div>
                ) : (
                  <div className={`${!book.free ? "opacity-40 filter blur-[2px]" : ""} flex flex-col md:flex-row md:items-center justify-between gap-5`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
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
      ) : (
        <EmptyState
          type="no-results"
          catId={activeCat}
          isDark={isDark}
          isRTL={isRTL}
          hasSearch={!!q}
        />
      )}

      {/* Pagination controls */}
      {maxPages > 1 && (
        <div className={`flex items-center justify-center gap-2 mt-8 pt-6 border-t ${
          isDark ? "border-[#2d3748]/50" : "border-gray-100"
        }`} dir={isRTL ? "rtl" : "ltr"}>
          {/* Previous Page Button */}
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className={`p-2 rounded-xl border transition-all ${
              page === 1
                ? "opacity-40 cursor-not-allowed border-transparent text-gray-500"
                : isDark
                ? "border-white/10 text-gray-300 hover:bg-white/5 hover:text-white"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title={isRTL ? "الصفحة السابقة" : "Previous Page"}
          >
            {isRTL ? <CaretRight size={16} weight="bold" /> : <CaretLeft size={16} weight="bold" />}
          </button>

          {/* Page Number Buttons */}
          {getPageNumbers().map((pageNum) => (
            <button
              key={pageNum}
              onClick={() => setPage(pageNum as number)}
              className={`w-9 h-9 rounded-xl border text-xs font-bold transition-all ${
                page === pageNum
                  ? isDark
                    ? "bg-[#C8A762]/10 border-[#C8A762] text-[#C8A762] scale-105"
                    : "bg-[#0B3D2E] border-[#0B3D2E] text-white shadow-sm scale-105"
                  : isDark
                  ? "border-white/10 text-gray-400 hover:border-white/20 hover:text-white hover:bg-white/5"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800"
              }`}
            >
              {isRTL ? (pageNum as number).toLocaleString('ar-EG') : pageNum}
            </button>
          ))}

          {/* Next Page Button */}
          <button
            onClick={() => setPage(Math.min(maxPages, page + 1))}
            disabled={page === maxPages}
            className={`p-2 rounded-xl border transition-all ${
              page === maxPages
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
