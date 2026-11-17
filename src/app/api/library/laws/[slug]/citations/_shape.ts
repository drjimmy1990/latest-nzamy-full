/**
 * _shape.ts — what the reader's citation route may send (batch l6-reader).
 *
 * The graph functions return article text: graph_rag_explore_neighborhood
 * carries `snippet` (160 chars of display_text) and each edge's `evidence`
 * (up to 400 chars of the citing sentence). Article text is server-only
 * (20260929_01), and this route answers guests too, so every shape below is a
 * WHITELIST: key, kind, title (capped like a locked title), law, number,
 * status, link type, direction. No text field is ever copied through.
 *
 * Pure: `node --test` runs _shape.test.ts.
 */

/** The links the reader shows: citations and the legal relations between documents. */
export const READER_LINK_TYPES = [
  "CITES_ARTICLE",
  "EXEMPTS_FROM",
  "SUBJECT_TO",
  "PENALIZES",
  "PARENT_LAW",
  "SUPERSEDES_LAW",
  "REPLACED_BY",
  "IMPLEMENTED_BY",
] as const;
export type ReaderLinkType = (typeof READER_LINK_TYPES)[number];

/** Same cap as a locked article's title in the law route (LOCKED_TITLE_CHARS). */
export const TITLE_CHARS = 120;
export const MAX_LINKS_PER_SIDE = 8;

export interface ReaderLink {
  /** Article id (for `#id`) when the other end is an article; null for a law node. */
  articleId: string | null;
  kind: "article" | "law";
  lawSlug: string;
  title: string;
  articleNumber: number | null;
  status: string | null;
  linkType: ReaderLinkType;
  /** "out": this article cites it; "in": it cites this article. */
  direction: "out" | "in";
}

export interface ArticleLinks {
  found: boolean;
  outgoing: ReaderLink[];
  incoming: ReaderLink[];
}

const isType = (t: unknown): t is ReaderLinkType => (READER_LINK_TYPES as readonly string[]).includes(String(t));

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

interface RawNode {
  node_key?: unknown;
  node_type?: unknown;
  title?: unknown;
  law_slug?: unknown;
  article_number?: unknown;
  item_status?: unknown;
  doc_status?: unknown;
}
interface RawEdge {
  source?: unknown;
  target?: unknown;
  edge_type?: unknown;
}

/**
 * graph_rag_explore_neighborhood(article:<id>, 1, READER_LINK_TYPES) → the
 * reader's bar. `found` is false when the article is not in the graph or the
 * graph's article belongs to another law (the URL's slug is the authority).
 */
export function shapeArticleLinks(raw: unknown, articleId: string, lawSlug: string): ArticleLinks {
  const empty: ArticleLinks = { found: false, outgoing: [], incoming: [] };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as { found?: unknown; nodes?: unknown; edges?: unknown };
  if (r.found !== true) return empty;
  const center = `article:${articleId}`;
  const nodes = new Map<string, RawNode>();
  for (const n of Array.isArray(r.nodes) ? (r.nodes as RawNode[]) : []) {
    if (typeof n?.node_key === "string") nodes.set(n.node_key, n);
  }
  if (nodes.get(center)?.law_slug !== lawSlug) return empty;

  const out: ArticleLinks = { found: true, outgoing: [], incoming: [] };
  const seen = new Set<string>();
  for (const e of Array.isArray(r.edges) ? (r.edges as RawEdge[]) : []) {
    if (!isType(e?.edge_type)) continue;
    const direction = e.source === center ? "out" : e.target === center ? "in" : null;
    if (!direction) continue;
    const otherKey = String(direction === "out" ? e.target : e.source);
    const other = nodes.get(otherKey);
    if (!other) continue;
    const kind = other.node_type === "article" ? "article" : other.node_type === "law" ? "law" : null;
    const slug = typeof other.law_slug === "string" ? other.law_slug : "";
    if (!kind || !slug) continue;
    const side = direction === "out" ? out.outgoing : out.incoming;
    if (side.length >= MAX_LINKS_PER_SIDE || seen.has(`${direction}|${otherKey}`)) continue;
    seen.add(`${direction}|${otherKey}`);
    side.push({
      articleId: kind === "article" && otherKey.startsWith("article:") ? otherKey.slice("article:".length) : null,
      kind,
      lawSlug: slug,
      title: capTitle(other.title),
      articleNumber: typeof other.article_number === "number" ? other.article_number : null,
      status: typeof (kind === "article" ? other.item_status : other.doc_status) === "string"
        ? String(kind === "article" ? other.item_status : other.doc_status)
        : null,
      linkType: e.edge_type as ReaderLinkType,
      direction,
    });
  }
  return out;
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

/** library_reader_law_links(slug) → the map's nodes; anything malformed is dropped. */
export function shapeLawLinks(raw: unknown): { links: LawLink[]; truncated: boolean } {
  const r = (raw && typeof raw === "object" ? raw : {}) as { links?: unknown; truncated?: unknown };
  const links: LawLink[] = [];
  for (const l of Array.isArray(r.links) ? (r.links as Record<string, unknown>[]) : []) {
    const slug = typeof l?.slug === "string" ? l.slug : "";
    if (!slug) continue;
    links.push({
      slug,
      title: capTitle(l.title) || slug,
      status: typeof l.status === "string" ? l.status : null,
      out: Number.isInteger(l.out) ? (l.out as number) : 0,
      in: Number.isInteger(l.in) ? (l.in as number) : 0,
      types: (Array.isArray(l.types) ? l.types : []).filter(isType),
    });
  }
  return { links, truncated: r.truncated === true };
}
