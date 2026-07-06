import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/blog — List published blog articles (public).
 *
 * Reads the `articles` table via the service-role client (bypasses RLS so the
 * public list is always served, and so the route works before RLS policies are
 * applied to the remote DB). Only `status = 'published'` rows are returned,
 * ordered by `published_at` descending with nulls last.
 *
 * Resilient: on any error returns { data: [] } (200) so the blog page degrades
 * gracefully to its static fallback instead of hard-crashing.
 */
export async function GET() {
  try {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("[blog GET] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ data: [] });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error("[blog GET] Unexpected error:", err);
    return NextResponse.json({ data: [] });
  }
}
