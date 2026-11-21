/**
 * The terms version every account must have accepted (R7, owner package
 * 2026-11-17, file 11 part «ب»).
 *
 * Bump CURRENT_TERMS_VERSION — and the two «آخر تحديث» strings below, which
 * /terms shows — whenever /terms changes in substance. Every account whose
 * newest row in public.terms_acceptances is for an older version is then asked
 * again, once, on its next signed-in visit (TermsReacceptGate). Update the
 * modal's text in src/components/legal/TermsReacceptGate.tsx at the same
 * time: it names what changed in THIS version.
 *
 * Batch l9 (owner register 14 items 31 / 58, 19 Nov 2026): 2026-11-21 — the
 * ONE new terms version before payment goes live. /terms gains clauses 14
 * (anti-scraping), 14-أ (its one narrow exception) and 15 (the TDM
 * reservation), Arabic and English; /founder-terms gets the same version
 * (FOUNDER_TERMS_VERSION, which must equal this — founderTerms.test.ts).
 *
 * Batch l12 (owner answers of 20 Nov 2026): 2026-11-22 — the batch's ONE new
 * version. /terms section ٦ states the point's value («النقطة = ريال سعودي
 * واحد قبل ضريبة القيمة المضافة») and the minimum top-up (individual 100,
 * every other type 500); /refund-policy (part of the terms) refunds a top-up
 * only while none of its points was spent; /founder-terms item ٥ drops
 * «بحد أدنى 50 نقطة» (50 is the library's opening balance, not a top-up
 * minimum) and items ٥ / ١٣ say the founder discount and a top-up bonus never
 * stack (the higher one). Every account is asked again once (TermsReacceptGate).
 *
 * Format: YYYY-MM-DD (the migration's CHECK refuses anything else).
 *
 * Pure: no imports, safe in client components and under `node --test`.
 */
export const CURRENT_TERMS_VERSION = "2026-11-22";

/** /terms «آخر تحديث» — the same day as CURRENT_TERMS_VERSION. */
export const TERMS_LAST_UPDATED_AR = "٢٢ نوفمبر ٢٠٢٦";
export const TERMS_LAST_UPDATED_EN = "November 22, 2026";

/** The /terms anchor of the «حماية المنصة ومحتواها» section. */
export const PLATFORM_PROTECTION_ANCHOR = "platform-protection";

/**
 * The consent sentence beside the checkbox — the owner's text (file 11,
 * part «ب»), verbatim. The two link phrases are split out so the form can
 * link them; joined, the three parts are his sentence exactly.
 */
export const TERMS_CONSENT_AR = {
  before: "أقر بأنني اطلعت على ",
  termsLink: "شروط الاستخدام",
  middle: " و",
  protectionLink: "بند حماية المنصة ومحتواها",
  after:
    "، وأفهم أن الاستخراج الآلي أو الهندسة العكسية أو التحايل على حدود الاستخدام يعرّضني للمساءلة الجزائية بالسجن مدة لا تزيد على أربع سنوات وبغرامة لا تزيد على ثلاثة ملايين ريال بحسب الفعل، وللتعويض.",
} as const;

export const TERMS_CONSENT_EN = {
  before: "I confirm that I have read the ",
  termsLink: "Terms of Use",
  middle: " and the ",
  protectionLink: "Platform and Content Protection clause",
  after:
    ", and I understand that automated extraction, reverse engineering or circumventing usage limits exposes me to criminal liability — imprisonment of up to four years and a fine of up to three million riyals, depending on the act — and to compensation.",
} as const;

/** The whole Arabic sentence, as the owner wrote it. */
export function termsConsentSentenceAr(): string {
  const t = TERMS_CONSENT_AR;
  return `${t.before}${t.termsLink}${t.middle}${t.protectionLink}${t.after}`;
}
