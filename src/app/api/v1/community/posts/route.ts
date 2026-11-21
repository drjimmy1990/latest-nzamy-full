import { after, NextRequest, NextResponse } from "next/server";
import { runCommunityAiReview } from "@/lib/community/aiReviewServer";
import { dbErrorJson } from "@/lib/api/dbError";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";
import {
  LIST_SELECT,
  dbCategoryFor,
  linkIssueIn,
  toFeedItem,
  visibilityForTab,
} from "./_feed";
import {
  COMMUNITY_SEARCH_CONFIG,
  buildCommunityTsQuery,
  communitySortColumns,
  communitySortFor,
} from "./_search";
import { viewerStateFor } from "./_viewer";
import { OWN_POST_STATUSES, PUBLIC_POST_STATUSES, postedNoticeAr, reviewStateOf } from "@/lib/community/review";
import { maskCommunityFields, piiMaskedNoticeAr } from "@/lib/community/piiMask";
import { LAWYERS_SPACE_REFUSAL_AR, canUseLawyersSpace } from "./_lawyersSpace";

/**
 * GET /api/v1/community/posts — List community posts
 * Query params:
 *   - limit (default: 20)
 *   - offset (default: 0)
 *   - tab ('public' | 'lawyers') or visibility ('public' | 'lawyers_only' | 'private')
 *   - category (a UI category id or a community_posts.category value)
 *   - q        server search over title + body (N05-C8): Arabic-folded,
 *              'simple' config, see ./_search.ts. It searches every post the
 *              reader may see, not only the page already on screen.
 *   - sort     'hot' (votes) | 'top' (answers) | 'new' (default) — ordered
 *              here, so «تحميل المزيد» continues the same order.
 *   - mine=1   the signed-in reader's own questions, any visibility.
 *
 * A signed-in reader's rows also carry `myVote` and `saved` (his own
 * community_votes / community_saves rows — RLS lets him read only those).
 *
 * Item 53 (فك قفل القراءة half only — the 27-category unification and the
 * SSR/Schema.org half are NOT done here). The RLS policy "anyone reads
 * public community posts" (20260603_phase1_004_community_features.sql:435)
 * already lets an anonymous session read `status in ('active','closed')`
 * rows with `visibility = 'public'` — no `to authenticated` restriction on
 * that policy. So a guest is a legitimate reader, not an intruder, and this
 * route no longer 401s them. A guest cannot ask for `lawyers_only` or
 * `private` via `?visibility=`/`?tab=` — that param is ignored for them and
 * `visibility` is pinned to `'public'`.
 *
 * The rows go out in the feed's own shape (`toFeedItem`, ./_feed.ts): the page
 * filters on `tab`, which no column holds, and the page's `tab=lawyers` is the
 * column's `lawyers_only` — both used to make every real post disappear.
 * The category filter reads the `category` column (it read `tags`, which the
 * ask form never fills).
 *
 * RLS decides who reads a `lawyers_only` post: its author, verified lawyers
 * (20261016_06) and the owner of a verified firm (20261201_50, N05-C2).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const visibility = user
    ? visibilityForTab(searchParams.get("visibility") ?? searchParams.get("tab"))
    : "public";
  const rawCategory = searchParams.get("category");
  const category = dbCategoryFor(rawCategory);
  const mine = user != null && searchParams.get("mine") === "1";
  const rawQuery = (searchParams.get("q") ?? "").trim();
  const tsQuery = rawQuery ? buildCommunityTsQuery(rawQuery) : null;

  // A category the column cannot hold matches nothing — it must not silently
  // widen to "all". Likewise a search with nothing searchable left in it
  // («!!!») finds nothing; it is not a request for every post.
  if ((rawCategory && rawCategory !== "all" && !category) || (rawQuery && !tsQuery)) {
    return NextResponse.json({ data: [], total: 0 });
  }

  // Owner ٤٢ (20261127_60): an allow-list, not a deny-list — a row under
  // review or rejected is never in the public feed. «أسئلتي» (mine=1) also
  // lists the author's own rows under review (RLS shows them to him only),
  // each carrying reviewState «بانتظار المراجعة» / «مرفوض».
  let query = supabase
    .from("community_posts")
    .select(LIST_SELECT, { count: "exact" })
    .in("status", mine ? [...OWN_POST_STATUSES] : [...PUBLIC_POST_STATUSES]);

  for (const [column, ascending] of communitySortColumns(communitySortFor(searchParams.get("sort")))) {
    query = query.order(column, { ascending });
  }
  query = query.range(offset, offset + limit - 1);

  if (mine) {
    query = query.eq("author_id", user.id);
  } else if (visibility) {
    query = query.eq("visibility", visibility);
  }

  if (category) {
    query = query.eq("category", category);
  }

  if (tsQuery) {
    query = query.textSearch("search_fts", tsQuery, { config: COMMUNITY_SEARCH_CONFIG });
  }

  const { data, count, error } = await query;

  if (error) {
    return dbErrorJson("community/posts GET", error);
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const viewer = await viewerStateFor(supabase, user?.id ?? null, rows.map((r) => String(r.id ?? "")));
  return NextResponse.json({
    data: rows.map((r) => toFeedItem(r, viewer.forPost(String(r.id ?? "")))),
    total: count,
  });
}

/**
 * POST /api/v1/community/posts — Create a new community post
 * Body: { title, body?, category?, visibility? | tab?, tags? }
 *
 * - `category` is stored (it was dropped, so every post was `general`).
 * - `lawyers_only` is accepted from a verified lawyer or the owner of a
 *   verified firm (N05-C2, owner ٤٢ — ./_lawyersSpace.ts; the RLS insert
 *   policy applies the same rule).
 * - S5-3: phone numbers, e-mails, national/iqama IDs, IBANs and CR numbers
 *   in the title, body or tags are masked before the row is stored
 *   (src/lib/community/piiMask.ts); the answer carries `masked` (the kinds)
 *   and `maskedNotice` for the author. A link or an account handle is still
 *   refused (linkIssueIn).
 * - Owner ٤٢: the answer says whether the post is public yet (`pendingReview`
 *   + the Arabic `message`).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json(
      { error: "سجّل الدخول لنشر سؤال في المجتمع." },
      { status: 401 },
    );
  }
  // D6 (owner ٢٩٨): a frozen account (a pending deletion) changes nothing.
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

  const body = await request.json();

  if (!body.title) {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 },
    );
  }

  const rawTags: string[] = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string") : [];
  // S5-3: mask personal data server-side; only the masked text is stored.
  const { fields: clean, kinds: masked } = maskCommunityFields({
    title: String(body.title),
    body: typeof body.body === "string" ? body.body : "",
    tags: rawTags,
  });
  const linkIssue = linkIssueIn([clean.title, clean.body, clean.tags]);
  if (linkIssue) {
    return NextResponse.json({ error: linkIssue }, { status: 400 });
  }

  const requested = body.visibility ?? body.tab;
  const visibility = requested == null ? "public" : visibilityForTab(String(requested));
  if (!visibility) {
    return NextResponse.json({ error: "قيمة الظهور غير صالحة." }, { status: 400 });
  }
  if (visibility === "lawyers_only" && !(await canUseLawyersSpace(supabase, user.id))) {
    return NextResponse.json({ error: LAWYERS_SPACE_REFUSAL_AR }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      author_id: user.id,
      title: clean.title,
      body: clean.body,
      category: dbCategoryFor(body.category) ?? "general",
      visibility,
      tags: clean.tags,
    })
    .select()
    .single();

  if (error) {
    return dbErrorJson("community/posts POST", error);
  }

  // Owner ٤٢: while review before publishing is on, the database stores the
  // post as pending_review (trigger, 20261127_60); say so instead of «نُشر».
  const pendingReview = reviewStateOf((data as { status?: unknown } | null)?.status) === "pending";
  // Q131a (l12): the AI pre-publish review runs after the response; it is a
  // no-op unless switched on, and anything but a clear verdict leaves the
  // post pending for the human queue (src/lib/community/aiReviewServer.ts).
  const postId = (data as { id?: unknown } | null)?.id;
  if (pendingReview && typeof postId === "string") after(() => runCommunityAiReview("post", postId));
  return NextResponse.json(
    {
      data,
      pendingReview,
      message: postedNoticeAr("post", pendingReview),
      masked,
      maskedNotice: piiMaskedNoticeAr(masked),
    },
    { status: 201 },
  );
}
