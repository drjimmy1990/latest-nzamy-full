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

/**
 * The classification a saved court belongs to — one of COURT_CHOICES — or
 * null when there is none (owner q351, review I1). The ONE function every
 * screen uses when a court decides something: the case card's degree badge,
 * the degree kanban and filter (through `courtToDegree`), and the court filter.
 *
 *   1. a name that IS one of the 14 classifications → itself (unchanged);
 *   2. otherwise the class saved beside the name (`metadata.courtClass`),
 *      written when the court was picked from the MoJ directory
 *      (courtSearch.ts `directoryCourtClass`) — a jsonb key, no new column;
 *   3. otherwise null: a typed «أخرى» name, «بانتظار تحديد الجهة», nothing —
 *      exactly today's reading (degree «ابتدائي», outside every court filter).
 */
export function courtClassOf(name: string | null | undefined, savedClass?: unknown): string | null {
  const choices = COURT_CHOICES as readonly string[];
  const n = name ?? ""; // exact, as the board always matched
  if (choices.includes(n)) return n;
  if (typeof savedClass === "string" && choices.includes(savedClass)) return savedClass;
  return null;
}

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
