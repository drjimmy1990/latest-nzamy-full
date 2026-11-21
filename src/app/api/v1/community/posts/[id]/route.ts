import { after, NextRequest, NextResponse } from "next/server";
import { runCommunityAiReview } from "@/lib/community/aiReviewServer";
import { dbErrorJson } from "@/lib/api/dbError";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";
import { DETAIL_SELECT, cleanDetail, linkIssueIn, publicDetail, visibilityForTab } from "../_feed";
import { viewerStateFor } from "../_viewer";
import { reviewStateOf } from "@/lib/community/review";
import { maskCommunityFields, piiMaskedNoticeAr, type PiiKind } from "@/lib/community/piiMask";
import { LAWYERS_SPACE_REFUSAL_AR, canUseLawyersSpace } from "../_lawyersSpace";

/**
 * GET /api/v1/community/posts/[id] — Get single post with all answers
 * Increments view count on each fetch.
 *
 * Item 147. Two additive fixes on top of the existing answers embed,
 * both needed for `src/app/community/[id]/page.tsx`'s `mapStoredReply`
 * (via `mapCommunityAnswer`, src/lib/services/communityAnswerMap.ts) to ever
 * see a real answer instead of silently catching a `TypeError` and falling
 * back to mock data:
 *
 *   1. The embed is aliased `answers:` so the response
 *      key matches `StoredCommunityQuestion.answers` — the shape the client
 *      has always been typed for. The un-aliased key (`community_answers`)
 *      made `savedQuestion.answers.map(...)` throw on every real post, which
 *      the page's `catch` swallowed into the static `REPLIES` mock — so no
 *      real answer, lawyer or not, could ever have reached mapStoredReply.
 *   2. (Owner ٤٢, 18 Nov 2026: the answers no longer carry `lawyerSlug` —
 *      names are hidden, and a profile slug is a name. Each answer carries
 *      `verifiedOffice` («مكتب موثّق») instead; see below.)
 *
 * `is_lawyer_verified` itself needs no route change — it is already a real
 * column on every answer row.
 *
 * The embed names its foreign key (DETAIL_SELECT, ../_feed.ts): a second FK
 * (`community_posts.accepted_answer_id`) joins the same two tables, and the
 * bare embed failed every read with PGRST201.
 *
 * Guests may read. The list route already serves them public posts, and the
 * RLS policies used here ("anyone reads public community posts", "anyone
 * reads active community answers") carry no `to authenticated` restriction —
 * a 401 here sent every guest who clicked a question from the list to the
 * page's error state. Only the view-count write still needs a session.
 *
 * Post and answer text pass through the contact filter (cleanDetail) before
 * they leave the server.
 *
 * Reader state (owner TODO N05-C4..7), computed here so the page never needs
 * an author id: `myVote` on the post and on each answer (the reader's own
 * community_votes rows), `saved` (his community_saves row) and `isMine` (he
 * asked this question — only then does the page offer «اختر أفضل إجابة»).
 * All three are false/0 for a guest. Names stay anonymous (owner question ٤٢).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { id } = await context.params;

  // Fetch post with answers
  const { data: post, error } = await supabase
    .from("community_posts")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .single();

  if (error) {
    // PGRST116 = no row (or not readable): a real "not found". Anything else —
    // a timeout, an ambiguous embed — is a failed read, not a missing question.
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "هذا السؤال غير موجود" }, { status: 404 });
    }
    console.error("[community/posts/[id] GET] read failed:", error.message, error.code);
    return NextResponse.json({ error: "تعذّر تحميل السؤال" }, { status: 500 });
  }

  // One view, counted by the database (migration 20261016_06): the function
  // adds 1 only when the caller may read the post, for guests too. Before
  // that migration the RPC does not exist and the error is ignored — the old
  // direct update only ever passed for the post's own author anyway.
  await supabase.rpc("community_record_view", { p_post_id: id });

  type RawAnswer = { id: string; author_id: string; is_lawyer_verified: boolean; status?: string; review_note?: string | null };
  const answers: RawAnswer[] = Array.isArray(post.answers) ? post.answers : [];

  // Owner ٤٢ (18 Nov): names are hidden — no profile slug is resolved or sent
  // (a slug is a name). What a reader learns about a writer is a badge only:
  // «محامٍ موثّق» (is_lawyer_verified) or «مكتب موثّق» (a firm with a verified
  // CR and a lawyer whose licence is valid — community_verified_office_users,
  // 20261127_60, read with the service role; the author ids never leave here).
  // Before that file runs, or on any error, no answer gets the office badge.
  const officeAuthors = new Set<string>();
  const authorIds = Array.from(
    new Set(answers.map((a) => a?.author_id).filter((v): v is string => typeof v === "string" && v.length > 0)),
  ).slice(0, 200);
  if (authorIds.length > 0) {
    try {
      const service = await createServiceClient();
      const { data: officeRows, error: officeError } = await service.rpc("community_verified_office_users", {
        p_ids: authorIds,
      });
      if (officeError) {
        if (officeError.code !== "PGRST202" && officeError.code !== "42883") {
          console.error("[community/posts/[id] GET] office badge read failed:", officeError.code);
        }
      } else {
        for (const r of (Array.isArray(officeRows) ? officeRows : []) as unknown[]) {
          const id = typeof r === "string" ? r : (r as { community_verified_office_users?: unknown } | null)?.community_verified_office_users;
          if (typeof id === "string") officeAuthors.add(id);
        }
      }
    } catch (err) {
      console.error("[community/posts/[id] GET] office badge read threw:", err instanceof Error ? err.name : "error");
    }
  }

  const viewer = await viewerStateFor(
    supabase,
    user?.id ?? null,
    [id],
    answers.map((a) => String(a?.id ?? "")),
  );

  // RLS (20261127_60) adds the reader's OWN answers under review to the embed;
  // nobody else's. They carry reviewState for «بانتظار المراجعة».
  const answersWithState = answers.map((a) => ({
    ...a,
    verifiedOffice: officeAuthors.has(a.author_id),
    myVote: viewer.voteOn("answer", String(a.id)),
    reviewState: reviewStateOf(a.status),
    review_note: reviewStateOf(a.status) === "rejected" ? (a.review_note ?? null) : null,
  }));

  const isMine = user != null && (post as { author_id?: unknown }).author_id === user.id;

  return NextResponse.json({
    data: publicDetail(cleanDetail({
      ...post,
      answers: answersWithState,
      myVote: viewer.voteOn("post", id),
      saved: viewer.savedPost(id),
      isMine,
      reviewState: reviewStateOf((post as { status?: unknown }).status),
    })),
  });
}

/**
 * PATCH /api/v1/community/posts/[id] — Update post (owner only)
 * Allowlist: title, body, category, tags
 *
 * S5-3: an edit is masked like a new post (src/lib/community/piiMask.ts) —
 * otherwise an edit after approval would be the way round the mask — and
 * the answer carries `masked` / `maskedNotice`. A link or handle is refused.
 * N05-C2: moving a post into lawyers-only follows ../_lawyersSpace.ts.
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

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // D6 (owner ٢٩٨): a frozen account (a pending deletion) changes nothing.
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

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

  // S5-3: mask the text fields that are present; only masked text is stored.
  let masked: PiiKind[] = [];
  const textFields: Record<string, unknown> = {};
  for (const key of ["title", "body", "tags"]) {
    if (key in updates) textFields[key] = updates[key];
  }
  if (Object.keys(textFields).length > 0) {
    const result = maskCommunityFields(textFields);
    Object.assign(updates, result.fields);
    masked = result.kinds;
  }
  const linkIssue = linkIssueIn([updates.title, updates.body, updates.tags]);
  if (linkIssue) {
    return NextResponse.json({ error: linkIssue }, { status: 400 });
  }

  if ("visibility" in updates) {
    const visibility = visibilityForTab(String(updates.visibility ?? ""));
    if (!visibility) {
      return NextResponse.json({ error: "قيمة الظهور غير صالحة." }, { status: 400 });
    }
    if (visibility === "lawyers_only" && !(await canUseLawyersSpace(supabase, user.id))) {
      return NextResponse.json({ error: LAWYERS_SPACE_REFUSAL_AR }, { status: 403 });
    }
    updates.visibility = visibility;
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
    return dbErrorJson("community/posts/[id] PATCH", error);
  }

  // Q131a (l12): an edit the trigger sent back to review goes through the AI
  // pre-publish review too (no-op unless switched on; fail closed).
  if (reviewStateOf((data as { status?: unknown } | null)?.status) === "pending") {
    after(() => runCommunityAiReview("post", id));
  }
  return NextResponse.json({ data, masked, maskedNotice: piiMaskedNoticeAr(masked) });
}
