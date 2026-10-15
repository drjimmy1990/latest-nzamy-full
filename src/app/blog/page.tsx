"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  MagnifyingGlass, Newspaper, Clock, Eye, Tag, Rss, Warning, ArrowClockwise,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import Image from "next/image";
import { BLOG_FALLBACK_AUTHOR } from "@/constants/platformContent";
import { BLOG_CATEGORY_FALLBACK, blogCategoryLabel, groupCategoryPills, type CategoryPill } from "./_categories";

// No static catalog. A hardcoded ARTICLES list (six articles by three named
// lawyers who never wrote them, with view counts) rendered whenever the read
// failed or came back empty — a blog nobody wrote, shown as this one. A failed
// read now says so, and an empty blog is empty.

const PAGE_SIZE = 24;

// ─── DB row → card item mapping ──────────────────────────────────────────────
interface Article {
  id: number | string;
  slug: string;
  category: string;
  tag: string;
  tagEn: string;
  title: string;
  titleEn: string;
  excerpt: string;
  excerptEn: string;
  cover?: string | null;
  author: string;
  authorSlug: string;
  authorEn: string;
  date: string;
  dateEn: string;
  readTime: string;
  readTimeEn: string;
  views: number;
  featured: boolean;
}

interface BlogRow {
  id?: string;
  slug: string;
  title: string;
  title_en?: string | null;
  excerpt?: string | null;
  excerpt_en?: string | null;
  category?: string | null;
  author_name?: string | null;
  cover?: string | null;
  read_time?: string | null;
  views?: number | null;
  featured?: boolean | null;
  published_at?: string | null;
}

function formatPublished(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "short" });
  } catch {
    return "";
  }
}

/**
 * `read_time` is a text column, but the seeded corpus stores the frontmatter's
 * numeric `reading_time` (minutes) in it — a bare "6" rendered as "6 قراءة".
 * Give a bare number its unit; pass any already-worded value through unchanged.
 */
function formatReadTime(value: string | null | undefined, en: boolean): string {
  const raw = (value ?? "").trim();
  if (!raw) return en ? "5 min" : "٥ دقائق";
  if (!/^\d+$/.test(raw)) return raw;
  return en ? `${raw} min` : `${raw} دقائق`;
}

/** First letter of a name, past an «أ.»/«د.»/«م.» title. */
function initialOf(name: string): string {
  return name.replace(/^(?:أ\.|د\.|م\.)\s*/, "").trim().charAt(0) || "ن";
}

