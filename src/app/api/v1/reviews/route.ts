import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth/assertRole";
import { offPlatformContactIssue } from "@/lib/services/contactSanitizer";
import { recordNotification } from "@/lib/notify";

/**
 * /api/v1/reviews — Phase 7, item 192 (see supabase/migrations/
 * 20260907_phase7_profile_services_reviews.sql). A review is a fact about ONE
 * completed request: DB unique-per-request, RLS requires the reviewer to be
 * that request's requester and the reviewee its assignee. This route
 * validates first — so the caller gets an Arabic reason — the DB policy is
 * the backstop, not the first line.
 *
 *   GET  ?lawyer=<uuid>&limit  — public: active reviews of a lawyer + stats
 *   POST                       — the requester of a completed request reviews it
 *
 * `REVIEW_SELECT`, `ReviewRow` and `enrichReviews` are exported for
 * ./mine/route.ts and ./[id]/response/route.ts, which need the exact same
 * row shape → DTO mapping (see src/app/api/v1/lawyer/clients/[id]/route.ts
 * for the same "import from the parent route.ts" convention already used in
 * this codebase).
 */

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 2000;
// A real UUID shape (8-4-4-4-12 hex), not merely "36 hex-ish characters" —
// see lawyers/[id]/route.ts's UUID_RE for why the looser pattern misroutes.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReviewRow {
  id: string;
  reviewer_id: string;
  reviewee_id: string;
  request_id: string | null;
  rating: number;
  title: string;
  body: string;
  is_anonymous: boolean;
  response: string | null;
  response_at: string | null;
  created_at: string;
}

export const REVIEW_SELECT =
  "id, reviewer_id, reviewee_id, request_id, rating, title, body, is_anonymous, response, response_at, created_at";

function toReviewDto(row: ReviewRow, reviewerName: string | null, serviceTitleAr: string | null) {
  return {
    id: row.id,
    lawyerUserId: row.reviewee_id,
    reviewerName: row.is_anonymous ? null : reviewerName,
    isAnonymous: row.is_anonymous,
    // Withheld on anonymous reviews for the same reason reviewerName is:
    // the reviewee can look this id up in service_requests to de-anonymize
    // the reviewer. serviceTitleAr is resolved by the caller off row.request_id
    // directly, so it is unaffected by hiding the id here.
    requestId: row.is_anonymous ? null : row.request_id,
    serviceTitleAr,
    rating: row.rating,
    title: row.title,
    body: row.body,
    response: row.response,
    responseAt: row.response_at,
    createdAt: row.created_at,
  };
}

/**
 * Batch-resolves reviewer display names and service titles for a page of
 * review rows, via the service client — `profiles`/`service_requests` carry
 * no anonymous-read policy, so this only runs after RLS has already scoped
 * which review rows the caller may see (house rule: service client ONLY for
 * display names after RLS scoped the ids). An anonymous review's reviewer
 * name is never looked up.
 */
export async function enrichReviews(rows: ReviewRow[]) {
  if (rows.length === 0) return [];

  const reviewerIds = [...new Set(rows.filter((r) => !r.is_anonymous).map((r) => r.reviewer_id))];
  const requestIds = [...new Set(rows.filter((r): r is ReviewRow & { request_id: string } => !!r.request_id).map((r) => r.request_id))];

  const nameMap = new Map<string, string | null>();
  const titleMap = new Map<string, string | null>();

  if (reviewerIds.length > 0 || requestIds.length > 0) {
    const admin = await createServiceClient();
    const [namesRes, titlesRes] = await Promise.all([
      reviewerIds.length > 0
        ? admin.from("profiles").select("id, display_name").in("id", reviewerIds)
        : Promise.resolve({ data: [] as { id: string; display_name: string | null }[], error: null }),
      requestIds.length > 0
        ? admin.from("service_requests").select("id, title").in("id", requestIds)
        : Promise.resolve({ data: [] as { id: string; title: string | null }[], error: null }),
    ]);
    if (namesRes.error) console.error("[reviews] reviewer names lookup failed:", namesRes.error.message, namesRes.error.code);
    if (titlesRes.error) console.error("[reviews] service titles lookup failed:", titlesRes.error.message, titlesRes.error.code);
    for (const p of namesRes.data ?? []) nameMap.set(p.id, p.display_name);
    for (const s of titlesRes.data ?? []) titleMap.set(s.id, s.title);
  }

  // `service_requests.title` is the requester's own free text, never run
  // through the off-platform sanitiser at write time (item 179's enumerated
  // fields are bio_ar/headline_ar/service description/review title-body-
  // response — `service_requests.title` is not one of them), and this route
  // now surfaces it publicly as `serviceTitleAr`. Deliberately NOT run
  // through stripOffPlatformContact() here: its phone pattern matches any
  // 9-14 digit run, which a Saudi case/claim number satisfies routinely — a
  // title like «قضية رقم ٤٥١٢٣٠٠٩٨٧» would come back «[محذوف]» on every such
  // review, and there is no submitter here to hand a false positive back to
  // for a rewrite (unlike a bio or a review body). Left as an explicit,
  // reported tradeoff rather than settled silently — see the task report.
  return rows.map((row) => {
    const serviceTitleAr = row.request_id ? titleMap.get(row.request_id) ?? null : null;
    return toReviewDto(row, row.is_anonymous ? null : nameMap.get(row.reviewer_id) ?? null, serviceTitleAr);
  });
}

function clampLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

interface StatsRow {
  lawyer_user_id: string;
  review_count: number;
  avg_rating: number | null;
  last_review_at: string | null;
}

function statsDto(lawyerUserId: string, row: StatsRow | null) {
  return {
    lawyerUserId,
    reviewCount: row?.review_count ?? 0,
    avgRating: row?.avg_rating ?? null,
    lastReviewAt: row?.last_review_at ?? null,
  };
}

/**
 * GET /api/v1/reviews?lawyer=<uuid>&limit — public, no auth. `active` rows
 * only: enforced by RLS ("anyone reads active reviews", status = 'active')
 * on the anon/RLS client, not by a status filter here.
 *
 * CONSENT GATE — the `reviews` SELECT policy has no verification/listing
 * condition at all (it is a fact about a completed request, not about the
 * directory), so without this check any caller could pull a lawyer's rating
 * text before that lawyer ever opted into being public. `/api/v1/lawyers`
 * and `/api/v1/lawyers/[id]` both require `verification_status = 'verified'
 * AND marketplace_visible = true` before publishing anything about a lawyer
 * ("publishing a licensed professional's details is not something to
 * infer" — see that route's docstring); this endpoint applies the exact
 * same two-column gate, and can do it on the RLS-scoped client because
 * `lawyer_profiles` (unlike `profiles`) already carries a public
 * "public read verified lawyers" SELECT policy with that identical
 * condition — no service client needed for the gate itself.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lawyer = searchParams.get("lawyer");
    if (!lawyer || !UUID_RE.test(lawyer)) {
      return NextResponse.json({ error: "يجب تحديد المحامي." }, { status: 400 });
    }
    const limit = clampLimit(searchParams.get("limit"));

    const supabase = await createClient();

    const { data: listed, error: gateErr } = await supabase
      .from("lawyer_profiles")
      .select("user_id")
      .eq("user_id", lawyer)
      .eq("verification_status", "verified")
      .eq("marketplace_visible", true)
      .maybeSingle();

    if (gateErr) {
      console.error("[reviews GET] lawyer_profiles gate query failed:", gateErr.message, gateErr.code);
      return NextResponse.json({ error: "تعذّر تحميل التقييمات." }, { status: 500 });
    }
    // Same body whether the lawyer doesn't exist, isn't verified, or hasn't
    // opted into being listed — telling those apart would let a caller
    // enumerate accounts and their state (same reasoning lawyers/[id] uses).
    if (!listed) {
      // `stats: null` — "no figures to show", not "confirmed zero reviews"
      // for a lawyer this endpoint is deliberately not reporting on.
      return NextResponse.json({ data: [], total: 0, stats: null });
    }

    const [reviewsRes, statsRes] = await Promise.all([
      supabase
        .from("reviews")
        .select(REVIEW_SELECT, { count: "exact" })
        .eq("reviewee_id", lawyer)
        .order("created_at", { ascending: false })
        .range(0, limit - 1),
      supabase
        .from("lawyer_review_stats")
        .select("lawyer_user_id, review_count, avg_rating, last_review_at")
        .eq("lawyer_user_id", lawyer)
        .maybeSingle(),
    ]);

    if (reviewsRes.error) {
      console.error("[reviews GET] query failed:", reviewsRes.error.message, reviewsRes.error.code);
      return NextResponse.json({ error: "تعذّر تحميل التقييمات." }, { status: 500 });
    }
    // A failed stats read must not read as "zero reviews" next to a
    // populated `data` array — that would be a fabricated claim about a
    // licensed professional's rating (the exact reasoning behind
    // `degraded: true` in service-requests/route.ts and
    // `roleProfileReadFailed` in profile/route.ts). `null` is the declared
    // `ReviewStats | null` shape the client already handles.
    if (statsRes.error) {
      console.error("[reviews GET] stats query failed:", statsRes.error.message, statsRes.error.code);
    }

    const rows = (reviewsRes.data ?? []) as ReviewRow[];
    const reviews = await enrichReviews(rows);

    return NextResponse.json({
      data: reviews,
      total: reviewsRes.count ?? rows.length,
      stats: statsRes.error ? null : statsDto(lawyer, (statsRes.data as StatsRow | null) ?? null),
    });
  } catch (err) {
    console.error("[reviews GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل التقييمات." }, { status: 500 });
  }
}

/**
 * POST /api/v1/reviews — body: SubmitReviewInput. `requestId` must be one of
 * the caller's OWN completed requests, read via the RLS-scoped client
 * (`service_requests` SELECT is requester-or-assignee; the explicit
 * `requester_user_id` filter below is what pins it to "own", not just
 * "visible") — the RLS insert policy on `reviews` re-checks the same facts
 * and is the backstop, not the first line.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json().catch(() => null);
    const { requestId, rating, title, body: bodyText, isAnonymous } = (body ?? {}) as {
      requestId?: unknown;
      rating?: unknown;
      title?: unknown;
      body?: unknown;
      isAnonymous?: unknown;
    };

    if (typeof requestId !== "string" || !requestId.trim()) {
      return NextResponse.json({ error: "يجب تحديد الطلب المراد تقييمه." }, { status: 400 });
    }
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "التقييم يجب أن يكون رقماً صحيحاً من ١ إلى ٥." }, { status: 400 });
    }

    const trimmedTitle = typeof title === "string" ? title.trim() : "";
    if (trimmedTitle.length > MAX_TITLE_LENGTH) {
      return NextResponse.json({ error: `عنوان التقييم يجب ألا يتجاوز ${MAX_TITLE_LENGTH} حرفًا.` }, { status: 400 });
    }
    const titleIssue = trimmedTitle ? offPlatformContactIssue(trimmedTitle) : null;
    if (titleIssue) return NextResponse.json({ error: titleIssue }, { status: 400 });

    const trimmedBody = typeof bodyText === "string" ? bodyText.trim() : "";
    if (trimmedBody.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `نص التقييم يجب ألا يتجاوز ${MAX_BODY_LENGTH} حرفًا.` }, { status: 400 });
    }
    const bodyIssue = trimmedBody ? offPlatformContactIssue(trimmedBody) : null;
    if (bodyIssue) return NextResponse.json({ error: bodyIssue }, { status: 400 });

    const { data: reqRow, error: reqErr } = await supabase
      .from("service_requests")
      .select("id, assigned_to")
      .eq("id", requestId)
      .eq("requester_user_id", user.id)
      .eq("status", "completed")
      .maybeSingle();

    if (reqErr) {
      console.error("[reviews POST] service_requests lookup failed:", reqErr.message, reqErr.code);
      return NextResponse.json({ error: "تعذّر التحقق من الطلب." }, { status: 500 });
    }
    if (!reqRow || !reqRow.assigned_to) {
      return NextResponse.json({ error: "لا يمكن تقييم إلا طلب مكتمل خاصّ بك" }, { status: 400 });
    }

    const { data: inserted, error: insErr } = await supabase
      .from("reviews")
      .insert({
        reviewer_id: user.id,
        reviewee_id: reqRow.assigned_to,
        request_id: reqRow.id,
        rating,
        title: trimmedTitle,
        body: trimmedBody,
        is_anonymous: isAnonymous === true,
        status: "active",
      })
      .select(REVIEW_SELECT)
      .single();

    if (insErr) {
      console.error("[reviews POST] insert failed:", insErr.message, insErr.code);
      if (insErr.code === "23505") {
        return NextResponse.json({ error: "قيّمت هذا الطلب من قبل" }, { status: 409 });
      }
      return NextResponse.json({ error: "تعذّر حفظ التقييم." }, { status: 500 });
    }

    const [review] = await enrichReviews([inserted as ReviewRow]);

    // Best-effort — recordNotification never throws into this path.
    await recordNotification({
      userId: reqRow.assigned_to as string,
      title: "تقييم جديد على خدمتك",
      body: `تقييم بـ ${rating} من ٥ نجوم.`,
      href: "/dashboard/lawyer/profile",
    });

    return NextResponse.json({ data: review }, { status: 201 });
  } catch (err) {
    console.error("[reviews POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حفظ التقييم." }, { status: 500 });
  }
}
