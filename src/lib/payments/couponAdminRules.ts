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
 * S6-T11 (slice A §6.2.3, «managed 100% from admin»): a PATCH may also change
 * the cap and the excluded kinds (same rules as a create); the row's metadata
 * flags — first_paid_order_only (owner ٣٠٥) and excluded_items (price-book
 * ids) — are edited here (adminCouponMetadataPatch), and every other metadata
 * key (owner_rules, rules, first_order_rule, status …) is kept; and the
 * page's audience «الشركات» ('business') is stored as the user_type companies
 * have, 'corporate' (couponRoleToUserType).
 *
 * Pure: relative `.ts` imports only (the price book), so `node --test` loads it.
 */

import { PRICE_BOOK } from "../pricing/priceBook.ts";

export const OWNER_MAX_DISCOUNT_PCT = 25;
export const COUPON_KINDS: readonly string[] = Object.freeze(["plan", "library", "topup", "service"]);

export const MIN_ORDER_REQUIRED_AR = "الحد الأدنى للطلب مطلوب لكوبون الخصم (صافي الطلب قبل الضريبة، أكبر من صفر)";
export const MAX_PCT_AR = "سقف الخصم لا يتجاوز ٢٥٪ من صافي الطلب";
export const VALUE_REQUIRED_AR = "قيمة الخصم مطلوبة وأكبر من صفر";
export const KINDS_AR = "أنواع الطلبات المستثناة غير صالحة";
export const UNKNOWN_ITEM_AR = "منتج مستثنى غير معروف";
export const ITEMS_LIST_AR = "قائمة المنتجات المستثناة غير صالحة";
export const FIRST_ORDER_FLAG_AR = "قيمة «للطلب المدفوع الأول فقط» غير صالحة";
export const ROLES_AR = "الفئات المستهدفة غير صالحة";

export const isDiscountType = (dbType: string): boolean => dbType === "fixed" || dbType === "percentage";

// ─── The audience: the page's roles ↔ profiles.user_type (S6-T11) ────────────

/**
 * The page's roles. «الأفراد» is 'client' (user_type 'individual') and
 * «الشركات» is 'business' (user_type 'corporate'); the others are user_types.
 */
export const COUPON_ROLES: readonly string[] = Object.freeze([
  "client",
  "business",
  "micro",
  "lawyer",
  "firm",
  "provider",
  "government",
  "ngo",
]);

/**
 * A page role → the profiles.user_type a coupon row stores. Bug fixed in
 * S6-T11: «الشركات» used to be stored as 'business', which no profile has, so
 * a company never matched. 'business' maps to 'corporate' and nothing else.
 */
export function couponRoleToUserType(role: string): string {
  if (role === "client") return "individual";
  if (role === "business") return "corporate";
  return role;
}

/**
 * A stored user_type → the page's role. `business: "business"` stays for the
 * rows saved before the fix, until 20261103_22 (AFTER the deploy) renames
 * them: such a row still shows as «الشركات», and a save that does not touch
 * the audience sends nothing for it (couponAdminDiff).
 */
export const COUPON_USER_TYPE_TO_ROLE: Readonly<Record<string, string>> = Object.freeze({
  individual: "client",
  client: "client",
  corporate: "business",
  business: "business",
  micro: "micro",
  lawyer: "lawyer",
  firm: "firm",
  provider: "provider",
  government: "government",
  ngo: "ngo",
});

/** The body's eligibleRoles → eligible_user_types (deduped; [] = everyone), or an error on an unknown role. */
export function couponAudience(raw: unknown): { ok: true; userTypes: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || !raw.every((r) => typeof r === "string" && COUPON_ROLES.includes(r))) {
    return { ok: false, error: ROLES_AR };
  }
  return { ok: true, userTypes: [...new Set((raw as string[]).map(couponRoleToUserType))] };
}

/** A coupons.id (uuid); anything else is a 404 before any read. */
export function isCouponId(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// ─── The discount columns ─────────────────────────────────────────────────────

export type AdminDiscountFields =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; error: string };

const num = (v: unknown): number => (v === null || v === undefined || v === "" ? Number.NaN : Number(v));

/** maxDiscountPct: absent / null / "" = 25; else a number in (0, 25]; null = refused. */
function parseMaxPct(raw: unknown): number | null {
  const pct = raw === undefined || raw === null || raw === "" ? OWNER_MAX_DISCOUNT_PCT : num(raw);
  return Number.isFinite(pct) && pct > 0 && pct <= OWNER_MAX_DISCOUNT_PCT ? pct : null;
}

