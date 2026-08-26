/**
 * تفقيط — an amount in Saudi riyals written out in Arabic words.
 *
 * Owner item ١٥: a receipt («سند قبض») is not valid to hand a client without
 * the amount in words. It is the line that makes a figure hard to alter after
 * the fact, which is the entire reason the convention exists.
 *
 * A pure function with tests, deliberately separate from anything that renders
 * or stores a receipt. This is the part that is easy to get subtly wrong —
 * «مائتان» vs «مئتان», «ألفان» vs «ألفين», the eleven-and-above forms — and
 * the part where being wrong is worst: a receipt whose words disagree with its
 * figure is worse than one with no words at all.
 *
 * Conventions follow ordinary Saudi invoice practice: nominative forms
 * throughout (no attempt at full إعراب by position, which no invoice does),
 * «فقط … لا غير» as the frame, and هللة for the fractional part.
 */

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];

const TEENS = [
  "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر",
  "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر",
];

const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];

const HUNDREDS = [
  "", "مائة", "مائتان", "ثلاثمائة", "أربعمائة",
  "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة",
];

/** singular · dual · plural(3–10) · counted-singular(11+) */
const SCALES: [string, string, string, string][] = [
  ["", "", "", ""],
  ["ألف", "ألفان", "آلاف", "ألفاً"],
  ["مليون", "مليونان", "ملايين", "مليوناً"],
  ["مليار", "ملياران", "مليارات", "ملياراً"],
];

/** The largest amount this can express: one below a trillion. */
export const TAFQIT_MAX = 1_000_000_000_000 - 1;

/** 0–999 in words. Returns "" for 0 — callers decide whether a zero group
 *  should be spoken at all. */
function under1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);

  if (rest >= 10 && rest < 20) {
    parts.push(TEENS[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    // Arabic says the unit BEFORE the ten («واحد وعشرون»), the opposite of
    // English — the single most common way a hand-written تفقيط goes wrong.
    if (o > 0) parts.push(ONES[o]);
    if (t > 1) parts.push(TENS[t]);
  }
  return parts.join(" و");
}

/** Any non-negative integer up to TAFQIT_MAX, in words. */
export function integerToArabicWords(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "";
  const n = Math.floor(value);
  if (n === 0) return "صفر";

  const groups: number[] = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }

  const parts: string[] = [];
  // Highest scale first, so «مليون» comes before «ألف».
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    if (i === 0) {
      parts.push(under1000(g));
      continue;
    }
    const [one, two, few, many] = SCALES[i];
    if (g === 1) parts.push(one);
    else if (g === 2) parts.push(two);
    else if (g <= 10) parts.push(`${under1000(g)} ${few}`);
    // 11 and above take the counted singular: «أحد عشر ألفاً», never
    // «أحد عشر آلاف».
    else parts.push(`${under1000(g)} ${many}`);
  }
  return parts.join(" و");
}

export interface TafqitOptions {
  /** Default «ريال»/«ريالان»/«ريالات» — override for a different currency. */
  currency?: { one: string; two: string; many: string };
  /** Default «هللة». */
  fraction?: { one: string; two: string; many: string };
}

const SAR = { one: "ريال سعودي", two: "ريالان سعوديان", many: "ريالاً سعودياً" };
const HALALA = { one: "هللة", two: "هللتان", many: "هللة" };

function unitFor(n: number, u: { one: string; two: string; many: string }): string {
  if (n === 1) return u.one;
  if (n === 2) return u.two;
  return u.many;
}

function amountPhrase(n: number, u: { one: string; two: string; many: string }): string {
  // «ريال واحد» and «ريالان» carry the count inside the unit word itself —
  // «واحد ريال سعودي» is not how anyone writes a receipt.
  if (n === 1 || n === 2) return unitFor(n, u);
  return `${integerToArabicWords(n)} ${unitFor(n, u)}`;
}

/**
 * The full line for a receipt: «فقط ألف ومائتان وخمسون ريالاً سعودياً لا غير».
 *
 * Returns "" — never a partial or a guess — for anything it cannot express
 * (negative, NaN, above TAFQIT_MAX). A receipt with a blank words line is a
 * visible problem; a receipt with a WRONG words line is an invisible one.
 */
export function tafqit(amount: number, options: TafqitOptions = {}): string {
  if (!Number.isFinite(amount) || amount < 0 || amount > TAFQIT_MAX) return "";

  const currency = options.currency ?? SAR;
  const fraction = options.fraction ?? HALALA;

  // Rounded to the halala before anything is spoken, so the words can never
  // disagree with the figure printed beside them — the figure is rounded the
  // same way.
  const total = Math.round(amount * 100);
  const riyals = Math.floor(total / 100);
  const halalas = total % 100;

  if (riyals === 0 && halalas === 0) return `فقط صفر ${currency.many} لا غير`;

  const parts: string[] = [];
  if (riyals > 0) parts.push(amountPhrase(riyals, currency));
  if (halalas > 0) parts.push(amountPhrase(halalas, fraction));

  return `فقط ${parts.join(" و")} لا غير`;
}
