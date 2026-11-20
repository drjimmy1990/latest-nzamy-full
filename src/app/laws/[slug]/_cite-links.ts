/**
 * _cite-links.ts — the references inside an article's text, turned into chips
 * (owner TODO N02-14: «المادة (٣٥)», «المادة الخامسة»، «من هذا النظام», named
 * laws and decrees).
 *
 * ONE PARSER. Article references are read by findArticleMentions /
 * readArticleNumbers (src/lib/library/articleMentions.ts) — the code the graph
 * watchdog uses to build CITES_ARTICLE edges — and the document words after a
 * reference by the same THIS_DOC_REF / BARE_DOC_REF / OTHER_DOC_REF. A chip and
 * the graph's «الإحالات المرتبطة» bar therefore agree on what a text cites.
 *
 * HTML. `linkCitationsHtml` works like _highlight-html.ts: it runs on the
 * SANITISED html, splits it into tags and text runs, matches TEXT only (never
 * inside a tag, an href or an existing <a>/<button>), treats an entity as one
 * unit, and adds only fixed markup — a <button> whose data-* attributes hold a
 * kind, a scope and digits. Nothing from the text reaches an attribute: the
 * popover re-reads the chip's own textContent (scanCitations) for a law name.
 * A reference that crosses a tag («المادة **(٣٥)**») is left as text.
 *
 * Pure: `node --test` runs _cite-links.test.ts.
 */

import {
  BARE_DOC_REF,
  OTHER_DOC_REF,
  THIS_DOC_REF,
  findArticleMentions,
  normalizeArabicKey,
} from "../../../lib/library/articleMentions.ts";

export type CiteKind = "article" | "law" | "decree";
/**
 * Where an article reference points:
 *  - self   — this document («المادة (٥)», «… من هذا النظام», «… من النظام» in a law);
 *  - parent — the parent law of a regulation («… من النظام» in a لائحة);
 *  - other  — a document named after it («… من نظام العمل»).
 */
export type CiteScope = "self" | "parent" | "other";

export interface CiteMention {
  kind: CiteKind;
  /** Offsets in the scanned string: the chip covers [start, end). */
  start: number;
  end: number;
  /** Article numbers (kind "article"), at most MAX_NUMBERS. */
  numbers: number[];
  scope: CiteScope;
  /** The named document («نظام العمل») for scope "other" and kind "law"; the decree's words for kind "decree". */
  docName: string;
}

export interface CiteScanOptions {
  /** The current document's title («نظام العمل», «اللائحة التنفيذية لنظام …»). */
  docTitle?: string;
  /** The current article's own number: «المادة (٥)» inside article 5 is not linked. */
  selfNumber?: number | null;
  /**
   * Other names this same file goes by: the regulations merged into it
   * (owner file 16 §1 — a reference to them is a reference to this file).
   */
  selfNames?: readonly string[];
  /**
   * Owner file 16 §1, q٩٥ default (batch l11, O14): a reference to the file
   * the reader is in — its own name, a merged instrument's name, or one of
   * its own articles — is plain text, not a chip. The side box and the index
   * still link them. References to another law, the parent law and decrees
   * stay chips. Read by `linkCitationsHtml` only; `scanCitations` still
   * reports every reference with its scope.
   */
  ownRefsAsText?: boolean;
}

/**
 * q٩٥'s default (the owner has not answered): only references to this same
 * file become plain text. Should he answer «every reference in the text»,
 * the reader's call site changes, not this parser.
 */
export const OWN_DOCUMENT_REFS_AS_TEXT = true;

/**
 * True when a reference points at the file being read: an article of this
 * document (scope "self"), or a named law / article reference whose name is
 * this document's title or one of its merged instruments' names. Names are
 * compared whole after normalizeArabicKey (hamza, ة/ه, ى/ي, diacritics), never
 * by prefix: «نظام القضاء» is not «نظام القضاء العسكري».
 */
