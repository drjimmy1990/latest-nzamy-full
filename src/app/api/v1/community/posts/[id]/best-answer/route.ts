import { NextRequest, NextResponse } from "next/server";
import { dbErrorJson } from "@/lib/api/dbError";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";

/**
 * POST /api/v1/community/posts/[id]/best-answer — «أفضل إجابة» (owner TODO N05-C7)
 * Body: { answer_id: uuid | null }   (null clears the choice)
 *
 * The question's author marks one answer as the best and may change it later.
 * The check lives in the database, not here: public.community_set_best_answer
 * (migration 20261125_53, SECURITY DEFINER) accepts the caller only when he is
 * the post's author and the answer is an active answer of that same post.
 * accepted_answer_id is not a column the author can UPDATE directly
 * (20261016_06 column grants), so this RPC is the only way to set it.
 */
const ANSWERS: Record<string, { status: number; error: string }> = {
  not_signed_in: { status: 401, error: "سجّل الدخول لاختيار أفضل إجابة." },
  not_found: { status: 404, error: "هذا السؤال غير موجود" },
  not_author: { status: 403, error: "اختيار أفضل إجابة لصاحب السؤال فقط." },
  bad_answer: { status: 400, error: "هذه الإجابة ليست من إجابات هذا السؤال." },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!user) return NextResponse.json({ error: ANSWERS.not_signed_in.error }, { status: 401 });
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

  const { id: postId } = await context.params;
  const body = await request.json().catch(() => null);
  const answerId = body?.answer_id ?? null;

  if (!UUID.test(postId) || (answerId !== null && (typeof answerId !== "string" || !UUID.test(answerId)))) {
    return NextResponse.json({ error: "answer_id (uuid or null) is required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("community_set_best_answer", {
    p_post_id: postId,
    p_answer_id: answerId,
  });
  if (error) return dbErrorJson("community/posts/[id]/best-answer POST", error);

  if (data !== "ok") {
    const refusal = ANSWERS[String(data)] ?? { status: 500, error: "تعذّر حفظ أفضل إجابة." };
    return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  }

  return NextResponse.json({ data: { accepted_answer_id: answerId } });
}
