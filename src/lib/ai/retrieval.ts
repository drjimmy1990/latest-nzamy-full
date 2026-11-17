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
import { stripArticleAuditNotes } from "../library/lawPreambleBlocks.ts";
import { lawNamePattern, rankLaws } from "./citationCheck.ts";
import { citedStatus, type CitedStatus } from "./citationStatus.ts";
import { articleRefs, bareArticleNumbers, lawNames, stripFraming } from "./questionRefs.ts";

/** The service-role client: the relevance functions and the article text are service-role only. */
type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export type SourceKind = "article" | "principle" | "decree" | "feqh";

export interface RetrievalLimits {
  /** Articles kept, at most. */
  laws: number;
  /** Principles kept, at most. */
  principles: number;
  /** Royal decrees / circulars kept when GraphRAG matches (optional). */
  decrees?: number;
  /** Fiqh jurisprudence blocks kept when GraphRAG matches (optional). */
  feqh?: number;
}

export interface RetrieveGraphOptions {
  /** Enable Hybrid Legal GraphRAG (`public.graph_rag_retrieve`) with automatic fallback to FTS RPCs. */
  useGraph?: boolean;
  /** Normalized `halfvec` literal (`'[0.012,-0.034,...]'`) for semantic + 1-hop retrieval. */
  queryEmbedding?: string | null;
  /** Explicit model_id override; defaults to DB's active `is_default` model. */
  modelId?: string | null;
  /** Told which path answered and how long the graph took (scripts/graph-gold.mjs). Never throws into the caller. */
  onTrace?: (trace: RetrieveTrace) => void;
}

/** What one retrieval did — for measurement only; the answer never depends on it. */
export interface RetrieveTrace {
  /** "graph": the graph answered; "keyword": the keyword search did (switch off, or the graph missed). */
  path: "graph" | "keyword";
  /** The graph function called last, or null when the graph was not asked. */
  graphFn: string | null;
  /** The graph call(s), milliseconds; null when the graph was not asked. */
  graphMs: number | null;
  /** Why the graph did not answer: a PostgREST / Postgres code, "timeout", "not_ready", "no_hits"; null when it answered. */
  graphMiss: string | null;
  /** The node keys sent as seeds (the articles the question names). */
  seeds: string[];
  /** The graph's `routing` object, as returned. */
  routing: unknown;
  /** The arguments of the last graph call, so a measurement can replay them (the embedding included); null when the graph was not asked. */
  graphArgs: Record<string, unknown> | null;
}

/** At most this many seeds reach the graph (the SQL keeps four). */
export const GRAPH_SEEDS_MAX = 4;

/** How long the graph waits for the named-article lookup before going without seeds. */
export const SEED_LOOKUP_MS = 1500;

/** `p`'s value, or `fallback` when it rejects or takes longer than `ms`. */
export function withinMs<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), Math.max(0, ms));
  });
  return Promise.race([p.catch(() => fallback), late]).finally(() => clearTimeout(timer));
}

/** Graph node keys of looked-up articles, in order, once each (graphBuilder: `article:<id>`). */
export function graphSeedKeys(rows: ReadonlyArray<Record<string, unknown> | null | undefined>): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const id = r && typeof r.id === "string" ? r.id.trim() : "";
    const key = id ? `article:${id}` : "";
    if (key && !out.includes(key)) out.push(key);
    if (out.length >= GRAPH_SEEDS_MAX) break;
  }
  return out;
}

