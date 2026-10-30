/**
 * courtTypes — the court classification AddCaseModal offers (CODE-F30).
 *
 * The form used to offer three courts and start on «المحكمة التجارية», so a
 * lawyer who did not touch the field filed every case as commercial. The list
 * below is the full set the cases board already understands: the strings are
 * byte-for-byte the ids of COURTS_LIST in src/constants/lawyerCasesData.ts,
 * because `courtToDegree` and the board's court filter match on the exact
 * string — a near-spelling would land the case under «ابتدائي» and outside
 * every court filter (courtTypes.test.ts reads that file to keep them equal).
 *
 * No default: an unchosen court is saved as no court at all, which the board
 * already shows as «بانتظار تحديد الجهة». «أخرى» takes a typed name.
 */

export const COURT_CHOICES = [
  "المحكمة التجارية",
  "المحكمة العامة",
  "المحكمة العمالية",
  "المحكمة الجزائية",
  "محكمة الأحوال الشخصية",
  "المحكمة الإدارية",
  "ديوان المظالم (الإدارية)",
  "محكمة الاستئناف",
  "محكمة الاستئناف التجارية",
  "محكمة الاستئناف الإدارية",
  "المحكمة العليا",
  "المحكمة العقارية",
  "محكمة التنفيذ",
  "محكمة الأسرة",
] as const;

/** The «أخرى» choice — the court is then whatever the lawyer types. */
export const COURT_OTHER = "__other__";
export const COURT_OTHER_LABEL = "أخرى";

export type CourtResolution =
  | { ok: true; court: string | null }
  | { ok: false; error: string };

/** What `metadata.court` should hold for this choice, or why it cannot be saved. */
export function resolveCourt(choice: string, otherText: string): CourtResolution {
  if (!choice) return { ok: true, court: null };
  if (choice === COURT_OTHER) {
    const typed = otherText.trim();
    return typed
      ? { ok: true, court: typed }
      : { ok: false, error: "اكتب اسم المحكمة أو الجهة عند اختيار «أخرى»." };
  }
  if ((COURT_CHOICES as readonly string[]).includes(choice)) return { ok: true, court: choice };
  return { ok: false, error: "اختر المحكمة من القائمة." };
}
