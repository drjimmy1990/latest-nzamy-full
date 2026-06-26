"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { type DemoOrder } from "../demo-data";
import { OrderCard, OrderRow, EmptyState } from "./ListItems";

interface OrdersTabContentProps {
  isDark: boolean;
  isRTL: boolean;
  muted: string;
  orderIssuer: string;
  setOrderIssuer: (id: string) => void;
  filteredOrders: DemoOrder[];
  ORDER_ISSUERS: { id: string; ar: string; en: string }[];
  layoutMode: "grid" | "list";
  activeCat: string;
  catHasContent: (catId: string) => boolean;
  q: string;
  setSelectedHashtag: (tag: string | null) => void;
}

export function OrdersTabContent({
  isDark,
  isRTL,
  muted,
  orderIssuer,
  setOrderIssuer,
  filteredOrders,
  ORDER_ISSUERS,
  layoutMode,
  activeCat,
  catHasContent,
  q,
  setSelectedHashtag,
}: OrdersTabContentProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const itemsPerPage = 9;

  // Reset page when search query or issuer filter changes
  const prevFilterState = `${orderIssuer}-${q}`;
  const [lastFilterState, setLastFilterState] = useState(prevFilterState);
  if (lastFilterState !== prevFilterState) {
    setPage(1);
    setLastFilterState(prevFilterState);
  }

  const totalItems = filteredOrders.length;
  const maxPages = Math.ceil(totalItems / itemsPerPage);
  const displayedOrders = filteredOrders.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    for (let i = 1; i <= maxPages; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <motion.div
      key="orders-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
    >
      {/* Authority/Issuer filter row */}
      <div className="mb-6">
        <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${muted}`}>
          {isRTL ? "جهة الإصدار" : "Issuing Authority"}
        </p>
        <div className="flex flex-wrap gap-2">
          {ORDER_ISSUERS.map((issuer) => (
            <button
              key={issuer.id}
              onClick={() => setOrderIssuer(issuer.id)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all duration-300 ${
                orderIssuer === issuer.id
                  ? "bg-[#C8A762] text-[#0B3D2E] shadow-sm scale-105"
                  : isDark
                  ? "bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:bg-white/10"
                  : "bg-white text-slate-500 border border-slate-200/50 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              {isRTL ? issuer.ar : issuer.en}
            </button>
          ))}
        </div>
      </div>

      {displayedOrders.length > 0 ? (
        <div className={layoutMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" : "space-y-3"}>
          <AnimatePresence mode="popLayout">
            {displayedOrders.map((o, idx) =>
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
      ) : (
        <EmptyState
          type={catHasContent(activeCat) ? "no-results" : "coming-soon"}
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
