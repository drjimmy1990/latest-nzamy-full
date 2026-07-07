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
 * Returns { data, total, hasMore }. Resilient: on any error returns an empty,
 * non-crashing payload so the blog page degrades to its static fallback.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(60, Math.max(1, parseInt(searchParams.get("limit") ?? "24", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
    const q = (searchParams.get("q") ?? "").trim();

    const supabase = await createServiceClient();

    let query = supabase
      .from("articles")
      .select("*", { count: "exact" })
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (q) query = query.ilike("title", `%${q}%`);

    const { data, error, count } = await query;

    if (error) {
      console.error("[blog GET] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ data: [], total: 0, hasMore: false });
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
    return NextResponse.json({ data: [], total: 0, hasMore: false });
  }
}
