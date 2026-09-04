/**
 * libraryInvitationDisplay.ts — the Arabic copy for a library invitation
 * redemption result (POST /api/v1/library/invitations/redeem, wired through
 * src/lib/services/libraryInvitationsService.ts's redeemLibraryInvitation).
 *
 * Pure: no I/O, no React, no Supabase — importable by InvitationModal.tsx and
 * by `node --test` alike, same constraint clientDashboardCards.ts documents
 * (whose formatArabicDate this reuses rather than re-implementing).
 */

import { formatArabicDate } from "./clientDashboardCards.ts";

/**
 * The redeem route only ever grants "pro" today (REDEEM_TIER in
 * src/app/api/v1/library/invitations/redeem/route.ts), but the response type
 * is `tier: string`, so this stays generic instead of hard-coding "Pro" and
 * silently mislabeling a future tier.
 */
export function tierDisplayAr(tier: string): string {
  return tier === "pro" ? "Pro" : tier;
}

/**
 * «فُعّلت باقة Pro حتى ٤ أكتوبر ٢٠٢٦» — the ONE honest sentence this whole
 * redeem flow gets to say, replacing the old localStorage mock's invented
 * trial-day promises. Falls back to «فُعّلت باقة Pro» (no date clause) when
 * the server did not report an expiry, or reported one formatArabicDate
 * cannot parse — this never prints "Invalid Date" or a fabricated date over
 * a real grant.
 */
export function redeemSuccessMessageAr(tier: string, until: string | null): string {
  const label = tierDisplayAr(tier);
  const dateAr = until ? formatArabicDate(until) : null;
  return dateAr ? `فُعّلت باقة ${label} حتى ${dateAr}` : `فُعّلت باقة ${label}`;
}
