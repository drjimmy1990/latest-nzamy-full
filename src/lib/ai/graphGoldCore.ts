/**
 * graphGoldCore.ts — the gold-set measure of GraphRAG (scripts/graph-gold.mjs):
 * client-style questions with the articles a good answer must rest on
 * (docs/graph-rag/gold-set.json), scored on what the AI's own retrieval
 * returns with the graph and without it, plus the graph's timing per routing
 * scope against the switch-on gate.
 *
 * Pure: no I/O, so `node --test` runs it.
 */
import { normalizeSearch } from "../../utils/normalizeArabic.ts";

/** One article a good answer must rest on: any listed law copy's article with that number (or one of `or_articles`). */
export interface GoldExpect {
  laws: string[];
  law_title: string;
  article: number;
  or_articles?: number[];
  /** One of these phrases must be in the article's text (goldNormalize'd), so another article sharing the number is not counted. */
  must_contain: string[];
  about?: string;
}

export interface GoldItem {
  id: string;
  question: string;
  /** The question names the article outright (exercises the seeds). */
  named?: boolean;
  expect: GoldExpect[];
}

export interface GoldSet {
  status: string;
  version: number;
  k: number;
  items: GoldItem[];
}

/** The switch-on gate: the graph's own deadline in a live run (retrieval.ts GRAPH_BUDGET_MS). */
export const GOLD_GATE_MS = 2500;

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/** Reads and checks the gold file; throws with every problem listed. */
export function parseGoldSet(raw: unknown): GoldSet {
  const problems: string[] = [];
  const o = (raw ?? {}) as Record<string, unknown>;
  const items = Array.isArray(o.items) ? o.items : [];
  if (items.length === 0) problems.push("no items");
  const ids = new Set<string>();
  const out: GoldItem[] = [];
  items.forEach((it, i) => {
    const r = (it ?? {}) as Record<string, unknown>;
    const id = isStr(r.id) ? r.id : `#${i + 1}`;
    if (!isStr(r.id)) problems.push(`${id}: id missing`);
    else if (ids.has(r.id)) problems.push(`${id}: duplicate id`);
    ids.add(id);
    if (!isStr(r.question)) problems.push(`${id}: question missing`);
    const expect = Array.isArray(r.expect) ? r.expect : [];
    if (expect.length === 0) problems.push(`${id}: no expected article`);
    const ex: GoldExpect[] = [];
    expect.forEach((e, j) => {
      const x = (e ?? {}) as Record<string, unknown>;
      const laws = Array.isArray(x.laws) ? x.laws.filter(isStr) : [];
      const or = Array.isArray(x.or_articles) ? x.or_articles.filter(isNum) : [];
      if (laws.length === 0 && !isStr(x.law_title)) problems.push(`${id}.expect[${j}]: no law`);
      if (!isNum(x.article)) problems.push(`${id}.expect[${j}]: article must be a positive whole number`);
      const phrases = Array.isArray(x.must_contain) ? x.must_contain.filter(isStr).map((p) => p.trim()) : [];
      if (phrases.length === 0) problems.push(`${id}.expect[${j}]: must_contain needs a phrase from the article's text`);
      ex.push({
        laws,
        law_title: isStr(x.law_title) ? x.law_title : "",
        article: isNum(x.article) ? x.article : 0,
        ...(or.length ? { or_articles: or } : {}),
        must_contain: phrases,
        ...(isStr(x.about) ? { about: x.about } : {}),
      });
    });
    out.push({ id, question: isStr(r.question) ? r.question.trim() : "", ...(r.named === true ? { named: true } : {}), expect: ex });
  });
  const k = isNum(o.k) ? o.k : 8;
  if (problems.length) throw new Error(`gold set: ${problems.join("; ")}`);
  return { status: isStr(o.status) ? o.status : "DRAFT", version: isNum(o.version) ? o.version : 1, k, items: out };
}

