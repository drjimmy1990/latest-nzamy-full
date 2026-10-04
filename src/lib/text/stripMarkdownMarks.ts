/**
 * stripMarkdownMarks — display text for a card snippet, without the raw
 * Markdown marks some library rows carry (owner test 2026-10-01: a principle
 * card for «إعلام الموقعين» opened with `**` and `## مبدأ إداري رقم 49`).
 *
 * Removes ONLY marks:
 *   - heading hashes at the start of a line (also after the «…» a truncated
 *     search snippet starts with), and a `##`+ heading run glued mid-line;
 *   - bold / italic asterisks and underscores (`**x**`, `***x***`, `__x__`,
 *     `*x*`, `_x_`) and any leftover run of two or more `*` — a search
 *     snippet is a cut window, so its closing `**` is often missing;
 *     a run of underscores on its own is kept (a «______» fill-in blank);
 *   - separator lines made only of `***`, `---` or `___`;
 *   - a leading bullet (`-`, `*`, `+`, `•`) followed by a space.
 *
 * Leaves alone: Arabic text, Western and Arabic-Indic digits, numbered
 * markers («1.» «١-»), a single `#` inside a line, and a lone `*` such as the
 * «(*)» footnote mark Saudi legal texts use.
 *
 * Pure, no imports: `node --test src/lib/text/stripMarkdownMarks.test.ts`.
 */

/** Closing context for a single-mark italic: end, space, punctuation or a bracket. */
const ITALIC_END = "(?=$|[\\s.,،؛:!?؟…)\\]»])";

export function stripMarkdownMarks(text: string | null | undefined): string {
  if (typeof text !== "string" || text.length === 0) return "";

  let out = text.replace(/\r\n?/g, "\n");

  // Separator lines: only *, - or _ (three or more, spaces allowed).
  out = out.replace(/^[ \t]*([*_-])(?:[ \t]*\1){2,}[ \t]*$/gm, "");

  // Paired emphasis, strongest first, kept on one line.
  out = out.replace(/\*{3}([^*\n]+?)\*{3}/g, "$1");
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "$1");
  out = out.replace(/__([^_\n]+?)__/g, "$1");
  out = out.replace(
    new RegExp(`(^|[\\s(\\[«])\\*([^\\s*()](?:[^*()\\n]*[^\\s*()])?)\\*${ITALIC_END}`, "gmu"),
    "$1$2",
  );
  out = out.replace(
    new RegExp(`(^|[\\s(\\[«])_([^\\s_](?:[^_\\n]*[^\\s_])?)_${ITALIC_END}`, "gmu"),
    "$1$2",
  );

  // Unpaired leftovers: a run of two or more asterisks. (Underscore runs are
  // left: «الاسم: ______» is a fill-in blank, not a mark.)
  out = out.replace(/\*{2,}/g, "");

  // Headings at a line start (after an optional «…»): «##» to «######» with
  // or without a space, a single «#» only before a space (so «#وسم» stays).
  // Then a ##+ run glued into the middle of a line by a collapsed newline.
  out = out.replace(/^([ \t]*…?)[ \t]*(?:#{2,6}(?!#)|#(?=[ \t]|$))[ \t]*/gm, "$1");
  out = out.replace(/(\s)#{2,6}[ \t]+/g, "$1");

  // Leading bullets (never numbered markers).
  out = out.replace(/^([ \t]*…?)[ \t]*[-*+•][ \t]+/gm, "$1");

  // Tidy the whitespace the removals leave behind.
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
