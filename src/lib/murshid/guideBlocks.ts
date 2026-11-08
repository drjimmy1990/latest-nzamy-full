/**
 * guideBlocks — «دليل ناجز» (the owner's corrected najiz guide, 2026-10-28)
 * turned into plain blocks the page renders as React text.
 * ─────────────────────────────────────────────────────────────────────────────
 * The guide is Markdown with pipe tables, `> [!WARNING]` callouts and literal
 * `<br>` inside table cells. Nothing here produces HTML: a block is a heading,
 * a paragraph, a list item, a callout, a table or a code block, each carrying
 * strings; `<br>` becomes a line break inside a cell, and any other `<…>` stays
 * visible text. The page never uses dangerouslySetInnerHTML.
 *
 * Which part is shown (extractUserGuide): from «الباب الثاني» (filing steps on
 * najiz) through «الباب الثالث» (all 243 claim types), up to the closing
 * «ملحق معماري للمطورين». The front matter, «الباب الأول» and that appendix
 * are written for the platform's developers — they name source files and
 * propose features — so they are not reader content. Boundaries are found by
 * heading text, not line numbers.
 *
 * Pure, no imports: `node --test` loads it directly, and the client imports
 * parseInline from here (the guide itself is never imported by the client).
 */

export type InlineSegment = { t: "text" | "strong" | "em" | "code"; v: string };

export type GuideBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "item"; ordered: boolean; marker: string; depth: number; text: string }
  | { type: "callout"; kind: string; lines: string[] }
  | { type: "table"; header: string[][]; rows: string[][][] }
  | { type: "code"; text: string };

const START_HEADING = /^##\s+الباب الثاني/;
const END_HEADING = /^##\s+ملحق معماري/;

/** The reader-facing slice of the guide (see the header). */
export function extractUserGuide(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let body = 0;
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (close > 0) body = close + 1;
  }
  const startAt = lines.findIndex((l, i) => i >= body && START_HEADING.test(l));
  const from = startAt === -1 ? body : startAt;
  const endAt = lines.findIndex((l, i) => i > from && END_HEADING.test(l));
  return lines.slice(from, endAt === -1 ? lines.length : endAt).join("\n").trim();
}

const BR = /<br\s*\/?>/gi;

/** A table cell → its lines (`<br>` splits; surrounding spaces trimmed). */
function cellLines(cell: string): string[] {
  return cell
    .split(BR)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|");
}

const ALIGN_ROW = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const LIST_ITEM = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const CALLOUT_KIND = /^\[!(\w+)\]\s*(.*)$/;

/** Markdown → blocks. Unknown syntax falls through as paragraph text. */
export function parseGuideBlocks(md: string): GuideBlock[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: GuideBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "paragraph", text: para.join(" ").replace(BR, " ").trim() });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (t === "") { flush(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); continue; }

    if (t.startsWith("```")) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }

    const h = HEADING.exec(t);
    if (h) {
      flush();
      blocks.push({ type: "heading", level: h[1].length, text: h[2].replace(/\s+#+\s*$/, "").trim() });
      continue;
    }

    if (t.startsWith("|")) {
      flush();
      const rowsRaw: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rowsRaw.push(lines[i++].trim());
      i--;
      const hasAlign = rowsRaw.length > 1 && ALIGN_ROW.test(rowsRaw[1]);
      const header = hasAlign ? splitRow(rowsRaw[0]).map(cellLines) : [];
      const body = rowsRaw.slice(hasAlign ? 2 : 0).filter((r) => !ALIGN_ROW.test(r));
      blocks.push({ type: "table", header, rows: body.map((r) => splitRow(r).map(cellLines)) });
      continue;
    }

    if (t.startsWith(">")) {
      flush();
      const raw: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        raw.push(lines[i++].trim().replace(/^>\s?/, ""));
      }
      i--;
      let kind = "note";
      const first = CALLOUT_KIND.exec(raw[0] ?? "");
      if (first) {
        kind = first[1].toLowerCase();
        raw[0] = first[2];
      }
      const content = raw.flatMap((l) => l.split(BR)).map((l) => l.trim()).filter(Boolean);
      blocks.push({ type: "callout", kind, lines: content });
      continue;
    }

    const li = LIST_ITEM.exec(line);
    if (li) {
      flush();
      const indent = li[1].replace(/\t/g, "  ").length;
      blocks.push({
        type: "item",
        ordered: /\d/.test(li[2]),
        marker: /\d/.test(li[2]) ? li[2].replace(")", ".") : "•",
        depth: Math.min(3, Math.floor(indent / 2)),
        text: li[3].replace(BR, " ").trim(),
      });
      continue;
    }

    para.push(t);
  }
  flush();
  return blocks;
}

