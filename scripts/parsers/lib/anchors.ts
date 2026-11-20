/**
 * anchors.ts — the anchor gate (owner's library-agent package of 19 Nov, items
 * 1.4 and 4.3 of the l10 gap check).
 *
 * Every parser reads its anchors with a one-line regex such as
 * `/<!--\s*ARTICLE_START\s+(.*?)\s*-->/` — `.` does not cross a line break and
 * the match stops at the first `-->`. So an anchor whose JSON spans two lines
 * was not seen at all (the article and its text vanished, with no report), and
 * a `-->` written inside a JSON value cut the JSON short (the article was
 * dropped with only a console warning).
 *
 * This module does two things, both pure:
 *   1. `prepareAnchors` rewrites ONLY such anchors to one line, and lists each
 *      one it rewrote. Whitespace outside JSON strings collapses to one space;
 *      a `>` that closes a `-->` inside a JSON string is written `>`,
 *      which JSON.parse reads back as the same `>`. Nothing else in the
 *      anchor changes, every other anchor and every other comment
 *      (PDF_PAGE_BREAK, ARTICLE_END, …) stays byte-identical.
 *   2. It counts, per kind, the openers in the body and how many of them the
 *      parser's own regex can read with JSON that parses to an object, and
 *      lists every one it cannot read. The parser compares the openers with
 *      what it actually produced; any shortfall goes to the same list, which
 *      gates the run.
 */

export const ANCHOR_KINDS = [
  "ARTICLE_START",
  "CHAPTER_START",
  "AMENDMENT",
  "REGULATION",
  "ATTACHED_REGULATION",
  "PRINCIPLE_START",
] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

/**
 * The whitespace the parser's regex requires between the keyword and the JSON.
 * PRINCIPLE_START is read with `\s*` (parse-precedents.ts: 0, 1 or 2 spaces in
 * the source); every other kind with `\s+`.
 */
const LOOSE_KINDS: ReadonlySet<AnchorKind> = new Set(["PRINCIPLE_START"]);

/** Longest JSON the joiner will scan for one anchor (a guard against a missing `}`). */
const MAX_ANCHOR_JSON = 20_000;

/** An opener exactly as the parser's regex starts a match (`AMENDMENTS`, `REGULATION_END`, `ARTICLE_START:` are not). */
function openerSource(kind: AnchorKind): string {
  return LOOSE_KINDS.has(kind) ? `<!--\\s*${kind}(?![A-Za-z0-9_])` : `<!--\\s*${kind}(?=\\s)`;
}

/** The parser's own one-line read of an anchor, anchored at an opener. */
function lineReadRe(kind: AnchorKind): RegExp {
  return new RegExp(`<!--\\s*${kind}${LOOSE_KINDS.has(kind) ? "\\s*" : "\\s+"}(.*?)\\s*-->`, "y");
}

export interface AnchorJoin {
  kind: AnchorKind;
  /** 1-based line of the opener in the body as written. */
  line: number;
  /** How many source lines the anchor spanned. */
  lines: number;
  /** How many `-->` inside JSON strings were written with `>`. */
  arrowsEscaped: number;
}

export interface AnchorProblem {
  kind: AnchorKind;
  /** 1-based line of the opener in the body as written. */
  line: number;
  reason: string;
}

export interface AnchorCount {
  /** Openers in the body. */
  openers: number;
  /** Openers the parser's one-line regex reads, with JSON that parses to an object. */
  readable: number;
}

export interface PreparedAnchors {
  /** The body with the listed anchors on one line; identical to the input when `joins` is empty. */
  body: string;
  joins: AnchorJoin[];
  counts: Record<AnchorKind, AnchorCount>;
  problems: AnchorProblem[];
}

const isWs = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v";

/** Collapses a whitespace run to one space when it holds a line break; otherwise keeps it. */
function oneLineWs(ws: string): string {
  return /[\r\n]/.test(ws) ? " " : ws;
}

/**
 * Scans the JSON object that starts at `start` (a `{`). Returns its one-line
 * form and where it ends, or null when it does not close before the guard, a
 * raw line break sits inside a string (invalid JSON; never guessed), or a new
 * comment opens outside a string.
 */
