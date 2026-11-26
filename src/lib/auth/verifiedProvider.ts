/**
 * verifiedProvider.ts — R9b / F11 (batch l11-sec): an account whose licence is
 * not verified yet may not CREATE contracts, invoices or fee statements.
 * Open requests already need a verified lawyer (20261127_70); platform
 * checkout before verification stays allowed (owner q٦١).
 *
 * Who passes:
 *   - an admin (staff tools);
 *   - a lawyer whose lawyer_profiles.verification_status is 'verified';
 *   - a firm account whose own firm_profiles row is 'verified';
 *   - any account that is an ACTIVE member of a verified firm (a firm's staff
 *     work under the firm's verification).
 * Everyone else is refused with UNVERIFIED_PROVIDER_REFUSAL_AR (403). A read
 * that fails refuses too (503) — fail closed. Demo and test accounts follow
 * the same rule (no bypass): they pass only if their seeded profile is verified.
 *
 * Pure: `node --test` loads it. The reads live in verifiedProviderServer.ts.
 */

export const UNVERIFIED_PROVIDER_REFUSAL_AR =
  "وثّق رخصتك أولاً: إنشاء العقود والفواتير وبيانات الأتعاب متاح بعد أن يعتمد فريق المنصة توثيق حسابك.";

export const UNVERIFIED_PROVIDER_CHECK_FAILED_AR = "تعذّر التحقق من توثيق حسابك الآن. أعد المحاولة بعد قليل.";

export const UNVERIFIED_PROVIDER_CODE = "provider_not_verified";

export interface VerifiedProviderFacts {
  userType: string;
  /** lawyer_profiles.verification_status of the caller (null: no row). */
  lawyerStatus: string | null;
  /** firm_profiles.verification_status of the firm(s) the caller OWNS. */
  ownedFirmStatuses: readonly (string | null)[];
  /** verification_status of every firm the caller is an ACTIVE member of. */
  memberFirmStatuses: readonly (string | null)[];
}

export type VerifiedProviderDecision = { ok: true } | { ok: false; status: 403 | 503; error: string; code?: string };

export function verifiedProviderDecision(facts: VerifiedProviderFacts | null): VerifiedProviderDecision {
  if (!facts) return { ok: false, status: 503, error: UNVERIFIED_PROVIDER_CHECK_FAILED_AR };
  if (facts.userType === "admin") return { ok: true };
  if (facts.userType === "lawyer" && facts.lawyerStatus === "verified") return { ok: true };
  if (facts.userType === "firm" && facts.ownedFirmStatuses.includes("verified")) return { ok: true };
  if (facts.memberFirmStatuses.includes("verified")) return { ok: true };
  return { ok: false, status: 403, error: UNVERIFIED_PROVIDER_REFUSAL_AR, code: UNVERIFIED_PROVIDER_CODE };
}

// ── owner س٢١٤ (25 Nov 2026, batch l16): the professional AI tools ─────────────

/** Where a lawyer finishes his licence verification (photo + code). */
export const LICENCE_VERIFY_HREF = "/register/provider/verify";

/** The professional tools' refusal before the licence is verified. */
export const LICENCE_REQUIRED_TOOLS_AR =
  "وثّق رخصتك أولاً: أدوات الصياغة والتحليل المهنية تعمل بعد أن يعتمد فريق المنصة توثيق ترخيصك.";

/** A firm account is verified by the team (no self-service step): the same rule, without a link. */
export const LICENCE_REQUIRED_FIRM_AR =
  "أدوات الصياغة والتحليل المهنية تعمل بعد أن يعتمد فريق المنصة توثيق مكتبك.";

/**
 * The 403 body of a professional AI tool for an unverified account:
 * `verifyHref` is the lawyer's own verification step, null for a firm (its
 * verification is the team's review).
 */
export function licenceRefusalBody(userType: string): { error: string; code: typeof UNVERIFIED_PROVIDER_CODE; verifyHref: string | null } {
  return userType === "firm"
    ? { error: LICENCE_REQUIRED_FIRM_AR, code: UNVERIFIED_PROVIDER_CODE, verifyHref: null }
    : { error: LICENCE_REQUIRED_TOOLS_AR, code: UNVERIFIED_PROVIDER_CODE, verifyHref: LICENCE_VERIFY_HREF };
}

/** useAiRun → the /ai layout: a run was refused for the licence (detail: { verifyHref }). */
export const LICENCE_REQUIRED_EVENT = "nzamy:licence-required";
