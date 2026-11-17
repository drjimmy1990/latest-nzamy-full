/**
 * requestPublicSummary.ts — the one summary line a verified lawyer sees for an
 * open request (owner decisions ١٠ + ١٩, 17 Nov 2026).
 *
 *   • The lawyer sees the case type, the city and ONE line (~100 characters),
 *     never the client's name. The full text and the name are shown only once
 *     the lawyer is assigned.
 *   • The line is written by an AI model from the client's description AFTER
 *     names, numbers, mobiles, e-mails and URLs are removed (scrubPersonalData
 *     runs BEFORE the model sees the text).
 *   • Whatever comes back — from the model or from the fallback — passes a
 *     deterministic post-check (findSummaryProblems): any digit of any script,
 *     an e-mail, a URL or a phone pattern → the text is scrubbed again, and if
 *     it is still unsafe the deterministic fallback is used instead. The
 *     database CHECK of 20261124_30 holds the same rule.
 *
 * The scrubber is deliberately aggressive: a lost word in a summary costs
 * nothing, a leaked name breaks decision ١٠.
 *
 * Pure: no I/O, relative imports only — `node --test` runs it.
 */

import { requestTypeLabelAr } from "./requestTypeLabels.ts";

/** The target length of the line (owner: ~100 characters, one sentence). */
export const PUBLIC_SUMMARY_MAX = 100;
/** How much scrubbed description the model is given. */
export const SUMMARY_MODEL_INPUT_MAX = 1500;

// ── patterns ────────────────────────────────────────────────────────────────

/** Any decimal digit of any script (Latin, ٠-٩, ۰-۹, …); NFKC already folded ０-９. */
const DIGIT_RE = /\p{Nd}/u;
/** A number-ish run: digits with the separators a phone or an id is written with. */
const NUMBER_RUN_RE = /[+＋]?\p{Nd}(?:[\p{Nd}\s\-–_().\/\\,،٫٬]*\p{Nd})?/gu;
const EMAIL_RE = /[^\s@<>()"',،]+\s*(?:@|＠|\[at\]|\(at\))\s*[^\s@<>()"',،]+/giu;
const URL_RE = /(?:https?:\/\/|www\.)\S+/giu;
/** A bare domain (example.sa, x.com/path). */
const DOMAIN_RE = /\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|sa|gov|edu|io|me|co|info|biz|app|link|ly)(?:\/\S*)?\b/giu;
/** Words that spell a mobile out (واتساب / جوال …) followed by nothing useful are dropped with it. */
const CONTACT_WORD_RE = /(?:^|\s)و?(?:رقمي|جوالي|جوال|الجوال|واتساب|واتس|الواتساب|هاتفي|هاتف|تلفوني|ايميلي|إيميلي|الايميل|الإيميل|بريدي)(?=\s|$|[،,.:؛])/gu;

/** Words after which the next words are a person's name. */
const NAME_CUES = new Set([
  "اسمي", "أسمي", "إسمي", "اسمه", "اسمها", "واسمي",
  "المدعو", "المدعوة", "السيد", "السيدة", "الأستاذ", "الأستاذة", "الاستاذ", "الاستاذة",
  "الدكتور", "الدكتورة", "د.", "أ.", "م.", "الشيخ", "المهندس", "المهندسة",
  "المواطن", "المواطنة", "موكلي", "موكلتي", "أنا", "انا", "وأنا", "وانا",
]);
/** Cues that introduce oneself: only the next word (plus a name chain) is dropped. */
const SHORT_CUES = new Set(["أنا", "انا", "وأنا", "وانا"]);
/** Links inside a name: «محمد بن سعد», «نورة بنت علي», «آل فلان», «أبو خالد». */
const NAME_LINKS = new Set(["بن", "بنت", "ابن", "إبن", "آل", "ال", "أبو", "ابو", "أم", "ام", "عبد"]);
/** Words that end a name: function words and the verbs a description starts with. */
const STOP_WORDS = new Set([
  "في", "من", "على", "عن", "إلى", "الى", "مع", "و", "أو", "او", "أن", "ان", "إن", "لدي", "لدى", "عند", "ضد",
  "قد", "لقد", "تم", "حيث", "الذي", "التي", "بسبب", "بخصوص", "حول", "منذ", "بعد", "قبل", "لأن", "لان",
  "أريد", "اريد", "أرغب", "ارغب", "أعمل", "اعمل", "أطلب", "اطلب", "أحتاج", "احتاج", "عندي", "كنت", "أملك",
  "تعرضت", "أود", "اود", "أبحث", "ابحث", "موظف", "موظفة", "مواطن", "مقيم", "طالب", "صاحب", "مالك", "مستأجر",
  "هل", "ما", "لا", "لم", "لن", "هو", "هي", "نحن", "كان", "كانت", "يوجد", "توجد",
]);
const TRAILING_PUNCT_RE = /[،,.:؛;!?؟]$/u;

