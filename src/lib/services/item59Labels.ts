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

/** The assignee's resolved display name, or «—» when the task has none (or it could not be resolved). */
export function assigneeLabelAr(name: string | null | undefined): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed || EMPTY_FIELD_AR;
}
