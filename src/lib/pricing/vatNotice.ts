/**
 * vatNotice.ts — the VAT sentence each /pricing audience section shows under
 * its prices (owner answers ٢٣٩ / ٢٤٨, Moyasar B1).
 *
 * It says what the server charges (src/lib/payments/catalog.ts):
 *   - lawyers, consultants, firms and every establishment pay VAT on top
 *     (BUSINESS_USER_TYPES buy VAT-exclusive);
 *   - the individuals' prices include VAT;
 *   - the library depends on the buyer, so its plans state both rules.
 *
 * Pure: no `@/` imports and no runtime imports, so `node --test` loads it
 * (pricingHonesty.test.ts).
 */
import type { AudienceTab } from "../../constants/pricing/pricing.types.ts";

export type VatNotice = { readonly ar: string; readonly en: string };

export const VAT_NOTICE = {
  /** The owner's sentence, verbatim (٢٤٨). */
  exclusive: {
    ar: "الأسعار غير شاملة ضريبة القيمة المضافة ١٥٪ وتُضاف عند الدفع ويصدر بها فاتورة ضريبية رسمية",
    en: "Prices exclude 15% VAT, added at checkout with an official tax invoice",
  },
  inclusive: {
    ar: "الأسعار شاملة ضريبة القيمة المضافة",
    en: "Prices include VAT",
  },
  library: {
    ar: "للأفراد: شامل الضريبة · للمحامين والمنشآت: غير شامل الضريبة",
    en: "For individuals: VAT included · For lawyers and establishments: VAT excluded",
  },
} as const satisfies Record<string, VatNotice>;

/**
 * The sentence for one /pricing section. Library mode exists on the lawyers
 * and firms tabs only — the same condition getPlanList uses to swap in the
 * library plans.
 */
export function vatNoticeFor(audience: AudienceTab, libraryMode: boolean | undefined): VatNotice {
  if (libraryMode && (audience === "lawyers" || audience === "firms")) return VAT_NOTICE.library;
  return audience === "individuals" ? VAT_NOTICE.inclusive : VAT_NOTICE.exclusive;
}
