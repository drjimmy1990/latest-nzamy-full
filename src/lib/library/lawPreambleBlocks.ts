/**
 * lawPreambleBlocks.ts — the two template blocks the library files put in a
 * law's preamble, lifted out for the reader (N2.1) and the catalogue card (N2.2):
 *
 *   - the موجز: `<details open><summary>📝 موجز المستند (خلاصة سريعة)</summary> … </details>`
 *     (also «موجز النظام», «موجز الذكاء الاصطناعي», sometimes `<details>` closed);
 *   - the identity card «📊 بطاقة تعريف …»: a `### 📊 بطاقة تعريف …` heading and a
 *     two-column table, optionally followed by a `<details><summary>➕ المزيد …`
 *     table, or the same table wrapped in `<details><summary>📊 بطاقة تعريف …`.
 *
 * Measured on the owner corpus (last_owner «أنظمة ولوائح», 1,432 files with a
 * preamble, 2026-10-25): the موجز in 181 — anywhere in the preamble, before or
 * after the card —, a card heading in 1,386 (1,363 with the ➕ table), a card
 * wrapped in `<details>` in 49. library.laws has no column for either; both
 * live inside library.laws.preamble.
 *
 * Rules:
 *   - Values are never invented. A row the file does not have is absent; a row
 *     whose value is a placeholder («غير متوفر في المصدر», «*غير متوفر*», «لا يوجد»)
 *     is absent too, and so are the pipeline's own rows («تاريخ المعالجة»,
 *     «الملف الأصلي», a schema «النسخة» like 3.1).
 *   - Only http(s) links stay links; a relative file link becomes its text.
 *   - A block leaves the displayed preamble only when it is returned, so text
 *     the parser cannot read (a bullet-list card, an unclosed `<details>`)
 *     stays where it was.
 *
 * lawSummaryBrief() is the twin of the SQL function library.law_summary_brief
 * (migration 20261025_20_law_summary_brief.sql) that fills
 * library.laws.summary_brief for the catalogue cards. The two must give the
 * same text: lawPreambleBlocks.test.ts runs this function over the fixture of
 * the Docker test (supabase/tests/rls/prelude_law_summary_brief_fixture.sql).
 *
 * Pure: no runtime imports, so `node --test` loads it directly.
 */

export interface LawCardField {
  key: string;
  value: string;
}

/** The shape src/app/laws/data.ts (LawSystem.metadata_card) and _sidebar.tsx read. */
export interface LawMetadataCard {
  /** The card's own table, in file order. */
  main: LawCardField[];
  /** The «➕ المزيد من بيانات …» table, in file order. */
  more: LawCardField[];
}

export interface LawPreambleBlocks {
  /** The موجز as Markdown (blockquote marks removed), '' when the preamble has none. */
  summary: string;
  /** The file's own `<summary>` label, e.g. «📝 موجز المستند (خلاصة سريعة)». */
  summaryLabel: string;
  metadataCard: LawMetadataCard | null;
  /** The preamble without the blocks returned above. */
  rest: string;
}

/** Longest summary_brief, in characters (code points); longer ones end in «…». */
export const LAW_SUMMARY_BRIEF_MAX_CHARS = 2000;

const DETAILS_CLOSE = "</details>";
const SUMMARY_OPEN = /<details[^>]*>\s*<summary>([^<]*📝[^<]*موجز[^<]*)<\/summary>/;
const CARD_HEADING = /^#{1,6}[ \t]*📊[^\n]*بطاقة تعريف[^\n]*$/m;
const CARD_DETAILS = /<details[^>]*>\s*<summary>[^<]*📊[^<]*بطاقة تعريف[^<]*<\/summary>/;
const MORE_DETAILS = /<details[^>]*>\s*<summary>[^<]*➕[^<]*<\/summary>/;

function normalise(text: unknown): string {
  return typeof text === "string" ? text.replace(/\r\n/g, "\n") : "";
}

/** The same character set the SQL twin trims (btrim E' \t\n\r'). */
function trimWs(s: string): string {
  return s.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "");
}

function unquote(body: string): string {
  return trimWs(body.replace(/^[ \t]*>[ \t]?/gm, ""));
}

interface Range {
  start: number;
  end: number;
}

interface SummaryHit extends Range {
  label: string;
  body: string;
}

/** The first موجز block, closed by the first `</details>` after its `<summary>`. */
function findSummary(text: string): SummaryHit | null {
  const m = SUMMARY_OPEN.exec(text);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  const close = text.indexOf(DETAILS_CLOSE, bodyStart);
  if (close < 0) return null;
  return { start: m.index, end: close + DETAILS_CLOSE.length, label: trimWs(m[1]), body: text.slice(bodyStart, close) };
}

/**
 * library.laws.summary_brief, computed in TypeScript: the موجز text without
 * blockquote marks, capped at LAW_SUMMARY_BRIEF_MAX_CHARS, or null.
 * Keep in step with library.law_summary_brief (20261025_20).
 */
