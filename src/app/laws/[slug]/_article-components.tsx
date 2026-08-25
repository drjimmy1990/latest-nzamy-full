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
import { buildCitation } from "./_citation";
import { useSubscription } from "@/hooks/useSubscription";

interface ParseBlock {
  type: "paragraph" | "details" | "heading" | "blockquote" | "separator" | "list-item" | "num-list-item";
  text?: string;
  summary?: string;
  content?: string;
  level?: number; // للعناوين: 2=##, 3=###, 4=####
}

function parseMarkdownContent(text: string): ParseBlock[] {
  const blocks: ParseBlock[] = [];
  const lines = text.split("\n");
  
  let inDetails = false;
  let currentSummary = "";
  let currentContentLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed.includes("<details>") || trimmed.includes("<details ")) {
      inDetails = true;
      currentSummary = "";
      currentContentLines = [];
      continue;
    }
    
    if (inDetails) {
      if (trimmed.includes("</details>")) {
        inDetails = false;
        blocks.push({
          type: "details",
          summary: currentSummary || "الإصدارات السابقة",
          content: currentContentLines.join("\n")
        });
        continue;
      }
      
      if (trimmed.startsWith("<summary>") && trimmed.includes("</summary>")) {
        currentSummary = trimmed.replace("<summary>", "").replace("</summary>", "");
        continue;
      } else if (trimmed.startsWith("<summary>")) {
        currentSummary = trimmed.replace("<summary>", "");
        continue;
      }
      
      let contentLine = line;
      if (trimmed.startsWith(">")) {
        const postGt = line.substring(line.indexOf(">") + 1);
        contentLine = postGt.startsWith(" ") ? postGt.substring(1) : postGt;
      }
      currentContentLines.push(contentLine);
    } else {
      // ─── فحص الجداول (Table detection) ───
      if (trimmed.startsWith("|") && i + 1 < lines.length && lines[i+1].trim().startsWith("|") && lines[i+1].includes("-")) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          tableLines.push(lines[i].trim());
          i++;
        }
        i--; // العودة خطوة للخلف
        blocks.push({
          type: "table" as any,
          content: tableLines.join("\n")
        });
        continue;
      }

      // ─── Headings: ###, ##, ####
      const headingMatch = trimmed.match(/^(#{2,4})\s+(.+)$/);
      if (headingMatch) {
        blocks.push({ type: "heading", text: headingMatch[2], level: headingMatch[1].length });
        continue;
      }

      // ─── Horizontal separator: --- or *** or * * *
      if (/^(\*\*\*|---|\* \* \*)$/.test(trimmed)) {
        blocks.push({ type: "separator" });
        continue;
      }

      // ─── Blockquote: > text (used for regulation articles)
      if (trimmed.startsWith("> ") || trimmed === ">") {
        const bqText = trimmed.replace(/^>\s?/, "");
        blocks.push({ type: "blockquote", text: bqText });
        continue;
      }

      // ─── Unordered list items: - text or • text
      if (/^[-•]\s+/.test(trimmed)) {
        blocks.push({ type: "list-item", text: trimmed.replace(/^[-•]\s+/, "") });
        continue;
      }

      // ─── Ordered (numbered) list items: 1. text or ١. text
      if (/^\d+\.\s+/.test(trimmed) || /^[١-٩]\.\s+/.test(trimmed)) {
        blocks.push({ type: "num-list-item", text: trimmed.replace(/^\d+\.\s+|^[١-٩]\.\s+/, "") });
        continue;
      }

      // ─── Regular paragraph
      blocks.push({
        type: "paragraph",
        text: line
      });
    }
  }
  
  return blocks;
}

