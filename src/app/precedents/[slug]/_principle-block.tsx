"use client";

import { FileText, Copy, Check, Plus, Minus } from "@phosphor-icons/react";
import { JudicialPrincipleItem } from "@/app/laws/data";

interface PrincipleBlockProps {
  p: JudicialPrincipleItem;
  isDark: boolean;
  isRTL: boolean;
  activePrincipleId: string;
  copiedPrincipleId: string;
  searchQuery: string;
  fontSize: "normal" | "large" | "xlarge";
  isReadingMode: boolean;
  handleCopyPrinciple: (p: JudicialPrincipleItem) => void;
  cartMap: Map<string, any>;
  addPrincipleToCart: (p: JudicialPrincipleItem) => void;
  removePrincipleFromCart: (id: string) => void;
  getReferenceForPrinciple: (p: JudicialPrincipleItem) => string;
  isReferenceText: (txt: string) => boolean;
  cleanTextOfRef: (text: string) => string;
  card: string;
  fontClass: string;
}

export default function PrincipleBlock({
  p,
  isDark,
  isRTL,
  activePrincipleId,
  copiedPrincipleId,
  searchQuery,
  fontSize,
  isReadingMode,
  handleCopyPrinciple,
  cartMap,
  addPrincipleToCart,
  removePrincipleFromCart,
  getReferenceForPrinciple,
  isReferenceText,
  cleanTextOfRef,
  card,
  fontClass
}: PrincipleBlockProps) {
  const isHighlighted = activePrincipleId === p.id;
  const mainParas = p.paragraphs?.filter(para => !isReferenceText(para.text)) || [];
  const hasParas = mainParas.length > 0;

  const hasDetails = !!(
    p.details &&
    (p.details.ruling_basis?.trim() ||
     p.details.facts?.trim() ||
     p.details.reasons?.trim() ||
     p.details.ruling?.trim() ||
     p.details['الحيثيات_والقرار']?.trim())
  );

  return (
    <div
      id={p.id}
      className={`nzamy-reader-block ${card} p-6 md:p-8 transition-all duration-300 ${
        isHighlighted ? "ring-1 ring-[#C8A762] shadow-md" : ""
      }`}
    >
      {/* Principle Card Metadata Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 mb-6 border-slate-200 dark:border-white/[0.05]">
        <div className="flex items-center gap-2 text-xs font-black text-amber-600 dark:text-[#C8A762]">
          <FileText size={16} />
          <span>{isRTL ? `مبدأ رقم (${p.number})` : `Principle #${p.number}`}</span>
          {p.decision_number && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762]" />
              <span>{isRTL ? `قرار رقم (${p.decision_number})` : `Decision #${p.decision_number}`}</span>
            </>
          )}
          <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762]" />
          <span>{p.issuing_body}</span>
          {p.session_date && (
            <span className="text-[10px] font-medium text-slate-400 dark:text-zinc-500 mr-2">
              ({p.session_date})
            </span>
          )}
        </div>
        {!isReadingMode && (
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => handleCopyPrinciple(p)}
              title={isRTL ? "نسخ المبدأ" : "Copy Principle"}
              className={`p-1.5 rounded-lg transition flex-shrink-0 ${
                isDark ? "hover:bg-white/[0.06] text-zinc-500" : "hover:bg-slate-100 text-slate-400"
              }`}
            >
              {copiedPrincipleId === p.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            </button>
            <button
              onClick={() => {
                if (cartMap.has(p.id)) {
                  removePrincipleFromCart(p.id);
                } else {
                  addPrincipleToCart(p);
                }
              }}
              className={`p-1.5 rounded-lg border transition ${
                cartMap.has(p.id)
                  ? isDark ? "bg-red-900/20 text-red-400 border-red-500/20" : "bg-red-50 text-red-500 border-red-200"
                  : isDark ? "bg-[#C8A762]/10 text-[#C8A762] border-[#C8A762]/20 hover:bg-[#C8A762]/20" : "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100"
              }`}
              title={isRTL ? "إضافة إلى المسودة" : "Add to Draft"}
            >
              {cartMap.has(p.id) ? <Minus size={12} /> : <Plus size={12} />}
            </button>
          </div>
        )}
      </div>

      {/* Body Content */}
      <div className={`${fontClass} space-y-4 text-justify font-sans leading-relaxed text-slate-700 dark:text-zinc-300`}>
        {hasParas ? (
          mainParas.map((para, idx) => {
            return (
              <div
                key={idx}
                id={`para-${p.id}-${para.letter}`}
                className="p-2.5 rounded-xl border border-transparent transition-all duration-300"
              >
                {para.letter && (
                  <span className="font-bold text-[#C8A762] dark:text-[#C8A762] text-[11px] block mb-1">
                    {para.letter}ـ
                  </span>
                )}
                <p className="whitespace-pre-line">{para.text}</p>
              </div>
            );
          })
        ) : (
          <p className="whitespace-pre-line">{cleanTextOfRef(p.text)}</p>
        )}
      </div>

      {/* Reference Citation Footer */}
      {(() => {
        const rawRef = getReferenceForPrinciple(p);
        if (!rawRef) return null;
        const cleanRef = rawRef.replace(/^\*\*?المرجع:\*\*?\s*/, "").replace(/^المرجع:\s*/, "");
        return (
          <div className="mt-4 pt-3 border-t border-dashed border-slate-100 dark:border-white/[0.05]">
            <p className="text-[10px] text-slate-400 dark:text-zinc-500 leading-relaxed">
              <span className="font-bold text-amber-600 dark:text-[#C8A762]">{isRTL ? "المرجع: " : "Reference: "}</span>
              {cleanRef}
            </p>
          </div>
        );
      })()}

      {/* Extra fields collapsibles */}
      {hasDetails && (
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/[0.05] space-y-2 print:hidden">
          <details className="group border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden transition-all duration-300">
            <summary className="list-none flex items-center justify-between p-4 cursor-pointer font-bold text-xs bg-slate-50/50 dark:bg-zinc-800/20 hover:bg-slate-100 dark:hover:bg-zinc-800/40 transition">
              <span>🔍 {isRTL ? "وقائع القضية والتسبيب والمنطوق" : "Case Facts, Reasons & Ruling"}</span>
              <span className="transition group-open:rotate-180">🔽</span>
            </summary>
            <div className="border-t border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5">
              {p.details?.ruling_basis && (
                <div className="p-4">
                  <p className={`text-[9px] font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
                    isDark ? "text-amber-500/70" : "text-amber-700"
                  }`}>
                    📌 {isRTL ? "مستند الحكم" : "Ruling Basis"}
                  </p>
                  <p className={`text-[11px] leading-relaxed text-justify ${
                    isDark ? "text-zinc-300" : "text-slate-700"
                  }`}>{p.details.ruling_basis}</p>
                </div>
              )}

              {p.details?.['الحيثيات_والقرار'] && (
                <div className="p-4">
                  <p className={`text-[9px] font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
                    isDark ? "text-blue-400" : "text-blue-700"
                  }`}>
                    ⚖️ {isRTL ? "الحيثيات والقرار" : "Grounds & Decision"}
                  </p>
                  <p className={`text-[11px] leading-relaxed text-justify ${
                    isDark ? "text-zinc-300" : "text-slate-700"
                  }`}>{p.details['الحيثيات_والقرار']}</p>
                </div>
              )}

              {p.details?.facts && (
                <div className="p-4">
                  <p className={`text-[9px] font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
                    isDark ? "text-slate-400" : "text-slate-600"
                  }`}>
                    🔍 {isRTL ? "وقائع الدعوى" : "Facts of the Case"}
                  </p>
                  <p className={`text-[11px] leading-relaxed text-justify ${
                    isDark ? "text-zinc-300" : "text-slate-700"
                  }`}>{p.details.facts}</p>
                </div>
              )}

              {p.details?.reasons && (
                <div className="p-4">
                  <p className={`text-[9px] font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
                    isDark ? "text-purple-400" : "text-purple-700"
                  }`}>
                    📝 {isRTL ? "أسباب الحكم" : "Reasons"}
                  </p>
                  <p className={`text-[11px] leading-relaxed text-justify ${
                    isDark ? "text-zinc-300" : "text-slate-700"
                  }`}>{p.details.reasons}</p>
                </div>
              )}

              {p.details?.ruling && (
                <div className={`p-4 ${isDark ? "bg-[#0B3D2E]/10" : "bg-[#0B3D2E]/5"}`}>
                  <p className={`text-[9px] font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
                    isDark ? "text-emerald-400" : "text-[#0B3D2E]"
                  }`}>
                    🏛️ {isRTL ? "منطوق الحكم النهائي" : "Final Ruling"}
                  </p>
                  <p className={`text-[11px] leading-relaxed text-justify font-bold ${
                    isDark ? "text-zinc-200" : "text-slate-800"
                  }`}>{p.details.ruling}</p>
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
