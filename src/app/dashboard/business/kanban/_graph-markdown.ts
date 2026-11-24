/**
 * _graph-markdown.ts — the small Markdown a card's text may carry (case-graph
 * reference item 7; file 11, row 57). The card menu already wrapped text in
 * «**…**» (تغليظ) and «*…*» (مائل), but the card printed the stars raw.
 *
 * Parsed to plain data and drawn as React elements by the view — never as
 * HTML, so nothing typed on a card can become markup. Supported, nothing more:
 *   # heading · ## sub-heading · "- " list line · **bold** · *italic*
 */

export interface MdSpan { text: string; bold?: true; italic?: true }
export type MdBlockKind = "h1" | "h2" | "li" | "p";
export interface MdBlock { kind: MdBlockKind; spans: MdSpan[] }

/** True when the text uses any of the supported marks (else the card shows it as typed). */
export function hasCardMarkdown(text: string): boolean {
  return /\*\*[^*\n]+\*\*/.test(text)
    || /(^|[^*])\*[^*\s][^*\n]*\*(?!\*)/.test(text)
    || /^#{1,2} \S/m.test(text)
    || /^- \S/m.test(text);
}

/** «**a** b *c*» → bold «a», plain « b », italic «c». Unclosed marks stay as typed. */
export function parseInline(line: string): MdSpan[] {
  const spans: MdSpan[] = [];
  const re = /\*\*([^*\n]+)\*\*|\*([^*\s][^*\n]*)\*/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) spans.push({ text: line.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ text: m[1], bold: true });
    else spans.push({ text: m[2], italic: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) spans.push({ text: line.slice(last) });
  return spans;
}

/** One block per non-empty line. */
export function parseCardMarkdown(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    let kind: MdBlockKind = "p";
    let body = line;
    if (line.startsWith("## ")) { kind = "h2"; body = line.slice(3); }
    else if (line.startsWith("# ")) { kind = "h1"; body = line.slice(2); }
    else if (line.startsWith("- ")) { kind = "li"; body = line.slice(2); }
    blocks.push({ kind, spans: parseInline(body) });
  }
  return blocks;
}