export function lawSummaryBrief(preamble: unknown): string | null {
  const hit = findSummary(normalise(preamble));
  if (!hit) return null;
  const body = unquote(hit.body);
  if (!body) return null;
  const chars = Array.from(body);
  return chars.length > LAW_SUMMARY_BRIEF_MAX_CHARS
    ? chars.slice(0, LAW_SUMMARY_BRIEF_MAX_CHARS).join("") + "…"
    : body;
}

// ── The identity card ───────────────────────────────────────────────────────

/** End offset of the `<details>` that opens at `start`, counting nested ones; -1 when unclosed. */
function detailsEnd(text: string, start: number): number {
  const re = /<details\b[^>]*>|<\/details>/g;
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    depth += m[0] === DETAILS_CLOSE ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/** A table line's cells, outer pipes dropped. */
export function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** «| :--- | :--- |». */
export function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

const PLACEHOLDER = /^(?:—|–|-|لا يوجد|لا توجد|لا يتوفر|لا تتوفر|غير متوفرة?(?:\s+في\s+المصدر)?|غير محددة?|غير مبينة?|غير معروفة?)\.?$/;
const INTERNAL_KEYS = new Set(["تاريخ المعالجة", "الملف الأصلي"]);

function cleanKey(raw: string): string {
  return raw.replace(/\*\*/g, "").replace(/[:：]\s*$/, "").trim();
}

function cleanValue(raw: string): string {
  let v = raw
    .replace(/<br\s*\/?>/gi, "\n")
    // A link that is not http(s) (a relative file path in the export) is its text.
    .replace(/\[([^\]]+)\]\(((?:[^()]|\([^()]*\))*)\)/g, (_all, label: string, url: string) =>
      /^https?:\/\/\S+$/i.test(url.trim()) ? `[${label}](${url.trim()})` : label)
    .replace(/\*\*([^*]+)\*\*/g, "$1");
  v = v.trim();
  const wrapped = /^[*_]([^*_]+)[*_]$/.exec(v);
  if (wrapped) v = wrapped[1].trim();
  return v
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function isShownField(key: string, value: string): boolean {
  if (!key || !value) return false;
  if (PLACEHOLDER.test(value.replace(/[*_]/g, "").trim())) return false;
  if (INTERNAL_KEYS.has(key)) return false;
  // The pipeline's schema version («النسخة | 3.1»), not an edition of the law.
  if (key === "النسخة" && /^\d+(?:\.\d+)*$/.test(value)) return false;
  return true;
}

/** Field rows of every markdown table in `text`: header and separator rows skipped by shape. */
function tableFields(text: string): LawCardField[] {
  const lines = text.split("\n").filter((l) => l.trim().startsWith("|"));
  const out: LawCardField[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (isSeparatorRow(cells)) continue;
    if (i + 1 < lines.length && isSeparatorRow(splitRow(lines[i + 1]))) continue; // a header row
    const field = cardFieldOfCells(cells);
    if (field) out.push(field);
  }
  return out;
}

/**
 * A data row's field as the card reads it, or null when the card does not
 * show the row: fewer than two cells, a placeholder value («غير متوفر في
 * المصدر», «لا يوجد»), a pipeline key.
 */
export function cardFieldOfCells(cells: string[]): LawCardField | null {
  if (cells.length < 2) return null;
  const key = cleanKey(cells[0]);
  const value = cleanValue(cells.slice(1).join(" | "));
  return isShownField(key, value) ? { key, value } : null;
}

interface CardHit extends Range {
  card: LawMetadataCard;
}

/** `### 📊 بطاقة تعريف …` + its table (+ the ➕ table right after it). */
/** The first `📊 بطاقة تعريف` heading that has a table under it. */
function cardFromHeading(text: string): CardHit | null {
  const all = new RegExp(CARD_HEADING.source, "gm");
  for (let m = all.exec(text); m; m = all.exec(text)) {
    const hit = cardAtHeading(text, m);
    if (hit) return hit;
  }
  return null;
}

function cardAtHeading(text: string, m: RegExpExecArray): CardHit | null {
  let pos = m.index + m[0].length;
  const tableStart = pos;
  // Blank lines and sub-headings («### ⚖️ معلومات التشريع الأساسية»: 23 files
  // in last_owner, 2026-10-25, whose card stayed in the ديباجة), then
  // consecutive table lines. Another 📊 heading is never a sub-heading.
  const lineRe = /\n([^\n]*)/g;
  lineRe.lastIndex = pos;
  let sawTable = false;
  for (let l = lineRe.exec(text); l; l = lineRe.exec(text)) {
    const line = l[1].trim();
    if (line.startsWith("|")) {
      sawTable = true;
      pos = l.index + l[0].length;
      continue;
    }
    if (!sawTable && (line === "" || (/^#{1,6}\s/.test(line) && !line.includes("📊")))) continue;
    break;
  }
  if (!sawTable) return null;
  const main = tableFields(text.slice(tableStart, pos));
  let end = pos;
  let more: LawCardField[] = [];
  const after = text.slice(pos);
  const moreHit = MORE_DETAILS.exec(after);
  if (moreHit && after.slice(0, moreHit.index).trim() === "") {
    const close = detailsEnd(text, pos + moreHit.index);
    if (close > 0) {
      more = tableFields(text.slice(pos + moreHit.index + moreHit[0].length, close));
      end = close;
    }
  }
  if (main.length === 0 && more.length === 0) return null;
  return { start: m.index, end, card: { main, more } };
}

/** `<details><summary>📊 بطاقة تعريف …</summary>` + table(s) + `</details>`. */
function cardFromDetails(text: string): CardHit | null {
  const m = CARD_DETAILS.exec(text);
  if (!m) return null;
  const end = detailsEnd(text, m.index);
  if (end < 0) return null;
  let inner = text.slice(m.index + m[0].length, end - DETAILS_CLOSE.length);
  let more: LawCardField[] = [];
  const moreHit = MORE_DETAILS.exec(inner);
  if (moreHit) {
    const close = detailsEnd(inner, moreHit.index);
    if (close > 0) {
      more = tableFields(inner.slice(moreHit.index + moreHit[0].length, close));
      inner = inner.slice(0, moreHit.index) + inner.slice(close);
    }
  }
  const main = tableFields(inner);
  if (main.length === 0 && more.length === 0) return null;
  return { start: m.index, end, card: { main, more } };
}

function firstCardFrom(text: string, from: number): CardHit | null {
  const tail = text.slice(from);
  const a = cardFromHeading(tail);
  const b = cardFromDetails(tail);
  const hit = a && b ? (a.start <= b.start ? a : b) : (a ?? b);
  return hit ? { start: hit.start + from, end: hit.end + from, card: hit.card } : null;
}

/**
 * Every card of the preamble, in file order, without overlaps. A few files
 * carry a second card after the first («📊 بطاقة تعريف القرار وبيانات
 * التعديلات»: 5 in last_owner, 2026-10-25). Owner answer ٢٦٠: the card is in
 * the side column only, so the second one is lifted too and its rows join
 * the first card's «المزيد» rows (a row already there, same key and value,
 * is not repeated).
 */
function findCards(text: string): { card: LawMetadataCard; ranges: Range[] } | null {
  const hits: CardHit[] = [];
  for (let hit = firstCardFrom(text, 0); hit; hit = firstCardFrom(text, hit.end)) hits.push(hit);
  if (hits.length === 0) return null;
  const [first, ...others] = hits;
  const more = [...first.card.more];
  const rowId = (f: LawCardField) => `${f.key}\u0000${f.value}`;
  const seen = new Set([...first.card.main, ...more].map(rowId));
  for (const h of others) {
    for (const f of [...h.card.main, ...h.card.more]) {
      if (seen.has(rowId(f))) continue;
      seen.add(rowId(f));
      more.push(f);
    }
  }
  return { card: { main: first.card.main, more }, ranges: hits.map(({ start, end }) => ({ start, end })) };
}

/**
 * Where the identity cards sit in `preamble` (offsets into the text with
 * «\r\n» read as «\n»), the same blocks extractLawPreambleBlocks lifts: for a
 * reader that shows the preamble as it is (a decree's ديباجة).
 */
export function lawCardRanges(preamble: unknown): Array<{ start: number; end: number }> {
  return findCards(normalise(preamble))?.ranges ?? [];
}

// ── The preamble without the lifted blocks ──────────────────────────────────

const SEPARATOR_LINE = /^[ \t]*(?:\*{3,}|-{3,}|_{3,})[ \t]*$/;

/** Removes the ranges and tidies the seams: no leading, trailing or back-to-back `***` rules. */
function withoutRanges(text: string, ranges: Range[]): string {
  if (ranges.length === 0) return text.trim();
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let out = "";
  let at = 0;
  for (const r of sorted) {
    if (r.start < at) {
      at = Math.max(at, r.end);
      continue;
    }
    out += text.slice(at, r.start) + "\n\n";
    at = r.end;
  }
  out += text.slice(at);
  const kept: string[] = [];
  let lastNonBlankIsRule = true; // a rule at the very top is dropped
  for (const line of out.split("\n")) {
    if (SEPARATOR_LINE.test(line)) {
      if (lastNonBlankIsRule) continue;
      lastNonBlankIsRule = true;
    } else if (line.trim() !== "") {
      lastNonBlankIsRule = false;
    }
    kept.push(line);
  }
  while (kept.length && (kept[kept.length - 1].trim() === "" || SEPARATOR_LINE.test(kept[kept.length - 1]))) kept.pop();
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * True when a preamble holds no prose: only title headings (isTitleHeading),
 * `***` rules, `<details>` / `<summary>` wrappers and the files' bare «لم تتوفر
 * ديباجة …» placeholder. After the card and the موجز are lifted out, 274 of
 * the 1,389 last_owner preambles (2026-10-25) are just that (the law's H1 +
 * «## ديباجة النظام» + an empty ديباجة toggle) — a «الديباجة» box that opens
 * on the law's own title. Any other line is prose and keeps the preamble:
 * when in doubt it is kept, since a wrong «hollow» deletes text for the reader.
 */
export function isHollowPreamble(text: unknown): boolean {
  return normalise(text).split("\n").every((line) => {
    const s = line.trim();
    return (
      s === "" ||
      isTitleHeading(s) ||
      SEPARATOR_LINE.test(s) ||
      /^<\/?details[^>]*>$/.test(s) ||
      /^<summary>[^<]*<\/summary>$/.test(s) ||
      // The placeholder alone; «…، وصدرت اللائحة بقرار …» goes on with text.
      /^(?:لم تتوفر ديباجة|لا توجد ديباجة)[^،\n]*$/.test(s)
    );
  });
}

/** Longest heading line read as a bare title (corpus median 38, real titles < 150). */
const TITLE_HEADING_MAX_CHARS = 200;

/**
 * A heading line that is only a title. Some files carry the whole preamble on
 * the H1 line (newlines collapsed: «# نظام البريد --- ## ديباجة النظام
 * <details> … مرسوم ملكي رقم …», ~100 files in last_owner 2026-10-25), so a
 * line with a tag, an inline rule followed by more text, a second heading,
 * a blockquote mark or more than TITLE_HEADING_MAX_CHARS characters is text.
 */
function isTitleHeading(s: string): boolean {
  if (!/^#{1,6}\s/.test(s)) return false;
  if (Array.from(s).length > TITLE_HEADING_MAX_CHARS) return false;
  const body = s.replace(/^#{1,6}\s+/, "");
  return !(
    /<\/?[a-z]/i.test(body) ||
    /(?:^|\s)(?:\*{3,}|-{3,}|_{3,})\s+\S/.test(body) ||
    /(?:^|\s)#{1,6}\s/.test(body) ||
    /(?:^|\s)>\s/.test(body)
  );
}

/**
 * The identity card(s) of a preamble lifted out, and the preamble without
 * them — the موجز (if any) stays where it was. For the regulation part of a
 * merged file (splitStoredPreamble's `regulationPreamble`): its card goes to
 * the sidebar's regulation group (owner note ٠١ item ٥), its ديباجة and
 * موجز stay in the middle column. A preamble with no card comes back as it was.
 */
export function extractLawCard(preamble: unknown): { card: LawMetadataCard | null; rest: string } {
  const text = normalise(preamble);
  const cards = findCards(text);
  if (!cards) return { card: null, rest: typeof preamble === "string" ? preamble : "" };
  return { card: cards.card, rest: withoutRanges(text, cards.ranges) };
}

// ── The pipeline's own notes, wherever they hide ───────────────────────────

/** Tashkeel, superscript alef, tatweel — removed before a note test. */
const NOTE_MARKS = /[ً-ٰٟـ]/g;

/**
 * Words that make a «[…]» aside the export pipeline's note, not law: the
 * owner's own example «[بوابة 6/تحقُّق حي …]» (note ١٢ item ٧), «[تحقق …]»,
 * «[مراجعة …]», «[ملاحظة …]», «[review_…]», «[OCR …]», «[V3.3 …]».
 */
const PIPELINE_NOTE_WORDS = /بوابة\s*[0-9٠-٩]|تحقق|مراجعة|ملاحظة\s+(?:داخلية|تحقق|هيكلية|منهجية)|ملاحظة\s*:|(?<![A-Za-z])(?:review|todo|OCR|pipeline|Gemini|V[0-9]+(?:\.[0-9]+)?)(?![A-Za-z])/iu;

/**
 * Note ١٢ item ٧: a defensive filter so no internal note reaches a reader —
 * a square-bracket aside that holds a pipeline note («[بوابة 6/تحقُّق حي …]»)
 * and any HTML comment. A markdown link «[text](url)» is never touched, nor
 * a bracket of law text («[مُلغاة]», «[1]»). When something is removed, the
 * whitespace left behind is collapsed on each line (line breaks stay);
 * otherwise the input comes back unchanged.
 */
export function stripPipelineNotes(input: string | null | undefined): string {
  const src = String(input ?? "");
  if (!src) return "";
  let s = src.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/\s*\[([^\[\]]*)\](?!\()/g, (all, inner: string) =>
    PIPELINE_NOTE_WORDS.test(inner.replace(NOTE_MARKS, "")) ? "" : all);
  // Nothing removed: the text exactly as it came (callers compare by identity).
  if (s === src) return src;
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]{2,}/g, " ").replace(/\s+([،,.؛;:])/g, "$1").trimEnd())
    .join("\n")
    .trim();
}

// ── The corpus's own audit notes (owner, 2026-11-07, screenshot ٢) ─────────

/**
 * One tashkeel / superscript alef / tatweel mark — NOTE_MARKS without /g.
 * Escaped on purpose: a literal «ً-ٰ» range (U+064B–U+0670) also spans the
 * Arabic-Indic digits ٠-٩ (U+0660–U+0669) and folded dates away (review
 * 2026-11-07).
 */
const NOTE_MARK = /[\u064B-\u065F\u0670\u0640]/;
/** Western, Arabic-Indic and Extended Arabic-Indic digits. */
const AUDIT_DIGIT = "[0-9٠-٩۰-۹]";
/** A full Gregorian ISO date «2026-08-14», in any of the three digit sets. */
const AUDIT_ISO_DATE = `(?:20|٢٠|۲۰)${AUDIT_DIGIT}{2}-${AUDIT_DIGIT}{1,2}-${AUDIT_DIGIT}{1,2}`;
/** One Arabic word, with NOTE_MARKS already folded away. */
const AUDIT_WORD = "[\\u0621-\\u064A]+";
/**
 * M1 — a dated correction «تصحيح 2026-08-14». Gregorian 20xx only: the audit
 * rounds are dated that way, while «تصحيح 1441/3/10هـ» is a real Hijri-dated
 * correction of the law. A bare «تصحيح» is legal vocabulary («تصحيح الخطأ
 * المادي») and is never a marker on its own.
 *
 * BUG-01 (owner package 6-Nov): the export dates its other note labels the
 * same way — «تصحيح مهم 2026-08-14», «تصحيح توثيقي (2026-08-28)», «ملاحظة تحقق
 * 2026-08-14», «ملاحظة (مُنقَّحة 2026-08-14، …)», «ملاحظة هيكلية (تحديث
 * 2026-08-28)». «تصحيح» / «ملاحظة», up to three words and an optional «(»,
 * then a full ISO date (hyphens): a law's «ملاحظة» followed by words and a
 * slash date is not one of them.
 *
 * The live-check notes: «تحقق 2026-08-26», «تحقق حي مباشر بتاريخ …», «تحقق
 * مباشر عبر DOM على البوابة الحية 2026-07-19» (88 articles in the 10-03
 * export). «تحقق» then ONLY words of that note vocabulary, then the ISO date —
 * «يتحقق» / «التحقق» never start it (the letter lookbehind).
 */
const AUDIT_VERIFY_WORDS =
  "حي|الحي|مباشر|مباشرة|مستقل|بصري|مكتمل|كامل|إضافي|اضافي|مطابق|منهما|عبر|على|من|بتاريخ|البوابة|الحية|DOM|BOE";
const AUDIT_DATED_CORRECTION = new RegExp(
  `(?<![\\u0621-\\u064A])(?:تصحيح\\s*(?:20|٢٠|۲۰)${AUDIT_DIGIT}{2}[-/]${AUDIT_DIGIT}{1,2}[-/]${AUDIT_DIGIT}{1,2}` +
    `|(?:تصحيح|ملاحظة)(?:\\s+${AUDIT_WORD}){0,2}\\s*\\(?\\s*(?:${AUDIT_WORD}\\s+)?${AUDIT_ISO_DATE}` +
    `|تحقق(?:\\s+(?:${AUDIT_VERIFY_WORDS}))*\\s*\\(?\\s*${AUDIT_ISO_DATE})`,
);
/**
 * M5 — a reference into the export's issue log: «ف1072», «بف1056»,
 * «ف858/ج-11». Three or four WESTERN digits right after «ف», which starts a
 * word (an optional «ب» / «و» before it), and no letter after them. Not:
 * «ف3» (a paragraph), «الف500» / «يكلف800» (inside a word), and the scanned
 * documents' «في» read as «ف» before an Arabic-Indic date or file number
 * («ف١٤١٥/١٢/٢», «برقم ٧ / ف٢١٥٣٨») — measured on the owner's 10-03 export.
 * Nor a Western-digit date after an OCR «ف» («ف1415/12/2»): a slash then a
 * digit is a date, never an issue ref (final review 2026-11-09, NIT 3).
 */
const AUDIT_ISSUE_REF = "(?<![\\p{L}\\p{N}])[بو]?ف[0-9]{3,4}(?![0-9\\u0621-\\u064A]|/[0-9])";
/**
 * M3 — «سجل المشاكل» as the export's issue log: «راجع سجل المشاكل», or
 * followed by an issue number. «الدروس المستفادة وسجل المشاكل والحلول» (a
 * guide's own wording) is not.
 */
const AUDIT_ISSUE_LOG = `راجع\\s+سجل\\s+المشاكل|سجل\\s+المشاكل(?=\\s*[(\\[«"]?\\s*[بو]?ف\\s*[0-9٠-٩])`;
/**
 * M6 — words no statute uses: «فجوة (ال)تزامن», «لا هلوسة», «تنبيه توثيقي», the
 * export's internal field and task names, the tools its notes name.
 */
const AUDIT_INTERNAL_WORDS =
  "فجوة\\s+(?:ال)?تزامن|فجوة(?:\\s+[^\\s:*]+){0,4}?\\s+محسومة|لا\\s+هلوسة|تنبيه\\s+توثيقي" +
  "|(?<![A-Za-z_])(?:review_reason|editorial_notes|needs_human_review|WebSearch|PyMuPDF|qanoniah|AMENDMENT_QUEUE|GetViewerImage|regapis)(?![A-Za-z_])" +
  "|(?<![A-Za-z0-9])task_[0-9a-f]{6,}";
/**
 * M1, M3, M4 «نفس نمط الخلل», M5, M6: any one marks text as the corpus's
 * internal audit trail. A bare «ف12» is never a marker. Tested on text with
 * NOTE_MARKS folded away. No /g: reused with .test().
 */
const AUDIT_NOTE_MARKERS = new RegExp(
  `${AUDIT_DATED_CORRECTION.source}|${AUDIT_ISSUE_LOG}|نفس\\s+نمط\\s+الخلل|${AUDIT_ISSUE_REF}|${AUDIT_INTERNAL_WORDS}`,
  "u",
);
/**
 * A LABEL that names an editing or verification act («تصحيح …», «ملاحظة تحقق
 * …», «ملاحظة تحرير (استرجاع …)», «ملاحظة هيكلية …») heads a note, whatever
 * follows it.
 */
const AUDIT_NOTE_LABEL = /تصحيح|مصحح|تحقق|تحقيق|تحرير|استرجاع|هيكلي|مطابقة|مصدر|تدقيق|هلوسة|توثيقي|محسوم/;
/**
 * After a dated note LABEL («**تصحيح جوهري (2026-08-28):**»), what makes the
 * rest of the line the note's own body rather than law the label was put in
 * front of: talk of the stored file, its extraction, sources and errors. The
 * one label measured with law after it — «ملاحظة ختامية معدَّلة (2026-08-15،
 * وفق قرار مجلس الوزراء …): تُمنح الفئة (5) …» — has none of these, so only
 * its label goes.
 */
const AUDIT_NOTE_BODY =
  /المخزن|مخزنا|مخزن|هذا الملف|بهذا الملف|من الملف|ملفنا|نسخة سابقة|التفريغ|الاستخراج|استخرج|استرجع|تصحيف|مضاهاة|بصري|صحح|خطأ|الملاحظة السابقة|كان النص|كانت هذه|مكتوبا هنا|مصدر أولي|المصدر الرسمي|PDF|OCR|DOM|ncar|boe|gaca|momah|ncnp|sama\.gov/i;
/**
 * M2 «جولة تدقيق» / «تدقيق منهجي» is also law vocabulary («يتولى الديوان
 * إجراء تدقيق منهجي…»). On its own it marks only an aside; beside M1/M3/M4
 * the piece is already a note.
 */
const AUDIT_ROUND_MARKER = /جولة\s+تدقيق|تدقيق\s+منهجي/;
/** A «(…)» (one nested level), «[…]» (never a markdown link) or «**…**» aside on one line. */
const AUDIT_ASIDE = /\s*(?:\(((?:[^()\n]|\([^()\n]*\))*)\)|\[([^[\]\n]*)\](?!\()|\*\*([^*\n]+)\*\*)/g;
/** Clause boundaries of a summary: « — », « - », «؛», ". ". Captured, so re-joining keeps them. */
const AUDIT_CLAUSE_SPLIT = /(\s+[—–-]\s+|\s*؛\s*|\.\s+)/;
/** What a cut can leave dangling at the end of a line (a «**» or «⚠️» that opened the note too). */
const AUDIT_DANGLING_TAIL = /[\s(\[—–\-،,:؛;"«*_`\p{Extended_Pictographic}\u200d\ufe0f]+$/u;
/** A line a cut left as nothing but marks: «> ⚠️ **», «- », «()», «``». */
const AUDIT_RESIDUE = /^[\s>*_`\-–—•·:،,.؛;()[\]"«»\p{Extended_Pictographic}\u200d\ufe0f]*$/u;
/** A markdown table row: its cells are cleaned one by one, so a note never eats the row. */
const AUDIT_TABLE_ROW = /^\s*\|.*\|\s*$/;
/** A note sentence that is not dated: «تنبيه توثيقي: …». */
const AUDIT_NOTE_SENTENCE = /تنبيه\s+توثيقي/;
/** What may stand before a label that opens its line: quote and list marks, an emoji. */
const AUDIT_LINE_OPENER = /^[\s>*\-•·]*(?:[0-9٠-٩]+[.)-]\s*)?[\p{Extended_Pictographic}\u200d\ufe0f\s]*$/u;
/** A line that a cut left as nothing but a list label: «ب», «2-», «أ)». */
const AUDIT_LIST_LABEL_ONLY = /^[\p{L}\d]{1,3}\s*[-–)]?$/u;

function foldMarks(text: string): string {
  return text.replace(NOTE_MARKS, "");
}

/** M1, M3 or M4 anywhere in `text`. */
function hasAuditMarker(text: string): boolean {
  return AUDIT_NOTE_MARKERS.test(foldMarks(text));
}

/** Any marker, M2 included — the test for an aside, and "is there anything to do". */
function mayHoldAuditNote(text: string): boolean {
  const folded = foldMarks(text);
  return AUDIT_NOTE_MARKERS.test(folded) || AUDIT_ROUND_MARKER.test(folded);
}

/** Index in `line` where `re` first matches the mark-folded text, or -1. */
function foldedMatchAt(line: string, re: RegExp): number {
  const kept: number[] = [];
  let folded = "";
  for (let i = 0; i < line.length; i++) {
    if (NOTE_MARK.test(line[i])) continue;
    kept.push(i);
    folded += line[i];
  }
  const m = re.exec(folded);
  return m ? kept[m.index] : -1;
}

/** Index in `line` where a dated correction (M1) starts, or -1. */
function datedCorrectionAt(line: string): number {
  return foldedMatchAt(line, AUDIT_DATED_CORRECTION);
}

/** Where a note SENTENCE starts inside an aside: M1 or «تنبيه توثيقي» — or -1. */
function noteSentenceAt(text: string): number {
  const hits = [datedCorrectionAt(text), foldedMatchAt(text, AUDIT_NOTE_SENTENCE)].filter((i) => i >= 0);
  return hits.length ? Math.min(...hits) : -1;
}

/** `line` cut where a dated correction starts; a bare list label left behind goes too. */
function cutAtDatedCorrection(line: string, at: number): string {
  const kept = line.slice(0, at).replace(AUDIT_DANGLING_TAIL, "");
  return AUDIT_LIST_LABEL_ONLY.test(kept.trim()) ? "" : kept;
}

/**
 * `strongOnly`: only M1/M3–M6 make an aside a note — the rule for statutory
 * text, where «(… تدقيق منهجي …)» can be law (stripArticleAuditNotes).
 */
function dropAuditAsides(line: string, strongOnly = false): string {
  const isNote = strongOnly ? hasAuditMarker : mayHoldAuditNote;
  return line.replace(AUDIT_ASIDE, (all, paren?: string, bracket?: string, bold?: string) => {
    const inner = paren ?? bracket ?? bold ?? "";
    if (!isNote(inner)) return all;
    // «(أضاف … بالأمر الملكي رقم أ/293 — تصحيح استكمال توثيق 2026-08-26: …)»:
    // the aside is law up to the note — keep that part.
    const at = noteSentenceAt(inner);
    // Only separators trimmed: a closing quote of the law stays.
    const kept = at > 0 ? inner.slice(0, at).replace(/[\s—–\-،,:؛;]+$/, "") : "";
    if (kept.trim().split(/\s+/).length < 3 || hasAuditMarker(kept)) return "";
    const lead = /^\s*/.exec(all)?.[0] ?? "";
    return paren !== undefined ? `${lead}(${kept})` : bracket !== undefined ? `${lead}[${kept}]` : `${lead}**${kept}**`;
  });
}

/**
 * A note's LABEL: a «**…**» / «(…)» / «[…]» aside holding a marker that ends
 * with «:» (inside or right after it) or opens its line — «**تصحيح 2026-08-14
 * (جولة تدقيق منهجي)**: النص …», «**تنبيه توثيقي (لا هلوسة):** …». Its range,
 * with the colon; null when the line has none.
 */
function noteLabelAt(line: string): { start: number; end: number } | null {
  for (const m of line.matchAll(AUDIT_ASIDE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const inner = m[1] ?? m[2] ?? m[3] ?? "";
    if (!hasAuditMarker(inner)) continue;
    const colon = /^\s*:/.exec(line.slice(end));
    if (colon) return { start, end: end + colon[0].length };
    if (/:\s*\]?$/.test(inner) || AUDIT_LINE_OPENER.test(line.slice(0, start))) return { start, end };
  }
  return null;
}

/** A summary line without the clauses that hold a marker; delimiters kept. */
function dropAuditClauses(line: string): string {
  if (!hasAuditMarker(line)) return line;
  const parts = line.split(AUDIT_CLAUSE_SPLIT);
  let out = "";
  for (let i = 0; i < parts.length; i += 2) {
    const piece = parts[i];
    if (hasAuditMarker(piece)) continue;
    out += out ? (parts[i - 1] ?? "") + piece : piece;
  }
  out = out.replace(AUDIT_DANGLING_TAIL, "");
  // «A. note.» → «A.»: the full stop the dropped clause carried goes back.
  if (out && /\.\s*$/.test(line) && !/[.!؟?]$/.test(out)) out += ".";
  return out;
}

function tidy(line: string): string {
  return line.replace(/[ \t]{2,}/g, " ").trimEnd();
}

function stripSummaryNotes(text: string): string {
  const out: string[] = [];
  let changed = false;
  // A dated correction (M1) runs to the end of its paragraph.
  let inNote = false;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "") {
      inNote = false;
      out.push(raw);
      continue;
    }
    if (inNote) {
      changed = true;
      continue;
    }
    let line = raw;
    const at = datedCorrectionAt(line);
    if (at >= 0) {
      line = cutAtDatedCorrection(line, at);
      inNote = true;
    }
    line = dropAuditClauses(dropAuditAsides(line));
    if (line === raw) {
      out.push(raw);
      continue;
    }
    changed = true;
    line = tidy(line);
    if (line.trim()) out.push(line);
  }
  if (!changed) return text;
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** One line (or one table cell) of statutory wording without its notes. */
function stripFullTextSegment(raw: string, strongOnly: boolean): string {
  let line = raw;
  // Labels first: dropping one as a plain aside would leave the note's body
  // (and its «سجل المشاكل» would then take the statutory lead with it).
  // A LABEL opens a note: when the rest of the line reads as the note's body
  // (AUDIT_NOTE_BODY), label and body go together; otherwise the label alone.
  const label = noteLabelAt(line);
  if (label) {
    const body = line.slice(label.end);
    line = hasAuditMarker(body) || AUDIT_NOTE_LABEL.test(foldMarks(line.slice(label.start, label.end))) ||
      AUDIT_NOTE_BODY.test(foldMarks(body))
      ? cutAtDatedCorrection(line, label.start)
      : `${line.slice(0, label.start)} ${body.trimStart()}`;
  }
  line = dropAuditAsides(line, strongOnly);
  // A dated correction runs from where it starts to the end of its line.
  const at = datedCorrectionAt(line);
  if (at >= 0) line = cutAtDatedCorrection(line, at);
  // M3–M6 in the line itself, not an aside: the whole line is a note.
  if (hasAuditMarker(line)) line = "";
  return line;
}

function stripFullTextNotes(text: string, strongOnly = false): string {
  const isCandidate = strongOnly ? hasAuditMarker : mayHoldAuditNote;
  const out: string[] = [];
  let changed = false;
  for (const raw of text.split(/\r?\n/)) {
    if (!isCandidate(raw)) {
      out.push(raw);
      continue;
    }
    let line: string;
    if (AUDIT_TABLE_ROW.test(raw)) {
      let emptied = false;
      line = raw
        .split("|")
        .map((cell, i, cells) => {
          if (i === 0 || i === cells.length - 1 || !isCandidate(cell)) return cell;
          const kept = stripFullTextSegment(cell, strongOnly).trim();
          if (!kept || AUDIT_RESIDUE.test(kept)) emptied = true;
          return ` ${kept} `;
        })
        .join("|");
      // A row whose cell was nothing but a note («| **✅ تكرار محتوى مؤكَّد** | مقارنة … |») is the note's row.
      if (emptied) line = "";
    } else {
      line = stripFullTextSegment(raw, strongOnly);
    }
    if (line === raw) {
      out.push(raw);
      continue;
    }
    changed = true;
    const kept = tidy(line);
    if (kept.trim() && !AUDIT_RESIDUE.test(kept)) out.push(kept);
  }
  if (!changed) return text;
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Owner 2026-11-07 (screenshot ٢): the corpus carries its own audit trail —
 * «تصحيح 2026-08-14 (جولة تدقيق منهجي): … راجع سجل المشاكل ف1072.» — in
 * amendment rows, and «الإصدارات السابقة» showed it to the public.
 *
 * Markers: M1 a dated «تصحيح 20xx-MM-DD», M3 «سجل المشاكل», M4 «نفس نمط
 * الخلل»; M2 «جولة تدقيق» / «تدقيق منهجي» only inside an aside.
 *
 * `summary` mode (an amendment's summary): a dated correction is cut from
 * where it starts to the end of its paragraph; otherwise the clauses (split on
 * line breaks, « — », «؛», ". ") and the «(…)» / «[…]» / «**…**» asides that
 * hold a marker are dropped. May return "".
 *
 * `fullText` mode (statutory wording): a dated correction is cut to the end
 * of its line; a line holding M3/M4 is dropped whole; asides holding a marker
 * are dropped. Nothing else is touched.
 *
 * stripPipelineNotes runs first in both modes. Text with nothing removed comes
 * back exactly as stripPipelineNotes returns it.
 */
export function stripAuditNotes(input: string | null | undefined, mode: "summary" | "fullText"): string {
  const text = stripPipelineNotes(input);
  if (!text || !mayHoldAuditNote(text)) return text;
  return mode === "summary" ? stripSummaryNotes(text) : stripFullTextNotes(text);
}

/**
 * BUG-01 (owner package 6-Nov): the same audit notes in text a reader sees AS
 * the article — `text`, `original_text` (a repealed article's body),
 * regulation text, historic regulation text. `fullText` rules, two
 * differences:
 * - stripPipelineNotes is NOT run (feee72fe): its «[…تحقق…]» / «[مراجعة …]»
 *   aside rule was never cleared for statutory bodies;
 * - «جولة تدقيق» / «تدقيق منهجي» never remove anything on their own, inside an
 *   aside or not — this is statutory text, where they can be law.
 * Text holding no M1/M3–M6 marker comes back as it was (the same string).
 */
export function stripArticleAuditNotes(input: unknown): string {
  const text = typeof input === "string" ? input : input == null ? "" : String(input);
  if (!text || !hasAuditMarker(text)) return text;
  return stripFullTextNotes(text, true);
}

/**
 * The موجز and the identity card of a law's preamble (the law part from
 * splitStoredPreamble — never the regulation preamble), and the preamble
 * without them.
 */
export function extractLawPreambleBlocks(preamble: unknown): LawPreambleBlocks {
  const text = normalise(preamble);
  const summaryHit = findSummary(text);
  const summary = summaryHit ? unquote(summaryHit.body) : "";
  const cards = findCards(text);
  const ranges: Range[] = [];
  if (summaryHit && summary) ranges.push(summaryHit);
  if (cards) ranges.push(...cards.ranges);
  return {
    summary,
    summaryLabel: summary && summaryHit ? summaryHit.label : "",
    metadataCard: cards ? cards.card : null,
    rest: withoutRanges(text, ranges),
  };
}
