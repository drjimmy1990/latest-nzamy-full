/**
 * Promotional campaigns (owner answer ١٧٩, 2026-10-16).
 *
 * Offers live in a dismissible banner during a real, dated campaign — never as
 * a permanent badge or promise inside a price card. A campaign shows only
 * between its start and end dates, and the list is EMPTY until the owner sets
 * one: the founder offer he described («فترة المحامي المؤسس», three months of
 * the library + a founder badge) has no dates or delivery yet (owner question
 * ٢١٨), and a banner must not promise what nobody grants.
 *
 * To run a campaign: add an entry with its dates and a CTA that leads to a
 * page that really delivers it, then deploy.
 */

export interface Campaign {
  /** Stable id; also the key the dismissal is remembered under. */
  id: string;
  /** First day shown, `YYYY-MM-DD`, Riyadh time. */
  startsOn: string;
  /** Last day shown, `YYYY-MM-DD`, Riyadh time (inclusive). */
  endsOn: string;
  badgeAr: string;
  messageAr: string;
  ctaAr: string;
  ctaHref: string;
}

export const CAMPAIGNS: readonly Campaign[] = [];

/** Riyadh calendar day (`YYYY-MM-DD`) of an instant. */
export function riyadhDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/** The campaign live on `now`'s Riyadh day, or null. The earliest-ending wins. */
export function activeCampaign(now: Date, campaigns: readonly Campaign[] = CAMPAIGNS): Campaign | null {
  const day = riyadhDay(now);
  const live = campaigns
    .filter((c) => c.startsOn <= c.endsOn && c.startsOn <= day && day <= c.endsOn)
    .sort((a, b) => a.endsOn.localeCompare(b.endsOn));
  return live[0] ?? null;
}
