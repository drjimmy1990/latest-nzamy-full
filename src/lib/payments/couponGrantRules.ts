/**
 * couponGrantRules.ts — the owner's coupon rule of 25 Nov (س٢١٣, batch l16
 * A-06/07/08/A-59/E-12), in one place for the admin routes, the redemption
 * route and the coupons page:
 *
 *   (أ) a marketing code is up to 25 % (the default cap, owner ١٥٥). A code
 *       above 25 % — up to 100 % — and every free-plan / points code is a
 *       MANAGEMENT code: only the super admin saves it, and only with its
 *       purpose «الغرض», an end date and a use limit (highCouponIssue);
 *   (ب) a 100 % code is for the platform's own products and points only,
 *       never a service a lawyer or an office sells (kind "service"): a cap
 *       of 100 always excludes it (withPlatformOnlyKinds). A free-plan or
 *       points code is recorded as three lines — full price → 100 % discount
 *       → net 0 — with a free-activation receipt (coupon_redemptions,
 *       20261206_30).
 *
 * A free-plan code grants one PLAN of the price book on sale, in one of the
 * billings it is sold in (grantablePlans). Batch l18 (owner ق٢٦-١١): also a
 * LIBRARY pass (lib-q1 / lib-q2 / lib-annual) and the office + library
 * BUNDLE (lawyer-bundle) — their library pass is granted on the redemption
 * itself (coupon_redeem_grant_library, 20261208_30), never on a paid order.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { PAYABLE_ITEMS, type Billing, type PayableItem } from "./catalog.ts";
import { OWNER_MAX_DISCOUNT_PCT, COUPON_HARD_MAX_PCT, couponPurpose } from "./couponAdminRules.ts";

/** The database discount types that grant instead of discounting. */
export const GRANT_COUPON_TYPES: readonly string[] = Object.freeze(["plan_upgrade", "points_grant"]);
export const isGrantCouponType = (dbType: unknown): boolean => typeof dbType === "string" && GRANT_COUPON_TYPES.includes(dbType);

/** The most points one code may grant (1 point = 1 SAR). */
export const MAX_COUPON_POINTS = 100_000;

export const HIGH_NEEDS_SUPER_ADMIN_AR = "أكواد الخصم فوق ٢٥٪ وأكواد الباقة المجانية والنقاط للمشرف الأعلى وحده.";
export const HIGH_NEEDS_PURPOSE_AR = "كود الإدارة (فوق ٢٥٪ أو باقة مجانية أو نقاط) يحتاج الغرض منه.";
export const HIGH_NEEDS_EXPIRY_AR = "كود الإدارة (فوق ٢٥٪ أو باقة مجانية أو نقاط) يحتاج تاريخ انتهاء.";
export const HIGH_NEEDS_LIMIT_AR = "كود الإدارة (فوق ٢٥٪ أو باقة مجانية أو نقاط) يحتاج حدّاً لعدد مرات الاستخدام.";
export const PLAN_GRANT_INVALID_AR = "اختر الباقة الممنوحة ومدتها من الباقات المعروضة للبيع.";
export const POINTS_GRANT_INVALID_AR = `النقاط الممنوحة عدد صحيح من ١ إلى ${MAX_COUPON_POINTS.toLocaleString("ar-SA")}.`;

export interface GrantablePlan {
  id: string;
  labelAr: string;
  billings: Billing[];
  buyers: readonly string[] | "any";
}

/** The items a free-plan code may grant: on sale, a plan with its tier (the bundle included) or a library pass (l18). */
export function grantablePlans(catalog: Readonly<Record<string, PayableItem>> = PAYABLE_ITEMS): GrantablePlan[] {
  return Object.values(catalog)
    .filter((it) => it.onSale && ((it.kind === "plan" && !!it.tier) || (it.kind === "library" && !!it.libraryPlanRef && !!it.libraryDays)))
    .map((it) => ({ id: it.id, labelAr: it.labelAr, billings: Object.keys(it.prices) as Billing[], buyers: it.buyers }))
    .filter((p) => p.billings.length > 0);
}

/** The plan item a free-plan code may grant in `billing`, or null. */
export function grantablePlan(
  planId: unknown,
  billing: unknown,
  catalog: Readonly<Record<string, PayableItem>> = PAYABLE_ITEMS,
): GrantablePlan | null {
  if (typeof planId !== "string" || typeof billing !== "string") return null;
  const plan = grantablePlans(catalog).find((p) => p.id === planId);
  return plan && (plan.billings as string[]).includes(billing) ? plan : null;
}

/** A points code's points: an integer 1..MAX_COUPON_POINTS, else null. */
export function couponPoints(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_COUPON_POINTS ? n : null;
}

/** The coupon columns the management rule reads (a stored row, or the row a save would leave). */
export interface CouponRuleRow {
  discount_type?: unknown;
  max_discount_pct?: unknown;
  purpose?: unknown;
  valid_until?: unknown;
  max_uses?: unknown;
  active?: unknown;
}

/** True for a management code: a cap above 25 %, or a free-plan / points code. */
export function isHighCoupon(row: CouponRuleRow): boolean {
  if (isGrantCouponType(row.discount_type)) return true;
  const raw = row.max_discount_pct;
  const pct = raw === null || raw === undefined || raw === "" ? Number.NaN : Number(raw);
  return Number.isFinite(pct) && pct > OWNER_MAX_DISCOUNT_PCT;
}

/**
 * Why this save of a management code is refused, or null (س٢١٣ أ). `role` is
 * the writer's platform_staff role. A code being switched OFF (active false)
 * is never refused, so an old code can always be stopped.
 */
export function highCouponIssue(row: CouponRuleRow, role: string): string | null {
  if (!isHighCoupon(row)) return null;
  if (row.active === false) return null;
  if (role !== "super_admin") return HIGH_NEEDS_SUPER_ADMIN_AR;
  if (couponPurpose(row.purpose) === null) return HIGH_NEEDS_PURPOSE_AR;
  if (typeof row.valid_until !== "string" || !Number.isFinite(Date.parse(row.valid_until))) return HIGH_NEEDS_EXPIRY_AR;
  const uses = row.max_uses === null || row.max_uses === undefined ? Number.NaN : Number(row.max_uses);
  if (!Number.isSafeInteger(uses) || uses < 1) return HIGH_NEEDS_LIMIT_AR;
  return null;
}

/**
 * (س٢١٣ ب) A code whose cap reaches 100 % never applies to a service sold by
 * a lawyer or an office: its excluded kinds always hold "service" (and
 * "topup", as every code). Below 100 the kinds are returned unchanged.
 */
export function withPlatformOnlyKinds(maxPct: unknown, kinds: readonly string[]): string[] {
  const pct = Number(maxPct);
  const out = [...new Set(["topup", ...kinds])];
  if (Number.isFinite(pct) && pct >= COUPON_HARD_MAX_PCT && !out.includes("service")) out.push("service");
  return out;
}

// ─── The coupons page's defaults (A-06) ─────────────────────────────────────

/** YYYY-MM-DD of `now` in Riyadh (no daylight saving: +03:00). */
export function riyadhDateInput(now: Date): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The first and last day of a new code: today in Riyadh, and 30 days on. */
export function newCouponDates(now: Date): { startsAt: string; expiresAt: string } {
  const start = riyadhDateInput(now);
  const end = riyadhDateInput(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
  return { startsAt: start, expiresAt: end };
}

/** A new code's minimum order before VAT (SAR). l18 (ق٢٦-١١): optional — a new code starts with none (0). */
export const NEW_COUPON_MIN_ORDER_SAR = 0;
