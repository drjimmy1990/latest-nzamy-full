import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import {
  LIST_SELECT,
  contactIssueIn,
  dbCategoryFor,
  toFeedItem,
  visibilityForTab,
} from "./_feed";

/**
 * GET /api/v1/community/posts — List community posts
 * Query params:
 *   - limit (default: 20)
 *   - offset (default: 0)
 *   - tab ('public' | 'lawyers') or visibility ('public' | 'lawyers_only' | 'private')
 *   - category (a UI category id or a community_posts.category value)
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
 * The same RLS policy shows a `lawyers_only` post to its author ONLY — not to
 * other lawyers. Until that policy changes, the lawyers tab lists the
 * caller's own lawyers-only posts and nothing else.
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

  // A category the column cannot hold matches nothing — it must not silently
  // widen to "all".
  if (rawCategory && rawCategory !== "all" && !category) {
    return NextResponse.json({ data: [], total: 0 });
  }

  let query = supabase
    .from("community_posts")
    .select(LIST_SELECT, { count: "exact" })
    .neq("status", "deleted")
    .neq("status", "moderated")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (visibility) {
    query = query.eq("visibility", visibility);
  }

  if (category) {
    query = query.eq("category", category);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return NextResponse.json({ data: rows.map(toFeedItem), total: count });
}

/**
 * POST /api/v1/community/posts — Create a new community post
 * Body: { title, body?, category?, visibility? | tab?, tags? }
 *
 * - `category` is stored (it was dropped, so every post was `general`).
 * - `lawyers_only` is accepted from a verified lawyer only, checked on the
 *   caller's own `lawyer_profiles` row (the same check the answers route
 *   uses for `is_lawyer_verified`).
 * - Text carrying a phone number, e-mail, link or handle is refused with the
 *   Arabic reason (contactSanitizer.ts).
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

  const body = await request.json();

  if (!body.title) {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 },
    );
  }

  const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string") : [];
  const contactIssue = contactIssueIn([body.title, body.body, tags]);
  if (contactIssue) {
    return NextResponse.json({ error: contactIssue }, { status: 400 });
  }

  const requested = body.visibility ?? body.tab;
  const visibility = requested == null ? "public" : visibilityForTab(String(requested));
  if (!visibility) {
    return NextResponse.json({ error: "قيمة الظهور غير صالحة." }, { status: 400 });
  }
  if (visibility === "lawyers_only") {
    const { data: lawyerProfile } = await supabase
      .from("lawyer_profiles")
      .select("verification_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (lawyerProfile?.verification_status !== "verified") {
      return NextResponse.json(
        { error: "النشر في مجتمع المحامين متاح للمحامين الموثّقين فقط." },
        { status: 403 },
      );
    }
  }

  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      author_id: user.id,
      title: body.title,
      body: body.body ?? "",
      category: dbCategoryFor(body.category) ?? "general",
      visibility,
      tags,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
