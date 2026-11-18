/**
 * founderNotice.ts — the small founder card a lawyer sees at the top of
 * /dashboard/lawyer right after signing up (owner item 0.4; conflict ٥ in the
 * 17-Nov package):
 *   - before 18 Nov 00:00 Riyadh: a countdown card, no purchase;
 *   - during the campaign: a join card linking to /founder;
 *   - after it (ended, sold out, paused) or for anyone who is not an advocate
 *     lawyer and not yet a member: nothing.
 *
 * Shown only when the membership read answered exactly `member: false` (a
 * failed read never invites a founder to buy again). During the campaign a
 * verified lawyer already gets the one-line invite of «عضويتي المؤسسة»
 * (founderMembershipCardView), so this card steps aside when that invite
 * shows. Dismissal is remembered per phase by the component (localStorage),
 * so dismissing the countdown does not hide the join card later.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { countPhraseAr } from "../services/arabicCount.ts";
import { FOUNDER_PAGE_PATH } from "./landingCopy.ts";
import { durationAr, type PhaseView } from "./founderWindow.ts";
import type { FounderOfferCopy } from "../offers/offerRules.ts";

export type NoticePhase = "pre" | "live";

export type FounderNoticeView =
  | { kind: "none" }
  | { kind: "countdown"; phase: "pre"; title: string; text: string; linkLabel: string; href: string }
  | { kind: "join"; phase: "live"; title: string; text: string; linkLabel: string; href: string };

export interface FounderNoticeInput {
  userLoading: boolean;
  userType: string | null;
  practiceKind: string | null;
  /** GET /api/v1/membership/founder's body; undefined while loading. */
  membership: unknown;
  /** founderPhase(...) on the corrected clock. */
  view: PhaseView;
  /** founderDashboardCardView(...) would show its own invite line. */
  inviteShown: boolean;
  /** The phases this viewer dismissed. */
  dismissed: ReadonlySet<NoticePhase>;
  /**
   * l8 (owner item 5): the founder offer row (GET /api/v1/campaigns/active's
   * founderOffer). Stopped by the admin → no card; else its title and button.
   * Absent / null (before 20261128_50) → the built-in words.
   */
  copy?: FounderOfferCopy | null;
}

const NONE: FounderNoticeView = Object.freeze({ kind: "none" }) as FounderNoticeView;

export const NOTICE_TITLE = "باقة المحامي المؤسس";

const SEATS = { zero: null, one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعدًا", hundreds: "مقعد" };

export function founderNoticeView(i: FounderNoticeInput): FounderNoticeView {
  if (i.userLoading || i.userType !== "lawyer" || i.practiceKind === "consultant") return NONE;
  if (i.copy && !i.copy.promoted) return NONE;
  const title = i.copy?.title ?? NOTICE_TITLE;
  const href = i.copy?.ctaHref ?? FOUNDER_PAGE_PATH;
  const m = i.membership;
  if (typeof m !== "object" || m === null || (m as { member?: unknown }).member !== false) return NONE;

  if (i.view.phase === "pre") {
    if (i.dismissed.has("pre")) return NONE;
    const when = i.view.remainingMs === null ? "قريبًا" : `بعد ${durationAr(i.view.remainingMs)}`;
    return {
      kind: "countdown",
      phase: "pre",
      title,
      text: `يفتح التسجيل في عضوية المحامي المؤسس ${when}، والمقاعد محدودة.`,
      linkLabel: "تعرّف على الباقة",
      href,
    };
  }

  if (i.view.phase === "live") {
    if (i.dismissed.has("live") || i.inviteShown) return NONE;
    const seats = i.view.seatsLeft === null ? null : countPhraseAr(i.view.seatsLeft, SEATS);
    return {
      kind: "join",
      phase: "live",
      title,
      text: seats
        ? `التسجيل مفتوح الآن — بقي ${seats}.`
        : "التسجيل مفتوح الآن، والمقاعد محدودة.",
      linkLabel: i.copy?.ctaLabel ?? "انضم إلى المؤسسين",
      href,
    };
  }

  return NONE;
}

export const NOTICE_DISMISS_KEY_PREFIX = "nzamy:founder-notice:dismissed:";
