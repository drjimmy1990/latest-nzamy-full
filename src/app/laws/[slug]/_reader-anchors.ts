/**
 * Jumping from the reader's contents list to an article.
 *
 * Owner report (2026-10-03, /laws/sharia-pleading-law-qadha-edition):
 *
 * 1. In the «التشريعات الفرعية» view a click on a regulation entry did not
 *    jump. Cause: that view renders the server's flat per-instrument list
 *    (law.regulationInstruments) as plain cards with NO element id, while the
 *    contents list scrolled to the نظام article's id — an element that view
 *    does not render. getElementById returned null and nothing happened.
 *    Now every card has an id built from its position in the FULL instruments
 *    list (stable when the instrument filter is applied), and each نظام
 *    article maps to the first card of its own regulation rows.
 *
 * 2. After a jump the fixed top bar covered the article heading. Cause: the
 *    jump used scrollIntoView({block: "center"}), which puts a long article's
 *    heading above the top of the window. Now the jump aligns the START of the
 *    target and the target carries scroll-margin-top clearing the bar. The
 *    site's display-density zoom (html[data-density], CSS `zoom`) scales the
 *    bar and this margin by the same factor, so no --density-scale term is
 *    needed.
 */

/** Clears the fixed navbar (≈5rem) with room to spare; same value as the precedents reader. */
export const READER_SCROLL_MARGIN_TOP = "calc(8rem + env(safe-area-inset-top, 0px))";

/** Scroll a reader anchor to just below the top bar. False when the element is not on the page. */
export function scrollToReaderAnchor(id: string | null | undefined): boolean {
  if (!id || typeof document === "undefined") return false;
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

/**
 * A contents-list jump: raises the reader's "programmatic scroll" flag for a
 * second (so the scroll observer does not re-pick the active article while the
 * page moves), then scrolls. Kept outside the components so they never mutate
 * the ref they receive as a prop.
 */
export function jumpToReaderAnchor(scrolling: { current: boolean }, id: string | null | undefined): boolean {
  scrolling.current = true;
  const found = scrollToReaderAnchor(id);
  setTimeout(() => { scrolling.current = false; }, 1000);
  return found;
}

/** DOM id of one card in the flat regulation view, by its place in the full instruments list. */
export function regulationCardId(instrumentIndex: number, articleIndex: number): string {
  return `regview-${instrumentIndex}-${articleIndex}`;
}

interface FlatInstrumentLike {
  ref: string;
  articles: ReadonlyArray<{ regNum: string | null; text: string }>;
}

interface LawArticleLike {
  id: string;
  regulations?: ReadonlyArray<{ ref?: string | null; regNum?: string | null; text?: string | null; isSecondaryDisplay?: boolean }>;
}

export interface RegulationAnchors {
  /** نظام article id → the card its contents entry jumps to. */
  anchorByArticleId: Map<string, string>;
  /** card id → the نظام article it belongs to (for the active-entry highlight). */
  articleIdByCardId: Map<string, string>;
}

/**
 * Link the flat regulation cards to the نظام articles they hang under.
 *
 * Both lists come from the same article_regulations rows (route.ts builds the
 * flat view from every unlocked article's rows, minus is_secondary_display
 * duplicates), so a row is identified by (ref, regNum, text). A secondary
 * duplicate has the same three values as the primary row it duplicates, so its
 * article jumps to that same card.
 *
 * @param instruments the server's flat view, in the order it is rendered
 * @param articles    the law's articles in reading order
 * @param visibleRef  the instrument filter («الكل» = null): cards of other
 *                    instruments are not rendered, so they are not anchors
 */
export function buildRegulationAnchors(
  instruments: readonly FlatInstrumentLike[],
  articles: readonly LawArticleLike[],
  visibleRef: string | null,
): RegulationAnchors {
  const key = (ref: unknown, regNum: unknown, text: unknown) =>
    `${String(ref ?? "")}\u0000${regNum == null ? "" : String(regNum)}\u0000${String(text ?? "")}`;

  const cardByKey = new Map<string, string>();
  instruments.forEach((inst, ii) => {
    if (visibleRef !== null && inst.ref !== visibleRef) return;
    inst.articles.forEach((row, ai) => {
      const k = key(inst.ref, row.regNum, row.text);
      if (!cardByKey.has(k)) cardByKey.set(k, regulationCardId(ii, ai));
    });
  });

  const anchorByArticleId = new Map<string, string>();
  const articleIdByCardId = new Map<string, string>();
  // Primary rows first, so a card's owner is the article it really belongs to.
  for (const pass of [false, true]) {
    for (const article of articles) {
      for (const row of article.regulations ?? []) {
        if ((row.isSecondaryDisplay === true) !== pass) continue;
        const card = cardByKey.get(key(row.ref, row.regNum, row.text));
        if (!card) continue;
        if (!anchorByArticleId.has(article.id)) anchorByArticleId.set(article.id, card);
        if (!articleIdByCardId.has(card)) articleIdByCardId.set(card, article.id);
      }
    }
  }
  return { anchorByArticleId, articleIdByCardId };
}
