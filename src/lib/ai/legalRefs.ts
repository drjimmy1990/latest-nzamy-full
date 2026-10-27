/**
 * legalRefs.ts — the article and precedent references in a legal text, so a
 * tool that shortens a memo (منقح ناجز R5, plan §5 L2) can prove it dropped
 * none. The app extracts them from the input BEFORE the webhook, tells the
 * model to keep them, and checks the model's text against the same list; the
 * model's own claim of what it kept is never the proof.
 *
 * A reference is normalised so that «المادة (٧٧)», «المادة 77» and «للمادة
 * ( 77 )» are the same key: digits to ASCII, tatweel and diacritics dropped,
 * spaces inside the number removed.
 *
 *   مادة 77          — المادة / مادة / للمادة / بالمادة / والمادة / المادتين
 *   رقم 4430123      — any «رقم» followed by a number: decisions, judgments,
 *   رقم م/51           principles, royal decrees (م/51), circulars (13/ت/1234)
 *
 * Only references written with digits are found; a spelled-out article
 * («المادة الخامسة والسبعون») is not, and the screens say so.
 *
 * Pure, no imports, so `node --test` runs it.
 */

const DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

function normalise(text: string): string {
  return text
    .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => DIGITS[d] ?? d)
    .replace(/[\u0640\u064B-\u0652\u0670]/g, "") // tatweel, harakat, dagger alif
    // NBSP, zero-width marks, bidi embeddings and isolates, BOM: text pasted from Word or Najiz.
    .replace(/[\u00A0\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, " ");
}

// «المادة» in any of its attached forms, then an optional «رقم» and bracket.
// Only a LETTER before it rules a match out («عمادة»); an Arabic comma or semicolon does not («٧٧،والمادة ٨٠»).
const ARTICLE = /(?:^|[^\u0621-\u064A\u0671-\u06D3])(?:[وفبلك]{0,3})(?:ال)?ماد(?:ة|تين|تان)\s*(?:رقم\s*)?[(\[]?\s*(\d{1,4})(?!\d)/g;
// «رقم» then a number, optionally with letters between slashes: م/51, 13/ت/1234, 4430123.
const NUMBERED = /رقم\s*[(\[]?\s*((?:[\u0600-\u06FF]{1,2}\s*\/\s*)?\d[\d]*(?:\s*[\/\-]\s*(?:[\u0600-\u06FF]{1,2}|\d+))*)/g;

/** The references in `text`, normalised, unique, in order of first appearance. */
export function extractLegalRefs(text: string): string[] {
  if (typeof text !== "string" || !text) return [];
  const t = normalise(text);
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (key: string) => {
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  };
  for (const m of t.matchAll(ARTICLE)) add(`مادة ${m[1]}`);
  for (const m of t.matchAll(NUMBERED)) add(`رقم ${m[1].replace(/\s+/g, "")}`);
  return out;
}

/** The references of `required` that `text` no longer contains. */
export function missingLegalRefs(required: readonly string[], text: string): string[] {
  const present = new Set(extractLegalRefs(text));
  return required.filter((r) => !present.has(r));
}
