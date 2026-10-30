"use client";

/**
 * One block of the book reader's continuous stream (owner note ٠٢).
 *
 * The reader used to draw a single activeBlock; it now draws every block of
 * the stream one under another, each with its own head: the source's locator,
 * the topic, and the two actions the note asks for on EACH block —
 * «نسخ بالتوثيق» and «+ إضافة للمسودة» (the latter only on a block whose text
 * this viewer has, as before). Search terms are coloured with the shared
 * engine (<Hl>, owner note ٠٦) over the topic, the matn, every sharh paragraph
 * and every footnote — plain strings, React nodes, no injected HTML.
 *
 * Memoised: the page re-renders on every scroll step (the index follows the
 * block in view), so a block only re-renders when its own props change —
 * `isActive`, `inDraft` and `copied` are booleans for that reason.
 */

import { memo } from "react";
import { BookmarkSimple, Check, Copy, FileText, ListNumbers, Lock, Plus } from "@phosphor-icons/react";
import { Hl } from "@/components/search/MultiColorHighlight";
import { pageToken, volumeToken } from "./_locator";
import { emptyLayerNote, layerShows, type ReaderBlock, type ReaderLayer } from "./_reader-model";

interface StreamBlockProps {
  block: ReaderBlock;
  isActive: boolean;
  isDark: boolean;
  isRTL: boolean;
  viewLayer: ReaderLayer;
  fontClass: string;
  inDraft: boolean;
  copied: boolean;
  onCopy: (block: ReaderBlock) => void;
  onAddToDraft: (block: ReaderBlock) => void;
}

function StreamBlock({
  block,
  isActive,
  isDark,
  isRTL,
  viewLayer,
  fontClass,
  inDraft,
  copied,
  onCopy,
  onAddToDraft,
}: StreamBlockProps) {
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`;
  const vol = volumeToken(block);
  const page = pageToken(block);
  const layerNote = emptyLayerNote(block, viewLayer, isRTL);

  return (
    <article
      id={`book-block-${block.id}`}
      data-stream-block={block.id}
      aria-current={isActive ? "location" : undefined}
      className={`nzamy-reader-block scroll-mt-28 ${card} ${block.locked ? "p-4 md:p-5" : "p-6 md:p-8"} ${
        isActive ? "ring-1 ring-[#C8A762]/40" : ""
      } break-inside-avoid`}
    >
      {/* Head: the source's locator (each segment only when the source states
          it — a NULL is "no volume", never «null»), the topic, the actions. */}
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-white/[0.05] ${block.locked ? "pb-3 mb-3" : "pb-4 mb-6"}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-black text-amber-600 dark:text-[#C8A762]">
          <FileText size={16} className="shrink-0" />
          {vol && <span>{isRTL ? `المجلد ${vol}` : `Volume ${vol}`}</span>}
          {vol && page && <span className="w-1.5 h-1.5 rounded-full bg-[#C8A762]" />}
          {page && <span>{isRTL ? `الصفحة ${page}` : `Page ${page}`}</span>}
          {block.topic && (
            <span className="min-w-0 truncate text-[11px] font-bold text-slate-500 dark:text-zinc-400">
              <Hl text={block.topic} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 print:hidden">
          <button
            type="button"
            onClick={() => onCopy(block)}
            title={block.locked ? "نسخ مرجع هذا الموضع" : "نسخ نص الموضع (أو الجزء المظلَّل منه) مع التوثيق"}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold border rounded-lg transition ${
              isDark ? "border-white/[0.07] text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            {copied ? "تم النسخ" : block.locked ? "نسخ المرجع" : "نسخ بالتوثيق"}
          </button>
          {/* N2.6: only a block whose text this viewer has goes into the draft. */}
          {!block.locked && (
            <button
              type="button"
              onClick={() => onAddToDraft(block)}
              disabled={inDraft}
              aria-pressed={inDraft}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold border rounded-lg transition disabled:opacity-70 ${
                isDark ? "border-white/[0.07] text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {inDraft ? <Check size={12} /> : <Plus size={12} />}
              {inDraft ? "في المسودة" : "إضافة للمسودة"}
            </button>
          )}
        </div>
      </div>

      {/* Matn */}
      {layerShows(viewLayer, "matn") && block.matn && (
        <div className="mb-6 relative">
          <div className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-black uppercase text-amber-600 dark:text-amber-500 tracking-wider">
            <BookmarkSimple size={10} weight="fill" />
            {isRTL ? "المتن" : "Matn"}
          </div>
          <div className="p-5 bg-amber-500/[0.03] border border-amber-500/10 dark:border-amber-500/20 rounded-2xl">
            <p className={`font-serif text-[#9b6f12] dark:text-[#C8A762] text-center ${fontClass}`}>
              <Hl text={block.matn} />
            </p>
          </div>
        </div>
      )}

      {/* N2.3: a single-layer view of a block with no text in that layer. */}
      {layerNote && (
        <p role="note" className="mb-6 px-4 py-3 rounded-xl border text-xs font-bold text-center border-slate-200 text-slate-600 dark:border-white/[0.07] dark:text-zinc-400">
          {layerNote}
        </p>
      )}

      {/* The paywall is the server's (owner ١٨٣): a locked block carries its
          place and topic, no text — the same notice as before. */}
      {block.locked && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] text-xs font-bold text-amber-700 dark:text-amber-400">
          <Lock size={14} weight="fill" />
          <span>المعاينة المجانية أول صفحتين من الكتاب؛ نص هذا الموضع متاح لمشتركي Pro أو أعلى.</span>
        </div>
      )}

      {/* Sharh */}
      {layerShows(viewLayer, "sharh") && block.sharh && (
        <div className="mb-8 relative">
          <div className="flex items-center gap-1 text-[9px] font-black uppercase text-[#0B3D2E] dark:text-[#C8A762] tracking-wider mb-2.5">
            <FileText size={11} weight="fill" />
            {isRTL ? "الشرح والتعليق" : "Sharh & Commentary"}
          </div>
          <div className={`font-sans text-slate-800 dark:text-zinc-200 text-justify ${fontClass}`}>
            {block.sharh.split("\n").map((para, pi) => (
              <p key={pi} className="mb-4"><Hl text={para} /></p>
            ))}
          </div>
        </div>
      )}

      {/* Hashiyah */}
      {layerShows(viewLayer, "hashiyah") && block.hashiyah.length > 0 && (
        <div className="border-t pt-5 mt-6 border-slate-200 dark:border-white/[0.05]">
          <h4 className="text-xs font-black text-slate-500 dark:text-zinc-400 mb-3 uppercase tracking-wider flex items-center gap-1.5">
            <ListNumbers size={14} />
            {isRTL ? "الحواشي والتعليقات السفلية" : "Footnotes & Annotations"}
          </h4>
          <div className="space-y-3">
            {block.hashiyah.map((h, i) => (
              <div key={i} className="flex gap-2 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
                <span className="font-bold text-[#C8A762]">{i + 1}-</span>
                <p className="flex-1 text-justify"><Hl text={h} /></p>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default memo(StreamBlock);
