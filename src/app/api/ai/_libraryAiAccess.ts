import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLibraryAccessForUser } from '@/lib/access-control';
import { isAuthUnavailable, authUnavailableResponse } from '@/lib/auth/apiAuth';

/**
 * Who may call the library's AI routes (/api/ai/library-chat and
 * /api/ai/explain-article).
 *
 * Both proxy to an n8n RAG agent grounded in the library corpus. Article and
 * precedent text in that corpus is server-only and paywalled (migrations
 * 20260929_01 and 20261016_01), and the agent answers from it and quotes it.
 * So these routes apply the library's own full-access rule: a signed-in user
 * whose tier is pro or higher. That is `getLibraryAccessForUser().hasFullAccess`,
 * the same flag the search and precedent routes use.
 *
 * The check is on FULL access, not per item. A chat answer can draw on any law,
 * and explain-article returns `relatedArticles[].text` from other laws, so a free
 * law or a free first-N article cannot contain what comes back.
 *
 * Returns the response to send, or null when the caller may go on. Call it after
 * the rate limit (it costs a getUser round-trip and two service-role reads) and
 * after the route's "not configured" 503. The client turns 401/403 into "sign in"
 * / "subscribe" (src/app/laws/[slug]/_ai-reply.ts), which must not be offered
 * while the assistant is offline. Call it before the body is read and before any
 * n8n call.
 */
export async function libraryAiAccess(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json(
      { error: 'غير مصرح — يرجى تسجيل الدخول' },
      { status: 401 },
    );
  }

  const { hasFullAccess } = await getLibraryAccessForUser(user.id);
  if (!hasFullAccess) {
    return NextResponse.json(
      { error: 'المساعد الذكي للمكتبة يتطلب اشتراك Pro أو أعلى', requiredTier: 'pro' },
      { status: 403 },
    );
  }

  return null;
}
