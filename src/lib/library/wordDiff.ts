/**
 * wordDiff — the word-level diff behind «إظهار الفروق الملونة» inside an
 * amended article's «الإصدارات السابقة» (owner note ١٢ §٣, 2026-10-30).
 * ─────────────────────────────────────────────────────────────────────────────
 * Computed in the browser between a previous version (`fullText` of an
 * amendment card) and the article's current text — no table, no migration.
 * Deleted words are red, added words green (the reader renders the runs).
 *
 *   - Tokens are words and line breaks; runs of spaces are not compared, so a
 *     re-wrapped paragraph is not a change. A line break is its own token.
 *   - Words compare with harakat and tatweel dropped: a version that only adds
 *     a shadda is not shown as a rewritten word.
 *   - Classic LCS on the tokens, after trimming the common head and tail. The
 *     middle is bounded: past MAX_DIFF_CELLS (n × m) the diff is not computed
 *     and the caller shows the two texts plainly — a 4,000-word schedule must
 *     not freeze the reader.
 *   - The runs join back to the two texts (equal + del = old, equal + add =
 *     new, up to whitespace).
 *
 * diffSourceText() cleans a stored article text first: an embedded
 * `<details>` block (the parser keeps the pre-amendment wording there) would
 * otherwise show up as a huge deletion, and markdown marks are not words.
 *
 * Pure, no imports: `node --test` loads it directly.
 */

export type DiffOp = "equal" | "del" | "add";

export interface DiffRun {
  op: DiffOp;
  text: string;
}

export interface WordDiff {
  runs: DiffRun[];
  /** Words only in the old text. */
  removed: number;
  /** Words only in the new text. */
  added: number;
}

/** The largest LCS table we fill (old middle × new middle tokens). */
export const MAX_DIFF_CELLS = 2_500_000;

const HARAKAT_TATWEEL = /[ً-ْٰـ]/g;
/** The parser's «[معدّلة]» / «(معدلة)» status token (any harakat) — a label, not a word of the law. */
const AMENDED_MARKER = /[[(]\s*م[ً-ْٰ]*ع[ً-ْٰ]*د[ً-ْٰ]*ل[ً-ْٰ]*ة[ً-ْٰ]*\s*[\])]/gu;

/** The article text as words to compare: no <details> history, no markdown marks or status labels. */
export function diffSourceText(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/<details[\s\S]*?<\/details>/gi, " ")
    .replace(/<\/?(?:details|summary)[^>]*>/gi, " ")
    .replace(/\*\*|__|`/g, "")
    .replace(AMENDED_MARKER, " ")
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?)/gm, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Words and line breaks, in order. */
export function tokenizeWords(text: string): string[] {
  return String(text ?? "").match(/\n|[^\s]+/g) ?? [];
}

function key(token: string): string {
  return token === "\n" ? "\n" : token.replace(HARAKAT_TATWEEL, "");
}

interface Tok {
  op: DiffOp;
  tok: string;
}

/** Join tokens: a space between two words, none around a line break. */
function joinRuns(toks: Tok[]): DiffRun[] {
  const runs: DiffRun[] = [];
  const push = (op: DiffOp, text: string) => {
    const last = runs[runs.length - 1];
    if (last && last.op === op) last.text += text;
    else runs.push({ op, text });
  };
  toks.forEach((t, i) => {
    const prev = toks[i - 1];
    if (prev && prev.tok !== "\n" && t.tok !== "\n") {
      // The space between two words belongs to a run only when both sides are in it.
      push(prev.op === t.op ? t.op : "equal", " ");
    }
    push(t.op, t.tok);
  });
  return runs;
}

/**
 * Word diff of `oldText` → `newText` (both raw; clean them with diffSourceText
 * first). Returns null when the texts are too long to diff in the browser.
 */
export function diffWords(oldText: string, newText: string, maxCells = MAX_DIFF_CELLS): WordDiff | null {
  const a = tokenizeWords(oldText);
  const b = tokenizeWords(newText);
  const ka = a.map(key);
  const kb = b.map(key);

  let head = 0;
  while (head < a.length && head < b.length && ka[head] === kb[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && ka[a.length - 1 - tail] === kb[b.length - 1 - tail]) tail += 1;

  const n = a.length - head - tail;
  const m = b.length - head - tail;
  if (n * m > maxCells) return null;

  const middle: Tok[] = [];
  if (n === 0 || m === 0) {
    for (let i = 0; i < n; i += 1) middle.push({ op: "del", tok: a[head + i] });
    for (let j = 0; j < m; j += 1) middle.push({ op: "add", tok: b[head + j] });
  } else {
    // dp[i][j] = LCS length of a[head+i..] and b[head+j..] (suffix form, so the walk is forward).
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[i * w + j] = ka[head + i] === kb[head + j]
          ? dp[(i + 1) * w + j + 1] + 1
          : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (ka[head + i] === kb[head + j]) {
        // Equal words keep the NEW spelling (the current text is what is read).
        middle.push({ op: "equal", tok: b[head + j] });
        i += 1;
        j += 1;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
        middle.push({ op: "del", tok: a[head + i] });
        i += 1;
      } else {
        middle.push({ op: "add", tok: b[head + j] });
        j += 1;
      }
    }
    for (; i < n; i += 1) middle.push({ op: "del", tok: a[head + i] });
    for (; j < m; j += 1) middle.push({ op: "add", tok: b[head + j] });
  }

  const toks: Tok[] = [
    ...b.slice(0, head).map((tok) => ({ op: "equal" as const, tok })),
    ...middle,
    ...b.slice(b.length - tail).map((tok) => ({ op: "equal" as const, tok })),
  ];
  const isWord = (t: Tok) => t.tok !== "\n";
  return {
    runs: joinRuns(toks),
    removed: toks.filter((t) => t.op === "del" && isWord(t)).length,
    added: toks.filter((t) => t.op === "add" && isWord(t)).length,
  };
}
