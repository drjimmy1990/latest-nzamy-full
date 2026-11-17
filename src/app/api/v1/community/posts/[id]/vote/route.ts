import { NextRequest, NextResponse } from "next/server";
import { dbErrorJson } from "@/lib/api/dbError";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";

/**
 * POST /api/v1/community/posts/[id]/vote — Vote on a post or one of its answers
 * Body: { target_type: 'post'|'answer', target_id, value: 1 | -1 | 0 }
 *
 * One vote per user per target (UNIQUE user_id, target_type, target_id —
 * written as an upsert, so a double click is still one vote). `value: 0`
 * removes the caller's vote (toggle off). RLS (20261016_06): the row is the
 * caller's own and the target is one he may read; nobody else's vote can be
 * written, changed or removed here.
 *
 * vote_count is kept by the database (trigger trg_community_votes_recount,
 * migration 20261016_06): this route only writes the vote row, then reads the
 * target's count back and answers `{ myVote, votes }` — the page shows the
 * server's number, never a locally added one (owner TODO N05-C4).
 *
 * The target must belong to the question in the URL: the post itself, or an
 * answer whose post_id is that question.
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
    return NextResponse.json({ error: "سجّل الدخول للتصويت." }, { status: 401 });
  }
  // D6 (owner ٢٩٨): a frozen account (a pending deletion) changes nothing.
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

  const { id: postId } = await context.params;

  const body = await request.json().catch(() => null);
  const target_type = body?.target_type;
  const target_id = typeof body?.target_id === "string" ? body.target_id : "";
  const value = body?.value;

  if ((target_type !== "post" && target_type !== "answer") || !target_id || (value !== 1 && value !== -1 && value !== 0)) {
    return NextResponse.json(
      { error: "target_type ('post'|'answer'), target_id, and value (1, -1 or 0) are required" },
      { status: 400 },
    );
  }

  const table = target_type === "post" ? "community_posts" : "community_answers";

  // The target belongs to this question (read under RLS: an unreadable target
  // is a 404, the same answer as a missing one).
  if (target_type === "post") {
    if (target_id !== postId) {
      return NextResponse.json({ error: "التصويت لا يخص هذا السؤال." }, { status: 400 });
    }
  } else {
    const { data: answer, error: answerError } = await supabase
      .from("community_answers")
      .select("post_id")
      .eq("id", target_id)
      .maybeSingle();
    if (answerError) return dbErrorJson("community/posts/[id]/vote POST answer", answerError);
    if (!answer) return NextResponse.json({ error: "الإجابة غير موجودة." }, { status: 404 });
    if (answer.post_id !== postId) {
      return NextResponse.json({ error: "التصويت لا يخص هذا السؤال." }, { status: 400 });
    }
  }

  const write =
    value === 0
      ? await supabase
          .from("community_votes")
          .delete()
          .eq("user_id", user.id)
          .eq("target_type", target_type)
          .eq("target_id", target_id)
      : await supabase
          .from("community_votes")
          .upsert(
            { user_id: user.id, target_type, target_id, value },
            { onConflict: "user_id,target_type,target_id" },
          );

  if (write.error) {
    // 42501: RLS refused — the target is not one this account may read.
    if (write.error.code === "42501") {
      return dbErrorJson("community/posts/[id]/vote POST", write.error, 403, {
        message: "لا يمكنك التصويت على هذا المحتوى.",
      });
    }
    return dbErrorJson("community/posts/[id]/vote POST", write.error);
  }

  const { data: target, error: readError } = await supabase
    .from(table)
    .select("vote_count")
    .eq("id", target_id)
    .maybeSingle();
  if (readError) return dbErrorJson("community/posts/[id]/vote POST recount", readError);

  return NextResponse.json({
    data: {
      target_type,
      target_id,
      myVote: value,
      votes: typeof target?.vote_count === "number" ? target.vote_count : 0,
    },
  });
}
