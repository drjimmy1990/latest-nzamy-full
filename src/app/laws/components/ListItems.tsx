"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Scales, Gavel, Scroll, CheckCircle, Clock, BookOpen, MagnifyingGlass
} from "@phosphor-icons/react";
import * as PhosphorIcons from "@phosphor-icons/react";
import { type DemoPrinciple, type DemoPrecedent, type DemoOrder } from "../demo-data";
import { LEGAL_TAXONOMY } from "@/constants/taxonomies";

export const ORDER_TYPE_STYLES: Record<DemoOrder["type"], { label: string; class: string }> = {
  royal:    { label: "أمر ملكي",           class: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  cabinet:  { label: "قرار مجلس الوزراء", class: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  circular: { label: "تعميم",              class: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
};

const ORDER_TYPE_LABELS_EN: Record<DemoOrder["type"], string> = {
  royal: "Royal Order",
  cabinet: "Cabinet Resolution",
  circular: "Circular",
};

// ─── PrincipleRow ───────────────────────────────────────────────────────────────
export function PrincipleRow({ p, isDark, idx, isRTL = true }: { p: DemoPrinciple; isDark: boolean; idx: number; isRTL?: boolean }) {
  const [copied, setCopied] = useState(false);

  // تحديد بادئة المُعرِّف: "مبدأ رقم" أو "تقرير رقم" (للتمييز)
  const isTamyeez  = p.sourceId === "tamyeez";
  const idLabel    = isTamyeez
    ? (p.reportNum ? `${isRTL ? "تقرير رقم" : "Report No."} (${p.reportNum})` : "")
    : (p.principleNum ? `${isRTL ? "مبدأ رقم" : "Principle No."} (${p.principleNum})` : "");

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      className={`rounded-2xl border p-4 transition-all ${isDark ? "bg-[#161b22] border-[#2d3748] hover:border-[#C8A762]/30" : "bg-white border-gray-200 hover:border-amber-200"}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
          <Scales size={16} className={isDark ? "text-[#C8A762]" : "text-amber-700"} weight="duotone" />
        </div>
        <div className="flex-1 min-w-0">

          {/* ── Header row ── */}
          <div className="flex items-start justify-between gap-2 mb-1.5 flex-wrap">
            <div className="flex flex-wrap items-center gap-1.5">

              {/* اسم الجهة */}
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-800"}`}>
                {p.source}
              </span>

              {/* الاختصار الرسمي (م ق د / ك ع / إلخ) */}
              {p.srcAbbr && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border font-mono ${
                  isDark ? "border-[#C8A762]/20 text-[#C8A762]/70 bg-[#C8A762]/5" : "border-amber-200 text-amber-700 bg-amber-50"
                }`}>
                  {p.srcAbbr}
                </span>
              )}

              {/* رقم المبدأ / رقم التقرير */}
              {idLabel && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isDark ? "bg-white/5 text-gray-400" : "bg-slate-100 text-slate-600"
                }`}>
                  {idLabel}
                </span>
              )}
            </div>

            {/* زر النسخ */}
            <button
              onClick={() => { navigator.clipboard.writeText(`${p.ref}\n\n"${p.text}"`); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
              className={`p-1.5 rounded-lg transition flex-shrink-0 ${isDark ? "hover:bg-white/[0.06] text-gray-600" : "hover:bg-slate-100 text-slate-400"}`}
            >
              {copied ? <CheckCircle size={13} className="text-emerald-500" /> : <PhosphorIcons.Copy size={13} />}
            </button>
          </div>

          {/* ── نص المبدأ ── */}
          <p className={`text-[13px] leading-relaxed mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>{p.text}</p>

          {/* ── Footer: المرجع الكامل + الصفحة + السنة ── */}
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-mono ${isDark ? "text-gray-600" : "text-slate-400"}`}>
            <span>{p.ref}</span>
            {p.page && <span>{isRTL ? "ص" : "p."} {p.page}</span>}
            {p.caseNum && !isTamyeez && <span>{isRTL ? "رقم القرار" : "Decision No."}: {p.caseNum}</span>}
            {isTamyeez && p.caseNum && <span>{isRTL ? "رقم القرار" : "Decision No."}: {p.caseNum}</span>}
            <span>{p.year}{isRTL ? "هـ" : " AH"}</span>
          </div>

        </div>
      </div>
    </motion.div>
  );
}


// ─── PrecedentRow ───────────────────────────────────────────────────────────────
export function PrecedentRow({ pr, isDark, idx, isRTL = true }: { pr: DemoPrecedent; isDark: boolean; idx: number; isRTL?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      className={`rounded-2xl border p-4 transition-all ${isDark ? "bg-[#161b22] border-[#2d3748] hover:border-purple-500/30" : "bg-white border-gray-200 hover:border-purple-200"}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-purple-900/20" : "bg-purple-50"}`}>
          <Gavel size={16} className={isDark ? "text-purple-400" : "text-purple-600"} weight="duotone" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${isDark ? "bg-purple-900/20 text-purple-400" : "bg-purple-50 text-purple-800"}`}>{pr.court}</span>
              <span className={`text-[10px] ${isDark ? "text-gray-600" : "text-slate-400"}`}>{pr.caseNum} · {pr.year}</span>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(`${pr.court} - ${pr.caseNum} - ${pr.year}\n${pr.summary}`); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
              className={`p-1.5 rounded-lg transition flex-shrink-0 ${isDark ? "hover:bg-white/[0.06] text-gray-600" : "hover:bg-slate-100 text-slate-400"}`}
            >
              {copied ? <CheckCircle size={13} className="text-emerald-500" /> : <PhosphorIcons.Copy size={13} />}
            </button>
          </div>
          <p className={`text-[13px] leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{pr.summary}</p>
          <p className={`text-[10px] mt-2 font-semibold ${isDark ? "text-gray-600" : "text-slate-400"}`}>{isRTL ? "الصلة" : "Relevance"}: {pr.relevance}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── OrderRow ───────────────────────────────────────────────────────────────────
export function OrderRow({ o, isDark, idx, isRTL = true }: { o: DemoOrder; isDark: boolean; idx: number; isRTL?: boolean }) {
  const style = ORDER_TYPE_STYLES[o.type];
  const typeLabel = isRTL ? style.label : ORDER_TYPE_LABELS_EN[o.type];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      className={`rounded-2xl border p-4 transition-all ${isDark ? "bg-[#161b22] border-[#2d3748] hover:border-slate-600" : "bg-white border-gray-200 hover:border-slate-300"}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-white/5" : "bg-gray-50"}`}>
          <Scroll size={16} weight="duotone" className={isDark ? "text-gray-400" : "text-gray-500"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${style.class}`}>{typeLabel}</span>
            <span className={`text-[11px] font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{o.ref}</span>
            <span className={`text-[10px] ${isDark ? "text-gray-600" : "text-slate-400"}`}>{o.date}</span>
          </div>
          <p className={`text-[13px] font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>{o.title}</p>
          <p className={`text-[12px] leading-relaxed ${isDark ? "text-gray-400" : "text-gray-600"}`}>{o.summary}</p>
          <p className={`text-[10px] mt-2 ${isDark ? "text-gray-600" : "text-slate-400"}`}>{o.issuer}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── EmptyState ─────────────────────────────────────────────────────────────────
// Differentiates between "coming soon" (category has no content) and "no results" (search failed)
export function EmptyState({ type, catId, isDark, isRTL, hasSearch }: {
  type: "coming-soon" | "no-results";
  catId: string;
  isDark: boolean;
  isRTL: boolean;
  hasSearch: boolean;
}) {
  const catInfo = LEGAL_TAXONOMY.find(c => c.id === catId);
  const CatIcon = catInfo ? (PhosphorIcons as Record<string, unknown>)[catInfo.iconName || "BookOpen"] as typeof BookOpen : BookOpen;

  if (type === "coming-soon") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className={`col-span-full py-16 text-center rounded-3xl border border-dashed ${isDark ? "border-[#2d3748] bg-white/[0.02]" : "border-gray-200 bg-white/60"}`}
      >
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${isDark ? "bg-[#C8A762]/10" : "bg-[#0B3D2E]/5"}`}>
          <CatIcon size={28} className={isDark ? "text-[#C8A762]/70" : "text-[#0B3D2E]/50"} weight="duotone" />
        </div>
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold mb-3 ${isDark ? "bg-amber-900/20 text-amber-400 border border-amber-700/20" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
          <Clock size={12} weight="fill" />
          {isRTL ? "قيد الإعداد" : "In Progress"}
        </div>
        <p className={`text-base font-black mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
          {catInfo ? (isRTL ? catInfo.label : catInfo.labelEn) : (isRTL ? "هذا القسم" : "This section")}
        </p>
        <p className={`text-sm max-w-sm mx-auto leading-relaxed ${isDark ? "text-gray-500" : "text-gray-400"}`}>
          {isRTL
            ? "يُضاف محتوى هذا القسم تباعاً — ستتوفر الأنظمة والمبادئ المرتبطة قريباً."
            : "Content for this section is being added progressively and will be available soon."}
        </p>
        {catInfo && (
          <p className={`text-[11px] mt-3 font-semibold ${isDark ? "text-gray-600" : "text-slate-400"}`}>
            {catId}
          </p>
        )}
      </motion.div>
    );
  }

  // no-results
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className={`col-span-full py-16 text-center rounded-3xl border border-dashed ${isDark ? "border-[#2d3748] bg-white/5" : "border-gray-300 bg-gray-50"}`}
    >
      <MagnifyingGlass size={36} className={`mx-auto mb-4 ${isDark ? "text-gray-600" : "text-gray-400"}`} weight="duotone" />
      <p className={`font-black text-base mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
        {isRTL ? "لا توجد نتائج تطابق بحثك" : "No matching results"}
      </p>
      <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
        {isRTL ? "جرّب كلمات مختلفة أو خفف من الفلاتر المحددة" : "Try different keywords or reduce active filters"}
      </p>
    </motion.div>
  );
}
