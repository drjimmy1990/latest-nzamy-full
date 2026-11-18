/**
 * firmSeats.ts — the seats each firm plan includes, and the extra-seat price
 * setting (owner question ٥٣, approved 18 Nov 2026).
 *
 *   - The built rule stands: 5 seats with «مكتب المحاماة» (firm-basic), 15 with
 *     «شركة المحاماة» (firm-enterprise). The database enforces the same
 *     numbers (public.firm_plan_seat_cap, 20261126_50); firmSeats.test.ts
 *     holds the two together, and the /pricing cards read them from here.
 *   - An extra seat's price is an ADMIN SETTING, platform_settings
 *     firm_extra_seat_price_sar = {"sar": SAR before VAT}, or {"sar": null}
 *     (the default) while the owner has not set it. It is NOT sold online and never shown on a
 *     public page: the cards keep «مقاعد إضافية: تواصل مع المبيعات», and
 *     sales/admin raise a firm's seats (firm_profiles.max_seats).
 *
 * Pure: no imports, so `node --test` loads it.
 */

export const FIRM_PLAN_SEATS: Readonly<Record<"firm-basic" | "firm-enterprise", number>> = Object.freeze({
  "firm-basic": 5,
  "firm-enterprise": 15,
});

/** platform_settings key of the extra-seat price (20261128_10). */
export const FIRM_EXTRA_SEAT_PRICE_KEY = "firm_extra_seat_price_sar";

const MAX_SEAT_PRICE_SAR = 1_000_000;

/**
 * Admin write check for firm_extra_seat_price_sar; null when acceptable.
 * The value is an object (platform_settings.value is NOT NULL jsonb, so a bare
 * null cannot be stored): {"sar": null} while not set, {"sar": 450} once set.
 */
export function firmExtraSeatPriceIssue(value: unknown): string | null {
  const shape = `قيمة ${FIRM_EXTRA_SEAT_PRICE_KEY} يجب أن تكون {"sar": سعر المقعد الإضافي بالريال قبل الضريبة، عدد صحيح من 1 إلى ${MAX_SEAT_PRICE_SAR}} أو {"sar": null} حتى يُحدَّد — لا يُعرض علناً ولا يُباع عبر الموقع`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return shape;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "sar") return shape;
  const sar = (value as { sar: unknown }).sar;
  if (sar === null) return null;
  return typeof sar === "number" && Number.isInteger(sar) && sar > 0 && sar <= MAX_SEAT_PRICE_SAR ? null : shape;
}

/** The stored price in SAR, or null (not set, malformed). Admin-side only. */
export function firmExtraSeatPriceSar(value: unknown): number | null {
  return firmExtraSeatPriceIssue(value) === null ? ((value as { sar: number | null }).sar ?? null) : null;
}
