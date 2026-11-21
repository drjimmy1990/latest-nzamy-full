/**
 * arabicLegalTtsNormalizer — a legal answer's text as it should be READ ALOUD
 * (owner file 11 item 1, V3 phase A5). A speech engine reads «م/77» as "meem
 * slash seventy-seven" and «١٤٣٦/٠٦/٠٥هـ» as three numbers; a lawyer says
 * «المادة السابعة والسبعين» and «الخامس من جمادى الآخرة عام ...». This module
 * only rewrites the text; the listening feature itself (POST /api/ai/tts and
 * the speechSynthesis fallback) is phase C and not built yet.
 *
 * Rules (each one tested in arabicLegalTtsNormalizer.test.ts):
 *  - «م/77», «م / ٧٧», «المادة (77)», «المادة 77» → «المادة السابعة والسبعين»
 *    (the owner's own wording: the ordinal in its genitive form, «بعد المائة»
 *    past one hundred, as Saudi statutes number their articles).
 *  - «م/46» after «مرسوم» / «المرسوم الملكي» / «أمر ملكي» within the same clause,
 *    or right before «وتاريخ» / «بتاريخ», is a royal decree NUMBER, not an
 *    article: «المرسوم الملكي رقم ميم ستة وأربعين».
 *  - A Hijri date «١٤٣٦/٠٦/٠٥هـ» or «05/06/1436هـ» → «الخامس من جمادى الآخرة
 *    عام ألف وأربعمائة وستة وثلاثين للهجرة»; a bare year «1431ه» → «عام ... للهجرة».
 *  - A principle or decision number «٨٩/١٤٤٢» is NOT an article and NOT a date
 *    (no «م/», no «هـ»): «تسعة وثمانين لعام ألف وأربعمائة واثنين وأربعين».
 *  - Citation markers «[S1]» and Markdown marks are dropped; nothing else of
 *    the wording changes (no word is added or removed beyond these readings).
 *
 * Pure (relative imports only), so `node --test` runs it.
 */
import { stripCitationMarkers } from "./citationMarkers.ts";
import { stripMarkdownMarks } from "../text/stripMarkdownMarks.ts";

// ── numbers ──────────────────────────────────────────────────────────────────

