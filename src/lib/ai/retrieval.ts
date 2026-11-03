/**
 * retrieval.ts — the library texts a wave-2 tool answers from (plan §2.2
 * `sources`, §5 wave 2). The app, not n8n, picks them:
 *
 *   the user's question
 *     → n8n «lib-queries» turns it into 2–4 short searches (a whole question
 *       ANDed matches almost nothing, and ORed matches thousands, which the
 *       relevance functions stop ranking above 5,000 — measured on prod
 *       2026-10-28)
 *     → each search runs through the 20261026_52 relevance functions, articles
 *       and principles at once, inside one time budget
 *     → the hits are interleaved by rank across the searches, deduped and cut
 *       to the tool's counts
 *     → short ids S1…Sn: the texts go to n8n in the package, the map from id
 *       to library item is stored on the run, and settleRunWith keeps only the
 *       citations that name an id the app sent.
 *
 * What the question names outright comes first (questionRefs.ts, owner's live
 * test 29 Oct): an article named with its law («المادة الأولى من نظام
 * العمل») is read directly, and a named law — or the law page the reader is
 * on — is searched before the whole library.
 *
 * The relevance functions are service-role only (they return server-only
 * text), so `admin` is typed as the service-role client (ServiceClient, the
 * alias library-column-lock.test.ts recognises).
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` runs it.
 */
import type { createServiceClient } from "../supabase/server.ts";
import { parseSearchQuery } from "../../utils/normalizeArabic.ts";
import { articleDisplayLabel } from "../../app/api/library/laws/[slug]/_article-label.ts";
import { apiSlug } from "../../utils/apiSlug.ts";
import { lawNamePattern, rankLaws } from "./citationCheck.ts";
import { articleRefs, bareArticleNumbers, lawNames, stripFraming } from "./questionRefs.ts";

/** The service-role client: the relevance functions and the article text are service-role only. */
type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export interface RetrievalLimits {
  /** Articles kept, at most. */
  laws: number;
  /** Principles kept, at most. */
  principles: number;
}

/** One library text as the model sees it. */
export interface PackageSource {
  sid: string;
  kind: "article" | "principle";
  title: string;
  text: string;
  /** The article the user has open (L5 «اشرح لي»): always S1, whatever the searches found. */
  pinned?: true;
}

/** What the answer must start from, read directly rather than found by a search. */
export interface RetrievalPin {
  /** The article the reader has open (L5 «اشرح لي»). */
  articleId?: string;
  /** The law page the reader is on (L5): searched before the whole library. */
  lawSlug?: string;
  /** The user's own words: the articles and laws they name. */
  question?: string;
}

/** The run's source map entry (runCore.SourceMap): what a citation resolves to. */
export interface SourceRef {
  kind: "article" | "principle";
  id: string;
  title: string;
  url: string;
}

export interface Retrieved {
  sources: PackageSource[];
  map: Record<string, SourceRef>;
}

/** The longest text sent per source; a fast tool's sources stay near 6,000 tokens. */
export const SOURCE_TEXT_MAX = 1500;
/** Each search: rows fetched per section before interleaving. */
const FETCH_PER_QUERY = { laws: 6, principles: 3 };
/** The whole retrieval, every search included. */
export const RETRIEVAL_BUDGET_MS = 6000;
/** Searches longer than this are a sentence, not a search. */
const QUERY_MAX = 80;
const QUERIES_MAX = 4;

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** The model's searches, cleaned: 1–4 distinct short strings that parse. */
export function cleanQueries(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const q of raw) {
    if (typeof q !== "string") continue;
    // No operators from the model: quotes and slashes would change the query's
    // meaning in parseSearchQuery, so a search is plain words ANDed — and,
    // ANDed, a framing word («تعريف») the answering text never says loses it.
    const t = stripFraming(q.replace(/["/\\()+]/g, " ").replace(/\s+/g, " ").trim());
    if (t.length < 2 || t.length > QUERY_MAX || out.includes(t)) continue;
    try {
      if (!parseSearchQuery(t).tsquery) continue;
    } catch {
      continue;
    }
    out.push(t);
    if (out.length >= QUERIES_MAX) break;
  }
  return out;
}

/** Rank-order interleave: the first hit of every search, then the second… */
export function interleave(lists: Row[][], limit: number): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest && out.length < limit; i++) {
    for (const list of lists) {
      const row = list[i];
      const id = row ? str(row.id) : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(row);
      if (out.length >= limit) break;
    }
  }
  return out;
}

const STATUS_NOTE: Record<string, string> = { repealed: "مادة ملغاة", amended: "مادة معدّلة" };

const clip = (s: string) => (s.length > SOURCE_TEXT_MAX ? `${s.slice(0, SOURCE_TEXT_MAX)}…` : s);

