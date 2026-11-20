/**
 * decreeRef.ts — a decree named in a law's text («المرسوم الملكي رقم (م/٥١)
 * وتاريخ ١٤٢٦/٨/٢٣هـ», «قرار مجلس الوزراء رقم (٢٢٢) وتاريخ …») read into a
 * number and a date, and matched against `library.decrees_circulars` rows
 * (N02-13, batch l11: the reader's decree chips resolve to a library record).
 *
 * A decree number restarts every year («م/6» exists in many years), so a
 * reference is resolved only when the text gives its date too, and only when
 * exactly ONE row has that number and that date. Anything else is no answer —
 * a wrong decree is worse than none.
 *
 * Pure, no imports: `node --test` runs decreeRef.test.ts.
 */

export interface DecreeDate {
  y: number;
  m: number;
  d: number;
}

export interface DecreeRef {
  /** The letter before the slash («م», «أ»), '' when the number has none (a cabinet decision). */
  letter: string;
  /** The number's digits, ASCII («51»). */
  digits: string;
  /** The Hijri date the text gives, or null. */
  date: DecreeDate | null;
}

function ascii(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** «أ» / «إ» / «ا» are one letter here (أمر ملكي رقم أ/90 is written all three ways). */
function foldLetter(l: string): string {
  return l.replace(/[أإآا]/g, "أ");
}

/** A Hijri date written y/m/d or d/m/y (either separator / . -), or null. */
export function parseHijriDate(raw: string | null | undefined): DecreeDate | null {
  if (!raw) return null;
  const m = /(\d{1,4})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{1,4})/.exec(ascii(String(raw)));
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const [y, d] = a >= 1300 && a <= 1600 ? [a, c] : c >= 1300 && c <= 1600 ? [c, a] : [0, 0];
  if (!y || b < 1 || b > 12 || d < 1 || d > 30) return null;
  return { y, m: b, d };
}

/** The number and date of a decree reference, or null when it carries no number. */
export function parseDecreeRef(words: string | null | undefined): DecreeRef | null {
  if (!words) return null;
  const t = ascii(String(words));
  const num = /رقم\s*\(?\s*(?:([أإآامق])\s*\/\s*)?(\d{1,6})(?!\d)(?!\s*\/\s*\d{1,2}\s*\/)/u.exec(t);
  if (!num) return null;
  const after = t.slice((num.index ?? 0) + num[0].length);
  const dated = /^[\s)\]،,]*(?:و|ب)?(?:ال)?تاريخ\s*:?\s*([\d/.\-\s]{6,14})/u.exec(after);
  return {
    letter: num[1] ? foldLetter(num[1]) : "",
    digits: String(Number(num[2])),
    date: dated ? parseHijriDate(dated[1]) : null,
  };
}

/** A `decrees_circulars.ref` value as the same key: «م/6», «(م / ٦)» → «م/6»; «222» → «/222». */
export function decreeRefKey(ref: string | null | undefined): string {
  if (!ref) return "";
  const m = /(?:([أإآامق])\s*[/-]\s*)?(\d{1,6})/u.exec(ascii(String(ref)));
  return m ? `${m[1] ? foldLetter(m[1]) : ""}/${Number(m[2])}` : "";
}

/** The spellings a stored ref may use, for one exact `in (…)` read. */
export function decreeRefVariants(ref: DecreeRef): string[] {
  const n = ref.digits;
  const indic = n.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
  const letters = ref.letter === "أ" ? ["أ", "ا", "إ"] : ref.letter ? [ref.letter] : [""];
  const out = new Set<string>();
  for (const l of letters) {
    for (const num of [n, indic]) {
      if (l) {
        for (const v of [`${l}/${num}`, `${l} / ${num}`, `(${l}/${num})`, `${l}${num}`, `${l}-${num}`]) out.add(v);
      } else {
        for (const v of [num, `(${num})`]) out.add(v);
      }
    }
  }
  return [...out];
}

export interface DecreeRow {
  id: unknown;
  title: unknown;
  ref: unknown;
  date: unknown;
}

/** The one row this reference names, or null (no date in the text, none, or more than one). */
export function pickDecree<T extends DecreeRow>(rows: readonly T[], ref: DecreeRef): T | null {
  if (!ref.date) return null;
  const key = `${ref.letter}/${ref.digits}`;
  const want = ref.date;
  const hits = rows.filter((r) => {
    if (decreeRefKey(typeof r.ref === "string" ? r.ref : "") !== key) return false;
    const d = parseHijriDate(typeof r.date === "string" ? r.date : "");
    return !!d && d.y === want.y && d.m === want.m && d.d === want.d;
  });
  return hits.length === 1 ? hits[0] : null;
}
