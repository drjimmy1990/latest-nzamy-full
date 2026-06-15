import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/community/posts/[id]/answers — Add an answer to a post
 * Body: { content }
 */
export async function POST(
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

  const { id: postId } = await context.params;
  const body = await request.json();

  if (!body.content && !body.body) {
    return NextResponse.json(
      { error: "body is required" },
      { status: 400 },
    );
  }

  // Verify post exists
  const { data: post, error: postError } = await supabase
    .from("community_posts")
    .select("id")
    .eq("id", postId)
    .single();

  if (postError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("community_answers")
    .insert({
      post_id: postId,
      author_id: user.id,
      body: body.body ?? body.content,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
