import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/community/posts/[id]/answers — Add an answer to a post
 * Body: { content }
 *
 * Item 147. `is_lawyer_verified` is set here from the answering user's OWN
 * `lawyer_profiles.verification_status`, read server-side under RLS
 * ("lawyers read own profile", user_id = auth.uid()) — never from a
 * client-sent `authorType` (the request body's `authorType`, if a caller
 * sends one, is not read at all). A user with no `lawyer_profiles` row is
 * simply not a lawyer, which reads back `null` here and correctly becomes
 * `false`. This is what lets `mapCommunityAnswer` (item 147's read side,
 * src/lib/services/communityAnswerMap.ts) show the lawyer badge/CTA off a
 * real column instead of an always-false default.
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

  const { data: lawyerProfile } = await supabase
    .from("lawyer_profiles")
    .select("verification_status")
    .eq("user_id", user.id)
    .maybeSingle();
  const isLawyerVerified = lawyerProfile?.verification_status === "verified";

  const { data, error } = await supabase
    .from("community_answers")
    .insert({
      post_id: postId,
      author_id: user.id,
      body: body.body ?? body.content,
      is_lawyer_verified: isLawyerVerified,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
