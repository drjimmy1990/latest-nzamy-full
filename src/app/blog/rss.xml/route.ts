import { createServiceClient } from "@/lib/supabase/server";
import { BASE_URL } from "@/lib/seo";
import { BLOG_FALLBACK_AUTHOR } from "@/constants/platformContent";
import { blogCategoryLabel } from "../_categories";
import { RSS_MAX_ITEMS, buildRssXml } from "../_rss";

/**
 * GET /blog/rss.xml — RSS 2.0 feed of the newest published blog articles
 * (P1-39). Advertised in the <head> of /blog by ../layout.tsx.
 *
 * Same read as GET /api/v1/blog: the service-role client, `status =
 * 'published'`, newest `published_at` first, only the columns the feed prints
 * (never the body). A failed read is a 503, not an empty feed: an empty
 * channel would tell every reader the blog has no articles.
 *
 * Rendered per request and cached for an hour by the CDN/nginx, so `next
 * build` never prerenders it without the database.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("articles")
      .select("slug, title, excerpt, category, author_name, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(RSS_MAX_ITEMS);

    if (error) {
      console.error("[blog rss] Supabase error:", error.message, error.code);
      return unavailable();
    }

    type Row = { slug: string; title: string; excerpt: string | null; category: string | null; author_name: string | null; published_at: string | null };
    const xml = buildRssXml(
      {
        baseUrl: BASE_URL,
        title: "المدونة القانونية — نظامي",
        description: "مقالات قانونية متخصصة في الأنظمة السعودية من منصة نظامي",
        path: "/blog",
        selfPath: "/blog/rss.xml",
        language: "ar",
      },
      ((data ?? []) as Row[]).map((row) => ({
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        // Raw sec_* codes are never printed (../_categories.ts); unknown → omitted.
        category: blogCategoryLabel(row.category),
        author: row.author_name || BLOG_FALLBACK_AUTHOR,
        published_at: row.published_at,
      })),
    );

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("[blog rss] Unexpected error:", err);
    return unavailable();
  }
}

function unavailable() {
  return new Response("تعذّر تحميل المقالات.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "300" },
  });
}
