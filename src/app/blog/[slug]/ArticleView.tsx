"use client";

import { useState, useEffect } from "react";
import {
  Clock, Eye, Share, BookmarkSimple, CheckCircle, ArrowRight,
  Newspaper, ChatCircle, Star, SealCheck, Scales, ThumbsUp,
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

function RenderContent({ md, isDark }: { md: string; isDark: boolean }) {
  const lines = md.trim().split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
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

    if (line.startsWith("## ")) { out.push(<h2 key={key++} className={`text-lg font-bold mt-8 mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>{line.slice(3)}</h2>); i++; continue; }
    if (line.startsWith("### ")) { out.push(<h3 key={key++} className={`text-base font-bold mt-6 mb-2 ${isDark ? "text-gray-100" : "text-gray-800"}`}>{line.slice(4)}</h3>); i++; continue; }
    if (line.match(/^\d+\. /)) { out.push(<p key={key++} className={`ms-4 mb-1 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>{line}</p>); i++; continue; }
    if (line.startsWith("- ")) { out.push(<p key={key++} className={`ms-4 mb-1 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>• {line.slice(2)}</p>); i++; continue; }
    if (line.startsWith("> ")) { out.push(<blockquote key={key++} className={`border-s-4 border-[#C8A762] ps-4 my-1 text-sm italic ${isDark ? "text-gray-300" : "text-gray-600"}`}>{line.slice(2)}</blockquote>); i++; continue; }
    if (line.trim() === "") { out.push(<br key={key++} />); i++; continue; }
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
  const keyPoints = Array.isArray(article.aeo_pairs) && article.aeo_pairs.length
    ? article.aeo_pairs.map((p) => p.question)
    : ["مكافأة نهاية الخدمة مكفولة", "عبء الإثبات على صاحب العمل", "التقاضي خلال ٣٦٥ يوماً", "مكتب العمل أول خطوة"];

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
                      {isRTL ? article.author.name : article.author.nameEn} <SealCheck size={14} color="#C8A762" weight="fill" />
                    </p>
                    {article.author.credentials ? (
                      <p className={`text-xs ${muted}`}>{article.author.credentials}</p>
                    ) : (
                      <p className={`text-xs ${muted} flex items-center gap-1.5`}>
                        <span>{isRTL ? article.author.specialty : article.author.specialtyEn}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1"><Star size={11} color="#C8A762" weight="fill" />{article.author.rating} ({article.author.reviewCount})</span>
                      </p>
                    )}
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0B3D2E] flex items-center justify-center text-white text-base font-bold">{(isRTL ? article.author.name : article.author.nameEn).charAt(2)}</div>
                  <div>
                    <p className={`text-sm font-bold flex items-center gap-1.5 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                      {isRTL ? article.author.name : article.author.nameEn} <SealCheck size={14} color="#C8A762" weight="fill" />
                    </p>
                    <p className={`text-xs ${muted} flex items-center gap-1.5`}>
                      <span>{isRTL ? article.author.specialty : article.author.specialtyEn}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1"><Star size={11} color="#C8A762" weight="fill" />{article.author.rating} ({article.author.reviewCount})</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Content */}
            <div className={`${card} mb-6`}>
              <RenderContent md={article.content} isDark={isDark} />
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
          <aside className="hidden lg:flex flex-col gap-5 w-64 shrink-0 sticky top-6">
            {/* Key points */}
            <div className={`rounded-2xl border p-5 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
              <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${muted}`}>{isRTL ? "النقاط الرئيسية" : "Key Points"}</p>
              <ul className="space-y-2">
                {keyPoints.map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle size={14} color="#22c55e" weight="fill" className="mt-0.5 flex-shrink-0" />
                    <span className={`text-xs ${isDark ? "text-gray-300" : "text-gray-700"}`}>{p}</span>
                  </li>
                ))}
              </ul>
            </div>

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