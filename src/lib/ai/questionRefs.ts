/**
 * questionRefs.ts — what a library question names outright, read before any
 * search (owner's live test, 29 Oct):
 *   - «ما هي المادة الأولى من نظام العمل؟» was answered «ungrounded»: the
 *     searches found the first article of some other regulation, never the one
 *     asked about. An article named by number and law is now read directly.
 *   - «تعريف عقد البيع» found nothing useful: every search word must appear in
 *     the text (the tsquery ANDs them), and the definition (المعاملات المدنية،
 *     المادة ٣٠٧ «البيع عقد…») never says «تعريف». Framing words like that are
 *     dropped from a search before it runs.
 *   - A question that names a law («… في نظام الضمان الاجتماعي») is searched
 *     inside that law first.
 *
 * Pure: no imports, so `node --test` runs it.
 */

/** «أ إ آ» → «ا», «ى» → «ي», «ة» → «ه», no tatweel or diacritics: the shape the lists below are keyed on. */
function fold(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const UNITS: Record<string, number> = {
  الاولي: 1, الحاديه: 1, الثانيه: 2, الثالثه: 3, الرابعه: 4, الخامسه: 5, السادسه: 6, السابعه: 7, الثامنه: 8, التاسعه: 9,
};
const TENS: Record<string, number> = {
  العشرون: 20, العشرين: 20, الثلاثون: 30, الثلاثين: 30, الاربعون: 40, الاربعين: 40, الخمسون: 50, الخمسين: 50,
  الستون: 60, الستين: 60, السبعون: 70, السبعين: 70, الثمانون: 80, الثمانين: 80, التسعون: 90, التسعين: 90,
};

/**
 * An article number from the words after «المادة»: digits (Arabic-Indic too,
 * in brackets or not) or a feminine ordinal up to 99, plus «المائة» (100).
 * Returns the number and how many words it used, or null.
 */
export function articleNumber(words: readonly string[]): { n: number; used: number } | null {
  const first = toAsciiDigits(words[0] ?? "").replace(/[()[\]{}«»]/g, "");
  if (/^\d{1,4}$/.test(first)) {
    const n = Number(first);
    return n > 0 ? { n, used: 1 } : null;
  }
  const w0 = fold(first);
  if (w0 === "العاشره") return { n: 10, used: 1 };
  if (w0 === "المائه" || w0 === "الميه") return { n: 100, used: 1 };
  if (w0 in TENS) return { n: TENS[w0], used: 1 };
  if (!(w0 in UNITS)) return null;
  const unit = UNITS[w0];
  const w1 = fold(words[1] ?? "");
  if (w1 === "عشره" || w1 === "عشر") return { n: 10 + unit, used: 2 };
  if (w1.startsWith("و") && w1.slice(1) in TENS) return { n: TENS[w1.slice(1)] + unit, used: 2 };
  // «الحادية» alone is not a number.
  return w0 === "الحاديه" ? null : { n: unit, used: 1 };
}

/** Words that end a law's name in a question. */
const NAME_STOP = new Set(["في", "عن", "علي", "الي", "اذا", "هل", "متي", "ما", "ماذا", "كيف", "لماذا", "التي", "الذي", "حول", "بشان", "وما", "او", "ثم"]);
const NAME_START = /^(?:ال)?(?:نظام|لائحه|اللائحه|النظام)$/;
const MAX_NAME_WORDS = 6;
/** «المادة», «مادة», and the same after «و» («… والمادة الثانية»). */
const MADDA = new Set(["الماده", "ماده", "والماده", "وماده"]);

function words(text: string): string[] {
  return text.replace(/[؟?!.,،:;«»"“”()[\]{}]/g, " ").split(/\s+/).filter(Boolean);
}

/** A law's name starting at word `i` («نظام العمل»), up to the first stop word; null when it is just «النظام». */
function nameAt(ws: readonly string[], i: number): string | null {
  if (!NAME_START.test(fold(ws[i] ?? ""))) return null;
  const out = [ws[i]];
  for (let j = i + 1; j < ws.length && out.length < MAX_NAME_WORDS; j++) {
    const f = fold(ws[j]);
    if (NAME_STOP.has(f) || /^\d/.test(toAsciiDigits(ws[j])) || MADDA.has(f)) break;
    out.push(ws[j]);
  }
  return out.length > 1 ? out.join(" ") : null;
}

export interface ArticleRef {
  law: string;
  article: number;
}

/** «المادة الأولى من نظام العمل», «المادة (٧٧) من نظام العمل»: each article named with its law, at most `max`. */
export function articleRefs(text: string, max = 2): ArticleRef[] {
  const ws = words(String(text ?? ""));
  const out: ArticleRef[] = [];
  for (let i = 0; i < ws.length && out.length < max; i++) {
    const f = fold(ws[i]);
    if (!MADDA.has(f)) continue;
    const num = articleNumber(ws.slice(i + 1, i + 3));
    if (!num) continue;
    let j = i + 1 + num.used;
    if (fold(ws[j] ?? "") === "من") j++;
    const law = nameAt(ws, j);
    if (law && !out.some((r) => r.law === law && r.article === num.n)) out.push({ law, article: num.n });
  }
  return out;
}

/**
 * «المادة الأولى» with no law after it, at most `max`: on a law page it means
 * that law's article («ما هي المادة الأولى؟» asked on نظام العمل).
 */
export function bareArticleNumbers(text: string, max = 2): number[] {
  const ws = words(String(text ?? ""));
  const out: number[] = [];
  for (let i = 0; i < ws.length && out.length < max; i++) {
    if (!MADDA.has(fold(ws[i]))) continue;
    const num = articleNumber(ws.slice(i + 1, i + 3));
    if (!num) continue;
    let j = i + 1 + num.used;
    if (fold(ws[j] ?? "") === "من") j++;
    if (!nameAt(ws, j) && !out.includes(num.n)) out.push(num.n);
  }
  return out;
}

/** The laws a question names («… في نظام الضمان الاجتماعي»), in order, at most `max`. */
export function lawNames(text: string, max = 2): string[] {
  const ws = words(String(text ?? ""));
  const out: string[] = [];
  for (let i = 0; i < ws.length && out.length < max; i++) {
    const name = nameAt(ws, i);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Words that frame a question but never appear in the text that answers it. */
const FRAMING = new Set([
  "تعريف", "التعريف", "مفهوم", "معني", "ماهيه", "المقصود", "يقصد", "شرح", "اشرح", "ما", "ماذا", "هو", "هي", "هل",
  "الماده", "ماده", "رقم", "نص",
]);

/**
 * A search without its framing words and article numbers: «تعريف عقد البيع» →
 * «عقد البيع», «المادة الأولى نظام العمل» → «نظام العمل». Empty when nothing
 * else is left.
 */
export function stripFraming(q: string): string {
  const ws = String(q ?? "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < ws.length; i++) {
    const f = fold(ws[i]);
    if (FRAMING.has(f)) {
      // «المادة الأولى» / «المادة 77»: the number goes with it.
      if (f === "الماده" || f === "ماده") {
        const num = articleNumber(ws.slice(i + 1, i + 3));
        if (num) i += num.used;
      }
      continue;
    }
    out.push(ws[i]);
  }
  return out.join(" ");
}
