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
  let query = supabase
    .from("profiles")
    .select(
      "id, display_name, display_name_en, avatar_url, city, user_type, " +
      "lawyer_profiles!inner(user_id, specialties, years_experience, hourly_rate, " +
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // LAWYER-6.1: strip regulated credential PII (license_number) for lawyers who
  // have not opted into public contact disclosure. phone/email are already
  // omitted from the projection above.
  const lawyers = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const lp = (Array.isArray(row.lawyer_profiles)
      ? row.lawyer_profiles[0]
      : row.lawyer_profiles) as Record<string, unknown> | null;
    if (lp && lp.show_contact !== true) {
      delete lp.license_number;
    }
    return row;
  });

  return NextResponse.json({ lawyers, total: count });
}
