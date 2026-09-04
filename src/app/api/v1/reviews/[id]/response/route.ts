import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { offPlatformContactIssue } from "@/lib/services/contactSanitizer";
import { REVIEW_SELECT, enrichReviews, type ReviewRow } from "../../route";

/**
 * PATCH /api/v1/reviews/[id]/response — the reviewee answers a review once.
 * Body: { response }. RLS "reviewees respond to reviews" is the row-level
 * backstop (`reviewee_id = auth.uid()`, no column restriction — per the
 * migration's own note, per-column WITH CHECK isn't expressible in RLS), so
 * this route is what actually enforces "response/response_at only" and
 * "only when still null": the update below sets exactly those two columns
 * and re-checks `response IS NULL` in its own WHERE clause, closing the gap
 * between the read below and the write.
 */

const MAX_RESPONSE_LENGTH = 1000;
// A real UUID shape (8-4-4-4-12 hex), not merely "36 hex-ish characters" —
// see lawyers/[id]/route.ts's UUID_RE for why the looser pattern misroutes.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "التقييم غير موجود." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const { response } = (body ?? {}) as { response?: unknown };
    const trimmed = typeof response === "string" ? response.trim() : "";

    if (!trimmed) {
      return NextResponse.json({ error: "نص الردّ مطلوب." }, { status: 400 });
    }
    if (trimmed.length > MAX_RESPONSE_LENGTH) {
      return NextResponse.json({ error: `الردّ يجب ألا يتجاوز ${MAX_RESPONSE_LENGTH} حرفًا.` }, { status: 400 });
    }
    const issue = offPlatformContactIssue(trimmed);
    if (issue) {
      return NextResponse.json({ error: issue }, { status: 400 });
    }

    // Read first so the caller gets the precise Arabic reason ("not yours"
    // vs "already answered") instead of one generic failure from the update.
    const { data: existing, error: readErr } = await supabase
      .from("reviews")
      .select("id, reviewee_id, response")
      .eq("id", id)
      .maybeSingle();

    if (readErr) {
      console.error("[reviews/[id]/response PATCH] read failed:", readErr.message, readErr.code);
      return NextResponse.json({ error: "تعذّر تحميل التقييم." }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "التقييم غير موجود." }, { status: 404 });
    }
    if (existing.reviewee_id !== user.id) {
      return NextResponse.json({ error: "غير مصرح لك بالردّ على هذا التقييم." }, { status: 403 });
    }
    if (existing.response !== null) {
      return NextResponse.json({ error: "تم الردّ من قبل" }, { status: 400 });
    }

    const { data: updated, error: updErr } = await supabase
      .from("reviews")
      .update({ response: trimmed, response_at: new Date().toISOString() })
      .eq("id", id)
      .eq("reviewee_id", user.id)
      .is("response", null)
      .select(REVIEW_SELECT)
      .maybeSingle();

    if (updErr) {
      console.error("[reviews/[id]/response PATCH] update failed:", updErr.message, updErr.code);
      return NextResponse.json({ error: "تعذّر حفظ الردّ." }, { status: 500 });
    }
    if (!updated) {
      // Race: a response landed between the read above and this write.
      return NextResponse.json({ error: "تم الردّ من قبل" }, { status: 400 });
    }

    const [review] = await enrichReviews([updated as ReviewRow]);
    return NextResponse.json({ data: review });
  } catch (err) {
    console.error("[reviews/[id]/response PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حفظ الردّ." }, { status: 500 });
  }
}
