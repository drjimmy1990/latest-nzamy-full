/**
 * Library front-matter keys that are internal editorial / review notes.
 *
 * The library's schema contract (decision 1.6, 2026-08-29) makes these
 * internal only: never shown, never served, for every content type. The
 * seeders used to copy the whole front matter into the `metadata` jsonb of
 * judicial_collections and principles, so on 2026-10-04 any visitor could
 * read them through the public REST key (editorial_notes, review_reason,
 * review_cleared_*, review_note, needs_human_review …).
 *
 * The match is by key shape, so new keys of the same family (the library
 * added `editorial_notes_dates` on 2026-10-03) are dropped without a code
 * change. The parsers still read `needs_human_review` / `review_reason`
 * from the front matter for their own diagnostics — this list only governs
 * what may be written into a public row.
 */

const EXACT_KEYS = new Set(["needs_human_review", "needsHumanReview"]);

const KEY_PATTERNS: readonly RegExp[] = [
  /^editorial_notes/,
  /^editorialNotes/,
  /^review_/,
  /^review[A-Z]/,
  /^type_review_reason$/,
  /^typeReviewReason$/,
];

export function isInternalContentKey(key: string): boolean {
  const k = key.trim();
  return EXACT_KEYS.has(k) || KEY_PATTERNS.some((re) => re.test(k));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep copy of `value` without internal keys, at any depth (nested objects
 * and arrays included). Non-object values come back unchanged.
 */
export function stripInternalContentKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripInternalContentKeys(item)) as unknown as T;
  }
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (isInternalContentKey(key)) continue;
    out[key] = stripInternalContentKeys(inner);
  }
  return out as T;
}

/** Internal keys found anywhere inside `value`, as dotted paths (for checks). */
export function findInternalContentKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findInternalContentKeys(item, `${path}[${i}]`));
  }
  if (!isPlainObject(value)) return [];
  const found: string[] = [];
  for (const [key, inner] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (isInternalContentKey(key)) found.push(here);
    else found.push(...findInternalContentKeys(inner, here));
  }
  return found;
}
