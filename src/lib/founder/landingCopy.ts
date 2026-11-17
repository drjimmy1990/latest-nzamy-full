/**
 * landingCopy.ts — the numbers and fixed lines of the /founder landing page.
 *
 * Source: the owner's campaign manifest (campaign.manifest.v2.json, 17 Nov
 * 2026), the only source the owner allows for a number or a date:
 *   - window: 2026-11-18T00:00:00+03:00 → 2026-12-18T00:00:00+03:00
 *     (exclusive; last day shown 17 Dec), or until the seats run out;
 *   - regular price before VAT: 9,500 (shown struck through);
 *   - founder price 2,996 + VAT 449.40 = 3,445.40.
 *
 * The founder price is NOT typed here: it comes from quote() — the same
 * price book checkout charges — and landingCopy.test.ts pins quote() to the
 * manifest's halalas, so the page and the checkout cannot drift apart
 * silently. The regular price is not sold anywhere, so it is a constant.
 *
 * The dates below are only the FALLBACK used while GET /api/v1/campaigns/active
 * carries no `founderWindow` yet (see founderWindow.ts); the server's window
 * wins whenever it is there.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { quote, PAYABLE_ITEMS, type PayableItem } from "../payments/catalog.ts";
import { FOUNDER_PLAN_ID } from "../membership/founderPlan.ts";
import { toArabicDigits } from "../services/arabicCount.ts";

export const FOUNDER_PAGE_PATH = "/founder";
export const FOUNDER_TERMS_PATH = "/founder-terms";

/** Manifest `campaign.starts_at` / `ends_at_exclusive` (fallback only). */
export const FOUNDER_FALLBACK_STARTS_AT = "2026-11-18T00:00:00+03:00";
export const FOUNDER_FALLBACK_ENDS_AT_EXCLUSIVE = "2026-12-18T00:00:00+03:00";

/** Manifest `lawyer.regular_price_sar_pre_vat`, in halalas. */
export const FOUNDER_REGULAR_PRICE_HALALAS = 950_000;

/** Manifest `lawyer.capacity` — shown only in copy, never as a live seat count. */
export const FOUNDER_MANIFEST_CAPACITY = 1096;

/** Halalas as «٢٬٩٩٦» / «٤٤٩٫٤٠» — grouped, Arabic-Indic, no currency. */
export function amountAr(h: number): string {
  const sar = Math.floor(h / 100);
  const halalas = h % 100;
  const fraction = halalas === 0 ? "" : `٫${String(halalas).padStart(2, "0")}`;
  return toArabicDigits(String(sar).replace(/\B(?=(\d{3})+(?!\d))/g, "٬") + fraction);
}

export interface FounderLandingPrice {
  /** «٩٬٥٠٠» */
  regular: string;
  /** «٢٬٩٩٦» */
  net: string;
  /** «٤٤٩٫٤٠» */
  vat: string;
  /** «٣٬٤٤٥٫٤٠» */
  total: string;
}

/**
 * The join card's price block, or null when the founder item is not sold
 * (the card then shows no price rather than a made-up one).
 */
export function founderLandingPrice(
  catalog: Readonly<Record<string, PayableItem>> = PAYABLE_ITEMS,
): FounderLandingPrice | null {
  const q = quote(FOUNDER_PLAN_ID, "once", catalog);
  if (!q.ok) return null;
  return {
    regular: amountAr(FOUNDER_REGULAR_PRICE_HALALAS),
    net: amountAr(q.netHalalas),
    vat: amountAr(q.vatHalalas),
    total: amountAr(q.totalHalalas),
  };
}

/** The owner's wording (BACKEND-SPEC §11): light, never an absolute promise. */
export const FOUNDER_ONCE_LINE = "عرض تأسيسي خاص بهذه الحملة، ولا نتوقع تكراره بهذه الصيغة.";

/** Who may buy (manifest `eligible_practice_kind: advocate`). */
export const FOUNDER_ADVOCATE_ONLY_LINE = "للمحامي المرخّص للترافع فقط";

/** The seven eligible drafting kinds (manifest `drafting_works.eligible_types`), in the owner's order. */
export const FOUNDER_WORK_KINDS: readonly string[] = Object.freeze([
  "صحيفة دعوى",
  "مذكرة رد ودفاع",
  "مذكرة تكميلية",
  "مذكرة ختامية",
  "لائحة استئناف",
  "صحيفة طعن بالنقض",
  "التماس إعادة نظر",
]);
