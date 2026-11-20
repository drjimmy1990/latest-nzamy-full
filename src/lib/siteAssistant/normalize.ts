/**
 * normalize.ts — Arabic text folding for «مساعد نظامي» (O20 / A21, batch
 * l11-misc). The assistant matches words, never meaning: every rule it applies
 * is a list of word stems or phrases in answer.ts, matched on folded text.
 *
 * Pure, no imports.
 */

const DIACRITICS = /[ً-ٰٟۖ-ۭـ]/g; // tashkeel, superscript alef, Quranic marks, tatweel
const ARABIC_INDIC = /[٠-٩]/g;
const EXTENDED_INDIC = /[۰-۹]/g;

/** Folds spelling variants: hamzas → bare letters, ى → ي, ة → ه, digits → Latin; drops marks and punctuation. */
export function foldArabic(input: string): string {
  return input
    .normalize("NFC")
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXTENDED_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Leading clitics stripped before a stem is compared: و ف ب ل ك and the article ال (in that order, once each). */
function stripClitics(token: string): string[] {
  const forms = new Set<string>([token]);
  let t = token;
  if (t.length > 3 && /^[وف]/.test(t)) {
    t = t.slice(1);
    forms.add(t);
  }
  if (t.length > 3 && /^[بلك]/.test(t)) {
    t = t.slice(1);
    forms.add(t);
  }
  if (t.length > 4 && t.startsWith("ال")) forms.add(t.slice(2));
  if (t.length > 3 && t.startsWith("لل")) forms.add(t.slice(2));
  return [...forms];
}

/** The folded message as words, each with its clitic-stripped forms. */
export interface FoldedMessage {
  readonly text: string;
  readonly words: readonly (readonly string[])[];
}

export function foldMessage(input: string): FoldedMessage {
  const text = foldArabic(input);
  const words = text ? text.split(" ").map(stripClitics) : [];
  return { text, words };
}

/** True when some word (or its clitic-stripped form) starts with one of the folded stems. */
export function hasStem(msg: FoldedMessage, stems: readonly string[]): boolean {
  for (const forms of msg.words) {
    for (const f of forms) {
      for (const s of stems) if (f.startsWith(s)) return true;
    }
  }
  return false;
}

/** True when the folded text contains one of the folded phrases (word-bounded). */
export function hasPhrase(msg: FoldedMessage, phrases: readonly string[]): boolean {
  const padded = ` ${msg.text} `;
  return phrases.some((p) => padded.includes(` ${p} `) || padded.includes(` ${p}`));
}
