/**
 * articleOpenServer.ts — owner answer ٢٣٦ on the server, for one article (l18
 * review): may this viewer open this article's text?
 *
 * The law route's own lock rule (laws/[slug]/route.ts isArticleLocked, and the
 * citations route's viewerLinksAccess): a library subscriber opens everything;
 * otherwise, on the article's OWN law (library.articles.law_slug — never a slug
 * the caller names), a whitelisted law or an unlimited free limit opens every
 * article, else only the articles inside the free preview window (position by
 * order_index, then id; effectiveFreeLimit). Any failed read → false (fails
 * closed, like the text itself).
 *
 * Used by POST /api/v1/ai/runs: «اشرح لي» pins an article_id, and the pin is
 * dropped for an article locked to the caller — the run then answers the
 * question without that article's text as its first source.
 */
import "server-only";
import type { createServiceClient } from "@/lib/supabase/server";
import { checkLibraryAccess, hasFullLibraryAccess, libraryAccessMemo } from "@/lib/access-control";
import { effectiveFreeLimit } from "@/lib/library/previewLimit";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export async function articleOpenForViewer(db: ServiceClient, userId: string | null, articleId: string): Promise<boolean> {
  try {
    const memo = libraryAccessMemo(userId);
    if (await hasFullLibraryAccess(userId, memo)) return true;
    const lib = db.schema("library");
    const own = await lib.from("articles").select("law_slug").eq("id", articleId).limit(1);
    const slug = (own.data?.[0] as { law_slug?: unknown } | undefined)?.law_slug;
    if (own.error || typeof slug !== "string" || !slug) return false;
    const probe = await checkLibraryAccess(userId, slug, 0, "laws", { memo });
    if (probe.isWhitelisted === true || probe.freeLimit === -1) return true;
    const total = await lib.from("articles").select("id", { count: "exact", head: true }).eq("law_slug", slug);
    if (total.error || typeof total.count !== "number") return false;
    const freeLimit = effectiveFreeLimit(probe, total.count);
    if (freeLimit === -1) return true;
    if (freeLimit <= 0) return false;
    const { data, error } = await lib
      .from("articles")
      .select("id")
      .eq("law_slug", slug)
      .order("order_index", { ascending: true })
      .order("id", { ascending: true })
      .limit(freeLimit);
    if (error) return false;
    return ((data ?? []) as Array<{ id: unknown }>).some((r) => String(r.id) === articleId);
  } catch {
    return false;
  }
}