function rowToArticle(row: BlogRow, index: number): Article {
  // An article with no author_name is the platform's own — never a made-up
  // lawyer (this alternated «أ. أحمد الغامدي» / «أ. سارة العتيبي» by row index).
  const author = (row.author_name || "").trim() || BLOG_FALLBACK_AUTHOR;
  const cat = (row.category || "").trim();
  // Raw `sec_*` section codes are never printed — see ./_categories.ts.
  const tag = blogCategoryLabel(cat) ?? BLOG_CATEGORY_FALLBACK;
  const dateStr = formatPublished(row.published_at);
  return {
    id: (index + 1) as Article["id"],
    slug: row.slug,
    category: cat,
    tag,
    tagEn: tag,
    title: row.title,
    titleEn: row.title_en || row.title,
    excerpt: row.excerpt || "",
    excerptEn: row.excerpt_en || row.excerpt || "",
    cover: row.cover || null,
    author,
    authorSlug: "",
    authorEn: author,
    date: dateStr,
    dateEn: dateStr,
    readTime: formatReadTime(row.read_time, false),
    readTimeEn: formatReadTime(row.read_time, true),
    views: row.views ?? 0,
    featured: Boolean(row.featured),
  };
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function BlogPage() {
  const { isRTL, isDark } = useTheme();
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  // True when the last list request did not come back. Not the same as an
  // empty blog, and never answered with a stand-in catalog.
  const [loadFailed, setLoadFailed] = useState(false);
  const [dbCategories, setDbCategories] = useState<{ category: string; count: number }[]>([]);
  const offsetRef = useRef(0);

  useEffect(() => setMounted(true), []);

  // Distinct categories (with counts) drive the pills — real taxonomy, not a
  // hardcoded list.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v1/blog/categories", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { category: string; count: number }[]; degraded?: boolean };
        // A capped tally prints wrong counts — no pills rather than wrong ones.
        if (Array.isArray(json.data) && !json.degraded) setDbCategories(json.data);
      } catch {
        /* only «الكل» */
      }
    })();
  }, []);

  // Fetch one page. reset=true replaces the list (mount / new search or category);
  // reset=false appends (load more). Search + category are server-side.
  const fetchPage = useCallback(async (reset: boolean, query: string, values: string[]) => {
    const base = reset ? 0 : offsetRef.current;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(base) });
      if (query.trim()) params.set("q", query.trim());
      for (const v of values) params.append("category", v);
      const res = await fetch(`/api/v1/blog?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) { setLoadFailed(true); return; }
      const json = (await res.json()) as { data?: BlogRow[]; total?: number; hasMore?: boolean };
      const rows = Array.isArray(json.data) ? json.data : [];
      const mapped = rows.map((row, i) => rowToArticle(row, base + i));
      offsetRef.current = base + mapped.length;
      setItems((prev) => (reset ? mapped : [...prev, ...mapped]));
      setTotal(json.total ?? mapped.length);
      setHasMore(Boolean(json.hasMore));
      setLoadFailed(false);
    } catch {
      // Keep whatever is already loaded, and say the request failed.
      setLoadFailed(true);
    } finally {
      setLoadingMore(false);
      setInitialLoading(false);
    }
  }, []);

  // Category pills from the real taxonomy, one per label: a topic stored both
  // as its Arabic label and as its section code is one pill, and filters on
  // both values (./_categories.ts).
  const categoryPills: CategoryPill[] = groupCategoryPills(dbCategories);
  const activePill = categoryPills.find((p) => p.id === category);
  const categoryValues = activePill ? activePill.values : [];
  const categoryKey = categoryValues.join("\u0001");

  // Initial load, and a refetch when search (debounced) or category changes.
  useEffect(() => {
    const values = categoryKey ? categoryKey.split("\u0001") : [];
    const t = setTimeout(() => { void fetchPage(true, search, values); }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, categoryKey, fetchPage]);

  if (!mounted) return null;

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const card = `rounded-[2rem] border overflow-hidden backdrop-blur-xl shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)] ${isDark ? "bg-[#161b22]/80 border-white/[0.06]" : "bg-white/80 border-slate-200/50"}`;

  const source: Article[] = items;
  const featured = source.filter(a => a.featured);
  // The featured strip only shows on the unfiltered first view; anywhere else a
  // featured article belongs in the grid (a search used to hide it entirely).
  const showFeatured = category === "all" && search === "" && featured.length > 0;
  // Search + category are both server-side now; only the featured/grid split is client.
  const filtered = source.filter(a => !showFeatured || !a.featured);

  const allCount = dbCategories.reduce((s, c) => s + c.count, 0);
  const pills: { id: string; label: string; count?: number }[] = [
    { id: "all", label: isRTL ? "الكل" : "All", count: dbCategories.length > 0 ? allCount : undefined },
    ...categoryPills.map(c => ({ id: c.id, label: c.label, count: c.count })),
  ];

  const ArticleCard = ({ article, big = false }: { article: Article; big?: boolean }) => (
    <Link href={`/blog/${article.slug}`} className={`group ${card} flex flex-col hover:border-[#0B3D2E]/30 transition-colors`}>
      {/* Cover image (Supabase Storage) with gradient fallback */}
      <div className={`w-full ${big ? "h-52" : "h-36"} flex items-center justify-center relative ${article.cover ? "bg-[#0B3D2E]" : "bg-gradient-to-br from-[#0B3D2E]/10 via-[#C8A762]/10 to-[#0B3D2E]/5"}`}>
        {article.cover ? (
          <Image
            src={article.cover}
            alt={isRTL ? article.title : article.titleEn}
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            className="object-cover"
          />
        ) : (
          <Newspaper size={big ? 40 : 28} color="#C8A762" weight="duotone" className="opacity-40" />
        )}
        <div className="absolute top-3 start-3 z-10">
          <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white"}`}>
            {isRTL ? article.tag : article.tagEn}
          </span>
        </div>
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h2 className={`font-bold leading-snug mb-2 group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762] transition tracking-tight ${big ? "text-xl" : "text-sm"} ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
          {isRTL ? article.title : article.titleEn}
        </h2>
        <p className={`text-xs leading-relaxed mb-4 flex-1 ${muted}`}>
          {(isRTL ? article.excerpt : article.excerptEn).slice(0, big ? 150 : 90)}...
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#0B3D2E] flex items-center justify-center text-white text-xs font-bold">
              {initialOf(isRTL ? article.author : article.authorEn)}
            </div>
            <span className={`text-xs ${muted}`}>{isRTL ? article.author : article.authorEn}</span>
          </div>
          <div className={`flex items-center gap-2 text-xs ${muted}`}>
            <span className="flex items-center gap-1"><Clock size={11} />{isRTL ? article.readTime : article.readTimeEn}</span>
            <span className="flex items-center gap-1"><Eye size={11} />{article.views.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </Link>
  );

  return (
    <div className={`min-h-[100dvh] flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-[#f9fafb] text-zinc-900"}`} dir={isRTL ? "rtl" : "ltr"} suppressHydrationWarning>
      <Navbar />

      {/* pt-32 clears the fixed z-50 Navbar — same convention as /laws. */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 pt-32 pb-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className={`text-4xl font-black tracking-tight mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
              {isRTL ? "المدونة القانونية" : "Legal Blog"}
            </h1>
            <p className={`text-[13.5px] leading-relaxed ${muted}`}>
              {/* Not «بقلم محامين متخصصين»: the articles are written by the
                  platform's consultants, and each one names its own author. */}
              {isRTL ? "مقالات قانونية معمّقة في الأنظمة السعودية" : "In-depth articles on Saudi regulations"}
            </p>
          </div>
          <button className={`flex items-center gap-2 px-5 py-3 rounded-2xl border text-sm font-semibold transition-all backdrop-blur-sm ${isDark ? "bg-[#161b22]/60 border-white/[0.06] text-zinc-300 hover:bg-white/5" : "bg-white/80 border-slate-200/60 text-slate-600 hover:bg-slate-50 shadow-sm"}`}>
            <Rss size={15} color="#C8A762" /> {isRTL ? "اشترك بـ RSS" : "Subscribe RSS"}
          </button>
        </div>

        {/* Featured */}
        {showFeatured && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-8 h-1 bg-[#C8A762] rounded-full inline-block" />
              <span className={`text-[11px] uppercase tracking-widest font-black ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{isRTL ? "مقالات مميزة" : "Featured Articles"}</span>
            </div>
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-5`}>
              {featured.map(a => <ArticleCard key={a.slug} article={a} big />)}
            </div>
          </motion.div>
        )}

        {/* Search + Categories */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className={`flex-1 flex items-center gap-2 rounded-2xl border px-4 backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-[#0B3D2E]/20 ${isDark ? "bg-[#161b22]/60 border-white/[0.06]" : "bg-white/80 border-slate-200/60 shadow-sm"}`}>
            <MagnifyingGlass size={18} className={muted} weight="duotone" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isRTL ? "ابحث في المقالات..." : "Search articles..."} className={`flex-1 py-3.5 text-sm bg-transparent outline-none ${isDark ? "text-white placeholder-zinc-500" : "text-slate-900 placeholder-slate-400"}`} />
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mb-6">
          {pills.map(cat => (
            <button key={cat.id} onClick={() => setCategory(cat.id)} className={`flex-shrink-0 flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-[13px] font-semibold border backdrop-blur-sm transition-all active:scale-[0.97] whitespace-nowrap ${category === cat.id ? "bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-md" : `${muted} bg-white/60 dark:bg-[#161b22]/60 border-slate-200/60 dark:border-white/[0.06] hover:border-[#0B3D2E]/30`}`}>
              <Tag size={15} weight={category === cat.id ? "fill" : "regular"} />
              {cat.label}
              {typeof cat.count === "number" && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${category === cat.id ? "bg-white/20" : isDark ? "bg-white/10" : "bg-black/5"}`}>{cat.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Articles grid */}
        {initialLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`${card} animate-pulse`}>
                <div className={`w-full h-36 ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} />
                <div className="p-5 space-y-3">
                  <div className={`h-4 rounded-full w-3/4 ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
                  <div className={`h-3 rounded-full w-full ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} />
                  <div className={`h-3 rounded-full w-2/3 ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} />
                  <div className="flex justify-between pt-2">
                    <div className={`h-3 rounded-full w-20 ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} />
                    <div className={`h-3 rounded-full w-16 ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : loadFailed && items.length === 0 ? (
          <div className={`rounded-[2rem] border p-16 text-center backdrop-blur-sm min-h-[300px] flex flex-col items-center justify-center ${isDark ? "bg-[#161b22]/80 border-white/[0.06]" : "bg-white/80 border-slate-200/50 shadow-sm"}`}>
            <Warning size={36} weight="fill" className="text-amber-500 mb-4" />
            <p className={`text-lg font-black tracking-tight mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{isRTL ? "تعذّر تحميل المقالات" : "Could not load articles"}</p>
            <p className={`text-sm mb-6 ${muted}`}>{isRTL ? "هذه ليست مدونة فارغة — لم نتمكّن من القراءة." : "This is not an empty blog — the read failed."}</p>
            <button
              type="button"
              onClick={() => void fetchPage(true, search, categoryValues)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl hover:bg-[#0a3328] transition"
            >
              <ArrowClockwise size={14} weight="bold" /> {isRTL ? "إعادة المحاولة" : "Retry"}
            </button>
          </div>
        ) : filtered.length === 0 && !showFeatured ? (
          <div className={`rounded-[2rem] border p-16 text-center backdrop-blur-sm min-h-[300px] flex flex-col items-center justify-center ${isDark ? "bg-[#161b22]/80 border-white/[0.06]" : "bg-white/80 border-slate-200/50 shadow-sm"}`}>
            <div className="w-20 h-20 rounded-3xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-5 dark:bg-zinc-800 dark:border-white/10">
              <Newspaper size={36} color="#C8A762" weight="duotone" />
            </div>
            <p className={`text-lg font-black tracking-tight mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{isRTL ? "لم يُعثر على مقالات" : "No articles found"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((a, i) => (
              <motion.div key={a.slug} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i % PAGE_SIZE) * 0.05 }}>
                <ArticleCard article={a} />
              </motion.div>
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="flex flex-col items-center gap-2 mt-8">
            {loadFailed && (
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {isRTL ? "تعذّر تحميل المزيد — أعد المحاولة." : "Could not load more — try again."}
              </span>
            )}
            <button
              onClick={() => void fetchPage(false, search, categoryValues)}
              disabled={loadingMore}
              className="px-8 py-3 rounded-2xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328] disabled:opacity-50 transition-all shadow-[0_4px_14px_0_rgba(11,61,46,0.25)] active:scale-[0.98]"
            >
              {loadingMore ? (isRTL ? "جارٍ التحميل…" : "Loading…") : (isRTL ? "تحميل المزيد" : "Load more")}
            </button>
            <span className={`text-xs ${muted}`}>
              {isRTL ? `عُرض ${items.length} من ${total}` : `Showing ${items.length} of ${total}`}
            </span>
          </div>
        )}

        {/* Newsletter */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className={`mt-12 rounded-[2rem] border p-10 text-center backdrop-blur-xl shadow-lg relative overflow-hidden ${isDark ? "bg-[#0B3D2E]/20 border-[#0B3D2E]/40" : "bg-[#0B3D2E]/[0.03] border-[#0B3D2E]/20"}`}>
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-[#C8A762]/10 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-[#0B3D2E]/10 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mx-auto mb-5 dark:bg-[#161b22] dark:border-white/10 relative z-10">
            <Newspaper size={28} color="#C8A762" weight="duotone" />
          </div>
          <h3 className={`text-2xl font-black tracking-tight mb-2 relative z-10 ${isDark ? "text-white" : "text-zinc-900"}`}>{isRTL ? "اشترك في النشرة القانونية" : "Subscribe to Legal Newsletter"}</h3>
          <p className={`text-[13.5px] leading-relaxed mb-8 relative z-10 ${muted}`}>{isRTL ? "أحدث المقالات والتحديثات القانونية أسبوعياً إلى بريدك" : "Latest articles and legal updates weekly to your inbox"}</p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto relative z-10">
            <input placeholder={isRTL ? "بريدك الإلكتروني" : "Your email"} className={`flex-1 rounded-2xl border px-5 py-3.5 text-sm outline-none transition-all focus:ring-2 focus:ring-[#0B3D2E]/20 ${isDark ? "bg-[#0c0f12] border-white/[0.06] text-white placeholder-zinc-500" : "bg-white border-slate-200 text-slate-900 placeholder-slate-400"}`} />
            <button className="px-6 py-3.5 bg-[#0B3D2E] text-white text-[13.5px] font-bold rounded-2xl hover:bg-[#0a3328] transition-all shadow-[0_4px_14px_0_rgba(11,61,46,0.3)] active:scale-[0.98]">
              {isRTL ? "اشترك" : "Subscribe"}
            </button>
          </div>
        </motion.div>
      </div>

      <Footer />
          </div>
  );
}