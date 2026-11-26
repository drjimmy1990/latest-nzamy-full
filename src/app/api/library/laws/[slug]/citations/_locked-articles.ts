/**
 * _locked-articles.ts — owner answer ٢٣٦ (27 Nov 2026, batch l18-answers):
 * «تُخفى خانة/عمود «الإحالات المرتبطة» وعددها ومضمونها … عن المواد المقفولة
 * لغير المشترك (واجهةً وخادماً)».
 *
 * The links answers of the citations route (?bulk=1 and ?article=) are cached
 * per law for every viewer (_cache.ts). For a viewer who is NOT a library
 * subscriber, on a law that is not whitelisted, every article past the law's
 * free preview window is locked — the same rule the law route locks its text
 * by (laws/[slug]/route.ts isArticleLocked: position in order_index, id order
 * ≥ effectiveFreeLimit). Here, after the cache and per viewer, a locked
 * article's links are removed entirely — no group, no count, no title — and
 * the nodes only locked articles listed leave the answer with them.
 *
 * Kept out of _shape.ts on purpose: the reader's client box imports _shape.
 * Pure (type-only and relative imports): `node --test` runs _locked-articles.test.ts.
 */
import { LAW_LINKS_ID, emptySections, type LawLinks } from "./_shape.ts";

/**
 * The bulk answer with only the articles a viewer may open. `openIds` null =
 * every article is open (a subscriber, a whitelisted law). The law's own box
 * (LAW_LINKS_ID) is not an article and always stays.
 */
export function withoutLockedArticles<T extends Pick<LawLinks, "items" | "articles">>(bulk: T, openIds: ReadonlySet<string> | null): T {
  if (openIds === null) return bulk;
  const articles: LawLinks["articles"] = {};
  for (const [id, groups] of Object.entries(bulk.articles)) {
    if (id === LAW_LINKS_ID || openIds.has(id)) articles[id] = groups;
  }
  const used = new Set<string>();
  for (const groups of Object.values(articles)) for (const g of groups) for (const [k] of g[3]) used.add(k);
  const items: LawLinks["items"] = {};
  for (const [k, v] of Object.entries(bulk.items)) if (used.has(k)) items[k] = v;
  return { ...bulk, items, articles };
}

/** One locked article's ?article= answer: nothing — no item, no total. */
export function lockedArticleRefs(): { found: false; locked: true; sections: ReturnType<typeof emptySections> } {
  return { found: false, locked: true, sections: emptySections() };
}

/** Is this box id an article this viewer may not open? */
export function articleBoxLocked(articleId: string, openIds: ReadonlySet<string> | null): boolean {
  return openIds !== null && articleId !== LAW_LINKS_ID && !openIds.has(articleId);
}
