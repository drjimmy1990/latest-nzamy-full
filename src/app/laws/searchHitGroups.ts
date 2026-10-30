/**
 * searchHitGroups — owner note ١٢-١ (2026-10-30): a principle or fiqh search
 * hit is shown INSIDE its parent card (the judicial collection, the book), as
 * a highlighted sub-row that opens the matching place, instead of an orphan
 * card «مبدأ رقم 1 — …» with no collection name.
 *
 *   groupPrincipleSearchCards  collection title hits + principle hits → one
 *                              card per collection, its matching principles
 *                              as rows (a collection found by its title and by
 *                              its principles is ONE card);
 *   groupFeqhSearchCards       book title hits + passage hits → one card per
 *                              book, its matching passages as rows;
 *   deepHitHref                «<reader>?target=<id>&q=<query>#<id>» — the
 *                              reader opens on the matching place and
 *                              highlights the query. It highlights only:
 *                              nothing else in the reader is hidden.
 *
 * Grouping runs over the LOADED hits, in first-appearance order (the server's
 * relevance order holds); counts, paging and every per-hit lock stay the
 * API's. A locked hit lists its label only, never text the server withheld.
 *
 * Pure: `node --test src/app/laws/searchHitGroups.test.ts`.
 */

import { withSearchQuery } from "../../lib/search/multiColorSearch.ts";

