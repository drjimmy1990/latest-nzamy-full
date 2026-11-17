/**
 * claimKinds.ts — R9 (owner TODO 17 Nov 2026): what a Google sign-up must
 * answer beside its account type, before the account is usable.
 *
 *   lawyer → «محامٍ مترافع أم مستشار قانوني؟» (Art. 18):
 *            lawyer_profiles.practice_kind 'advocate' | 'consultant'.
 *   firm   → «شركة / مكتب محاماة» or «مكتب استشارات مرخص (م١٨)»:
 *            firm_profiles.firm_kind 'law_firm' | 'consulting_office'.
 *
 * The e-mail form (/register/provider) already asks both: its lawyer and
 * consultant cards, and the firm kind on step 2. This reverses the earlier
 * ruling P11 ("Google onboarding has no consultant option").
 *
 * Pure — no imports — so `node --test` loads it. Never defaults: a lawyer
 * claim without a kind is refused (the column's DEFAULT 'advocate' is exactly
 * the silent answer R9 forbids), as `sub_role_missing` is for a provider.
 */

export type PracticeKind = "advocate" | "consultant";
export type FirmKind = "law_firm" | "consulting_office";

export const PRACTICE_KINDS: readonly PracticeKind[] = ["advocate", "consultant"];
export const FIRM_KINDS: readonly FirmKind[] = ["law_firm", "consulting_office"];

export function isPracticeKind(v: unknown): v is PracticeKind {
  return typeof v === "string" && (PRACTICE_KINDS as readonly string[]).includes(v);
}

export function isFirmKind(v: unknown): v is FirmKind {
  return typeof v === "string" && (FIRM_KINDS as readonly string[]).includes(v);
}

export type ClaimKindRefusal =
  /** A lawyer claim that does not say advocate or consultant. */
  | "practice_kind_missing"
  /** A firm claim that does not say law firm or consulting office. */
  | "firm_kind_missing"
  /** A value outside the two allowed, or a kind sent with a type that takes none. */
  | "kind_invalid";

export type ClaimKinds =
  | { ok: true; practiceKind: PracticeKind | null; firmKind: FirmKind | null }
  | { ok: false; reason: ClaimKindRefusal };

/**
 * The kind fields of an onboarding claim, checked against the DB type the
 * claim resolved to. `practiceKind` / `firmKind` are the request body's,
 * unvalidated (undefined / null = not sent).
 */
export function resolveClaimKinds(userType: string, practiceKind: unknown, firmKind: unknown): ClaimKinds {
  const sentPractice = practiceKind !== undefined && practiceKind !== null;
  const sentFirm = firmKind !== undefined && firmKind !== null;
  if (userType === "lawyer") {
    if (sentFirm) return { ok: false, reason: "kind_invalid" };
    if (!sentPractice) return { ok: false, reason: "practice_kind_missing" };
    if (!isPracticeKind(practiceKind)) return { ok: false, reason: "kind_invalid" };
    return { ok: true, practiceKind, firmKind: null };
  }
  if (userType === "firm") {
    if (sentPractice) return { ok: false, reason: "kind_invalid" };
    if (!sentFirm) return { ok: false, reason: "firm_kind_missing" };
    if (!isFirmKind(firmKind)) return { ok: false, reason: "kind_invalid" };
    return { ok: true, practiceKind: null, firmKind };
  }
  if (sentPractice || sentFirm) return { ok: false, reason: "kind_invalid" };
  return { ok: true, practiceKind: null, firmKind: null };
}

/** Arabic, one sentence per refusal (the claim route answers 400 with it). */
export const CLAIM_KIND_REFUSAL_AR: Readonly<Record<ClaimKindRefusal, string>> = Object.freeze({
  practice_kind_missing: "حدّد صفتك المهنية: محامٍ مترافع أم مستشار قانوني.",
  firm_kind_missing: "حدّد نوع المنشأة: شركة / مكتب محاماة أم مكتب استشارات مرخص.",
  kind_invalid: "الصفة المهنية المُرسلة لا تناسب نوع الحساب المختار. اختر من الخيارات المتاحة.",
});

/** The labels the onboarding question and /onboarding/practice-kind show. */
export const PRACTICE_KIND_QUESTION_AR = "محامٍ مترافع أم مستشار قانوني؟";
export const PRACTICE_KIND_OPTIONS_AR: Readonly<Record<PracticeKind, { label: string; desc: string }>> = Object.freeze({
  advocate: { label: "محامٍ مترافع", desc: "مرخّص بالمرافعة أمام المحاكم" },
  consultant: { label: "مستشار قانوني", desc: "الاستشارات والعقود والدراسات — دون ترافع (المادة ١٨)" },
});
export const FIRM_KIND_OPTIONS_AR: Readonly<Record<FirmKind, { label: string; desc: string }>> = Object.freeze({
  law_firm: { label: "شركة / مكتب محاماة", desc: "مكتب أو شركة محاماة" },
  consulting_office: { label: "مكتب استشارات مرخص (م١٨)", desc: "استشارات وعقود دون ترافع (المادة ١٨)" },
});
