import { createServiceClient } from '@/lib/supabase/server';
import { FOUNDER_CAMPAIGN_ID } from '@/lib/membership/founderPlan';
import { libraryAiReads } from './libraryAiDecision';

/**
 * 0.5 (owner package 17 Nov): is `userId` an ACTIVE founder member asking for
 * one of the founder plan's own tools (founderPlanTool.ts) or for the
 * library's AI assistant (owner ٥ / ١٥, 17 Nov 2026) — libraryAiReads(toolId)
 * .founderSeat? The library AI gate (_libraryAiAccess.ts) lets such a run
 * through: founder activation writes no `subscriptions` row, so the Pro rule
 * alone refused the drafter and the legal opinion he paid for.
 *
 * Active = a founder_seats row of this campaign with status 'active' and an
 * end in the future (founder_activate, 20261101_10). Any read error answers
 * false, so the caller falls back to the Pro rule: a failed read never opens
 * the assistant.
 */
export async function isFounderMemberForTool(userId: string, toolId: string | undefined): Promise<boolean> {
  if (!libraryAiReads(toolId).founderSeat) return false;
  try {
    const admin = await createServiceClient();
    const { data, error } = await admin
      .from('founder_seats')
      .select('id')
      .eq('user_id', userId)
      .eq('campaign_id', FOUNDER_CAMPAIGN_ID)
      .eq('status', 'active')
      .gt('ends_at', new Date().toISOString())
      .limit(1);
    if (error) {
      console.error('[library-ai] founder seat read failed:', error.code, error.message);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.error('[library-ai] founder seat read threw:', err);
    return false;
  }
}