const TASHKEEL_RE = /[\u064B-\u0652\u0670\u0640]/g;

/** Text for phrase matching: no diacritics or tatweel, one alef / ya / ta marbuta form, Western digits, single spaces. */
export function goldNormalize(text: string): string {
  return normalizeSearch(text.replace(TASHKEEL_RE, "")).replace(/\s+/g, " ");
}

/** The ids of the rows whose text (or original text) holds one of the phrases. */
export function idsWithPhrase(
  rows: ReadonlyArray<{ id: string; text?: string | null; original_text?: string | null }>,
  phrases: readonly string[],
): Set<string> {
  const wanted = phrases.map(goldNormalize).filter(Boolean);
  const out = new Set<string>();
  for (const r of rows) {
    const t = goldNormalize(`${r.text ?? ""} ${r.original_text ?? ""}`);
    if (wanted.some((p) => t.includes(p))) out.add(r.id);
  }
  return out;
}

/** The article numbers an expectation accepts. */
export function expectNumbers(e: GoldExpect): number[] {
  return [e.article, ...(e.or_articles ?? [])];
}

/** How one answer scored: per expectation, the 1-based rank of the first matching article in the top k, or null. */
export interface GoldScore {
  ranks: Array<number | null>;
  found: number;
  /** Expectations that resolved to at least one article on the server (the others are not scored). */
  scored: number;
  /** found / scored, or null when nothing resolved. */
  recall: number | null;
}

/**
 * `articleIds`: the answer's articles in order. `resolved[i]`: every article id
 * expectation i accepts (all versions, all law copies); empty when it did not
 * resolve on the server, and then it is not scored.
 */
export function scoreAnswer(articleIds: readonly string[], resolved: ReadonlyArray<ReadonlySet<string>>, k: number): GoldScore {
  const top = articleIds.slice(0, k);
  const ranks: Array<number | null> = [];
  let found = 0;
  let scored = 0;
  for (const ids of resolved) {
    if (ids.size === 0) {
      ranks.push(null);
      continue;
    }
    scored++;
    const at = top.findIndex((id) => ids.has(id));
    ranks.push(at >= 0 ? at + 1 : null);
    if (at >= 0) found++;
  }
  return { ranks, found, scored, recall: scored > 0 ? found / scored : null };
}

/** Nearest-rank percentile (p in 0..100); null for no values. */
export function percentile(values: readonly number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const rank = Math.min(v.length, Math.max(1, Math.ceil((p / 100) * v.length)));
  return v[rank - 1];
}

export interface TimingSummary {
  n: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
  /** Calls that failed or passed the gate's deadline. */
  failures: number;
}

export function summarizeTimings(ms: readonly number[], failures = 0): TimingSummary {
  return { n: ms.length, p50: percentile(ms, 50), p95: percentile(ms, 95), max: ms.length ? Math.max(...ms) : null, failures };
}

/** Mean of the non-null recalls; null when none. */
export function meanRecall(scores: ReadonlyArray<GoldScore>): number | null {
  const r = scores.map((s) => s.recall).filter((x): x is number => x !== null);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}

/** Share of answers that found at least one expected article (of those scored). */
export function hitRate(scores: ReadonlyArray<GoldScore>): number | null {
  const s = scores.filter((x) => x.scored > 0);
  return s.length ? s.filter((x) => x.found > 0).length / s.length : null;
}

/**
 * The switch-on verdict: every scope's p95 under the gate, no failed or
 * timed-out call, and the graph answered (it was ready) at least once.
 */
export function gateVerdict(scopes: Record<string, TimingSummary>, graphAnswered: number, gateMs = GOLD_GATE_MS): { go: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (graphAnswered === 0) reasons.push("the graph never answered (not ready, switched off in the database, or every call failed)");
  for (const [scope, t] of Object.entries(scopes)) {
    if (t.n === 0) reasons.push(`${scope}: no timing`);
    else if (t.p95 !== null && t.p95 >= gateMs) reasons.push(`${scope}: p95 ${t.p95} ms ≥ ${gateMs} ms`);
    if (t.failures > 0) reasons.push(`${scope}: ${t.failures} call(s) failed or timed out`);
  }
  return { go: reasons.length === 0, reasons };
}

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const ms = (x: number | null) => (x === null ? "—" : `${x} ms`);

