/**
 * founderMembershipCardView.ts — the pure half of «عضويتي المؤسسة» on the
 * lawyer dashboard (P3 Task 9): which of three things the card shows, and
 * every word of it.
 *
 *   member  — GET /api/v1/membership/founder answered `member: true`:
 *             «عضو مؤسس حتى …», the drafter works and the independent output
 *             left (the server's own totals), «المكتبة حتى …» when a library
 *             grant runs, and the office-management «قريبًا» line.
 *   invite  — a signed-in LAWYER whose membership read answered exactly
 *             `member: false`, whose licence is verified, while the sale is
 *             open and priced: one line linking to the founder card on
 *             /pricing (FOUNDER_CAMPAIGN_COPY.ctaHref). This is how a lawyer
 *             who signed up from the campaign link finds the offer again
 *             after verification, with nothing stored in the browser (R23).
 *   none    — everything else, including every loading and failed read. A
 *             founder whose membership read failed is never invited to buy
 *             again, and is never shown a half-built card.
 *
 * Dates are Riyadh calendar days in Arabic (libraryEndsAtAr); counts are
 * Arabic-Indic digits. No "now" is read here: the server already decided
 * `member` and sent `endsAt`, so the SSR cached-date trap cannot arise.
 *
 * Pure: relative imports only, so `node --test` loads it
 * (founderMembershipCardView.test.ts).
 */

import { libraryEndsAtAr } from "../../../../lib/libraryAccess.ts";
import { FOUNDER_CAMPAIGN_COPY } from "../../../../lib/pricing/campaigns.ts";
import {
  FOUNDER_BENEFITS,
  FOUNDER_CARD_TITLE,
  FOUNDER_CONSULTANT_NOTE,
  founderSeatsLine,
  type FounderOffer,
  type FounderVerification,
} from "../../../../lib/pricing/founderCard.ts";
import { toArabicDigits } from "../../../../lib/services/arabicCount.ts";

export const FOUNDER_DASHBOARD_TITLE = "عضويتي المؤسسة";

/**
 * The office-management line. The brief writes «إدارة المكتب: قريبًا»; the
 * global constraints allow ERP only as «قريبًا — ضمن مدة العضوية المحسوبة من
 * التفعيل». The /pricing card's benefit line is both, so it is reused.
 */
const OFFICE_LINE =
  FOUNDER_BENEFITS.find((line) => line.startsWith("إدارة المكتب")) ??
  "إدارة المكتب: قريبًا — ضمن مدة العضوية المحسوبة من التفعيل";

export interface FounderDashboardInput {
  /** useUser() still resolving. */
  userLoading: boolean;
  userType: string | null;
  practiceKind: string | null;
  /** GET /api/v1/membership/founder's body; `undefined` while loading, null when the fetch failed. */
  membership: unknown;
  /** founderVerificationFromProfile(GET /api/v1/profile), "loading" until it answers. */
  verification: FounderVerification;
  /** founderOfferFromApi(GET /api/v1/campaigns/active), null while loading. */
  offer: FounderOffer | null;
  /** founderPriceLine() !== null — without a price the /pricing card hides, so the invite would land nowhere. */
  priced: boolean;
}

export type FounderDashboardCardView =
  | { kind: "none" }
  | { kind: "member"; title: string; lines: string[]; note: string | null }
  | { kind: "invite"; text: string; linkLabel: string; href: string };

const NONE: FounderDashboardCardView = Object.freeze({ kind: "none" }) as FounderDashboardCardView;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

function credit(credits: Record<string, unknown>, kind: string): { total: number; remaining: number } | null {
  const c = credits[kind];
  if (!isObject(c) || !isCount(c.total) || !isCount(c.remaining)) return null;
  return { total: c.total, remaining: c.remaining };
}

function memberCard(reply: Record<string, unknown>, practiceKind: string | null): FounderDashboardCardView {
  const until = libraryEndsAtAr(reply.endsAt);
  if (!until || !isObject(reply.credits)) return NONE;
  const works = credit(reply.credits, "drafting_work");
  const output = credit(reply.credits, "independent_output");
  if (!works || !output) return NONE;

  const lines = [
    `عضو مؤسس حتى ${until}`,
    `أعمال الصائغ: متبقٍ ${toArabicDigits(works.remaining)} من ${toArabicDigits(works.total)}`,
    `المخرج المستقل: ${toArabicDigits(output.remaining)} من ${toArabicDigits(output.total)}`,
  ];
  const library = libraryEndsAtAr(reply.libraryUntil);
  if (library) lines.push(`المكتبة حتى ${library}`);
  lines.push(OFFICE_LINE);

  return {
    kind: "member",
    title: FOUNDER_DASHBOARD_TITLE,
    lines,
    note: practiceKind === "consultant" ? FOUNDER_CONSULTANT_NOTE : null,
  };
}

/** What «عضويتي المؤسسة» shows for this viewer (see the file header). */
export function founderDashboardCardView(input: FounderDashboardInput): FounderDashboardCardView {
  const reply = input.membership;
  if (!isObject(reply) || typeof reply.member !== "boolean") return NONE;
  if (reply.member) return memberCard(reply, input.practiceKind);

  if (input.userLoading || input.userType !== "lawyer") return NONE;
  if (input.verification !== "verified") return NONE;
  if (!input.priced || !input.offer || input.offer.state !== "open") return NONE;
  return {
    kind: "invite",
    text: `${FOUNDER_CARD_TITLE} متاحة لحسابك الموثّق — ${founderSeatsLine(input.offer.seatsLeft, input.offer.capacity)}`,
    linkLabel: FOUNDER_CAMPAIGN_COPY.ctaAr,
    href: FOUNDER_CAMPAIGN_COPY.ctaHref,
  };
}
