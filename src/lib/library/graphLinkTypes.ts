/**
 * graphLinkTypes.ts — which graph link types a person sees, and where.
 *
 * Owner register 14, item 17 (19 Nov 2026, overrides decision ٦٠): «"إحالة"
 * (مادة إلى مادة) تُعاد الآن وتظهر كل أنواع علاقات الجراف المتاحة في المربع
 * الجانبي، ولا يُخفى شيء بحجة مطابقة الملف». So the reader's links box shows
 * every LEGAL link between two documents our graph holds — whether or not the
 * owner's graph file (LEGAL_GRAPH_EDGES_CLEAN.json) has a matching type — and
 * the staff explorer shows every type.
 *
 * Decision ٦٠ (batch l8) showed only the four types the comparison export maps
 * onto one of his 14; that mapping (OUR_TO_OWNER_TYPES below, pinned to
 * src/lib/ai/graphOwnerCompareCore.ts `mapOurEdge` by the unit test) is now
 * documentation of the comparison only. It never decides what is shown.
 *
 * The buckets (every type of the graph is in exactly one — the unit test pins
 * them against the explorer's full list, so a new type cannot slip through):
 *
 *   READER (the box, and the explorer): links between two legal documents —
 *     INTERPRETS_ARTICLE  مبدأ قضائي يستند لمادة          → judicial
 *     CITES_ARTICLE       يحيل إلى مادة (مادة ← مادة)      → legislation
 *     AMENDS_ARTICLE      تعديل                           → legislation
 *     SUPERSEDES_LAW      إحلال نظام محل نظام             → legislation
 *     PARENT_LAW          النظام الأصل / لائحة تابعة       → legislation
 *     IMPLEMENTED_BY      مادة لائحية تنفّذ مادة نظامية    → legislation
 *     REPLACED_BY         المقابل الساري لمادة ملغاة       → legislation
 *     EXEMPTS_FROM        استثناء                         → legislation
 *     SUBJECT_TO          مع مراعاة                       → legislation
 *     PENALIZES           عقوبة المخالفة                  → legislation
 *   READER, OWN SECTION (batch l12, owner Q133 / register 14 item 17):
 *     SIMILAR_TO — computed from vectors, not a legal link. The reader sees it
 *     only under its own heading «مواد متقاربة في المعنى», never
 *     among the legal relations, and only while the admin switch
 *     `library_similar_links` is on (featureFlags.ts; the routes filter it).
 *   OUTLINE / MEANING (explorer only): an article inside its chapter (PART_OF),
 *     the next article (NEXT_ARTICLE), concepts and defined terms (HAS_CONCEPT,
 *     DEFINES_TERM, DECONSTRUCTS_CONCEPT, ESTABLISHES_RULE). The explorer needs
 *     them to walk a law; they are not links between two documents.
 *
 * Sections of the reader's box (owner item 6): التشريعات (green), المبادئ
 * والأحكام القضائية (blue), الآراء الفقهية (amber), and since l12 the
 * computed «مواد متقاربة في المعنى» (violet, Q133; owner Q171, batch l13: no
 * «(ربط آلي)» label in the heading). No type is fiqh
 * today, so that section stays empty — and an empty section is hidden.
 *
 * Pure (no imports): the reader route, the explorer route, the explorer's
 * client components and `node --test` all load it.
 */

/** His 14 raw types (graph report §4) and the section each belongs to — the comparison's vocabulary. */
export const OWNER_GRAPH_TYPES = {
  cites_article: { category: "مبدأ قضائي يستند لمادة", section: "judicial" },
  cites_precedent: { category: "مبدأ قضائي يحيل لمبدأ", section: "judicial" },
  amended_by: { category: "يعدّل", section: "legislation" },
  amends: { category: "يعدّل", section: "legislation" },
  repealed_by: { category: "يلغي", section: "legislation" },
  repeals: { category: "يلغي", section: "legislation" },
  scheduled_repeal_by: { category: "يلغي", section: "legislation" },
  superseded_by: { category: "يحلّ محل/يُستبدل", section: "legislation" },
  supersedes: { category: "يحلّ محل/يُستبدل", section: "legislation" },
  replaces: { category: "يحلّ محل/يُستبدل", section: "legislation" },
  regulation_of: { category: "لائحة/تنظيم", section: "legislation" },
  regulated_by: { category: "لائحة/تنظيم", section: "legislation" },
  contains_merged_regulation: { category: "لائحة/تنظيم", section: "legislation" },
  related_to: { category: "يحيل إلى", section: "legislation" },
  // Owner decision (19 Nov 2026, his file §3/§5): article → article, our
  // automatic graph (CITES_ARTICLE). Distinct from related_to (law → law).
  refers_to_article: { category: "يحيل إلى مادة", section: "legislation" },
} as const satisfies Record<string, { category: string; section: LinkSection }>;
export type OwnerGraphType = keyof typeof OWNER_GRAPH_TYPES;

