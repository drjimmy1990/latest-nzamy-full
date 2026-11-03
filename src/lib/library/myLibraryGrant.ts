/**
 * The answer of GET /api/v1/library/my-grant (owner note ١٨ C05, LIVE-F05),
 * read defensively: the card and the purchase gates on /laws/subscribe and in
 * the paywall show nothing they cannot read.
 *
 * Relative imports only: `node --test` loads it (myLibraryGrant.test.ts).
 */

import type { LibraryPurchaseRefusal } from './libraryPurchaseEligibility.ts';

export const MY_LIBRARY_GRANT_ENDPOINT = '/api/v1/library/my-grant';

export interface MyLibraryGrant {
  status: 'active' | 'upcoming';
  startsAt: string;
  endsAt: string;
  endsAtAr: string | null;
  daysLeft: number;
  planRef: string;
  planLabel: string | null;
  nextStartsAt: string | null;
}

export type MyLibraryPurchase =
  | { eligible: true }
  | { eligible: false; reason: LibraryPurchaseRefusal; messageAr: string };

export interface MyLibraryGrantAnswer {
  signedIn: boolean;
  grant: MyLibraryGrant | null;
  /** null when unknown (a guest, or a failed read): show the plans, the server still decides. */
  purchase: MyLibraryPurchase | null;
}

const NOTHING: MyLibraryGrantAnswer = { signedIn: false, grant: null, purchase: null };

export function parseMyLibraryGrant(ok: boolean, body: unknown): MyLibraryGrantAnswer {
  if (!ok || !body || typeof body !== 'object') return NOTHING;
  const b = body as Record<string, unknown>;
  const signedIn = b.signedIn === true;
  let grant: MyLibraryGrant | null = null;
  const g = b.grant as Record<string, unknown> | null | undefined;
  if (
    g && typeof g === 'object' &&
    (g.status === 'active' || g.status === 'upcoming') &&
    typeof g.endsAt === 'string' && typeof g.startsAt === 'string' && typeof g.planRef === 'string'
  ) {
    grant = {
      status: g.status,
      startsAt: g.startsAt,
      endsAt: g.endsAt,
      endsAtAr: typeof g.endsAtAr === 'string' ? g.endsAtAr : null,
      daysLeft: typeof g.daysLeft === 'number' && Number.isFinite(g.daysLeft) ? g.daysLeft : 0,
      planRef: g.planRef,
      planLabel: typeof g.planLabel === 'string' ? g.planLabel : null,
      nextStartsAt: typeof g.nextStartsAt === 'string' ? g.nextStartsAt : null,
    };
  }
  let purchase: MyLibraryPurchase | null = null;
  const p = b.purchase as Record<string, unknown> | null | undefined;
  if (p && typeof p === 'object') {
    if (p.eligible === true) purchase = { eligible: true };
    else if (
      p.eligible === false && typeof p.messageAr === 'string' &&
      (p.reason === 'individual' || p.reason === 'not_professional' || p.reason === 'unknown')
    ) {
      purchase = { eligible: false, reason: p.reason, messageAr: p.messageAr };
    }
  }
  return { signedIn, grant, purchase };
}

/** «ساري حتى …» line of the card, or the upcoming wording. */
export function grantHeadlineAr(grant: MyLibraryGrant): string {
  const date = grant.endsAtAr ?? grant.endsAt.slice(0, 10);
  return grant.status === 'active'
    ? `اشتراك المكتبة: ساري حتى ${date}`
    : `اشتراك المكتبة: يبدأ قريباً وينتهي في ${date}`;
}

/** Seven days or less left: the card shows the renew button prominently. */
export function grantNeedsRenewal(grant: MyLibraryGrant): boolean {
  return grant.status === 'active' && grant.daysLeft <= 7;
}