// ── helpers ─────────────────────────────────────────────────────────────────

function oneLine(text: string): string {
  return text.normalize("NFKC").replace(/[​-‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();
}

/** Strip a leading و/ف/ب/ل and surrounding punctuation, for word comparisons only. */
function bare(word: string): string {
  return word.replace(/^[«"'(\[]+|[»"')\],،.:؛;!?؟]+$/gu, "");
}
function withoutPrefix(word: string): string {
  const b = bare(word);
  return b.length > 3 && /^[وفبل]/u.test(b) ? b.slice(1) : b;
}
function isStop(word: string): boolean {
  const b = bare(word);
  return STOP_WORDS.has(b) || STOP_WORDS.has(withoutPrefix(word)) || /^[وف]?(?:أ|ا)?(?:ريد|رغب|طلب|حتاج)/u.test(b);
}

/** A word that reads as a family name closing a «بن» chain: «العتيبي», not «في» or «الذي». */
function isFamilyName(word: string | undefined): boolean {
  if (!word) return false;
  const b = bare(word);
  return b.startsWith("ال") && b.length > 3 && !isStop(word);
}

/** The name words of a person (the requester), for removal wherever they appear. */
export function personNameWords(names: ReadonlyArray<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const n of names) {
    if (typeof n !== "string") continue;
    for (const w of oneLine(n).split(" ")) {
      const b = bare(w);
      if (b.length < 3 || NAME_LINKS.has(b) || STOP_WORDS.has(b) || /\p{Nd}|@/u.test(b)) continue;
      if (/^(?:أ|د|م)\.?$/u.test(b)) continue;
      out.add(b);
    }
  }
  return [...out];
}

function dropNames(text: string, nameWords: readonly string[]): string {
  const known = new Set(nameWords);
  const words = text.split(" ").filter(Boolean);
  const keep: boolean[] = words.map(() => true);

  for (let i = 0; i < words.length; i++) {
    const b = bare(words[i]);
    // a known name word of the requester, with or without a و/ب/ل prefix, or with ال
    if (known.size > 0 && (known.has(b) || known.has(withoutPrefix(words[i])) || known.has(b.replace(/^ال/u, "")))) {
      keep[i] = false;
      continue;
    }
    // a name chain anywhere: «X بن Y», «X بنت Y بن Z», «آل Y»
    if (NAME_LINKS.has(b) && b !== "ال" && i + 1 < words.length && !isStop(words[i + 1])) {
      if (b !== "آل" && b !== "عبد" && i > 0 && !isStop(words[i - 1]) && !NAME_CUES.has(bare(words[i - 1]))) keep[i - 1] = false;
      keep[i] = false;
      keep[i + 1] = false;
      // the family name that usually closes the chain («… بن سعد العتيبي»)
      if (b !== "آل" && isFamilyName(words[i + 2])) keep[i + 2] = false;
      continue;
    }
    // a cue: drop the words that follow, until a stop word or punctuation
    if (NAME_CUES.has(b) || NAME_CUES.has(words[i])) {
      // up to three words; a family name («الغامدي») or punctuation closes the name
      const max = SHORT_CUES.has(b) ? 1 : 3;
      let taken = 0;
      let j = i + 1;
      while (j < words.length && taken < max && !isStop(words[j])) {
        keep[j] = false;
        taken++;
        const ended = TRAILING_PUNCT_RE.test(words[j]) || (bare(words[j]).startsWith("ال") && bare(words[j]).length > 3);
        j++;
        if (ended) break;
      }
      // a name chain right after the cue («أنا محمد بن سعد العتيبي»)
      let chained = false;
      while (j + 1 < words.length && NAME_LINKS.has(bare(words[j])) && !isStop(words[j + 1])) {
        keep[j] = false;
        keep[j + 1] = false;
        j += 2;
        chained = true;
      }
      if (chained && isFamilyName(words[j])) keep[j] = false;
      // «اسمي» / «المدعو» themselves say nothing once the name is gone
      if (taken > 0 && !SHORT_CUES.has(b)) keep[i] = false;
    }
  }
  return words.filter((_, i) => keep[i]).join(" ");
}

function tidy(text: string): string {
  return text
    .replace(/\(\s*\)|\[\s*\]|«\s*»|"\s*"/gu, " ")
    .replace(/\s+([،,.:؛;!?؟])/gu, "$1")
    .replace(/([،,.:؛;])(?:\s*[،,.:؛;])+/gu, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[\s،,.:؛;\-–—]+/u, "")
    .replace(/[\s،,:؛;\-–—]+$/u, "")
    .trim();
}

// ── public API ──────────────────────────────────────────────────────────────

export interface ScrubOptions {
  /** The requester's own name(s) — every word of them is removed wherever it appears. */
  names?: ReadonlyArray<string | null | undefined>;
}

/**
 * Removes e-mails, URLs, bare domains, every digit run (phones, ids, amounts,
 * dates — Arabic-Indic, Persian, Latin and full-width alike), the words that
 * introduce a contact, and names: after a cue («اسمي», «أنا», «المدعو»,
 * «السيد» …), in a «بن/بنت/آل» chain, or any word of the requester's name.
 * Returns one trimmed line (possibly empty).
 */
export function scrubPersonalData(text: string, options: ScrubOptions = {}): string {
  if (typeof text !== "string" || text.length === 0) return "";
  let t = oneLine(text);
  t = t.replace(EMAIL_RE, " ");
  t = t.replace(URL_RE, " ");
  t = t.replace(DOMAIN_RE, " ");
  t = t.replace(NUMBER_RUN_RE, " ");
  t = t.replace(/[@＠]/gu, " ");
  t = t.replace(CONTACT_WORD_RE, " ");
  t = t.replace(/\s+/g, " ").trim();
  t = dropNames(t, personNameWords(options.names ?? []));
  return tidy(t);
}

export type SummaryProblem = "empty" | "too_long" | "line_break" | "digit" | "email" | "url";

/**
 * The deterministic post-check. An empty list means the line may be shown.
 * Same rule as the CHECK of 20261124_30 (which allows up to 120 characters;
 * the product line is PUBLIC_SUMMARY_MAX).
 */
export function findSummaryProblems(text: unknown): SummaryProblem[] {
  if (typeof text !== "string" || text.trim().length === 0) return ["empty"];
  const problems: SummaryProblem[] = [];
  const n = text.normalize("NFKC");
  if (/[\r\n]/.test(text)) problems.push("line_break");
  if (DIGIT_RE.test(n) || /[٠-٩۰-۹０-９]/u.test(text)) problems.push("digit");
  if (/[@＠]/u.test(n) || /\[at\]|\(at\)/i.test(n)) problems.push("email");
  if (/https?:|www\./i.test(n) || new RegExp(DOMAIN_RE.source, "iu").test(n)) problems.push("url");
  if ([...text].length > PUBLIC_SUMMARY_MAX) problems.push("too_long");
  return problems;
}

export function isSafePublicSummary(text: unknown): text is string {
  return findSummaryProblems(text).length === 0;
}

/** Cuts a line to `max` characters at a word boundary, with «…» when cut. */
export function clampSummary(text: string, max = PUBLIC_SUMMARY_MAX): string {
  const t = oneLine(text);
  const chars = [...t];
  if (chars.length <= max) return t;
  const head = chars.slice(0, max - 1).join("");
  const cut = head.lastIndexOf(" ");
  return `${(cut > max / 2 ? head.slice(0, cut) : head).replace(/[\s،,.:؛;\-–—]+$/u, "")}…`;
}

/** The first sentence of a text (up to . ! ? ؟ ؛ or a line break). */
export function firstSentence(text: string): string {
  if (typeof text !== "string") return "";
  for (const piece of text.split(/[.!?؟؛\n\r]+/u)) {
    const s = piece.trim();
    if (s.length > 0) return s;
  }
  return "";
}

export interface SummarySource {
  /** service_requests.type */
  type: string | null | undefined;
  description: string | null | undefined;
  title?: string | null;
  /** The requester's name(s), removed wherever they appear. */
  names?: ReadonlyArray<string | null | undefined>;
}

/**
 * The deterministic line: «<type label>: <first sentence of the scrubbed
 * description>» (or of the scrubbed title when the description is empty), cut
 * to PUBLIC_SUMMARY_MAX. The sentence is taken from the RAW text first, then
 * scrubbed, so a «.» inside a removed e-mail or URL cannot end it early. Null
 * only when nothing safe is left at all.
 */
export function fallbackPublicSummary(src: SummarySource): string | null {
  const label = requestTypeLabelAr(src.type ?? null) ?? "طلب";
  const opts = { names: src.names ?? [] };
  const pick = (raw: string | null | undefined): string => {
    if (typeof raw !== "string" || raw.trim().length === 0) return "";
    const scrubbed = scrubPersonalData(raw, opts);
    // the first sentence with at least two real words (a sentence the
    // scrubber emptied — «اسمي … وجوالي …» — is skipped, not shown)
    for (const piece of scrubbed.split(/[.!?؟؛]+/u)) {
      const sentence = tidy(piece);
      if (sentence.split(" ").filter((w) => w.length > 1).length >= 2) return sentence;
    }
    return "";
  };
  const sentence = pick(src.description) || pick(src.title);
  const line = clampSummary(sentence ? `${label}: ${sentence}` : label);
  if (isSafePublicSummary(line)) return line;
  return isSafePublicSummary(label) ? label : null;
}

/**
 * What the model is given: the scrubbed description (or title), one line,
 * bounded. Never the raw text — the model never sees a name, number, mobile,
 * e-mail or URL the scrubber could find.
 */
export function summaryModelInput(src: SummarySource): { type_label: string; text: string } | null {
  const opts = { names: src.names ?? [] };
  const text = scrubPersonalData(src.description ?? "", opts) || scrubPersonalData(src.title ?? "", opts);
  if (text.split(" ").filter((w) => w.length > 1).length < 3) return null;
  return {
    type_label: requestTypeLabelAr(src.type ?? null) ?? "طلب",
    text: [...text].slice(0, SUMMARY_MODEL_INPUT_MAX).join(""),
  };
}

/** Reads the line out of a model reply: a string, {summary}, or {result: {summary}}. */
export function readSummaryReply(reply: unknown): string | null {
  if (typeof reply === "string") return reply;
  if (reply && typeof reply === "object") {
    const r = reply as Record<string, unknown>;
    if (typeof r.summary === "string") return r.summary;
    if (r.result !== undefined) return readSummaryReply(r.result);
  }
  return null;
}

/**
 * The post-check applied to a candidate line (normally the model's): one
 * line, the requester's name words removed, and — if a digit, e-mail, URL or
 * phone is still there — scrubbed again; if that is still not clean, or
 * nothing useful is left, the fallback wins. Always returns a line that
 * passes isSafePublicSummary, or the fallback (which may be null).
 */
export function finalizePublicSummary(
  candidate: unknown,
  src: SummarySource,
): { summary: string | null; source: "model" | "model_scrubbed" | "fallback" } {
  const fallback = () => ({ summary: fallbackPublicSummary(src), source: "fallback" as const });
  if (typeof candidate !== "string") return fallback();
  const opts = { names: src.names ?? [] };
  // the first line only, without list marks or quotes the model may add
  const raw = candidate.split(/[\r\n]+/u).map((s) => s.trim()).find((s) => s.length > 0) ?? "";
  const unquoted = raw.replace(/^[-*•\s«"']+|[»"'\s]+$/gu, "");
  if (!unquoted) return fallback();

  const withoutNames = tidy(dropNames(oneLine(unquoted), personNameWords(opts.names)));
  const clean = isSafePublicSummary(clampSummary(withoutNames)) ? clampSummary(withoutNames) : null;
  if (clean && clean.split(" ").length >= 2) {
    return { summary: clean, source: withoutNames === oneLine(unquoted) ? "model" : "model_scrubbed" };
  }
  const rescrubbed = clampSummary(scrubPersonalData(unquoted, opts));
  if (isSafePublicSummary(rescrubbed) && rescrubbed.split(" ").length >= 2) {
    return { summary: rescrubbed, source: "model_scrubbed" };
  }
  return fallback();
}