function scanJsonObject(text: string, start: number): { end: number; oneLine: string; arrows: number; changed: boolean } | null {
  let depth = 0;
  let inString = false;
  let out = "";
  let arrows = 0;
  let changed = false;
  let i = start;
  const limit = Math.min(text.length, start + MAX_ANCHOR_JSON);
  while (i < limit) {
    const c = text[i];
    if (inString) {
      if (c === "\\") {
        out += c + (text[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (c === "\n" || c === "\r") return null;
      if (c === '"') inString = false;
      if (c === ">" && text[i - 1] === "-" && text[i - 2] === "-") {
        out += "\\u003e";
        arrows++;
        changed = true;
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (isWs(c)) {
      let j = i;
      while (j < limit && isWs(text[j])) j++;
      const ws = text.slice(i, j);
      const w = oneLineWs(ws);
      if (w !== ws) changed = true;
      out += w;
      i = j;
      continue;
    }
    if (c === "<" && text.startsWith("<!--", i)) return null;
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return { end: i + 1, oneLine: out + c, arrows, changed };
      if (depth < 0) return null;
    }
    out += c;
    i++;
  }
  return null;
}

function lineAt(text: string, index: number, cache: { index: number; line: number }): number {
  // Openers are visited in order, so count forward from the last position.
  let line = cache.line;
  for (let i = cache.index; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  cache.index = index;
  cache.line = line;
  return line;
}

/**
 * Rewrites the anchors of `kinds` that span lines (or hold `-->` inside a JSON
 * string) to one line, then counts and checks every opener of `kinds`.
 */
export function prepareAnchors(body: string, kinds: readonly AnchorKind[]): PreparedAnchors {
  const counts = Object.fromEntries(ANCHOR_KINDS.map((k) => [k, { openers: 0, readable: 0 }])) as Record<AnchorKind, AnchorCount>;
  const joins: AnchorJoin[] = [];
  const problems: AnchorProblem[] = [];
  if (kinds.length === 0) return { body, joins, counts, problems };

  const opener = new RegExp(kinds.map((k) => `(${openerSource(k)})`).join("|"), "g");
  const kindOf = (m: RegExpExecArray): AnchorKind => kinds[m.slice(1).findIndex((g) => g !== undefined)];

  // ── Pass 1: join ─────────────────────────────────────────────────────────
  // `lineOfOut` maps an opener's offset in the output back to its
  // source line, so every report names the line the author sees.
  const pieces: string[] = [];
  const lineOfOut = new Map<number, number>();
  let outLen = 0;
  let cursor = 0;
  const lineCache = { index: 0, line: 1 };
  let m: RegExpExecArray | null;
  opener.lastIndex = 0;
  while ((m = opener.exec(body)) !== null) {
    const kind = kindOf(m);
    const line = lineAt(body, m.index, lineCache);
    const afterKeyword = m.index + m[0].length;
    let q = afterKeyword;
    while (q < body.length && isWs(body[q])) q++;
    let replaced: { end: number; text: string; join: AnchorJoin } | null = null;
    if (body[q] === "{") {
      const json = scanJsonObject(body, q);
      if (json) {
        let k = json.end;
        while (k < body.length && isWs(body[k])) k++;
        if (body.startsWith("-->", k)) {
          const end = k + 3;
          const segment = body.slice(m.index, end);
          const head = body.slice(m.index, afterKeyword); // `<!--` + spaces + keyword
          const gapBefore = body.slice(afterKeyword, q);
          const gapAfter = body.slice(json.end, k);
          const headOne = head.replace(/\s+/g, (ws) => oneLineWs(ws));
          const text = `${headOne}${oneLineWs(gapBefore)}${json.oneLine}${oneLineWs(gapAfter)}-->`;
          if (text !== segment && (json.changed || /[\r\n]/.test(segment))) {
            replaced = {
              end,
              text,
              join: { kind, line, lines: (segment.match(/\n/g)?.length ?? 0) + 1, arrowsEscaped: json.arrows },
            };
          }
        }
      }
    }
    pieces.push(body.slice(cursor, m.index));
    outLen += m.index - cursor;
    lineOfOut.set(outLen, line);
    if (replaced) {
      pieces.push(replaced.text);
      outLen += replaced.text.length;
      cursor = replaced.end;
      joins.push(replaced.join);
      opener.lastIndex = replaced.end;
    } else {
      cursor = m.index;
      opener.lastIndex = afterKeyword;
    }
  }
  pieces.push(body.slice(cursor));
  const out = joins.length ? pieces.join("") : body;

  // ── Pass 2: count and check, on what the parser will read ────────────────
  opener.lastIndex = 0;
  while ((m = opener.exec(out)) !== null) {
    const kind = kindOf(m);
    // An opener the join pass never visited (it sat inside a rewritten anchor's
    // JSON string) has no source line of its own: name the output line.
    const line = lineOfOut.get(m.index) ?? lineAt(out, m.index, { index: 0, line: 1 });
    counts[kind].openers++;
    const read = lineReadRe(kind);
    read.lastIndex = m.index;
    const r = read.exec(out);
    if (!r) {
      problems.push({ kind, line, reason: "the anchor is not closed by «-->» and its JSON could not be joined to one line — the parser does not see it" });
      continue;
    }
    const content = r[1];
    if (!content) {
      problems.push({ kind, line, reason: "the anchor has no JSON" });
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch (e) {
      problems.push({ kind, line, reason: `the JSON does not parse (${(e as Error).message})` });
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      problems.push({ kind, line, reason: "the JSON is not an object" });
      continue;
    }
    counts[kind].readable++;
  }
  return { body: out, joins, counts, problems };
}

/** How many lines precede the body in the file (the frontmatter), so a body line becomes a file line. */
export function bodyLineOffset(rawLf: string, body: string): number {
  if (!body || !rawLf.endsWith(body)) return 0;
  const head = rawLf.slice(0, rawLf.length - body.length);
  return head.match(/\n/g)?.length ?? 0;
}

/** Report lines for one file (`where` = its base name). */
export function formatAnchorJoins(where: string, joins: readonly AnchorJoin[], lineOffset = 0): string[] {
  return joins.map((j) => {
    const parts: string[] = [];
    if (j.lines > 1) parts.push(`joined ${j.lines} lines into one`);
    if (j.arrowsEscaped > 0) parts.push(`${j.arrowsEscaped} «-->» inside the JSON written as \\u003e`);
    return `${where}:${j.line + lineOffset} — ${j.kind} anchor ${parts.join("; ")}`;
  });
}

export function formatAnchorProblems(where: string, problems: readonly AnchorProblem[], lineOffset = 0): string[] {
  return problems.map((p) => `${where}:${p.line + lineOffset} — ${p.kind}: ${p.reason}`);
}

/**
 * One line when the parser produced fewer items of `kind` than the body has
 * openers (an anchor lost), or more (an item counted twice); null when equal.
 */
export function anchorShortfall(where: string, kind: AnchorKind, openers: number, parsed: number): string | null {
  if (openers === parsed) return null;
  return parsed < openers
    ? `${where} — ${kind}: ${openers} in the source, ${parsed} parsed (${openers - parsed} lost)`
    : `${where} — ${kind}: ${openers} in the source, ${parsed} parsed (${parsed - openers} more than written)`;
}

/**
 * Item 4.3: the frontmatter `total_articles` against the anchors and the parse.
 * Informational: the site shows the parsed count, never the header. Null when
 * the header is absent / not a number, or matches the parsed count.
 */
export function totalArticlesMismatch(where: string, header: unknown, openers: number, parsed: number): string | null {
  if (header === null || header === undefined || header === "") return null;
  const n = typeof header === "number" ? header : Number(String(header).trim());
  if (!Number.isFinite(n)) return null;
  if (n === parsed) return null;
  return `${where} — total_articles ${n} in the frontmatter / ${openers} ARTICLE_START in the source / ${parsed} parsed`;
}
