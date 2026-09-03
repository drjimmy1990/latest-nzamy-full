"use client";

import { useState, useEffect } from "react";
import {
  Clock, Eye, Share, BookmarkSimple, ArrowRight,
  Newspaper, ChatCircle, SealCheck, Scales, ThumbsUp,
  FacebookLogo, TwitterLogo, WhatsappLogo, ArrowLeft,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import Image from "next/image";
import { markdownBoldToSafeHtml } from "@/utils/sanitize";
import type { PlatformBlogArticle } from "@/constants/platformContent";

// ─── Markdown renderer (lightweight + GFM alerts) ────────────────────────────
const ALERT_TYPES: Record<string, { label: string; cls: string }> = {
  WARNING: { label: "تحذير", cls: "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300" },
  IMPORTANT: { label: "هام", cls: "border-red-400/40 bg-red-400/10 text-red-700 dark:text-red-300" },
  NOTE: { label: "ملاحظة", cls: "border-sky-400/40 bg-sky-400/10 text-sky-700 dark:text-sky-300" },
  TIP: { label: "نصيحة", cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300" },
  CAUTION: { label: "احذر", cls: "border-orange-400/40 bg-orange-400/10 text-orange-700 dark:text-orange-300" },
};

/** Convert heading text to a URL-safe anchor ID (works with Arabic text). */
function slugify(text: string): string {
  return text
    .trim()
    .replace(/[()（）\[\]「」『』【】،,.:;؛!?؟"'`~@#$%^&*+=<>{}|\\\/]/g, "") // strip punctuation
    .replace(/\s+/g, "-") // spaces → hyphens
    .replace(/-{2,}/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

/**
 * The in-article TOC ships hand-generated anchors, and that generator drops
 * Arabic diacritics ("…بمضي 60 يوماً" → "…-60-يوما") while slugify keeps them,
 * so those links land nowhere. Return the diacritic-free variant so the heading
 * can carry it as a second id — additive, so anchors that already match are
 * untouched.
 */
function altAnchor(text: string, id: string): string | null {
  const stripped = slugify(text.replace(/[ً-ْـٰ]/g, ""));
  return stripped && stripped !== id ? stripped : null;
}

interface TocItem { text: string; href: string; }
interface Toc { items: TocItem[]; start: number; end: number; }

/**
 * Every article in the corpus ships its own "## جدول المحتويات (TOC)" list. On
 * desktop we lift it into the sticky sidebar, so the inline copy is hidden
 * there and shown only on mobile (where the sidebar itself is hidden).
 *
 * Returns the parsed links plus the [start, end) line range of the block, so
 * RenderContent can wrap exactly those lines. `end` swallows the closing `---`
 * when present — otherwise desktop would render two rules back to back with
 * nothing between them.
 *
 * Splits with the same `md.trim().split("\n")` RenderContent uses, so the
 * indices line up.
 */
function findToc(md: string): Toc | null {
  const lines = md.trim().split("\n");
  const start = lines.findIndex((l) => /^##\s+.*جدول المحتويات/.test(l));
  if (start === -1) return null;

  const items: TocItem[] = [];
  let end = start + 1;
  for (; end < lines.length; end++) {
    if (lines[end].trim() === "") continue;
    const m = /^\s*[-*]\s+\[([^\]]+)\]\(#([^)]+)\)\s*$/.exec(lines[end]);
    if (!m) break;
    items.push({ text: m[1].trim(), href: m[2].trim() });
  }
  if (/^-{3,}$/.test((lines[end] ?? "").trim())) end++;

  return items.length ? { items, start, end } : null;
}

function RenderContent({ md, isDark, toc }: { md: string; isDark: boolean; toc: Toc | null }) {
  const lines = md.trim().split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  /** Emit an empty anchor carrying the heading's diacritic-free id, when it differs. */
  const pushAltAnchor = (text: string, id: string) => {
    const alt = altAnchor(text, id);
    if (alt) out.push(<span key={key++} id={alt} className="block scroll-mt-24" aria-hidden="true" />);
  };

  while (i < lines.length) {
    // The TOC block, rendered as one unit and hidden on desktop — the sidebar
    // carries it there. Mobile keeps it inline, where it has always been.
    if (toc && i === toc.start) {
      out.push(
        <div key={key++} className="lg:hidden">
          <h2 className={`text-lg font-bold mt-8 mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
            {lines[toc.start].replace(/^##\s+/, "")}
          </h2>
          <ul className="mb-6 space-y-1.5">
            {toc.items.map((t, j) => (
              <li key={j} className="flex items-start gap-2">
                <span className="text-[#C8A762] mt-0.5">•</span>
                <a href={`#${t.href}`} className={`text-sm leading-snug hover:text-[#C8A762] transition ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  {t.text}
                </a>
              </li>
            ))}
          </ul>
        </div>,
      );
      i = toc.end;
      continue;
    }

    const line = lines[i];
    const alertMatch = /^>\s*\[!(WARNING|IMPORTANT|NOTE|TIP|CAUTION)\]/.exec(line);
    if (alertMatch) {
      const type = alertMatch[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const a = ALERT_TYPES[type];
      out.push(
        <div key={key++} className={`rounded-xl border ps-4 pe-3 py-3 my-3 text-sm leading-relaxed ${a.cls}`}>
          <p className="font-bold mb-1 flex items-center gap-1.5"><Scales size={14} weight="fill" /> {a.label}</p>
          {body.map((b, j) => (
            <p key={j} className="mb-1" dangerouslySetInnerHTML={{ __html: markdownBoldToSafeHtml(b) }} />
          ))}
        </div>,
      );
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim())) { out.push(<hr key={key++} className={`my-6 border-t ${isDark ? "border-white/10" : "border-gray-200"}`} />); i++; continue; }

    // Headings (h1, h2, h3) — with id for anchor navigation
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      const text = line.slice(2);
      const id = slugify(text);
      pushAltAnchor(text, id);
      out.push(<h1 key={key++} id={id} className={`text-xl font-bold mt-10 mb-4 scroll-mt-24 ${isDark ? "text-white" : "text-gray-900"}`} dangerouslySetInnerHTML={{ __html: markdownBoldToSafeHtml(text) }} />);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      const text = line.slice(3);
      const id = slugify(text);
      pushAltAnchor(text, id);
      out.push(<h2 key={key++} id={id} className={`text-lg font-bold mt-8 mb-3 scroll-mt-24 ${isDark ? "text-white" : "text-gray-900"}`} dangerouslySetInnerHTML={{ __html: markdownBoldToSafeHtml(text) }} />);
      i++; continue;
    }
    if (line.startsWith("### ")) {
      const text = line.slice(4);
      const id = slugify(text);
      // text-gray-100 is a dark *surface* token in dark mode (globals.css remaps
      // --color-gray-100 to #1c2128), so it rendered near-black on the near-black
      // article card. h1/h2 already use text-white — match them.
      out.push(<h3 key={key++} id={id} className={`text-base font-bold mt-6 mb-2 scroll-mt-24 ${isDark ? "text-white" : "text-gray-800"}`} dangerouslySetInnerHTML={{ __html: markdownBoldToSafeHtml(text) }} />);
      i++; continue;
    }

    // Numbered lists
    if (line.match(/^\d+\. /)) { out.push(<p key={key++} className={`ms-4 mb-1 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`} dangerouslySetInnerHTML={{ __html: markdownBoldToSafeHtml(line) }} />); i++; continue; }

    // Bullet lists (- or *), including indented sub-levels. The corpus nests
    // statutory citations two levels deep ("    *   **المادة (429):** …"); those
    // lines must not fall through to the paragraph branch, which would print the
    // raw "*" marker with no indent.
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const depth = Math.min(2, Math.floor(bullet[1].length / 2));
      const marker = ["•", "◦", "▪"][depth];
      const indent = ["ms-4", "ms-9", "ms-14"][depth];
      out.push(<p key={key++} className={`${indent} mb-1 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`} dangerouslySetInnerHTML={{ __html: `${marker} ` + markdownBoldToSafeHtml(bullet[2]) }} />);
      i++; continue;
    }

    // Blockquotes (not GFM alerts — those are caught above). Consecutive "> "
    // lines are one quote: statutory texts run over several lines wrapped in a
    // single *…* italic pair, so rendering line-by-line left an unpaired "*"
    // printed literally at the start and end of the quote.
    if (line.startsWith("> ")) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      let text = body.join("\n").trim();
      // Drop the wrapping italic markers — the blockquote is already italic.
      if (text.startsWith("*") && text.endsWith("*") && !text.startsWith("**") && !text.endsWith("**")) {
        text = text.slice(1, -1);
      }
      const html = text.split("\n").map((l) => markdownBoldToSafeHtml(l)).join("<br>");
      out.push(<blockquote key={key++} className={`border-s-4 border-[#C8A762] ps-4 my-3 text-sm italic ${isDark ? "text-gray-300" : "text-gray-600"}`} dangerouslySetInnerHTML={{ __html: html }} />);
      continue;
    }

    // Empty lines
    if (line.trim() === "") { out.push(<br key={key++} />); i++; continue; }

    // Default paragraph
    out.push(<p key={key++} className={`text-sm leading-relaxed mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`} dangerouslySetInnerHTML={{ __html: markdownBoldToSafeHtml(line) }} />);
    i++;
  }

  return <div className={`prose prose-sm max-w-none ${isDark ? "prose-invert" : ""}`}>{out}</div>;
}

function formatDate(iso?: string | null, en = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(en ? "en-US" : "ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function ArticleView({
  article,
  related,
}: {
  article: PlatformBlogArticle;
  related: PlatformBlogArticle[];
}) {
  const { isRTL, isDark } = useTheme();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const card = `rounded-2xl border p-6 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const authorUrl = article.author.url || null;
  const toc = findToc(article.content);

  const AuthorCtaLink = () => {
    if (authorUrl) {
      return (
        <a href={authorUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] transition">
          {isRTL ? "احجز استشارة" : "Book Consultation"} <ArrowLeft size={14} className={isRTL ? "rotate-180" : ""} />
        </a>
      );
    }
    return (
      <Link href="/contact" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] transition">
        {isRTL ? "احجز استشارة" : "Book Consultation"} <ArrowLeft size={14} className={isRTL ? "rotate-180" : ""} />
      </Link>
    );
  };

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-10">
        {/* Breadcrumb */}
        <div className={`flex items-center gap-2 text-xs mb-6 ${muted}`}>
          <Link href="/blog" className="hover:text-[#0B3D2E] dark:hover:text-[#C8A762] transition">{isRTL ? "المدونة" : "Blog"}</Link>
          <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
          <span>{isRTL ? article.tag : article.tagEn}</span>
          <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
          <span className="truncate">{isRTL ? article.title.slice(0, 30) : article.titleEn.slice(0, 30)}...</span>
        </div>

        <div className="flex gap-8 items-start">
          {/* ── Article ── */}
          <article className="flex-1 min-w-0">
            {/* Header card */}
            <div className={`${card} mb-6 relative overflow-hidden`}>
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#0B3D2E] via-[#C8A762] to-[#0B3D2E] z-10" />
              {article.cover ? (
                <div className="relative w-full h-56 -mx-6 -mt-6 mb-4">
                  <Image
                    src={article.cover}
                    alt={isRTL ? article.title : article.titleEn}
                    fill
                    sizes="(max-width: 1024px) 100vw, 768px"
                    className="object-cover"
                    priority
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white"}`}>{isRTL ? article.tag : article.tagEn}</span>
                <span className={`text-xs ${muted}`}>{isRTL ? article.date : article.dateEn}</span>
                <span className={`flex items-center gap-1 text-xs ${muted}`}><Clock size={11} />{isRTL ? article.readTime : article.readTimeEn} {isRTL ? "قراءة" : "read"}</span>
                <span className={`flex items-center gap-1 text-xs ${muted}`}><Eye size={11} />{article.views.toLocaleString()}</span>
              </div>
              <h1 className={`text-2xl font-black leading-snug mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>
                {isRTL ? article.title : article.titleEn}
              </h1>

              {/* Author */}
              {authorUrl ? (
                <a href={authorUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 group">
                  <div className="w-10 h-10 rounded-xl bg-[#0B3D2E] flex items-center justify-center text-white text-base font-bold">{(isRTL ? article.author.name : article.author.nameEn).charAt(2)}</div>
                  <div>
                    <p className={`text-sm font-bold group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition flex items-center gap-1.5 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                      {isRTL ? article.author.name : article.author.nameEn} {article.author.credentials ? <SealCheck size={14} color="#C8A762" weight="fill" /> : null}
                    </p>
                    {article.author.credentials ? (
                      <p className={`text-xs ${muted}`}>{article.author.credentials}</p>
                    ) : (
                      <p className={`text-xs ${muted} flex items-center gap-1.5`}>
                        <span>{isRTL ? article.author.specialty : article.author.specialtyEn}</span>
                      </p>
                    )}
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0B3D2E] flex items-center justify-center text-white text-base font-bold">{(isRTL ? article.author.name : article.author.nameEn).charAt(2)}</div>
                  <div>
                    <p className={`text-sm font-bold flex items-center gap-1.5 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                      {isRTL ? article.author.name : article.author.nameEn} {article.author.credentials ? <SealCheck size={14} color="#C8A762" weight="fill" /> : null}
                    </p>
                    <p className={`text-xs ${muted} flex items-center gap-1.5`}>
                      <span>{isRTL ? article.author.specialty : article.author.specialtyEn}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Content */}
            <div className={`${card} mb-6`}>
              <RenderContent md={article.content} isDark={isDark} toc={toc} />
            </div>

            {/* Like + Share + Save */}
            <div className={`${card} mb-6`}>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => setLiked(v => !v)} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition ${liked ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : isDark ? "border-[#2d3748] text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  <ThumbsUp size={16} weight={liked ? "fill" : "regular"} />
                  {article.likes + (liked ? 1 : 0)} {isRTL ? "إعجاب" : "Likes"}
                </button>
                <button onClick={() => setSaved(v => !v)} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition ${saved ? "bg-amber-400/10 text-amber-600 dark:text-amber-400 border-amber-400/30" : isDark ? "border-[#2d3748] text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  <BookmarkSimple size={16} weight={saved ? "fill" : "regular"} />
                  {isRTL ? (saved ? "محفوظ" : "حفظ") : (saved ? "Saved" : "Save")}
                </button>
                <div className={`flex items-center gap-2 ms-auto ${muted}`}>
                  <span className="text-xs">{isRTL ? "شارك:" : "Share:"}</span>
                  {[{ Icon: WhatsappLogo, color: "#25d366" }, { Icon: TwitterLogo, color: "#1da1f2" }, { Icon: FacebookLogo, color: "#1877f2" }].map(({ Icon, color }, i) => (
                    <button key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${isDark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}>
                      <Icon size={17} color={color} weight="fill" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Author CTA */}
            <div className={`rounded-2xl border p-6 flex flex-col sm:flex-row gap-5 items-start ${isDark ? "bg-[#0B3D2E]/15 border-[#0B3D2E]/30" : "bg-[#0B3D2E]/5 border-[#0B3D2E]/20"}`}>
              <div className="w-14 h-14 rounded-2xl bg-[#0B3D2E] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                {(isRTL ? article.author.name : article.author.nameEn).charAt(2)}
              </div>
              <div className="flex-1">
                <p className={`font-bold mb-1 flex items-center gap-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
                  {isRTL ? article.author.name : article.author.nameEn} <SealCheck size={15} color="#C8A762" weight="fill" />
                </p>
                <p className={`text-sm mb-3 ${muted}`}>
                  {article.author.credentials || (isRTL ? `محامٍ متخصص في ${article.author.specialty}` : `Specialized in ${article.author.specialtyEn}`)}
                </p>
                <AuthorCtaLink />
              </div>
            </div>
          </article>

          {/* ── Sidebar ── */}
          {/* top-24 (96px), not top-6: the site nav is `fixed` and 82px tall, so a
              24px offset parked the card's header underneath it while scrolling.
              Same 6rem the headings use for scroll-mt. max-h keeps the column
              inside the viewport on short laptop screens instead of clipping the
              related-articles card off the bottom. */}
          <aside className="hidden lg:flex flex-col gap-5 w-64 shrink-0 sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
            {/* Table of contents — the article's own list, lifted out of the body.
                Overflow is handled by the <aside>, so a long TOC scrolls the whole
                column rather than nesting a second scrollbar inside this card. */}
            {toc && (
              <div className={`rounded-2xl border p-5 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${muted}`}>{isRTL ? "جدول المحتويات" : "Contents"}</p>
                <nav className="space-y-2">
                  {toc.items.map((t, i) => (
                    <a key={i} href={`#${t.href}`} className="flex items-start gap-2 group">
                      <span className="text-[#C8A762] text-xs mt-px flex-shrink-0">•</span>
                      <span className={`text-xs leading-snug group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition ${isDark ? "text-gray-300" : "text-gray-700"}`}>{t.text}</span>
                    </a>
                  ))}
                </nav>
              </div>
            )}

            {/* Related */}
            <div className={`rounded-2xl border p-5 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
              <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${muted}`}>{isRTL ? "مقالات ذات صلة" : "Related Articles"}</p>
              <div className="space-y-3">
                {related.map((r, i) => (
                  <Link key={i} href={`/blog/${r.slug}`} className="flex items-start gap-3 group">
                    <div className="w-8 h-8 rounded-lg bg-[#0B3D2E]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Newspaper size={14} color="#0B3D2E" weight="duotone" />
                    </div>
                    <div>
                      <p className={`text-xs font-medium leading-snug group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition ${isDark ? "text-gray-300" : "text-gray-700"}`}>{isRTL ? r.title : r.titleEn}</p>
                      <p className={`text-xs mt-0.5 ${muted}`}>{isRTL ? r.readTime : r.readTimeEn} {isRTL ? "قراءة" : "read"}</p>
                    </div>
                  </Link>
                ))}
                {related.length === 0 && (
                  <p className={`text-xs ${muted}`}>{isRTL ? "لا توجد مقالات ذات صلة." : "No related articles."}</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export { formatDate };