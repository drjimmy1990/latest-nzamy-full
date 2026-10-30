/**
 * Who may BUY the legal library (backlog LIVE-F05; owner's decision, in his own
 * words in the 2026-10-28 conversation, CONV-1285 of the owner package's
 * 05-traceability/conversation-register.csv): «المكتبة قاصرة على المحامين
 * والمستشارين واي شخص قانوني». The same package's backlog row LIVE-F05 asks to
 * apply «قرار المالك عن قصر البيع على المهنيين في واجهة العرض والخادم», and
 * src/constants/pricing/pricing.library.ts already says the library plans are
 * shown to the "lawyers" and "firms" audiences only.
 *
 * WHICH ACCOUNT TYPES (profiles.user_type, src/lib/auth/userTypes.ts):
 *   eligible  lawyer      — the lawyer, and the legal consultant (a lawyer
 *                           account whose kind is consultant)
 *             firm        — law firms
 *             corporate   — a company's legal department
 *             government  — a government body's legal department
 *   refused   individual  — the owner's explicit ban («حظر الأفراد»)
 *   refused, OWNER QUESTION — micro (a small business), ngo (an association)
 *             and provider (notary / arbitrator / bailiff) are not named in
 *             his words. They stay refused until he answers; adding one is a
 *             one-word change to LIBRARY_ELIGIBLE_USER_TYPES below.
 *   admin     staff already hold the full library (hasFullLibraryAccess); they
 *             never need to buy it, so they are not in the list.
 *   An unknown or missing type is refused (fail closed).
 *
 * WHAT IT GOVERNS: buying a paid library plan (lib-q1 / lib-q2 / lib-annual),
 * online or through an entitlement request. It does NOT govern the free
 * preview (the first articles + the index + the summary stay open to everyone
 * for search engines), nor an admin's deliberate grant, nor the AI tools.
 *
 * Pure, relative imports only: `node --test` loads it, and the server price
 * book (src/lib/pricing/priceBook.ts, library() → buyers) can import the list.
 */

export const LIBRARY_ELIGIBLE_USER_TYPES: readonly string[] = Object.freeze([
  'lawyer',
  'firm',
  'corporate',
  'government',
]);

/** The paid library plans (the ones sold online and requestable). */
export const PAID_LIBRARY_PLAN_REFS: readonly string[] = Object.freeze(['lib-q1', 'lib-q2', 'lib-annual']);

export type LibraryPurchaseRefusal = 'individual' | 'not_professional' | 'unknown';

export type LibraryPurchaseEligibility =
  | { eligible: true }
  | { eligible: false; reason: LibraryPurchaseRefusal; messageAr: string };

/** What an individual is told — in the paywall, on /laws/subscribe and by the server. */
export const LIBRARY_INDIVIDUAL_MESSAGE_AR =
  'اشتراك المكتبة القانونية متاح للمحامين والمستشارين القانونيين ومكاتب المحاماة والإدارات القانونية فقط، ولا يُباع لحسابات الأفراد. ما زال بإمكانك قراءة الجزء المجاني من كل نظام، والاطلاع على الفهرس والموجز، واستعمال الحاسبات والمرشد مجاناً.';

/** What another non-professional account type is told. */
export const LIBRARY_NOT_PROFESSIONAL_MESSAGE_AR =
  'اشتراك المكتبة القانونية متاح للمحامين والمستشارين القانونيين ومكاتب المحاماة والإدارات القانونية فقط، ونوع حسابك الحالي غير مشمول. إن كنت تعمل في المجال القانوني فتواصل معنا لتعديل نوع الحساب.';

/** What a request without a readable account type is told. */
export const LIBRARY_UNKNOWN_TYPE_MESSAGE_AR =
  'تعذّر التحقق من نوع حسابك، فلا يمكن إتمام اشتراك المكتبة الآن. أكمل بيانات حسابك أو تواصل معنا.';

/** May an account of this type buy a paid library plan? */
export function libraryPurchaseEligibility(userType: unknown): LibraryPurchaseEligibility {
  if (typeof userType !== 'string' || userType.length === 0) {
    return { eligible: false, reason: 'unknown', messageAr: LIBRARY_UNKNOWN_TYPE_MESSAGE_AR };
  }
  if (LIBRARY_ELIGIBLE_USER_TYPES.includes(userType)) return { eligible: true };
  if (userType === 'individual') {
    return { eligible: false, reason: 'individual', messageAr: LIBRARY_INDIVIDUAL_MESSAGE_AR };
  }
  return { eligible: false, reason: 'not_professional', messageAr: LIBRARY_NOT_PROFESSIONAL_MESSAGE_AR };
}

/** True for lib-q1 / lib-q2 / lib-annual. */
export function isPaidLibraryPlanRef(ref: unknown): boolean {
  return typeof ref === 'string' && PAID_LIBRARY_PLAN_REFS.includes(ref);
}

/**
 * Does this entitlement request sell the library? A `library` request is the
 * gateway-off way to buy a plan (owner ٢٤٦): /laws/subscribe sends it with the
 * plan id. Any library request counts — a request for an unknown ref is still
 * someone asking to get the library, and the admin approval grants it as
 * lib-admin (resolveLibraryRequestGrant).
 */
export function isLibrarySaleRequest(kind: unknown): boolean {
  return kind === 'library';
}
