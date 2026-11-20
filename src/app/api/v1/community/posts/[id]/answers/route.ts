import { NextRequest, NextResponse } from "next/server";
import { dbErrorJson } from "@/lib/api/dbError";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";
import { linkIssueIn } from "../../_feed";
import { postedNoticeAr, reviewStateOf } from "@/lib/community/review";
import { maskCommunityPii, piiMaskedNoticeAr } from "@/lib/community/piiMask";

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
 *
 * S5-3: phone numbers, e-mails, national/iqama IDs, IBANs and CR numbers
 * are masked before the answer is stored (src/lib/community/piiMask.ts) —
 * the same rule for every author — and the answer says what was hidden
 * (`masked`, `maskedNotice`). A link or an account handle is still refused.
 * (The community has no separate comments: an answer is the reply.)
 *
 * N05-C2: the owner of a verified firm may answer a lawyers-only post (the
 * RLS insert policy follows community_post_readable, 20261201_50); his
 * answer never carries the lawyer badge — `is_lawyer_verified` still comes
 * from his own lawyer_profiles row only.
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
    return NextResponse.json({ error: "سجّل الدخول لإضافة إجابة." }, { status: 401 });
  }
  // D6 (owner ٢٩٨): a frozen account (a pending deletion) changes nothing.
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

  const { id: postId } = await context.params;
  const body = await request.json();

  if (!body.content && !body.body) {
    return NextResponse.json(
      { error: "body is required" },
      { status: 400 },
    );
  }

  const rawText = body.body ?? body.content;
  const { text: answerText, kinds: masked } = maskCommunityPii(typeof rawText === "string" ? rawText : String(rawText));
  const linkIssue = linkIssueIn([answerText]);
  if (linkIssue) {
    return NextResponse.json({ error: linkIssue }, { status: 400 });
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
      body: answerText,
      is_lawyer_verified: isLawyerVerified,
    })
    .select()
    .single();

  if (error) {
    return dbErrorJson("community/posts/[id]/answers POST", error);
  }

  // Owner ٤٢: an answer also waits for review while the setting is on.
  const pendingReview = reviewStateOf((data as { status?: unknown } | null)?.status) === "pending";
  return NextResponse.json(
    {
      data,
      pendingReview,
      message: postedNoticeAr("answer", pendingReview),
      masked,
      maskedNotice: piiMaskedNoticeAr(masked),
    },
    { status: 201 },
  );
}
