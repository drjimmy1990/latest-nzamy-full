import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

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
  "lawyer_profiles!inner(user_id, specialties, years_experience, hourly_rate, " +
  "bio_ar, bio_en, bar_association, license_number, verification_status, " +
  "is_accepting_clients, marketplace_visible, show_contact)";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  // A malformed id is a 404, not a 500 from Postgres' uuid parser.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "المحامي غير موجود" }, { status: 404 });
  }

  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .eq("id", id)
    .eq("user_type", "lawyer")
    .eq("lawyer_profiles.verification_status", "verified")
    .eq("lawyer_profiles.marketplace_visible", true)
    .maybeSingle();

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

  return NextResponse.json({ data: row });
}
