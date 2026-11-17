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
}

const NONE: FounderNoticeView = Object.freeze({ kind: "none" }) as FounderNoticeView;

export const NOTICE_TITLE = "باقة المحامي المؤسس";

const SEATS = { zero: null, one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعدًا", hundreds: "مقعد" };

export function founderNoticeView(i: FounderNoticeInput): FounderNoticeView {
  if (i.userLoading || i.userType !== "lawyer" || i.practiceKind === "consultant") return NONE;
  const m = i.membership;
  if (typeof m !== "object" || m === null || (m as { member?: unknown }).member !== false) return NONE;

  if (i.view.phase === "pre") {
    if (i.dismissed.has("pre")) return NONE;
    const when = i.view.remainingMs === null ? "قريبًا" : `بعد ${durationAr(i.view.remainingMs)}`;
    return {
      kind: "countdown",
      phase: "pre",
      title: NOTICE_TITLE,
      text: `يفتح التسجيل في عضوية المحامي المؤسس ${when}، والمقاعد محدودة.`,
      linkLabel: "تعرّف على الباقة",
      href: FOUNDER_PAGE_PATH,
    };
  }

  if (i.view.phase === "live") {
    if (i.dismissed.has("live") || i.inviteShown) return NONE;
    const seats = i.view.seatsLeft === null ? null : countPhraseAr(i.view.seatsLeft, SEATS);
    return {
      kind: "join",
      phase: "live",
      title: NOTICE_TITLE,
      text: seats
        ? `التسجيل مفتوح الآن — بقي ${seats}.`
        : "التسجيل مفتوح الآن، والمقاعد محدودة.",
      linkLabel: "انضم إلى المؤسسين",
      href: FOUNDER_PAGE_PATH,
    };
  }

  return NONE;
}

export const NOTICE_DISMISS_KEY_PREFIX = "nzamy:founder-notice:dismissed:";