export const LINK_SECTIONS = ["legislation", "judicial", "fiqh", "similar"] as const;
export type LinkSection = (typeof LINK_SECTIONS)[number];

/**
 * Our type → the owner's type(s) the comparison export writes it as
 * (graphOwnerCompareCore.mapOurEdge). Comparison only: since register 14
 * item 17 it no longer decides what is shown.
 */
export const OUR_TO_OWNER_TYPES = {
  INTERPRETS_ARTICLE: ["cites_article"],
  CITES_ARTICLE: ["refers_to_article"],
  AMENDS_ARTICLE: ["amended_by"],
  SUPERSEDES_LAW: ["superseded_by"],
  PARENT_LAW: ["regulation_of", "regulated_by"],
} as const satisfies Record<string, readonly OwnerGraphType[]>;

/** The reader's link types and the box section of each (register 14 item 17: all legal links). */
export const READER_LINK_SECTIONS = {
  INTERPRETS_ARTICLE: "judicial",
  CITES_ARTICLE: "legislation",
  AMENDS_ARTICLE: "legislation",
  SUPERSEDES_LAW: "legislation",
  PARENT_LAW: "legislation",
  IMPLEMENTED_BY: "legislation",
  REPLACED_BY: "legislation",
  EXEMPTS_FROM: "legislation",
  SUBJECT_TO: "legislation",
  PENALIZES: "legislation",
  // Q133 (batch l12): computed, never a legal relation — its own section, behind library_similar_links.
  SIMILAR_TO: "similar",
} as const satisfies Record<string, LinkSection>;

/** The link types a reader may see (the box): every legal link between two documents, plus SIMILAR_TO in its own section. */
export const SHOWN_LINK_TYPES = Object.keys(READER_LINK_SECTIONS) as Array<keyof typeof READER_LINK_SECTIONS>;
export type ShownLinkType = (typeof SHOWN_LINK_TYPES)[number];

/** The automatic meaning links (Q133): shown only while the admin switch is on. */
export const SIMILAR_LINK_TYPES: readonly ShownLinkType[] = ["SIMILAR_TO"];

/** The reader types for the switch's state: without SIMILAR_TO when it is off. */
export function readerLinkTypes(similarOn: boolean): ShownLinkType[] {
  return SHOWN_LINK_TYPES.filter((t) => similarOn || !SIMILAR_LINK_TYPES.includes(t));
}

/** Computed links the reader never sees: none since Q133 (SIMILAR_TO has its own reader section). */
export const EXPLORER_ONLY_LINK_TYPES = [] as readonly string[];

/** Outline and meaning links (not between two documents): the staff explorer only. */
export const OUTLINE_LINK_TYPES = [
  "PART_OF",
  "NEXT_ARTICLE",
  "HAS_CONCEPT",
  "DEFINES_TERM",
  "DECONSTRUCTS_CONCEPT",
  "ESTABLISHES_RULE",
] as const;

export function isShownLinkType(t: unknown): t is ShownLinkType {
  return typeof t === "string" && Object.prototype.hasOwnProperty.call(READER_LINK_SECTIONS, t);
}

/**
 * The staff explorer: every classified type (register 14 item 17 — nothing is
 * hidden for not matching the owner's file). Only a type nobody has classified
 * yet (a newer server) is left out.
 */
export function isExplorerVisibleLinkType(t: unknown): boolean {
  return (
    isShownLinkType(t) ||
    (EXPLORER_ONLY_LINK_TYPES as readonly string[]).includes(String(t)) ||
    (OUTLINE_LINK_TYPES as readonly string[]).includes(String(t))
  );
}

/** The box section of a reader type; null when the reader never shows it. */
export function sectionOfLinkType(t: unknown): LinkSection | null {
  return isShownLinkType(t) ? READER_LINK_SECTIONS[t] : null;
}

/**
 * The words of one link, describing the OTHER item from the page's article:
 * `out` when the page's article is the link's source, `in` when it is the target.
 */
