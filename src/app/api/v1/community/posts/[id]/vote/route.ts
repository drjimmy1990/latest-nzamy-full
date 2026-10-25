import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";

/**
 * POST /api/v1/community/posts/[id]/vote — Vote on a post or answer
 * Body: { target_type: 'post'|'answer', target_id, value: 1|-1 }
 * Upsert: user can change their vote but not double-vote.
 * vote_count is kept by the database (trigger trg_community_votes_recount,
 * migration 20261016_06): this route only writes the vote row. It used to
 * read-modify-write vote_count itself, which RLS let through only for the
 * target's own author, so nobody else's vote was ever counted.
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

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // D6 (owner ٢٩٨): a frozen account (a pending deletion) changes nothing.
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

  // We still resolve params for route consistency
  await context.params;

  const body = await request.json();
  const { target_type, target_id, value } = body;

  if (!target_type || !target_id || (value !== 1 && value !== -1)) {
    return NextResponse.json(
      {
        error:
          "target_type ('post'|'answer'), target_id, and value (1 or -1) are required",
      },
      { status: 400 },
    );
  }

  if (target_type !== "post" && target_type !== "answer") {
    return NextResponse.json(
      { error: "target_type must be 'post' or 'answer'" },
      { status: 400 },
    );
  }

  // Check if user already voted on this target
  const { data: existingVote } = await supabase
    .from("community_votes")
    .select("id, value")
    .eq("user_id", user.id)
    .eq("target_type", target_type)
    .eq("target_id", target_id)
    .maybeSingle();

  if (existingVote) {
    // Update existing vote
    const { data, error } = await supabase
      .from("community_votes")
      .update({ value })
      .eq("id", existingVote.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  }

  // Insert new vote
  const { data, error } = await supabase
    .from("community_votes")
    .insert({
      user_id: user.id,
      target_type,
      target_id,
      value,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Increment vote count on target
  return NextResponse.json({ data }, { status: 201 });
}