function renderMarkdownTableToHtml(tableMd: string): string {
  const lines = tableMd.split("\n");
  if (lines.length < 2) return "";
  
  const parseRow = (rowStr: string): string[] => {
    const clean = rowStr.replace(/^\|/, "").replace(/\|$/, "").trim();
    return clean.split("|").map(cell => cell.trim());
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow);

  let html = "<thead class='bg-slate-50 dark:bg-zinc-900/60'>";
  html += "<tr>";
  headers.forEach(h => {
    html += `<th class='px-4 py-3 text-right font-black tracking-wider text-[11px] opacity-90'>${markdownBoldToSafeHtml(h)}</th>`;
  });
  html += "</tr></thead>";

  html += "<tbody class='divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-950/20'>";
  rows.forEach((row) => {
    html += `<tr class='hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors'>`;
    row.forEach(cell => {
      html += `<td class='px-4 py-2.5 leading-relaxed whitespace-pre-wrap break-words'>${markdownBoldToSafeHtml(cell)}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody>";

  return html;
}

export function MD({ text, isDark, isRTL = true, fontClass = "text-[13px]" }: { text: string; isDark: boolean; isRTL?: boolean; fontClass?: string }) {
  const muted = isDark ? "text-zinc-300" : "text-zinc-700";
  const listIndent = isRTL ? "pr-4" : "pl-4";
  
  const blocks = useMemo(() => parseMarkdownContent(text), [text]);
  
  return (
    <div className="space-y-1.5 w-full">
      {blocks.map((block, index) => {
        if (block.type === "details") {
          return (
            <details
              key={index}
              className={`my-3 rounded-xl border transition-all ${
                isDark
                  ? "border-amber-900/35 bg-amber-950/10 text-amber-200"
                  : "border-amber-100 bg-amber-50/50 text-amber-900"
              }`}
            >
              <summary className="px-4 py-2.5 font-black cursor-pointer hover:underline text-[12px] flex items-center gap-1.5 select-none">
                <ClockCounterClockwise size={12} className={isDark ? "text-amber-400" : "text-amber-600"} />
                <span>{block.summary}</span>
              </summary>
              <div className="px-4 pb-3 pt-1.5 border-t border-dashed border-amber-200/20 text-[12px] leading-relaxed">
                <MD text={block.content || ""} isDark={isDark} isRTL={isRTL} fontClass={fontClass} />
              </div>
            </details>
          );
         }

        // ─── Table
        if (block.type === ("table" as any)) {
          const tableHtml = renderMarkdownTableToHtml(block.content || "");
          return (
            <div key={index} className="overflow-x-auto my-4 rounded-xl border border-slate-200/60 dark:border-zinc-800 shadow-sm max-w-full">
              <table 
                className={`min-w-full divide-y ${isDark ? "divide-zinc-800 text-zinc-300" : "divide-slate-200 text-slate-700"} text-xs text-right`}
                dangerouslySetInnerHTML={{ __html: tableHtml }}
              />
            </div>
          );
        }

        // ─── Heading
        if (block.type === "heading") {
          const headingStyles: Record<number, string> = {
            2: "text-[15px] font-black mt-4 mb-2",
            3: "text-[13px] font-black mt-3 mb-1",
            4: "text-[12px] font-bold mt-2 mb-1",
          };
          const cls = headingStyles[block.level ?? 3] ?? "text-[13px] font-bold";
          const html = markdownBoldToSafeHtml(block.text || "");
          return (
            <p key={index} className={`${cls} ${isDark ? "text-zinc-100" : "text-zinc-800"}`}
               dangerouslySetInnerHTML={{ __html: html }} />
          );
        }

        // ─── Separator
        if (block.type === "separator") {
          return (
            <div key={index} className={`my-2 border-t ${isDark ? "border-white/[0.08]" : "border-slate-200"}`} />
          );
        }

        // ─── Blockquote (مواد اللائحة في وضع "عرض الكل")
        if (block.type === "blockquote") {
          if (!block.text) return <div key={index} className="h-1" />;
          const html = markdownBoldToSafeHtml(block.text);
          return (
            <p key={index}
               className={`${fontClass} leading-relaxed ${listIndent} border-r-2 pr-3 border-[#C8A762]/40 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}
               dangerouslySetInnerHTML={{ __html: html }} />
          );
        }

        // ─── Unordered list item
        if (block.type === "list-item") {
          const html = markdownBoldToSafeHtml(block.text || "");
          return (
            <div key={index} className={`flex gap-2 ${listIndent}`}>
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDark ? "bg-zinc-500" : "bg-slate-400"}`} />
              <p className={`${fontClass} leading-relaxed ${muted}`} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          );
        }

        // ─── Ordered list item
        if (block.type === "num-list-item") {
          const html = markdownBoldToSafeHtml(block.text || "");
          return (
            <div key={index} className={`flex gap-2 ${listIndent}`}>
              <p className={`${fontClass} leading-relaxed ${muted}`} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          );
        }
        
        const line = block.text || "";
        const html = markdownBoldToSafeHtml(line);
        
        if (line.startsWith("أ-") || line.startsWith("ب-") || line.startsWith("ج-") ||
            line.startsWith("د-") || line.startsWith("هـ-")) {
          return <p key={index} className={`${fontClass} leading-relaxed ${listIndent} ${muted}`} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        
        if (line.trim() === "") return <div key={index} className="h-1" />;
        
        return <p key={index} className={`${fontClass} leading-relaxed ${muted}`} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}

import { type CartEntry } from "@/components/laws/DraftDrawer";

// Mobile Safari/Chrome collapse the native text selection on touchstart as
// soon as the user taps something outside the selected range — i.e. right
// before the copy button's onClick fires. We keep a short-lived cache of the
// last non-empty selection (updated on every `selectionchange`, never
// cleared on collapse) so the tap that triggers the copy still sees it.
let lastSelectionCache: { text: string; node: Node; at: number } | null = null;
const LAST_SELECTION_TTL_MS = 15000;

if (typeof document !== "undefined") {
  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const text = selection.toString().trim();
    if (!text) return; // a collapse — leave the previous cache intact
    lastSelectionCache = { text, node: selection.getRangeAt(0).commonAncestorContainer, at: Date.now() };
  });
}

function getSelectedTextWithin(containerId: string, fallbackText?: string): string {
  if (typeof window === "undefined") return "";
  const container = document.getElementById(containerId);
  if (!container) return "";

  const liveSelection = window.getSelection();
  const liveText = liveSelection && liveSelection.rangeCount > 0 ? liveSelection.toString().trim() : "";

  const candidate = liveText
    ? { text: liveText, node: liveSelection!.getRangeAt(0).commonAncestorContainer }
    : lastSelectionCache && Date.now() - lastSelectionCache.at < LAST_SELECTION_TTL_MS
      ? lastSelectionCache
      : null;

  if (!candidate || !candidate.text) return "";

  if (fallbackText && fallbackText.replace(/\s+/g, "").includes(candidate.text.replace(/\s+/g, ""))) {
    return candidate.text;
  }
  if (container.contains(candidate.node)) {
    return candidate.text;
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
          <button onClick={handleCopy} className={`p-2 rounded-lg transition ${isDark ? "hover:bg-white/[0.06] text-zinc-600" : "hover:bg-slate-200 text-slate-400"}`}>
            {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
          </button>
          <button onClick={locked ? onLock : onToggle} className={`p-2 rounded-lg transition ${inCart ? isDark ? "bg-red-900/20 text-red-400" : "bg-red-50 text-red-500" : isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-600"}`}>
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
          <button onClick={handleCopy} className={`p-2 rounded-lg transition ${isDark ? "hover:bg-white/[0.06] text-zinc-600" : "hover:bg-slate-200 text-slate-400"}`}>
            {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
          </button>
          <button onClick={locked ? onLock : onToggle} className={`p-2 rounded-lg transition ${inCart ? isDark ? "bg-red-900/20 text-red-400" : "bg-red-50 text-red-500" : isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-600"}`}>
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
export function ArticleBlock({ article, lawName, lawType, isDark, entry, onAddArticle, onRemoveArticle, onAddExecReg, onRemoveExecReg, onActive, isActive, showPaywall, onExplain, isRTL = true, fontClass = "text-[13px]", isReadingMode = false, viewMode = "all" }: {
  article: LawArticle; lawName: string;
  /** The document's own kind, straight from `library.laws.type`. */
  lawType?: string;
  isDark: boolean;
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
  const [showExecReg,    setShowExecReg]    = useState(false);
  const [copied, setCopied]                 = useState(false);
  const [copiedReg, setCopiedReg]           = useState(false);
  const isRepealed  = article.status === "repealed";
  const isAmended   = article.status === "amended";
    const { can }     = useSubscription();
  const hasLibraryAccess = can("library-full-access");
  const isLocked    = !article.free && !hasLibraryAccess;
  /**
   * For a repealed article the substantive content lives in `originalText` —
   * `text` is legitimately empty, because the live article no longer exists.
   * Measured on the corpus: 1,613 of 1,862 repealed articles are in exactly
   * that shape, and only 9 carry neither.
   */
  const repealedText = article.originalText || article.text || "";
  const inCart      = !!entry && entry.isArticleAdded;
  const regInCart   = !!entry && entry.isExecRegAdded;

  const handleCopy = useCallback(() => {
    if (isLocked) { showPaywall(); return; }
    // A repealed article's substance is its pre-repeal wording; `text` is empty.
    const body = isRepealed ? repealedText : article.text;
    const selectedText = getSelectedTextWithin(article.id, body);
    const plainText = selectedText || body;

    // Built by _citation.ts rather than inline: the old template called every
    // document a "نظام" (true of 526 of 1,532) and wrapped page markers as if
    // they were articles (6,566 articles carry one).
    const citation = buildCitation(
      {
        docTitle: lawName,
        docType: lawType,
        numberText: article.numberText,
        displayNum: article.num,
        status: article.status,
      },
      isRTL,
    );

    const plain = `${citation.plain}\n“${stripMd(plainText)}”`;
    const html  = `${citation.html}<br>“${md2html(plainText)}”`;
    copyRich(html, plain);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }, [article, isLocked, isRepealed, repealedText, showPaywall, lawName, lawType, isRTL]);

  const handleCopyReg = useCallback(() => {
    if (isLocked) { showPaywall(); return; }
    if (!article.executiveReg) return;
    const selectedText = getSelectedTextWithin(`exec-reg-${article.id}`, article.executiveReg.text);
    const plainText = selectedText || article.executiveReg.text;

    const citation = buildCitation(
      {
        docTitle: lawName,
        docType: lawType,
        regulationRef: article.executiveReg.ref,
      },
      isRTL,
    );

    const plain = `${citation.plain}\n“${stripMd(plainText)}”`;
    const html  = `${citation.html}<br>“${md2html(plainText)}”`;
    copyRich(html, plain);
    setCopiedReg(true); setTimeout(() => setCopiedReg(false), 1800);
  }, [article, isLocked, showPaywall, lawName, lawType, isRTL]);




  const mainBadgeText = viewMode === "regulation" && article.executiveReg ? article.executiveReg.ref : article.num;

  // ── لون Badge حسب الحالة ──────────────────────────────────────────────────
  const mainBadgeStyle = viewMode === "regulation" && article.executiveReg
    ? "bg-[#C8A762] text-[#0B3D2E] font-black"
    : isRepealed
      ? isDark
        ? "bg-red-900/40 text-red-400 border border-red-700/40 line-through"
        : "bg-red-50 text-red-600 border border-red-200 line-through"
      : isAmended
        ? isDark
          ? "bg-amber-900/40 text-amber-300 border border-amber-700/40"
          : "bg-amber-50 text-amber-700 border border-amber-300"
        : isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white";

  // ── لون Header الكارد حسب الحالة ─────────────────────────────────────────
  const cardHeaderBg = isRepealed
    ? isDark ? "border-white/[0.04] bg-red-950/30" : "border-red-100 bg-red-50/60"
    : isAmended
      ? isDark ? "border-white/[0.04] bg-amber-950/20" : "border-amber-100 bg-amber-50/40"
      : isDark ? "border-white/[0.05] bg-zinc-800/50" : "border-slate-100 bg-slate-50/80";

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
  // ── حدود الكارد الكاملة حسب الحالة + الـ active + الـ cart ────────────────
  const cardBorder = isActive
    ? isDark ? "border-[#C8A762]/50" : "border-amber-400"
    : isRepealed
      ? isDark ? "border-red-900/40" : "border-red-200"
      : isAmended
        ? isDark ? "border-amber-900/40" : "border-amber-200"
        : mainCartBorder
          ? isDark ? "border-[#C8A762]/25" : "border-amber-200"
          : isDark ? "border-white/[0.07]" : "border-slate-200";

  return (
    <motion.div
      layout id={article.id}
      onClick={() => onActive(article.id)}
      className={`nzamy-reader-block rounded-2xl border shadow-sm overflow-hidden cursor-pointer transition-colors
        ${isDark ? "bg-zinc-900" : "bg-white"}
        ${isRepealed ? (isDark ? "border-r-2 border-r-red-800" : "border-r-2 border-r-red-400") : ""}
        ${isAmended  ? (isDark ? "border-r-2 border-r-amber-700" : "border-r-2 border-r-amber-400") : ""}
        ${cardBorder}`}
    >
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${cardHeaderBg}`}
           onClick={e => e.stopPropagation()}>

        <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg flex-shrink-0 ${mainBadgeStyle}`}>
          {mainBadgeText}
        </span>
        <p className={`flex-1 text-[12px] font-bold truncate ${
          isRepealed
            ? "line-through text-red-500 dark:text-red-400"
            : isAmended
              ? isDark ? "text-amber-200" : "text-amber-800"
              : isDark ? "text-zinc-200" : "text-zinc-700"
        }`}>
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

        {isRepealed && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500 border border-red-500/25 flex-shrink-0">
            🚫 {isRTL ? "ملغاة" : "Repealed"}
          </span>
        )}
        {isAmended && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-400/25 flex-shrink-0">
            ✏️ {isRTL ? "معدَّلة" : "Amended"}
          </span>
        )}
        {isLocked   && <Lock size={12} className={`flex-shrink-0 ${isDark ? "text-zinc-600" : "text-slate-400"}`} />}

        {!isReadingMode && (
          <div className="flex items-center gap-1.5 print:hidden">
            {showExplainBtn && (
              <button onClick={() => onExplain(article)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition text-[10px] font-bold flex-shrink-0 ${isDark ? "bg-[#C8A762]/10 text-[#C8A762] hover:bg-[#C8A762]/20" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>
                <Sparkle size={12} weight="duotone" />
                {isRTL ? "اشرح لي" : "Explain"}
              </button>
            )}

            <button onClick={mainOnCopy} className={`p-2 rounded-lg transition flex-shrink-0 ${isDark ? "hover:bg-white/[0.06] text-zinc-500" : "hover:bg-slate-100 text-slate-400"}`}>
              {mainCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            </button>
            
            <button
              onClick={mainOnToggleCart}
              className={`p-2 rounded-lg transition flex-shrink-0 ${mainInCart ? isDark ? "bg-red-900/20 text-red-400" : "bg-red-50 text-red-500" : isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-600"}`}
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
        ) : (
          /*
           * One shared branch for every non-regulation view. The repealed case
           * used to be a sibling alternative to this whole fragment, which meant
           * a repealed article could never reach the amendments block, the
           * executive-regulation box, or the draft-cart list below — 87 repealed
           * articles carry executive-regulation text that was unreachable. Only
           * the BODY differs by status now; everything after it is common.
           */
          <>
            {viewMode !== "regulation" && (
              isRepealed ? (
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
                          {/*
                           * This is paid content like any other article body.
                           * It was previously rendered ungated and as bare JSX,
                           * so markdown showed as literal asterisks and the
                           * server-side truncation was the only thing standing
                           * between an anonymous reader and the full text.
                           */}
                          {!repealedText ? (
                            <p className="text-[11px] italic opacity-70">
                              {isRTL ? "المصدر لا يورد نص المادة قبل الإلغاء." : "The source does not carry this article's text prior to repeal."}
                            </p>
                          ) : isLocked ? (
                            <div className="relative">
                              <div className="blur-[3px] opacity-60 pointer-events-none select-none">
                                <MD text={repealedText.split("\n").slice(0, 2).join("\n") + "\n..."} isDark={isDark} isRTL={isRTL} />
                              </div>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <button onClick={showPaywall} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B3D2E] text-white text-[11px] font-bold shadow">
                                  <Lock size={11} /> {isRTL ? "اشترك للوصول" : "Subscribe to access"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <MD text={repealedText} isDark={isDark} isRTL={isRTL} fontClass={fontClass} />
                          )}
                          {article.repealedBy && <p className={`text-[10px] mt-2 pt-2 border-t font-semibold ${isDark ? "border-red-500/20 text-red-400" : "border-red-200 text-red-600"}`}>{isRTL ? "ألغيت بـ:" : "Repealed by:"} {article.repealedBy}{article.repealedDate && ` — ${article.repealedDate}`}</p>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : isLocked ? (
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

            {/*
              Amendments toggle (collapsible <details> block, matches the layout/style of parsed details blocks).

              Still gated on isAmended even though repealed articles can now
              reach this point. The parser pushes every recovered history entry
              into `amendments` AND promotes one of them to `originalText`;
              measured, all 1,613 repealed articles that have an originalText
              have it duplicated by an amendment fullText. Showing both would
              print the same superseded text twice on every one of them.
            */}
            {viewMode !== "regulation" && isAmended && article.amendments && article.amendments.length > 0 && (
              <details
                className={`my-3 rounded-xl border transition-all ${
                  isDark
                    ? "border-amber-900/35 bg-amber-950/10 text-amber-200"
                    : "border-amber-100 bg-amber-50/50 text-amber-900"
                }`}
              >
                <summary className="px-4 py-2.5 font-black cursor-pointer hover:underline text-[12px] flex items-center gap-1.5 select-none">
                  <ClockCounterClockwise size={12} className={isDark ? "text-amber-400" : "text-amber-600"} />
                  <span>{isRTL ? `الإصدارات السابقة (${article.amendments.length})` : `Previous versions (${article.amendments.length})`}</span>
                </summary>
                <div className="px-4 pb-3 pt-2 border-t border-dashed border-amber-200/20 text-[12px] leading-relaxed space-y-2">
                  {article.amendments.map((amend, i) => (
                    <div key={i} className={`p-3 rounded-xl border ${isDark ? "border-amber-700/10 bg-amber-900/5" : "border-amber-200 bg-amber-50/60"}`}>
                      <div className="flex gap-2 mb-1">
                        <span className={`text-[10px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>{amend.source}</span>
                        <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{amend.date}</span>
                      </div>
                      <p className={`text-[11px] mb-2 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{amend.summary}</p>
                      <p className={`text-[12px] leading-relaxed pt-2 border-t ${isDark ? "border-amber-700/15 text-zinc-400" : "border-amber-200 text-zinc-600"}`}>{amend.fullText}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
            
            {/* Executive Reg — Statically displayed as a shaded box (NOT COLLAPSIBLE) */}
            {viewMode !== "law" && article.executiveReg && (
              <div className={`rounded-xl border ${isRTL ? "border-r-4" : "border-l-4"} border-[#C8A762]/60 ${isDark ? "bg-[#C8A762]/5 border-r-[#C8A762]/70" : "bg-slate-50 border-r-[#0B3D2E]/40 border-l-slate-200 border-y-slate-200"} p-4 mt-3 space-y-2`}>
                <div className="flex items-center gap-1.5 pb-2 border-b border-dashed border-zinc-200/20">
                  <FileText size={14} className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} weight="duotone" />
                  <span className={`text-[12px] font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                    {article.executiveReg.ref}
                  </span>
                  {!isReadingMode && (
                    <div className="flex gap-1.5 ms-auto print:hidden">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopyReg(); }}
                        title={isRTL ? "نسخ اللائحة" : "Copy regulation"}
                        className={`p-2 rounded-lg transition ${isDark ? "hover:bg-white/[0.06] text-zinc-500" : "hover:bg-slate-200 text-slate-600"}`}
                      >
                        {copiedReg ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); regInCart ? onRemoveExecReg(article.id) : (isLocked ? showPaywall() : onAddExecReg(article)); }}
                        title={regInCart ? (isRTL ? "إزالة من المسودة" : "Remove from draft") : (isRTL ? "إضافة للمسودة" : "Add to draft")}
                        className={`p-2 rounded-lg transition ${
                          regInCart
                            ? isDark ? "bg-red-900/20 text-red-400" : "bg-red-50 text-red-500"
                            : isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {regInCart ? <Minus size={11} /> : <Plus size={11} />}
                      </button>
                    </div>
                  )}
                </div>
                <div id={`exec-reg-${article.id}`} className="nzamy-reader-block pt-1">
                  <MD text={article.executiveReg.text} isDark={isDark} isRTL={isRTL} fontClass={fontClass} />
                </div>
              </div>
            )}

            {/*
              Historic executive-regulation text found inside the article's
              history block. Real content, but a previous version of the
              REGULATION rather than of the article — so it is kept out of both
              the live text and the amendments list. 16 articles carry it; the
              API only emits it to readers who are not paywalled.
            */}
            {viewMode !== "regulation" && article.historicRegulationText && (
              <details className={`my-3 rounded-xl border ${isDark ? "border-white/[0.07] bg-white/[0.02] text-zinc-300" : "border-slate-200 bg-slate-50/70 text-slate-700"}`}>
                <summary className="px-4 py-2.5 font-black cursor-pointer hover:underline text-[12px] flex items-center gap-1.5 select-none">
                  <ClockCounterClockwise size={12} className={isDark ? "text-zinc-400" : "text-slate-500"} />
                  <span>{isRTL ? "نص لائحي تاريخي" : "Historic regulation text"}</span>
                </summary>
                <div className="px-4 pb-3 pt-2 border-t border-dashed border-slate-300/20">
                  <MD text={article.historicRegulationText} isDark={isDark} isRTL={isRTL} fontClass={fontClass} />
                </div>
              </details>
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
          </>
        )}
      </div>
    </motion.div>
  );
}

// DraftDrawer is now imported from @/components/laws/DraftDrawer

// ─── Main Page ─────────────────────────────────────────────────────────────────

function isPreambleEmpty(txt?: string): boolean {
  if (!txt) return true;
  const clean = txt
    .replace(/<details>[\s\S]*?<\/summary>/gi, "")
    .replace(/<\/details>/gi, "")
    .replace(/لم تتوفر ديباجة/gi, "")
    .replace(/لا توجد ديباجة/gi, "")
    .trim();
  return clean.length === 0;
}

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

  const hasText = viewMode !== "regulation" && text && !isPreambleEmpty(text);
  const hasReg = viewMode !== "law" && regulationPreamble && !isPreambleEmpty(regulationPreamble);

  if (!hasText && !hasReg) return null;

  const label = isRTL ? "الديباجة" : "Preamble";

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
