/**
 * pointsGate.ts — the 50-point library gate (owner register 14 item 48, spec
 * 16.12, file 16 §9.1; batch l9 decisions «Library reading»), the pure half.
 *
 *   A library SUBSCRIBER — a paid library plan (lib-q1 / lib-q2 / lib-annual)
 *   or the founder (lib-founder) — opens the library's full text only while
 *   his points balance is at least library_min_points_to_browse (50). The
 *   balance is every valid point: points_balance() (plan, library-agent,
 *   top-up, bonus, gift lots) plus the founder's library credits (20
 *   library_question credits × 5 points = 100). Opening a document costs
 *   nothing; the rule is a balance, not a spend. Below it the subscriber
 *   reads what a visitor reads (previews) and sees «رصيدك أقل من ٥٠ نقطة؛
 *   اشحن لتستمر في المكتبة» with a top-up button; it opens again the moment
 *   the balance is back at 50.
 *
 *   NOT gated (defaults until the owner answers Q-B2 / Q-B3): an admin; a
 *   Pro-tier plan (or above) that includes the library; a trial, invitation
 *   or admin library grant (lib-trial / lib-invite / lib-admin) — those carry
 *   no points, so the gate would shut them out on day one. One exempt source
 *   is enough. 0 in the setting switches the gate off.
 *
 *   A balance that could not be read (null) never locks (fail open): an
 *   outage must not shut a paying subscriber out.
 *
 * The account-type switch (library_access_by_account_type, l8-liblock) is
 * checked BEFORE this (file 16 §9.2) by libraryGate(); the library assistant
 * keeps its own rule (it stops below the 5-point price, spec 16.12(7)).
 *
 * Pure: relative imports only, so `node --test` loads it. The reads are in
 * ./pointsGateServer.ts and src/lib/access-control.ts.
 */
import { toArabicDigits } from "../services/arabicCount.ts";

export const LIBRARY_MIN_POINTS_SETTING = "library_min_points_to_browse";
export const LIBRARY_MIN_POINTS_DEFAULT = 50;
export const LIBRARY_MIN_POINTS_MAX = 100_000;

/** The library plans whose holder is gated (paid plans + the founder). */
export const GATED_LIBRARY_PLAN_REFS: readonly string[] = Object.freeze(["lib-q1", "lib-q2", "lib-annual", "lib-founder"]);
/** Grants that open the library with no points: never gated (default). */
export const EXEMPT_LIBRARY_PLAN_REFS: readonly string[] = Object.freeze(["lib-trial", "lib-invite", "lib-admin"]);

/** The founder's library credits are counted at the assistant's price (founderPlan.ts). */
export const LIBRARY_CREDIT_POINTS = 5;

/**
 * Where the locked subscriber tops up when online payment is off for him: the
 * price page, whose buy buttons send a request to the team (owner ٢٤٦). The
 * server sends this one; the banner swaps in LIBRARY_TOPUP_CHECKOUT_HREF once
 * the viewer's gateway can take a checkout (libraryTopupHref).
 */
export const LIBRARY_TOPUP_HREF = "/pricing";
/**
 * O16 (c), batch l11-misc: the 50-point pack's own checkout (sold to every
 * account type, register 14 item 7). `billing=once` is required —
 * parseCheckoutQuery refuses an item without a billing.
 */
export const LIBRARY_TOPUP_CHECKOUT_HREF = "/checkout?item=topup-50&billing=once";

/** The top-up link the lock banner shows: straight to checkout while payment is on, else the price page. */
export function libraryTopupHref(gatewayAllowsCheckout: boolean): string {
  return gatewayAllowsCheckout ? LIBRARY_TOPUP_CHECKOUT_HREF : LIBRARY_TOPUP_HREF;
}
export const LIBRARY_TOPUP_LABEL_AR = "اشحن نقاطك";
export const LIBRARY_POINTS_LOCKED_CODE = "library_points_locked";

/** {"points": n} → n; anything else → the default (50). */
export function parseLibraryMinPoints(value: unknown): number {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const n = (value as { points?: unknown }).points;
    if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= LIBRARY_MIN_POINTS_MAX) return n;
  }
  return LIBRARY_MIN_POINTS_DEFAULT;
}

/** The admin settings validator: {"points": 0..100000}, nothing else. */
export function libraryMinPointsIssue(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 'قيمة library_min_points_to_browse يجب أن تكون كائناً بالشكل {"points":50}';
  }
  for (const k of Object.keys(value)) if (k !== "points") return `حقل غير معروف: ${k}`;
  const n = (value as { points?: unknown }).points;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > LIBRARY_MIN_POINTS_MAX) {
    return `الحد الأدنى للنقاط لفتح المكتبة عدد صحيح بين 0 و${LIBRARY_MIN_POINTS_MAX} (0 = بلا شرط)`;
  }
  return null;
}

export interface PointsGateInput {
  isAdmin: boolean;
  /** The subscription tier alone opens the library (Pro or above). */
  tierIncludesLibrary: boolean;
  /** plan_ref of every library grant active now. */
  planRefs: readonly string[];
  /** points_balance + founder library credits; null when it could not be read. */
  balance: number | null;
  minPoints: number;
}

export interface PointsGateDecision {
  /** The account's library access depends on its balance. */
  gated: boolean;
  /** Gated and below the minimum: the full text is closed. */
  locked: boolean;
}

/** Does this subscriber's library depend on his balance, and is it below the minimum? */
export function libraryPointsGateDecision(input: PointsGateInput): PointsGateDecision {
  const open = { gated: false, locked: false };
  if (!(input.minPoints > 0)) return open;
  if (input.isAdmin === true || input.tierIncludesLibrary === true) return open;
  if (input.planRefs.some((p) => EXEMPT_LIBRARY_PLAN_REFS.includes(p))) return open;
  if (!input.planRefs.some((p) => GATED_LIBRARY_PLAN_REFS.includes(p))) return open;
  const locked = typeof input.balance === "number" && Number.isFinite(input.balance) && input.balance < input.minPoints;
  return { gated: true, locked };
}

/** The founder's library credits as points (remaining questions × 5); bad rows count 0. */
export function libraryCreditPoints(rows: ReadonlyArray<{ remaining?: unknown }>): number {
  let total = 0;
  for (const r of rows) {
    const n = r.remaining;
    if (typeof n === "number" && Number.isInteger(n) && n > 0) total += n * LIBRARY_CREDIT_POINTS;
  }
  return total;
}

/** The owner's sentence (register 48 / decisions): «رصيدك أقل من ٥٠ نقطة؛ اشحن لتستمر في المكتبة». */
export function libraryPointsLockedMessageAr(minPoints: number): string {
  return `رصيدك أقل من ${toArabicDigits(String(minPoints))} نقطة؛ اشحن لتستمر في المكتبة`;
}

/** What the status / access routes send a locked subscriber. */
export interface LibraryPointsLock {
  code: typeof LIBRARY_POINTS_LOCKED_CODE;
  message: string;
  balance: number;
  minPoints: number;
  topupHref: string;
}

export function libraryPointsLock(balance: number, minPoints: number): LibraryPointsLock {
  return {
    code: LIBRARY_POINTS_LOCKED_CODE,
    message: libraryPointsLockedMessageAr(minPoints),
    balance,
    minPoints,
    topupHref: LIBRARY_TOPUP_HREF,
  };
}
