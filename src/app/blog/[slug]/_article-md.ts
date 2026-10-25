/**
 * _article-md.ts — the pure parts of the blog article renderer (ArticleView):
 * heading anchors, the in-article TOC, the TOC's active section (N1.6) and
 * list spacing (N1.7).
 *
 * Pure: no runtime imports, so `node --test` loads it directly
 * (./_article-md.test.ts). ArticleView.tsx itself cannot load under node.
 */

/** Convert heading text to a URL-safe anchor ID (works with Arabic text). */
export function slugify(text: string): string {
  return text
    .trim()
    .replace(/[()（）\[\]「」『』【】،,.:;؛!?؟"'`~@#$%^&*+=<>{}|\\\/]/g, "") // strip punctuation
    .replace(/\s+/g, "-") // spaces → hyphens
    .replace(/-{2,}/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

/**
 * The in-article TOC ships hand-generated anchors, and that generator drops
 * Arabic diacritics ("…بمضي 60 يوماً" → "…-60-يوما") while slugify keeps them,
 * so those links land nowhere. Return the diacritic-free variant so the heading
 * can carry it as a second id — additive, so anchors that already match are
 * untouched.
 */
export function altAnchor(text: string, id: string): string | null {
  const stripped = slugify(text.replace(/[ً-ْـٰ]/g, ""));
  return stripped && stripped !== id ? stripped : null;
}

export interface TocItem { text: string; href: string; }
export interface Toc { items: TocItem[]; start: number; end: number; }

/**
 * Every article in the corpus ships its own "## جدول المحتويات (TOC)" list. On
 * desktop we lift it into the sticky sidebar, so the inline copy is hidden
 * there and shown only on mobile (where the sidebar itself is hidden).
 *
 * Returns the parsed links plus the [start, end) line range of the block, so
 * RenderContent can wrap exactly those lines. `end` swallows the closing `---`
 * when present — otherwise desktop would render two rules back to back with
 * nothing between them.
 *
 * Splits with the same `md.trim().split("\n")` RenderContent uses, so the
 * indices line up.
 */
export function findToc(md: string): Toc | null {
  const lines = md.trim().split("\n");
  const start = lines.findIndex((l) => /^##\s+.*جدول المحتويات/.test(l));
  if (start === -1) return null;

  const items: TocItem[] = [];
  let end = start + 1;
  for (; end < lines.length; end++) {
    if (lines[end].trim() === "") continue;
    const m = /^\s*[-*]\s+\[([^\]]+)\]\(#([^)]+)\)\s*$/.exec(lines[end]);
    if (!m) break;
    items.push({ text: m[1].trim(), href: m[2].trim() });
  }
  if (/^-{3,}$/.test((lines[end] ?? "").trim())) end++;

  return items.length ? { items, start, end } : null;
}

/**
 * N1.6 — the TOC entry to light up, from what an IntersectionObserver reports.
 * `order` is the TOC's own order; `visible` the ids whose heading is inside
 * the reading band right now. The first visible one in TOC order wins; when
 * none is (reading a long section between two headings) the previous entry
 * stays lit. An id the TOC does not list is ignored.
 */
export function nextActiveTocId(order: readonly string[], visible: ReadonlySet<string>, prev: string | null): string | null {
  for (const id of order) if (visible.has(id)) return id;
  return prev !== null && order.includes(prev) ? prev : null;
}

/** A bullet or numbered list line, as RenderContent reads it. */
export function isListLine(line: string | undefined): boolean {
  return line !== undefined && (/^\d+\. /.test(line) || /^(\s*)[-*]\s+/.test(line));
}

/**
 * N1.7 — the bottom margin of list line `i`: tight between items, a paragraph's
 * gap after the last item of a run, so the text that follows does not sit on
 * the list. A blank line ends the run (it renders nothing now).
 */
export function listItemSpacing(lines: readonly string[], i: number): "mb-1.5" | "mb-4" {
  return isListLine(lines[i + 1]) ? "mb-1.5" : "mb-4";
}

/**
 * N1.7 — a line that only RenderContent's default-paragraph branch renders.
 * Conservative on purpose: anything another branch might take (a `#` heading
 * of any level, a `>` quote or callout, a `---` rule, a list line) or a blank
 * line is not prose, so a run never swallows a line that would have rendered
 * as its own block.
 */
export function isProseLine(line: string | undefined): boolean {
  if (line === undefined || line.trim() === "") return false;
  if (line.startsWith("#") || line.startsWith(">")) return false;
  if (/^-{3,}$/.test(line.trim())) return false;
  return !isListLine(line);
}

/**
 * N1.7 — the end (exclusive) of the run of prose lines that starts at
 * `start`, which RenderContent prints as one paragraph with a <br> between its
 * lines. Lines written one under the other with no blank line are one block
 * (a «**س:**» question over its «**ج:**» answer, hard-wrapped prose); a blank
 * line starts a new paragraph. `stopAt` is the TOC's first line, which
 * RenderContent renders as its own unit.
 */
export function proseRunEnd(lines: readonly string[], start: number, stopAt?: number): number {
  let end = start + 1;
  while (end < lines.length && end !== stopAt && isProseLine(lines[end])) end++;
  return end;
}