export function isOwnDocumentRef(c: CiteMention, opts: CiteScanOptions = {}): boolean {
  if (c.kind === "decree") return false;
  if (c.kind === "article" && c.scope === "self") return true;
  if (c.scope !== "other" || !c.docName) return false;
  const name = normalizeArabicKey(c.docName);
  if (!name) return false;
  const own = [opts.docTitle ?? "", ...(opts.selfNames ?? [])].map((n) => normalizeArabicKey(n)).filter(Boolean);
  return own.includes(name);
}

const MAX_NUMBERS = 8;
const MAX_NAME_WORDS = 8;

/** Words that end a document name: what follows it, not part of it. */
const NAME_STOP = new Set(
  [
    "الصادر", "الصادره", "وتاريخ", "بتاريخ", "وتاريخه", "علي", "في", "الي", "او", "ما", "التي", "الذي", "وفق", "وفقا",
    "وذلك", "فيما", "ويعاقب", "يعاقب", "عن", "اذا", "مع", "من", "هذا", "هذه", "بشان", "ولائحته", "ولوائحه", "المشار",
    "المذكور", "المعدل", "والمعدل", "رقم", "بموجب", "حسب", "بحسب", "دون", "متي", "لا", "قد", "كما", "ثم", "حتي",
    // N02-13 (batch l11): «نظام القضاء ونظام ديوان المظالم» names two laws, not one.
    "ونظام", "ولائحه", "واللائحه",
  ].map((w) => normalizeArabicKey(w)),
);

/** The stem a document's own title carries when it calls itself by `noun` (graphBuilder.DOC_NOUN_STEM). */
const DOC_NOUN_STEM: Readonly<Record<string, string>> = {
  نظام: "نظام",
  لائحة: "لائح",
  لوائح: "لائح",
  تنظيم: "تنظيم",
  قواعد: "قواعد",
  ضوابط: "ضوابط",
  اتفاقية: "اتفاقي",
  ميثاق: "ميثاق",
  قرار: "قرار",
  تعليمات: "تعليمات",
};

function isRegulationTitle(title: string): boolean {
  return /لائح|قواعد|ضوابط|تعليمات/.test(title);
}

/**
 * A document name at the start of `s` («نظام العمل الصادر بالمرسوم …» →
 * «نظام العمل»): up to the first stop word, punctuation or line break.
 * Returns the name and the index just past it in `s` (0 when none).
 */
