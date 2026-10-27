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
 * The relevance functions are service-role only (they return server-only
 * text), so `admin` must be the service-role client.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSearchQuery } from "../../utils/normalizeArabic.ts";
import { articleDisplayLabel } from "../../app/api/library/laws/[slug]/_article-label.ts";
import { apiSlug } from "../../utils/apiSlug.ts";

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
    // meaning in parseSearchQuery, so a search is plain words ANDed.
    const t = q.replace(/["/\\()+]/g, " ").replace(/\s+/g, " ").trim();
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
export function buildSources(articles: Row[], principles: Row[], lawTitles: Map<string, string>): Retrieved {
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
    sources.push({ sid, kind: "article", title: status ? `${title} (${status})` : title, text: clip(text) });
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
  admin: SupabaseClient,
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
export async function retrieveLibrary(
  admin: SupabaseClient,
  queries: string[],
  limits: RetrievalLimits,
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
    const [lawLists, principleLists] = await Promise.all([
      limits.laws > 0
        ? Promise.all(parsed.map((t) => rankedRows(admin, "search_law_articles_relevance", t, FETCH_PER_QUERY.laws, ctrl.signal)))
        : Promise.resolve([] as Row[][]),
      limits.principles > 0
        ? Promise.all(parsed.map((t) => rankedRows(admin, "search_principles_relevance", t, FETCH_PER_QUERY.principles, ctrl.signal)))
        : Promise.resolve([] as Row[][]),
    ]);
    const articles = interleave(lawLists, limits.laws);
    const principles = interleave(principleLists, limits.principles);

    const slugs = [...new Set(articles.map((a) => str(a.law_slug)).filter(Boolean))];
    const titles = new Map<string, string>();
    if (slugs.length > 0) {
      const { data, error } = await admin.schema("library").from("laws").select("slug, title").in("slug", slugs);
      if (error) console.warn("[ai/retrieval] law titles", error.code, error.message);
      for (const l of (data ?? []) as Row[]) titles.set(str(l.slug), str(l.title));
    }
    return buildSources(articles, principles, titles);
  } finally {
    clearTimeout(timer);
  }
}