/** Rows and law titles → the package texts and the run's source map, S1… in order. */
export function buildSources(
  articles: Row[],
  principles: Row[],
  lawTitles: Map<string, string>,
  pinnedId: string | null = null,
): Retrieved {
  const sources: PackageSource[] = [];
  const map: Record<string, SourceRef> = {};
  let n = 0;
  for (const a of articles) {
    // A repealed article keeps its wording in original_text.
    const text = str(a.text) || str(a.original_text);
    if (!text.trim()) continue;
    const slug = str(a.law_slug);
    const id = str(a.id);
    const law = lawTitles.get(slug) ?? "";
    const label = articleDisplayLabel(a.number_text as string | null, a.number as number | null);
    const title = [law, label].filter(Boolean).join(" — ") || id;
    // The model must know a repealed or amended text is not the law in force.
    const status = STATUS_NOTE[str(a.status)];
    const sid = `S${++n}`;
    sources.push({
      sid,
      kind: "article",
      title: status ? `${title} (${status})` : title,
      text: clip(text),
      ...(pinnedId !== null && id === pinnedId ? { pinned: true as const } : {}),
    });
    map[sid] = { kind: "article", id, title, url: `/laws/${apiSlug(slug)}#${encodeURIComponent(id)}` };
  }
  for (const p of principles) {
    const text = str(p.text);
    if (!text.trim()) continue;
    const id = str(p.id);
    const col = (p.judicial_collections ?? {}) as Row;
    const body = str(p.issuing_body) || str(col.court);
    const title = [`مبدأ رقم ${str(p.principle_number) || "—"}`, body, str(p.year_hijri) ? `${str(p.year_hijri)}هـ` : ""]
      .filter(Boolean)
      .join(" — ");
    const sid = `S${++n}`;
    sources.push({ sid, kind: "principle", title, text: clip(text) });
    map[sid] = { kind: "principle", id, title, url: `/precedents/${apiSlug(str(col.id))}#${encodeURIComponent(id)}` };
  }
  return { sources, map };
}

type RpcRows = { rows: Row[]; ranked: boolean };

async function rankedRows(
  admin: ServiceClient,
  fn: string,
  tsquery: string,
  fetch: number,
  signal: AbortSignal,
): Promise<Row[]> {
  const { data, error } = await admin
    .schema("library")
    .rpc(fn, { p_tsquery: tsquery, p_offset: 0, p_fetch: fetch })
    .abortSignal(signal);
  if (error) {
    // One failed search (a timeout, a cancelled budget) costs only its hits.
    if (!signal.aborted) console.warn("[ai/retrieval]", fn, error.code, error.message);
    return [];
  }
  const page = (data ?? {}) as Partial<RpcRows>;
  // Above 5,000 matches the function orders by id, not relevance: those rows
  // are the alphabet's first laws, not answers, so they are dropped.
  if (page.ranked === false || !Array.isArray(page.rows)) return [];
  return page.rows;
}

/**
 * The searches → the library texts. An empty result means nothing in the
 * library matched; the caller refunds rather than let the model answer from
 * memory.
 */
const ARTICLE_COLUMNS = "id, number, number_text, status, text, original_text, law_slug";

/** Articles a named reference resolves to, at most this many. */
const DIRECT_REFS_MAX = 2;

/** A law's slug from its name in a question, longest name first («نظام العمل والعمال» → «نظام العمل»), or null. */
async function lawSlugByName(admin: ServiceClient, name: string, signal: AbortSignal): Promise<string | null> {
  const ws = name.split(/\s+/);
  for (let n = ws.length; n >= 2; n--) {
    const candidate = ws.slice(0, n).join(" ");
    const { data, error } = await admin
      .schema("library")
      .from("laws")
      .select("slug, title, status")
      .ilike("title", lawNamePattern(candidate))
      .abortSignal(signal)
      .limit(25);
    if (error) {
      if (!signal.aborted) console.warn("[ai/retrieval] law by name", error.code, error.message);
      return null;
    }
    const best = rankLaws(candidate, (data ?? []) as Array<{ slug: string; title: string; status: string | null }>)[0];
    if (best) return best.slug;
  }
  return null;
}

const VERSION_RANK: Record<string, number> = { active: 0, amended: 1, repealed: 2 };

/** One article by law and number, the version in force first; null when there is none. */
async function articleByNumber(admin: ServiceClient, slug: string, number: number, signal: AbortSignal): Promise<Row | null> {
  const { data, error } = await admin
    .schema("library")
    .from("articles")
    .select(ARTICLE_COLUMNS)
    .eq("law_slug", slug)
    .eq("number", number)
    .abortSignal(signal)
    .limit(5);
  if (error) {
    if (!signal.aborted) console.warn("[ai/retrieval] article by number", error.code, error.message);
    return null;
  }
  const rows = [...((data ?? []) as Row[])].sort((a, b) => (VERSION_RANK[str(a.status)] ?? 0) - (VERSION_RANK[str(b.status)] ?? 0));
  return rows[0] ?? null;
}

