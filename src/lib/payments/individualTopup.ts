/**
 * individualTopup.ts — owner ق٢٦-٦ (batch l19): the two point packs an
 * individual buys from «محفظتي» (/dashboard/client/wallet): topup-100 and
 * topup-250 of the price book (INDIVIDUAL_BUYERS, 1 point a riyal, 3
 * months). One button per pack, through the same rule as every other buy
 * button (buyButtonAction): /checkout when online payment is on for this
 * viewer; otherwise the individuals' price page, where the request path and
 * the «البيع متوقف مؤقتاً» line live.
 *
 * Pure (relative imports only), so `node --test` runs it.
 */
import { bookEntry, INDIVIDUAL_BUYERS, topupPointsTextById } from "../pricing/priceBook.ts";
import { buyButtonAction } from "./checkoutView.ts";

export const INDIVIDUAL_TOPUP_IDS = ["topup-100", "topup-250"] as const;
/** The individuals' tab of /pricing — the top-up cards and their request path. */
export const INDIVIDUAL_TOPUP_FALLBACK_HREF = "/pricing?audience=individuals";

export interface TopupButton {
  id: (typeof INDIVIDUAL_TOPUP_IDS)[number];
  /** «شحن ١٠٠» */
  labelAr: string;
  /** «١٠٠ نقطة · صالحة ٣ أشهر» — the book's own words */
  pointsAr: string;
  href: string;
  /** true while the gateway status is still loading: the button waits */
  waiting: boolean;
}

/** True for an account type the two packs are sold to (the price book's buyers). */
export function individualTopupFor(userType: unknown): boolean {
  return typeof userType === "string" && INDIVIDUAL_BUYERS.includes(userType);
}

/**
 * l19 review (pay S2): the wallet's top-up card is shown to an ind-ai
 * («الباقة الذكية») subscriber only — the one individual whose points have
 * something to buy today (the quick answer beyond the month's 30 questions).
 * A free individual's tools are the free floating assistant, the quick answer
 * (refused without the smart plan or a library plan) and the simplified
 * contract drafter (off by default), so a card would sell points he cannot
 * spend. The same rule as public.ind_ai_plan_active (20261209_70): an active
 * row of plan id ind-ai whose period has not ended (none = open-ended).
 * Rows are the user's own `subscriptions` rows (plan_id, status,
 * current_period_end). A failed read → false (no card).
 */
export function indAiActiveFrom(rows: unknown, nowMs: number): boolean {
  if (!Array.isArray(rows)) return false;
  return rows.some((r) => {
    const row = (r ?? {}) as { plan_id?: unknown; status?: unknown; current_period_end?: unknown };
    if (row.plan_id !== "ind-ai" || row.status !== "active") return false;
    if (row.current_period_end === null || row.current_period_end === undefined) return true;
    const end = typeof row.current_period_end === "string" ? Date.parse(row.current_period_end) : NaN;
    return Number.isFinite(end) && end > nowMs;
  });
}

/** The card's line: what the points buy beyond the smart plan's month, and the price before VAT. */
export const INDIVIDUAL_TOPUP_LINE_AR =
  "تُستخدم النقاط فيما زاد على حصة باقتك الذكية الشهرية: أسئلة «المجيب القانوني السريع» بعد الثلاثين، " +
  "والعقود المبسّطة بعد العقدين حين يُفعَّل صائغ العقود المبسّط (قيد التفعيل). " +
  "النقطة بريال واحد + ضريبة القيمة المضافة.";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** «٣ أشهر», «شهراً واحداً» … for the validity line (1–10 → أشهر, else شهراً). */
function monthsAr(n: number): string {
  const d = String(n).replace(/[0-9]/g, (c) => AR_DIGITS[Number(c)]);
  if (n === 1) return "شهراً واحداً";
  if (n === 2) return "شهرين";
  return n <= 10 ? `${d} أشهر` : `${d} شهراً`;
}

export function individualTopupButtons(
  payments: { disabled: boolean; provider: string | null; loading?: boolean },
  signedIn: boolean,
): TopupButton[] {
  return INDIVIDUAL_TOPUP_IDS.filter((id) => {
    const e = bookEntry(id);
    return !!e && e.kind === "topup" && !e.retired;
  }).map((id) => {
    const action = buyButtonAction(id, "once", payments, signedIn);
    const entry = bookEntry(id)!;
    return {
      id,
      labelAr: entry.labelAr.replace(/\s*\(.*\)\s*$/, ""),
      pointsAr: `${topupPointsTextById(id, "ar")}${entry.pointsValidityMonths ? ` · صالحة ${monthsAr(entry.pointsValidityMonths)}` : ""}`,
      href: action.kind === "checkout" ? action.href : INDIVIDUAL_TOPUP_FALLBACK_HREF,
      waiting: action.kind === "wait",
    };
  });
}
