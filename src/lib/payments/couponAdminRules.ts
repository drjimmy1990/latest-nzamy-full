/**
 * couponAdminRules.ts — what the admin coupons page may save (P7 review,
 * finding 2). Since P7 checkout honours every ACTIVE discount coupon, and the
 * admin create route used to save one with no minimum (min_order_amount 0),
 * so a code typed on the page went live on any order. The owner's rules for
 * any marketing coupon (pricing doc §13أ.3) are enforced here, before the
 * database's own CHECKs (20261026_20):
 *   - a discount coupon (fixed / percentage) needs a minimum order net
 *     before VAT, greater than 0 («الحد الأدنى للطلب مطلوب»);
 *   - (batch l14, 20261204_60, before payments go live — owner package of
 *     23 Nov §٤): the cap may go up to 100 % (max_discount_pct in (0, 100],
 *     default still 25 — owner ١٥٥), a percentage value never above the
 *     code's own cap, and EVERY new code carries its «الغرض» (purpose, 3–500
 *     characters; couponPurpose). A PATCH may set or change the purpose,
 *     never clear it, and a cap above 25 needs one (the database's
 *     coupons_high_discount_purpose_check says the same). A code that covers
 *     the whole price is refused at checkout without a saved card
 *     (fullDiscount.ts). Before l14 the rule was:
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

/** The default cap of a new code (owner ١٥٥: 25 %, top-ups never). */
export const OWNER_MAX_DISCOUNT_PCT = 25;
/** The hard ceiling (batch l14, 20261204_60): a code may cover the whole price. */
export const COUPON_HARD_MAX_PCT = 100;
export const COUPON_KINDS: readonly string[] = Object.freeze(["plan", "library", "topup", "service"]);

export const MIN_ORDER_REQUIRED_AR = "الحد الأدنى للطلب مطلوب لكوبون الخصم (صافي الطلب قبل الضريبة، أكبر من صفر)";
export const MAX_PCT_AR = "سقف الخصم بين ١٪ و١٠٠٪ من صافي الطلب";
export const VALUE_ABOVE_CAP_AR = "نسبة الخصم لا تتجاوز سقف الخصم المحدد لهذا الكود";
export const PURPOSE_REQUIRED_AR = "اكتب الغرض من الكود (من ٣ إلى ٥٠٠ حرف)";
export const PURPOSE_HIGH_CAP_AR = "سقف الخصم فوق ٢٥٪ يحتاج الغرض من الكود — اكتبه قبل الحفظ";

/** The purpose's length bounds (the database's coupons_purpose_check, 20261204_60). */
export const PURPOSE_MIN = 3;
export const PURPOSE_MAX = 500;

/** body.purpose → the trimmed text (3–500 characters), or null. */
export function couponPurpose(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ");
  return text.length >= PURPOSE_MIN && text.length <= PURPOSE_MAX ? text : null;
}

/**
 * The purpose a PATCH writes: `{ purpose }` when the body sends a valid one,
 * `{}` when it sends none. A cap ending above OWNER_MAX_DISCOUNT_PCT on a row
 * without a purpose needs one in the same save; a sent empty / invalid
 * purpose is refused (a purpose is never cleared).
 */
export function adminPurposePatch(
  existing: { purpose?: unknown; max_discount_pct?: unknown },
  body: Record<string, unknown>,
): AdminDiscountFields {
  const fields: Record<string, unknown> = {};
  if (body.purpose !== undefined) {
    const purpose = couponPurpose(body.purpose);
    if (!purpose) return { ok: false, error: PURPOSE_REQUIRED_AR };
    fields.purpose = purpose;
  }
  const nextCap = body.maxDiscountPct !== undefined ? num(body.maxDiscountPct) : num(existing.max_discount_pct);
  const hasPurpose = "purpose" in fields || couponPurpose(existing.purpose) !== null;
  if (Number.isFinite(nextCap) && nextCap > OWNER_MAX_DISCOUNT_PCT && !hasPurpose) return { ok: false, error: PURPOSE_HIGH_CAP_AR };
  return { ok: true, fields };
}
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

/** maxDiscountPct: absent / null / "" = 25; else a number in (0, 100] (l14); null = refused. */
function parseMaxPct(raw: unknown): number | null {
  const pct = raw === undefined || raw === null || raw === "" ? OWNER_MAX_DISCOUNT_PCT : num(raw);
  return Number.isFinite(pct) && pct > 0 && pct <= COUPON_HARD_MAX_PCT ? pct : null;
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
  if (dbType === "percentage" && value > COUPON_HARD_MAX_PCT) return { ok: false, error: MAX_PCT_AR };

  const min = num(body.minOrderAmount);
  if (!Number.isFinite(min) || min <= 0) return { ok: false, error: MIN_ORDER_REQUIRED_AR };

  const pctRaw = parseMaxPct(body.maxDiscountPct);
  if (pctRaw === null) return { ok: false, error: MAX_PCT_AR };
  // before 20261026_20 no cap column exists: the old 25 % ceiling stays the rule
  if (!opts.withNewColumns && pctRaw > OWNER_MAX_DISCOUNT_PCT) return { ok: false, error: MAX_PCT_AR };
  // l14: a percentage never promises more than the code's own cap
  if (dbType === "percentage" && value > pctRaw) return { ok: false, error: VALUE_ABOVE_CAP_AR };

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
 * coupon, a percentage value never above the code's cap (l14: the cap is
 * (0, 100], default 25; before l14 both were 25), and a discount coupon is never
 * switched ON while its stored minimum is 0 (LAUNCH2026 from the old seed, or
 * a code created before this rule) — the same hole as a create without one.
 * S6-T11: maxDiscountPct and excludedKinds may change too, with the create's
 * rules and errors (max_discount_pct; excluded_kinds with topup always in).
 * The route refuses them while 20261026_20's columns are missing.
 */