export interface GoldRow {
  id: string;
  named: boolean;
  graph: GoldScore;
  keyword: GoldScore;
  path: "graph" | "keyword";
  graphMiss: string | null;
}

/** The report's text: one line per question, then the totals and the verdict. */
export function formatGoldReport(input: {
  rows: GoldRow[];
  k: number;
  scopes: Record<string, TimingSummary>;
  aiGraph: TimingSummary;
  unresolved: string[];
  status: string;
}): string[] {
  const { rows, k } = input;
  const lines: string[] = [];
  const r = (s: GoldScore) => s.ranks.map((x) => (x === null ? "✗" : `#${x}`)).join(",");
  lines.push(`Gold set (${input.status}), ${rows.length} questions, K=${k}`);
  lines.push("id                 graph         keyword       path     miss");
  for (const row of rows) {
    lines.push(
      `${(row.id + (row.named ? "*" : "")).padEnd(18)} ${r(row.graph).padEnd(13)} ${r(row.keyword).padEnd(13)} ${row.path.padEnd(8)} ${row.graphMiss ?? ""}`,
    );
  }
  const g = rows.map((x) => x.graph);
  const kw = rows.map((x) => x.keyword);
  lines.push("");
  lines.push(`Recall@${k}: graph ${pct(meanRecall(g))}  ·  keyword ${pct(meanRecall(kw))}`);
  lines.push(`Hit@${k}:    graph ${pct(hitRate(g))}  ·  keyword ${pct(hitRate(kw))}`);
  const named = rows.filter((x) => x.named);
  if (named.length) {
    lines.push(`Named-article questions (*): graph ${pct(meanRecall(named.map((x) => x.graph)))}  ·  keyword ${pct(meanRecall(named.map((x) => x.keyword)))}`);
  }
  const answered = rows.filter((x) => x.path === "graph").length;
  lines.push(`The graph answered ${answered} of ${rows.length} (the rest fell back to the keyword search, so their "graph" column is the keyword answer).`);
  const byGraph = rows.filter((x) => x.path === "graph");
  if (byGraph.length) {
    lines.push(
      `Where the graph answered (${byGraph.length}): Recall@${k} graph ${pct(meanRecall(byGraph.map((x) => x.graph)))}  ·  keyword ${pct(meanRecall(byGraph.map((x) => x.keyword)))}`,
    );
  }
  if (input.unresolved.length) lines.push(`Not on the server (not scored): ${input.unresolved.join(", ")}`);
  lines.push("");
  // The AI path's call is each question's first: the database has not read
  // its pages yet (cold). The scope replays repeat it at once (warm).
  lines.push(
    `AI path graph call (first, cold; cut at ${GOLD_GATE_MS} ms): p50 ${ms(input.aiGraph.p50)}  p95 ${ms(input.aiGraph.p95)}  max ${ms(input.aiGraph.max)}  failed or timed out ${input.aiGraph.failures}`,
  );
  for (const [scope, t] of Object.entries(input.scopes)) {
    lines.push(`scope ${scope.padEnd(8)} (replay, warm) p50 ${ms(t.p50)}  p95 ${ms(t.p95)}  max ${ms(t.max)}  failures ${t.failures}`);
  }
  const verdict = gateVerdict({ "ai-path": input.aiGraph, ...input.scopes }, answered);
  lines.push("");
  lines.push(verdict.go ? `GO — every scope's p95 is under ${GOLD_GATE_MS} ms.` : `NO-GO — ${verdict.reasons.join("; ")}`);
  return lines;
}
