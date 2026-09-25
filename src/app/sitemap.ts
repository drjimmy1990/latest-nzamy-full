import { MetadataRoute } from "next";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";
import { createServiceClient } from "@/lib/supabase/server";
import { selectAllPages } from "@/lib/supabase/selectAllPages";

const BASE_URL = "https://nezamy.sa";

type SitemapRoute = {
  url: string;
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
};

const publicRoutes: SitemapRoute[] = [
  { url: "/", priority: 1.0, changeFrequency: "weekly" },
  { url: "/about", priority: 0.7, changeFrequency: "yearly" },
  { url: "/academy", priority: 0.65, changeFrequency: "monthly" },
  { url: "/academy/certificates", priority: 0.45, changeFrequency: "monthly" },
  { url: "/academy/my-courses", priority: 0.45, changeFrequency: "monthly" },
  { url: "/academy/quiz", priority: 0.45, changeFrequency: "monthly" },
  { url: "/blog", priority: 0.8, changeFrequency: "weekly" },
  // No per-article entries here: article slugs come from the `articles` table and
  // change with every reseed. A hardcoded one (wrongful-termination-rights) was
  // advertising a 404 after the corpus was cleared. Emit them from the DB instead
  // — see REMAINING_WORK / خطة_المقالات for the pending dynamic-sitemap item.
  { url: "/community", priority: 0.75, changeFrequency: "weekly" },
  { url: "/community/ask", priority: 0.7, changeFrequency: "weekly" },
  { url: "/community/public", priority: 0.7, changeFrequency: "weekly" },
  { url: "/contact", priority: 0.7, changeFrequency: "monthly" },
  { url: "/faq", priority: 0.7, changeFrequency: "monthly" },
  { url: "/join", priority: 0.7, changeFrequency: "monthly" },
  { url: "/lawyers", priority: 0.85, changeFrequency: "weekly" },
  { url: "/lawyers/browse", priority: 0.8, changeFrequency: "weekly" },
  { url: "/laws", priority: 0.85, changeFrequency: "monthly" },
  // /laws/civil-procedure is NOT listed: it is a 308 alias (see
  // src/app/laws/civil-procedure/route.ts), and a sitemap must list final
  // URLs. The law itself is resolved from the database below
  // (getCivilProcedureLawEntry), because its slug differs between the cloud
  // project and the self-hosted instance.
  { url: "/laws/companies-law", priority: 0.7, changeFrequency: "monthly" },
  { url: "/login", priority: 0.6, changeFrequency: "yearly" },
  { url: "/marketplace", priority: 0.8, changeFrequency: "weekly" },
  { url: "/marketplace/collaborate", priority: 0.65, changeFrequency: "monthly" },
  { url: "/marketplace/post", priority: 0.6, changeFrequency: "monthly" },
  { url: "/media", priority: 0.6, changeFrequency: "monthly" },
  { url: "/partners", priority: 0.6, changeFrequency: "monthly" },
  { url: "/precedents", priority: 0.8, changeFrequency: "monthly" },
  { url: "/pricing", priority: 0.9, changeFrequency: "monthly" },
  { url: "/privacy", priority: 0.5, changeFrequency: "yearly" },
  { url: "/pro", priority: 0.7, changeFrequency: "monthly" },
  { url: "/register", priority: 0.6, changeFrequency: "yearly" },
  { url: "/security", priority: 0.5, changeFrequency: "yearly" },
  { url: "/services", priority: 0.9, changeFrequency: "monthly" },
  { url: "/services/arbitration", priority: 0.8, changeFrequency: "monthly" },
  { url: "/services/business", priority: 0.8, changeFrequency: "monthly" },
  { url: "/services/business/company-formation", priority: 0.7, changeFrequency: "monthly" },
  { url: "/services/business/trademark", priority: 0.7, changeFrequency: "monthly" },
  { url: "/services/cases", priority: 0.8, changeFrequency: "monthly" },
  { url: "/services/collection", priority: 0.7, changeFrequency: "monthly" },
  { url: "/services/consultations", priority: 0.85, changeFrequency: "monthly" },
  { url: "/services/contracts", priority: 0.85, changeFrequency: "monthly" },
  { url: "/services/corporate", priority: 0.8, changeFrequency: "monthly" },
  { url: "/services/corporate/governance", priority: 0.7, changeFrequency: "monthly" },
  { url: "/services/corporate/health-check", priority: 0.7, changeFrequency: "monthly" },
  { url: "/services/corporate/seconded-counsel", priority: 0.7, changeFrequency: "monthly" },
  { url: "/services/creators", priority: 0.75, changeFrequency: "monthly" },
  { url: "/services/individuals", priority: 0.9, changeFrequency: "monthly" },
  { url: "/services/labor", priority: 0.8, changeFrequency: "monthly" },
  { url: "/services/lawyers", priority: 0.8, changeFrequency: "monthly" },
  { url: "/services/lawyers/vault", priority: 0.7, changeFrequency: "monthly" },
  { url: "/services/legal-representation", priority: 0.8, changeFrequency: "monthly" },
  { url: "/services/notary", priority: 0.85, changeFrequency: "monthly" },
  { url: "/services/tracking", priority: 0.8, changeFrequency: "monthly" },
  { url: "/terms", priority: 0.5, changeFrequency: "yearly" },
  { url: "/ai", priority: 0.9, changeFrequency: "monthly" },
  { url: "/ai/analyze", priority: 0.8, changeFrequency: "monthly" },
  { url: "/ai/analyze-strength", priority: 0.8, changeFrequency: "monthly" },
  { url: "/ai/assistant", priority: 0.85, changeFrequency: "monthly" },
  { url: "/ai/case-brief", priority: 0.75, changeFrequency: "monthly" },
  { url: "/ai/collector", priority: 0.7, changeFrequency: "monthly" },
  { url: "/ai/communicate", priority: 0.7, changeFrequency: "monthly" },
  { url: "/ai/compare", priority: 0.75, changeFrequency: "monthly" },
  { url: "/ai/consult", priority: 0.8, changeFrequency: "monthly" },
  { url: "/ai/contract-drafter", priority: 0.85, changeFrequency: "monthly" },
  { url: "/ai/contracts", priority: 0.85, changeFrequency: "monthly" },
  { url: "/ai/direction-support", priority: 0.8, changeFrequency: "monthly" },
  { url: "/ai/draft", priority: 0.8, changeFrequency: "monthly" },
  { url: "/ai/fee-calculator", priority: 0.7, changeFrequency: "monthly" },
  { url: "/ai/legal-opinion", priority: 0.8, changeFrequency: "monthly" },
  { url: "/ai/legal-translate", priority: 0.75, changeFrequency: "monthly" },
  { url: "/ai/micro", priority: 0.7, changeFrequency: "monthly" },
  { url: "/ai/monitor", priority: 0.7, changeFrequency: "monthly" },
  { url: "/ai/najiz-optimizer", priority: 0.7, changeFrequency: "monthly" },
  { url: "/ai/procedures", priority: 0.7, changeFrequency: "monthly" },
  { url: "/ai/quick-answer", priority: 0.75, changeFrequency: "monthly" },
  { url: "/ai/report-generator", priority: 0.7, changeFrequency: "monthly" },
  { url: "/ai/secretary", priority: 0.7, changeFrequency: "monthly" },
  { url: "/ai/smart-inspector", priority: 0.85, changeFrequency: "monthly" },
  { url: "/ai/templates", priority: 0.75, changeFrequency: "monthly" },
  { url: "/ai/transcriber", priority: 0.75, changeFrequency: "monthly" },
  { url: "/ai/wargaming", priority: 0.75, changeFrequency: "monthly" },
];

