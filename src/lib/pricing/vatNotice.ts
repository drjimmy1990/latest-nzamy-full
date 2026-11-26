/**
 * vatNotice.ts — the one VAT sentence every price list and checkout shows
 * (pricing doc 25 Oct 2026, §2 rule 5 and §13ب.2; answer ٢٥٨).
 *
 * Every price on the platform is VAT-exclusive — individuals, students and
 * the library included — and 15 % is added at checkout and on the tax
 * invoice (src/lib/payments/catalog.ts `quote`). ٢٥٨ replaces ٢٤٨'s three
 * sentences (business on top / individuals inclusive / library by buyer)
 * with this single one.
 *
 * Pure: no `@/` imports and no runtime imports, so `node --test` loads it
 * (pricingHonesty.test.ts).
 */
import type { AudienceTab } from "../../constants/pricing/pricing.types.ts";

export type VatNotice = { readonly ar: string; readonly en: string };

export const VAT_NOTICE = {
  /** The owner's sentence, verbatim (§13ب.2). */
  exclusive: {
    ar: "جميع الأسعار المعروضة غير شاملة لضريبة القيمة المضافة ١٥٪ (تُضاف عند السداد وإصدار الفاتورة الضريبية)",
    en: "All prices shown exclude 15% VAT (added at checkout and on the tax invoice)",
  },
} as const satisfies Record<string, VatNotice>;

/**
 * l16 (A-01, owner 25 Nov §1.1): before the platform's VAT number is saved no
 * VAT is added, quoted or printed — the owner's own line (never «0 % VAT»).
 */
export const VAT_UNREGISTERED_NOTICE: VatNotice = Object.freeze({
  ar: "لا تُضاف ضريبة القيمة المضافة قبل إدخال الرقم الضريبي",
  en: "No VAT is added before the VAT number is registered",
});

/**
 * The VAT sentence for the server's answer (GET /api/v1/pricing/vat): the
 * exclusive notice once registered, the owner's no-VAT line before, and null
 * while unknown (a server render or a failed read shows no VAT line).
 */
export function vatNoticeText(vatRegistered: boolean | null): VatNotice | null {
  if (vatRegistered === true) return VAT_NOTICE.exclusive;
  if (vatRegistered === false) return VAT_UNREGISTERED_NOTICE;
  return null;
}

/**
 * The sentence for one /pricing section — the same for every audience and
 * mode since ٢٥٨. Kept as a function so the section reads it the one way.
 */
export function vatNoticeFor(audience: AudienceTab, libraryMode: boolean | undefined): VatNotice {
  void audience;
  void libraryMode;
  return VAT_NOTICE.exclusive;
}
