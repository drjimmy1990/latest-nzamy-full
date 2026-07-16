// Server component for /blog/[slug] — fetches the article server-side, emits
// per-article metadata + JSON-LD (Article/FAQPage/Breadcrumb), and renders the
// interactive <ArticleView> client child. Converted from a "use client" page so
// generateMetadata + structured data land in the initial HTML.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ArticleJsonLd } from "@/components/ArticleJsonLd";
import ArticleView from "./ArticleView";
import type { PlatformBlogArticle } from "@/constants/platformContent";

const BASE_URL = "https://nezamy.sa";
const SITE_NAME = "نظامي | Nzamy";

/** Format an ISO date string for display. */
function formatDate(iso?: string | null, en = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(en ? "en-US" : "ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

interface AeoPair { question: string; answer: string; }

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
  author_credentials?: string | null;
  author_url?: string | null;
  reviewer?: string | null;
  cover?: string | null;
  read_time?: string | null;
  views?: number | null;
  featured?: boolean | null;
  published_at?: string | null;
  schema_type?: string | null;
  date_modified?: string | null;
  aeo_pairs?: AeoPair[] | null;
  related_articles?: string[] | null;
  canonical_url?: string | null;
  category_code?: string | null;
}

function rowToDetail(row: BlogRow): PlatformBlogArticle {
  const authorName = row.author_name || "فريق المحتوى";
  const tag = row.category || "أخبار قانونية";
  return {
    id: row.id || row.slug,
    slug: row.slug,
    category: row.category || "news",
    tag,
    tagEn: tag,
    title: row.title,
    titleEn: row.title_en || row.title,
    excerpt: row.excerpt || "",
    excerptEn: row.excerpt_en || row.excerpt || "",
    cover: row.cover || null,
    author: {
      name: authorName,
      nameEn: authorName,
      slug: "",
      specialty: "قانوني",
      specialtyEn: "Legal",
      rating: 5,
      reviewCount: 0,
      url: row.author_url || null,
      credentials: row.author_credentials || null,
    },
    date: formatDate(row.published_at),
    dateEn: formatDate(row.published_at, true),
    publishedDate: row.published_at || "",
    readTime: row.read_time || "٥ دقائق",
    readTimeEn: row.read_time || "5 min",
    views: row.views ?? 0,
    likes: 0,
    featured: Boolean(row.featured),
    status: "published",
    seoScore: 0,
    source: "backend-ready",
    content: row.body || "",
    schema_type: row.schema_type || null,
    author_credentials: row.author_credentials || null,
    author_url: row.author_url || null,
    reviewer: row.reviewer || null,
    date_modified: row.date_modified || null,
    aeo_pairs: row.aeo_pairs || null,
    related_articles: row.related_articles || null,
    canonical_url: row.canonical_url || null,
    category_code: row.category_code || null,
  };
}

/** Get a Supabase client that can read published articles without auth issues. */
async function getBlogClient() {
  // Prefer service client (no cookie dependency, bypasses RLS) for public reads.
  // Fall back to cookie-based client if service role key is missing.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createServiceClient();
  }
  return createClient();
}

async function getArticle(slug: string): Promise<BlogRow | null> {
  try {
    const supabase = await getBlogClient();
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) { console.error("[blog] getArticle error:", error.message); return null; }
    if (!data) return null;
    return data as BlogRow;
  } catch (err) {
    console.error("[blog] getArticle crash:", err);
    return null;
  }
}

async function getRelated(article: BlogRow): Promise<PlatformBlogArticle[]> {
  try {
    const supabase = await getBlogClient();
    const slugs = Array.isArray(article.related_articles) ? article.related_articles.filter(Boolean) : [];
    if (slugs.length) {
      const { data } = await supabase
        .from("articles")
        .select("*")
        .in("slug", slugs)
        .eq("status", "published")
        .limit(3);
      if (data && data.length) return (data as BlogRow[]).map(rowToDetail);
    }
    // Fallback: same category, exclude self.
    const { data } = await supabase
      .from("articles")
      .select("*")
      .eq("status", "published")
      .eq("category", article.category || "")
      .neq("slug", article.slug)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(3);
    return ((data as BlogRow[] | null) || []).map(rowToDetail);
  } catch (err) {
    console.error("[blog] getRelated crash:", err);
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await getArticle(slug);
  if (!row) return { title: "المقال غير موجود | " + SITE_NAME };
  const title = row.title;
  const description = row.excerpt || "";
  const url = row.canonical_url || `${BASE_URL}/blog/${slug}`;
  const cover = row.cover || `${BASE_URL}/og-image.png`;
  return {
    title: `${title} - ${SITE_NAME}`,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${title} - ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      locale: "ar_SA",
      type: "article",
      images: [{ url: cover, width: 1200, height: 630, alt: title }],
      publishedTime: row.published_at || undefined,
      modifiedTime: row.date_modified || undefined,
      authors: row.author_name ? [row.author_name] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} - ${SITE_NAME}`,
      description,
      images: [cover],
    },
  };
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await getArticle(slug);
  if (!row) notFound();
  const related = await getRelated(row);
  const article = rowToDetail(row);

  return (
    <>
      <ArticleJsonLd
        article={{
          slug: row.slug,
          title: row.title,
          description: row.excerpt,
          cover: row.cover,
          published_at: row.published_at,
          date_modified: row.date_modified,
          author_name: row.author_name,
          author_url: row.author_url,
          author_credentials: row.author_credentials,
          schema_type: row.schema_type,
          aeo_pairs: row.aeo_pairs,
          category: row.category,
          canonical_url: row.canonical_url,
        }}
      />
      <ArticleView article={article} related={related} />
    </>
  );
}