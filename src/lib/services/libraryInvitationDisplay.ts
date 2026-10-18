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
import { countPhraseAr } from "./arabicCount.ts";

/**
 * The redeem route grants the legal library, not a plan (owner answers
 * ٢٠١–٢٠٣, 2026-10-18), and answers `tier: "library"` — that case has its own
 * sentence below. Any other tier (a response from before that change) keeps
 * the generic label instead of hard-coding "Pro" and mislabeling a tier.
 */
export function tierDisplayAr(tier: string): string {
  return tier === "pro" ? "Pro" : tier;
}

/**
 * The ONE honest sentence this redeem flow gets to say, replacing the old
 * localStorage mock's invented trial-day promises:
 *   - `tier: "library"` → «فُعّل اشتراك المكتبة القانونية لمدة ٣٠ يوماً حتى
 *     ٤ أكتوبر ٢٠٢٦», with the length only when the server reported `days`;
 *   - any other tier → «فُعّلت باقة Pro حتى ٤ أكتوبر ٢٠٢٦».
 * The date clause is dropped when the server did not report an expiry, or
 * reported one formatArabicDate cannot parse — this never prints "Invalid
 * Date" or a fabricated date over a real grant.
 */
export function redeemSuccessMessageAr(tier: string, until: string | null, days?: number | null): string {
  const dateAr = until ? formatArabicDate(until) : null;
  if (tier === "library") {
    const lengthAr =
      typeof days === "number"
        ? countPhraseAr(days, { zero: null, one: "يوم واحد", two: "يومين", few: "أيام", many: "يوماً" })
        : null;
    const base = lengthAr
      ? `فُعّل اشتراك المكتبة القانونية لمدة ${lengthAr}`
      : "فُعّل اشتراك المكتبة القانونية";
    return dateAr ? `${base} حتى ${dateAr}` : base;
  }
  const label = tierDisplayAr(tier);
  return dateAr ? `فُعّلت باقة ${label} حتى ${dateAr}` : `فُعّلت باقة ${label}`;
}
