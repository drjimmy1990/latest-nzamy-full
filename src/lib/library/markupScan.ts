/**
 * markupScan.ts — counts the raw markup left in a library document's text
 * (owner file 03 L9 (ب): «فحص آلي على كل الملفات يعدّ كل ملف فيه <details> أو
 * ### أو |---| أو ** أو سطر رقمي وحيد في أول المتن، ويرسل الجرد للمالك»).
 *
 * Pure and read-only: it counts, it never changes a word. The CLI
 * (scripts/library-markup-scan.mjs) feeds it the owner's .md files or rows
 * read from the live tables, and writes a TSV and the worst 50.
 *
 * What is counted, per document:
 *   details      `<details` tags
 *   summary      `<summary` tags
 *   h3           lines starting with `###` (and deeper)
 *   bold         `**` pairs (a run of two asterisks counts once per pair)
 *   tableSep     table separator rows `| --- |`
 *   quote        lines starting with `>`
 *   numericFirst 1 when the first non-empty line is only digits («٦٠٩٦٠٩»)
 *   repeatedHeading  heading lines (Markdown `#`) that appear more than once
 *   articleTwice     article labels («المادة الأولى», «المادة 5») that open
 *                    two lines followed by different text (lib07: page 1 and
 *                    page 2 both «المادة الأولى» with two texts)
 *
 * Pure (no imports): `node --test` runs markupScan.test.ts.
 */

export interface MarkupCounts {
  details: number;
  summary: number;
  h3: number;
  bold: number;
  tableSep: number;
  quote: number;
  numericFirst: number;
  repeatedHeading: number;
  articleTwice: number;
}

export const MARKUP_COLUMNS: readonly (keyof MarkupCounts)[] = [
  "details", "summary", "h3", "bold", "tableSep", "quote", "numericFirst", "repeatedHeading", "articleTwice",
];

function count(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

/** «المادة الأولى:» / «المادة (5) :» / «### المادة 12» at a line start → the label, normalised. */
const ARTICLE_LINE_RE = /^[\s#>*_]*(المادة\s*\(?\s*[^\s:()]+(?:\s+(?:عشرة|عشر|والعشرون|والثلاثون|والأربعون|والخمسون|والستون|والسبعون|والثمانون|والتسعون|بعد\s+المائة|بعد\s+المئة))*\s*\)?)\s*[:：-]?\s*(.*)$/;

export function scanMarkup(input: unknown): MarkupCounts {
  const text = typeof input === "string" ? input.replace(/\r\n?/g, "\n") : "";
  const lines = text.split("\n");
  const firstLine = lines.find((l) => l.trim() !== "") ?? "";
  const headingSeen = new Map<string, number>();
  const articleBodies = new Map<string, Set<string>>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = /^\s*#{1,6}\s+(.+?)\s*$/.exec(line);
    if (h) headingSeen.set(h[1], (headingSeen.get(h[1]) ?? 0) + 1);
    const a = ARTICLE_LINE_RE.exec(line);
    if (a) {
      const label = a[1].replace(/[()\s]+/g, " ").trim();
      // The article's opening words: the rest of the line, else the next non-empty line.
      let body = a[2].trim();
      for (let j = i + 1; !body && j < lines.length && j < i + 4; j++) body = lines[j].trim();
      body = body.replace(/[*_#>`]/g, "").replace(/\s+/g, " ").slice(0, 60);
      if (body) {
        if (!articleBodies.has(label)) articleBodies.set(label, new Set());
        articleBodies.get(label)!.add(body);
      }
    }
  }
  let repeatedHeading = 0;
  for (const n of headingSeen.values()) if (n > 1) repeatedHeading += n - 1;
  let articleTwice = 0;
  for (const bodies of articleBodies.values()) if (bodies.size > 1) articleTwice += 1;
  return {
    details: count(text, /<details\b/gi),
    summary: count(text, /<summary\b/gi),
    h3: count(text, /^[ \t>]*#{3,6}[ \t]/gm),
    bold: Math.floor(count(text, /\*\*/g) / 2),
    tableSep: count(text, /^[ \t]*\|[ \t:|-]*-{3,}[ \t:|-]*\|?[ \t]*$/gm),
    quote: count(text, /^[ \t]*>/gm),
    numericFirst: /^[\s*_#>]*[0-9٠-٩۰-۹]+[\s*_]*$/.test(firstLine) ? 1 : 0,
    repeatedHeading,
    articleTwice,
  };
}

/** The sum of every count: the row's place in «the worst 50». */
export function markupScore(c: MarkupCounts): number {
  return MARKUP_COLUMNS.reduce((sum, k) => sum + c[k], 0);
}

export function addCounts(a: MarkupCounts, b: MarkupCounts): MarkupCounts {
  const out = { ...a };
  for (const k of MARKUP_COLUMNS) out[k] = a[k] + b[k];
  return out;
}

export function emptyCounts(): MarkupCounts {
  return { details: 0, summary: 0, h3: 0, bold: 0, tableSep: 0, quote: 0, numericFirst: 0, repeatedHeading: 0, articleTwice: 0 };
}

export interface ScanRow {
  /** «file», «laws.preamble», «articles.text» … */
  source: string;
  /** A path, a slug or an id — never text. */
  id: string;
  counts: MarkupCounts;
}

/** A TSV cell: tabs and line breaks become spaces. */
function cell(v: unknown): string {
  return String(v ?? "").replace(/[\t\r\n]+/g, " ");
}

export function scanTsv(rows: readonly ScanRow[]): string {
  const head = ["source", "id", ...MARKUP_COLUMNS, "score"].join("\t");
  const body = rows.map((r) => [cell(r.source), cell(r.id), ...MARKUP_COLUMNS.map((k) => r.counts[k]), markupScore(r.counts)].join("\t"));
  return [head, ...body].join("\n") + "\n";
}

/** Rows with any markup, worst first (score, then id), at most `n`. */
export function worstRows(rows: readonly ScanRow[], n = 50): ScanRow[] {
  return rows
    .filter((r) => markupScore(r.counts) > 0)
    .slice()
    .sort((a, b) => markupScore(b.counts) - markupScore(a.counts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, n);
}

/** One line per column: how many documents carry it, and how many times in all. */
export function scanSummary(rows: readonly ScanRow[]): string {
  const lines = [`documents scanned: ${rows.length}`, `documents with any markup: ${rows.filter((r) => markupScore(r.counts) > 0).length}`];
  for (const k of MARKUP_COLUMNS) {
    const docs = rows.filter((r) => r.counts[k] > 0).length;
    const total = rows.reduce((s, r) => s + r.counts[k], 0);
    lines.push(`${k}: ${docs} documents, ${total} in all`);
  }
  return lines.join("\n") + "\n";
}
