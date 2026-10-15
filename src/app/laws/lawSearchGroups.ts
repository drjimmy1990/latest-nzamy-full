/**
 * Law search results, one card per law (owner package 10-06, gap analysis §4:
 * «Search shows one card per article instead of grouping by law»).
 *
 * The search API pages the laws section per HIT — a law-title hit
 * (`meta.kind 'law'`, id `law:<slug>`) and article hits (`meta.kind
 * 'article'`) — and its counts, paging (lawPageArticles) and per-hit masking
 * stay exactly as they are. The page groups the hits it has LOADED: every
 * hit of one law becomes one card, in the order the law first appears (so the
 * server's ranking holds), listing the first MATCHED_ARTICLES_SHOWN matching
 * articles. After «تحميل المزيد» the groups are rebuilt from all loaded hits,
 * so a law whose articles span two pages is still one card.
 *
 * `moreMatchedArticles` counts LOADED hits only — never the law's total.
 * A locked hit's snippet is never listed (decision ١٦٠: a locked card shows
 * no text the catalogue locks), only its article label.
 *
 * Pure, no imports: `node --test` loads it (lawSearchGroups.test.ts).
 */

/** The per-hit card fields page.tsx builds from one search row. */
export interface LawSearchCardLike {
  id: string;
  slug?: string;
  title?: string;
  desc?: string;
  free?: boolean;
  status?: string;
  articleStatus?: unknown;
  /** The hit's `meta.kind`: 'law' for a law-title hit, 'article' otherwise. */
  hitKind?: unknown;
  /** The parent law's title (`meta.lawTitle`). */
  lawTitle?: unknown;
  /** «المادة N» as the law page labels it (`meta.articleLabel`). */
  articleLabel?: unknown;
}

export interface MatchedArticle {
  id: string;
  /** «المادة 5»; '' when the API sent no label. */
  label: string;
  /** The article's snippet; '' for a locked hit. */
  snippet: string;
  /** The ARTICLE's own status, as the API sent it. */
  status: string | null;
}

export type GroupedLawCard<T> = T & {
  matchedArticles: MatchedArticle[];
  /** Further loaded article hits of this law not listed on the card. */
  moreMatchedArticles: number;
};

/** Article hits listed on one law card. */
export const MATCHED_ARTICLES_SHOWN = 3;

const SEPARATOR = " — ";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function articleLabelOf(card: LawSearchCardLike, lawTitle: string): string {
  const label = text(card.articleLabel);
  if (label) return label;
  // An API without meta.articleLabel titles the hit «<law> — <label>».
  const title = text(card.title);
  if (lawTitle && title.startsWith(lawTitle + SEPARATOR)) return title.slice(lawTitle.length + SEPARATOR.length).trim();
  return "";
}

interface Group<T> {
  key: string;
  lawHit: T | null;
  articles: T[];
  seen: Set<string>;
}

/**
 * One card per law, in first-appearance order. A hit without a law slug stays
 * a card of its own. Never throws on a malformed row.
 */
export function groupLawSearchCards<T extends LawSearchCardLike>(
  cards: readonly T[],
  maxShown: number = MATCHED_ARTICLES_SHOWN,
): Array<GroupedLawCard<T>> {
  const groups = new Map<string, Group<T>>();
  const order: Group<T>[] = [];
  for (const card of cards) {
    if (!card || typeof card !== "object") continue;
    const slug = text(card.slug);
    const key = slug ? `law:${slug}` : `row:${card.id}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, lawHit: null, articles: [], seen: new Set() };
      groups.set(key, group);
      order.push(group);
    }
    if (card.hitKind === "law") {
      if (!group.lawHit) group.lawHit = card;
    } else if (!group.seen.has(card.id)) {
      group.seen.add(card.id);
      group.articles.push(card);
    }
  }

  const shown = Math.max(0, Math.floor(maxShown));
  return order.map((group) => {
    const base = (group.lawHit ?? group.articles[0]) as T;
    // A hit with no law slug is not grouped: it stays exactly as it was.
    if (group.key.startsWith("row:")) return { ...base, matchedArticles: [], moreMatchedArticles: 0 };

    const members = group.lawHit ? [group.lawHit, ...group.articles] : group.articles;
    const lawTitle =
      text(group.lawHit?.title) ||
      members.map((m) => text(m.lawTitle)).find(Boolean) ||
      text(base.title);
    // Every hit of one law carries the same entitlement; if any says locked, the card is locked.
    const free = members.every((m) => m.free !== false);
    const status = members.map((m) => text(m.status)).find(Boolean) ?? "";
    const matchedArticles: MatchedArticle[] = group.articles.slice(0, shown).map((a) => ({
      id: a.id,
      label: articleLabelOf(a, lawTitle),
      snippet: a.free === false ? "" : text(a.desc),
      status: typeof a.articleStatus === "string" ? a.articleStatus : null,
    }));
    return {
      ...base,
      id: group.key,
      title: lawTitle,
      // The law's own description comes from its title hit; article text is in the list.
      desc: group.lawHit ? text(group.lawHit.desc) : "",
      free,
      status,
      // Article statuses are listed per article, never as the card's.
      articleStatus: undefined,
      matchedArticles,
      moreMatchedArticles: Math.max(0, group.articles.length - matchedArticles.length),
    };
  });
}
