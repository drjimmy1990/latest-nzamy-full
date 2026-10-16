import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { POST_ANSWERS_FK } from "../posts/_feed";
import { tallyAuthors, rankContributors, type ContributorGate } from "./_rank";
import { BETA_MONOPOLY_MODE } from "@/lib/betaConfig";

/**
 * GET /api/v1/community/contributors — the lawyers with the most answers in
 * the public community (public, read-only). Replaces the hardcoded
 * TOP_CONTRIBUTORS list the /community sidebar used to print.
 *
 * Body: `{ data: [{ name, slug, answers }], degraded }`.
 *
 * What is counted: active answers written as a verified lawyer
 * (`is_lawyer_verified`), on public posts only, read under the caller's RLS
 * ("anyone reads active community answers" / "anyone reads public community
 * posts" — both open to guests).
 *
 * Who is listed: only lawyers whose profile is public — verified and
 * `marketplace_visible` — read under the same RLS client (the "public read
 * verified lawyers" policy covers exactly that predicate). Their display name
 * needs the service client, because `profiles` has no public SELECT policy;
 * it is asked for ONLY those already-gated ids, and only `id, display_name`.
 *
 * A scan that hit PostgREST's row ceiling would rank on a partial count, so
 * it is reported as `degraded: true` (the page then hides the widget) rather
 * than shown as a smaller truth — same marker as /api/v1/blog/categories.
 */

/** Rows scanned per request. A count above this is reported as degraded. */
const MAX_SCAN = 5000;
/** Authors checked against the profile gate — well under the `.in()` URL ceiling. */
const MAX_CANDIDATES = 50;
const LIMIT = 5;

export async function GET() {
  // The owner keeps the lawyer directory closed during the beta for privacy
  // (Q151, BETA_MONOPOLY_MODE — /lawyers/browse redirects). A list of lawyers
  // by name with profile links is a small directory, so it waits too. An
  // empty list hides the widget (community/page.tsx).
  if (BETA_MONOPOLY_MODE) return NextResponse.json({ data: [], degraded: false });

  try {
    const supabase = await createClient();

    const { data: answerRows, count, error } = await supabase
      .from("community_answers")
      .select(`author_id, community_posts!${POST_ANSWERS_FK}!inner(visibility)`, { count: "exact" })
      .eq("status", "active")
      .eq("is_lawyer_verified", true)
      .eq("community_posts.visibility", "public")
      .limit(MAX_SCAN);

    if (error) {
      console.error("[community/contributors GET] answers read failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل قائمة المجيبين." }, { status: 500 });
    }

    const rows = (answerRows ?? []) as { author_id?: unknown }[];
    const degraded = typeof count === "number" && count > rows.length;
    const tally = tallyAuthors(rows).slice(0, MAX_CANDIDATES);
    if (tally.length === 0) {
      return NextResponse.json({ data: [], degraded });
    }

    const ids = tally.map(([id]) => id);
    const { data: lawyerRows, error: lawyerError } = await supabase
      .from("lawyer_profiles")
      .select("user_id, slug")
      .in("user_id", ids)
      .eq("verification_status", "verified")
      .eq("marketplace_visible", true);

    if (lawyerError) {
      console.error("[community/contributors GET] lawyer gate failed:", lawyerError.message, lawyerError.code);
      return NextResponse.json({ error: "تعذّر تحميل قائمة المجيبين." }, { status: 500 });
    }

    const gate = new Map<string, ContributorGate>();
    for (const row of (lawyerRows ?? []) as { user_id?: unknown; slug?: unknown }[]) {
      if (typeof row.user_id !== "string") continue;
      gate.set(row.user_id, { slug: typeof row.slug === "string" ? row.slug : null });
    }
    if (gate.size === 0) {
      return NextResponse.json({ data: [], degraded });
    }

    const service = await createServiceClient();
    const { data: profileRows, error: profileError } = await service
      .from("profiles")
      .select("id, display_name")
      .in("id", [...gate.keys()]);

    if (profileError) {
      console.error("[community/contributors GET] names read failed:", profileError.message, profileError.code);
      return NextResponse.json({ error: "تعذّر تحميل قائمة المجيبين." }, { status: 500 });
    }

    const names = new Map<string, string>();
    for (const row of (profileRows ?? []) as { id?: unknown; display_name?: unknown }[]) {
      if (typeof row.id === "string" && typeof row.display_name === "string") {
        names.set(row.id, row.display_name);
      }
    }

    return NextResponse.json({ data: rankContributors(tally, gate, names, LIMIT), degraded });
  } catch (err) {
    console.error("[community/contributors GET] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحميل قائمة المجيبين." }, { status: 500 });
  }
}
