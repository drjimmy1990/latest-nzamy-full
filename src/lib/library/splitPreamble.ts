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
 * So the ONLY split is the REGULATION_PREAMBLE marker — the same marker the
 * source files use, which the seeder now writes (joinStoredPreamble) and which
 * extractPreamble also keeps when the block sits above the first article.
 * A `***` never splits.
 *
 * Rows stored before this change that had a real regulation preamble joined by
 * `\n***\n` and no marker show it inside the law's preamble, unlabelled, until
 * the next load. That is the safe side: nothing is labelled as a regulation
 * that is not one, and nothing is dropped.
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

export function splitStoredPreamble(stored: unknown): SplitPreamble {
  const text = typeof stored === "string" ? stored : "";
  const m = BLOCK.exec(text);
  if (!m) return { preamble: text.trim(), regulationPreamble: "" };

  // Same unquoting as the parser's regulation_preamble (parse-laws.ts).
  const regulationPreamble = m[1].replace(/^>\s*/gm, "").trim();
  let rest = seam(text.slice(0, m.index), text.slice(m.index + m[0].length));

  // A row from the old seeder whose file kept the block inside its preamble
  // also carries a `\n***\n` + copy at the end: drop that duplicate.
  const legacyTail = `\n***\n${regulationPreamble}`;
  if (regulationPreamble && rest.endsWith(legacyTail)) rest = rest.slice(0, -legacyTail.length);

  return { preamble: rest.trim(), regulationPreamble };
}
