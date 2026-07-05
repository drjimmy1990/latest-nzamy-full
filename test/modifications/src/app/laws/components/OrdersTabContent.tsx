"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
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
  precSort: "relevance" | "year-desc" | "year-asc" | "date-desc";
  setPrecSort: (sort: "relevance" | "year-desc" | "year-asc" | "date-desc") => void;
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
  precSort,
  setPrecSort,
}: OrdersTabContentProps) {
  const router = useRouter();

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
        <div className="flex flex-wrap gap-1.5">
          {ORDER_ISSUERS.map((issuer) => (
            <button
              key={issuer.id}
              onClick={() => setOrderIssuer(issuer.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
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
              { id: "year-desc", labelAr: "الأحدث إصداراً", labelEn: "Newest" },
              { id: "year-asc", labelAr: "الأقدم إصداراً", labelEn: "Oldest" }
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

      {filteredOrders.length > 0 ? (
        <div className={layoutMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" : "space-y-3"}>
          <AnimatePresence mode="popLayout">
            {filteredOrders.map((o, idx) =>
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
    </motion.div>
  );
}
