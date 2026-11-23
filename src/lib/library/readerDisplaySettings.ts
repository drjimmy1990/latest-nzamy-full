/**
 * readerDisplaySettings.ts — batch l12 (lib-a): the reader's display choices
 * the owner has not fixed yet, as ONE admin setting
 * (platform_settings.library_reader_display), with the defaults the gap
 * report names. No migration: the admin settings route upserts the row; with
 * no row every reader uses the defaults below.
 *
 *   decree_free_pages  (owner Q101, «تُحجب صور المرسوم…» — the AI default in
 *                      force until he changes it): how many leading pages of
 *                      a decree / order a non-subscriber reads in full.
 *                      Default 0 (was 2, owner ١٨٣). The free-item whitelist
 *                      and an admin per-item override still win.
 *   child_names        (owner Q172 (ب), 22 Nov — batch l13): under a /laws
 *                      card, a sub-legislation's name
 *                        "auto"  short («اللائحة التنفيذية») when it only
 *                                repeats the law's title, full when the short
 *                                one would be ambiguous (the default; the
 *                                rule is cardSubLegislationNames in
 *                                src/app/laws/catalogueCardLabels.ts);
 *                        "full"  the admin forces every name in full;
 *                        "short" the admin forces the short form everywhere.
 *
 * Batch l12 stored the open question as `child_name_form` ("full" = the
 * unanswered default (أ), or "short"). It is not read any more: a row saved
 * before the owner's answer would otherwise keep every reader on (أ). The
 * admin write still accepts the old key (an old open tab), and the next save
 * from the admin page drops it.
 *
 * Pure (no imports): `node --test` runs readerDisplaySettings.test.ts.
 */

export const LIBRARY_READER_DISPLAY_KEY = "library_reader_display";

export type ChildNames = "auto" | "full" | "short";

export const CHILD_NAMES_VALUES: readonly ChildNames[] = Object.freeze(["auto", "full", "short"]);

export interface LibraryReaderDisplay {
  decree_free_pages: number;
  child_names: ChildNames;
}

export const DECREE_FREE_PAGES_MAX = 20;

export const LIBRARY_READER_DISPLAY_DEFAULTS: Readonly<LibraryReaderDisplay> = Object.freeze({
  decree_free_pages: 0,
  child_names: "auto",
});

function plainObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function isPages(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= DECREE_FREE_PAGES_MAX;
}

/** "auto" | "full" | "short", or null for anything else. */
export function childNamesValue(v: unknown): ChildNames | null {
  return v === "auto" || v === "full" || v === "short" ? v : null;
}

/** The stored value → the settings; each malformed or missing field takes its default. */
export function parseLibraryReaderDisplay(value: unknown): LibraryReaderDisplay {
  const obj = plainObject(value);
  return {
    decree_free_pages: isPages(obj?.decree_free_pages) ? obj!.decree_free_pages as number : LIBRARY_READER_DISPLAY_DEFAULTS.decree_free_pages,
    child_names: childNamesValue(obj?.child_names) ?? LIBRARY_READER_DISPLAY_DEFAULTS.child_names,
  };
}

/** The admin write's check (admin settings route): null when acceptable, else an Arabic message. */
export function libraryReaderDisplayIssue(value: unknown): string | null {
  const obj = plainObject(value);
  if (!obj) return 'قيمة library_reader_display يجب أن تكون كائناً بالشكل {"decree_free_pages":0,"child_names":"auto"}';
  for (const k of Object.keys(obj)) {
    // child_name_form: batch l12's key, accepted from an old open tab and ignored.
    if (k !== "decree_free_pages" && k !== "child_names" && k !== "child_name_form") return `حقل غير معروف: ${k}`;
  }
  if ("decree_free_pages" in obj && !isPages(obj.decree_free_pages)) {
    return `عدد صفحات المراسيم المجانية عدد صحيح بين 0 و${DECREE_FREE_PAGES_MAX}`;
  }
  if ("child_names" in obj && childNamesValue(obj.child_names) === null) {
    return 'صيغة اسم التشريع الفرعي: "auto" (تلقائياً) أو "full" (كاملاً دائماً) أو "short" (مختصراً دائماً)';
  }
  if ("child_name_form" in obj && obj.child_name_form !== "full" && obj.child_name_form !== "short") {
    return 'صيغة اسم التشريع الفرعي: "auto" (تلقائياً) أو "full" (كاملاً دائماً) أو "short" (مختصراً دائماً)';
  }
  return null;
}
