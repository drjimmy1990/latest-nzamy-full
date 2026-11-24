/**
 * linkCoverage.ts — the staff page «تغطية الإحالات» (batch l14, owner file 07
 * §2 and §12.8; approved 23 Nov §15): the answer of
 * public.graph_rag_link_coverage (20261204_40), parsed whatever the server
 * sent, and the page's numbers.
 *
 * Pure (relative imports only): `node --test` runs linkCoverage.test.ts.
 */

export interface LawCoverage {
  slug: string;
  title: string;
  articles: number;
  /** Articles with at least one legal link (a similar-meaning link is not one). */
  linked: number;
  links: number;
  /** Articles with a similar-meaning link (counted apart). */
  similarLinked: number;
  /** The owner's links that could not be pinned to an article: on the whole law. */
  docLevel: number;
  /** Graph articles of the law whose library row is gone but which still carry links. */
  goneAnchors: number;
}

export interface CoverageAnomaly {
  articleKey: string;
  articleTitle: string;
  lawSlug: string;
  edgeType: string;
  direction: "out" | "in";
  otherDoc: string;
  otherTitle: string;
  n: number;
}

export interface LinkCoverage {
  laws: LawCoverage[];
  totals: { laws: number; articles: number; linked: number; links: number; similarLinked: number; docLevel: number; goneAnchors: number };
  ownerEdges: Record<string, number>;
  anomalyMin: number;
  anomalyCount: number;
  anomalies: CoverageAnomaly[];
}

const int = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.slice(0, max) : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function parseLinkCoverage(raw: unknown): LinkCoverage {
  const r = obj(raw);
  const laws: LawCoverage[] = [];
  for (const x of Array.isArray(r.laws) ? r.laws : []) {
    const o = obj(x);
    const slug = str(o.slug);
    if (!slug) continue;
    laws.push({
      slug,
      title: str(o.title) || slug,
      articles: int(o.articles),
      linked: int(o.linked),
      links: int(o.links),
      similarLinked: int(o.similar_linked),
      docLevel: int(o.doc_level),
      goneAnchors: int(o.gone_anchors),
    });
  }
  const t = obj(r.totals);
  const ownerEdges: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(r.owner_edges))) if (/^[a-z_]{1,40}$/.test(k)) ownerEdges[k] = int(v);
  const anomalies: CoverageAnomaly[] = [];
  for (const x of Array.isArray(r.anomalies) ? r.anomalies : []) {
    const o = obj(x);
    const articleKey = str(o.article_key, 250);
    if (!articleKey) continue;
    anomalies.push({
      articleKey,
      articleTitle: str(o.article_title) || articleKey,
      lawSlug: str(o.law_slug),
      edgeType: str(o.edge_type, 40),
      direction: o.direction === "in" ? "in" : "out",
      otherDoc: str(o.other_doc),
      otherTitle: str(o.other_title) || str(o.other_doc),
      n: int(o.n),
    });
  }
  return {
    laws,
    totals: {
      laws: int(t.laws),
      articles: int(t.articles),
      linked: int(t.linked),
      links: int(t.links),
      similarLinked: int(t.similar_linked),
      docLevel: int(t.doc_level),
      goneAnchors: int(t.gone_anchors),
    },
    ownerEdges,
    anomalyMin: int(r.anomaly_min) || 6,
    anomalyCount: int(r.anomaly_count),
    anomalies,
  };
}

/** Share of articles with at least one legal link, 0–100 with one decimal; null when there is no article. */
export function coveragePercent(linked: number, articles: number): number | null {
  if (!Number.isFinite(articles) || articles <= 0) return null;
  return Math.round((Math.min(linked, articles) / articles) * 1000) / 10;
}

/** Links per article, one decimal; null when there is no article. */
export function linksPerArticle(links: number, articles: number): number | null {
  if (!Number.isFinite(articles) || articles <= 0) return null;
  return Math.round((links / articles) * 10) / 10;
}

export type CoverageSort = "poorest" | "largest" | "unresolved";

/** The table's order: the poorest coverage first (the owner's question: where the real poverty is), the largest laws, or the most unresolved. */
export function sortLawCoverage(rows: readonly LawCoverage[], by: CoverageSort): LawCoverage[] {
  const pct = (r: LawCoverage) => coveragePercent(r.linked, r.articles) ?? 101;
  return [...rows].sort((a, b) => {
    if (by === "largest") return b.articles - a.articles || a.slug.localeCompare(b.slug);
    if (by === "unresolved") return b.docLevel + b.goneAnchors - (a.docLevel + a.goneAnchors) || a.slug.localeCompare(b.slug);
    return pct(a) - pct(b) || b.articles - a.articles || a.slug.localeCompare(b.slug);
  });
}

/** The relation words of an anomaly's link type (staff page). */
export const COVERAGE_EDGE_LABELS: Readonly<Record<string, string>> = {
  IMPLEMENTED_BY: "مادة لائحية تنفّذ",
  CITES_ARTICLE: "إحالة",
  AMENDS_ARTICLE: "تعديل",
  REPLACED_BY: "مقابل ساري",
  EXEMPTS_FROM: "استثناء",
  SUBJECT_TO: "مع مراعاة",
  PENALIZES: "عقوبة",
  PARENT_LAW: "نظام أصل / لائحة تابعة",
  SUPERSEDES_LAW: "إحلال نظام",
  INTERPRETS_ARTICLE: "مبدأ قضائي",
};
