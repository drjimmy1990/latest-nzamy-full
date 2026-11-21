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
 *   Owner answer ٩٣ (20 Nov 2026, batch l12): «لا استثناء لأي حساب». EVERY
 *   holder of a library grant is gated — the paid plans, the founder, and the
 *   older trial / invitation / admin grants (lib-trial / lib-invite /
 *   lib-admin) alike — and no subscription tier opens the library any more
 *   (owner ٨٩, libraryAccessDecision.ts). The ONLY account outside the gate
 *   is a platform admin (staff bypass, kept). 0 in the setting switches the
 *   gate off.
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

/**
 * The library plans whose holder is gated. Owner ٩٣ (l12): every library
 * grant, the older trial / invitation / admin grants included. The gate does
 * not depend on this list (ANY active grant is gated, so a plan added later
 * is gated from day one); it names the known refs for the checkout notes.
 */
export const GATED_LIBRARY_PLAN_REFS: readonly string[] = Object.freeze([
  "lib-q1", "lib-q2", "lib-annual", "lib-founder", "lib-trial", "lib-invite", "lib-admin",
]);
/** Owner ٩٣ (l12): no grant opens the library without points any more. Kept, empty, for callers. */
export const EXEMPT_LIBRARY_PLAN_REFS: readonly string[] = Object.freeze([]);

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
  if (input.isAdmin === true) return open;
  // Owner ٩٣ (l12): any active library grant is gated — no exempt plan.
  if (input.planRefs.length === 0) return open;
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

// ── Owner 06 ج6 + ٩٣ (batch l12): the warning BEFORE the lock ────────────────
// A gated subscriber whose next library-assistant question would take his
// balance below the minimum is told so before he asks (the library assistant
// screens), and the library checkout says the same rule. Nothing is refused
// here — the question still runs; only the lock above closes the full text.

export const LIBRARY_POINTS_LOW_CODE = "library_points_low";

/** «٥ نقاط» / «١٠٠ نقطة» / «نقطة واحدة» / «نقطتان» (Arabic-Indic digits). */
export function libraryPointsWordAr(n: number): string {
  if (n === 1) return "نقطة واحدة";
  if (n === 2) return "نقطتان";
  const d = toArabicDigits(String(n));
  return n >= 3 && n <= 10 ? `${d} نقاط` : `${d} نقطة`;
}

/**
 * True when the subscriber is still open (balance at or above the minimum)
 * but ONE question at `questionPoints` would take him below it. A gate that
 * is off (minPoints 0), an unknown balance or an unknown price warns nothing.
 */
export function libraryPointsLowBeforeQuestion(balance: number | null, minPoints: number, questionPoints: number | null): boolean {
  if (!(minPoints > 0)) return false;
  if (typeof balance !== "number" || !Number.isFinite(balance)) return false;
  if (typeof questionPoints !== "number" || !Number.isFinite(questionPoints) || questionPoints <= 0) return false;
  return balance >= minPoints && balance - questionPoints < minPoints;
}

/** The pre-question warning, in the owner's words for the lock. */
export function libraryPointsLowMessageAr(balance: number, minPoints: number, questionPoints: number): string {
  return `تنبيه: رصيدك ${libraryPointsWordAr(balance)}، والسؤال المدفوع لمساعد المكتبة يكلّف ${libraryPointsWordAr(questionPoints)}؛ بعده ينزل رصيدك عن ${libraryPointsWordAr(minPoints)} فتُقفل نصوص المكتبة الكاملة حتى تشحن.`;
}

/** What the status route sends a subscriber one question away from the lock. */
export interface LibraryPointsLow {
  code: typeof LIBRARY_POINTS_LOW_CODE;
  message: string;
  balance: number;
  minPoints: number;
  questionPoints: number;
  topupHref: string;
}

export function libraryPointsLow(balance: number, minPoints: number, questionPoints: number): LibraryPointsLow {
  return {
    code: LIBRARY_POINTS_LOW_CODE,
    message: libraryPointsLowMessageAr(balance, minPoints, questionPoints),
    balance,
    minPoints,
    questionPoints,
    topupHref: LIBRARY_TOPUP_HREF,
  };
}

/**
 * The line on a library plan's checkout (owner ٩٣ quarterly + 06 ج6): the
 * points the plan brings (library_plan_points) against the minimum. When the
 * plan's points are at or below the minimum plus one question (the quarterly
 * plan's 50 against 50), it says the first question locks the full text.
 * null when the gate is off or a number is unknown.
 */
export function libraryPlanCheckoutGateLineAr(planPoints: number | null, minPoints: number | null, questionPoints: number | null): string | null {
  if (typeof minPoints !== "number" || !(minPoints > 0)) return null;
  const rule = `فتح نصوص المكتبة الكاملة مشروط بألا يقل رصيدك عن ${libraryPointsWordAr(minPoints)}`;
  if (typeof planPoints !== "number" || !Number.isFinite(planPoints) || planPoints < 0) return `${rule}.`;
  const tight = typeof questionPoints === "number" && questionPoints > 0 && planPoints - questionPoints < minPoints;
  if (tight) {
    return `${rule}، والباقة تمنحك ${libraryPointsWordAr(planPoints)} لمساعد المكتبة؛ فأول سؤال مدفوع تطرحه ينزل رصيدك عن الحد ويُقفل النصوص الكاملة حتى تشحن نقاطاً إضافية.`;
  }
  return `${rule}، والباقة تمنحك ${libraryPointsWordAr(planPoints)} لمساعد المكتبة؛ إذا نزل رصيدك عن الحد فاشحن لتستمر.`;
}
