import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { LawyerService } from "@/lib/services/lawyerServicesService";
import type { Review, ReviewStats } from "@/lib/services/reviewsService";
import type { EducationEntry } from "@/lib/services/lawyerProfileFields";

/**
 * GET /api/v1/lawyers/[id] — one lawyer's PUBLIC profile.
 *
 * "Public" is the whole difficulty. Two things had to be true at once and
 * neither was:
 *
 * 1. IT HAD TO RETURN SOMETHING. The previous version used the RLS-scoped
 *    `createClient()`, and there is no anonymous SELECT policy on `profiles` or
 *    `lawyer_profiles` — measured against production, an anonymous caller reads
 *    ZERO of the 5 lawyer rows, with no error, because RLS filters silently.
 *    So the public profile page could never have rendered a real lawyer.
 *
 * 2. IT MUST NOT RETURN EVERYTHING. The previous query was
 *    `.select("*, lawyer_profiles!inner(*)")` — on a route whose own docstring
 *    said "public". That projection includes profiles.email, profiles.phone,
 *    and lawyer_profiles.license_number / hourly_rate / credit_balance /
 *    credit_expiry / metadata. RLS was the only thing standing between a
 *    lawyer's contact details and the open internet, and RLS is row-level: the
 *    moment anyone adds a permissive policy to make (1) work, (2) breaks.
 *
 * So the service client is used deliberately, and the safety moves into this
 * file where it is explicit and reviewable:
 *
 *   - an ALLOW-LIST projection, never `*`. Adding a column to the table does not
 *     silently publish it.
 *   - the consent gate below.
 *
 * This mirrors GET /api/v1/lawyers (the list route), which already had the
 * explicit projection and the verified gate. Keep the two in step.
 */

/**
 * Publishing a licensed professional's details is not something to infer. Two
 * columns already model the consent and both default to the safe answer:
 *
 *   verification_status = 'verified'  — the platform checked the licence.
 *                                       Defaults to 'pending'.
 *   marketplace_visible = true        — the lawyer asked to be listed.
 *                                       Defaults to FALSE.
 *
 * Both are required. A verified lawyer who never opted in is not public, and an
 * opted-in lawyer who was never verified is not public either.
 *
 * As of writing, all 5 lawyer rows in production are `pending` with
 * `marketplace_visible = false`, so this route correctly 404s for every one of
 * them. That is the honest answer, not a bug: nobody has been verified yet.
 */
const PUBLIC_COLUMNS =
  "id, display_name, display_name_en, avatar_url, city, country_code, created_at, " +
  "lawyer_profiles!inner(user_id, slug, specialties, years_experience, hourly_rate, " +
  "bio_ar, bio_en, headline_ar, education, courts, languages, bar_association, license_number, " +
  "verification_status, is_accepting_clients, marketplace_visible, show_contact)";

/**
 * A real UUID shape (8-4-4-4-12 hex), not merely "36 hex-ish characters" —
 * `/^[0-9a-f-]{36}$/i` also matches a 36-character slug made only of a–f and
 * dashes, which would misroute it into the id branch and 404 a real profile.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `numeric` columns (`price_sar`, `avg_rating`) come back from postgres as strings over the wire. */
function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * postgrest-js only computes a typed row shape from a SELECT STRING LITERAL;
 * the concatenated strings this file builds (readable across lines, matching
 * `PUBLIC_COLUMNS` above) type as plain `string`, so `.data` would otherwise
 * infer as `GenericStringError`. Cast through the row shape instead of
 * fighting that inference — same move `[id]/route.ts`'s existing code makes
 * via `data as unknown as Record<string, unknown>`.
 */
