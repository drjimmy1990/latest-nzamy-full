/**
 * «مشاركة المادة» (owner package 25-Nov §2.5, batch l16, B-12) — the pure half:
 * the article's direct link, the plain text the image card carries, and the
 * line wrapping the card is drawn with.
 *
 * The card itself is drawn on a canvas in the browser (_article-share.tsx)
 * with the page's own Arabic fonts: canvas `fillText` hands each whole line to
 * the browser's text shaper, so the letters join exactly as on the page
 * (html2canvas, already installed, draws Arabic letter by letter and breaks
 * the joining — it is not used). No new dependency.
 *
 * Wrapping measures each CANDIDATE LINE whole (never the sum of word widths:
 * Arabic shaping changes widths at the joins).
 *
 * Pure, no imports: `node --test` loads it (_share-card.test.ts).
 */

/** The card's size: 4:5, what X, WhatsApp, LinkedIn and Instagram show uncropped. */
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

/** The article's direct link: this page, the article's own anchor (the reader scrolls to it). */
export function articleShareUrl(origin: string, pathname: string, articleId: string): string {
  const base = `${String(origin).replace(/\/+$/, "")}${String(pathname).split(/[?#]/)[0]}`;
  return articleId ? `${base}#${encodeURIComponent(articleId)}` : base;
}

/**
 * The article's text as plain lines for the card: no `<details>` history, no
 * tags, comments, Markdown marks or quote prefixes; blank runs collapsed.
 * The caller passes `stripMarks` (src/lib/text/stripMarkdownMarks) so this
 * file keeps no imports.
 */
export function shareCardText(text: string | null | undefined, stripMarks: (s: string) => string = (s) => s): string {
  const raw = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/<details[\s\S]*?<\/details>/gi, "\n")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/^[ \t]*(?:>[ \t]?)+/gm, "");
  return stripMarks(raw)
    .replace(/\*\*|__|`/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type Measure = (text: string) => number;

/**
 * Lines no wider than `maxWidth` (by `measure`), paragraph breaks kept as an
 * empty line. A single word wider than the line gets a line of its own.
 */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const out: string[] = [];
  const paragraphs = String(text ?? "").split("\n");
  paragraphs.forEach((para, pi) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      if (pi > 0 && pi < paragraphs.length - 1 && out[out.length - 1] !== "") out.push("");
      return;
    }
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (!line || measure(candidate) <= maxWidth) {
        line = candidate;
      } else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  });
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

/**
 * At most `maxLines` lines; when cut, the last kept line ends with «…» and is
 * shortened word by word until it fits. `truncated` says whether anything was cut.
 */
export function clampLines(lines: readonly string[], maxLines: number, maxWidth: number, measure: Measure): { lines: string[]; truncated: boolean } {
  if (maxLines <= 0) return { lines: [], truncated: lines.length > 0 };
  if (lines.length <= maxLines) return { lines: [...lines], truncated: false };
  const kept = lines.slice(0, maxLines);
  // Never end on an empty paragraph line.
  while (kept.length > 1 && kept[kept.length - 1] === "") kept.pop();
  let last = kept[kept.length - 1];
  let words = last.split(" ");
  while (words.length > 1 && measure(`${words.join(" ")} …`) > maxWidth) words = words.slice(0, -1);
  last = `${words.join(" ")} …`;
  kept[kept.length - 1] = last;
  return { lines: kept, truncated: true };
}

/** The download's file name: «نظامي-<law>-<article>.png», safe on every system. */
export function shareCardFileName(lawName: string, articleLabel: string): string {
  const part = (s: string) =>
    String(s ?? "")
      .replace(/\p{Cc}/gu, " ")
      .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, " ")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);
  return ["نظامي", part(lawName), part(articleLabel)].filter(Boolean).join("-") + ".png";
}
