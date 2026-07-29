/**
 * slug.ts — single source of truth for Arabic → ASCII slug generation.
 * ─────────────────────────────────────────────────────────────────────────────
 * This table and function were duplicated verbatim in all four parsers. They are
 * consolidated here because `library.laws` is keyed BY SLUG: if two parsers ever
 * drifted, the same document could seed under two different primary keys.
 *
 * ⚠️  CHANGING THIS FUNCTION RE-KEYS ROWS.
 * `laws` upserts use `on_conflict=slug` with merge-duplicates, so any change to
 * the output changes which row a document lands in — silently orphaning the old
 * one. Treat every behavioural change as requiring a full clean reseed plus a
 * redirect plan for published URLs.
 *
 * THE ONLY BEHAVIOURAL CHANGE vs. the previous copies is digit handling (below).
 * Everything else is preserved character-for-character, deliberately.
 */

// ── Transliteration table ────────────────────────────────────────────────────
// Unmapped characters that are not [a-zA-Z0-9] or whitespace are DROPPED.
const AR_TRANSLIT: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "e", "آ": "aa", "ب": "b", "ت": "t", "ث": "th",
  "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
  "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "dh", "ع": "a",
  "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "h", "ئ": "e", "ؤ": "w",
  "ء": "", "ﻻ": "la", "ﻷ": "la",

  // ── Arabic-Indic digits (U+0660–U+0669) ────────────────────────────────────
  // THE FIX. These are not [a-zA-Z0-9], so previously they hit the final
  // "drop the char" branch and vanished. Royal decrees are distinguished almost
  // entirely by their number and date, so dropping the digits collapsed many
  // distinct instruments onto ONE slug — and because slug is the laws PK with a
  // merge-duplicates upsert, every collision but the last was silently discarded.
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",

  // Extended Arabic-Indic digits (U+06F0–U+06F9), used in Persian/Urdu-influenced
  // sources. Same failure mode; mapped for the same reason.
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

/**
 * Convert Arabic text to an ASCII slug.
 *
 * NOTE on `\bال`: `\b` is a word boundary defined over [A-Za-z0-9_], so in pure
 * Arabic text it never matches and this replacement is effectively dead — "ال"
 * simply transliterates to "al" without the hyphen. That is a known quirk.
 * It is preserved ON PURPOSE: it does fire after an ASCII/underscore boundary
 * (e.g. "_الطيران" → "al-tyran"), so removing it would change real existing
 * slugs and re-key their rows for zero functional gain.
 */
export function slugifyArabic(text: string): string {
  // Strip diacritics (tashkeel)
  let slug = text.replace(/[\u064B-\u065F\u0670]/g, "");
  // Definite article → "al-" (see note above: only fires after an ASCII boundary)
  slug = slug.replace(/\b\u0627\u0644/g, "al-");
  // Transliterate
  let result = "";
  for (const ch of slug) {
    if (AR_TRANSLIT[ch] !== undefined) {
      result += AR_TRANSLIT[ch];
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      result += ch.toLowerCase();
    } else if (/[\s\-_]/.test(ch)) {
      result += "-";
    }
    // else: drop the char
  }
  // Clean up
  return result
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 120);
}

/**
 * Detect slug collisions across a set of source documents.
 *
 * This is the single most important safety net in the pipeline: `laws.slug` is
 * the primary key, so two documents sharing a slug means one is silently
 * discarded by the upsert. Callers must FAIL the run on a non-empty result —
 * never auto-disambiguate with a numeric suffix, because a machine-invented
 * slug becomes a fabricated citation URL for a real legal document.
 */
export interface SlugCollision {
  slug: string;
  sources: string[];
}

export function findSlugCollisions(
  entries: Array<{ slug: string; source: string }>,
): SlugCollision[] {
  const bySlug = new Map<string, string[]>();
  for (const { slug, source } of entries) {
    const list = bySlug.get(slug);
    if (list) list.push(source);
    else bySlug.set(slug, [source]);
  }
  const collisions: SlugCollision[] = [];
  for (const [slug, sources] of bySlug) {
    // Identical source paths are the same document seen twice, not a collision.
    const distinct = Array.from(new Set(sources));
    if (distinct.length > 1) collisions.push({ slug, sources: distinct });
  }
  return collisions;
}