interface LawyerServiceRow {
  id: string;
  lawyer_user_id: string;
  title_ar: string;
  description_ar: string | null;
  pricing_kind: string;
  price_sar: number | string | null;
  duration_label: string | null;
  category: string;
  active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

interface ReviewStatsRow {
  lawyer_user_id: string;
  review_count: number | string;
  avg_rating: number | string | null;
  last_review_at: string | null;
}

interface ReviewRow {
  id: string;
  reviewer_id: string;
  request_id: string | null;
  rating: number;
  title: string;
  body: string;
  is_anonymous: boolean;
  response: string | null;
  response_at: string | null;
  created_at: string;
}

/**
 * Batch-hydrates one page of review rows: the reviewer's display name (never
 * even queried for an anonymous review — not fetched, so there is nothing to
 * leak) and the reviewed request's service title (`metadata.serviceTitleAr`,
 * else `title`). Two queries total, never one per review.
 */
async function hydrateReviews(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  lawyerUserId: string,
  rows: ReviewRow[],
): Promise<Review[]> {
  if (rows.length === 0) return [];

  const reviewerIds = [...new Set(rows.filter((r) => !r.is_anonymous).map((r) => r.reviewer_id))];
  const requestIds = [...new Set(rows.map((r) => r.request_id).filter((v): v is string => !!v))];

  const [namesRes, requestsRes] = await Promise.all([
    reviewerIds.length > 0
      ? supabase.from("profiles").select("id, display_name").in("id", reviewerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null }>, error: null }),
    requestIds.length > 0
      ? supabase.from("service_requests").select("id, title, metadata").in("id", requestIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string | null; metadata: Record<string, unknown> | null }>, error: null }),
  ]);

  if (namesRes.error) console.error("[lawyers/[id] GET] reviewer name lookup failed:", namesRes.error.message);
  if (requestsRes.error) console.error("[lawyers/[id] GET] reviewed-request lookup failed:", requestsRes.error.message);

  const names = new Map<string, string>();
  for (const p of namesRes.data ?? []) {
    if (p.display_name) names.set(p.id, p.display_name);
  }
  const requestTitles = new Map<string, string>();
  for (const r of requestsRes.data ?? []) {
    const metaTitle = r.metadata && typeof r.metadata.serviceTitleAr === "string" ? r.metadata.serviceTitleAr : null;
    requestTitles.set(r.id, metaTitle || r.title || "");
  }

  return rows.map((r) => ({
    id: r.id,
    lawyerUserId,
    reviewerName: r.is_anonymous ? null : names.get(r.reviewer_id) ?? null,
    isAnonymous: r.is_anonymous,
    // Anonymity means anonymous to the reviewed lawyer too: the request id
    // is exactly what lets them look the reviewer up in their own dashboard
    // (service_requests.requester_user_id), so it is withheld the same way
    // reviewerName is above. serviceTitleAr still resolves off the raw row
    // (r.request_id, not this field), so hiding the id costs nothing else.
    requestId: r.is_anonymous ? null : r.request_id,
    serviceTitleAr: r.request_id ? requestTitles.get(r.request_id) || null : null,
    rating: r.rating,
    title: r.title,
    body: r.body,
    response: r.response,
    responseAt: r.response_at,
    createdAt: r.created_at,
  }));
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const supabase = await createServiceClient();

  // R2: resolves BY ID OR SLUG. A real UUID looks up `profiles.id`; anything
  // else looks up the lawyer's chosen `lawyer_profiles.slug` (item 130) —
  // plain text equality, so a garbage string just finds no match rather than
  // risking a Postgres uuid-parse 500 the way `.eq("id", "not-a-uuid")` did.
  let query = supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .eq("user_type", "lawyer")
    .eq("lawyer_profiles.verification_status", "verified")
    .eq("lawyer_profiles.marketplace_visible", true);
  query = UUID_RE.test(id) ? query.eq("id", id) : query.eq("lawyer_profiles.slug", id);

  const { data, error } = await query.maybeSingle();

  // One body for "no such lawyer", "not verified" and "not listed". Telling them
  // apart would let anyone enumerate which accounts exist and what state they are
  // in — the same reasoning as the deliverable-download route.
  if (error || !data) {
    if (error) console.error("[lawyers/[id] GET]", error.message);
    return NextResponse.json({ error: "المحامي غير موجود" }, { status: 404 });
  }

  // `license_number` is projected because the profile shows it when the lawyer
  // chose to publish it, and withheld otherwise. Same rule the list route
  // applies. PostgREST returns an embedded to-one either as an object or as a
  // single-element array depending on how it resolves the relationship, so
  // normalise before reading.
  const row = data as unknown as Record<string, unknown>;
  const embedded = row.lawyer_profiles;
  const lp = (Array.isArray(embedded) ? embedded[0] : embedded) as Record<string, unknown> | undefined;

  if (lp && lp.show_contact !== true) {
    delete lp.license_number;
    delete lp.bar_association;
  }

  // R2: promote the new profile-detail columns to the top level. The rest of
  // this response stays raw-column-shaped (`display_name`, `bio_ar`, …) as it
  // always has; these five follow the same convention rather than making a
  // caller reach into `lawyer_profiles` for some fields and not others.
  row.slug = (lp?.slug as string | null | undefined) ?? null;
  row.headline_ar = (lp?.headline_ar as string | undefined) ?? "";
  row.education = (lp?.education as EducationEntry[] | undefined) ?? [];
  row.courts = (lp?.courts as string[] | undefined) ?? [];
  row.languages = (lp?.languages as string[] | undefined) ?? [];

  const lawyerUserId = typeof row.id === "string" ? row.id : null;

  // R2 (items 178 · 192): services / review stats / reviews are three
  // SEPARATE reads — none embeddable through the `lawyer_profiles!inner(...)`
  // join above (two are different tables keyed by lawyer_user_id/reviewee_id;
  // the stats one is a view PostgREST has no declared FK for). A failed
  // sub-read must not read as "this lawyer has none" — that would be a
  // fabricated claim about a licensed advocate — so each one falls back to
  // `null` on error (logged, like the main query) and to `null`/`[]` only on
  // a genuine empty success.
  let services: LawyerService[] | null = [];
  let reviewStats: ReviewStats | null = null;
  let reviews: Review[] | null = [];

  if (lawyerUserId) {
    const [servicesRes, statsRes, reviewsRes] = await Promise.all([
      supabase
        .from("lawyer_services")
        .select(
          "id, lawyer_user_id, title_ar, description_ar, pricing_kind, price_sar, " +
          "duration_label, category, active, position, created_at, updated_at",
        )
        .eq("lawyer_user_id", lawyerUserId)
        .eq("active", true)
        // `position` defaults to 0 on every row until a lawyer reorders, so a
        // second key keeps the order stable across requests instead of
        // reshuffling ties arbitrarily.
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("lawyer_review_stats")
        .select("lawyer_user_id, review_count, avg_rating, last_review_at")
        .eq("lawyer_user_id", lawyerUserId)
        .maybeSingle(),
      supabase
        .from("reviews")
        .select("id, reviewer_id, request_id, rating, title, body, is_anonymous, response, response_at, created_at")
        .eq("reviewee_id", lawyerUserId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (servicesRes.error) {
      console.error("[lawyers/[id] GET] lawyer_services read failed:", servicesRes.error.message);
      services = null;
    } else {
      const serviceRows = (servicesRes.data ?? []) as unknown as LawyerServiceRow[];
      services = serviceRows.map((s) => ({
        id: s.id,
        lawyerUserId: s.lawyer_user_id,
        titleAr: s.title_ar,
        descriptionAr: s.description_ar ?? "",
        pricingKind: s.pricing_kind as LawyerService["pricingKind"],
        priceSar: num(s.price_sar),
        durationLabel: s.duration_label,
        category: s.category as LawyerService["category"],
        active: s.active,
        position: s.position,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      }));
    }

    if (statsRes.error) {
      console.error("[lawyers/[id] GET] lawyer_review_stats read failed:", statsRes.error.message);
      reviewStats = null;
    } else if (statsRes.data) {
      const s = statsRes.data as unknown as ReviewStatsRow;
      reviewStats = {
        lawyerUserId: s.lawyer_user_id,
        reviewCount: Number(s.review_count) || 0,
        avgRating: num(s.avg_rating),
        lastReviewAt: s.last_review_at,
      };
    } // else: genuinely no active reviews yet — `reviewStats` stays null.

    if (reviewsRes.error) {
      console.error("[lawyers/[id] GET] reviews read failed:", reviewsRes.error.message);
      reviews = null;
    } else {
      reviews = await hydrateReviews(supabase, lawyerUserId, (reviewsRes.data ?? []) as unknown as ReviewRow[]);
    }
  }

  row.services = services;
  row.reviewStats = reviewStats;
  row.reviews = reviews;

  return NextResponse.json({ data: row });
}