/** One library text as the model sees it. */
export interface PackageSource {
  sid: string;
  kind: SourceKind;
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
  kind: SourceKind;
  id: string;
  title: string;
  url: string;
  /** An article's own status when it is active / amended / repealed (the citation's pill, citationStatus.ts). */
  status?: CitedStatus;
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
    // A repealed article keeps its wording in original_text. BUG-01 (owner
    // 6-Nov): the export's audit notes never reach the model or a citation.
    const text = stripArticleAuditNotes(a.text) || stripArticleAuditNotes(a.original_text);
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
    const pill = citedStatus(a.status);
    map[sid] = { kind: "article", id, title, url: `/laws/${apiSlug(slug)}#${encodeURIComponent(id)}`, ...(pill ? { status: pill } : {}) };
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

/** One article by id, or null (missing, unreadable, or over the budget). Also the explorer lab's open article. */
export async function pinnedArticle(admin: ServiceClient, id: string, signal: AbortSignal): Promise<Row | null> {
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

/** The articles a question names, and the law to search first. */
export interface QuestionRefLookups {
  /** «المادة ٧٧ من نظام العمل» (and, on a law page, «المادة ٧٧» alone): the version in force first; null where none. */
  direct: Promise<Array<Row | null>>;
  /** The law to search first: the page the reader is on, else the first law the question names; null when none. */
  scopeSlug: () => Promise<string | null>;
  /** Whether the question names any article (so `direct` is worth awaiting). */
  namesArticles: boolean;
}

/**
 * The lookups for what a question names outright, shared by the AI's retrieval
 * and the admin retrieval lab so the lab shows what a run would get. Each named
 * law is looked up once, however many refs name it.
 */
export function questionRefLookups(
  admin: ServiceClient,
  question: string,
  lawSlug: string | undefined,
  wantArticles: boolean,
  signal: AbortSignal,
): QuestionRefLookups {
  const refs = wantArticles ? articleRefs(question, DIRECT_REFS_MAX) : [];
  // «المادة الأولى» with no law named, asked on a law page: that law's article.
  const onPage = wantArticles && lawSlug ? bareArticleNumbers(question, DIRECT_REFS_MAX) : [];
  const slugs = new Map<string, Promise<string | null>>();
  const slugOf = (name: string) => {
    if (!slugs.has(name)) slugs.set(name, lawSlugByName(admin, name, signal));
    return slugs.get(name) as Promise<string | null>;
  };
  const scopeName = lawSlug ? null : (refs[0]?.law ?? lawNames(question, 1)[0] ?? null);
  const direct = Promise.all([
    ...refs.map(async (r) => {
      const slug = await slugOf(r.law);
      return slug ? articleByNumber(admin, slug, r.article, signal) : null;
    }),
    ...onPage.map((n) => articleByNumber(admin, lawSlug as string, n, signal)),
  ]);
  let scope: Promise<string | null> | null = null;
  return {
    direct,
    namesArticles: refs.length + onPage.length > 0,
    scopeSlug: () => (scope ??= lawSlug ? Promise.resolve(lawSlug) : scopeName ? slugOf(scopeName) : Promise.resolve(null)),
  };
}

const EDGE_PROVENANCE_AR: Record<string, string> = {
  EXEMPTS_FROM: "استثناء نظامي مرتبط",
  AMENDS_ARTICLE: "تعديل نظامي مرتبط",
  INTERPRETS_ARTICLE: "تفسير قضائي مرتبط",
  PARENT_LAW: "النظام الأساسي المرتبط",
  CITES_ARTICLE: "إحالة نظامية مرتبطة",
  ESTABLISHES_RULE: "قاعدة نظامية مرتبطة",
  NEXT_ARTICLE: "مادة مجاورة في النظام نفسه",
  SUBJECT_TO: "قيد نظامي مرتبط (مع مراعاة)",
  PENALIZES: "عقوبة المخالفة في النظام نفسه",
  REPLACED_BY: "المادة السارية المقابلة للمادة الملغاة",
  DEFINES_TERM: "تعريف المصطلح في النظام",
  SIMILAR_TO: "نص متقارب في المعنى من نظام آخر",
  IMPLEMENTED_BY: "المادة المقابلة في اللائحة التنفيذية أو في نظامها",
};

interface GraphRpcHit {
  kind: SourceKind;
  id: string;
  law_slug?: string | null;
  collection_id?: string | null;
  status?: string | null;
  title: string;
  url: string;
  text: string;
  via_edge_type?: string | null;
  via_from_title?: string | null;
}

interface GraphRpcResult {
  ready?: boolean;
  routing?: unknown;
  articles?: GraphRpcHit[];
  principles?: GraphRpcHit[];
  decrees?: GraphRpcHit[];
  feqh?: GraphRpcHit[];
}

/** The graph call's own deadline: past it the keyword search still has most of the budget. */
export const GRAPH_BUDGET_MS = 2500;

/** Article + principle hits with text: zero means the graph found nothing usable. */
function graphHitCount(r: GraphRpcResult): number {
  const usable = (hits: GraphRpcHit[] | undefined) => (hits ?? []).filter((h) => h && h.id && h.text?.trim()).length;
  return usable(r.articles) + usable(r.principles);
}

/** A graph call's outcome: the answer, or why there is none (a PostgREST / Postgres code, "timeout", "error"). */
interface GraphCall {
  result: GraphRpcResult | null;
  miss: string | null;
}

/** The function is not there (or not with these arguments): PostgREST PGRST202, Postgres 42883. */
export function graphFunctionMissing(code: string | null | undefined): boolean {
  return code === "PGRST202" || code === "42883";
}

/**
 * One graph function call, cancelled at `deadlineMs` or when the whole
 * retrieval is cancelled. Never throws: a miss carries its reason and the
 * caller falls back.
 */
async function callGraphRpc(
  admin: ServiceClient,
  fn: string,
  args: Record<string, unknown>,
  parent: AbortSignal,
  deadlineMs: number,
): Promise<GraphCall> {
  const ctrl = new AbortController();
  const onParentAbort = () => ctrl.abort();
  if (parent.aborted || deadlineMs <= 0) return { result: null, miss: "timeout" };
  parent.addEventListener("abort", onParentAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    type RpcBuilder = PromiseLike<{ data: unknown; error: unknown }> & { abortSignal?: (s: AbortSignal) => unknown };
    const rpc = (admin as unknown as { rpc: (fn: string, a: Record<string, unknown>) => RpcBuilder }).rpc;
    const built = rpc.call(admin, fn, args);
    const call = (typeof built.abortSignal === "function" ? built.abortSignal(ctrl.signal) : built) as RpcBuilder;
    const deadline = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        ctrl.abort();
        resolve("timeout");
      }, deadlineMs);
    });
    const outcome = await Promise.race([Promise.resolve(call).catch(() => null), deadline]);
    if (outcome === "timeout") return { result: null, miss: "timeout" };
    if (!outcome) return { result: null, miss: parent.aborted ? "timeout" : "error" };
    if (outcome.error) {
      const code = (outcome.error as { code?: unknown }).code;
      return { result: null, miss: typeof code === "string" && code ? code : "error" };
    }
    if (!outcome.data || typeof outcome.data !== "object") return { result: null, miss: "error" };
    return { result: outcome.data as GraphRpcResult, miss: null };
  } catch {
    return { result: null, miss: "error" };
  } finally {
    if (timer) clearTimeout(timer);
    parent.removeEventListener("abort", onParentAbort);
  }
}

