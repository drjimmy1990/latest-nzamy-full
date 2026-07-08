"use client";

import { useState, useEffect, use } from "react";
import { motion } from "framer-motion";
import {
  Clock, Eye, Share, BookmarkSimple, CheckCircle, ArrowRight,
  Newspaper, ChatCircle, Star, SealCheck, Scales, ThumbsUp,
  FacebookLogo, TwitterLogo, WhatsappLogo, ArrowLeft,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { markdownBoldToSafeHtml } from "@/utils/sanitize";
import {
  getPlatformBlogArticle,
  getRelatedPlatformBlogArticles,
  PLATFORM_BLOG_CATEGORIES,
} from "@/constants/platformContent";
import type { PlatformBlogArticle } from "@/constants/platformContent";

// ─── DB row → PlatformBlogArticle mapping ────────────────────────────────────
interface BlogRow {
  id?: string;
  slug: string;
  title: string;
  title_en?: string | null;
  excerpt?: string | null;
  excerpt_en?: string | null;
  body?: string | null;
  category?: string | null;
  author_name?: string | null;
  cover?: string | null;
  read_time?: string | null;
  views?: number | null;
  likes?: number | null;
  featured?: boolean | null;
  published_at?: string | null;
}

function formatDate(iso?: string | null, en = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(en ? "en-US" : "ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

function rowToDetail(row: BlogRow): PlatformBlogArticle {
  const cat = PLATFORM_BLOG_CATEGORIES.find((c) => c.id === row.category);
  const authorName = row.author_name || "فريق المحتوى";
  return {
    id: row.id || row.slug,
    slug: row.slug,
    category: row.category || "news",
    tag: cat?.label || "أخبار قانونية",
    tagEn: cat?.labelEn || "Legal News",
    title: row.title,
    titleEn: row.title_en || row.title,
    excerpt: row.excerpt || "",
    excerptEn: row.excerpt_en || row.excerpt || "",
    author: {
      name: authorName,
      nameEn: authorName,
      slug: "",
      specialty: "قانوني",
      specialtyEn: "Legal",
      rating: 5,
      reviewCount: 0,
    },
    date: formatDate(row.published_at),
    dateEn: formatDate(row.published_at, true),
    publishedDate: row.published_at || "",
    readTime: row.read_time || "٥ دقائق",
    readTimeEn: row.read_time || "5 min",
    views: row.views ?? 0,
    likes: row.likes ?? 0,
    featured: Boolean(row.featured),
    status: "published",
    seoScore: 0,
    source: "backend-ready",
    content: row.body || "",
  };
}

// Simple Markdown renderer (lightweight)
function RenderContent({ md, isDark }: { md: string; isDark: boolean }) {
  const lines = md.trim().split("\n");
  return (
    <div className={`prose prose-sm max-w-none ${isDark ? "prose-invert" : ""}`}>
      {lines.map((line, i) => {
        if (line.startsWith("## ")) return <h2 key={i} className={`text-lg font-bold mt-8 mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} className={`text-base font-bold mt-6 mb-2 ${isDark ? "text-gray-100" : "text-gray-800"}`}>{line.slice(4)}</h3>;
        if (line.match(/^\d+\. /)) return <p key={i} className={`ms-4 mb-1 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>{line}</p>;
        if (line.startsWith("- ")) return <p key={i} className={`ms-4 mb-1 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>• {line.slice(2)}</p>;
        if (line.startsWith("> ")) return <blockquote key={i} className={`border-s-4 border-[#C8A762] ps-4 my-1 text-sm italic ${isDark ? "text-gray-300" : "text-gray-600"}`}>{line.slice(2)}</blockquote>;
        if (line.trim() === "") return <br key={i} />;
        // Bold **text**
        const boldParsed = markdownBoldToSafeHtml(line);
        return <p key={i} className={`text-sm leading-relaxed mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`} dangerouslySetInnerHTML={{ __html: boldParsed }} />;
      })}
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { isRTL, isDark } = useTheme();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dbArticle, setDbArticle] = useState<PlatformBlogArticle | null>(null);
  const [dbRelated, setDbRelated] = useState<PlatformBlogArticle[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // One published article by slug.
        const res = await fetch(`/api/v1/blog/${encodeURIComponent(slug)}`, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { data?: BlogRow | null };
          if (active && json?.data) setDbArticle(rowToDetail(json.data));
        }
        // Related: fetch the list, filter to same category (or any), exclude self.
        const listRes = await fetch("/api/v1/blog", { cache: "no-store" });
        if (listRes.ok) {
          const listJson = (await listRes.json()) as { data?: BlogRow[] };
          const rows = Array.isArray(listJson.data) ? listJson.data : [];
          if (active && rows.length > 0) setDbRelated(rows.map(rowToDetail));
        }
      } catch {
        // keep fallback
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [slug]);

  if (!mounted) return null;

  // Prefer the DB-backed article; fall back to the static catalog.
  const article = dbArticle ?? getPlatformBlogArticle(slug);
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const card = `rounded-2xl border p-6 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;

  if (!article) {
    // Still fetching — don't flash the not-found state for DB-only slugs.
    if (!loaded) {
      return (
        <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
          <Navbar />
          <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-20 text-center">
            <div className={`${card} animate-pulse`}>
              <Newspaper size={40} className="mx-auto mb-4 text-[#C8A762]" weight="duotone" />
              <p className={`text-sm ${muted}`}>{isRTL ? "جارٍ التحميل..." : "Loading..."}</p>
            </div>
          </div>
          <Footer />
                  </div>
      );
    }
    return (
      <div className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>
        <Navbar />
        <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-20 text-center">
          <div className={`${card}`}>
            <Newspaper size={40} className="mx-auto mb-4 text-[#C8A762]" weight="duotone" />
            <h1 className={`text-2xl font-black mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "المقال غير موجود" : "Article not found"}
            </h1>
            <p className={`text-sm mb-6 ${muted}`}>
              {isRTL ? "هذا الرابط لا يطابق أي مقال منشور في كتالوج محتوى المنصة." : "This URL does not match a published platform article."}
            </p>
            <Link href="/blog" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-sm font-bold">
              {isRTL ? "العودة للمدونة" : "Back to blog"}
            </Link>
          </div>
        </div>
        <Footer />
              </div>
    );
  }

  // Related: prefer DB list (same category first, then any), else static catalog.
  const related: PlatformBlogArticle[] = dbRelated
    ? [
        ...dbRelated.filter((r) => r.slug !== article.slug && r.category === article.category),
        ...dbRelated.filter((r) => r.slug !== article.slug && r.category !== article.category),
      ].slice(0, 3)
    : getRelatedPlatformBlogArticles(article.slug, 3);

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
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#0B3D2E] via-[#C8A762] to-[#0B3D2E]" />
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
              <Link href={`/lawyers/${article.author.slug}`} className="flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-[#0B3D2E] flex items-center justify-center text-white text-base font-bold">{(isRTL ? article.author.name : article.author.nameEn).charAt(2)}</div>
                <div>
                  <p className={`text-sm font-bold group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition flex items-center gap-1.5 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                    {isRTL ? article.author.name : article.author.nameEn} <SealCheck size={14} color="#C8A762" weight="fill" />
                  </p>
                  <p className={`text-xs ${muted} flex items-center gap-1.5`}>
                    <span>{isRTL ? article.author.specialty : article.author.specialtyEn}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Star size={11} color="#C8A762" weight="fill" />
                      {article.author.rating} ({article.author.reviewCount})
                    </span>
                  </p>
                </div>
              </Link>
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
                <p className={`text-sm mb-3 ${muted}`}>{isRTL ? `محامٍ متخصص في ${article.author.specialty}` : `Specialized in ${article.author.specialtyEn}`}</p>
                <Link href={`/lawyers/${article.author.slug}`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] transition">
                  {isRTL ? "احجز استشارة" : "Book Consultation"} <ArrowLeft size={14} className={isRTL ? "rotate-180" : ""} />
                </Link>
              </div>
            </div>
          </article>

          {/* ── Sidebar ── */}
          <aside className="hidden lg:flex flex-col gap-5 w-64 shrink-0 sticky top-6">
            {/* Key points */}
            <div className={`rounded-2xl border p-5 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
              <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${muted}`}>{isRTL ? "النقاط الرئيسية" : "Key Points"}</p>
              <ul className="space-y-2">
                {["مكافأة نهاية الخدمة مكفولة", "عبء الإثبات على صاحب العمل", "التقاضي خلال ٣٦٥ يوماً", "مكتب العمل أول خطوة"].map((p, i) => (
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
                  <Link key={i} href={`/blog/${r.slug}`} className={`flex items-start gap-3 group`}>
                    <div className="w-8 h-8 rounded-lg bg-[#0B3D2E]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Newspaper size={14} color="#0B3D2E" weight="duotone" />
                    </div>
                    <div>
                      <p className={`text-xs font-medium leading-snug group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition ${isDark ? "text-gray-300" : "text-gray-700"}`}>{isRTL ? r.title : r.titleEn}</p>
                      <p className={`text-xs mt-0.5 ${muted}`}>{isRTL ? r.readTime : r.readTimeEn} {isRTL ? "قراءة" : "read"}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
          </div>
  );
}