export function adminDiscountPatch(
  existing: { discount_type?: unknown; min_order_amount?: unknown; active?: unknown; discount_value?: unknown; max_discount_pct?: unknown },
  body: Record<string, unknown>,
  nextActive: boolean | undefined,
): AdminDiscountFields {
  const dbType = typeof existing.discount_type === "string" ? existing.discount_type : "";
  if (!isDiscountType(dbType)) return { ok: true, fields: {} };
  const fields: Record<string, unknown> = {};

  if (body.value !== undefined) {
    const value = num(body.value);
    if (!Number.isFinite(value) || value <= 0) return { ok: false, error: VALUE_REQUIRED_AR };
    if (dbType === "percentage" && value > COUPON_HARD_MAX_PCT) return { ok: false, error: MAX_PCT_AR };
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

  // l14: a percentage never above the code's cap — checked when either moves
  if (dbType === "percentage" && (body.value !== undefined || body.maxDiscountPct !== undefined)) {
    const value = body.value !== undefined ? num(body.value) : num(existing.discount_value);
    const storedCap = num(existing.max_discount_pct);
    const cap =
      typeof fields.max_discount_pct === "number"
        ? fields.max_discount_pct
        : Number.isFinite(storedCap) && storedCap > 0
          ? storedCap
          : OWNER_MAX_DISCOUNT_PCT;
    if (Number.isFinite(value) && value > cap) return { ok: false, error: VALUE_ABOVE_CAP_AR };
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

// ─── Review round 1 (M1, M6, M7) ────────────────────────────────────────────

export const BAD_BODY_AR = "بيانات غير صالحة";
export const DATE_AR = "تاريخ البدء أو الانتهاء غير صالح";
export const EXPECTED_UPDATED_AT_AR = "نسخة الكوبون المرسلة غير صالحة — أعد التحميل ثم عدّل.";

/** A JSON body the coupon routes accept: a plain object, never null / an array / a scalar. */
export function couponBodyObject(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

const RIYADH_OFFSET = "+03:00"; // Saudi Arabia keeps no daylight saving
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The Riyadh calendar date (YYYY-MM-DD) of an instant, or "" for anything unreadable. */
export function couponDateInput(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const t = Date.parse(value);
  if (Number.isNaN(t)) return "";
  // formatToParts, not a locale's YYYY-MM-DD convention
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(t);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * startsAt / expiresAt → the stored timestamptz. An empty value is null (the
 * caller decides the default). A date-only YYYY-MM-DD is that day in Riyadh:
 * startsAt from 00:00:00, expiresAt until 23:59:59 (+03:00) — it used to be
 * midnight UTC, so a coupon ending «2027-12-31» stopped at 03:00 that day.
 * Anything unparseable (or a 2027-02-30) is refused, never a 500 RangeError.
 */
export function couponDateIso(
  raw: unknown,
  edge: "start" | "end",
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: DATE_AR };
  const text = raw.trim();
  const ymd = DATE_ONLY_RE.exec(text);
  if (ymd) {
    const [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
    // a real calendar day only: 2027-02-30 must not roll over into March
    const day = new Date(Date.UTC(y, m - 1, d));
    if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return { ok: false, error: DATE_AR };
    const t = Date.parse(`${text}T${edge === "start" ? "00:00:00" : "23:59:59"}${RIYADH_OFFSET}`);
    if (Number.isNaN(t)) return { ok: false, error: DATE_AR };
    return { ok: true, value: new Date(t).toISOString() };
  }
  const t = Date.parse(text);
  if (Number.isNaN(t)) return { ok: false, error: DATE_AR };
  return { ok: true, value: new Date(t).toISOString() };
}

/**
 * The `updated_at` the page loaded (body.expectedUpdatedAt). PATCH writes only
 * while the row still carries it, so an edit or a coupon use (coupon_usage's
 * trigger bumps updated_at) since the page opened is a 409. Not sent → null
 * (an older client; the route then guards against its own read only).
 */
export function couponExpectedUpdatedAt(
  body: Record<string, unknown>,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const raw = body.expectedUpdatedAt;
  if (raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string" || raw.trim() === "" || Number.isNaN(Date.parse(raw))) {
    return { ok: false, error: EXPECTED_UPDATED_AT_AR };
  }
  return { ok: true, value: raw };
}