const INLINE = /(`[^`]+`)|(\*\*(.+?)\*\*)|(\*([^*\s][^*]*?)\*)/g;

/**
 * Inline emphasis → segments (bold, italic, code); marks that do not pair stay
 * as typed. The result is rendered with <strong>/<em>/<code> elements holding
 * text — never as HTML.
 */
export function parseInline(text: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  let last = 0;
  INLINE.lastIndex = 0;
  for (let m = INLINE.exec(text); m; m = INLINE.exec(text)) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1]) out.push({ t: "code", v: m[1].slice(1, -1) });
    else if (m[2]) out.push({ t: "strong", v: m[3].replace(/(^|[^*])\*(?!\*)/g, "$1").replace(/`/g, "") });
    else out.push({ t: "em", v: (m[5] ?? "").replace(/`/g, "") });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out.filter((s) => s.v.length > 0);
}

/** Plain text of a string (marks removed) — what the guide filter searches. */
export function plainText(text: string): string {
  return parseInline(text).map((s) => s.v).join("");
}

// ─── Internal research / audit notes (controller ruling, batch 2026-11-08) ────
//
// The owner's guide still carries the notes of whoever verified it: which
// "library on the Mac" an article was or was not found in, what "the library
// agent" said, which raw file had a typo, which figure is a "secondary
// source". None of that is reader content and none of it may reach the page.
// Removed at import (scripts/murshid-import.mjs) and again when served.
//
// The unit removed is a whole line — a paragraph line, a list item, a callout
// line — or, inside a table cell, one `<br>`-separated segment (so a claim
// type's row stays and only the note inside its cell goes). A callout left
// with nothing but its `[!NOTE]` marker goes too. Nothing is reworded.

/** Phrases that mark an internal note wherever they appear (explicit list). */
export const INTERNAL_NOTE_PHRASES: readonly string[] = [
  "مكتبة الماك",
  "أيجنت المكتبة",
  "لم تصلنا",
  "غير موثق بنص حرفي",
  "غير موثقة بنص حرفي",
  "غير موثقين بنص حرفي",
  "غير موثق في المكتبة",
  "فحص نصي",
  "فحص المكتبة",
  "ملف المكتبة",
  "الملف الخام",
  "مصدر ثانوي",
  "تنبيه تدقيقي",
  "للمطورين",
];

/**
 * The general pattern: the agent, the internal library or its file ids, raw
 * files, secondary-source tags, developer notes and TODOs, code paths.
 */
export const INTERNAL_NOTE_PATTERN =
  /أيجنت|ايجنت|(?:^|[\s(«])(?:في |من |ب)?المكتبة(?=[\s،.:؛)»]|$)|LAW-\d|غير موثق[ةين]*\s+(?:بنص|في)|مصادر? (?:ثانوي|الويب)|\bTODO\b|\bFIXME\b|المطور(?:ين|ون)?(?=[\s،.:؛)»]|$)|nzamy|`?src\/|\.tsx?\b|المجلس الاستشاري/i;

export function isInternalNote(text: string): boolean {
  return INTERNAL_NOTE_PHRASES.some((p) => text.includes(p)) || INTERNAL_NOTE_PATTERN.test(text);
}

const BR_SPLIT = /(<br\s*\/?>)/i;

/** The guide without its internal notes, and every removed line or segment. */
export function stripInternalNotes(md: string): { md: string; removed: string[] } {
  const removed: string[] = [];
  const kept: string[] = [];
  for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
    const t = line.trim();
    if (t.startsWith("|")) {
      // Table row: drop note segments inside cells, keep the row and its cells.
      const cells = line.split("|");
      const next = cells.map((cell) => {
        const parts = cell.split(BR_SPLIT);
        const segs: string[] = [];
        for (let i = 0; i < parts.length; i += 2) segs.push(parts[i]);
        const keep = segs.filter((s) => {
          if (s.trim() && isInternalNote(s)) {
            removed.push(s.trim());
            return false;
          }
          return true;
        });
        if (keep.length === segs.length) return cell;
        const joined = keep.map((s) => s.trim()).filter(Boolean).join("<br>");
        return ` ${joined} `;
      });
      kept.push(next.join("|"));
      continue;
    }
    if (t && isInternalNote(t)) {
      removed.push(t);
      continue;
    }
    kept.push(line);
  }
  // A callout whose content lines were all removed leaves `> [!KIND]` (and
  // perhaps bare `>` lines) behind: drop that shell.
  const out: string[] = [];
  for (let i = 0; i < kept.length; i++) {
    if (/^\s*>/.test(kept[i])) {
      let j = i;
      while (j < kept.length && /^\s*>/.test(kept[j])) j++;
      const group = kept.slice(i, j);
      const hasContent = group.some((l) => l.replace(/^\s*>\s?/, "").replace(/^\[!\w+\]\s*/, "").trim().length > 0);
      if (hasContent) out.push(...group);
      i = j - 1;
      continue;
    }
    out.push(kept[i]);
  }
  return { md: out.join("\n").replace(/\n{3,}/g, "\n\n"), removed };
}
