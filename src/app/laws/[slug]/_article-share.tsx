"use client";

/**
 * «مشاركة المادة» (owner package 25-Nov §2.5, batch l16, B-12): a small share
 * button in the article's header, beside «نسخ». It opens a small sheet with
 *   - «مشاركة كصورة (قصاصة نظامي)»: a PNG card (royal green, the law's name,
 *     the article's label, its text — cut with «…» when long — the wordmark
 *     and nezamy.sa), previewed first, then shared through the system share
 *     sheet where the browser can share files, else downloaded;
 *   - «نسخ رابط المادة المباشر»: the page link with the article's anchor;
 *   - the link to WhatsApp, X and LinkedIn (those take a link, not an image).
 *
 * The card is drawn on a canvas with the page's own Arabic fonts (read from
 * the --font-cairo / --font-ibm-plex-sans-arabic variables next/font sets, and
 * loaded before drawing): canvas fillText shapes each whole line as the page
 * does, so the letters join correctly. No new dependency (_share-card.ts).
 *
 * The image is offered only for text this reader may read (`canImage`: never
 * a locked or repealed article) — the caller decides; the link is for everyone.
 * Two steps (preview, then «مشاركة» or «تنزيل»): building the card waits for
 * fonts, and a browser allows the share sheet only from a fresh click.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, DownloadSimple, LinkSimple, ShareNetwork, X } from "@phosphor-icons/react";
import { stripMarkdownMarks } from "@/lib/text/stripMarkdownMarks";
import {
  articleShareUrl, clampLines, shareCardFileName, shareCardText, wrapText,
  SHARE_CARD_HEIGHT as H, SHARE_CARD_WIDTH as W,
} from "./_share-card";

const ROYAL = "#0B3D2E";
const ROYAL_DEEP = "#072a20";
const GOLD = "#C8A762";
const PAPER = "#F4EFE3";
const PAD = 84;

function fontVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function drawShareCard(input: { lawName: string; articleLabel: string; text: string }): Promise<Blob> {
  const brand = fontVar("--font-cairo", "Cairo, sans-serif");
  const body = fontVar("--font-ibm-plex-sans-arabic", brand);
  const sample = "نظامي المادة";
  await Promise.all([
    document.fonts?.load(`700 46px ${brand}`, sample),
    document.fonts?.load(`400 36px ${body}`, sample),
  ]).catch(() => undefined);
  const logo = await loadImage("/brand/nezamy-wordmark.png");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.setAttribute("dir", "rtl");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.direction = "rtl";
  ctx.textBaseline = "alphabetic";

  // Background and frame.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, ROYAL);
  bg.addColorStop(1, ROYAL_DEEP);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(200,167,98,0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, W - 72, H - 72);

  const right = W - PAD;
  const maxWidth = W - 2 * PAD;

  // Wordmark (right) and «قصاصة نظامي» (left).
  let y = 80;
  if (logo && logo.naturalWidth > 0) {
    const h = 110;
    const w = (logo.naturalWidth / logo.naturalHeight) * h;
    ctx.drawImage(logo, right - w, y, w, h);
  }
  ctx.fillStyle = GOLD;
  ctx.font = `700 30px ${brand}`;
  ctx.textAlign = "left";
  ctx.fillText("قصاصة نظامي", PAD, y + 70);
  y += 110 + 80;

  // The law's name (two lines at most).
  ctx.textAlign = "right";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 46px ${brand}`;
  const measureTitle = (s: string) => ctx.measureText(s).width;
  const title = clampLines(wrapText(input.lawName, maxWidth, measureTitle), 2, maxWidth, measureTitle).lines;
  for (const line of title) {
    ctx.fillText(line, right, y);
    y += 66;
  }

  // The article's label in a gold pill.
  if (input.articleLabel) {
    ctx.font = `700 34px ${brand}`;
    const lw = Math.min(ctx.measureText(input.articleLabel).width + 48, maxWidth);
    const top = y - 10;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(right - lw, top, lw, 62, 18);
    else ctx.rect(right - lw, top, lw, 62);
    ctx.fill();
    ctx.fillStyle = ROYAL;
    ctx.fillText(input.articleLabel, right - 24, top + 43, lw - 48);
    y = top + 62 + 56;
  }

  // Divider.
  ctx.strokeStyle = "rgba(200,167,98,0.35)";
  ctx.beginPath();
  ctx.moveTo(PAD, y - 20);
  ctx.lineTo(right, y - 20);
  ctx.stroke();
  y += 36;

  // The text, cut with «…» to the room left above the footer.
  const footerTop = H - 190;
  const lineHeight = 62;
  ctx.font = `400 36px ${body}`;
  ctx.fillStyle = PAPER;
  const measureBody = (s: string) => ctx.measureText(s).width;
  const maxLines = Math.max(1, Math.floor((footerTop - y) / lineHeight));
  const { lines } = clampLines(wrapText(input.text, maxWidth, measureBody), maxLines, maxWidth, measureBody);
  for (const line of lines) {
    if (line === "") {
      y += lineHeight / 2;
      continue;
    }
    ctx.fillText(line, right, y);
    y += lineHeight;
  }

  // Footer: the library on the right, the address on the left.
  ctx.strokeStyle = "rgba(200,167,98,0.35)";
  ctx.beginPath();
  ctx.moveTo(PAD, footerTop + 40);
  ctx.lineTo(right, footerTop + 40);
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `600 28px ${brand}`;
  ctx.fillText("المكتبة القانونية — نظامي", right, H - 96);
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = GOLD;
  ctx.font = `700 34px ${brand}`;
  ctx.fillText("nezamy.sa", PAD, H - 96);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
}

type Card = { url: string; file: File; canShareFile: boolean };

export function ArticleShareButton({
  articleId, lawName, articleLabel, text, canImage, isDark,
}: {
  articleId: string;
  lawName: string;
  /** «المادة الأولى» — how the card names the article. */
  articleLabel: string;
  /** The article's text as stored (Markdown allowed); used only when `canImage`. */
  text: string;
  /** May this reader get the text as an image? Never for a locked or repealed article. */
  canImage: boolean;
  isDark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = () => (typeof window === "undefined" ? "" : articleShareUrl(window.location.origin, window.location.pathname, articleId));

  // l16 review: the image's object URL is released on close, on a rebuild and
  // when the card unmounts with the menu still open (the page navigates away).
  const cardUrlRef = useRef<string | null>(null);
  useEffect(() => {
    cardUrlRef.current = card?.url ?? null;
  }, [card]);
  useEffect(() => () => {
    if (cardUrlRef.current) URL.revokeObjectURL(cardUrlRef.current);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setCard((c) => {
      if (c) URL.revokeObjectURL(c.url);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function copyLink() {
    setError(null);
    try {
      await navigator.clipboard.writeText(link());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("تعذّر النسخ في هذا المتصفح — انسخ الرابط من شريط العنوان.");
    }
  }

  async function buildCard() {
    if (!canImage || building) return;
    setBuilding(true);
    setError(null);
    try {
      const blob = await drawShareCard({ lawName, articleLabel, text: shareCardText(text, stripMarkdownMarks) });
      const file = new File([blob], shareCardFileName(lawName, articleLabel), { type: "image/png" });
      const canShareFile = typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
      const url = URL.createObjectURL(blob);
      setCard((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, file, canShareFile };
      });
    } catch {
      setError("تعذّر تجهيز الصورة في هذا المتصفح.");
    } finally {
      setBuilding(false);
    }
  }

  async function shareCard() {
    if (!card) return;
    try {
      await navigator.share({ files: [card.file], title: `${lawName} — ${articleLabel}`, text: link() });
    } catch {
      // Cancelled by the reader, or refused: the download stays offered.
    }
  }

  function downloadCard() {
    if (!card) return;
    const a = document.createElement("a");
    a.href = card.url;
    a.download = card.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const shareText = encodeURIComponent(`${lawName} — ${articleLabel}`);
  const item = `flex w-full items-center gap-2 min-h-11 rounded-xl px-3 text-[13px] font-bold transition ${isDark ? "text-zinc-200 hover:bg-white/[0.06]" : "text-slate-700 hover:bg-slate-100"}`;
  const pill = `inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl px-4 text-[13px] font-bold transition`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="مشاركة المادة"
        title="مشاركة المادة"
        className={`min-w-11 min-h-11 inline-flex items-center justify-center p-2 rounded-lg transition flex-shrink-0 ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}
      >
        <ShareNetwork size={12} />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[70]" dir="rtl" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="مشاركة المادة"
            className={`absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-2xl border p-4 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl ${isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-slate-200"}`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>مشاركة {articleLabel}</p>
              <button type="button" onClick={close} aria-label="إغلاق" className={`min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}>
                <X size={16} />
              </button>
            </div>

            {card ? (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview, not a page image */}
                <img src={card.url} alt={`قصاصة نظامي: ${lawName} — ${articleLabel}`} className="mx-auto w-full max-w-[300px] rounded-xl border border-black/10" />
                <div className="flex flex-wrap justify-center gap-2">
                  {card.canShareFile && (
                    <button type="button" onClick={() => void shareCard()} className={`${pill} text-white`} style={{ background: ROYAL }}>
                      <ShareNetwork size={14} /> مشاركة الصورة
                    </button>
                  )}
                  <button type="button" onClick={downloadCard} className={`${pill} border ${isDark ? "border-white/15 text-zinc-200" : "border-slate-200 text-slate-700"}`}>
                    <DownloadSimple size={14} /> تنزيل الصورة
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {canImage && (
                  <button type="button" onClick={() => void buildCard()} disabled={building} className={`${item} disabled:opacity-60`}>
                    <ShareNetwork size={14} className="text-[#C8A762]" />
                    {building ? "جارٍ تجهيز الصورة…" : "مشاركة كصورة (قصاصة نظامي)"}
                  </button>
                )}
                <button type="button" onClick={() => void copyLink()} className={item}>
                  {copied ? <Check size={14} className="text-emerald-500" /> : <LinkSimple size={14} className="text-[#C8A762]" />}
                  {copied ? "نُسخ رابط المادة" : "نسخ رابط المادة المباشر"}
                </button>
                <div className={`flex flex-wrap gap-2 pt-2 text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                  <a className="inline-flex items-center min-h-11 px-2 underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${shareText}%20${encodeURIComponent(link())}`}>واتساب</a>
                  <a className="inline-flex items-center min-h-11 px-2 underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer" href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(link())}`}>إكس</a>
                  <a className="inline-flex items-center min-h-11 px-2 underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link())}`}>لينكدإن</a>
                </div>
              </div>
            )}
            {error && <p role="alert" className={`mt-2 text-[12px] ${isDark ? "text-red-400" : "text-red-600"}`}>{error}</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
