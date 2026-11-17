/**
 * articleMentions.ts — the article references in a legal text: «المادة (٣٥)»,
 * «المادة الخامسة والعشرون», «التاسعة بعد المائة», duals, lists and ranges, and
 * the words that say which document they point to («من هذا النظام», «من نظام …»).
 *
 * Moved out of src/lib/ai/graphBuilder.ts unchanged (batch l6, 2026-11-18) so
 * the law reader can linkify the SAME references the graph watchdog turned into
 * CITES_ARTICLE edges — one parser, so a chip and the graph never disagree.
 * graphBuilder imports and re-exports everything here.
 *
 * Pure, no imports (no node:crypto, no Buffer): safe in a client bundle and
 * runnable by `node --test`.
 */

export const ARABIC_DIACRITICS_RE = /[\u064B-\u065F\u0670\u0640]/g;

export function normalizeArabicKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(ARABIC_DIACRITICS_RE, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toAsciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const UNITS_MAP: Readonly<Record<string, number>> = {
  الاولي: 1, الاول: 1, واحد: 1, الواحده: 1, الواحد: 1, الحاديه: 1, الحادي: 1, احدي: 1, احد: 1,
  الثانيه: 2, الثاني: 2, اثنتان: 2, اثنين: 2, اثني: 2, اثنتي: 2,
  الثالثه: 3, الثالث: 3, ثلاث: 3, ثلاثه: 3,
  الرابعه: 4, الرابع: 4, اربع: 4, اربعه: 4,
  الخامسه: 5, الخامس: 5, خمس: 5, خمسه: 5,
  السادسه: 6, السادس: 6, ست: 6, سته: 6,
  السابعه: 7, السابع: 7, سبع: 7, سبعه: 7,
  الثامنه: 8, الثامن: 8, ثمان: 8, ثماني: 8, ثمانيه: 8,
  التاسعه: 9, التاسع: 9, تسع: 9, تسعه: 9,
  العاشره: 10, العاشر: 10, عشر: 10, عشره: 10,
};

const TENS_MAP: Readonly<Record<string, number>> = {
  العشرون: 20, العشرين: 20, عشرون: 20, عشرين: 20,
  الثلاثون: 30, الثلاثين: 30, ثلاثون: 30, ثلاثين: 30,
  الاربعون: 40, الاربعين: 40, اربعون: 40, اربعين: 40,
  الخمسون: 50, الخمسين: 50, خمسون: 50, خمسين: 50,
  الستون: 60, الستين: 60, ستون: 60, ستين: 60,
  السبعون: 70, السبعين: 70, سبعون: 70, سبعين: 70,
  الثمانون: 80, الثمانين: 80, ثمانون: 80, ثمانين: 80,
  التسعون: 90, التسعين: 90, تسعون: 90, تسعين: 90,
};

const HUNDREDS_MAP: Readonly<Record<string, number>> = {
  المائه: 100, المئه: 100, مائه: 100, مئه: 100,
  المائتان: 200, المئتان: 200, المائتين: 200, المئتين: 200, مائتان: 200, مائتين: 200, مئتين: 200,
  الثلاثمائه: 300, ثلاثمائه: 300, الثلاثمئه: 300, ثلاثمئه: 300,
  الاربعمائه: 400, اربعمائه: 400,
  الخمسمائه: 500, خمسمائه: 500,
};

/**
 * Parses Saudi statutory article identifiers: Latin digits (`"77"`), Arabic-Indic
 * digits (`"٧٧"`), or spelled-out Arabic ordinals (`"السابعة والسبعين"` -> `77`,
 * `"التاسعة بعد المائة"` -> `109`, `"الرابعة والخمسين بعد المائتين"` -> `254`).
 */
export function parseArabicArticleNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw > 0 && raw <= 9999 ? raw : null;
  }
  if (!raw) return null;
  const ascii = toAsciiDigits(String(raw)).trim();
  if (!ascii) return null;

  const directDigits = /(?:^|\D)(\d{1,4})(?:\D|$)/.exec(ascii);
  if (directDigits) {
    const n = Number(directDigits[1]);
    return n > 0 && n <= 9999 ? n : null;
  }

  const norm = normalizeArabicKey(ascii)
    .replace(/^الماده\s+/, "")
    .replace(/^ماده\s+/, "")
    .trim();
  if (!norm) return null;

  const rawTokens = norm.split(/\s+/).filter((t) => t && t !== "بعد" && t !== "من");
  // Split prefixed conjunction `و` (`والسبعين` -> `السبعين`) when the remainder is a known number word
  const tokens = rawTokens.map((tok) => {
    if (tok.startsWith("و") && tok.length > 2) {
      const stripped = tok.slice(1);
      if (UNITS_MAP[stripped] || TENS_MAP[stripped] || HUNDREDS_MAP[stripped]) {
        return stripped;
      }
    }
    return tok;
  });

  let total = 0;
  let matched = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "و") continue;
    if (HUNDREDS_MAP[t] !== undefined) {
      total += HUNDREDS_MAP[t];
      matched = true;
      continue;
    }
    if (TENS_MAP[t] !== undefined) {
      total += TENS_MAP[t];
      matched = true;
      continue;
    }
    if (UNITS_MAP[t] !== undefined) {
      total += UNITS_MAP[t];
      matched = true;
      continue;
    }
    // Stop at first non-number word once we already parsed the article number phrase
    if (matched) break;
  }

  return matched && total > 0 && total <= 9999 ? total : null;
}

