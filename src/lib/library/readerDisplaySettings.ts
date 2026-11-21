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
 *   child_name_form    (library question 5, ⏳): under a /laws card, a
 *                      sub-legislation's name in FULL («اللائحة التنفيذية
 *                      لنظام المرور», the default) or SHORT, without the
 *                      repeated base title («اللائحة التنفيذية»).
 *
 * Pure (no imports): `node --test` runs readerDisplaySettings.test.ts.
 */

export const LIBRARY_READER_DISPLAY_KEY = "library_reader_display";

export type ChildNameForm = "full" | "short";

export interface LibraryReaderDisplay {
  decree_free_pages: number;
  child_name_form: ChildNameForm;
}

export const DECREE_FREE_PAGES_MAX = 20;

export const LIBRARY_READER_DISPLAY_DEFAULTS: Readonly<LibraryReaderDisplay> = Object.freeze({
  decree_free_pages: 0,
  child_name_form: "full",
});

function plainObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function isPages(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= DECREE_FREE_PAGES_MAX;
}

/** The stored value → the settings; each malformed or missing field takes its default. */
export function parseLibraryReaderDisplay(value: unknown): LibraryReaderDisplay {
  const obj = plainObject(value);
  return {
    decree_free_pages: isPages(obj?.decree_free_pages) ? obj!.decree_free_pages as number : LIBRARY_READER_DISPLAY_DEFAULTS.decree_free_pages,
    child_name_form: obj?.child_name_form === "short" || obj?.child_name_form === "full" ? obj.child_name_form : LIBRARY_READER_DISPLAY_DEFAULTS.child_name_form,
  };
}

/** The admin write's check (admin settings route): null when acceptable, else an Arabic message. */
export function libraryReaderDisplayIssue(value: unknown): string | null {
  const obj = plainObject(value);
  if (!obj) return 'قيمة library_reader_display يجب أن تكون كائناً بالشكل {"decree_free_pages":0,"child_name_form":"full"}';
  for (const k of Object.keys(obj)) {
    if (k !== "decree_free_pages" && k !== "child_name_form") return `حقل غير معروف: ${k}`;
  }
  if ("decree_free_pages" in obj && !isPages(obj.decree_free_pages)) {
    return `عدد صفحات المراسيم المجانية عدد صحيح بين 0 و${DECREE_FREE_PAGES_MAX}`;
  }
  if ("child_name_form" in obj && obj.child_name_form !== "full" && obj.child_name_form !== "short") {
    return 'صيغة اسم التشريع الفرعي: "full" (الاسم كاملاً) أو "short" (مختصراً)';
  }
  return null;
}
