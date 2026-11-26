/**
 * gatewayErrorAr.ts — batch l18 (owner package of 26 Nov, LIVE-14 / LIVE-15):
 * the reason Moyasar (or the card's bank) gave for a refused payment, in
 * clear Arabic, for the notice on /checkout and for /payments/result. Before
 * this the form's report was thrown away on /checkout (needsNewCheckout) and
 * /payments/result printed Moyasar's raw English text («BLOCKED: CARD
 * COUNTRY NOT ALLOWED»).
 *
 *   failureReason(reported) — the text inside what the Moyasar form hands
 *     on_failure: a string (its documented shape), or an object carrying
 *     `message`, `source.message` or `error.message`. Null when none.
 *   gatewayErrorAr(message) — loose matching on the lower-cased text (spaces,
 *     underscores and dashes are one), so «CARD_COUNTRY_NOT_ALLOWED»,
 *     «card country not allowed» and «BLOCKED: CARD COUNTRY NOT ALLOWED»
 *     read the same. A message already in Arabic is kept (Moyasar answers
 *     Arabic for some errors when the form runs with language "ar"); anything
 *     unknown gets one generic Arabic sentence. The raw English is never shown.
 *
 * Pure (no imports), so `node --test` loads it and client components may import it.
 */

export const GATEWAY_DECLINED_GENERIC_AR =
  "رُفضت عملية الدفع من بوابة الدفع أو من البنك المصدر للبطاقة. أعد المحاولة، أو استخدم بطاقة أخرى.";

const RULES: ReadonlyArray<{ test: RegExp; ar: string }> = [
  {
    test: /country (is )?not (allowed|supported|permitted)|country restricted|card country/,
    ar: "رُفضت البطاقة لأن بلد إصدارها غير مقبول في بوابة الدفع. استخدم بطاقة صادرة في المملكة العربية السعودية (مدى أو فيزا أو ماستركارد).",
  },
  {
    test: /insufficient (funds|balance)|not sufficient funds|no sufficient/,
    ar: "رُفضت العملية لأن رصيد البطاقة لا يكفي. تأكد من الرصيد أو استخدم بطاقة أخرى.",
  },
  {
    test: /3 ?d ?s|3 ?d secure|three d|authentication (failed|was not|not completed|rejected)|otp|verification failed|not authenticated/,
    ar: "لم يكتمل التحقق البنكي (الرمز الذي يرسله البنك). أعد المحاولة وأدخل الرمز الصحيح خلال مهلته.",
  },
  {
    test: /expired card|card (is )?expired|expir(y|ation) (date )?(is )?(invalid|passed)/,
    ar: "البطاقة منتهية الصلاحية. استخدم بطاقة سارية.",
  },
  {
    test: /invalid (card|number|cvc|cvv|security code|expiry|expiration|month|year)|incorrect (number|cvc|cvv)|card number|wrong (cvc|cvv)/,
    ar: "بيانات البطاقة غير صحيحة. راجع رقم البطاقة وتاريخ انتهائها ورمز التحقق (CVV) ثم أعد المحاولة.",
  },
  {
    test: /(not supported|unsupported) (card|brand|scheme|network)|card (type|brand) (is )?not (supported|allowed)/,
    ar: "نوع هذه البطاقة غير مدعوم. استخدم بطاقة مدى أو فيزا أو ماستركارد.",
  },
  {
    test: /limit (exceeded|reached)|exceeds? (the )?(withdrawal|amount|limit)|over (the )?limit/,
    ar: "تجاوزت العملية الحد المسموح لبطاقتك. تواصل مع بنكك أو استخدم بطاقة أخرى.",
  },
  {
    test: /timeout|timed out|network|connection|unreachable|service unavailable|try again later/,
    // l18 review: a timeout can follow a charge that went through — no promise
    // that nothing was taken; the result is checked, look at billing first
    ar: "انقطع الاتصال ببوابة الدفع أثناء العملية، ونتيجتها قيد التحقق. راجع صفحة «الفواتير» قبل أن تدفع مرة أخرى، وتواصل معنا إن ظهر خصم في حسابك دون اشتراك.",
  },
  {
    test: /lost|stolen|restricted card|pick ?up card|fraud|suspected/,
    ar: "رفض البنك المصدر هذه البطاقة. تواصل مع بنكك أو استخدم بطاقة أخرى.",
  },
  {
    test: /declined|do not honou?r|not approved|refused|rejected|denied|blocked/,
    ar: "رفض البنك المصدر للبطاقة هذه العملية. تواصل مع بنكك أو استخدم بطاقة أخرى.",
  },
];

/** True when the text holds Arabic letters (Moyasar's own Arabic message is kept as it is). */
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

/** The reason text inside an on_failure report, trimmed to 300 characters; null when there is none. */
export function failureReason(reported: unknown): string | null {
  const pick = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 300) : null);
  if (typeof reported === "string") return pick(reported);
  if (typeof reported !== "object" || reported === null) return null;
  const r = reported as Record<string, unknown>;
  const source = typeof r.source === "object" && r.source !== null ? (r.source as Record<string, unknown>) : null;
  const error = typeof r.error === "object" && r.error !== null ? (r.error as Record<string, unknown>) : null;
  return pick(source?.message) ?? pick(r.message) ?? pick(error?.message) ?? pick(r.error) ?? null;
}

/** The Arabic sentence for a gateway or bank refusal; the generic one for an empty or unknown message. */
export function gatewayErrorAr(message: string | null | undefined): string {
  if (typeof message !== "string" || message.trim() === "") return GATEWAY_DECLINED_GENERIC_AR;
  const raw = message.trim();
  if (hasArabic(raw)) return raw.slice(0, 300);
  const text = raw.toLowerCase().replace(/[_\-:.,()]+/g, " ").replace(/\s+/g, " ").trim();
  for (const rule of RULES) if (rule.test.test(text)) return rule.ar;
  return GATEWAY_DECLINED_GENERIC_AR;
}

/** The notice on /checkout after the form reported a refusal: the reason, then what to do next. */
export function checkoutRefusalNoticeAr(reported: unknown): string {
  return `${gatewayErrorAr(failureReason(reported))} اضغط «متابعة الدفع» لبدء محاولة جديدة.`;
}
