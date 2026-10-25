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
