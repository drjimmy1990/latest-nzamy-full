import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/community/posts — List community posts
 * Query params:
 *   - limit (default: 20)
 *   - offset (default: 0)
 *   - visibility ('public' | 'lawyers_only' | 'private')
 *   - category (text filter)
 *
 * Item 53 (فك قفل القراءة half only — the 27-category unification and the
 * SSR/Schema.org half are NOT done here). The RLS policy "anyone reads
 * public community posts" (20260603_phase1_004_community_features.sql:435)
 * already lets an anonymous session read `status in ('active','closed')`
 * rows with `visibility = 'public'` — no `to authenticated` restriction on
 * that policy. So a guest is a legitimate reader, not an intruder, and this
 * route no longer 401s them. A guest cannot ask for `lawyers_only` or
 * `private` via `?visibility=`/`?tab=` — that param is ignored for them and
 * `visibility` is pinned to `'public'`. A signed-in caller's request is
 * unchanged byte-for-byte: same params read, same RLS-scoped client, same
 * query shape.
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
    ? (searchParams.get("visibility") ?? searchParams.get("tab"))
    : "public";
  const category = searchParams.get("category");

  let query = supabase
    .from("community_posts")
    .select("*, community_answers(count)", { count: "exact" })
    .neq("status", "deleted")
    .neq("status", "moderated")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (visibility) {
    query = query.eq("visibility", visibility);
  }

  if (category) {
    query = query.contains("tags", [category]);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, total: count });
}

/**
 * POST /api/v1/community/posts — Create a new community post
 * Body: { title, body?, visibility?, tags? }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (!body.title) {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      author_id: user.id,
      title: body.title,
      body: body.body ?? "",
      visibility: body.visibility ?? "public",
      tags: body.tags ?? [],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
