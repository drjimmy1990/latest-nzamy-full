/**
 * extLibrary.ts — the pure half of /api/v1/ext/library, /citations and /account (the MCP door).
 *
 * The one rule that matters: library text leaves only for a reader the platform's own rule lets
 * read it. Here that rule is STRICTER than the website's on purpose: the website's free
 * "first N articles of a law" preview is not offered through a token. A reader gets text only
 * when they hold full library access (Pro or higher, a library grant, an admin) or the law is on
 * the whitelist; anyone else gets numbers, titles and the status (public catalogue facts), and
 * `locked: true`. The status is always the row's own, never inferred.
 *
 * Pure: relative imports only, so `node --test` runs it.
 */

/** Same words as the client contract (mcp/nezamy-client/src/schemas.ts USAGE_NOTICE_AR). */
export const EXT_USAGE_NOTICE_AR =
  "النص من مكتبة نظامي للاستعانة الشخصية في عمل المحامي، ولا يجوز نشره أو إعادة توزيعه. تحقق من حالة المادة قبل الاستشهاد بها.";

/** Search and neighbour snippets: never more than this, even for a full reader (the article route serves text). */
export const EXT_SNIPPET_MAX = 240;
/** An excerpt of an article (`?excerpt=1`, or the daily read cap spent). */
export const EXT_EXCERPT_MAX = 240;
/** The longest article text one reply carries. */
export const EXT_TEXT_MAX = 20_000;

export interface ExtAccess {
  hasFullAccess: boolean;
  whitelistedSlugs: readonly string[];
  freeItemsByType: Readonly<Record<string, readonly string[]>>;
}

export type ExtLegalStatus = "in_force" | "amended" | "repealed" | "unknown";

/** The library's own status word → the contract's; anything undeclared is "unknown", never "in force". */
export function extStatus(raw: unknown): ExtLegalStatus {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "active") return "in_force";
  if (s === "amended") return "amended";
  if (s === "repealed") return "repealed";
  return "unknown";
}

/** May this reader see the text of an article of `lawSlug`? (Stricter than the web: no free preview.) */
export function mayReadLawText(access: ExtAccess, lawSlug: string): boolean {
  return access.hasFullAccess || access.whitelistedSlugs.includes(lawSlug);
}

/** May this reader see the text of a judicial principle? */
export function mayReadPrincipleText(access: ExtAccess, id: string): boolean {
  return access.hasFullAccess || (access.freeItemsByType.principles ?? []).includes(id);
}

