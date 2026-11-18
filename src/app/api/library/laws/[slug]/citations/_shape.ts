/**
 * _shape.ts — what the reader's citation route may send (batch l6-reader;
 * batch l8-refbox: the links box of owner item 6 and decision ٦٠).
 *
 * The graph functions return article text: graph_rag_explore_neighborhood
 * carries `snippet` (160 chars of display_text) and each edge's `evidence`
 * (up to 400 chars of the citing sentence). Article text is server-only
 * (20260929_01), and this route answers guests too, so every shape below is a
 * WHITELIST: key, kind, title (capped like a locked title), status, link type,
 * direction, section, links. No text field is ever copied through. The text of
 * an item is served only by ./preview/route.ts, behind the reader's paywall.
 *
 * Only the link types matching the owner's graph file are shown
 * (src/lib/library/graphLinkTypes.ts, decision ٦٠).
 *
 * Pure: `node --test` runs _shape.test.ts.
 */
import {
  LINK_SECTIONS,
  SHOWN_LINK_TYPES,
  isShownLinkType,
  linkLabel,
  sectionOfLinkType,
  type LinkSection,
  type ShownLinkType,
} from "../../../../../../lib/library/graphLinkTypes.ts";

/** The links the reader shows: the ones matching the owner's file (٦٠). */
export const READER_LINK_TYPES: readonly ShownLinkType[] = SHOWN_LINK_TYPES;
export type ReaderLinkType = ShownLinkType;

/** Same cap as a locked article's title in the law route (LOCKED_TITLE_CHARS). */
export const TITLE_CHARS = 120;
/** Items of one section sent to the box and its «عرض الكل» dialog. */
export const MAX_ITEMS_PER_SECTION = 60;
/** The graph neighbourhood asked for (the function's own ceiling). */
export const NEIGHBORHOOD_LIMIT = 200;

export type RefKind = "article" | "law" | "decree" | "principle" | "feqh";
export type RefDocKind = "law" | "collection" | "order" | "book";

export interface RefItem {
  /** The graph node key — what the preview asks for. */
  key: string;
  kind: RefKind;
  title: string;
  status: string | null;
  linkType: ShownLinkType;
  /** "out": the page's article is the link's source; "in": its target. */
  direction: "out" | "in";
  /** The words of the link, read from the page's article. */
  relation: string;
  section: LinkSection;
  /** The document that holds the item, and the item's anchor in it (null for a whole document). */
  docKind: RefDocKind;
  docId: string;
  anchorId: string | null;
  /** The anchor no longer exists (row gone): the links go to the document, never a 404. */
  anchorMissing: boolean;
}

export interface RefSection {
  /** How many links of this section the graph holds (≥ items.length). */
  total: number;
  items: RefItem[];
}

export interface ArticleRefs {
  found: boolean;
  sections: Record<LinkSection, RefSection>;
}

export function emptySections(): Record<LinkSection, RefSection> {
  return { legislation: { total: 0, items: [] }, judicial: { total: 0, items: [] }, fiqh: { total: 0, items: [] } };
}

export function capTitle(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > TITLE_CHARS ? `${s.slice(0, TITLE_CHARS)}...` : s;
}

/** An article id as the reader sends it: library.articles.id (varchar 150), no control characters. */
export function validArticleId(value: string | null): string | null {
  const s = (value ?? "").trim();
  if (!s || s.length > 150 || /[\u0000-\u001F\u007F]/.test(s)) return null;
  return s;
}