export function readDocName(s: string): { name: string; end: number } {
  let end = 0;
  const words: string[] = [];
  for (const m of s.matchAll(/[^\s]+|\n/g)) {
    const raw = m[0];
    const idx = m.index ?? 0;
    if (raw === "\n" || /\n/.test(s.slice(end, idx))) break;
    const lead = raw.replace(/[.،,؛;:()[\]«»"'“”]+$/u, "");
    const punctuated = lead !== raw;
    if (!lead || /[()[\]«»"“”\d٠-٩]/u.test(lead)) break;
    if (words.length > 0 && NAME_STOP.has(normalizeArabicKey(lead))) break;
    words.push(lead);
    end = idx + lead.length;
    if (punctuated || words.length >= MAX_NAME_WORDS) break;
  }
  return { name: words.join(" "), end };
}

/** Leading spaces / closing brackets right after a reference's last number. */
const AFTER_NUMBER = /^[\s)\]»"'”]*/u;

/** Which document an article reference names, and how far that naming runs. */
function docAfter(after: string, opts: CiteScanOptions): { scope: CiteScope | null; len: number; docName: string } {
  const skip = AFTER_NUMBER.exec(after)?.[0].length ?? 0;
  const rest = after.slice(skip);
  const self = THIS_DOC_REF.exec(rest);
  if (self) {
    // «من هذه اللائحة» in a نظام is not this law: the noun must fit the title
    // (as for the bare noun below). No title known → the document itself.
    const title = opts.docTitle ?? "";
    const noun = /(?:هذا|هذه)\s+ال([\p{L}\p{M}]+)/u.exec(self[0])?.[1] ?? (/النظام\s+هذا/u.test(self[0]) ? "نظام" : "");
    const stem = DOC_NOUN_STEM[noun];
    const len = skip + self[0].length;
    if (!title || !stem) return { scope: "self", len, docName: "" };
    if (noun === "نظام") return { scope: isRegulationTitle(title) ? "parent" : "self", len, docName: "" };
    return title.includes(stem) ? { scope: "self", len, docName: "" } : { scope: null, len: 0, docName: "" };
  }
  const bare = BARE_DOC_REF.exec(rest);
  if (bare) {
    const noun = bare[1];
    const nounLen = /^\s*(?:من|في)\s+ال[\p{L}\p{M}]+/u.exec(rest)?.[0].length ?? 0;
    const title = opts.docTitle ?? "";
    if (noun === "نظام") return { scope: isRegulationTitle(title) ? "parent" : "self", len: skip + nounLen, docName: "" };
    // «من اللائحة» is this document only when its own title says so; anything else is not guessed.
    return title.includes(DOC_NOUN_STEM[noun] ?? noun) ? { scope: "self", len: skip + nounLen, docName: "" } : { scope: null, len: 0, docName: "" };
  }
  if (OTHER_DOC_REF.test(rest)) {
    const lead = /^\s*(?:من|في)\s+/u.exec(rest)?.[0].length ?? 0;
    const { name, end } = readDocName(rest.slice(lead));
    if (name.split(" ").length < 2) return { scope: null, len: 0, docName: "" };
    return { scope: "other", len: skip + lead + end, docName: name };
  }
  // Nothing names a document: this one. The chip still takes the closing bracket.
  return { scope: "self", len: /^\s*[)\]]/u.exec(after)?.[0].length ?? 0, docName: "" };
}

/** «نظام العمل», «لنظام المرافعات الشرعية», «ونظام الشركات»: an indefinite «نظام» then a definite word. */
const LAW_NAME_RE = /(?<![\p{L}\p{M}])(?:[وف]?[بل]?)(نظام)\s+(?=ال)/gu;

/**
 * «المرسوم الملكي رقم (م/٥١)», «الأمر الملكي رقم (أ/٩٠)», «قرار مجلس الوزراء رقم (٢٢٢)».
 * The number is required: «بموجب مرسوم ملكي» alone names nothing.
 * N02-13 (batch l11): the chip runs on over «وتاريخ …» when the text gives the
 * date, so the popover can resolve the decree to ONE library record (a number
 * alone restarts every year; src/lib/library/decreeRef.ts).
 */
const DECREE_RE =
  /(?<![\p{L}\p{M}])(?:[وب]?)(?:(?:ال)?مرسوم\s+(?:ال)?ملكي|(?:ال)?أمر\s+(?:ال)?(?:ملكي|سامي)|قرار\s+مجلس\s+الوزراء)\s+(?:الكريم\s+)?(?:ذي\s+)?رقم\s*\(?\s*(?:[أإامق]\s*\/\s*)?[\d٠-٩]{1,6}(?:\s*\/\s*[\d٠-٩]{1,6})?\s*\)?(?:\s*،?\s*(?:و|ب)?(?:ال)?تاريخ\s*[\d٠-٩]{1,4}\s*[/.\-]\s*[\d٠-٩]{1,2}\s*[/.\-]\s*[\d٠-٩]{1,4}\s*(?:هـ|ه)?)?/gu;

/** Every reference in `text`, in order, non-overlapping. */
export function scanCitations(text: string, opts: CiteScanOptions = {}): CiteMention[] {
  if (typeof text !== "string" || !text) return [];
  const out: CiteMention[] = [];
  for (const m of findArticleMentions(text)) {
    const doc = docAfter(text.slice(m.end), opts);
    if (!doc.scope) continue;
    const numbers = m.numbers.slice(0, MAX_NUMBERS);
    if (
      doc.scope === "self" &&
      opts.selfNumber != null &&
      numbers.length === 1 &&
      numbers[0] === opts.selfNumber
    ) continue;
    // The chip leaves out a leading «و» / «ف» («والمادة» → «المادة»); «للمادة» stays one word.
    const strip = /^[وف]/u.test(m.prefix) ? 1 : 0;
    out.push({ kind: "article", start: m.start + strip, end: m.end + doc.len, numbers, scope: doc.scope, docName: doc.docName });
  }
  const free = (s: number, e: number) => !out.some((c) => s < c.end && e > c.start);
  const extra: CiteMention[] = [];
  for (const m of text.matchAll(DECREE_RE)) {
    const start = m.index ?? 0;
    const lead = /^[وب]?/u.exec(m[0])?.[0].length ?? 0;
    const end = start + m[0].replace(/\s+$/u, "").length;
    if (free(start, end)) extra.push({ kind: "decree", start: start + lead, end, numbers: [], scope: "other", docName: m[0].slice(lead).trim() });
  }
  for (const m of text.matchAll(LAW_NAME_RE)) {
    const nounAt = (m.index ?? 0) + m[0].indexOf("نظام");
    const { name, end } = readDocName(text.slice(nounAt));
    if (name.split(" ").length < 2) continue;
    const stop = nounAt + end;
    if (free(nounAt, stop) && !extra.some((c) => nounAt < c.end && stop > c.start)) {
      extra.push({ kind: "law", start: nounAt, end: stop, numbers: [], scope: "other", docName: name });
    }
  }
  return [...out, ...extra].sort((a, b) => a.start - b.start);
}

// ── HTML ─────────────────────────────────────────────────────────────────────

const TAG = /<\/?[A-Za-z][^>]*>/g;
const ENTITY = /&(?:#\d+|#x[0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);/g;
/** Stands for one entity while scanning (as in _highlight-html.ts). */
const SLOT = "￼";

/** The chip's classes: fixed strings, never built from the text. */
export function chipClass(isDark: boolean): string {
  return isDark
    ? "nz-cite inline rounded px-0.5 -mx-0.5 font-semibold text-[#C8A762] underline decoration-dotted decoration-[#C8A762]/60 underline-offset-4 hover:bg-[#C8A762]/10 cursor-pointer"
    : "nz-cite inline rounded px-0.5 -mx-0.5 font-semibold text-[#0B3D2E] underline decoration-dotted decoration-[#0B3D2E]/50 underline-offset-4 hover:bg-emerald-50 cursor-pointer";
}

function linkTextRun(text: string, opts: CiteScanOptions, cls: string): string {
  if (!text || text.includes(SLOT)) return text;
  const entities: string[] = [];
  const plain = text.replace(ENTITY, (e) => {
    entities.push(e);
    return SLOT;
  });
  const all = scanCitations(plain, opts);
  // O14 (q٩٥ default): a reference to this same file stays plain text.
  const found = opts.ownRefsAsText ? all.filter((c) => !isOwnDocumentRef(c, opts)) : all;
  if (found.length === 0) return text;
  let next = 0;
  const restore = (s: string) => s.replace(/￼/g, () => entities[next++] ?? "");
  let out = "";
  let last = 0;
  for (const c of found) {
    out += restore(plain.slice(last, c.start));
    const nums = c.numbers.join(",");
    out +=
      `<button type="button" data-cite-kind="${c.kind}" data-cite-scope="${c.scope}"` +
      (nums ? ` data-cite-n="${nums}"` : "") +
      ` class="${cls}">${restore(plain.slice(c.start, c.end))}</button>`;
    last = c.end;
  }
  out += restore(plain.slice(last));
  return out;
}

/** Sanitised HTML with each reference wrapped in a chip button. */
export function linkCitationsHtml(html: string, opts: CiteScanOptions & { isDark?: boolean } = {}): string {
  if (!html) return html;
  const cls = chipClass(opts.isDark === true);
  let out = "";
  let last = 0;
  let inside = 0; // depth of <a> / <button>: no chip inside a link
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(html)) !== null) {
    const run = html.slice(last, m.index);
    out += inside > 0 ? run : linkTextRun(run, opts, cls);
    out += m[0];
    if (/^<(a|button)\b/i.test(m[0])) inside++;
    else if (/^<\/(a|button)\s*>/i.test(m[0])) inside = Math.max(0, inside - 1);
    last = m.index + m[0].length;
  }
  const tail = html.slice(last);
  out += inside > 0 ? tail : linkTextRun(tail, opts, cls);
  return out;
}
