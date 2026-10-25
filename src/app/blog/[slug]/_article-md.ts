/**
 * _article-md.ts — the pure parts of the blog article renderer (ArticleView):
 * heading anchors, the in-article TOC and the TOC's active section (N1.6).
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

