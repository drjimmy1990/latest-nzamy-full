import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/blog — Paginated list of published blog articles (public).
 *
 * Query params:
 *   - limit   (default 24, max 60)
 *   - offset  (default 0)
 *   - q       (optional title search, case-insensitive)
 *
 * Reads the `articles` table via the service-role client (bypasses RLS so the
 * public list is always served, and works before RLS policies are applied to
 * the remote DB). Only `status = 'published'` rows, newest first.
 *
 * Returns { data, total, hasMore }.
 *
 * FAILURE IS A 500, NOT AN EMPTY PAGE. The old branches returned
 * `{ data: [], total: 0, hasMore: false }` — and `total: 0` is what the page
 * keys its "is the DB seeded?" test on (`usingDb`, src/app/blog/page.tsx:260),
 * so a failed query did not just show an empty blog: it made the page publish
 * the hardcoded ARTICLES catalog as if those were real posts. The page's
 * `!res.ok` branch (line 232) keeps whatever is already on screen instead,
 * which is true either way.
 *
 * This route is read only by the client-side list at /blog; the article pages
 * server-render from Supabase directly, so a 500 here cannot blank an
 * indexable page.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(60, Math.max(1, parseInt(searchParams.get("limit") ?? "24", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
    const q = (searchParams.get("q") ?? "").trim();
    const category = (searchParams.get("category") ?? "").trim();

    const supabase = await createServiceClient();

    let query = supabase
      .from("articles")
      .select("*", { count: "exact" })
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (q) query = query.ilike("title", `%${q}%`);
    if (category) query = query.eq("category", category);

    const { data, error, count } = await query;

    if (error) {
      console.error("[blog GET] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: "تعذّر تحميل المقالات." }, { status: 500 });
    }

    const rows = data ?? [];
    const total = count ?? rows.length;
    return NextResponse.json({
      data: rows,
      total,
      hasMore: offset + rows.length < total,
    });
  } catch (err) {
    console.error("[blog GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل المقالات." }, { status: 500 });
  }
}
