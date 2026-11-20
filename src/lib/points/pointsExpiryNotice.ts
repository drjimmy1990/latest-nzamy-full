/**
 * pointsExpiryNotice.ts — the 7-day warning before a points lot ends (owner
 * 18 Nov 2026 G16, batch l7). POST /api/v1/cron/points-expiry reads the lots
 * that still hold points and end within EXPIRY_WARNING_DAYS, inserts one
 * public.points_lot_expiry_notices row per lot (20261127_40) and sends this
 * in-app notice only when the row is new, so a lot is warned once whatever
 * the schedule.
 *
 * Pure (relative imports only), so `node --test` runs it.
 */
import { arabicDigits, billingDateAr } from "../payments/billingView.ts";

export const EXPIRY_WARNING_DAYS = 7;
export const POINTS_BILLING_HREF = "/dashboard/billing";

export interface ExpiringLot {
  id: string;
  user_id: string;
  points_left: number;
  expires_at: string;
  /** 20261127_40; absent on a row read before it ran. */
  wallet_scope?: string | null;
}

/** The lots worth warning: points left, ending after now and within the window. */
export function lotsToWarn(rows: readonly ExpiringLot[], now: Date): ExpiringLot[] {
  const from = now.getTime();
  const to = from + EXPIRY_WARNING_DAYS * 86_400_000;
  return rows.filter((r) => {
    const at = Date.parse(r.expires_at);
    return typeof r.id === "string" && typeof r.user_id === "string" && Number.isSafeInteger(r.points_left)
      && r.points_left > 0 && Number.isFinite(at) && at > from && at <= to;
  });
}

/**
 * l11 O7 (register 49, founder terms clause ١٢): a library subscriber opens
 * the library only while his balance is at least library_min_points_to_browse
 * (`minPoints`), so a lot that ends may lock it. The clause's own wording;
 * null when the gate is off (0) or the number is unusable.
 */
export function libraryExpiryLockLineAr(minPoints: number | null | undefined, subject: "this_topup" | "these_points"): string | null {
  if (typeof minPoints !== "number" || !Number.isSafeInteger(minPoints) || minPoints <= 0) return null;
  const what = subject === "this_topup" ? "هذه الشحنة" : "هذه النقاط";
  return `بما أن فتح المكتبة مشروط ببقاء رصيدك ${arabicDigits(minPoints)} نقطة فأكثر، فانتهاء صلاحية ${what} قد يُقفل التصفح حتى تشحن من جديد.`;
}

/**
 * The 7-day notice. l11 O7: `libraryMinPoints` — set by the cron only for a
 * holder of a gated library plan (paid library plan or the founder) — adds
 * the library-lock sentence.
 */
export function expiryNotice(
  lot: ExpiringLot,
  opts: { libraryMinPoints?: number | null } = {},
): { title: string; body: string; href: string } {
  const library = lot.wallet_scope === "library_agent";
  const lock = libraryExpiryLockLineAr(opts.libraryMinPoints, "these_points");
  return {
    title: library ? "تنتهي نقاط مساعد المكتبة قريباً" : "تنتهي بعض نقاطك قريباً",
    body: `تنتهي ${arabicDigits(lot.points_left)} نقطة${library ? " من نقاط مساعد المكتبة" : ""} في ${billingDateAr(lot.expires_at)}، ولا تُستعاد بعد انتهائها.${lock ? ` ${lock}` : ""}`,
    href: POINTS_BILLING_HREF,
  };
}
