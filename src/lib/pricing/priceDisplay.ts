/**
 * priceDisplay.ts — small, dependency-free rules for how a plan's price is
 * shown on /pricing (src/components/pricing/PricingCards.tsx).
 *
 * No `@/` imports and no runtime imports: `node --test` loads this file
 * directly (priceDisplay.test.ts).
 */

import type { Cycle } from "./priceBook.ts";

export type BillingCycle = Cycle;

/**
 * The struck-through «بدلاً من …» reference price for a card, or null.
 *
 * The only reference prices left in the catalogue are the individuals'
 * twelve-months-of-monthly figures (e.g. ٣٩ × 12 = ٤٦٨ next to ٣٩٠ a year).
 * That comparison is true against the ANNUAL price only. On the monthly view
 * — the default — the same figure sat struck through above «٣٩ ر.س / شهر», which
 * reads as a cut from ٤٦٨ to ٣٩. So it is shown on the yearly view only.
 */
export function referencePriceFor(
  plan: { priceOriginal?: string | null },
  billing: BillingCycle,
): string | null {
  if (billing !== "yearly") return null;
  const original = plan.priceOriginal?.trim();
  return original ? original : null;
}

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/**
 * Parses a displayed amount such as «١٬٤٩٠», "1,490" or «٥,٩٨٨» into a number.
 * Returns null when the text is not a plain amount (e.g. «حسب الخدمة»,
 * "179,988+", or a string mixing digit systems such as «٥,٩٨8»).
 */
export function parseDisplayedAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const hasArabic = /[٠-٩۰-۹]/.test(trimmed);
  const hasLatin = /[0-9]/.test(trimmed);
  if (hasArabic && hasLatin) return null;
  let digits = "";
  for (const ch of trimmed) {
    const code = ch.codePointAt(0)!;
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      digits += String(code - ARABIC_INDIC_ZERO);
    } else if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9) {
      digits += String(code - EXTENDED_ARABIC_INDIC_ZERO);
    } else if (ch >= "0" && ch <= "9") {
      digits += ch;
    } else if (ch === "," || ch === "٬") {
      continue; // thousands separators
    } else {
      return null;
    }
  }
  return digits ? Number(digits) : null;
}
