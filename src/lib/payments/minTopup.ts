/**
 * minTopup.ts — l7 decision 5 (owner 18 Nov §16.10, G28–G33): the lowest
 * top-up an account type may buy, from platform_settings
 * min_topup_by_account_type (SAR, the pack's BASE price — before the founder
 * discount, any coupon and VAT). Batch l9 (owner register 14 item 7) made it
 * 50 for every account type; batch l12 (owner Q87, RAW[16][50][57]: «الفرد
 * 100 ثم 250، وغيره 500 فأكثر؛ والـ50 حد فتح المكتبة فقط») sets it back to
 * individual 100, every other type 500 (20261202_10). The type is
 * profiles.user_type, read on the server by the checkout (never the browser's).
 *
 * A refusal answers «الحد الأدنى للشحن لحسابك ٥٠٠ نقطة (٥٠٠ ريال قبل
 * الضريبة)» — the owner states the rule in points, and 1 point = 1 SAR
 * before VAT — and leaves one
 * admin_audit_events row (actor_type 'user', action 'topup_below_minimum').
 * The audit write is best-effort: it never changes the answer.
 * A setting that cannot be read falls back to the code defaults
 * (pointsSettings.ts) — a valid pack is never blocked by a read error.
 *
 * Relative imports only (type-only package imports): `node --test` loads it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readMinTopupByType } from "../points/pointsSettings.ts";

/** Arabic-Indic digits with a thousands separator: 500 → «٥٠٠», 1000 → «١٬٠٠٠». */
function arabicSar(n: number): string {
  return Math.round(n).toLocaleString("ar-SA", { useGrouping: true });
}

export function minTopupRefusalAr(minSar: number): string {
  const n = arabicSar(minSar);
  return `الحد الأدنى للشحن لحسابك ${n} نقطة (${n} ريال قبل الضريبة)`;
}

/** The minimum for `userType` (null when it has none), from an already-read map. */
export function minTopupFor(map: Readonly<Record<string, number>>, userType: string | null): number | null {
  if (!userType || !Object.hasOwn(map, userType)) return null;
  const n = map[userType];
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type MinTopupCheck = { ok: true } | { ok: false; status: 403; error: string; code: "topup_below_minimum" };

/**
 * The checkout's one call for a top-up: refused when the pack's base price
 * (halalas, before discount and VAT) is below the account type's minimum.
 */
export async function checkMinTopup(
  admin: SupabaseClient,
  input: { userId: string; userType: string | null; itemId: string; baseNetHalalas: number },
): Promise<MinTopupCheck> {
  const min = minTopupFor(await readMinTopupByType(admin), input.userType);
  if (min === null || input.baseNetHalalas >= Math.round(min * 100)) return { ok: true };
  try {
    const { error } = await admin.from("admin_audit_events").insert({
      actor_id: input.userId,
      actor_type: "user",
      action: "topup_below_minimum",
      target_type: "payment_item",
      target_id: input.itemId,
      before_state: null,
      after_state: null,
      metadata: { user_type: input.userType, min_sar: min, price_halalas: input.baseNetHalalas },
    });
    if (error) console.error("[payments/checkout] min top-up audit row failed:", error.code);
  } catch {
    console.error("[payments/checkout] min top-up audit row threw");
  }
  return { ok: false, status: 403, error: minTopupRefusalAr(min), code: "topup_below_minimum" };
}