interface PublishedArticleRow {
  id: string;
  slug: string;
  updated_at: string | null;
  published_at: string | null;
  date_modified: string | null;
}

/**
 * Published blog article slugs, server-side, for the sitemap. Mirrors the
 * `articles` table query used by src/app/blog/[slug]/page.tsx (status =
 * 'published'). Never throws — any Supabase error/exception is caught and
 * results in an empty list, so the sitemap always renders (falls back to
 * just the static `/blog` entry above) instead of 500ing.
 *
 * LIB-14: the old unranged `.select()` relied on PostgREST's implicit
 * max-rows cap (1000 on self-hosted) to stop it, which was fine at 614
 * published rows but would have silently dropped entries the day the blog
 * passed 1,000 — a sitemap that stops advertising real, published pages with
 * no error anywhere. selectAllPages() walks it in windows instead, ordered by
 * `slug` with the primary key `id` as the unique tiebreaker selectAllPages
 * requires, so pages can never overlap or skip a row.
 *
 * A window failing partway through still returns the rows read before the
 * failure, but this function discards them and returns [] on ANY error,
 * matching the "never throws, empty list on failure" contract above: a
 * sitemap missing its SECOND half (whichever half a mid-scan timeout landed
 * on) is a worse, silently-inconsistent failure than falling back to just
 * the static `/blog` entry.
 */
