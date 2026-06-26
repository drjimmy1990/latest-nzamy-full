"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scales, Gavel, Scroll, CheckCircle, Clock, BookOpen, MagnifyingGlass, ArrowsClockwise
} from "@phosphor-icons/react";
import * as PhosphorIcons from "@phosphor-icons/react";
import { type DemoPrinciple, type DemoPrecedent, type DemoOrder } from "../demo-data";
import { LEGAL_TAXONOMY } from "@/constants/taxonomies";

export function highlightText(text: string, q: string, isDark: boolean) {
  if (!text) return "";
  if (!q || !q.trim()) return text;
  
  const cleanQ = q.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // Escape regex characters
  const parts = text.split(new RegExp(`(${cleanQ})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === q.trim().toLowerCase() ? (
          <mark key={i} className={isDark ? "bg-amber-400/20 text-amber-300 px-0.5 rounded font-semibold animate-pulse" : "bg-amber-100 text-amber-800 px-0.5 rounded font-semibold"}>
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

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

export const ISSUER_MAP: Record<string, { ar: string; en: string }> = {
  diwan: { ar: "الديوان الملكي", en: "Royal Court" },
  cabinet: { ar: "مجلس الوزراء", en: "Council of Ministers" },
  sama: { ar: "البنك المركزي السعودي (ساما)", en: "SAMA" },
  ncnp: { ar: "المركز الوطني لتنمية القطاع غير الربحي", en: "NCNP" },
  mol: { ar: "وزارة الموارد البشرية", en: "Ministry of HRSD" },
  rega: { ar: "الهيئة العامة للعقار", en: "REGA" },
};

// ─── PrincipleRow ───────────────────────────────────────────────────────────────
export function PrincipleRow({ p, isDark, idx, isRTL = true, q = "" }: { p: DemoPrinciple; isDark: boolean; idx: number; isRTL?: boolean; q?: string }) {
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
          <p className={`text-[13px] leading-relaxed mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            {highlightText(p.text, q, isDark)}
          </p>

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
export function PrecedentRow({ pr, isDark, idx, isRTL = true, onClick, onHashtagClick, q = "" }: { pr: DemoPrecedent; isDark: boolean; idx: number; isRTL?: boolean; onClick?: () => void; onHashtagClick?: (tag: string) => void; q?: string }) {
  const [copied, setCopied] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<'laws' | 'conflicts' | 'studies' | null>(null);

  // Mock metadata aligned with the screenshot columns
  const metadata = (() => {
    switch (pr.id) {
      case "prec-moj-01":
        return {
          score: "٩٦٪",
          date: "١٢/٠٥/١٤٤٤هـ",
          refId: "NZ-88902",
          laws: ["المادة ٨٨ من نظام المحاكم التجارية", "المادة ٢٤ من نظام الإثبات"],
          conflicts: ["قرار الهيئة العامة بمحكمة الاستئناف لعام ١٤٤٢هـ"],
          studies: ["أثر التماس إعادة النظر على التنفيذ"]
        };
      case "prec-moj-02":
        return {
          score: "٩٥٪",
          date: "١٤/٠٥/١٤٤٥هـ",
          refId: "NZ-88903",
          laws: ["المادة ١٨٧ من نظام المرافعات الشرعية"],
          conflicts: [],
          studies: ["سقوط الحق في الاستئناف فواتاً للميعاد"]
        };
      case "prec-07":
        return {
          score: "٩٢٪",
          date: "٢٢/١١/١٤٤٤هـ",
          refId: "NZ-71211",
          laws: ["نظام المحاكم التجارية — إيداع الكفالة"],
          conflicts: [],
          studies: ["شروط قبول الاستئناف التجاري شكلاً"]
        };
      case "prec-01":
        return {
          score: "٩٤٪",
          date: "٢٥/٠٢/١٤٤٥هـ",
          refId: "NZ-71210",
          laws: ["المادة ١١٠ من نظام المعاملات المدنية"],
          conflicts: [],
          studies: ["الفسخ للقوة القاهرة في عقود التوريد"]
        };
      case "prec-02":
        return {
          score: "٩١٪",
          date: "٠٨/١٠/١٤٤٤هـ",
          refId: "NZ-38901",
          laws: ["المادة ٢٢ من نظام الشركات الجديد"],
          conflicts: ["حكم الدائرة الاستئنافية الأولى بجدة لعام ١٤٤٢هـ"],
          studies: ["صورية عقود الشركات التجارية وآثارها"]
        };
      case "prec-03":
        return {
          score: "٨٩٪",
          date: "١٢/٠٤/١٤٤٥هـ",
          refId: "NZ-43120",
          laws: ["المادة ٧٧ من نظام العمل السعودي"],
          conflicts: [],
          studies: ["التعويض العادل عن إنهاء عقد العمل"]
        };
      default:
        return {
          score: "٨٥٪",
          date: "١٩/٠٨/١٤٤٣هـ",
          refId: "NZ-72291",
          laws: ["نظام التسجيل العيني للعقار"],
          conflicts: [],
          studies: []
        };
    }
  })();

  const toggleTooltip = (e: React.MouseEvent, type: 'laws' | 'conflicts' | 'studies') => {
    e.stopPropagation();
    setActiveTooltip(activeTooltip === type ? null : type);
  };

  const getTooltipTitle = (type: 'laws' | 'conflicts' | 'studies') => {
    if (type === 'laws') return isRTL ? "التشريعات المرتبطة" : "Linked Laws";
    if (type === 'conflicts') return isRTL ? "أحكام متعارضة أو مرجحة" : "Conflicting Rulings";
    return isRTL ? "الدراسات المقارنة" : "Comparative Studies";
  };

  const getTooltipData = (type: 'laws' | 'conflicts' | 'studies') => {
    return metadata[type] || [];
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      onClick={onClick}
      className={`rounded-2xl border p-5 transition-all cursor-pointer flex flex-col md:flex-row gap-5 items-stretch ${
        isDark 
          ? "bg-[#161b22]/90 border-[#2d3748] hover:border-purple-500/30 shadow-lg hover:shadow-purple-500/5" 
          : "bg-white border-gray-200 hover:border-purple-200 shadow hover:shadow-purple-100"
      }`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Right Column: Primary Textual Info (flex-1) */}
      <div className="flex-1 min-w-0 flex items-start gap-3.5">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isDark ? "bg-purple-900/20" : "bg-purple-50"
        }`}>
          <Gavel size={18} className={isDark ? "text-purple-400" : "text-purple-600"} weight="duotone" />
        </div>
        <div className="flex-1 min-w-0" onClick={e => { if (copied) e.stopPropagation(); }}>
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-lg ${
                isDark ? "bg-purple-900/30 text-purple-400" : "bg-purple-50/80 text-purple-800 border border-purple-100"
              }`}>
                {pr.court}
              </span>
              <span className={`text-[10px] font-mono ${isDark ? "text-gray-500" : "text-slate-400"}`}>
                قرار رقم {pr.caseNum.split(" ")[0]}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(`${pr.court} - ${pr.caseNum}\n${pr.summary}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className={`p-1.5 rounded-lg transition flex-shrink-0 ${
                isDark ? "hover:bg-white/[0.06] text-gray-500" : "hover:bg-slate-100 text-slate-400"
              }`}
            >
              {copied ? <CheckCircle size={14} className="text-emerald-500" /> : <PhosphorIcons.Copy size={14} />}
            </button>
          </div>
          <h4 className={`text-[13px] font-black mb-1 leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
            {highlightText(pr.relevance, q, isDark)}
          </h4>
          <p className={`text-[12.5px] leading-relaxed line-clamp-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            {highlightText(pr.summary_brief || "", q, isDark)}
          </p>
        </div>
      </div>

      {/* Left Column: Metadata & Interactive Toolbar (Dashed Divider) */}
      <div 
        className={`w-full md:w-[220px] shrink-0 flex flex-col justify-between pt-3.5 md:pt-0 border-t md:border-t-0 md:border-r border-dashed pr-0 md:pr-5 ${
          isDark ? "border-white/[0.08]" : "border-gray-200"
        }`}
        onClick={e => e.stopPropagation()} // Prevent clicking metadata column from trigger navigation
      >
        {/* Top: Score & Session Date */}
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500`}>
              {metadata.score} {isRTL ? "مطابقة" : "Match"}
            </span>
          </div>
          <span className={`text-[10.5px] font-bold font-mono ${isDark ? "text-gray-500" : "text-slate-400"}`}>
            {metadata.date}
          </span>
        </div>

        {/* Middle: Reference ID */}
        <div className={`text-[10px] font-mono mb-2.5 flex items-center gap-1 ${isDark ? "text-gray-600" : "text-slate-400"}`}>
          <PhosphorIcons.Hash size={11} />
          <span>{isRTL ? "الرقم المرجعي" : "Ref ID"}: {metadata.refId}</span>
        </div>

        {/* Bottom: Association Buttons (Linked Laws, Conflicts, Studies) */}
        <div className="flex items-center gap-2 relative">
          
          {/* Button 1: Linked Laws */}
          <button
            onClick={(e) => toggleTooltip(e, 'laws')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-black border transition ${
              activeTooltip === 'laws'
                ? "bg-[#0B3D2E] text-white border-[#0B3D2E]"
                : isDark 
                  ? "bg-white/[0.03] border-white/10 text-emerald-400 hover:bg-emerald-500/10" 
                  : "bg-emerald-50/30 border-emerald-100 text-[#0B3D2E] hover:bg-emerald-50"
            }`}
            title={getTooltipTitle('laws')}
          >
            <BookOpen size={13} weight="duotone" />
            <span>{isRTL ? "تشريعات" : "Laws"} ({getTooltipData('laws').length})</span>
          </button>

          {/* Button 2: Conflicting Judgments */}
          <button
            onClick={(e) => toggleTooltip(e, 'conflicts')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-black border transition ${
              activeTooltip === 'conflicts'
                ? "bg-amber-600 text-white border-amber-600"
                : getTooltipData('conflicts').length === 0
                  ? isDark ? "border-transparent text-gray-700 cursor-not-allowed opacity-30" : "border-transparent text-slate-300 cursor-not-allowed opacity-40"
                  : isDark
                    ? "bg-white/[0.03] border-white/10 text-amber-500 hover:bg-amber-500/10"
                    : "bg-amber-50/30 border-amber-100 text-amber-800 hover:bg-amber-50"
            }`}
            disabled={getTooltipData('conflicts').length === 0}
            title={getTooltipTitle('conflicts')}
          >
            <ArrowsClockwise size={13} weight="bold" />
            <span>{isRTL ? "متعارضة" : "Conflicts"} ({getTooltipData('conflicts').length})</span>
          </button>

          {/* Button 3: Comparative Studies */}
          <button
            onClick={(e) => toggleTooltip(e, 'studies')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-black border transition ${
              activeTooltip === 'studies'
                ? "bg-purple-800 text-white border-purple-800"
                : getTooltipData('studies').length === 0
                  ? isDark ? "border-transparent text-gray-700 cursor-not-allowed opacity-30" : "border-transparent text-slate-300 cursor-not-allowed opacity-40"
                  : isDark
                    ? "bg-white/[0.03] border-white/10 text-purple-400 hover:bg-purple-500/10"
                    : "bg-purple-50/30 border-purple-100 text-purple-800 hover:bg-purple-50"
            }`}
            disabled={getTooltipData('studies').length === 0}
            title={getTooltipTitle('studies')}
          >
            <PhosphorIcons.Scroll size={13} weight="duotone" />
            <span>{isRTL ? "مقارن" : "Studies"} ({getTooltipData('studies').length})</span>
          </button>

          {/* Interactive Tooltip Dropdown Panel */}
          <AnimatePresence>
            {activeTooltip !== null && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6 }}
                className={`absolute bottom-full mb-2 left-0 right-0 md:left-auto md:-left-4 z-20 w-64 p-3.5 rounded-2xl border shadow-2xl text-right ${
                  isDark ? "bg-[#1f293d] border-[#2d3748] text-white" : "bg-white border-gray-200 text-gray-900 shadow-slate-200"
                }`}
              >
                <div className="flex items-center justify-between border-b pb-1.5 mb-2 border-white/10 dark:border-white/10 border-gray-100">
                  <span className="text-[11px] font-black text-[#C8A762]">
                    {getTooltipTitle(activeTooltip)}
                  </span>
                  <button 
                    onClick={() => setActiveTooltip(null)}
                    className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${isDark ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                  {getTooltipData(activeTooltip).map((item, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-[11px] leading-relaxed font-semibold hover:underline cursor-pointer">
                      <span className="text-[#C8A762] shrink-0">•</span>
                      <span className={isDark ? "text-gray-200" : "text-gray-700"}>{item}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </motion.div>
  );
}

export function OrderRow({ o, isDark, idx, isRTL = true, onClick, onHashtagClick }: { o: DemoOrder; isDark: boolean; idx: number; isRTL?: boolean; onClick?: () => void; onHashtagClick?: (tag: string) => void }) {
  const style = ORDER_TYPE_STYLES[o.type];
  const typeLabel = isRTL ? style.label : ORDER_TYPE_LABELS_EN[o.type];
  const issuerLabel = ISSUER_MAP[o.issuer]?.[isRTL ? "ar" : "en"] || o.issuer;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      onClick={onClick}
      className={`rounded-2xl border p-4 transition-all cursor-pointer ${isDark ? "bg-[#161b22] border-[#2d3748] hover:border-slate-600" : "bg-white border-gray-200 hover:border-slate-300"}`}
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
          <p className={`text-[13px] font-bold mb-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>{o.title}</p>
          <p className={`text-[12.5px] leading-relaxed mb-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>{o.summary_brief}</p>
          <p className={`text-[10px] ${isDark ? "text-gray-600" : "text-slate-400"}`}>{issuerLabel}</p>
          

        </div>
      </div>
    </motion.div>
  );
}

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

// ─── PrincipleCard ───────────────────────────────────────────────────────────────
export function PrincipleCard({ p, isDark, idx, isRTL = true, q = "" }: { p: DemoPrinciple; isDark: boolean; idx: number; isRTL?: boolean; q?: string }) {
  const [copied, setCopied] = useState(false);
  const isTamyeez  = p.sourceId === "tamyeez";
  const idLabel    = isTamyeez
    ? (p.reportNum ? `${isRTL ? "تقرير رقم" : "Report No."} (${p.reportNum})` : "")
    : (p.principleNum ? `${isRTL ? "مبدأ رقم" : "Principle No."} (${p.principleNum})` : "");

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      className={`rounded-2xl border p-5 transition-all flex flex-col justify-between min-h-[240px] ${isDark ? "bg-[#161b22] border-[#2d3748] hover:border-[#C8A762]/30" : "bg-white border-gray-200 hover:border-amber-200"}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-800"}`}>
              {p.source}
            </span>
            {p.srcAbbr && (
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border font-mono ${
                isDark ? "border-[#C8A762]/20 text-[#C8A762]/70 bg-[#C8A762]/5" : "border-amber-200 text-amber-700 bg-amber-50"
              }`}>
                {p.srcAbbr}
              </span>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${p.ref}\n\n"${p.text}"`); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
            className={`p-1.5 rounded-lg transition flex-shrink-0 ${isDark ? "hover:bg-white/[0.06] text-gray-600" : "hover:bg-slate-100 text-slate-400"}`}
          >
            {copied ? <CheckCircle size={13} className="text-emerald-500" /> : <PhosphorIcons.Copy size={13} />}
          </button>
        </div>
        
        <p className={`text-[13px] leading-relaxed mb-4 line-clamp-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
          {highlightText(p.text, q, isDark)}
        </p>
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-white/[0.04]">
        {idLabel && (
          <div className="mb-2">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
              isDark ? "bg-white/5 text-gray-400" : "bg-slate-100 text-slate-600"
            }`}>
              {idLabel}
            </span>
          </div>
        )}
        <div className={`flex flex-wrap items-center gap-x-2 text-[9px] font-mono ${isDark ? "text-gray-600" : "text-slate-400"}`}>
          <span>{p.ref}</span>
          {p.page && <span>{isRTL ? "ص" : "p."} {p.page}</span>}
          <span>{p.year}{isRTL ? "هـ" : " AH"}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── PrecedentCard ───────────────────────────────────────────────────────────────
export function PrecedentCard({ pr, isDark, idx, isRTL = true, onClick, onHashtagClick, q = "" }: { pr: DemoPrecedent; isDark: boolean; idx: number; isRTL?: boolean; onClick?: () => void; onHashtagClick?: (tag: string) => void; q?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      onClick={onClick}
      className={`rounded-2xl border p-5 transition-all cursor-pointer flex flex-col justify-between min-h-[240px] ${isDark ? "bg-[#161b22] border-[#2d3748] hover:border-purple-500/30" : "bg-white border-gray-200 hover:border-purple-200"}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${isDark ? "bg-purple-900/20 text-purple-400" : "bg-purple-50 text-purple-800"}`}>{pr.court}</span>
          <button
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${pr.court} - ${pr.caseNum} - ${pr.year}\n${pr.summary}`); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
            className={`p-1.5 rounded-lg transition flex-shrink-0 ${isDark ? "hover:bg-white/[0.06] text-gray-600" : "hover:bg-slate-100 text-slate-400"}`}
          >
            {copied ? <CheckCircle size={13} className="text-emerald-500" /> : <PhosphorIcons.Copy size={13} />}
          </button>
        </div>
        
        <h4 className={`text-[13px] font-bold mb-1 line-clamp-2 ${isDark ? "text-white" : "text-gray-900"}`}>
          {highlightText(pr.relevance, q, isDark)}
        </h4>
        <p className={`text-[12.5px] leading-relaxed line-clamp-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
          {highlightText(pr.summary_brief || "", q, isDark)}
        </p>
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-white/[0.04]">
        <div className={`text-[9px] mb-2 ${isDark ? "text-gray-600" : "text-slate-400"}`}>{pr.caseNum} · {pr.year}</div>

      </div>
    </motion.div>
  );
}

// ─── OrderCard ───────────────────────────────────────────────────────────────────
export function OrderCard({ o, isDark, idx, isRTL = true, onClick, onHashtagClick }: { o: DemoOrder; isDark: boolean; idx: number; isRTL?: boolean; onClick?: () => void; onHashtagClick?: (tag: string) => void }) {
  const style = ORDER_TYPE_STYLES[o.type];
  const typeLabel = isRTL ? style.label : ORDER_TYPE_LABELS_EN[o.type];
  const issuerLabel = ISSUER_MAP[o.issuer]?.[isRTL ? "ar" : "en"] || o.issuer;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      onClick={onClick}
      className={`rounded-2xl border p-5 transition-all cursor-pointer flex flex-col justify-between min-h-[240px] ${isDark ? "bg-[#161b22] border-[#2d3748] hover:border-slate-600" : "bg-white border-gray-200 hover:border-slate-300"}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-lg ${style.class}`}>{typeLabel}</span>
          <span className={`text-[10px] ${isDark ? "text-gray-600" : "text-slate-400"}`}>{o.date}</span>
        </div>
        
        <h4 className={`text-[13px] font-bold mb-1.5 line-clamp-2 ${isDark ? "text-white" : "text-gray-900"}`}>{o.title}</h4>
        <p className={`text-[12.5px] leading-relaxed line-clamp-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>{o.summary_brief}</p>
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-white/[0.04]">
        <div className={`text-[10px] mb-2 font-bold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{o.ref}</div>
        <p className={`text-[9px] ${isDark ? "text-gray-600" : "text-slate-400"}`}>{issuerLabel}</p>
      </div>
    </motion.div>
  );
}