/** «35,36» → [35, 36]: positive integers, at most `max`. */
export function parseNumbers(value: string | null, max = 8): number[] {
  const out: number[] = [];
  for (const part of String(value ?? "").split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0 && n <= 9999 && !out.includes(n)) out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The titles a named document could have, longest first: «نظام العمل الصادر
 * بالمرسوم» → «نظام العمل الصادر بالمرسوم», «نظام العمل الصادر», «نظام العمل».
 * Matched by exact title; the longest hit wins, so «نظام العمل» never loses to
 * a shorter prefix and a guess is never made.
 */
export function docNameCandidates(name: string | null, maxWords = 8): string[] {
  const words = String(name ?? "").replace(/[ً-ْـ]/g, "").trim().split(/\s+/).filter(Boolean).slice(0, maxWords);
  const out: string[] = [];
  for (let n = words.length; n >= 2; n--) out.push(words.slice(0, n).join(" "));
  return out;
}

/** A preview key: one graph node of a kind the box lists, its id without control characters. */
export function parseRefKey(value: string | null): { kind: RefKind; id: string } | null {
  const s = (value ?? "").trim();
  const m = /^(article|law|decree|principle|feqh):(.+)$/.exec(s);
  if (!m || m[2].length > 250 || /[\u0000-\u001F\u007F]/.test(m[2])) return null;
  return { kind: m[1] as RefKind, id: m[2] };
}

interface RawNode {
  node_key?: unknown;
  node_type?: unknown;
  title?: unknown;
  law_slug?: unknown;
  url?: unknown;
  item_status?: unknown;
  doc_status?: unknown;
}
interface RawEdge {
  source?: unknown;
  target?: unknown;
  edge_type?: unknown;
}

/** The first path segment after `base` in a graph node's url, decoded once ('' when it is not there). */
function urlSegment(url: unknown, base: string): string {
  if (typeof url !== "string" || !url.startsWith(`${base}/`)) return "";
  const seg = url.slice(base.length + 1).split(/[#?]/)[0].split("/")[0];
  try {
    return decodeURIComponent(seg);
  } catch {
    return "";
  }
}

/** The document and anchor of a graph node, or null when the box cannot link it. */
function placeOf(kind: RefKind, key: string, node: RawNode): { docKind: RefDocKind; docId: string; anchorId: string | null } | null {
  const id = key.slice(key.indexOf(":") + 1);
  const lawSlug = typeof node.law_slug === "string" ? node.law_slug : "";
  switch (kind) {
    case "article":
      return lawSlug ? { docKind: "law", docId: lawSlug, anchorId: id } : null;
    case "law":
      return lawSlug || id ? { docKind: "law", docId: lawSlug || id, anchorId: null } : null;
    case "decree":
      return { docKind: "order", docId: id, anchorId: null };
    case "principle": {
      // url = /precedents/<collection>#<principle> (graphBuilder): the collection is in the path.
      const coll = urlSegment(node.url, "/precedents");
      return coll ? { docKind: "collection", docId: coll, anchorId: id } : null;
    }
    case "feqh": {
      const book = urlSegment(node.url, "/book");
      return book ? { docKind: "book", docId: book, anchorId: id } : null;
    }
  }
}

function kindOf(nodeType: unknown): RefKind | null {
  return nodeType === "article" || nodeType === "law" || nodeType === "decree" || nodeType === "principle" || nodeType === "feqh"
    ? nodeType
    : null;
}

/**
 * graph_rag_explore_neighborhood(article:<id>, 1, READER_LINK_TYPES) → the
 * reader's links box, in its three sections. `found` is false when the article
 * is not in the graph or the graph's article belongs to another law (the URL's
 * slug is the authority). A type outside the allow-list is dropped here too,
 * whatever the function returned. `total` counts the section's links from the
 * centre's own edge counts when the function cut the list short.
 */
export function shapeArticleRefs(raw: unknown, articleId: string, lawSlug: string): ArticleRefs {
  const empty: ArticleRefs = { found: false, sections: emptySections() };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as { found?: unknown; nodes?: unknown; edges?: unknown; truncated?: unknown; center_edge_counts?: unknown };
  if (r.found !== true) return empty;
  const center = `article:${articleId}`;
  const nodes = new Map<string, RawNode>();
  for (const n of Array.isArray(r.nodes) ? (r.nodes as RawNode[]) : []) {
    if (typeof n?.node_key === "string") nodes.set(n.node_key, n);
  }
  if (nodes.get(center)?.law_slug !== lawSlug) return empty;

  const out: ArticleRefs = { found: true, sections: emptySections() };
  const seen = new Set<string>();
  for (const e of Array.isArray(r.edges) ? (r.edges as RawEdge[]) : []) {
    if (!isShownLinkType(e?.edge_type)) continue;
    const direction = e.source === center ? "out" : e.target === center ? "in" : null;
    if (!direction) continue;
    const otherKey = String(direction === "out" ? e.target : e.source);
    if (otherKey === center) continue;
    const other = nodes.get(otherKey);
    const kind = kindOf(other?.node_type);
    if (!other || !kind) continue;
    const section = sectionOfLinkType(e.edge_type)!;
    if (seen.has(`${section}|${otherKey}`)) continue;
    const place = placeOf(kind, otherKey, other);
    if (!place) continue;
    seen.add(`${section}|${otherKey}`);
    const bucket = out.sections[section];
    bucket.total++;
    if (bucket.items.length >= MAX_ITEMS_PER_SECTION) continue;
    const status = kind === "article" ? other.item_status : other.doc_status;
    bucket.items.push({
      key: otherKey,
      kind,
      title: capTitle(other.title) || capTitle(place.docId),
      status: typeof status === "string" ? status : null,
      linkType: e.edge_type,
      direction,
      relation: linkLabel(e.edge_type, direction),
      section,
      ...place,
      anchorMissing: false,
    });
  }

  // The list stops at the function's limit; its per-type counts do not.
  if (r.truncated === true && r.center_edge_counts && typeof r.center_edge_counts === "object") {
    const counts = r.center_edge_counts as Record<string, { out?: unknown; in?: unknown }>;
    for (const s of LINK_SECTIONS) {
      let n = 0;
      for (const t of SHOWN_LINK_TYPES) {
        if (sectionOfLinkType(t) !== s) continue;
        const c = counts[t];
        n += (Number.isInteger(c?.out) ? (c!.out as number) : 0) + (Number.isInteger(c?.in) ? (c!.in as number) : 0);
      }
      out.sections[s].total = Math.max(out.sections[s].total, n);
    }
  }
  return out;
}

/** The ids the route checks against library.* (rows that still exist). */
export function refIds(refs: ArticleRefs): { articles: string[]; laws: string[]; principles: string[]; collections: string[]; decrees: string[] } {
  const ids = { articles: new Set<string>(), laws: new Set<string>(), principles: new Set<string>(), collections: new Set<string>(), decrees: new Set<string>() };
  for (const s of LINK_SECTIONS) {
    for (const it of refs.sections[s].items) {
      if (it.docKind === "law") ids.laws.add(it.docId);
      if (it.docKind === "collection") ids.collections.add(it.docId);
      if (it.docKind === "order") ids.decrees.add(it.docId);
      if (it.kind === "article" && it.anchorId) ids.articles.add(it.anchorId);
      if (it.kind === "principle" && it.anchorId) ids.principles.add(it.anchorId);
    }
  }
  return {
    articles: [...ids.articles],
    laws: [...ids.laws],
    principles: [...ids.principles],
    collections: [...ids.collections],
    decrees: [...ids.decrees],
  };
}

export interface LiveRows {
  articles: ReadonlyArray<{ id: unknown; status: unknown }>;
  laws: ReadonlyArray<{ slug: unknown; status: unknown }>;
  principles: ReadonlyArray<{ id: unknown }>;
  collections: ReadonlyArray<{ id: unknown }>;
  decrees: ReadonlyArray<{ id: unknown }>;
}

/**
 * The graph stores `item_status: art.status ?? "active"` (graphBuilder): an
 * article with no recorded status reads «active» there, and the graph is only
 * as fresh as its last sync. So statuses come from library.* at request time:
 * an article's from library.articles (unknown → undeclared, never «active»), a
 * law's from library.laws.
 *
 * Owner item 6 (the 308 of his file): an item whose ANCHOR is gone — the
 * article or principle row no longer exists — is kept and links to its law or
 * collection (`anchorMissing`), never to a 404. An item whose DOCUMENT is gone
 * is dropped: there is nothing left to link to. Kinds the route did not check
 * (a fiqh book) pass as they are.
 */
export function applyLiveRows(
  refs: ArticleRefs,
  rows: LiveRows,
  articleStatus: (raw: unknown) => string,
  lawStatus: (raw: unknown) => string,
): ArticleRefs {
  const art = new Map(rows.articles.map((r) => [String(r.id), r.status]));
  const law = new Map(rows.laws.map((r) => [String(r.slug), r.status]));
  const principles = new Set(rows.principles.map((r) => String(r.id)));
  const collections = new Set(rows.collections.map((r) => String(r.id)));
  const decrees = new Set(rows.decrees.map((r) => String(r.id)));
  const sections = emptySections();
  for (const s of LINK_SECTIONS) {
    const src = refs.sections[s];
    const items: RefItem[] = [];
    let dropped = 0;
    for (const it of src.items) {
      if (it.docKind === "law" && !law.has(it.docId)) { dropped++; continue; }
      if (it.docKind === "collection" && !collections.has(it.docId)) { dropped++; continue; }
      if (it.docKind === "order" && !decrees.has(it.docId)) { dropped++; continue; }
      if (it.kind === "article") {
        const present = !!it.anchorId && art.has(it.anchorId);
        items.push({
          ...it,
          anchorMissing: !present,
          status: present ? articleStatus(art.get(it.anchorId!)) : "status_undeclared",
        });
        continue;
      }
      if (it.kind === "law") {
        items.push({ ...it, status: lawStatus(law.get(it.docId)) });
        continue;
      }
      if (it.kind === "principle") {
        items.push({ ...it, anchorMissing: !it.anchorId || !principles.has(it.anchorId) });
        continue;
      }
      items.push(it);
    }
    sections[s] = { total: Math.max(items.length, src.total - dropped), items };
  }
  return { ...refs, sections };
}

/** Paths of an item: the exact place (or the document when the anchor is gone) and the whole document. */
export function refHrefs(it: Pick<RefItem, "docKind" | "docId" | "anchorId" | "anchorMissing">): { href: string; docHref: string } {
  const base = { law: "/laws", collection: "/precedents", order: "/laws/orders", book: "/book" }[it.docKind];
  const docHref = `${base}/${encodeURIComponent(it.docId)}`;
  const href = it.anchorId && !it.anchorMissing ? `${docHref}#${encodeURIComponent(it.anchorId)}` : docHref;
  return { href, docHref };
}

/** What the box receives: every item with its two paths. */
export type RefItemOut = RefItem & { href: string; docHref: string };
export function withHrefs(refs: ArticleRefs): { found: boolean; sections: Record<LinkSection, { total: number; items: RefItemOut[] }> } {
  const sections = {} as Record<LinkSection, { total: number; items: RefItemOut[] }>;
  for (const s of LINK_SECTIONS) {
    sections[s] = { total: refs.sections[s].total, items: refs.sections[s].items.map((it) => ({ ...it, ...refHrefs(it) })) };
  }
  return { found: refs.found, sections };
}

export interface LawLink {
  slug: string;
  title: string;
  status: string | null;
  /** Links from this law's articles to it, and from its articles to this law. */
  out: number;
  in: number;
  types: ReaderLinkType[];
}

/** library_reader_law_links_typed(slug, READER_LINK_TYPES) → the map's nodes; anything malformed is dropped. */
export function shapeLawLinks(raw: unknown): { links: LawLink[]; truncated: boolean } {
  const r = (raw && typeof raw === "object" ? raw : {}) as { links?: unknown; truncated?: unknown };
  const links: LawLink[] = [];
  for (const l of Array.isArray(r.links) ? (r.links as Record<string, unknown>[]) : []) {
    const slug = typeof l?.slug === "string" ? l.slug : "";
    if (!slug) continue;
    const types = (Array.isArray(l.types) ? l.types : []).filter(isShownLinkType);
    if (types.length === 0) continue;
    links.push({
      slug,
      title: capTitle(l.title) || slug,
      status: typeof l.status === "string" ? l.status : null,
      out: Number.isInteger(l.out) ? (l.out as number) : 0,
      in: Number.isInteger(l.in) ? (l.in as number) : 0,
      types,
    });
  }
  return { links, truncated: r.truncated === true };
}