/** Cut at a word, never in the middle of one; empty stays empty. */
export function clipText(value: unknown, max: number): string {
  const s = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** `/laws/<slug>#<id>` → the slug, or null. */
export function slugFromUrl(url: unknown): string | null {
  const m = /^\/laws\/([^#?/]+)/.exec(str(url));
  if (!m) return null;
  try { return decodeURIComponent(m[1]!); } catch { return null; }
}

export interface RetrievedHit {
  kind: string;
  id: string;
  title: string;
  url: string;
  text: string;
}
export interface ArticleMeta { law_slug: string; number: number | null; status: string | null }

/**
 * Retrieval's sources → the contract's hits. `meta` is read from library.articles for the ids
 * found (number, law, status), `lawTitles` from library.laws. A reader without the right to the
 * text gets an empty snippet and `locked: true`; the row is still listed (a catalogue fact).
 */
export function toExtHits(
  hits: readonly RetrievedHit[],
  meta: ReadonlyMap<string, ArticleMeta>,
  lawTitles: ReadonlyMap<string, string>,
  access: ExtAccess,
  limit: number,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const h of hits) {
    if (h.kind !== "article" && h.kind !== "principle") continue; // decrees / fiqh: not offered through a token yet
    const m = h.kind === "article" ? meta.get(h.id) : undefined;
    const slug = h.kind === "article" ? m?.law_slug ?? slugFromUrl(h.url) : null;
    if (h.kind === "article" && !slug) continue;
    const may = h.kind === "article" ? mayReadLawText(access, slug!) : mayReadPrincipleText(access, h.id);
    out.push({
      id: h.id,
      kind: h.kind,
      law_slug: slug,
      law_title: (slug ? lawTitles.get(slug) : null) ?? "",
      article_number: m?.number ?? null,
      title: clipText(h.title, 200) || h.id,
      snippet: may ? clipText(h.text, EXT_SNIPPET_MAX) : "",
      status: m ? extStatus(m.status) : "unknown",
      url: h.url.startsWith("/") ? h.url : "",
      locked: !may,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export interface ArticleRow {
  id: string;
  law_slug: string;
  number: number | null;
  number_text?: string | null;
  title?: string | null;
  text?: string | null;
  original_text?: string | null;
  status?: string | null;
}

export type LockReason = "plan" | "daily_quota" | "hourly_quota" | "library_lock" | "device_limit";

/**
 * One article for the contract. `mayRead` is the entitlement decision (mayReadLawText) and
 * `refusal` a quota / lock refusal already decided by the route; either one means: no text.
 * `excerptOnly` serves at most EXT_EXCERPT_MAX characters. A repealed article keeps its wording
 * in original_text, so that is what a reader of it gets.
 */
export function toExtArticle(
  row: ArticleRow,
  lawTitle: string,
  decision: { mayRead: boolean; refusal: LockReason | null; excerptOnly: boolean; remainingToday: number | null },
  amendedBy: ReadonlyArray<{ id: string; title: string }>,
  requestId: string,
): Record<string, unknown> {
  const locked = !decision.mayRead || decision.refusal !== null;
  const lockReason: LockReason | null = !decision.mayRead ? "plan" : decision.refusal;
  const body = (row.text ?? "").trim() || (row.original_text ?? "").trim();
  const full = !locked && !decision.excerptOnly;
  const text = locked ? null : full ? body.slice(0, EXT_TEXT_MAX) : clipText(body, EXT_EXCERPT_MAX);
  return {
    request_id: requestId,
    id: row.id,
    law_slug: row.law_slug,
    law_title: lawTitle,
    article_number: row.number,
    heading: row.title ? clipText(row.title, 200) : null,
    text,
    locked,
    ...(lockReason ? { lock_reason: lockReason } : {}),
    text_truncated: full ? body.length > EXT_TEXT_MAX : !locked && body.length > EXT_EXCERPT_MAX,
    status: extStatus(row.status),
    amended_by: amendedBy.slice(0, 10),
    usage_notice: EXT_USAGE_NOTICE_AR,
    quota: { remaining_today: decision.remainingToday },
    ...(!locked && decision.excerptOnly ? { excerpt_only: true } : {}),
  };
}

/* ---------- neighbours (library_graph.graph_rag_explore_neighborhood) ---------- */

/**
 * The explorer's link types → the contract's eight. Outline links (part of a chapter, next
 * article), concept and term links are noise for a lawyer and are not offered (null).
 */
const EDGE_MAP: Record<string, string | null> = {
  CITES_ARTICLE: "CITES",
  EXEMPTS_FROM: "EXCEPTS",
  SUBJECT_TO: "EXCEPTS",
  AMENDS_ARTICLE: "AMENDS",
  INTERPRETS_ARTICLE: "INTERPRETS",
  PENALIZES: "PENALIZES",
  IMPLEMENTED_BY: "IMPLEMENTS",
  SUPERSEDES_LAW: "REPLACES",
  REPLACED_BY: "REPLACES",
  ESTABLISHES_RULE: "RELATED",
  SIMILAR_TO: "RELATED",
  PARENT_LAW: null, DECONSTRUCTS_CONCEPT: null, HAS_CONCEPT: null, DEFINES_TERM: null, NEXT_ARTICLE: null, PART_OF: null,
};
/** The contract's type → the explorer types that produce it (for the `edge` filter). */
export function explorerTypesFor(edge: string): string[] {
  return Object.entries(EDGE_MAP).filter(([, v]) => v === edge).map(([k]) => k);
}
export const EXT_EDGE_TYPES = ["CITES", "EXCEPTS", "AMENDS", "INTERPRETS", "PENALIZES", "IMPLEMENTS", "REPLACES", "RELATED"] as const;

const NODE_KINDS = new Set(["article", "principle", "decree", "feqh", "law"]);

/** `article:<id>` → `<id>` (the id the library uses everywhere else). */
export const nodeKeyForArticle = (id: string) => `article:${id}`;
const idFromKey = (key: string) => key.replace(/^(article|principle|decree|feqh|law):/, "");

/** The explorer's neighbourhood → the contract's edges, from the root's point of view. */
export function toExtEdges(raw: unknown, rootKey: string, access: ExtAccess, limit: number): Array<Record<string, unknown>> {
  if (!isObject(raw) || raw.found !== true) return [];
  const nodes = new Map<string, Record<string, unknown>>();
  for (const n of Array.isArray(raw.nodes) ? raw.nodes : []) if (isObject(n) && typeof n.node_key === "string") nodes.set(n.node_key, n);
  const out: Array<Record<string, unknown>> = [];
  for (const e of Array.isArray(raw.edges) ? raw.edges : []) {
    if (!isObject(e)) continue;
    const type = EDGE_MAP[str(e.edge_type)];
    if (!type) continue;
    const source = str(e.source), target = str(e.target);
    const direction = source === rootKey ? "out" : target === rootKey ? "in" : null;
    if (!direction) continue; // depth-2 hops are listed from their own end only when they touch the root
    const other = nodes.get(direction === "out" ? target : source);
    if (!other) continue;
    const kind = str(other.node_type);
    if (!NODE_KINDS.has(kind)) continue;
    const slug = str(other.law_slug) || null;
    const id = typeof other.node_key === "string" ? idFromKey(other.node_key) : "";
    const may = kind === "article" ? !!slug && mayReadLawText(access, slug) : kind === "principle" ? mayReadPrincipleText(access, id) : access.hasFullAccess;
    out.push({
      type,
      direction,
      node: {
        id,
        kind,
        title: clipText(other.title, 200) || id,
        law_title: null,
        article_number: typeof other.article_number === "number" && Number.isInteger(other.article_number) ? other.article_number : null,
        status: extStatus(str(other.item_status) || str(other.doc_status)),
        snippet: may ? clipText(other.snippet, EXT_SNIPPET_MAX) : "",
        locked: !may,
      },
    });
    if (out.length >= limit) break;
  }
  return out;
}
