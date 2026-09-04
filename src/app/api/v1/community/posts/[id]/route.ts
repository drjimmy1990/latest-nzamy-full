import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/community/posts/[id] — Get single post with all answers
 * Increments view count on each fetch.
 *
 * Item 147. Two additive fixes on top of the existing `*, community_answers(*)`
 * select, both needed for `src/app/community/[id]/page.tsx`'s `mapStoredReply`
 * (via `mapCommunityAnswer`, src/lib/services/communityAnswerMap.ts) to ever
 * see a real answer instead of silently catching a `TypeError` and falling
 * back to mock data:
 *
 *   1. The embed is aliased `answers:community_answers(*)` so the response
 *      key matches `StoredCommunityQuestion.answers` — the shape the client
 *      has always been typed for. The un-aliased key (`community_answers`)
 *      made `savedQuestion.answers.map(...)` throw on every real post, which
 *      the page's `catch` swallowed into the static `REPLIES` mock — so no
 *      real answer, lawyer or not, could ever have reached mapStoredReply.
 *   2. Each answer additionally carries `lawyerSlug`, resolved below. Raw
 *      `community_answers` rows have no such column (only `author_id`).
 *      Unlike `profiles` (no public SELECT policy — see
 *      src/app/api/v1/lawyers/route.ts's own note on why THAT lookup needs a
 *      service client), `lawyer_profiles` itself carries a `to public`
 *      policy ("public read verified lawyers", no `to authenticated`
 *      restriction, 20260603_phase1_001_profiles.sql:131-133) covering
 *      exactly the predicate queried below (`verification_status =
 *      'verified' and marketplace_visible = true`) — so the already-open
 *      RLS-scoped `supabase` client used for the rest of this handler reads
 *      the identical rows a service client would, no bypass needed. A lawyer
 *      who hasn't chosen a slug, or isn't verified + marketplace-visible,
 *      gets `lawyerSlug: null`, not a fabricated one.
 *
 * `is_lawyer_verified` itself needs no route change — it is already a real
 * column on `community_answers(*)`.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Fetch post with answers
  const { data: post, error } = await supabase
    .from("community_posts")
    .select("*, answers:community_answers(*)")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  // Increment view count
  await supabase
    .from("community_posts")
    .update({ view_count: (post.view_count ?? 0) + 1 })
    .eq("id", id);

  type RawAnswer = { id: string; author_id: string; is_lawyer_verified: boolean };
  const answers: RawAnswer[] = Array.isArray(post.answers) ? post.answers : [];

  const lawyerAuthorIds = Array.from(
    new Set(
      answers
        .filter((a) => a?.is_lawyer_verified === true)
        .map((a) => a?.author_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );

  const slugByAuthor = new Map<string, string>();
  if (lawyerAuthorIds.length > 0) {
    const { data: lawyerRows } = await supabase
      .from("lawyer_profiles")
      .select("user_id, slug")
      .in("user_id", lawyerAuthorIds)
      .eq("verification_status", "verified")
      .eq("marketplace_visible", true);
    for (const row of lawyerRows ?? []) {
      if (typeof row.user_id === "string" && typeof row.slug === "string" && row.slug.length > 0) {
        slugByAuthor.set(row.user_id, row.slug);
      }
    }
  }

  const answersWithSlug = answers.map((a) => ({
    ...a,
    lawyerSlug: slugByAuthor.get(a.author_id) ?? null,
  }));

  return NextResponse.json({ data: { ...post, answers: answersWithSlug } });
}

/**
 * PATCH /api/v1/community/posts/[id] — Update post (owner only)
 * Allowlist: title, body, category, tags
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from("community_posts")
    .select("author_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (existing.author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const allowedFields = ["title", "body", "visibility", "tags"];
  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("community_posts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
