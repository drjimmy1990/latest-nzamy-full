/**
 * couponAdminRules.ts — what the admin coupons page may save (P7 review,
 * finding 2). Since P7 checkout honours every ACTIVE discount coupon, and the
 * admin create route used to save one with no minimum (min_order_amount 0),
 * so a code typed on the page went live on any order. The owner's rules for
 * any marketing coupon (pricing doc §13أ.3) are enforced here, before the
 * database's own CHECKs (20261026_20):
 *   - a discount coupon (fixed / percentage) needs a minimum order net
 *     before VAT, greater than 0 («الحد الأدنى للطلب مطلوب»);
 *   - the discount never exceeds 25 % of the net: max_discount_pct ≤ 25
 *     (default 25), and a percentage coupon's value is at most 25;
 *   - excluded_kinds always holds topup (added when missing) and only the
 *     kinds payment_orders knows (plan / library / topup / service).
 * Points / plan coupons are not checkout discounts (couponRules.ts refuses
 * them there) and need no minimum.
 * `withNewColumns` is false until 20261026_20 has run (couponServer
 * .couponsAvailable): then max_discount_pct / excluded_kinds are not sent —
 * the insert would fail on a missing column — and the rules still hold in
 * code.
 *
 * Pure: no imports, so `node --test` loads it.
 */

export const OWNER_MAX_DISCOUNT_PCT = 25;
export const COUPON_KINDS: readonly string[] = Object.freeze(["plan", "library", "topup", "service"]);

export const MIN_ORDER_REQUIRED_AR = "الحد الأدنى للطلب مطلوب لكوبون الخصم (صافي الطلب قبل الضريبة، أكبر من صفر)";
export const MAX_PCT_AR = "سقف الخصم لا يتجاوز ٢٥٪ من صافي الطلب";
export const VALUE_REQUIRED_AR = "قيمة الخصم مطلوبة وأكبر من صفر";
export const KINDS_AR = "أنواع الطلبات المستثناة غير صالحة";

export const isDiscountType = (dbType: string): boolean => dbType === "fixed" || dbType === "percentage";

export type AdminDiscountFields =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; error: string };

const num = (v: unknown): number => (v === null || v === undefined || v === "" ? Number.NaN : Number(v));

/**
 * The checked discount columns for a CREATE. `dbType` is the mapped
 * discount_type; for a points / plan coupon nothing is required.
 */
export function adminDiscountFields(
  dbType: string,
  body: Record<string, unknown>,
  opts: { withNewColumns: boolean },
): AdminDiscountFields {
  if (!isDiscountType(dbType)) return { ok: true, fields: {} };

  const value = num(body.value);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: VALUE_REQUIRED_AR };
  if (dbType === "percentage" && value > OWNER_MAX_DISCOUNT_PCT) return { ok: false, error: MAX_PCT_AR };

  const min = num(body.minOrderAmount);
  if (!Number.isFinite(min) || min <= 0) return { ok: false, error: MIN_ORDER_REQUIRED_AR };

  const pctRaw = body.maxDiscountPct === undefined || body.maxDiscountPct === null || body.maxDiscountPct === "" ? OWNER_MAX_DISCOUNT_PCT : num(body.maxDiscountPct);
  if (!Number.isFinite(pctRaw) || pctRaw <= 0 || pctRaw > OWNER_MAX_DISCOUNT_PCT) return { ok: false, error: MAX_PCT_AR };

  let kinds: string[] = ["topup"];
  if (body.excludedKinds !== undefined && body.excludedKinds !== null) {
    if (!Array.isArray(body.excludedKinds) || !body.excludedKinds.every((k) => typeof k === "string" && COUPON_KINDS.includes(k))) {
      return { ok: false, error: KINDS_AR };
    }
    kinds = [...new Set(["topup", ...(body.excludedKinds as string[])])];
  }

  const fields: Record<string, unknown> = { discount_value: value, min_order_amount: min };
  if (opts.withNewColumns) {
    fields.max_discount_pct = pctRaw;
    fields.excluded_kinds = kinds;
  }
  return { ok: true, fields };
}

/**
 * A PATCH: the minimum may change but never to 0 / empty on a discount
 * coupon, a percentage value never above 25, and a discount coupon is never
 * switched ON while its stored minimum is 0 (LAUNCH2026 from the old seed, or
 * a code created before this rule) — the same hole as a create without one.
 */
export function adminDiscountPatch(
  existing: { discount_type?: unknown; min_order_amount?: unknown; active?: unknown },
  body: Record<string, unknown>,
  nextActive: boolean | undefined,
): AdminDiscountFields {
  const dbType = typeof existing.discount_type === "string" ? existing.discount_type : "";
  if (!isDiscountType(dbType)) return { ok: true, fields: {} };
  const fields: Record<string, unknown> = {};

  if (body.value !== undefined) {
    const value = num(body.value);
    if (!Number.isFinite(value) || value <= 0) return { ok: false, error: VALUE_REQUIRED_AR };
    if (dbType === "percentage" && value > OWNER_MAX_DISCOUNT_PCT) return { ok: false, error: MAX_PCT_AR };
  }

  let min = num(existing.min_order_amount);
  if (body.minOrderAmount !== undefined) {
    min = num(body.minOrderAmount);
    if (!Number.isFinite(min) || min <= 0) return { ok: false, error: MIN_ORDER_REQUIRED_AR };
    fields.min_order_amount = min;
  }

  const willBeActive = nextActive ?? existing.active === true;
  if (willBeActive && !(Number.isFinite(min) && min > 0)) return { ok: false, error: MIN_ORDER_REQUIRED_AR };
  return { ok: true, fields };
}
