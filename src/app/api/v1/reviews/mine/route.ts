import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { REVIEW_SELECT, enrichReviews, type ReviewRow } from "../route";

/**
 * GET /api/v1/reviews/mine — the lawyer/firm: reviews about me, incl. my
 * responses.
 *
 * RLS CAVEAT (deliberately not worked around here): the only SELECT policy
 * on `public.reviews` is "anyone reads active reviews" (`status = 'active'`)
 * — there is no owner-read policy letting a reviewee see their OWN
 * pending/moderated/deleted rows, only active ones, same as the public. In
 * practice this doesn't hide anything today: POST /api/v1/reviews always
 * inserts `status: 'active'` and nothing in this codebase ever sets a
 * review to another status, so every review this lawyer has ever received
 * IS active and this reads all of them. It would start hiding rows the
 * moment a moderation feature (none exists yet) sets status to something
 * else — flagging it here rather than silently relying on it staying true.
 */
export async function GET() {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const [reviewsRes, statsRes] = await Promise.all([
      supabase
        .from("reviews")
        .select(REVIEW_SELECT, { count: "exact" })
        .eq("reviewee_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("lawyer_review_stats")
        .select("lawyer_user_id, review_count, avg_rating, last_review_at")
        .eq("lawyer_user_id", user.id)
        .maybeSingle(),
    ]);

    if (reviewsRes.error) {
      console.error("[reviews/mine GET] query failed:", reviewsRes.error.message, reviewsRes.error.code);
      return NextResponse.json({ error: "تعذّر تحميل تقييماتك." }, { status: 500 });
    }
    // A failed stats read must not read as "zero reviews" next to a
    // populated `data` array — same reasoning as GET /api/v1/reviews (see
    // that route's comment): `null` is the declared `ReviewStats | null`
    // shape, not a fabricated count.
    if (statsRes.error) {
      console.error("[reviews/mine GET] stats query failed:", statsRes.error.message, statsRes.error.code);
    }

    const rows = (reviewsRes.data ?? []) as ReviewRow[];
    const reviews = await enrichReviews(rows);
    const statsRow = statsRes.data as { review_count: number; avg_rating: number | null; last_review_at: string | null } | null;

    return NextResponse.json({
      data: reviews,
      total: reviewsRes.count ?? rows.length,
      stats: statsRes.error
        ? null
        : {
            lawyerUserId: user.id,
            reviewCount: statsRow?.review_count ?? 0,
            avgRating: statsRow?.avg_rating ?? null,
            lastReviewAt: statsRow?.last_review_at ?? null,
          },
    });
  } catch (err) {
    console.error("[reviews/mine GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل تقييماتك." }, { status: 500 });
  }
}
