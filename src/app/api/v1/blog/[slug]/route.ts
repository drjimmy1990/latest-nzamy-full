import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/blog/[slug] — Fetch a single published blog article by slug.
 *
 * Uses the service-role client (bypasses RLS). Returns 404 if no published
 * article matches the slug. Best-effort increments the `views` counter (never
 * fails the request if the update errors).
 *
 * Next 16: dynamic params are async.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const supabase = await createServiceClient();

    // Try lookup by slug first; if the param looks like a UUID, also try by id.
    let { data, error } = await supabase
      .from("articles")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    // Fallback: if no match by slug and the param looks like a UUID, try by id.
    if (!data && !error && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)) {
      const idResult = await supabase
        .from("articles")
        .select("*")
        .eq("id", slug)
        .eq("status", "published")
        .maybeSingle();
      data = idResult.data;
      error = idResult.error;
    }

    if (error) {
      console.error("[blog/[slug] GET] Supabase error:", error.message, error.details, error.hint, error.code);
      return NextResponse.json({ error: "المقال غير متاح" }, { status: 404 });
    }

    if (!data) {
      return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
    }

    // Best-effort views increment — never fail the read on error.
    try {
      const currentViews = typeof data.views === "number" ? data.views : 0;
      await supabase
        .from("articles")
        .update({ views: currentViews + 1 })
        .eq("id", data.id);
    } catch (viewErr) {
      console.error("[blog/[slug] GET] views increment failed:", viewErr);
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[blog/[slug] GET] Unexpected error:", err);
    return NextResponse.json({ error: "المقال غير موجود" }, { status: 404 });
  }
}
