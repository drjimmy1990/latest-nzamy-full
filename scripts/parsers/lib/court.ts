/**
 * court.ts — classify a judicial document into a Saudi judicial TRACK, and
 * record the issuing court verbatim.
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUG THIS REPLACES
 *
 * parse-precedents.ts resolved the court at three sites as:
 *
 *     String(meta.court_type || meta.track || "ordinary")
 *
 * Three things are wrong with that, all confirmed by surveying the corpus:
 *
 * 1. THE ADMINISTRATIVE JUDICIARY USES A DIFFERENT FIELD NAME.
 *    Ordinary courts write `court_type:`; ديوان المظالم (61 files) and
 *    المحكمة الإدارية العليا (16) write `court:`. Neither was read, so every
 *    administrative document fell through to the default and was published as
 *    ordinary judiciary. In Saudi law these are separate branches — ديوان
 *    المظالم is the administrative judiciary, not a Sharia court.
 *
 * 2. `track` IS NEVER PRESENT IN ANY SOURCE FILE (measured: 0 of 1,432), yet
 *    seed-library.ts writes `coll.track` — which is why 94 of 95 judicial
 *    collections in production have an empty track column.
 *
 * 3. `court_type` HOLDS COURT NAMES, NOT TRACKS — "المحكمة العليا",
 *    "المحكمة التجارية", "لجنة الاستئناف في منازعات الأوراق المالية". Mixing a
 *    court's NAME with its BRANCH in one column makes filtering by branch
 *    impossible.
 *
 * So: `court` keeps the verbatim name, `track` is a derived normalised branch,
 * and DEFAULTING TO A SPECIFIC BRANCH IS FORBIDDEN — unmappable documents get
 * "unknown", which is honest, rather than "ordinary", which is a claim.
 */

/** Normalised branch of the Saudi judiciary. */
export type JudicialTrack = "ordinary" | "admin" | "semi" | "unknown";

export const JUDICIAL_TRACKS: readonly JudicialTrack[] = ["ordinary", "admin", "semi", "unknown"];

/** Arabic display label per track, for the UI and for reports. */
export const TRACK_LABEL_AR: Record<JudicialTrack, string> = {
  ordinary: "القضاء العادي",
  admin: "القضاء الإداري",
  semi: "اللجان شبه القضائية",
  unknown: "جهة غير محددة",
};

/**
 * Folder → track. The corpus is filed by branch, which makes the folder the
 * single most reliable signal — more reliable than frontmatter, because 219 of
 * 1,432 files carry no court field at all.
 *
 * Matched against the POSIX-normalised path.
 */
const FOLDER_TRACK: Array<{ match: string; track: JudicialTrack }> = [
  // 97 — السوابق القضائية (individual rulings)
  { match: "/2- ديوان المظالم", track: "admin" },
  { match: "/3- المحكمة العليا", track: "ordinary" },
  { match: "/4- المحاكم التجارية", track: "ordinary" },
  { match: "/1- وزارة العدل", track: "ordinary" },
  // 98 — المبادئ القضائية (principle collections)
  { match: "/1- القضاء العادي", track: "ordinary" },
  { match: "/2- القضاء الإداري", track: "admin" },
  { match: "/3- اللجان شبه القضائية", track: "semi" },
];

/**
 * Court name → track. Used for `5- جهات أخرى` (a deliberately mixed folder) and
 * as a cross-check elsewhere. Longest/most specific first.
 *
 * Commercial and labour courts belong to the ORDINARY judiciary (they sit under
 * the Supreme Judicial Council). Only ديوان المظالم and its courts are the
 * administrative branch. Committees are neither — they are quasi-judicial.
 */
const COURT_TRACK: Array<{ match: RegExp; track: JudicialTrack }> = [
  // Administrative judiciary
  { match: /ديوان\s*المظالم/, track: "admin" },
  { match: /المحكمة\s*الإدارية\s*العليا/, track: "admin" },
  { match: /محكمة\s*الاستئناف\s*الإدارية/, track: "admin" },
  { match: /المحاكم?\s*الإدارية/, track: "admin" },
  // Quasi-judicial committees. The alternation covers both لجنة/لجان and the
  // prefixed forms that appear in real names ("الأمانة العامة للجان الفصل …"),
  // which a لجن(ة|ات) pattern misses because the ا falls between ج and ن.
  { match: /لج(ن|ان)/, track: "semi" },
  { match: /هيئة\s*الفصل/, track: "semi" },
  { match: /مدونة\s*القرارات/, track: "semi" },
  // Ordinary judiciary
  { match: /المحكمة\s*العليا/, track: "ordinary" },
  // Sharia courts and their appeal courts are the ordinary judiciary; the MOJ
  // collections name themselves this way rather than after a single court.
  { match: /المحاكم\s*الشرعية/, track: "ordinary" },
  { match: /وزارة\s*العدل/, track: "ordinary" },
  { match: /المحكمة\s*التجارية|المحاكم\s*التجارية/, track: "ordinary" },
  { match: /المحكمة\s*العمالية/, track: "ordinary" },
  { match: /المحكمة\s*الجزائية/, track: "ordinary" },
  { match: /المحكمة\s*العامة/, track: "ordinary" },
  { match: /الأحوال\s*الشخصية/, track: "ordinary" },
  { match: /محكمة\s*الاستئناف/, track: "ordinary" },
];

export interface CourtClassification {
  /** Verbatim issuing court/body as written in the source. Null when absent. */
  court: string | null;
  /** Derived branch. "unknown" when no signal supports a specific branch. */
  track: JudicialTrack;
  /** Which signal decided the track — recorded so results are auditable. */
  basis: "folder" | "court-name" | "none";
}

const norm = (p: string) => p.replace(/\\/g, "/");

/**
 * Classify a judicial document.
 *
 * @param filePath absolute source path (its folder is the primary signal)
 * @param meta     parsed frontmatter
 */
export function classifyCourt(
  filePath: string,
  meta: Record<string, unknown>,
): CourtClassification {
  // Verbatim court name. Read BOTH field names — the split between them is
  // exactly what caused the administrative judiciary to be misfiled.
  const raw =
    (typeof meta.court === "string" && meta.court.trim()) ||
    (typeof meta.court_type === "string" && meta.court_type.trim()) ||
    (typeof meta.issuing_body === "string" && meta.issuing_body.trim()) ||
    "";
  const court = raw || null;

  // 1. Folder — the strongest signal, and the only one present for the 219
  //    files that carry no court field at all.
  const p = norm(filePath);
  for (const { match, track } of FOLDER_TRACK) {
    if (p.includes(match)) return { court, track, basis: "folder" };
  }

  // 2. Court name.
  if (court) {
    for (const { match, track } of COURT_TRACK) {
      if (match.test(court)) return { court, track, basis: "court-name" };
    }
  }

  // 3. No supporting signal. "unknown" is the correct answer — asserting a
  //    specific branch here is what published administrative rulings as
  //    ordinary-judiciary decisions in the first place.
  return { court, track: "unknown", basis: "none" };
}