const ONES = ["", "واحد", "اثنين", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS = ["عشرة", "أحد عشر", "اثني عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS = ["", "", "عشرين", "ثلاثين", "أربعين", "خمسين", "ستين", "سبعين", "ثمانين", "تسعين"];
const HUNDREDS = ["", "مائة", "مائتين", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
const THOUSANDS = ["", "ألف", "ألفين", "ثلاثة آلاف", "أربعة آلاف", "خمسة آلاف", "ستة آلاف", "سبعة آلاف", "ثمانية آلاف", "تسعة آلاف"];

/** «٧٧» / «07» → 77 (Arabic-Indic, Persian and ASCII digits). */
export function toAsciiNumber(raw: string): number {
  const ascii = String(raw ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  return /^\d+$/.test(ascii) ? Number(ascii) : Number.NaN;
}

function below100(n: number): string {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const one = n % 10;
  return one ? `${ONES[one]} و${TENS[Math.floor(n / 10)]}` : TENS[Math.floor(n / 10)];
}

/** A cardinal number in words (genitive form), 1–9999; null outside. */
export function cardinalWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 9999) return null;
  const parts: string[] = [];
  const th = Math.floor(n / 1000);
  const h = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (th) parts.push(THOUSANDS[th]);
  if (h) parts.push(HUNDREDS[h]);
  if (rest) parts.push(below100(rest));
  return parts.join(" و");
}

const F_UNITS = ["", "الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة"];
const F_UNITS_COMPOUND = ["", "الحادية", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة"];
const DEF_TENS = ["", "", "العشرين", "الثلاثين", "الأربعين", "الخمسين", "الستين", "السبعين", "الثمانين", "التسعين"];
const DEF_HUNDREDS = ["", "المائة", "المائتين", "الثلاثمائة", "الأربعمائة", "الخمسمائة", "الستمائة", "السبعمائة", "الثمانمائة", "التسعمائة"];

function feminineOrdinalBelow100(n: number): string {
  if (n < 10) return F_UNITS[n];
  if (n === 10) return "العاشرة";
  const one = n % 10;
  const ten = Math.floor(n / 10);
  if (ten === 1) return `${F_UNITS_COMPOUND[one]} عشرة`;
  return one ? `${F_UNITS_COMPOUND[one]} و${DEF_TENS[ten]}` : DEF_TENS[ten];
}

/**
 * An article number as the ordinal a lawyer reads (feminine, «المادة» is
 * feminine): 77 → «السابعة والسبعين», 100 → «المائة», 121 → «الحادية
 * والعشرين بعد المائة», 234 → «الرابعة والثلاثين بعد المائتين». 1–999; null outside.
 */
export function articleOrdinal(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (!h) return feminineOrdinalBelow100(rest);
  if (!rest) return DEF_HUNDREDS[h];
  return `${feminineOrdinalBelow100(rest)} بعد ${DEF_HUNDREDS[h]}`;
}

const M_UNITS = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع"];

/** A day of the month as a masculine ordinal (1–30): «الخامس», «الحادي عشر», «الثلاثين». */
function dayOrdinal(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 30) return null;
  if (n < 10) return M_UNITS[n];
  if (n === 10) return "العاشر";
  const one = n % 10;
  const ten = Math.floor(n / 10);
  const unit = one === 1 ? "الحادي" : M_UNITS[one];
  if (ten === 1) return `${unit} عشر`;
  return one ? `${unit} و${DEF_TENS[ten]}` : DEF_TENS[ten];
}

export const HIJRI_MONTHS = [
  "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
  "رجب", "شعبان", "رمضان", "شوال", "ذي القعدة", "ذي الحجة",
] as const;

// ── patterns ─────────────────────────────────────────────────────────────────

const D = "[0-9٠-٩۰-۹]";
/** «م/77», «م / ٧٧», «(م/٤٦)»: the letter must stand alone (not the end of a word). */
const MEEM_NUMBER = new RegExp(`(^|[^\\p{L}])م\\s*/\\s*(${D}{1,4})(?!${D}|\\s*/)`, "gu");
/** «المادة (77)», «المادة 77», «وللمادة ٧٧» (after «لِـ» the alef drops: «لمادة»). */
const ARTICLE_NUMBER = new RegExp(`(\\p{L}*لمادة)\\s*\\(?\\s*(${D}{1,3})(?:\\s*\\))?(?!${D}|\\s*/)`, "gu");
/** A Hijri date: yyyy/mm/dd or dd/mm/yyyy, then «هـ» / «ه». */
const HIJRI_DATE = new RegExp(`(${D}{1,4})\\s*/\\s*(${D}{1,2})\\s*/\\s*(${D}{1,4})\\s*(?:هـ|ه)(?![\\p{L}])`, "gu");
/** A bare Hijri year «1431ه» / «١٤٣٦هـ». */
const HIJRI_YEAR = new RegExp(`(^|[^${D.slice(1, -1)}/])(${D}{3,4})\\s*(?:هـ|ه)(?![\\p{L}])`, "gu");
/** A principle / decision number «٨٩/١٤٤٢» (no «م/», no «هـ»): number, then a Hijri year. */
const NUMBER_SLASH_YEAR = new RegExp(`(^|[^\\p{L}${D.slice(1, -1)}/])(${D}{1,5})\\s*/\\s*(${D}{4})(?!${D}|\\s*/|\\s*(?:هـ|ه))`, "gu");

/** The words that make «م/N» a royal decree number when they come shortly before it. */
const DECREE_BEFORE = /(?:مرسوم|المرسوم|بالمرسوم|أمر\s+ملكي|الأمر\s+الملكي|بالأمر\s+الملكي)[^.،؛\n]{0,40}$/u;
const DECREE_AFTER = /^\s*\)?\s*(?:و?بتاريخ|وتاريخ)/u;

function hijriDate(a: number, m: number, b: number): string | null {
  const [year, day] = a > 31 ? [a, b] : [b, a];
  const month = HIJRI_MONTHS[m - 1];
  const dayWord = dayOrdinal(day);
  const yearWord = cardinalWords(year);
  if (!month || !dayWord || !yearWord) return null;
  return `${dayWord} من ${month} عام ${yearWord} للهجرة`;
}

/**
 * The text to read aloud: markers and Markdown out, then articles, decrees,
 * Hijri dates and decision numbers as a lawyer says them.
 */
export function normalizeLegalTextForSpeech(input: string): string {
  let text = stripMarkdownMarks(stripCitationMarkers(String(input ?? "")));

  text = text.replace(HIJRI_DATE, (whole, a: string, m: string, b: string) => hijriDate(toAsciiNumber(a), toAsciiNumber(m), toAsciiNumber(b)) ?? whole);

  text = text.replace(MEEM_NUMBER, (whole, lead: string, digits: string, offset: number, all: string) => {
    const n = toAsciiNumber(digits);
    const before = all.slice(Math.max(0, offset - 60), offset + lead.length);
    const after = all.slice(offset + whole.length);
    if (DECREE_BEFORE.test(before) || DECREE_AFTER.test(after)) {
      const words = cardinalWords(n);
      return words ? `${lead}ميم ${words}` : whole;
    }
    const ordinal = articleOrdinal(n);
    return ordinal ? `${lead}المادة ${ordinal}` : whole;
  });

  text = text.replace(ARTICLE_NUMBER, (whole, word: string, digits: string) => {
    const ordinal = articleOrdinal(toAsciiNumber(digits));
    return ordinal ? `${word} ${ordinal}` : whole;
  });

  text = text.replace(NUMBER_SLASH_YEAR, (whole, lead: string, num: string, year: string) => {
    const n = cardinalWords(toAsciiNumber(num));
    const y = cardinalWords(toAsciiNumber(year));
    return n && y ? `${lead}${n} لعام ${y}` : whole;
  });

  text = text.replace(HIJRI_YEAR, (whole, lead: string, year: string, offset: number, all: string) => {
    const y = cardinalWords(toAsciiNumber(year));
    if (!y) return whole;
    // «لعام 1431ه» already says «عام».
    const saysYear = /(?:عام|لعام|سنة|لسنة)\s*$/u.test(all.slice(Math.max(0, offset - 8), offset + lead.length));
    return `${lead}${saysYear ? "" : "عام "}${y} للهجرة`;
  });

  return text.replace(/[ \t]{2,}/g, " ").trim();
}
