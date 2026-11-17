import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserTier, isPlatformAdmin, TIER_RANK } from '@/lib/access-control';
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from '@/lib/auth/apiAuth';
import { hasActiveLibraryGrant } from '@/lib/libraryAccessServer';
import { libraryAiDecision, libraryAiReads } from './libraryAiDecision';
import { isFounderMemberForTool } from './_founderToolMember';

/**
 * Who may use the library's AI: POST /api/v1/ai/runs asks this for every
 * library tool (runs/route.ts libraryAccess), before the charge. (It first
 * guarded the old free routes /api/ai/library-chat and /api/ai/explain-article,
 * now deleted: owner q374 / q379, library AI for points only.)
 *
 * The tool answers from an n8n agent grounded in the library corpus. Article and
 * precedent text in that corpus is server-only and paywalled (migrations
 * 20260929_01 and 20261016_01), and the agent answers from it and quotes it.
 *
 * The rule is libraryAiDecision() in ./libraryAiDecision.ts: a signed-in user
 * whose tier is pro or higher, or a platform admin (owner answers ٢٠٦ / ٢٠٩);
 * plus, for named tools only (libraryAiReads):
 *   - an active founder member, for the founder plan's own tools (0.5, owner
 *     package 17 Nov: the drafter and the four independent-output tools —
 *     founder activation writes no subscriptions row, so the Pro rule alone
 *     refused what he paid for) and for the library assistant (owner ٥ / ١٥);
 *   - an active library grant holder (a library subscriber), for the library
 *     assistant ONLY (owner ٥ / ١٥, 17 Nov 2026, replacing ٢٠٧). Every other
 *     library tool keeps the Pro rule; the grant is not even read for them.
 * Opening the assistant is not free: every question is charged its points
 * (runCore.ts); only the founder's 20 library questions are paid from his
 * membership credit.
 *
 * The check is all or nothing, not per item. An answer can draw on any law
 * and quote other laws' text, so a free law or a free first-N article cannot
 * contain what comes back.
 *
 * Returns the response to send, or null when the caller may go on. Call it after
 * the rate limit (it costs a getUser round-trip and, for a signed-in user,
 * service-role reads run together: subscriptions for the tier, profiles for
 * the admin flag, and — only for the tools that need them — the founder seat
 * and the library grant) and after the route's "not configured" 503. The
 * client turns 401/403 into "sign in" / "subscribe"
 * (src/app/laws/[slug]/_ai-reply.ts), which must not be offered while the
 * assistant is offline. Call it before the body is read and before any n8n
 * call. A failed founder or grant read answers false: it never opens the
 * assistant.
 */
export async function libraryAiAccess(toolId?: string): Promise<NextResponse | null> {
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
  // D6 (owner ٢٩٨): a frozen account (a pending deletion) uses no assistant.
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

  const reads = libraryAiReads(toolId);
  const [tier, isAdmin, founderMember, libraryGrant] = await Promise.all([
    getUserTier(user.id),
    isPlatformAdmin(user.id),
    reads.founderSeat ? isFounderMemberForTool(user.id, toolId) : Promise.resolve(false),
    reads.libraryGrant ? hasActiveLibraryGrant(user.id) : Promise.resolve(false),
  ]);
  const decision = libraryAiDecision({ signedIn: true, tier, isAdmin, founderMember, libraryGrant }, TIER_RANK);
  if (decision === 'allow') return null;

  // `upgrade`, and anything else the rule may answer: closed. The library
  // assistant also opens with a library subscription; the other library
  // tools need Pro.
  return NextResponse.json(
    {
      error: reads.libraryGrant
        ? 'المساعد الذكي للمكتبة يتطلب اشتراك المكتبة أو اشتراك Pro أو أعلى'
        : 'المساعد الذكي للمكتبة يتطلب اشتراك Pro أو أعلى',
      requiredTier: 'pro',
    },
    { status: 403 },
  );
}
