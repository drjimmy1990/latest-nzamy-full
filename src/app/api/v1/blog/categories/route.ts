import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/blog/categories — distinct categories of published articles, with
 * counts, newest-heaviest first. Drives the blog page's category pills so they
 * reflect the real taxonomy instead of a hardcoded list.
 *
 * Resilient: on any error returns { data: [] } so the page falls back to its
 * static category list.
 */
export async function GET() {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("articles")
      .select("category")
      .eq("status", "published");

    if (error) {
      console.error("[blog/categories GET] Supabase error:", error.message);
      return NextResponse.json({ data: [] });
    }

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const c = typeof row.category === "string" ? row.category.trim() : "";
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }

    const list = [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ data: list });
  } catch (err) {
    console.error("[blog/categories GET] Unexpected error:", err);
    return NextResponse.json({ data: [] });
  }
}
