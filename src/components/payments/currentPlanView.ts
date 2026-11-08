/**
 * currentPlanView.ts — what «باقتك الحالية» says, in Settings → «الاشتراك
 * والباقة» and on /dashboard/billing (owner package 2026-11-06, BUG-08).
 *
 * founder_activate (20261101_10) writes the seat, the credits and the badge,
 * not `tier`, so a founder's tier stays "free". Read from the tier alone this
 * panel told a founder «لا باقة فعّالة» while the lawyer dashboard called him
 * «عضو مؤسس». The fix is on the read side: the panel also reads GET
 * /api/v1/membership/founder — the same read as the dashboard card — and an
 * active membership is shown as the founder plan with its end date, the works
 * left and the library date, in the dashboard card's own words
 * (founderDashboardCardView).
 *
 * Decision order:
 *   - the session still loading → nothing yet;
 *   - an active founder membership → the founder plan (and the paid tier on a
 *     second line when there is one as well);
 *   - a paid tier → the tier's plan, as before;
 *   - the founder read still running with a free tier → nothing yet, so a
 *     founder never sees «لا باقة فعّالة» flash first;
 *   - the founder read failed with a free tier → «تعذّر التحقق», never «لا
 *     باقة» (the route answers 503 so a paying founder is not told he is not one);
 *   - otherwise → «لا باقة فعّالة».
 *
 * Pure: relative imports only, so `node --test` loads it (currentPlanView.test.ts).
 */

import { founderDashboardCardView } from "../../app/dashboard/lawyer/_components/founderMembershipCardView.ts";
import { FOUNDER_CARD_TITLE } from "../../lib/pricing/founderCard.ts";

export type CurrentPlanView =
  | { kind: "loading" }
  | { kind: "founder"; label: string; lines: string[]; note: string | null; alsoTierLabel: string | null }
  | { kind: "tier"; label: string }
  | { kind: "unverifiable" }
  | { kind: "free" };

export interface CurrentPlanInput {
  userLoading: boolean;
  /** useUser().tier ?? "free". */
  tier: string;
  /** currentPlanLabelAr(userType, practiceKind, tier). */
  tierLabel: string;
  practiceKind: string | null;
  /**
   * GET /api/v1/membership/founder: `undefined` while it runs, `null` when it
   * failed (401, 503, network, a broken body), the parsed body otherwise.
   */
  founder: unknown;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function currentPlanView(input: CurrentPlanInput): CurrentPlanView {
  if (input.userLoading) return { kind: "loading" };
  const paid = input.tier !== "free";
  const reply = input.founder;

  if (isObject(reply) && reply.member === true) {
    const card = founderDashboardCardView({
      userLoading: false,
      userType: null,
      practiceKind: input.practiceKind,
      membership: reply,
      verification: "loading",
      offer: null,
      priced: false,
    });
    if (card.kind === "member") {
      return { kind: "founder", label: FOUNDER_CARD_TITLE, lines: card.lines, note: card.note, alsoTierLabel: paid ? input.tierLabel : null };
    }
    // A member reply the card cannot read (no end date, broken credits) is
    // treated like a failed read: never «لا باقة» for a member.
    return paid ? { kind: "tier", label: input.tierLabel } : { kind: "unverifiable" };
  }

  if (paid) return { kind: "tier", label: input.tierLabel };
  if (reply === undefined) return { kind: "loading" };
  if (isObject(reply) && reply.member === false) return { kind: "free" };
  return { kind: "unverifiable" };
}

