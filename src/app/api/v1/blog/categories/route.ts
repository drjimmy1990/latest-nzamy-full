import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/blog/categories — distinct categories of published articles, with
 * counts, newest-heaviest first. Drives the blog page's category pills so they
 * reflect the real taxonomy instead of a hardcoded list.
 *
 * FAILURE IS A 500, NOT AN EMPTY LIST. The old comment claimed an empty `data`
 * made the page "fall back to its static category list" — it does not: the page
 * only assigns when the array is non-empty and returns early on `!res.ok`
 * (src/app/blog/page.tsx:213-216), so both paths lead to the same fallback and
 * nothing depends on the 200. What the empty array actually bought was an
 * unreadable taxonomy that looked exactly like a blog with no categories.
 *
 * Every count below is a number rendered to a reader, so a partial read is not
 * a smaller answer here — it is a wrong one. That case is reported with
 * `degraded: true` on an otherwise-normal 200; see the cap check after the
 * query for why it is a marker and not a status code.
 */
export async function GET() {
  try {
    const supabase = await createServiceClient();
    const { data, count, error } = await supabase
      .from("articles")
      // No `.limit()` here, but PostgREST enforces its own max-rows ceiling, and
      // a category tally computed from a truncated scan is a fabricated number
      // («٣ مقالات» under a category that has 40). `exact` is what makes that
      // truncation detectable at all — it is not for pagination.
      .select("category", { count: "exact" })
      .eq("status", "published");

    if (error) {
      console.error("[blog/categories GET] Supabase error:", error.message);
      return NextResponse.json({ error: "تعذّر تحميل تصنيفات المدونة." }, { status: 500 });
    }

    const rows = data ?? [];

    // PostgREST caps a select at its own max-rows ceiling, so `count` can
    // exceed the rows actually scanned. Every tally below then undercounts by
    // an unknown amount — «٣ مقالات» on a category holding 40.
    //
    // Marked, NOT turned into a 500. A 500 here would be the only branch in
    // this pass that fails a SUCCESSFUL query, on a public page, keyed to a
    // ceiling this repo does not configure anywhere (no supabase/config.toml,
    // no db-max-rows setting) — so the threshold is unverifiable from the code
    // and a permanent outage of the category pills is too high a price for it.
    // `degraded: true` is the same compromise this pass made for
    // /api/v1/admin/payments: listFromApi() in src/lib/services/listRead.ts
    // reads it as a failed read (the safe default — the page keeps its static
    // pills), while a caller that only wants the category NAMES, which are not
    // affected by the cap, still has them.
    const capped = typeof count === "number" && count > rows.length;
    if (capped) {
      console.error(
        `[blog/categories GET] row cap hit: tallied ${rows.length} of ${count} published articles; counts understate. Paginate this read.`,
      );
    }

    const counts = new Map<string, number>();
    for (const row of rows) {
      const c = typeof row.category === "string" ? row.category.trim() : "";
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }

    const list = [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // No `total`: it would be the number of distinct categories, i.e. exactly
    // `list.length`, and listRead.ts computes `truncated` from it — a total
    // that always equals items.length can only ever produce `false`. Echoing
    // it back would look like pagination metadata this route does not have.
    return NextResponse.json({ data: list, degraded: capped });
  } catch (err) {
    console.error("[blog/categories GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل تصنيفات المدونة." }, { status: 500 });
  }
}
