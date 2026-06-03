import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/community/posts/[id]/vote — Vote on a post or answer
 * Body: { target_type: 'post'|'answer', target_id, value: 1|-1 }
 * Upsert: user can change their vote but not double-vote.
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

    // Update vote count on target: adjust by difference
    const diff = value - existingVote.value;
    if (diff !== 0) {
      const table =
        target_type === "post" ? "community_posts" : "community_answers";
      const { data: target } = await supabase
        .from(table)
        .select("votes")
        .eq("id", target_id)
        .single();

      if (target) {
        await supabase
          .from(table)
          .update({ votes: (target.votes ?? 0) + diff })
          .eq("id", target_id);
      }
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
  const table =
    target_type === "post" ? "community_posts" : "community_answers";
  const { data: target } = await supabase
    .from(table)
    .select("votes")
    .eq("id", target_id)
    .single();

  if (target) {
    await supabase
      .from(table)
      .update({ votes: (target.votes ?? 0) + value })
      .eq("id", target_id);
  }

  return NextResponse.json({ data }, { status: 201 });
}