function text(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/**
 * Owner note ٠٦ (المسار الثاني): a result link carries the search as ?q= so
 * the reader highlights it. No link ("" / "#"), or a query under two
 * characters (no search runs), leaves the href as it is; a #hash is kept.
 */
export function resultHref(href: string | null | undefined, query: string | null | undefined): string {
  const h = typeof href === "string" ? href : "";
  if (!h || h === "#") return h;
  const q = String(query ?? "").trim();
  return q.length >= 2 ? withSearchQuery(h, q) : h;
}

/**
 * The reader URL that opens on one hit: `?target=<id>` (a reader that pages in
 * windows loads up to it), `#<id>` (the DOM anchor) and `?q=` (the highlight).
 * `base` keeps any query it already has; an empty id gives `base` + `?q=`.
 */
export function deepHitHref(base: string, id: unknown, query: string | null | undefined): string {
  const target = text(id);
  if (!target) return withSearchQuery(base, query);
  const sep = base.includes("?") ? "&" : "?";
  return withSearchQuery(`${base}${sep}target=${encodeURIComponent(target)}#${encodeURIComponent(target)}`, query);
}

/** The /laws principle row fields the grouping reads (page.tsx search mapping). */
export interface PrincipleHitLike {
  id: string;
  collectionId?: string;
  collectionTitle?: string | null;
  principleNum?: string;
  source?: string;
  text?: string;
  locked?: boolean;
  year?: string;
}

/** The /laws collection card fields (page.tsx filteredCollections). */
export interface CollectionHitLike {
  id: string;
  slug?: string;
  title?: string;
  court?: string;
  free?: boolean;
  desc?: string;
}

export interface GroupedHitRow {
  id: string;
  /** «مبدأ رقم 12», a fiqh topic, … ; "" when there is none. */
  label: string;
  /** The hit's text as the server sent it; "" for a locked hit. */
  snippet: string;
  locked: boolean;
  href: string;
}

export interface PrincipleGroupCard<C extends CollectionHitLike = CollectionHitLike> {
  key: string;
  collectionId: string;
  title: string;
  court: string;
  /** The collection's own title hit, when the search also matched its title. */
  collection: C | null;
  /** Rows shown on the card (at most `maxRows`). */
  rows: GroupedHitRow[];
  /** Further loaded hits of this collection not listed. */
  more: number;
  /** All loaded hits of this collection. */
  total: number;
  /** The collection page, with ?q=. */
  href: string;
}

export const GROUP_ROWS_SHOWN = 4;

/**
 * One card per collection: collection title hits first (as the API lists
 * them), then collections met through their principles. A principle without
 * a collection id stays a card of its own (no parent to open).
 */
export function groupPrincipleSearchCards<C extends CollectionHitLike>(
  principles: readonly PrincipleHitLike[],
  collections: readonly C[],
  query: string,
  maxRows: number = GROUP_ROWS_SHOWN,
): Array<PrincipleGroupCard<C>> {
  const groups = new Map<string, { card: PrincipleGroupCard<C>; hits: PrincipleHitLike[]; seen: Set<string> }>();
  const order: string[] = [];
  const open = (key: string, init: () => PrincipleGroupCard<C>) => {
    let g = groups.get(key);
    if (!g) {
      g = { card: init(), hits: [], seen: new Set() };
      groups.set(key, g);
      order.push(key);
    }
    return g;
  };
  for (const col of collections) {
    if (!col || typeof col !== "object") continue;
    const id = text(col.slug) || text(col.id);
    if (!id) continue;
    const g = open(`col:${id}`, () => ({
      key: `col:${id}`, collectionId: id, title: text(col.title), court: text(col.court) === "—" ? "" : text(col.court),
      collection: col, rows: [], more: 0, total: 0, href: withSearchQuery(`/precedents/${encodeURIComponent(id)}`, query),
    }));
    if (!g.card.collection) g.card.collection = col;
  }
  for (const p of principles) {
    if (!p || typeof p !== "object" || !text(p.id)) continue;
    const colId = text(p.collectionId);
    const key = colId ? `col:${colId}` : `row:${p.id}`;
    const g = open(key, () => ({
      key, collectionId: colId, title: text(p.collectionTitle), court: text(p.source),
      collection: null, rows: [], more: 0, total: 0,
      href: colId ? withSearchQuery(`/precedents/${encodeURIComponent(colId)}`, query) : "",
    }));
    if (!g.card.title) g.card.title = text(p.collectionTitle);
    if (!g.card.court) g.card.court = text(p.source);
    if (g.seen.has(p.id)) continue;
    g.seen.add(p.id);
    g.hits.push(p);
  }
  const shown = Math.max(0, Math.floor(maxRows));
  return order.map((key) => {
    const { card, hits } = groups.get(key)!;
    const rows: GroupedHitRow[] = hits.slice(0, shown).map((p) => ({
      id: p.id,
      label: p.principleNum ? `مبدأ رقم (${p.principleNum})` : "",
      snippet: p.locked ? "" : text(p.text),
      locked: p.locked === true,
      href: card.collectionId ? deepHitHref(`/precedents/${encodeURIComponent(card.collectionId)}`, p.id, query) : "",
    }));
    return { ...card, rows, total: hits.length, more: Math.max(0, hits.length - rows.length) };
  });
}

/** The /laws fiqh row fields the grouping reads (page.tsx filteredFeqhBooks). */
export interface FeqhHitLike {
  id: string;
  slug?: string;
  title?: string;
  author?: string;
  desc?: string;
  locked?: boolean;
  /** 'book' for a book-title hit, else a passage. */
  hitKind?: unknown;
  bookTitle?: string | null;
  topic?: string | null;
  chapter?: string | null;
  page?: unknown;
  volumesLabel?: string | null;
}

export interface FeqhGroupCard<T extends FeqhHitLike = FeqhHitLike> {
  key: string;
  bookSlug: string;
  title: string;
  author: string;
  volumesLabel: string;
  /** The book's own title hit, when the search also matched its title. */
  bookHit: T | null;
  /** A row of the card, for its other fields (type, lock…). */
  first: T;
  rows: GroupedHitRow[];
  more: number;
  total: number;
  href: string;
}

function passageLabel(h: FeqhHitLike): string {
  const topic = text(h.topic);
  const page = text(h.page);
  const chapter = text(h.chapter);
  const parts = [topic || chapter, page ? `ص ${page}` : ""].filter(Boolean);
  return parts.join(" · ");
}

/** One card per book: book-title hits first, then books met through their passages. */
export function groupFeqhSearchCards<T extends FeqhHitLike>(
  hits: readonly T[],
  query: string,
  maxRows: number = GROUP_ROWS_SHOWN,
): Array<FeqhGroupCard<T>> {
  const groups = new Map<string, { card: FeqhGroupCard<T>; passages: T[]; seen: Set<string> }>();
  const order: string[] = [];
  for (const h of hits) {
    if (!h || typeof h !== "object" || !text(h.id)) continue;
    const slug = text(h.slug);
    const key = slug ? `book:${slug}` : `row:${h.id}`;
    let g = groups.get(key);
    const bookTitle = text(h.bookTitle) || (h.hitKind === "book" ? text(h.title) : text(h.title).split(" — ")[0]);
    if (!g) {
      g = {
        card: {
          key, bookSlug: slug, title: bookTitle, author: text(h.author), volumesLabel: text(h.volumesLabel),
          bookHit: null, first: h, rows: [], more: 0, total: 0,
          href: slug ? withSearchQuery(`/book/${slug}`, query) : "",
        },
        passages: [],
        seen: new Set(),
      };
      groups.set(key, g);
      order.push(key);
    }
    if (!g.card.author) g.card.author = text(h.author);
    if (!g.card.volumesLabel) g.card.volumesLabel = text(h.volumesLabel);
    if (h.hitKind === "book") {
      if (!g.card.bookHit) g.card.bookHit = h;
      if (text(h.title)) g.card.title = text(h.title);
      continue;
    }
    if (g.seen.has(h.id)) continue;
    g.seen.add(h.id);
    g.passages.push(h);
  }
  const shown = Math.max(0, Math.floor(maxRows));
  return order.map((key) => {
    const { card, passages } = groups.get(key)!;
    const rows: GroupedHitRow[] = passages.slice(0, shown).map((h) => ({
      id: h.id,
      label: passageLabel(h),
      snippet: h.locked ? "" : text(h.desc),
      locked: h.locked === true,
      href: card.bookSlug ? deepHitHref(`/book/${card.bookSlug}`, h.id, query) : "",
    }));
    return { ...card, rows, total: passages.length, more: Math.max(0, passages.length - rows.length) };
  });
}
