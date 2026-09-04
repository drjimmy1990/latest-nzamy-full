import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/lawyers — List verified lawyers (public)
 * Query params:
 *   - specialty (filter by specialization)
 *   - sort ('price' | 'experience', default: 'experience')
 *   - available (true to show only accepting clients)
 *   - limit (default: 20, max 200)
 *   - offset (default: 0)
 *
 * The body is `{ lawyers, total }`, where `total` is an exact count over the
 * SAME filters without the range — so a caller can tell whether the page it
 * received is the whole directory. /dashboard/client/find-lawyer depends on
 * that: it hides every directory-wide number and every derived filter chip
 * unless `lawyers.length >= total`.
 */

/** A cap this endpoint will not exceed. Public and unauthenticated. */
const MAX_LIMIT = 200;

/**
 * `parseInt("abc", 10)` is `NaN`, and `.range(0, NaN)` makes PostgREST reject
 * the query — so `?limit=abc` answered 500, which the client directory renders
 * as «تعذّر تحميل دليل المحامين». A malformed query string is not a fact about
 * the profession. `?limit=0` was as bad in a quieter way: `.range(0, -1)` is an
 * inverted range.
 *
 * This clamps rather than rejects, which does mean a caller asking for 1000
 * gets 200 and is not told so in an error — deliberately: `total` is in every
 * response precisely so a caller can detect a short page, and an endpoint that
 * 400s on a large limit just moves the same problem into an error branch.
 */
function intParam(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export async function GET(request: NextRequest) {
  // Service client, deliberately — see the long note in [id]/route.ts. There is
  // no anonymous SELECT policy on profiles/lawyer_profiles, so under the
  // RLS-scoped client this endpoint returned ZERO rows to every logged-out
  // visitor: the public directory was empty for the public. The projection below
  // is already an allow-list and the gates are explicit, which is where the
  // safety has to live once RLS is out of the picture.
  const supabase = await createServiceClient();

  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty");
  const sort = searchParams.get("sort") ?? "experience";
  const available = searchParams.get("available");
  const limit = intParam(searchParams.get("limit"), 20, 1, MAX_LIMIT);
  const offset = intParam(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

  // LAWYER-6.1: explicit projection — never SELECT profiles.phone/email (raw PII).
  // license_number is projected but stripped per-row below unless show_contact.
  // `slug` (item 130) rides the same embed and is promoted to the row's top
  // level below, alongside `reviewStats`.
  let query = supabase
    .from("profiles")
    .select(
      "id, display_name, display_name_en, avatar_url, city, user_type, " +
      "lawyer_profiles!inner(user_id, slug, specialties, years_experience, hourly_rate, " +
      "bio_ar, bio_en, verification_status, is_accepting_clients, marketplace_visible, " +
      "show_contact, bar_association, license_number)",
      { count: "exact" },
    )
    .eq("user_type", "lawyer")
    .eq("lawyer_profiles.verification_status", "verified")
    // Consent, not just eligibility. `marketplace_visible` was already projected
    // and never filtered on, so a verified lawyer who had not asked to be listed
    // was listed anyway. It defaults to false, which is the right default for
    // publishing a licensed professional's details.
    .eq("lawyer_profiles.marketplace_visible", true)
    .range(offset, offset + limit - 1);

  if (specialty) {
    query = query.contains("lawyer_profiles.specialties", [specialty]);
  }

  if (available === "true") {
    query = query.eq("lawyer_profiles.is_accepting_clients", true);
  }

  // Sorting
  switch (sort) {
    case "price":
      query = query.order("hourly_rate", {
        ascending: true,
        referencedTable: "lawyer_profiles",
      });
      break;
    case "experience":
    default:
      query = query.order("years_experience", {
        ascending: false,
        referencedTable: "lawyer_profiles",
      });
      break;
  }

  const { data, count, error } = await query;

  if (error) {
    // Public, unauthenticated endpoint — never echo the raw Postgres/PostgREST
    // message (e.g. a missing-column error before a pending migration lands).
    console.error("[lawyers GET] query failed:", error.message, error.code);
    return NextResponse.json({ error: "تعذّر تحميل دليل المحامين." }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  // Phase 7 (item 192): review stats are a SEPARATE query — `lawyer_review_stats`
  // is a view PostgREST cannot embed via the `lawyer_profiles!inner(...)` join
  // above (no declared FK). A failed read here must not read as "no reviews":
  // every row gets `reviewStats: null`, same as a genuine zero, and the page
  // that wants to tell the two apart reads the console error, not the JSON.
  const ids = rows
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((v): v is string => v !== null);
  const statsById = new Map<string, { reviewCount: number; avgRating: number | null; lastReviewAt: string | null }>();
  if (ids.length > 0) {
    const { data: statsRows, error: statsError } = await supabase
      .from("lawyer_review_stats")
      .select("lawyer_user_id, review_count, avg_rating, last_review_at")
      .in("lawyer_user_id", ids);
    if (statsError) {
      console.error("[lawyers GET] lawyer_review_stats read failed:", statsError.message);
    } else {
      for (const s of (statsRows ?? []) as Array<{
        lawyer_user_id: string; review_count: number | string | null; avg_rating: number | string | null; last_review_at: string | null;
      }>) {
        statsById.set(s.lawyer_user_id, {
          reviewCount: Number(s.review_count) || 0,
          avgRating: s.avg_rating === null ? null : Number(s.avg_rating),
          lastReviewAt: s.last_review_at,
        });
      }
    }
  }

  // LAWYER-6.1: strip regulated credential PII (license_number) for lawyers who
  // have not opted into public contact disclosure. phone/email are already
  // omitted from the projection above.
  const lawyers = rows.map((row) => {
    const lp = (Array.isArray(row.lawyer_profiles)
      ? row.lawyer_profiles[0]
      : row.lawyer_profiles) as Record<string, unknown> | null;
    if (lp && lp.show_contact !== true) {
      delete lp.license_number;
    }
    // Phase 7 (item 130 · 192): promote slug + review stats to the row's top
    // level so a screen reads `lawyer.slug` / `lawyer.reviewStats` the same
    // way here and on GET /api/v1/lawyers/[id] — never buried one level
    // differently per endpoint.
    row.slug = (lp?.slug as string | null | undefined) ?? null;
    row.reviewStats = (typeof row.id === "string" ? statsById.get(row.id) : undefined) ?? null;
    return row;
  });

  return NextResponse.json({ lawyers, total: count });
}
