/**
 * _locator.ts — render a fiqh block's volume/page locator honestly.
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Until the Phase 3 feqh work, parse-feqh.ts recognised exactly one page-header
 * shape — a 4-part Shamela header that occurs on 10 lines in 1 book — and for
 * every other book it discarded the real locator and synthesised a sequential
 * counter with the volume HARDCODED TO 1. So every citation rendered as
 * "ج 1، ص <counter>" regardless of what the source said.
 *
 * The parser now reads the real locators (88,257 across all 144 books, up from
 * 16,887 across 26), and the schema was relaxed so "the source states no
 * volume" can be NULL instead of a fabricated 1. Two consequences the UI has to
 * handle, both measured:
 *
 *   • volume_number / page_number may be NULL. Interpolating them directly
 *     prints the literal string "null" — «ج null، ص null».
 *   • the source's token is not always a number: 887 volume tokens and 18 page
 *     tokens are values like "مقدمة" (introduction) or "7-1". Those survive
 *     verbatim in volume_label / page_label and must be shown as written.
 *
 * RULE: show what the source says; when it says nothing, say nothing — never
 * substitute a number (rule ق-2).
 */

export interface BlockLocator {
  vol?: number | null;
  page?: number | null;
  /** Verbatim volume token from the source, e.g. "10", "مقدمة", "7-1". */
  volLabel?: string | null;
  /** Verbatim page token from the source. */
  pageLabel?: string | null;
}

/** The volume as the source states it, or null when it states none. */
export function volumeToken(b: BlockLocator | null | undefined): string | null {
  if (!b) return null;
  const label = b.volLabel?.trim();
  if (label) return label;
  return b.vol === null || b.vol === undefined ? null : String(b.vol);
}

/** The page as the source states it, or null when it states none. */
export function pageToken(b: BlockLocator | null | undefined): string | null {
  if (!b) return null;
  const label = b.pageLabel?.trim();
  if (label) return label;
  return b.page === null || b.page === undefined ? null : String(b.page);
}

/**
 * A locator string with only the parts the source actually carries.
 *
 * @param style "short" → «ج 3، ص 47» / «V 3, P 47»
 *              "long"  → «المجلد 3 — الصفحة 47» / «Volume 3 — Page 47»
 * @returns "" when the source states neither, so the caller can drop the
 *          segment entirely rather than print an empty label.
 */
export function formatLocator(
  b: BlockLocator | null | undefined,
  isRTL: boolean,
  style: "short" | "long" = "short",
): string {
  const v = volumeToken(b);
  const p = pageToken(b);
  if (!v && !p) return "";

  const words = isRTL
    ? style === "short" ? { vol: "ج", page: "ص", sep: "، " } : { vol: "المجلد", page: "الصفحة", sep: " — " }
    : style === "short" ? { vol: "V", page: "P", sep: ", " } : { vol: "Volume", page: "Page", sep: " — " };

  const parts: string[] = [];
  if (v) parts.push(`${words.vol} ${v}`);
  if (p) parts.push(`${words.page} ${p}`);
  return parts.join(words.sep);
}

/**
 * Does this block sit at the requested locator?
 *
 * A bare page query ("47") means "page 47 in any volume". It used to default
 * targetVol to 1, which was harmless only while every block claimed volume 1;
 * now that 116,828 blocks carry a real volume, that default would silently hide
 * every match outside volume 1.
 */
export function matchesLocator(
  b: BlockLocator,
  targetVol: string | null,
  targetPage: string | null,
): boolean {
  if (targetPage !== null && pageToken(b) !== targetPage) return false;
  if (targetVol !== null && volumeToken(b) !== targetVol) return false;
  return targetVol !== null || targetPage !== null;
}
