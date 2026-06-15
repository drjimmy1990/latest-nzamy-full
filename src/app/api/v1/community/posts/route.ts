import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/community/posts — List community posts
 * Query params:
 *   - limit (default: 20)
 *   - offset (default: 0)
 *   - visibility ('public' | 'lawyers_only' | 'private')
 *   - category (text filter)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const visibility = searchParams.get("visibility") ?? searchParams.get("tab");
  const category = searchParams.get("category");

  let query = supabase
    .from("community_posts")
    .select("*, community_answers(count)", { count: "exact" })
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
