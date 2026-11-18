/**
 * lawPublicExcerpt.ts — the one piece of a law's text its server-rendered
 * page may print (owner message 18 Nov, item 4.1: «العنوان وH1 والموجز
 * والمقتطف المسموح للعامة … دون النص الكامل المقفول»).
 *
 * The rule is the reader's own paywall, never a second one:
 *   - only the law's FIRST article in document order (order_index, id — the
 *     order /api/library/laws/[slug] stamps __globalIndex in), and only when
 *     a guest's free limit opens it there: effectiveFreeLimit() of
 *     checkLibraryAccess(null, …) is -1 (a free law) or at least 1;
 *   - its text cleaned exactly as the route cleans an unlocked article for a
 *     guest: the corpus's audit notes stripped (stripArticleAuditNotes) and a
 *     closing «من اللائحة التنفيذية …» line lifted out with the official
 *     instrument hidden (liftRegulationHeading(…, true), T28-22);
 *   - nothing for a repealed article (its substance is original_text, which
 *     this never prints), an empty text, or a locked first article;
 *   - cut to EXCERPT_MAX_CHARS: a guest's reader gets more (3–5 articles),
 *     the HTML gets less — HTML pages sit outside the /api/library/* rate
 *     limits, so the crawler never gets more than a visitor.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { stripArticleAuditNotes } from "./lawPreambleBlocks.ts";
import { liftRegulationHeading } from "../../app/api/library/laws/[slug]/_regulation-heading.ts";

export const EXCERPT_MAX_CHARS = 600;

export interface LawFirstArticleRow {
  text?: unknown;
  status?: unknown;
}

/** True when an article at document index 0 is free for a guest under `freeLimit` (-1 = all). */
export function firstArticleIsFree(freeLimit: number): boolean {
  return freeLimit === -1 || freeLimit >= 1;
}

const REPEALED = /ملغ|repeal/i;

/** The excerpt to print, or null. `freeLimit` is effectiveFreeLimit() for a guest. */
export function lawPublicExcerpt(row: LawFirstArticleRow | null | undefined, freeLimit: number): string | null {
  if (!row || !firstArticleIsFree(freeLimit)) return null;
  if (typeof row.status === "string" && REPEALED.test(row.status)) return null;
  const cleaned = liftRegulationHeading(stripArticleAuditNotes(row.text), true).text.trim();
  if (!cleaned) return null;
  if (cleaned.length <= EXCERPT_MAX_CHARS) return cleaned;
  // Cut at the last space before the cap, never inside a word.
  const cut = cleaned.slice(0, EXCERPT_MAX_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${(space > EXCERPT_MAX_CHARS * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