export async function retrieveLibrary(
  admin: ServiceClient,
  queries: string[],
  limits: RetrievalLimits,
  pin: RetrievalPin = {},
  budgetMs = RETRIEVAL_BUDGET_MS,
  options?: RetrieveGraphOptions,
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
    const named = questionRefLookups(admin, question, pin.lawSlug, limits.laws > 0, ctrl.signal);
    const direct = named.direct;

    // Fetched once, shared by both paths.
    const pinnedP: Promise<Row | null> = pin.articleId ? pinnedArticle(admin, pin.articleId, ctrl.signal) : Promise.resolve(null);

    const trace = (t: RetrieveTrace) => {
      try {
        options?.onTrace?.(t);
      } catch {
        /* measurement only */
      }
    };
    let graphTrace: Omit<RetrieveTrace, "path"> = { graphFn: null, graphMs: null, graphMiss: null, seeds: [], routing: null, graphArgs: null };

    // ── Path A: Hybrid Legal GraphRAG ──
    // Only when the caller asked for it (the NZAMY_GRAPH_RAG switch, read by
    // the route). The graph gets its own short deadline so Path B keeps most
    // of the budget, and any miss — error, timeout, graph not ready, or no
    // article/principle hit — falls through to Path B.
    const canCallGraphRpc =
      Boolean(options?.useGraph) && typeof (admin as unknown as { rpc?: unknown }).rpc === "function";

    if (canCallGraphRpc) {
      const resolvedScopeSlug = await named.scopeSlug();
      // The articles the question names (and the open article) seed the graph
      // (20261117_10): they lead its answer and their legal links follow them.
      // Small indexed lookups, needed by either path anyway. Capped: on a slow
      // database the graph goes without seeds rather than losing its window.
      const seeds =
        named.namesArticles || pin.articleId
          ? await withinMs(
              Promise.all([pinnedP, direct]).then(([p, d]) => graphSeedKeys([p, ...d])),
              SEED_LOOKUP_MS,
              [] as string[],
            )
          : [];
      // Decrees and fiqh blocks only when a caller asks for them: the answer
      // screens and the citation check know articles and principles.
      const decreeLimit = Math.max(0, limits.decrees ?? 0);
      const feqhLimit = Math.max(0, limits.feqh ?? 0);
      const baseArgs = {
        p_tsqueries: parsed,
        p_query_embedding: options?.queryEmbedding ?? null,
        p_model_id: options?.modelId ?? null,
        p_law_slug: resolvedScopeSlug,
        p_limit_laws: limits.laws + 2,
        p_limit_principles: limits.principles,
        p_limit_decrees: decreeLimit,
        p_limit_feqh: feqhLimit,
        p_enable_graph_hop: true,
      };
      const graphStarted = Date.now();
      const deadlineAt = graphStarted + Math.min(GRAPH_BUDGET_MS, budgetMs);
      // With seeds: the scoped function; before 20261117_10 it does not take
      // them (PGRST202), so the nine-argument one answers within the same deadline.
      let graphFn = seeds.length > 0 ? "graph_rag_retrieve_scoped" : "graph_rag_retrieve";
      let graphArgs: Record<string, unknown> = seeds.length > 0 ? { ...baseArgs, p_scope: "auto", p_seed_keys: seeds } : baseArgs;
      let call = await callGraphRpc(admin, graphFn, graphArgs, ctrl.signal, deadlineAt - Date.now());
      if (seeds.length > 0 && graphFunctionMissing(call.miss)) {
        graphFn = "graph_rag_retrieve";
        graphArgs = baseArgs;
        call = await callGraphRpc(admin, graphFn, graphArgs, ctrl.signal, deadlineAt - Date.now());
      }
      const graphOutcome = call.result;
      const graphUsable = Boolean(graphOutcome && graphOutcome.ready === true && graphHitCount(graphOutcome) > 0);
      graphTrace = {
        graphFn,
        graphMs: Date.now() - graphStarted,
        graphMiss: call.miss ?? (graphOutcome?.ready !== true ? "not_ready" : graphUsable ? null : "no_hits"),
        seeds,
        routing: graphOutcome?.routing ?? null,
        graphArgs,
      };

      if (graphOutcome && graphUsable) {
        const [pinned, directRows] = await Promise.all([pinnedP, direct]);
        const leadSeen = new Set<string>();
        const leadRows: Row[] = [];
        for (const r of [pinned, ...directRows]) {
          if (r && str(r.id) && !leadSeen.has(str(r.id))) {
            leadSeen.add(str(r.id));
            leadRows.push(r);
          }
        }

        const leadSlugs = [...new Set(leadRows.map((a) => str(a.law_slug)).filter(Boolean))];
        const leadTitles = new Map<string, string>();
        if (leadSlugs.length > 0) {
          const { data } = await admin.schema("library").from("laws").select("slug, title").in("slug", leadSlugs);
          for (const l of (data ?? []) as Row[]) leadTitles.set(str(l.slug), str(l.title));
        }

        const builtLead = buildSources(leadRows, [], leadTitles, pinned ? str(pinned.id) : null);
        const sources: PackageSource[] = [...builtLead.sources];
        const map: Record<string, SourceRef> = { ...builtLead.map };
        let n = sources.length;

        const maxArticlesTotal = limits.laws + (pinned ? 1 : 0);
        let articleCount = sources.filter((s) => s.kind === "article").length;

        const appendGraphHits = (hits: readonly GraphRpcHit[] | undefined, sectionCap: number) => {
          let added = 0;
          for (const h of hits ?? []) {
            if (!h || !h.id || !h.text?.trim()) continue;
            if (h.kind === "article") {
              if (leadSeen.has(h.id)) continue;
              if (articleCount >= maxArticlesTotal) continue;
            } else if (added >= sectionCap) {
              continue;
            }

            const cleanText = stripArticleAuditNotes(h.text).trim();
            if (!cleanText) continue;
            if (h.kind === "article") {
              leadSeen.add(h.id);
              articleCount++;
            }

            const plainTitle = (h.title ?? "").trim() || h.id;
            const statusNote = STATUS_NOTE[str(h.status)];
            const edgeNote = h.via_edge_type ? EDGE_PROVENANCE_AR[h.via_edge_type] : undefined;
            const annotations = [statusNote, edgeNote].filter(Boolean).join(" · ");
            const modelTitle = annotations ? `${plainTitle} (${annotations})` : plainTitle;

            const sid = `S${++n}`;
            sources.push({ sid, kind: h.kind, title: modelTitle, text: clip(cleanText) });
            const pill = h.kind === "article" ? citedStatus(h.status) : undefined;
            map[sid] = { kind: h.kind, id: h.id, title: plainTitle, url: h.url, ...(pill ? { status: pill } : {}) };
            added++;
          }
        };

        appendGraphHits(graphOutcome.articles, limits.laws);
        appendGraphHits(graphOutcome.principles, limits.principles);
        appendGraphHits(graphOutcome.decrees, decreeLimit);
        appendGraphHits(graphOutcome.feqh, feqhLimit);

        if (sources.length > builtLead.sources.length) {
          trace({ path: "graph", ...graphTrace });
          return { sources, map };
        }
        // Only the named articles came back: the keyword search adds more.
        graphTrace = { ...graphTrace, graphMiss: "no_hits" };
      }
    }

    // ── Path B: the keyword search (switch off, graph not ready, or the graph found nothing) ──
    const scoped = (async (): Promise<Row[][]> => {
      if (limits.laws === 0 || parsed.length === 0) return [];
      const slug = await named.scopeSlug();
      return slug ? Promise.all(parsed.map((t) => lawScopedRows(admin, slug, t, FETCH_PER_QUERY.laws, ctrl.signal))) : [];
    })();
    const [pinned, directRows, scopedLists, lawLists, principleLists] = await Promise.all([
      pinnedP,
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
    trace({ path: "keyword", ...graphTrace });
    return buildSources(articles, principles, titles, pinned ? str(pinned.id) : null);
  } finally {
    clearTimeout(timer);
  }
}