// Every article reference starts with the noun: «المادة», «للمادة», «بالمادة», «والمادة»,
// «مادة», the dual «المادتين/المادتان» or the plural «المواد». Diacritics may sit
// between the letters («المادّة»).
const MARK = "[\\u064B-\\u0652\\u0670\\u0640]*";
export const ARTICLE_NOUN_RE = new RegExp(
  `(?<![\\p{L}\\p{M}])((?:[وف])?(?:بال|لل|ال|ب|ل|ك)?)` +
    `(م${MARK}ا${MARK}د${MARK}(?:ت${MARK}ي${MARK}ن|ت${MARK}ا${MARK}ن|ة)|م${MARK}و${MARK}ا${MARK}د)` +
    `(?![\\p{L}\\p{M}])`,
  "gu",
);

/** A dual names at most two articles; a list or range stops here (a bad range must not explode). */
const MAX_LISTED_ARTICLES = 40;
const MAX_RANGE_SPAN = 30;

/** Words that may sit between the numbers of one list («رقم», a repeated «المادة»). */
const LIST_GLUE_WORDS = new Set(["الماده", "والماده", "المواد", "والمواد", "المادتين", "المادتان", "رقم", "رقمي", "ارقام", "و"]);
const RANGE_WORDS = new Set(["الي", "حتي"]);

function isNumberWord(w: string): boolean {
  return UNITS_MAP[w] !== undefined || TENS_MAP[w] !== undefined || HUNDREDS_MAP[w] !== undefined;
}

export type ArticleNounKind = "single" | "dual" | "plural";

/**
 * The article numbers at the start of `s` (the text right after the noun):
 * «(5)», «(5، 6 و7)», «من (3) إلى (7)», «الخامسة عشرة» (15), «الخامسة والعشرين» (25),
 * «الخامسة والسادسة» (5 and 6), «التاسعة بعد المائة» (109). Reading stops at the
 * first word that is neither a number nor list glue, or at a sentence break.
 * `end` is the index just past the last number read (0 when none).
 */
