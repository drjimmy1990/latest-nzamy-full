/**
 * _preamble.ts — is there a ديباجة to show? (owner file 16 §5, 19 Nov 2026,
 * screenshot 05).
 *
 * «الديباجة» of نظام القضاء opened on «نظام القضاء», «ديباجة النظام», an empty
 * «ديباجة نظام القضاء (سابق)» toggle and «المواد» — headings over nothing.
 * The reader used to strip only a `<details><summary>` wrapper and two
 * placeholder phrases, so heading-only text counted as a preamble. Now the
 * reader uses the server's own rule (lawPreambleBlocks.ts isHollowPreamble:
 * title headings, rules, `<details>` / `<summary>` wrappers and the «لم تتوفر
 * ديباجة» placeholder are not prose), after putting every `<details>` /
 * `<summary>` tag on a line of its own (_details-block.ts splitDetailsMarkup)
 * and dropping blockquote marks, so a one-line `<details><summary>…</summary>`
 * or a «>»-quoted empty line is no prose either. A toggle with a real body is
 * prose and keeps the section: when in doubt the text is kept.
 *
 * Pure: `node --test` loads it (_preamble.test.ts).
 */
import { isHollowPreamble } from "../../../lib/library/lawPreambleBlocks.ts";
import { splitDetailsMarkup } from "./_details-block.ts";

export function isPreambleEmpty(text: string | null | undefined): boolean {
  if (typeof text !== "string" || text.trim() === "") return true;
  const lines = splitDetailsMarkup(text.replace(/\r\n/g, "\n"))
    .map((l) => l.replace(/^\s*(?:>\s?)+/, "").trim())
    .filter((l) => l !== "");
  return isHollowPreamble(lines.join("\n"));
}
