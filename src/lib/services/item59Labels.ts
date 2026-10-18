/**
 * item59Labels.ts — the three fields the owner approved for the lawyer screens
 * (4 Oct list, item 59; his answer of 16 Oct): «مدة الجلسة» on a hearing,
 * «المحامي المُكلَّف» on a task, and «مصدر المستند» on a case document.
 *
 * Each one reads a column that already exists live:
 *   - `public.hearings.duration_minutes`  (integer, nullable)
 *   - `public.tasks.assignee_user_id`     (uuid, nullable; the route resolves
 *                                          it to `profiles.display_name`)
 *   - `public.attachments.source`         (text, CHECK upload / generated /
 *                                          imported / contract_version)
 *
 * Also the «مدة الجلسة» select's options and the server's check on what it
 * may save (`validateHearingDuration`).
 *
 * Pure: no `@/` imports, so `item59Labels.test.ts` runs under plain node.
 * Every empty value renders «—», never a zero, «NaN» or a raw enum word.
 */

import { countPhraseAr, type ArabicCountForms } from "./arabicCount.ts";

/** Field headings, in the owner's words. */
export const HEARING_DURATION_LABEL_AR = "مدة الجلسة";
export const TASK_ASSIGNEE_LABEL_AR = "المحامي المُكلَّف";
export const DOCUMENT_SOURCE_LABEL_AR = "مصدر المستند";

/** What a field with no value shows. */
export const EMPTY_FIELD_AR = "—";

// «ساعة» and «دقيقة» with no «واحدة»: 60 reads «ساعة», and 61 reads
// «ساعة ودقيقة» rather than «ساعة ودقيقة واحدة».
const HOUR_FORMS: ArabicCountForms = {
  zero: null, one: "ساعة", two: "ساعتان", few: "ساعات", many: "ساعة",
};
const MINUTE_FORMS: ArabicCountForms = {
  zero: null, one: "دقيقة", two: "دقيقتان", few: "دقائق", many: "دقيقة",
};

/**
 * A length in minutes, in Arabic: 30 → «٣٠ دقيقة», 60 → «ساعة»,
 * 90 → «ساعة و٣٠ دقيقة», 120 → «ساعتان», 180 → «٣ ساعات».
 *
 * null, undefined, 0, a negative number, NaN or Infinity → «—». A fractional
 * count is rounded to the nearest minute first.
 */
export function formatDurationAr(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return EMPTY_FIELD_AR;
  const total = Math.round(minutes);
  if (total <= 0) return EMPTY_FIELD_AR;

  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const hoursPart = hours > 0 ? countPhraseAr(hours, HOUR_FORMS) : null;
  const minutesPart = rest > 0 ? countPhraseAr(rest, MINUTE_FORMS) : null;

  if (hoursPart && minutesPart) return `${hoursPart} و${minutesPart}`;
  return hoursPart ?? minutesPart ?? EMPTY_FIELD_AR;
}

/** The lengths the add-hearing form offers, in minutes; each is labelled by `formatDurationAr`. */
export const HEARING_DURATION_OPTIONS = [30, 60, 90, 120, 180] as const;

/** The bounds the hearings POST accepts: five minutes to one day. */
export const HEARING_DURATION_MIN = 5;
export const HEARING_DURATION_MAX = 1440;

export const HEARING_DURATION_INVALID_AR = "مدة الجلسة غير صالحة";

/**
 * The server's check on `durationMinutes`: null/undefined (not set) → null;
 * a whole number from 5 to 1440 → itself; anything else (a string, a fraction,
 * NaN, out of range) → an error. Not limited to the form's five options, so a
 * later form can offer other lengths without a route change.
 */
export function validateHearingDuration(
  input: unknown,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (
    typeof input !== "number" ||
    !Number.isInteger(input) ||
    input < HEARING_DURATION_MIN ||
    input > HEARING_DURATION_MAX
  ) {
    return { ok: false, error: HEARING_DURATION_INVALID_AR };
  }
  return { ok: true, value: input };
}

/** `attachments.source` → its Arabic label. The keys are the column's CHECK list. */
export const DOCUMENT_SOURCE_LABELS_AR = {
  upload: "رفع",
  generated: "مُنشأ",
  imported: "مستورد",
  contract_version: "نسخة عقد",
} as const;

/** The label for one `attachments.source` value; «—» for anything outside the four. */
export function documentSourceLabelAr(source: unknown): string {
  if (typeof source !== "string") return EMPTY_FIELD_AR;
  // An own-property check, so "constructor" or "__proto__" cannot reach an
  // inherited Object member.
  if (!Object.prototype.hasOwnProperty.call(DOCUMENT_SOURCE_LABELS_AR, source)) return EMPTY_FIELD_AR;
  return DOCUMENT_SOURCE_LABELS_AR[source as keyof typeof DOCUMENT_SOURCE_LABELS_AR];
}

/**
 * One option's text in the «المحامي المُكلَّف» picker: «الاسم (أنا)» for the
 * caller («أنا» with no name), the member's name otherwise, and «عضو في المكتب»
 * for a member with no display name, never their id.
 */
export function assigneeOptionLabelAr(option: { name: string | null | undefined; isSelf: boolean }): string {
  const name = typeof option.name === "string" ? option.name.trim() : "";
  if (option.isSelf) return name ? `${name} (أنا)` : "أنا";
  return name || "عضو في المكتب";
}

/** The assignee's resolved display name, or «—» when the task has none (or it could not be resolved). */
export function assigneeLabelAr(name: string | null | undefined): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed || EMPTY_FIELD_AR;
}