export function readArticleNumbers(s: string): { numbers: number[]; end: number } {
  const text = toAsciiDigits(s);
  const out: number[] = [];
  let lastEnd = 0;
  let pendingRange = false;
  let cur: { u: number; t: number; h: number; end: number } | null = null;

  const emit = (n: number, end: number) => {
    if (pendingRange && out.length > 0) {
      const from = out[out.length - 1];
      if (n > from && n - from <= MAX_RANGE_SPAN) {
        for (let k = from + 1; k <= n; k++) out.push(k);
      } else {
        out.push(n);
      }
    } else {
      out.push(n);
    }
    pendingRange = false;
    lastEnd = end;
  };
  const closeCur = () => {
    if (!cur) return;
    const v = cur.u + cur.t + cur.h;
    if (v > 0 && v <= 9999) emit(v, cur.end);
    cur = null;
  };

  let prevEnd = 0;
  for (const m of text.matchAll(/\d+(?:\s*[/\\]\s*\d+)?|[\p{L}\p{M}]+/gu)) {
    const idx = m.index ?? 0;
    if (idx > 140) break;
    // A sentence or clause break ends the reference; a line break only after the
    // first number («المادة\n(١٤)» is one reference, a list does not run over lines).
    if ((prevEnd === 0 ? /[.:;؛]/ : /[.:;\n؛]/).test(text.slice(prevEnd, idx))) break;
    prevEnd = idx + m[0].length;
    const raw = m[0];

    if (/^\d/.test(raw)) {
      closeCur();
      const n = Number(/^\d+/.exec(raw)![0]);
      if (n <= 0 || n > 9999) break;
      emit(n, prevEnd);
      continue;
    }

    const tok = normalizeArabicKey(raw);
    if (!tok) continue;
    const started = out.length > 0 || cur !== null;
    if (LIST_GLUE_WORDS.has(tok)) continue;
    if (tok === "من") {
      if (!started) continue; // «المواد من (3) إلى (7)»
      break; // «… من نظام …» names the document
    }
    if (tok === "بعد") {
      if (cur) continue; // «التاسعة بعد المائة»
      break;
    }
    if (RANGE_WORDS.has(tok)) {
      closeCur();
      if (out.length === 0) break;
      pendingRange = true;
      continue;
    }

    let w = tok;
    if (!isNumberWord(w) && w.startsWith("و") && isNumberWord(w.slice(1))) w = w.slice(1);
    if (!isNumberWord(w)) break;

    const unit = UNITS_MAP[w];
    const ten = TENS_MAP[w];
    const hundred = HUNDREDS_MAP[w];
    const c = cur as { u: number; t: number; h: number; end: number } | null;
    if (unit !== undefined) {
      // «الخامسة عشرة»: a units word, then «عشر/عشرة» → the teens.
      if ((w === "عشر" || w === "عشره") && c && c.u > 0 && c.u < 10 && c.t === 0 && c.h === 0) {
        c.u += 10;
        c.end = prevEnd;
        continue;
      }
      // Units always come first in an Arabic ordinal: a second units word starts the next article.
      closeCur();
      cur = { u: unit, t: 0, h: 0, end: prevEnd };
    } else if (ten !== undefined) {
      if (c && c.t === 0 && c.h === 0 && c.u < 10) {
        c.t = ten;
        c.end = prevEnd;
      } else {
        closeCur();
        cur = { u: 0, t: ten, h: 0, end: prevEnd };
      }
    } else if (hundred !== undefined) {
      if (c && c.h === 0) {
        c.h = hundred;
        c.end = prevEnd;
      } else {
        closeCur();
        cur = { u: 0, t: 0, h: hundred, end: prevEnd };
      }
    }
  }
  closeCur();
  return { numbers: out, end: lastEnd };
}

/** One place a text names one or more articles. */
export interface ArticleMention {
  /** Index of the noun's first letter (its prefix included). */
  start: number;
  /** The noun's attached prefix: «ال», «لل», «بال», «و», … */
  prefix: string;
  kind: ArticleNounKind;
  /** Index just past the last article number. */
  end: number;
  numbers: number[];
}

/** Every article mention in `text`, with the numbers each one names. */
export function findArticleMentions(text: string): ArticleMention[] {
  const out: ArticleMention[] = [];
  for (const m of text.matchAll(ARTICLE_NOUN_RE)) {
    const start = m.index ?? 0;
    const nounEnd = start + m[0].length;
    const noun = m[2].replace(ARABIC_DIACRITICS_RE, "");
    const kind: ArticleNounKind = noun === "مواد" ? "plural" : noun.startsWith("مادت") ? "dual" : "single";
    const { numbers, end } = readArticleNumbers(text.slice(nounEnd, nounEnd + 160));
    if (numbers.length === 0) continue;
    const cap = kind === "single" ? 1 : kind === "dual" ? 2 : MAX_LISTED_ARTICLES;
    out.push({ start, prefix: m[1], kind, end: nounEnd + end, numbers: [...new Set(numbers)].slice(0, cap) });
  }
  return out;
}

/** «من هذا النظام», «من هذه اللائحة», «من هذه الاتفاقية»: the document itself, whatever it calls itself. */
export const THIS_DOC_REF = /^\s*(?:من|في|ب)\s*(?:(?:هذا|هذه)\s+ال[\p{L}\p{M}]+|النظام\s+هذا)/u;
/**
 * A bare definite noun nothing names: «من النظام», «من اللائحة», «من التنظيم».
 * «من النظام الأساسي …» or «من اللائحة التنفيذية …» go on to name a document
 * and do not match.
 */
export const BARE_DOC_REF =
  /^\s*(?:من|في)\s+ال(نظام|لائحة|تنظيم|قواعد|ضوابط|اتفاقية|ميثاق|قرار|تعليمات|لوائح)(?:\s*$|[\s)]*[^\s\p{L}\p{M}]|\s+(?:المشار|المذكور)|\s+و)/u;
/** «من نظام …», «من اللائحة …», «من النظام الأساسي …»: some other document, named or not. */
export const OTHER_DOC_REF = /^\s*(?:من|في)\s+(?:(?:ال)?(?:نظام|لائحة|قرار|مرسوم|أمر|قواعد|ضوابط|تنظيم))/;
