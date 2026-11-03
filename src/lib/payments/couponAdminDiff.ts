/**
 * couponAdminDiff.ts — what an edited coupon's save sends (S6-T12; slice A
 * §6.2.3). The coupons page used to PATCH the WHOLE draft, and the draft was
 * lossy:
 *   1. an empty eligible_user_types (= everyone) was shown as ["client"], so
 *      opening NZAMY50 to change any field narrowed it to individuals;
 *   2. dates were cut to YYYY-MM-DD, so the same save moved valid_until
 *      23:59:59Z to 00:00Z;
 *   3. dates and audience were rewritten even when not touched.
 * Now an existing coupon saves only the API keys whose value changed. Arrays
 * are compared as sets (order and duplicates do not count). An unchanged
 * draft gives {} and the page sends nothing.
 *
 * Pure: type-only imports, so `node --test` loads it.
 */

import type { AdminCoupon } from "../../types/adminBackendReady.ts";

/** The PATCH body keys of /api/v1/admin/coupons/[id] the editor can change. */
export const COUPON_PATCH_KEYS = [
  "value",
  "minOrderAmount",
  "pointsGranted",
  "usageLimit",
  "startsAt",
  "expiresAt",
  "status",
  "eligibleRoles",
  "maxDiscountPct",
  "excludedKinds",
  "firstPaidOrderOnly",
  "excludedItems",
] as const satisfies readonly (keyof AdminCoupon)[];

function sameSet(a: readonly unknown[], b: readonly unknown[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return sameSet(Array.isArray(a) ? a : [], Array.isArray(b) ? b : []);
  }
  return a === b;
}

/** Only the changed keys of `draft` against `original` (the coupon as it was read). */
export function couponPatchDiff(original: AdminCoupon, draft: AdminCoupon): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of COUPON_PATCH_KEYS) {
    const before = original[key];
    const after = draft[key];
    if (after === undefined) continue; // the editor never showed it: nothing to send
    if (!same(before, after)) out[key] = Array.isArray(after) ? [...new Set(after)] : after;
  }
  return out;
}
