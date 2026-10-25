/**
 * splitPreamble.ts — library.laws.preamble → the law's preamble and its
 * executive regulation's preamble (N1.2).
 *
 * library.laws has one preamble column. The seeder (scripts/seed-library.ts)
 * stores the file's preamble and, when the file has a
 * `<!-- REGULATION_PREAMBLE --> … <!-- REGULATION_PREAMBLE_END -->` block, that
 * block's text, in it. It used to join them with `\n***\n` — but the standard
 * file template itself puts `***` rules between the موجز block, the identity
 * card and the H1, so the route split on the first `***` and the reader
 * labelled the card and the title «اللائحة التنفيذية». In the 2026-10-16
 * export 44 of 45 preambles carry `***` and none has a regulation preamble.
 *
 * So the primary split is the REGULATION_PREAMBLE marker — the same marker the
 * source files use, which the seeder now writes (joinStoredPreamble) and which
 * extractPreamble also keeps when the block sits above the first article.
 *
 * Rows the old seeder stored (`\n***\n` + regulation preamble, no marker) stay
 * on live until the next load; splitLegacyJoin recognises exactly that shape
 * and nothing the template writes. Any other `***` never splits.
 *
 * Not lifted out: the `<!-- REGULATION_PREAMBLE {"ref": …} -->` attribute form
 * (6 «-مدمج» files). The parser does not read it either, and in all six the
 * file's own «## ديباجة اللائحة» heading sits just above the block, so the
 * text already reads under its label; lifting the block would leave that
 * heading empty.
 *
 * Pure: no runtime imports, so `node --test` loads it directly.
 */

export const REGULATION_PREAMBLE_SEPARATOR = "<!-- REGULATION_PREAMBLE -->";
const REGULATION_PREAMBLE_END = "<!-- REGULATION_PREAMBLE_END -->";

const BLOCK = /<!--\s*REGULATION_PREAMBLE\s*-->([\s\S]*?)(?:<!--\s*REGULATION_PREAMBLE_END\s*-->|$)/;

export interface SplitPreamble {
  preamble: string;
  regulationPreamble: string;
}

/** The value the seeder stores in library.laws.preamble. */
export function joinStoredPreamble(preamble: string | null | undefined, regulationPreamble: string | null | undefined): string {
  const base = preamble ?? "";
  const reg = (regulationPreamble ?? "").trim();
  if (!reg) return base;
  // The file kept the block inside its preamble already (it sat above the
  // first article): it is there once, not twice.
  if (BLOCK.test(base)) return base;
  return `${base}\n${REGULATION_PREAMBLE_SEPARATOR}\n${reg}\n${REGULATION_PREAMBLE_END}`;
}

/** Joins the text around a removed block without leaving a run of blank lines at the seam. */
function seam(before: string, after: string): string {
  const a = before.trimEnd();
  const b = after.trimStart();
  return a && b ? `${a}\n\n${b}` : a + b;
}

/** The old seeder's separator (before N1.2). */
const LEGACY_SEPARATOR = "\n***\n";

/**
 * A row the OLD seeder wrote — `${preamble}\n***\n${regulation_preamble}` —
 * split back, or null when the text is not that shape. Live rows keep it until
 * the next load, so without this a real regulation preamble would show inside
 * the law's, unlabelled.
 *
 * The shape is precise, because the template's own `***` rules must never
 * match (precious-metals, نظام العمل, the section-29 treaties):
 *   - the LAST `\n***\n` — the seeder appended at the very end;
 *   - tight on both sides: the parser trims both parts, so no whitespace
 *     touches the separator. The template's rules sit between blank lines;
 *   - the first line after it is a heading (`#…` or `**…`) that names a
 *     لائحة or a ديباجة — as every regulation-preamble block in the owner
 *     corpus opens («**اللائحة التنفيذية للموارد البشرية…**», «##### ديباجة
 *     النظام الملكي…», «## ديباجة اللائحة»). A tight template seam is followed
 *     by «## المواد» or plain prose, and the treaties' «[نص ديباجة القرار…]»
 *     placeholder is not a heading.
 * Measured on the owner corpus (last_owner, 1,529 laws, old-seeder joins
 * rebuilt from the parser): the 2 rows with a regulation preamble and no
 * marker split back exactly; no other row splits.
 * Limit: a regulation preamble that itself holds a tight `\n***\n` would split
 * at its own rule. The one such file in the corpus (commercial remedies) keeps
 * the marker in its preamble, so it takes the marker path above this.
 */
function splitLegacyJoin(text: string): SplitPreamble | null {
  const at = text.lastIndexOf(LEGACY_SEPARATOR);
  if (at < 0) return null;
  const before = text.slice(0, at);
  const after = text.slice(at + LEGACY_SEPARATOR.length);
  if (/\s$/.test(before) || !after || /^\s/.test(after)) return null;
  const firstLine = after.split("\n", 1)[0];
  if (!/^(?:#|\*\*)/.test(firstLine) || !/لائح|ديباج/.test(firstLine)) return null;
  return { preamble: before.trim(), regulationPreamble: after.trim() };
}

export function splitStoredPreamble(stored: unknown): SplitPreamble {
  const text = typeof stored === "string" ? stored : "";
  const m = BLOCK.exec(text);
  if (!m) return splitLegacyJoin(text) ?? { preamble: text.trim(), regulationPreamble: "" };

  // Same unquoting as the parser's regulation_preamble (parse-laws.ts).
  const regulationPreamble = m[1].replace(/^>\s*/gm, "").trim();
  let rest = seam(text.slice(0, m.index), text.slice(m.index + m[0].length));

  // A row from the old seeder whose file kept the block inside its preamble
  // also carries a `\n***\n` + copy at the end: drop that duplicate.
  const legacyTail = `\n***\n${regulationPreamble}`;
  if (regulationPreamble && rest.endsWith(legacyTail)) rest = rest.slice(0, -legacyTail.length);

  return { preamble: rest.trim(), regulationPreamble };
}