/** excludedKinds: an array of known kinds; topup always first; null = refused. */
function parseKinds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || !raw.every((k) => typeof k === "string" && COUPON_KINDS.includes(k))) return null;
  return [...new Set(["topup", ...(raw as string[])])];
}

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

  const pctRaw = parseMaxPct(body.maxDiscountPct);
  if (pctRaw === null) return { ok: false, error: MAX_PCT_AR };

  let kinds: string[] = ["topup"];
  if (body.excludedKinds !== undefined && body.excludedKinds !== null) {
    const parsed = parseKinds(body.excludedKinds);
    if (!parsed) return { ok: false, error: KINDS_AR };
    kinds = parsed;
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
 * S6-T11: maxDiscountPct and excludedKinds may change too, with the create's
 * rules and errors (max_discount_pct; excluded_kinds with topup always in).
 * The route refuses them while 20261026_20's columns are missing.
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

  if (body.maxDiscountPct !== undefined) {
    const pct = parseMaxPct(body.maxDiscountPct);
    if (pct === null) return { ok: false, error: MAX_PCT_AR };
    fields.max_discount_pct = pct;
  }
  if (body.excludedKinds !== undefined) {
    const kinds = parseKinds(body.excludedKinds);
    if (!kinds) return { ok: false, error: KINDS_AR };
    fields.excluded_kinds = kinds;
  }

  const willBeActive = nextActive ?? existing.active === true;
  if (willBeActive && !(Number.isFinite(min) && min > 0)) return { ok: false, error: MIN_ORDER_REQUIRED_AR };
  return { ok: true, fields };
}

// ─── The row's metadata flags (S6-T11) ───────────────────────────────────────

export type AdminCouponMetadataPatch =
  | { ok: true; metadata: Record<string, unknown> | null }
  | { ok: false; error: string };

/**
 * The body's rule flags merged into the row's metadata:
 *   - firstPaidOrderOnly (a boolean, nothing else) → first_paid_order_only;
 *   - excludedItems (an array of price-book ids, each a PRICE_BOOK key) →
 *     excluded_items (deduped; [] clears the list).
 * Every other key (owner_rules, rules, first_order_rule, status …) is kept.
 * metadata: null when neither key is sent (nothing to write). The input is
 * not mutated.
 */
export function adminCouponMetadataPatch(
  existing: Record<string, unknown> | null,
  body: Record<string, unknown>,
): AdminCouponMetadataPatch {
  const flags: Record<string, unknown> = {};
  if (body.firstPaidOrderOnly !== undefined) {
    if (typeof body.firstPaidOrderOnly !== "boolean") return { ok: false, error: FIRST_ORDER_FLAG_AR };
    flags.first_paid_order_only = body.firstPaidOrderOnly;
  }
  if (body.excludedItems !== undefined) {
    if (!Array.isArray(body.excludedItems) || !body.excludedItems.every((id) => typeof id === "string")) {
      return { ok: false, error: ITEMS_LIST_AR };
    }
    const ids = body.excludedItems as string[];
    if (!ids.every((id) => Object.hasOwn(PRICE_BOOK, id))) return { ok: false, error: UNKNOWN_ITEM_AR };
    flags.excluded_items = [...new Set(ids)];
  }
  if (Object.keys(flags).length === 0) return { ok: true, metadata: null };
  return { ok: true, metadata: { ...(existing ?? {}), ...flags } };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The ONE metadata a PATCH writes: the row's metadata, then the flags, then
 * metadata.status when the status changed — so a body carrying a status and
 * a flag keeps both. null when nothing changes (no flags and no status, or a
 * result equal to the stored metadata).
 */
export function buildCouponPatchMetadata(
  existing: Record<string, unknown> | null,
  flags: Record<string, unknown> | null,
  nextStatus: string | null,
): Record<string, unknown> | null {
  if (!flags && nextStatus === null) return null;
  const base = existing ?? {};
  const next: Record<string, unknown> = { ...base, ...(flags ?? {}), ...(nextStatus !== null ? { status: nextStatus } : {}) };
  const keys = new Set([...Object.keys(base), ...Object.keys(next)]);
  return [...keys].some((k) => !sameJson(base[k], next[k])) ? next : null;
}