async function getBlogSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await selectAllPages<PublishedArticleRow>((from, to) =>
      supabase
        .from("articles")
        .select("id, slug, updated_at, published_at, date_modified")
        .eq("status", "published")
        .order("slug")
        .order("id")
        .range(from, to)
    );

    if (error) {
      console.error("[sitemap] blog article fetch failed:", error.message);
      return [];
    }
    if (!data) return [];

    return data
      .filter((row) => Boolean(row.slug))
      .map((row) => ({
        url: `${BASE_URL}/blog/${row.slug}`,
        lastModified: row.date_modified || row.updated_at || row.published_at || undefined,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      }));
  } catch (err) {
    console.error("[sitemap] blog article fetch failed:", err);
    return [];
  }
}

/**
 * «نظام المرافعات الشرعية ولائحته التنفيذية» under whichever slug the
 * database this deployment points at uses (checked 2026-09-25):
 *   self-hosted: sharia-pleading-law-qadha-edition (243 articles)
 *   cloud:       ndham-almrafaat-alshrayh-jmayh-qda (314 articles)
 * Listed in preference order; the first slug that exists wins. On any error,
 * or if neither exists, nothing is listed — never a URL that would 404.
 */
const CIVIL_PROCEDURE_LAW_SLUGS = [
  "sharia-pleading-law-qadha-edition",
  "ndham-almrafaat-alshrayh-jmayh-qda",
] as const;

async function getCivilProcedureLawEntry(today: string): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .schema("library")
      .from("laws")
      .select("slug")
      .in("slug", [...CIVIL_PROCEDURE_LAW_SLUGS]);
    if (error) {
      console.error("[sitemap] civil-procedure law lookup failed:", error.message);
      return [];
    }
    const found = new Set((data ?? []).map((row: { slug: string }) => row.slug));
    const slug = CIVIL_PROCEDURE_LAW_SLUGS.find((s) => found.has(s));
    if (!slug) return [];
    return [{
      url: `${BASE_URL}/laws/${slug}`,
      lastModified: today,
      changeFrequency: "monthly",
      priority: 0.7,
    }];
  } catch (err) {
    console.error("[sitemap] civil-procedure law lookup failed:", err);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const today = new Date().toISOString().split("T")[0];

  // The multi-vendor lawyer directory is hidden during single-firm beta.
  const routes = BETA_MONOPOLY_MODE
    ? publicRoutes.filter((r) => r.url !== "/lawyers" && r.url !== "/lawyers/browse")
    : publicRoutes;

  const staticEntries: MetadataRoute.Sitemap = routes.map(({ url, priority, changeFrequency }) => ({
    url: `${BASE_URL}${url}`,
    lastModified: today,
    changeFrequency,
    priority,
  }));

  const [lawEntries, blogEntries] = await Promise.all([
    getCivilProcedureLawEntry(today),
    getBlogSitemapEntries(),
  ]);

  return [...staticEntries, ...lawEntries, ...blogEntries];
}
