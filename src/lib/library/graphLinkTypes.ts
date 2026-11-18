/**
 * graphLinkTypes.ts — which graph link types a person may see, and where
 * (owner decision ٦٠, 18 Nov 2026, and owner message item 6 «الإحالات المرتبطة»).
 *
 * ٦٠: «تظهر فقط الأنواع المتطابقة مع ملف المالك، وتُخفى الباقية من المستكشف
 * وشريط القارئ حتى المراجعة». The owner's file (LEGAL_GRAPH_EDGES_CLEAN.json)
 * has 14 raw types. Our graph has 17. A type of ours is SHOWN when it maps onto
 * one of his — the mapping is the one the comparison export uses
 * (src/lib/ai/graphOwnerCompareCore.ts `mapOurEdge`; the unit test pins this
 * list to it, so the two can never drift apart):
 *
 *   INTERPRETS_ARTICLE → cites_article                 (مبدأ قضائي يستند لمادة)
 *   AMENDS_ARTICLE     → amended_by                    (يعدّل)
 *   SUPERSEDES_LAW     → superseded_by                 (يحلّ محل / يُستبدل)
 *   PARENT_LAW         → regulation_of / regulated_by  (لائحة / تنظيم)
 *
 * HIDDEN until the owner reviews them: the six our question ٦٠ named
 * (EXEMPTS_FROM استثناء، SUBJECT_TO مع مراعاة، PENALIZES عقوبة، CITES_ARTICLE
 * إحالة، IMPLEMENTED_BY لائحتها التنفيذية، REPLACED_BY المقابل الساري) and
 * SIMILAR_TO (a link between two documents computed from vectors; his file
 * has no inferred link at all).
 *
 * OUTLINE / MEANING types are not links between two legal documents: an
 * article inside its chapter (PART_OF), the next article (NEXT_ARTICLE), an
 * article and a concept or a defined term (HAS_CONCEPT, DEFINES_TERM,
 * DECONSTRUCTS_CONCEPT, ESTABLISHES_RULE). The staff explorer keeps them — it
 * cannot walk a law without them — and the reader never shows them. That
 * bucket is an interpretation of ٦٠; moving a type is one line here.
 *
 * Sections of the reader's links box (owner item 6, his graph report §4):
 * التشريعات (green), المبادئ والأحكام القضائية (blue), الآراء الفقهية (amber).
 * No shown type is fiqh today — his file has no fiqh link — so that section
 * stays empty and hidden until a fiqh type is added here.
 *
 * Pure (no imports): the reader route, the explorer route, the explorer's
 * client components and `node --test` all load it.
 */

/** His 14 raw types (graph report §4) and the section each belongs to. */
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
} as const satisfies Record<string, { category: string; section: LinkSection }>;
export type OwnerGraphType = keyof typeof OWNER_GRAPH_TYPES;

export const LINK_SECTIONS = ["legislation", "judicial", "fiqh"] as const;
export type LinkSection = (typeof LINK_SECTIONS)[number];

/** Our type → the owner's type(s) it is exported as. Only these are shown. */
export const OUR_TO_OWNER_TYPES = {
  INTERPRETS_ARTICLE: ["cites_article"],
  AMENDS_ARTICLE: ["amended_by"],
  SUPERSEDES_LAW: ["superseded_by"],
  PARENT_LAW: ["regulation_of", "regulated_by"],
} as const satisfies Record<string, readonly OwnerGraphType[]>;

/** The link types a reader or a staff member sees: the ones matching his file. */
export const SHOWN_LINK_TYPES = Object.keys(OUR_TO_OWNER_TYPES) as Array<keyof typeof OUR_TO_OWNER_TYPES>;
export type ShownLinkType = (typeof SHOWN_LINK_TYPES)[number];

/** Links between documents his file does not have: hidden everywhere until reviewed. */
export const UNREVIEWED_LINK_TYPES = [
  "EXEMPTS_FROM",
  "SUBJECT_TO",
  "PENALIZES",
  "CITES_ARTICLE",
  "IMPLEMENTED_BY",
  "REPLACED_BY",
  "SIMILAR_TO",
] as const;

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
  return typeof t === "string" && Object.prototype.hasOwnProperty.call(OUR_TO_OWNER_TYPES, t);
}

/**
 * The staff explorer: the shown types and the outline / meaning types. Anything
 * else — the unreviewed types, and a type nobody has classified yet — is hidden.
 */
export function isExplorerVisibleLinkType(t: unknown): boolean {
  return isShownLinkType(t) || (OUTLINE_LINK_TYPES as readonly string[]).includes(String(t));
}

/** The box section of a shown type (from the owner's category of its mapping); null when not shown. */
export function sectionOfLinkType(t: unknown): LinkSection | null {
  if (!isShownLinkType(t)) return null;
  const owner = OUR_TO_OWNER_TYPES[t][0] as OwnerGraphType;
  return OWNER_GRAPH_TYPES[owner].section;
}

/**
 * The words of one link, read from the article on the page: `out` when the
 * page's article is the link's source, `in` when it is the target.
 */
export const SHOWN_LINK_LABELS: Readonly<Record<ShownLinkType, { out: string; in: string }>> = {
  INTERPRETS_ARTICLE: { out: "مبدأ قضائي يستند إليه", in: "مبدأ قضائي يستند إليها" },
  AMENDS_ARTICLE: { out: "تعدّلها", in: "معدِّل لها" },
  SUPERSEDES_LAW: { out: "حلّ محله", in: "حلّ محلها" },
  PARENT_LAW: { out: "النظام الأصل", in: "لائحة أو نظام تابع" },
};

export function linkLabel(t: unknown, direction: "out" | "in"): string {
  return isShownLinkType(t) ? SHOWN_LINK_LABELS[t][direction] : "";
}

/** The shown types of one section (the reader asks the graph per section, so one section never starves another). */
export function linkTypesOfSection(s: LinkSection): ShownLinkType[] {
  return SHOWN_LINK_TYPES.filter((t) => sectionOfLinkType(t) === s);
}