/** One search inside one law: its matching articles in the law's own order (definitions first), no ranking needed inside one law. */
async function lawScopedRows(admin: ServiceClient, slug: string, tsquery: string, fetch: number, signal: AbortSignal): Promise<Row[]> {
  const { data, error } = await admin
    .schema("library")
    .from("articles")
    .select(ARTICLE_COLUMNS)
    .eq("law_slug", slug)
    .textSearch("fts", tsquery, { config: "simple" })
    .order("number", { ascending: true })
    .abortSignal(signal)
    .limit(fetch);
  if (error) {
    if (!signal.aborted) console.warn("[ai/retrieval] law-scoped search", error.code, error.message);
    return [];
  }
  return (data ?? []) as Row[];
}

/** One article by id, or null (missing, unreadable, or over the budget). */
async function pinnedArticle(admin: ServiceClient, id: string, signal: AbortSignal): Promise<Row | null> {
  const { data, error } = await admin
    .schema("library")
    .from("articles")
    .select(ARTICLE_COLUMNS)
    .eq("id", id)
    .abortSignal(signal)
    .maybeSingle();
  if (error && !signal.aborted) console.warn("[ai/retrieval] pinned article", error.code, error.message);
  return (data as Row | null) ?? null;
}

export async function retrieveLibrary(
  admin: ServiceClient,
  queries: string[],
  limits: RetrievalLimits,
  pin: RetrievalPin = {},
  budgetMs = RETRIEVAL_BUDGET_MS,
): Promise<Retrieved> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), budgetMs);
  try {
    const parsed = queries
      .map((q) => {
        try {
          return parseSearchQuery(q).tsquery;
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    const question = pin.question ?? "";
    const refs = limits.laws > 0 ? articleRefs(question, DIRECT_REFS_MAX) : [];
    // «المادة الأولى» with no law named, asked on a law page: that law's article.
    const onPage = limits.laws > 0 && pin.lawSlug ? bareArticleNumbers(question, DIRECT_REFS_MAX) : [];
    // Each named law is looked up once, however many refs name it.
    const slugs = new Map<string, Promise<string | null>>();
    const slugOf = (name: string) => {
      if (!slugs.has(name)) slugs.set(name, lawSlugByName(admin, name, ctrl.signal));
      return slugs.get(name) as Promise<string | null>;
    };
    // The law to search first: the page the reader is on, else the first law the question names.
    const scopeName = pin.lawSlug ? null : (refs[0]?.law ?? lawNames(question, 1)[0] ?? null);
    const scoped = (async (): Promise<Row[][]> => {
      if (limits.laws === 0 || parsed.length === 0) return [];
      const slug = pin.lawSlug ?? (scopeName ? await slugOf(scopeName) : null);
      return slug ? Promise.all(parsed.map((t) => lawScopedRows(admin, slug, t, FETCH_PER_QUERY.laws, ctrl.signal))) : [];
    })();
    const direct = Promise.all([
      ...refs.map(async (r) => {
        const slug = await slugOf(r.law);
        return slug ? articleByNumber(admin, slug, r.article, ctrl.signal) : null;
      }),
      ...onPage.map((n) => articleByNumber(admin, pin.lawSlug as string, n, ctrl.signal)),
    ]);
    const [pinned, directRows, scopedLists, lawLists, principleLists] = await Promise.all([
      pin.articleId ? pinnedArticle(admin, pin.articleId, ctrl.signal) : Promise.resolve(null),
      direct,
      scoped,
      limits.laws > 0
        ? Promise.all(parsed.map((t) => rankedRows(admin, "search_law_articles_relevance", t, FETCH_PER_QUERY.laws, ctrl.signal)))
        : Promise.resolve([] as Row[][]),
      limits.principles > 0
        ? Promise.all(parsed.map((t) => rankedRows(admin, "search_principles_relevance", t, FETCH_PER_QUERY.principles, ctrl.signal)))
        : Promise.resolve([] as Row[][]),
    ]);
    // The open article, then the articles the question names, then the law's
    // own hits, then the whole library's: each once (the law's hits all go
    // before the library's — interleaved, the library's noise took S2). The
    // open article is on top of the tool's count, as before.
    const seen = new Set<string>();
    const lead: Row[] = [];
    for (const r of [pinned, ...directRows]) {
      if (r && str(r.id) && !seen.has(str(r.id))) (seen.add(str(r.id)), lead.push(r));
    }
    const searched = [...interleave(scopedLists, limits.laws + lead.length), ...interleave(lawLists, limits.laws + lead.length)].filter(
      (a) => !seen.has(str(a.id)) && (seen.add(str(a.id)), true),
    );
    const articles = [...lead, ...searched].slice(0, limits.laws + (pinned ? 1 : 0));
    const principles = interleave(principleLists, limits.principles);

    const lawSlugs = [...new Set(articles.map((a) => str(a.law_slug)).filter(Boolean))];
    const titles = new Map<string, string>();
    if (lawSlugs.length > 0) {
      const { data, error } = await admin.schema("library").from("laws").select("slug, title").in("slug", lawSlugs);
      if (error) console.warn("[ai/retrieval] law titles", error.code, error.message);
      for (const l of (data ?? []) as Row[]) titles.set(str(l.slug), str(l.title));
    }
    return buildSources(articles, principles, titles, pinned ? str(pinned.id) : null);
  } finally {
    clearTimeout(timer);
  }
}
