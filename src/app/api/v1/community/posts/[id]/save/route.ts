import { NextRequest, NextResponse } from "next/server";
import { dbErrorJson } from "@/lib/api/dbError";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";

/**
 * POST   /api/v1/community/posts/[id]/save — «حفظ» a question for later
 * DELETE /api/v1/community/posts/[id]/save — remove it from the saved list
 *
 * One row per user and post in public.community_saves (migration 20261125_53).
 * RLS: a user writes and removes only his own rows, and saves only a question
 * he may read (community_post_readable). Saving twice is still one save.
 * The saved list is GET /api/v1/community/saved (page /community/me).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (isAuthUnavailable(user, authError)) return { refusal: authUnavailableResponse() } as const;
  if (!user) {
    return { refusal: NextResponse.json({ error: "سجّل الدخول لحفظ الأسئلة." }, { status: 401 }) } as const;
  }
  const frozen = frozenAccountResponse(user);
  if (frozen) return { refusal: frozen } as const;
  return { supabase, user } as const;
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await signedIn();
  if ("refusal" in session) return session.refusal;
  const { supabase, user } = session;

  const { id: postId } = await context.params;
  if (!UUID.test(postId)) return NextResponse.json({ error: "هذا السؤال غير موجود" }, { status: 404 });

  const { error } = await supabase
    .from("community_saves")
    .upsert({ user_id: user.id, post_id: postId }, { onConflict: "user_id,post_id", ignoreDuplicates: true });

  if (error) {
    // 42501: RLS refused — not a question this account may read. 23503: no such post.
    if (error.code === "42501" || error.code === "23503") {
      return dbErrorJson("community/posts/[id]/save POST", error, 404, { message: "هذا السؤال غير موجود" });
    }
    return dbErrorJson("community/posts/[id]/save POST", error);
  }
  return NextResponse.json({ data: { saved: true } });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await signedIn();
  if ("refusal" in session) return session.refusal;
  const { supabase, user } = session;

  const { id: postId } = await context.params;
  if (!UUID.test(postId)) return NextResponse.json({ error: "هذا السؤال غير موجود" }, { status: 404 });

  const { error } = await supabase
    .from("community_saves")
    .delete()
    .eq("user_id", user.id)
    .eq("post_id", postId);
  if (error) return dbErrorJson("community/posts/[id]/save DELETE", error);
  return NextResponse.json({ data: { saved: false } });
}