export const SHOWN_LINK_LABELS: Readonly<Record<ShownLinkType, { out: string; in: string }>> = {
  INTERPRETS_ARTICLE: { out: "مبدأ قضائي يستند إليه", in: "مبدأ قضائي يستند إليها" },
  // Owner decision 19 Nov: his type refers_to_article «يحيل إلى مادة» (the category, OWNER_GRAPH_TYPES);
  // the key stays CITES_ARTICLE. Like every label here these name the OTHER article: the one this
  // article refers to (out), or one that refers to this article (in).
  CITES_ARTICLE: { out: "تحيل إليها هذه المادة", in: "مادة تحيل إليها" },
  AMENDS_ARTICLE: { out: "تعدّلها", in: "معدِّل لها" },
  SUPERSEDES_LAW: { out: "حلّ محله", in: "حلّ محلها" },
  PARENT_LAW: { out: "النظام الأصل", in: "لائحة أو نظام تابع" },
  IMPLEMENTED_BY: { out: "مادة لائحية تنفّذها", in: "المادة النظامية التي تنفّذها" },
  REPLACED_BY: { out: "المقابل الساري لها", in: "مادة ملغاة تقابلها" },
  EXEMPTS_FROM: { out: "تستثني منها هذه المادة", in: "استثناء من هذه المادة" },
  SUBJECT_TO: { out: "تُطبَّق هذه المادة مع مراعاتها", in: "تُطبَّق مع مراعاة هذه المادة" },
  PENALIZES: { out: "تعاقب هذه المادة على مخالفتها", in: "عقوبة مخالفة هذه المادة" },
  // A computed link has no direction worth naming: both read the same (owner Q171: no «(ربط آلي)» label).
  SIMILAR_TO: { out: "متقاربة في المعنى", in: "متقاربة في المعنى" },
};

export function linkLabel(t: unknown, direction: "out" | "in"): string {
  return isShownLinkType(t) ? SHOWN_LINK_LABELS[t][direction] : "";
}

/** The reader types of one section. */
export function linkTypesOfSection(s: LinkSection): ShownLinkType[] {
  return SHOWN_LINK_TYPES.filter((t) => sectionOfLinkType(t) === s);
}

/**
 * How the reader asks the graph: one call per group, each with its own node
 * limit, so a heavy type never crowds out a light one. An article cited by
 * hundreds of principles keeps its legislation links; an article with dozens
 * of «إحالة» links keeps its amendment and regulation links (they are listed
 * first in the section). Groups of one section are merged in this order.
 */
export const READER_QUERY_GROUPS: ReadonlyArray<{ section: LinkSection; types: readonly ShownLinkType[] }> = [
  { section: "legislation", types: ["AMENDS_ARTICLE", "SUPERSEDES_LAW", "PARENT_LAW", "IMPLEMENTED_BY", "REPLACED_BY", "EXEMPTS_FROM", "SUBJECT_TO", "PENALIZES"] },
  { section: "legislation", types: ["CITES_ARTICLE"] },
  { section: "judicial", types: ["INTERPRETS_ARTICLE"] },
  { section: "similar", types: ["SIMILAR_TO"] },
];

/**
 * The order the reader LISTS groups in (batch l14, owner file 07 §4 — approved
 * 23 Nov §15), separate from READER_QUERY_GROUPS (how the graph is asked, which
 * stays as it is). Within «التشريعات»: what changes the article's meaning first
 * (the in-force counterpart, the amendment), then the regulation that
 * implements it, then reference, exception, «مع مراعاة», penalty, replacement
 * of a law. Then the judicial links, then the similar-meaning ones.
 */
export const READER_DISPLAY_ORDER: readonly ShownLinkType[] = [
  "REPLACED_BY",
  "AMENDS_ARTICLE",
  "IMPLEMENTED_BY",
  "PARENT_LAW",
  "CITES_ARTICLE",
  "EXEMPTS_FROM",
  "SUBJECT_TO",
  "PENALIZES",
  "SUPERSEDES_LAW",
  "INTERPRETS_ARTICLE",
  "SIMILAR_TO",
];

/**
 * An unreviewed automatic link (batch l12, owner library-Q4 / N12, RAW[56]):
 * a «إحالة» the system extracted from the text and nobody reviewed — origin
 * auto_watchdog, not read from the owner's own files (metadata.source
 * owner_links) and not one of his curated links (owner_curated). Owner Q171
 * (22 Nov, batch l13): the reader shows NO label for it — the citations route
 * always clears the flag; the library team's «الإحالة» sample still counts
 * these links (ihalaSample.ts).
 */
export const AUTO_TAGGED_LINK_TYPES: readonly ShownLinkType[] = ["CITES_ARTICLE"];
export function isUnreviewedAutoLink(edgeType: unknown, origin: unknown, metadataSource: unknown): boolean {
  return (
    typeof edgeType === "string" &&
    (AUTO_TAGGED_LINK_TYPES as readonly string[]).includes(edgeType) &&
    origin === "auto_watchdog" &&
    metadataSource !== "owner_links"
  );
}
