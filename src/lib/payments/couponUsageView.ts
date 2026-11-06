/**
 * couponUsageView.ts — the coupon's usage log on the admin coupons page
 * (S6-T13; slice A §6.2.3). The real ledger is public.coupon_usage
 * (20260603_phase1_003; one row per paid LIVE order that carried the coupon,
 * written by fulfilment — couponServer.recordCouponUsage). The page used to
 * say «لم يتم استخدام الكوبون بعد» for every coupon, used_count > 0 or not,
 * because nothing ever read the table.
 *
 * GET /api/v1/admin/coupons/[id]/usage reads the rows (service role) and the
 * buyers' profiles, and this maps them for the modal. Pure: relative `.ts`
 * imports only, so `node --test` loads it.
 */

import { COUPON_USER_TYPE_TO_ROLE } from "./couponAdminRules.ts";

export type CouponUsageView = {
  usedBy: string;
  usedByRole: string;
  orderId: string | null;
  discountApplied: number;
  createdAt: string;
};

export interface CouponUsageRow {
  id: number | string;
  user_id: string | null;
  order_id: string | null;
  discount_applied: number | string | null;
  created_at: string;
}

export interface CouponUsageProfile {
  id: string;
  display_name: string | null;
  user_type: string | null;
}

/** How many rows the route reads (newest first) — well under the ~396 ids an `.in()` can carry. */
export const COUPON_USAGE_LIMIT = 200;

export const DELETED_ACCOUNT_AR = "حساب محذوف";
export const UNNAMED_ACCOUNT_AR = "حساب بلا اسم";

/** The distinct buyer ids of the rows (no null), for one profiles read. */
export function couponUsageUserIds(rows: readonly CouponUsageRow[]): string[] {
  return [...new Set(rows.map((r) => r.user_id).filter((id): id is string => typeof id === "string" && id !== ""))];
}

/**
 * The rows with each buyer's name and role (the page's role: corporate →
 * business, individual → client). A row whose profile is gone reads
 * «حساب محذوف» (role client); discount_applied (numeric SAR) becomes a number.
 */
export function mapCouponUsageRows(
  rows: readonly CouponUsageRow[],
  profiles: readonly CouponUsageProfile[],
): CouponUsageView[] {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return rows.map((r) => {
    const profile = r.user_id ? byId.get(r.user_id) : undefined;
    const type = profile?.user_type ?? "";
    const amount = Number(r.discount_applied ?? 0);
    return {
      usedBy: profile ? (profile.display_name?.trim() || UNNAMED_ACCOUNT_AR) : DELETED_ACCOUNT_AR,
      usedByRole: profile ? (Object.hasOwn(COUPON_USER_TYPE_TO_ROLE, type) ? COUPON_USER_TYPE_TO_ROLE[type] : type) : "client",
      orderId: r.order_id ?? null,
      discountApplied: Number.isFinite(amount) ? amount : 0,
      createdAt: r.created_at,
    };
  });
}

/** A usage time for the modal, Gregorian, in Riyadh time. Call it at render on the client, never during SSR. */
export function couponUsageDateAr(iso: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(
    new Date(iso),
  );
}
