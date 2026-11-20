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
 * A spelled-out article («المادة الخامسة والعشرون», «للمادة الحادية عشرة»,
 * «المادة الأولى بعد المائة») reads as the same key as its digits, so a memo
 * that writes «الخامسة والعشرون» and a shorter text that writes «25» keep the
 * reference. The ordinal words are questionRefs.articleNumber's (1–100), plus
 * «بعد المائة / المائتين / …» here for 101–999. An ordinal followed by «بعد»
 * and a word that is not a hundred is NOT read (a wrong key is worse than none).
 *
 * Pure: its only import (questionRefs.ts) has none, so `node --test` runs it.
 */

import { articleNumber } from "./questionRefs.ts";
import { readArticleNumbers } from "../library/articleMentions.ts";

// N02-13 (batch l11): the dual «المادتين / المادتان» names TWO articles —
// «المادتين الأولى والثانية», «المادتين (٥) و(٦)». ARTICLE and ARTICLE_WORDS
// read only the first; this reads both with the reader's own list parser
// (articleMentions.readArticleNumbers), which already tells the list «الخامسة
// والسادسة» (5, 6) from the compound «الخامسة والعشرون» (25).
const DUAL = /(?:^|[^ء-يٱ-ۓ])(?:[وفبلك]{0,3})(?:ال)?ماد(?:تين|تان)\s*(?:رقم\s*)?/g;

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

// «المادة» before a spelled-out number: the same forms as ARTICLE, then an optional «رقم» and bracket.
const ARTICLE_WORDS = /(?:^|[^\u0621-\u064A\u0671-\u06D3])(?:[وفبلك]{0,3})(?:ال)?ماد(?:ة|تين|تان)\s*(?:رقم\s*)?[(\[«]?\s*(?=[\u0621-\u064A])/g;

/** «أ إ آ» → «ا», «ى» → «ي», «ة» → «ه», «ئ» → «ي»: the shape HUNDREDS is keyed on. */
const foldWord = (w: string) => w.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ئ/g, "ي");

const HUNDREDS: Record<string, number> = {
  المايه: 100, الميه: 100, المايتين: 200, الميتين: 200, المايتان: 200,
  الثلاثمايه: 300, الثلثمايه: 300, الاربعمايه: 400, الخمسمايه: 500, الستمايه: 600,
  السبعمايه: 700, الثمانمايه: 800, الثمانيمايه: 800, التسعمايه: 900,
  الثلاثميه: 300, الاربعميه: 400, الخمسميه: 500, الستميه: 600, السبعميه: 700, الثمانميه: 800, التسعميه: 900,
};

/** The words after «المادة», without the punctuation around them. */
function wordsAfter(text: string, from: number, n: number): string[] {
  return text
    .slice(from, from + 80)
    .replace(/[()[\]{}«»"“”،,؛;:.!؟?]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, n);
}

/** A spelled-out article number starting at `from`, or null. */
function spelledArticle(text: string, from: number): number | null {
  const ws = wordsAfter(text, from, 5);
  const num = articleNumber(ws.slice(0, 2));
  if (!num || /^\d/.test(ws[0] ?? "")) return null; // digits are ARTICLE's
  if (num.n >= 100 || foldWord(ws[num.used] ?? "") !== "بعد") return num.n;
  const hundreds = HUNDREDS[foldWord(ws[num.used + 1] ?? "")];
  return hundreds ? hundreds + num.n : null;
}

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
  // Digits and words in the order they appear, so the keys keep the text's order.
  const articles: Array<{ at: number; n: string }> = [];
  for (const m of t.matchAll(ARTICLE)) articles.push({ at: m.index ?? 0, n: m[1] });
  for (const m of t.matchAll(ARTICLE_WORDS)) {
    const n = spelledArticle(t, (m.index ?? 0) + m[0].length);
    if (n !== null) articles.push({ at: m.index ?? 0, n: String(n) });
  }
  for (const m of t.matchAll(DUAL)) {
    const from = (m.index ?? 0) + m[0].length;
    for (const n of readArticleNumbers(t.slice(from, from + 140)).numbers.slice(0, 2)) {
      articles.push({ at: m.index ?? 0, n: String(n) });
    }
  }
  for (const a of articles.sort((x, y) => x.at - y.at)) add(`مادة ${a.n}`);
  for (const m of t.matchAll(NUMBERED)) add(`رقم ${m[1].replace(/\s+/g, "")}`);
  return out;
}

/** The references of `required` that `text` no longer contains. */
export function missingLegalRefs(required: readonly string[], text: string): string[] {
  const present = new Set(extractLegalRefs(text));
  return required.filter((r) => !present.has(r));
}
