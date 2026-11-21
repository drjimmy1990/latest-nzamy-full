/**
 * draftFab.ts — when the floating buttons show on a library reader (batch l12).
 *
 * L2 (owner file 03 ل2, «القبول»): the readers whose header has its own
 * «المسودة» button (law, royal order, principles collection, feqh book) show
 * the floating draft button too, once the reader is 300 px below the top, and
 * hide it again near the header. This replaces the blanket rule of N02-3
 * (ce3cc4c5, 17 Nov) that removed it from those readers altogether.
 *
 * lib02 / New 1: on a narrow screen (< lg) the floating buttons sit over the
 * article text. They now slide away while the reader scrolls DOWN (reading on)
 * and come back on a scroll UP, near the top, and at the end of the page —
 * where the reader column's bottom padding keeps them clear of the last lines.
 * They do not come back merely because the page stopped moving: at rest the
 * reader is reading, and a returning button would cover the line being read
 * (the very complaint).
 *
 * Pure, no imports — `node --test` loads it.
 */

/** Pixels below the top before the reader's floating draft button shows (his «300 بكسل»). */
export const DRAFT_FAB_SCROLL_THRESHOLD = 300;

export function draftFabVisible(input: {
  cartCount: number;
  isItemDetail: boolean;
  /** The page header already has a «المسودة» button (readerHasOwnDraftButton). */
  headerHasDraftButton: boolean;
  scrollY: number;
  threshold?: number;
}): boolean {
  if (input.cartCount <= 0 || !input.isItemDetail) return false;
  if (!input.headerHasDraftButton) return true;
  return input.scrollY > (input.threshold ?? DRAFT_FAB_SCROLL_THRESHOLD);
}

/** Scroll moves smaller than this are jitter (iOS bounce, sub-pixel layout) and change nothing. */
export const FAB_SCROLL_JITTER = 8;
/** Within this many pixels of the top or of the end of the page the buttons always show. */
export const FAB_EDGE_ZONE = 120;

/**
 * Whether the floating buttons are hidden after the page moved from `prevY`
 * to `y`. `maxY` = scrollHeight − innerHeight (0 when the page does not scroll).
 */
export function nextFabHidden(prevHidden: boolean, prevY: number, y: number, maxY: number): boolean {
  if (y <= FAB_EDGE_ZONE) return false;
  if (maxY > 0 && y >= maxY - FAB_EDGE_ZONE) return false;
  const dy = y - prevY;
  if (Math.abs(dy) < FAB_SCROLL_JITTER) return prevHidden;
  return dy > 0;
}
