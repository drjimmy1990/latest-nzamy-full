/**
 * joinButton.ts — what the /founder join button does, in this order:
 *   1. the campaign window (founderWindow.ts): only `live` may sell;
 *      pre → «يفتح التسجيل بعد …», ended → «انتهى العرض»,
 *      sold_out → «اكتملت المقاعد», paused → FOUNDER_PAUSED_TEXT;
 *   2. the advocate-only rule: a signed-in lawyer whose practice kind is
 *      `consultant` is locked out on this page (manifest
 *      `eligible_practice_kind: advocate`);
 *   3. founderCta (src/lib/pricing/founderCard.ts) — the same button logic
 *      as the /pricing card (guest → sign in, unverified → verify, gateway
 *      off → unavailable, else checkout). Its `note` is set to null here:
 *      the campaign page never names the other practice kind — except
 *      FOUNDER_PENDING_NOTE (l7, decision 1), which a pending lawyer must
 *      read before he pays.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { FOUNDER_PAUSED_TEXT, FOUNDER_PENDING_NOTE, type FounderCta } from "../pricing/founderCard.ts";
import { durationAr, type FounderPhase } from "./founderWindow.ts";

export type LockReason =
  | "loading"
  | "error"
  | "unconfigured"
  | "pre"
  | "opening"
  | "ended"
  | "sold_out"
  | "paused"
  | "advocate_only";

export type JoinButton =
  | { kind: "locked"; reason: LockReason; label: string }
  | { kind: "cta"; cta: FounderCta };

export const JOIN_LABELS = Object.freeze({
  loading: "جارٍ التحميل…",
  // Owner rule (README, BACKEND-SPEC §12.8): no platform fault is shown to
  // the customer — a failed read waits neutrally while the page retries (30 s).
  error: "جارٍ التحقق من حالة العرض…",
  unconfigured: "لم يُعلَن موعد فتح التسجيل بعد",
  opening: "جارٍ فتح التسجيل…",
  ended: "انتهى العرض",
  sold_out: "اكتملت المقاعد",
  paused: FOUNDER_PAUSED_TEXT,
  advocate_only: "هذه الباقة للمحامي المرخّص للترافع فقط",
});

export function preLabel(remainingMs: number | null): string {
  return remainingMs === null ? "يفتح التسجيل قريبًا" : `يفتح التسجيل بعد ${durationAr(remainingMs)}`;
}

export interface JoinInput {
  phase: FounderPhase;
  remainingMs: number | null;
  /** useUser(): signed-in lawyer's practice kind, else null. */
  userType: string | null;
  practiceKind: string | null;
  /** founderCta(...) for this viewer; only read in the live phase. */
  cta: FounderCta;
}

function locked(reason: LockReason, label: string): JoinButton {
  return { kind: "locked", reason, label };
}

export function founderJoinButton(input: JoinInput): JoinButton {
  switch (input.phase) {
    case "loading":
      return locked("loading", JOIN_LABELS.loading);
    case "error":
      return locked("error", JOIN_LABELS.error);
    case "unconfigured":
      return locked("unconfigured", JOIN_LABELS.unconfigured);
    case "pre":
      return locked("pre", preLabel(input.remainingMs));
    case "opening":
      return locked("opening", JOIN_LABELS.opening);
    case "ended":
      return locked("ended", JOIN_LABELS.ended);
    case "sold_out":
      return locked("sold_out", JOIN_LABELS.sold_out);
    case "paused":
      return locked("paused", JOIN_LABELS.paused);
    case "live":
      break;
  }
  if (input.userType === "lawyer" && input.practiceKind === "consultant") {
    return locked("advocate_only", JOIN_LABELS.advocate_only);
  }
  return { kind: "cta", cta: { ...input.cta, note: input.cta.note === FOUNDER_PENDING_NOTE ? FOUNDER_PENDING_NOTE : null } };
}
