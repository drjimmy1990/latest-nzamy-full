import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserTier, isPlatformAdmin, TIER_RANK } from '@/lib/access-control';
import { isAuthUnavailable, authUnavailableResponse } from '@/lib/auth/apiAuth';
import { libraryAiDecision } from './libraryAiDecision';

/**
 * Who may call the library's AI routes (/api/ai/library-chat and
 * /api/ai/explain-article).
 *
 * Both proxy to an n8n RAG agent grounded in the library corpus. Article and
 * precedent text in that corpus is server-only and paywalled (migrations
 * 20260929_01 and 20261016_01), and the agent answers from it and quotes it.
 *
 * The rule is the assistant's own (owner answers ٢٠٦ / ٢٠٧ / ٢٠٩, decisions of
 * 2026-10-18): a signed-in user whose tier is pro or higher, or a platform
 * admin. It is libraryAiDecision() in ./libraryAiDecision.ts. It is NOT the
 * library's full-access flag (getLibraryAccessForUser().hasFullAccess), which
 * also counts a library subscription: library-only subscribers get the
 * library's texts, not the assistant, so a free user with a library grant is a
 * 403 here.
 *
 * The check is all or nothing, not per item. A chat answer can draw on any law,
 * and explain-article returns `relatedArticles[].text` from other laws, so a
 * free law or a free first-N article cannot contain what comes back.
 *
 * Returns the response to send, or null when the caller may go on. Call it after
 * the rate limit (it costs a getUser round-trip and, for a signed-in user, two
 * service-role reads run together: subscriptions for the tier and profiles for
 * the admin flag) and after the route's "not configured" 503. The client turns
 * 401/403 into "sign in" / "subscribe" (src/app/laws/[slug]/_ai-reply.ts), which
 * must not be offered while the assistant is offline. Call it before the body is
 * read and before any n8n call.
 */
export async function libraryAiAccess(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  // The rule's `sign_in`, answered before any service-role read.
  if (!user) {
    return NextResponse.json(
      { error: 'غير مصرح — يرجى تسجيل الدخول' },
      { status: 401 },
    );
  }

  const [tier, isAdmin] = await Promise.all([getUserTier(user.id), isPlatformAdmin(user.id)]);
  const decision = libraryAiDecision({ signedIn: true, tier, isAdmin }, TIER_RANK);
  if (decision === 'allow') return null;

  // `upgrade`, and anything else the rule may answer: closed. A library
  // subscription does not open the assistant, so the message names Pro.
  return NextResponse.json(
    { error: 'المساعد الذكي للمكتبة يتطلب اشتراك Pro أو أعلى', requiredTier: 'pro' },
    { status: 403 },
  );
}
