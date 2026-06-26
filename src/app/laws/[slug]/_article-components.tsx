"use client";

import { useCallback, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Minus, Copy, Check, CaretDown, CaretUp,
  ClockCounterClockwise, FileText, BookOpen, Lock,
  Stack, Trash, X, ArrowCounterClockwise, Scales,
  Gavel, Sparkle, Highlighter, NotePencil, FloppyDisk, PushPin
} from "@phosphor-icons/react";
import { markdownBoldToSafeHtml } from "@/utils/sanitize";
import type { LawArticle, JudicialPrinciple, JudicialPrecedent } from "../data";

export function MD({ text, isDark, isRTL = true, fontClass = "text-[13px]" }: { text: string; isDark: boolean; isRTL?: boolean; fontClass?: string }) {
  const muted = isDark ? "text-zinc-300" : "text-zinc-700";
  const listIndent = isRTL ? "pr-4" : "pl-4";
  return (
    <div className="space-y-1.5">
      {text.trim().split("\n").map((line, i) => {
        const html = markdownBoldToSafeHtml(line);
        if (line.startsWith("أ-") || line.startsWith("ب-") || line.startsWith("ج-") ||
            line.startsWith("د-") || line.startsWith("هـ-"))
          return <p key={i} className={`${fontClass} leading-relaxed ${listIndent} ${muted}`} dangerouslySetInnerHTML={{ __html: html }} />;
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i} className={`${fontClass} leading-relaxed ${muted}`} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}

import { type CartEntry } from "@/components/laws/DraftDrawer";

function getSelectedTextWithin(containerId: string): string {
  if (typeof window === "undefined") return "";
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return "";
  const selectedText = selection.toString().trim();
  if (!selectedText) return "";
  const container = document.getElementById(containerId);
  if (!container) return "";
  const range = selection.getRangeAt(0);
  if (container.contains(range.commonAncestorContainer)) {
    return selectedText;
  }
  return "";
}

// ـــ HTML Clipboard helper — Bold في Word بدون Markdown ـــــــــــــــــــــــــــــــ
async function copyRich(html: string, plain: string) {
  try {
    const full = `<html><body><p dir="rtl" style="font-family:'Arial';font-size:14pt;line-height:1.8">${html}</p></body></html>`;
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html":  new Blob([full],  { type: "text/html"  }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
  } catch {
    navigator.clipboard.writeText(plain);
  }
}

// ـــ تحويل Markdown Inline إلى HTML/Plain ـــــــــــــــــــــــــــــ
// **نص:** → <b>نص:</b>   |   __نص__ → <b>نص</b>
function md2html(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")   // **bold**
    .replace(/__([^_]+)__/g,   "<b>$1</b>")     // __bold__
    .replace(/\n/g, "<br>");
}
// إزالة ** و __ من النص العادي
function stripMd(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g,   "$1");
}


// ─── Principle mini-card ───────────────────────────────────────────────────────
function PrincipleCard({ p, isDark, inCart, onToggle, locked, onLock, isRTL = true }: {
  p: JudicialPrinciple; isDark: boolean; inCart: boolean;
  onToggle: () => void; locked: boolean; onLock: () => void;
  isRTL?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (locked) { onLock(); return; }
    navigator.clipboard.writeText(`المبدأ الصادر من: ${p.source}\nالمرجع: ${p.ref}\n\n${p.text}`);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className={`rounded-xl border p-3 transition ${isDark ? "border-white/[0.06] bg-zinc-800/40" : "border-slate-100 bg-slate-50"}`} dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-start gap-2 mb-1.5">
        <div className="flex-1">
          <p className={`text-[10px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>{p.source}</p>
          <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{p.ref}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={handleCopy} className={`p-1 rounded-lg transition ${isDark ? "hover:bg-white/[0.06] text-zinc-600" : "hover:bg-slate-200 text-slate-400"}`}>
            {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
          </button>
          <button onClick={locked ? onLock : onToggle} className={`p-1 rounded-lg transition ${inCart ? isDark ? "bg-red-900/20 text-red-400" : "bg-red-50 text-red-500" : isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-600"}`}>
            {inCart ? <Minus size={11} /> : <Plus size={11} />}
          </button>
        </div>
      </div>
      <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{p.text}</p>
    </div>
  );
}

// ─── Precedent mini-card ───────────────────────────────────────────────────────
function PrecedentCard({ pr, isDark, inCart, onToggle, locked, onLock, isRTL = true }: {
  pr: JudicialPrecedent; isDark: boolean; inCart: boolean;
  onToggle: () => void; locked: boolean; onLock: () => void;
  isRTL?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (locked) { onLock(); return; }
    navigator.clipboard.writeText(`المحكمة: ${pr.court}\nرقم القضية: ${pr.caseNum} (جلسة ${pr.year})\n\n${pr.summary}`);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className={`rounded-xl border p-3 transition ${isDark ? "border-white/[0.06] bg-zinc-800/40" : "border-slate-100 bg-slate-50"}`} dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-start gap-2 mb-1.5">
        <div className="flex-1">
          <p className={`text-[10px] font-bold ${isDark ? "text-purple-400" : "text-purple-700"}`}>{pr.court}</p>
          <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{pr.caseNum} · {pr.year}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={handleCopy} className={`p-1 rounded-lg transition ${isDark ? "hover:bg-white/[0.06] text-zinc-600" : "hover:bg-slate-200 text-slate-400"}`}>
            {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
          </button>
          <button onClick={locked ? onLock : onToggle} className={`p-1 rounded-lg transition ${inCart ? isDark ? "bg-red-900/20 text-red-400" : "bg-red-50 text-red-500" : isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-600"}`}>
            {inCart ? <Minus size={11} /> : <Plus size={11} />}
          </button>
        </div>
      </div>
      <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{pr.summary}</p>
      <p className={`text-[10px] mt-1.5 font-semibold ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{isRTL ? "الصلة بالمادة" : "Article relevance"}: {pr.relevance}</p>
    </div>
  );
}

// ─── Right sidebar: principles + precedents for active article ─────────────────
export function RightPanel({ article, isDark, cart, onTogglePrinciple, onTogglePrecedent, locked, onLock, isRTL = true }: {
  article: LawArticle | null; isDark: boolean;
  cart: CartEntry | undefined;
  onTogglePrinciple: (articleId: string, p: JudicialPrinciple) => void;
  onTogglePrecedent: (articleId: string, pr: JudicialPrecedent) => void;
  locked: boolean; onLock: () => void;
  isRTL?: boolean;
}) {
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";
  const muted  = isDark ? "text-zinc-500" : "text-slate-400";
  const card   = `rounded-2xl border ${isDark ? "bg-zinc-900" : "bg-white shadow-sm"}`;

  if (!article) return (
    <div className={`${card} ${border} p-4 text-center`}>
      <Scales size={28} className={`mx-auto mb-2 ${muted}`} />
      <p className={`text-[12px] ${muted}`}>{isRTL ? "اختر مادة من القائمة لعرض المبادئ والسوابق المرتبطة" : "Choose an article to show related principles and precedents"}</p>
    </div>
  );

  const cartEntry         = cart;
  const cartPrincipleIds  = new Set(cartEntry?.principles.map(p => p.id) ?? []);
  const cartPrecedentIds  = new Set(cartEntry?.precedents.map(pr => pr.id) ?? []);

  const hasPrinciples = article.principles && article.principles.length > 0;
  const hasPrecedents = article.precedents && article.precedents.length > 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className={`${card} ${border} px-3 py-2.5`}>
        <p className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{article.num}</p>
        <p className={`text-[10px] ${muted}`}>{article.title}</p>
      </div>

      {/* Principles */}
      <div className={`${card} ${border} p-3 space-y-2`}>
        <div className="flex items-center gap-1.5 mb-1">
          <Scales size={13} className={isDark ? "text-[#C8A762]" : "text-amber-600"} weight="duotone" />
          <p className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{isRTL ? "المبادئ القضائية" : "Judicial Principles"}</p>
          {hasPrinciples && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-700"}`}>{article.principles!.length}</span>}
        </div>
        {hasPrinciples ? article.principles!.map(p => (
          <PrincipleCard
            key={p.id} p={p} isDark={isDark}
            inCart={cartPrincipleIds.has(p.id)}
            onToggle={() => onTogglePrinciple(article.id, p)}
            locked={locked} onLock={onLock}
            isRTL={isRTL}
          />
        )) : (
          <p className={`text-[11px] py-2 text-center ${muted}`}>{isRTL ? "لا توجد مبادئ مرتبطة بهذه المادة" : "No principles linked to this article"}</p>
        )}
      </div>

      {/* Precedents */}
      <div className={`${card} ${border} p-3 space-y-2`}>
        <div className="flex items-center gap-1.5 mb-1">
          <Gavel size={13} className={isDark ? "text-purple-400" : "text-purple-600"} weight="duotone" />
          <p className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{isRTL ? "السوابق القضائية" : "Judicial Precedents"}</p>
          {hasPrecedents && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isDark ? "bg-purple-900/20 text-purple-400" : "bg-purple-50 text-purple-700"}`}>{article.precedents!.length}</span>}
        </div>
        {hasPrecedents ? article.precedents!.map(pr => (
          <PrecedentCard
            key={pr.id} pr={pr} isDark={isDark}
            inCart={cartPrecedentIds.has(pr.id)}
            onToggle={() => onTogglePrecedent(article.id, pr)}
            locked={locked} onLock={onLock}
            isRTL={isRTL}
          />
        )) : (
          <p className={`text-[11px] py-2 text-center ${muted}`}>{isRTL ? "لا توجد سوابق مرتبطة بهذه المادة" : "No precedents linked to this article"}</p>
        )}
      </div>
    </div>
  );
}

// ─── Article Block ─────────────────────────────────────────────────────────────
export function ArticleBlock({ article, lawName, isDark, entry, onAddArticle, onRemoveArticle, onAddExecReg, onRemoveExecReg, onActive, isActive, showPaywall, onExplain, isRTL = true, fontClass = "text-[13px]", isReadingMode = false, viewMode = "all" }: {
  article: LawArticle; lawName: string; isDark: boolean;
  entry: CartEntry | undefined;
  onAddArticle: (a: LawArticle) => void;
  onRemoveArticle: (id: string) => void;
  onAddExecReg: (a: LawArticle) => void;
  onRemoveExecReg: (id: string) => void;
  onActive: (id: string) => void;
  isActive: boolean;
  showPaywall: () => void;
  onExplain: (a: LawArticle) => void;
  isRTL?: boolean;
  fontClass?: string; // حجم الخط: text-[13px] | text-[15px] | text-[17px]
  isReadingMode?: boolean;
  viewMode?: "all" | "law" | "regulation";
}) {
  const [showAmendments, setShowAmendments] = useState(false);
  const [showRepealed,   setShowRepealed]   = useState(false);
  const [copied, setCopied]                 = useState(false);
  const [copiedReg, setCopiedReg]           = useState(false);
  const isRepealed  = article.status === "repealed";
  const isAmended   = article.status === "amended";
  const isLocked    = !article.free;
  const inCart      = !!entry && entry.isArticleAdded;
  const regInCart   = !!entry && entry.isExecRegAdded;

  const handleCopy = useCallback(() => {
    if (isLocked) { showPaywall(); return; }
    const selectedText = getSelectedTextWithin(article.id);
    const base  = lawName.replace(/\s*ولوائحه التنفيذية.*/, "").trim();
    
    let plainText = "";
    if (selectedText) {
      plainText = selectedText;
    } else {
      plainText = article.text;
    }
    
    const cleanNum = article.num.replace(/المادة\s*/, "").trim();
    const prefixPlain = isRTL
      ? `المادة (${cleanNum}) من نظام (${base}) ونصه:`
      : `Article (${cleanNum}) of the (${base}) system, text:`;
    const prefixHtml = isRTL
      ? `<b>المادة (${cleanNum}) من نظام (${base}) ونصه:</b>`
      : `<b>Article (${cleanNum}) of the (${base}) system, text:</b>`;
      
    const plain = `${prefixPlain}\n“${stripMd(plainText)}”`;
    const html  = `${prefixHtml}<br>“${md2html(plainText)}”`;
    copyRich(html, plain);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }, [article, isLocked, showPaywall, lawName, isRTL]);

  const handleCopyReg = useCallback(() => {
    if (isLocked) { showPaywall(); return; }
    if (!article.executiveReg) return;
    const selectedText = getSelectedTextWithin(`exec-reg-${article.id}`);
    const base = lawName.replace(/\s*ولوائحه التنفيذية.*/, "").trim();
    
    let plainText = "";
    if (selectedText) {
      plainText = selectedText;
    } else {
      plainText = article.executiveReg.text;
    }
    
    const cleanNum = article.executiveReg.ref.replace(/المادة\s*/, "").trim();
    const prefixPlain = isRTL
      ? `المادة (${cleanNum}) من اللائحة التنفيذية لنظام (${base}) ونصه:`
      : `Article (${cleanNum}) of the Executive Regulations of (${base}), text:`;
    const prefixHtml = isRTL
      ? `<b>المادة (${cleanNum}) من اللائحة التنفيذية لنظام (${base}) ونصه:</b>`
      : `<b>Article (${cleanNum}) of the Executive Regulations of (${base}), text:</b>`;
      
    const plain = `${prefixPlain}\n“${stripMd(plainText)}”`;
    const html  = `${prefixHtml}<br>“${md2html(plainText)}”`;
    copyRich(html, plain);
    setCopiedReg(true); setTimeout(() => setCopiedReg(false), 1800);
  }, [article, isLocked, showPaywall, lawName, isRTL]);



  const mainBadgeText = viewMode === "regulation" && article.executiveReg ? article.executiveReg.ref : article.num;
  const mainBadgeStyle = viewMode === "regulation"
    ? "bg-[#C8A762] text-[#0B3D2E] font-black"
    : isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white";

  const showExplainBtn = !isRepealed && (viewMode !== "regulation" || !!article.executiveReg);
  const mainInCart = viewMode === "regulation" ? regInCart : inCart;
  const mainOnToggleCart = () => {
    if (viewMode === "regulation") {
      regInCart ? onRemoveExecReg(article.id) : (isLocked ? showPaywall() : onAddExecReg(article));
    } else {
      inCart ? onRemoveArticle(article.id) : (isLocked ? showPaywall() : onAddArticle(article));
    }
  };
  const mainOnCopy = viewMode === "regulation" ? handleCopyReg : handleCopy;
  const mainCopied = viewMode === "regulation" ? copiedReg : copied;

  const mainCartBorder = viewMode === "regulation" ? regInCart : inCart;
  const cardBorder = isActive
    ? isDark ? "border-[#C8A762]/50" : "border-amber-400"
    : mainCartBorder
    ? isDark ? "border-[#C8A762]/25" : "border-amber-200"
    : isDark ? "border-white/[0.07]" : "border-slate-200";

  return (
    <motion.div
      layout id={article.id}
      onClick={() => onActive(article.id)}
      className={`nzamy-reader-block rounded-2xl border shadow-sm overflow-hidden cursor-pointer transition-colors ${isDark ? "bg-zinc-900" : "bg-white"} ${cardBorder}`}
    >
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${isDark ? "border-white/[0.05] bg-zinc-800/50" : "border-slate-100 bg-slate-50/80"}`}
           onClick={e => e.stopPropagation()}>

        <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg flex-shrink-0 ${mainBadgeStyle}`}>
          {mainBadgeText}
        </span>
        <p className={`flex-1 text-[12px] font-bold truncate ${isRepealed ? "line-through text-red-400" : isDark ? "text-zinc-200" : "text-zinc-700"}`}>
          {article.title}
        </p>

        {viewMode === "regulation" && (
          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md border flex-shrink-0 ${
            isDark
              ? "bg-[#0B3D2E]/10 text-emerald-400 border-emerald-500/20"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}>
            {isRTL ? `مرتبطة بـ ${article.num}` : `Linked to ${article.num}`}
          </span>
        )}

        {isRepealed && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 flex-shrink-0">{isRTL ? "ملغاة" : "Repealed"}</span>}
        {isAmended  && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-400/20 flex-shrink-0">{isRTL ? "معدَّلة" : "Amended"}</span>}
        {isLocked   && <Lock size={12} className={`flex-shrink-0 ${isDark ? "text-zinc-600" : "text-slate-400"}`} />}

        {!isReadingMode && (
          <div className="flex items-center gap-1.5 print:hidden">
            {showExplainBtn && (
              <button onClick={() => onExplain(article)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition text-[10px] font-bold flex-shrink-0 ${isDark ? "bg-[#C8A762]/10 text-[#C8A762] hover:bg-[#C8A762]/20" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>
                <Sparkle size={12} weight="duotone" />
                {isRTL ? "اشرح لي" : "Explain"}
              </button>
            )}

            <button onClick={mainOnCopy} className={`p-1.5 rounded-lg transition flex-shrink-0 ${isDark ? "hover:bg-white/[0.06] text-zinc-500" : "hover:bg-slate-100 text-slate-400"}`}>
              {mainCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            </button>
            
            <button
              onClick={mainOnToggleCart}
              className={`p-1.5 rounded-lg transition flex-shrink-0 ${mainInCart ? isDark ? "bg-red-900/20 text-red-400" : "bg-red-50 text-red-500" : isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-600"}`}
            >
              {mainInCart ? <Minus size={12} /> : <Plus size={12} />}
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3" onClick={e => e.stopPropagation()}>
        {viewMode === "regulation" && article.executiveReg ? (
          isLocked ? (
            <div className="relative">
              <div className="blur-[3px] opacity-60 pointer-events-none select-none">
                <MD text={article.executiveReg.text.split("\n").slice(0, 2).join("\n") + "\n..."} isDark={isDark} isRTL={isRTL} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <button onClick={showPaywall} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B3D2E] text-white text-[11px] font-bold shadow">
                  <Lock size={11} /> {isRTL ? "اشترك للوصول" : "Subscribe to access"}
                </button>
              </div>
            </div>
          ) : (
            <div id={`exec-reg-${article.id}`} className="nzamy-reader-block">
              <MD text={article.executiveReg.text} isDark={isDark} isRTL={isRTL} fontClass={fontClass} />
            </div>
          )
        ) : isRepealed ? (
          viewMode !== "regulation" && (
            <div>
              <button onClick={() => setShowRepealed(!showRepealed)} className={`flex items-center gap-1.5 text-[11px] font-semibold text-red-400 hover:text-red-300`}>
                {showRepealed ? <CaretUp size={11} /> : <CaretDown size={11} />}
                {showRepealed ? (isRTL ? "إخفاء نص المادة الملغاة" : "Hide repealed text") : (isRTL ? "عرض النص الأصلي قبل الإلغاء" : "Show original text before repeal")}
              </button>
              <AnimatePresence>
                {showRepealed && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className={`mt-2 p-3 rounded-xl border text-[12px] leading-relaxed ${isDark ? "border-red-500/20 bg-red-900/10 text-red-200" : "border-red-200 bg-red-50 text-red-800"}`}>
                      <p className="text-[10px] font-bold mb-1 opacity-60">{isRTL ? "النص الأصلي:" : "Original text:"}</p>
                      {article.originalText || article.text}
                      {article.repealedBy && <p className={`text-[10px] mt-2 pt-2 border-t font-semibold ${isDark ? "border-red-500/20 text-red-400" : "border-red-200 text-red-600"}`}>{isRTL ? "ألغيت بـ:" : "Repealed by:"} {article.repealedBy}{article.repealedDate && ` — ${article.repealedDate}`}</p>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        ) : (
          <>
            {viewMode !== "regulation" && (
              isLocked ? (
                <div className="relative">
                  <div className="blur-[3px] opacity-60 pointer-events-none select-none">
                    <MD text={article.text.split("\n").slice(0, 2).join("\n") + "\n..."} isDark={isDark} isRTL={isRTL} />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button onClick={showPaywall} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B3D2E] text-white text-[11px] font-bold shadow">
                      <Lock size={11} /> {isRTL ? "اشترك للوصول" : "Subscribe to access"}
                    </button>
                  </div>
                </div>
              ) : (
                <MD text={article.text} isDark={isDark} isRTL={isRTL} fontClass={fontClass} />
              )
            )}
            
            {/* Executive Reg — always visible */}
            {viewMode !== "law" && article.executiveReg && (
              <div className={`p-3 rounded-xl ${isRTL ? "border-r-2" : "border-l-2"} border-[#C8A762] ${isDark ? "bg-[#C8A762]/5" : "bg-amber-50/60"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <FileText size={12} className={isDark ? "text-[#C8A762]" : "text-amber-700"} weight="duotone" />
                    <p className={`text-[11px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>{article.executiveReg.ref}</p>
                  </div>
                  {/* Copy + Add buttons — hidden in reading mode */}
                  {!isReadingMode && (
                    <div className="flex items-center gap-1 print:hidden">
                      <button onClick={handleCopyReg} title={isRTL ? "نسخ اللائحة" : "Copy regulation"} className={`p-1.5 rounded-lg transition flex-shrink-0 ${isDark ? "hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300" : "hover:bg-amber-100 text-amber-600"}`}>
                        {copiedReg ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      </button>
                      <button
                        onClick={() => regInCart ? onRemoveExecReg(article.id) : (isLocked ? showPaywall() : onAddExecReg(article))}
                        title={regInCart ? (isRTL ? "إزالة من المسودة" : "Remove from draft") : (isRTL ? "إضافة اللائحة للمسودة" : "Add regulation to draft")}
                        className={`p-1.5 rounded-lg transition flex-shrink-0 ${
                          regInCart
                            ? isDark ? "bg-red-900/20 text-red-400" : "bg-red-50 text-red-500"
                            : isDark ? "bg-[#C8A762]/15 text-[#C8A762] hover:bg-[#C8A762]/25" : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        }`}
                      >
                        {regInCart ? <Minus size={12} /> : <Plus size={12} />}
                      </button>
                    </div>
                  )}
                </div>
                <div id={`exec-reg-${article.id}`} className="nzamy-reader-block">
                  <MD text={article.executiveReg.text} isDark={isDark} isRTL={isRTL} fontClass={fontClass} />
                </div>
              </div>
            )}

            {/* Cart additions for this article */}
            {viewMode !== "regulation" && entry && (entry.principles.length > 0 || entry.precedents.length > 0) && (
              <div className={`space-y-1.5 pt-1.5 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                <p className={`text-[10px] font-bold ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{isRTL ? "مضاف للمسودة:" : "Added to draft:"}</p>
                {entry.principles.map(p => (
                  <div key={p.id} className={`flex items-start gap-2 p-2 rounded-lg text-[11px] ${isDark ? "bg-[#C8A762]/5" : "bg-amber-50"}`}>
                    <Scales size={10} className={`mt-0.5 flex-shrink-0 ${isDark ? "text-[#C8A762]" : "text-amber-600"}`} />
                    <span className={isDark ? "text-zinc-400" : "text-zinc-600"}>{p.text}</span>
                  </div>
                ))}
                {entry.precedents.map(pr => (
                  <div key={pr.id} className={`flex items-start gap-2 p-2 rounded-lg text-[11px] ${isDark ? "bg-purple-900/10" : "bg-purple-50"}`}>
                    <Gavel size={10} className={`mt-0.5 flex-shrink-0 ${isDark ? "text-purple-400" : "text-purple-600"}`} />
                    <span className={isDark ? "text-zinc-400" : "text-zinc-600"}>{pr.summary}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Amendments toggle */}
            {viewMode !== "regulation" && isAmended && article.amendments && article.amendments.length > 0 && (
              <div>
                <button onClick={() => setShowAmendments(!showAmendments)} className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg ${isDark ? "bg-amber-900/20 text-amber-400" : "bg-amber-50 text-amber-700"}`}>
                  <ClockCounterClockwise size={11} />
                  {showAmendments ? (isRTL ? "إخفاء الإصدارات السابقة" : "Hide previous versions") : (isRTL ? `الإصدارات السابقة (${article.amendments.length})` : `Previous versions (${article.amendments.length})`)}
                  {showAmendments ? <CaretUp size={10} /> : <CaretDown size={10} />}
                </button>
                <AnimatePresence>
                  {showAmendments && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="mt-2 space-y-2">
                        {article.amendments.map((amend, i) => (
                          <div key={i} className={`p-3 rounded-xl border ${isDark ? "border-amber-700/20 bg-amber-900/10" : "border-amber-200 bg-amber-50/60"}`}>
                            <div className="flex gap-2 mb-1">
                              <span className={`text-[10px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>{amend.source}</span>
                              <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{amend.date}</span>
                            </div>
                            <p className={`text-[11px] mb-2 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{amend.summary}</p>
                            <p className={`text-[12px] leading-relaxed pt-2 border-t ${isDark ? "border-amber-700/20 text-zinc-400" : "border-amber-200 text-zinc-600"}`}>{amend.fullText}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

// DraftDrawer is now imported from @/components/laws/DraftDrawer

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function PreambleBlock({
  text,
  regulationPreamble,
  isDark,
  isRTL = true,
  viewMode = "all",
}: {
  text?: string;
  regulationPreamble?: string;
  isDark: boolean;
  isRTL?: boolean;
  viewMode?: "all" | "law" | "regulation";
}) {
  const [open, setOpen] = useState(false);
  const textStart = isRTL ? "text-right" : "text-left";

  const hasText = viewMode !== "regulation" && text;
  const hasReg = viewMode !== "law" && regulationPreamble;

  if (!hasText && !hasReg) return null;

  // عنوان مرن حسب ما هو متوفر
  const label = isRTL
    ? hasText && hasReg
      ? "ديباجة النظام واللائحة التنفيذية"
      : hasText
      ? "ديباجة النظام والمرسوم الملكي"
      : "ديباجة اللائحة التنفيذية"
    : hasText && hasReg
    ? "Law & Regulation Preamble"
    : hasText
    ? "Law Preamble & Royal Decree"
    : "Regulation Preamble";

  return (
    <div className={`rounded-2xl border overflow-hidden print:hidden ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}>
      <button type="button" onClick={() => setOpen(!open)} className={`w-full flex items-center gap-3 px-4 py-3 transition ${isDark ? "hover:bg-white/[0.03]" : "hover:bg-slate-50"}`}>
        <BookOpen size={14} className="text-[#C8A762] flex-shrink-0" weight="duotone" />
        <span className={`flex-1 ${textStart} text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{label}</span>
        {open ? <CaretUp size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} /> : <CaretDown size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div key="preamble-content" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className={`px-4 pb-4 border-t text-[12px] leading-loose whitespace-pre-wrap ${isDark ? "border-white/[0.05] text-zinc-400" : "border-slate-100 text-slate-600"}`}>
              {hasText && text && <p>{text}</p>}
              {hasText && hasReg && (
                <div className={`my-3 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`} />
              )}
              {hasReg && regulationPreamble && (
                <>
                  {viewMode !== "regulation" && (
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-amber-500/70" : "text-amber-700/70"}`}>
                      {isRTL ? "اللائحة التنفيذية" : "Executive Regulation"}
                    </p>
                  )}
                  <p>{regulationPreamble}</p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Article Explain Modal ───────────────────────────────────────────────────
