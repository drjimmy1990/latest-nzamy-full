/**
 * graphExplorerCore.ts — the pure half of the admin Legal Graph Explorer
 * (/dashboard/admin/graph-explorer): Arabic labels and colours for every node
 * and link type, request validation for GET /api/v1/admin/graph-explorer,
 * a deterministic radial layout, neighbourhood merging for "expand", and the
 * retrieval-lab helpers.
 *
 * Pure (no imports) so `node --test` runs it and both the route and the
 * client page share one definition.
 */

// ─── Types & labels ───────────────────────────────────────────────────────────

import { COMMITTEE_FAMILIES, SECTION_LABELS, normalizeSectionCode } from "./graphRouting.ts";
import { isExplorerVisibleLinkType } from "../library/graphLinkTypes.ts";

export const EXPLORER_NODE_TYPES = ["article", "principle", "decree", "feqh", "concept", "law", "chapter", "term"] as const;
export type ExplorerNodeType = (typeof EXPLORER_NODE_TYPES)[number];

/**
 * Same order as the radial sectors; matches the edge_type check of 20261116_10
 * (legal links first, then definition and meaning links, the outline links last).
 */
export const EXPLORER_EDGE_TYPES = [
  "EXEMPTS_FROM",
  "SUBJECT_TO",
  "AMENDS_ARTICLE",
  "INTERPRETS_ARTICLE",
  "IMPLEMENTED_BY",
  "PENALIZES",
  "SUPERSEDES_LAW",
  "REPLACED_BY",
  "PARENT_LAW",
  "ESTABLISHES_RULE",
  "CITES_ARTICLE",
  "DECONSTRUCTS_CONCEPT",
  "HAS_CONCEPT",
  "DEFINES_TERM",
  "SIMILAR_TO",
  "NEXT_ARTICLE",
  "PART_OF",
] as const;
export type ExplorerEdgeType = (typeof EXPLORER_EDGE_TYPES)[number];

export const QUERY_NODE_KEY = "__query__";

export const NODE_TYPE_META: Readonly<Record<ExplorerNodeType, { label: string; plural: string; color: string }>> = {
  article: { label: "مادة نظامية", plural: "المواد النظامية", color: "#C8A762" },
  principle: { label: "مبدأ قضائي", plural: "المبادئ القضائية", color: "#5FB3A1" },
  decree: { label: "مرسوم / تعميم", plural: "المراسيم والتعاميم", color: "#D9826F" },
  feqh: { label: "نص فقهي", plural: "النصوص الفقهية", color: "#A3B86C" },
  concept: { label: "مفهوم قانوني", plural: "المفاهيم القانونية", color: "#7FA8DC" },
  law: { label: "نظام / لائحة", plural: "الأنظمة واللوائح", color: "#E8D5A3" },
  chapter: { label: "باب / فصل", plural: "الأبواب والفصول", color: "#9C8E6B" },
  term: { label: "مصطلح معرَّف", plural: "المصطلحات المعرَّفة", color: "#C9A0C9" },
};

/**
 * `out` reads the link from its source ("this article يستثني من that one"),
 * `in` from its target ("this article مستثنى منها في that one").
 */
export const EDGE_TYPE_META: Readonly<
  Record<ExplorerEdgeType, { label: string; out: string; in: string; color: string; dashed?: boolean; hint: string }>
> = {
  EXEMPTS_FROM: {
    label: "استثناء",
    out: "يستثني من",
    in: "مستثنى منها في",
    color: "#E39B54",
    hint: "نص يستثني من حكم مادة أخرى («استثناءً من المادة…»، «على الرغم من…»، «فيما عدا ما ورد في…»).",
  },
  SUBJECT_TO: {
    label: "قيد / مع مراعاة",
    out: "مقيَّدة بـ",
    in: "قيدٌ على",
    color: "#D6B15E",
    hint: "نص يُطبَّق مع مراعاة مادة أخرى ودون الإخلال بها («مع مراعاة المادة…»، «مع عدم الإخلال بـ…»).",
  },
  AMENDS_ARTICLE: {
    label: "تعديل",
    out: "يعدّل",
    in: "معدّلة بموجب",
    color: "#D9826F",
    hint: "مرسوم أو قرار عدّل نص المادة أو أضاف إليها أو حذف منها.",
  },
  // H8 (owner decision 17, 18 Nov 2026): his category name. The edge key stays
  // INTERPRETS_ARTICLE (the graph's own link type); only the words change.
  INTERPRETS_ARTICLE: {
    label: "مبدأ قضائي يستند لمادة",
    out: "مبدأ قضائي يستند لمادة",
    in: "مبدأ قضائي يستند إليها",
    color: "#5FB3A1",
    hint: "مبدأ قضائي يستند إلى المادة.",
  },
  PENALIZES: {
    label: "عقوبة",
    out: "يعاقب على مخالفة",
    in: "عقوبة مخالفتها في",
    color: "#C0504D",
    hint: "مادة عقوبات: تعاقب على مخالفة مادة بعينها، أو على مخالفة أحكام النظام كله (فتُربط بعقدة النظام).",
  },
  IMPLEMENTED_BY: {
    label: "لائحتها التنفيذية",
    out: "تنفّذها",
    in: "تنفيذ لـ",
    color: "#6FA8C8",
    hint: "مادة النظام ← مادة اللائحة التنفيذية التي تنفّذها، كما ربطتهما المكتبة نفسها (نص اللائحة يظهر أيضاً داخل مادة النظام).",
  },
  SUPERSEDES_LAW: {
    label: "إحلال",
    out: "يحلّ محل",
    in: "حلّ محله",
    color: "#E06C6C",
    hint: "نظام جديد ألغى نظاماً سابقاً وحلّ محله.",
  },
  REPLACED_BY: {
    label: "المقابل الساري",
    out: "يقابلها الآن",
    in: "تقابل المادة الملغاة",
    color: "#E68A8A",
    dashed: true,
    hint: "مادة ملغاة ← أقرب مادة سارية إليها في المعنى، في النظام الذي حلّ محل نظامها أولاً. يُحسب بالبصمات الدلالية.",
  },
  PARENT_LAW: {
    label: "نظام أم",
    out: "صادر بموجب",
    in: "سند نظامي لـ",
    color: "#C8A762",
    hint: "لائحة أو نظام فرعي صدر استناداً إلى نظام أم.",
  },
  ESTABLISHES_RULE: {
    label: "قاعدة",
    out: "يقرّر قاعدة في",
    in: "قاعدة مقرّرة من",
    color: "#B79FD9",
    hint: "نص يقرّر قاعدة عامة تحكم نصاً آخر.",
  },
  // Owner decision 19 Nov 2026: his name refers_to_article «يحيل إلى مادة»;
  // the edge key stays CITES_ARTICLE.
  CITES_ARTICLE: {
    label: "يحيل إلى مادة",
    out: "يحيل إلى مادة",
    in: "مادة تحيل إليها",
    color: "#8B8B95",
    hint: "إحالة نظامية عامة («وفقاً للمادة…»، «المنصوص عليها في المادة…»).",
  },
  DECONSTRUCTS_CONCEPT: {
    label: "تفصيل مفهوم",
    out: "يفصّل",
    in: "مفصَّل في",
    color: "#8FB8E8",
    hint: "نص يشرح عناصر مفهوم قانوني.",
  },
  HAS_CONCEPT: {
    label: "مفهوم",
    out: "يشمل",
    in: "ضمن مفهوم",
    color: "#7FA8DC",
    dashed: true,
    hint: "مفهوم قانوني منسَّق (مثل «الفصل التعسفي») يجمع المواد التي تحكمه.",
  },
  DEFINES_TERM: {
    label: "تعريف",
    out: "تعرِّف",
    in: "معرَّف في",
    color: "#C9A0C9",
    dashed: true,
    hint: "مادة التعريفات في نظام تعرِّف مصطلحاً («يُقصد بـ… »). والمصطلح المعرَّف في أكثر من نظام يصل بينها.",
  },
  SIMILAR_TO: {
    label: "معنى متقارب",
    out: "تقارب في المعنى",
    in: "تقارب في المعنى",
    color: "#7FB0C0",
    dashed: true,
    hint: "مادتان في نظامين مختلفين، أو مبدآن قضائيان، متقاربان في المعنى. يُحسب بالبصمات الدلالية، والرقم درجة التقارب.",
  },
  NEXT_ARTICLE: {
    label: "المادة التالية",
    out: "تليها",
    in: "تسبقها",
    color: "#6E6E78",
    dashed: true,
    hint: "ترتيب المواد في النظام نفسه: كل مادة مرتبطة بالمادة التي بعدها.",
  },
  PART_OF: {
    label: "ضمن",
    out: "ضمن",
    in: "يضم",
    color: "#5A5A63",
    dashed: true,
    hint: "هيكل المستند: المادة ضمن بابها أو فصلها، والباب ضمن النظام.",
  },
};

export function edgePhrase(type: ExplorerEdgeType, direction: "out" | "in"): string {
  return EDGE_TYPE_META[type][direction];
}

/** The definition and meaning links: walked at hop 2 only when asked for by name (20261116_10). */
export const MEANING_EDGE_TYPES: readonly ExplorerEdgeType[] = ["DEFINES_TERM", "SIMILAR_TO"];

type NodeMeta = { label: string; plural: string; color: string };
type EdgeMeta = { label: string; out: string; in: string; color: string; dashed?: boolean; hint: string };

const UNKNOWN_NODE_META: NodeMeta = { label: "نوع غير معروف", plural: "أنواع غير معروفة", color: "#71717a" };
const UNKNOWN_EDGE_META: EdgeMeta = {
  label: "رابط غير معروف",
  out: "يرتبط بـ",
  in: "مرتبط بـ",
  color: "#71717a",
  dashed: true,
  hint: "نوع رابط لا تعرفه هذه الشاشة بعد.",
};

/**
 * A node type's label and colour; a type this screen does not know (a newer
 * server) gets a neutral grey entry instead of crashing the page.
 */
export function nodeMetaFor(t: unknown): NodeMeta {
  return isExplorerNodeType(t) ? NODE_TYPE_META[t] : UNKNOWN_NODE_META;
}

/**
 * The link types the explorer draws, lists and filters by. Owner register 14
 * item 17 (19 Nov) reverses decision ٦٠: every classified type is shown —
 * nothing is hidden for not matching the owner's graph file
 * (src/lib/library/graphLinkTypes.ts). Only a type nobody has classified (a
 * newer server) is left out.
 */
export const EXPLORER_SHOWN_EDGE_TYPES: readonly ExplorerEdgeType[] = EXPLORER_EDGE_TYPES.filter((t) => isExplorerVisibleLinkType(t));

/** A link type's label, phrases and colour; an unknown or unclassified type gets a neutral grey entry, never «مطابقة». */
export function edgeMetaFor(t: unknown): EdgeMeta {
  if (!isExplorerEdgeType(t) || !isExplorerVisibleLinkType(t)) return UNKNOWN_EDGE_META;
  return EDGE_TYPE_META[t];
}

/** The types to ask the neighbourhood for: the asked ones that are shown; null = every type (filtered after). */
export function explorerEdgeFilter(asked: readonly string[]): ExplorerEdgeType[] | null {
  if (asked.length === 0) return null;
  const shown = asked.filter((t): t is ExplorerEdgeType => isExplorerEdgeType(t) && isExplorerVisibleLinkType(t));
  return shown.length > 0 ? shown : [...EXPLORER_SHOWN_EDGE_TYPES];
}

/** `{TYPE: n}` or `{TYPE: {out, in}}` without an unclassified type. */
export function shownEdgeCounts<V>(counts: unknown): Record<string, V> {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return {};
  return Object.fromEntries(Object.entries(counts as Record<string, V>).filter(([t]) => isExplorerVisibleLinkType(t)));
}

/**
 * A neighbourhood answer without an unclassified link type (a newer server):
 * its edges go, a node only they reached goes, the centre's counts and total
 * follow. Every classified type stays (register 14 item 17).
 */
export function hideUnreviewedLinks(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const r = raw as { found?: unknown; center_key?: unknown; nodes?: unknown; edges?: unknown; center_edge_counts?: unknown; total_center_edges?: unknown };
  if (r.found !== true) return raw;
  const edges = (Array.isArray(r.edges) ? r.edges : []).filter((e) => isExplorerVisibleLinkType((e as { edge_type?: unknown })?.edge_type));
  const touched = new Set<unknown>([r.center_key]);
  for (const e of edges as Array<{ source?: unknown; target?: unknown }>) {
    touched.add(e.source);
    touched.add(e.target);
  }
  const nodes = (Array.isArray(r.nodes) ? r.nodes : []).filter((n) => touched.has((n as { node_key?: unknown })?.node_key));
  const counts = shownEdgeCounts<{ out?: number; in?: number }>(r.center_edge_counts);
  const total = Object.values(counts).reduce((s, c) => s + (Number(c?.out) || 0) + (Number(c?.in) || 0), 0);
  return { ...r, nodes, edges, center_edge_counts: counts, total_center_edges: total };
}

// ─── Where a link came from ──────────────────────────────────────────────────

/** `library_graph.edges.origin` (edges_origin_check), plus the lab's own pictures. */
export const EDGE_ORIGIN_LABELS: Readonly<Record<string, string>> = {
  auto_watchdog: "مستخرجة من نصوص المكتبة",
  auto_similarity: "مبنية من التقارب الدلالي",
  owner_curated: "مُدخلة يدويًا",
  lab: "رسم المختبر",
};

export type EdgeProvenanceKind = "owner" | "similarity" | "library" | "curated" | "other";

export interface EdgeProvenance {
  kind: EdgeProvenanceKind;
  label: string;
  /** e.g. the similarity score and how the replacement was found; null when nothing to add. */
  detail: string | null;
}

/**
 * Where a link came from, for the inspector's badge: the owner's own files
 * (metadata.source = owner_links, 20261118_10), the vector builder (with its
 * score and method), the library's texts, or a hand-made link.
 */
export function edgeProvenance(e: Pick<ExplorerEdge, "origin" | "metadata">): EdgeProvenance {
  const md = e.metadata ?? null;
  if (md?.source === "owner_links") return { kind: "owner", label: "من روابط المالك", detail: null };
  if (e.origin === "auto_similarity") {
    const parts: string[] = [];
    if (typeof md?.sim === "number" && Number.isFinite(md.sim)) parts.push(`التقارب ${md.sim.toFixed(3)}`);
    if (md?.method === "successor_law") parts.push("من النظام الذي حلّ محله");
    else if (md?.method === "nearest_active") parts.push("أقرب مادة سارية");
    return { kind: "similarity", label: "تقارب دلالي", detail: parts.length > 0 ? parts.join(" · ") : null };
  }
  if (e.origin === "owner_curated") return { kind: "curated", label: "مُدخل يدويًا", detail: null };
  if (e.origin === "auto_watchdog") return { kind: "library", label: "من نصوص المكتبة", detail: null };
  return { kind: "other", label: EDGE_ORIGIN_LABELS[e.origin] ?? e.origin, detail: null };
}

/** The link's metadata as the neighbourhood RPC returns it (20261119_10); absent from an older server. */
function edgeMetadataFrom(raw: unknown): ExplorerEdgeMetadata | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: ExplorerEdgeMetadata = {};
  if (typeof r.source === "string") out.source = r.source.slice(0, 40);
  if (typeof r.sim === "number" && Number.isFinite(r.sim)) out.sim = r.sim;
  if (typeof r.method === "string") out.method = r.method.slice(0, 40);
  return Object.keys(out).length > 0 ? out : null;
}

/** Normalises the neighbourhood's links: a known shape for metadata, whatever the server sent. */
export function normalizeEdges(raw: unknown): ExplorerEdge[] {
  if (!Array.isArray(raw)) return [];
  const out: ExplorerEdge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    if (typeof e.source !== "string" || typeof e.target !== "string" || typeof e.edge_type !== "string") continue;
    out.push({
      source: e.source,
      target: e.target,
      edge_type: e.edge_type as ExplorerEdge["edge_type"],
      origin: typeof e.origin === "string" ? e.origin : "",
      weight: typeof e.weight === "number" ? e.weight : 1,
      evidence: typeof e.evidence === "string" ? e.evidence : null,
      hop: typeof e.hop === "number" ? e.hop : 1,
      metadata: edgeMetadataFrom(e.metadata),
    });
  }
  return out;
}

// ─── A node's routing details ────────────────────────────────────────────────

export const TRACK_CLASS_LABELS: Readonly<Record<string, string>> = {
  admin: "القضاء الإداري",
  ordinary: "القضاء العام",
  semi: "اللجان شبه القضائية",
};

export interface NodeMetaRow {
  label: string;
  value: string;
  /** A list value (laws, committees), already capped; `value` then says how many. */
  list?: string[];
}

const META_LIST_MAX = 30;

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
}

function listRow(label: string, items: string[]): NodeMetaRow | null {
  if (items.length === 0) return null;
  const shown = items.slice(0, META_LIST_MAX);
  const more = items.length - shown.length;
  return { label, value: more > 0 ? `${items.length} (يُعرض ${shown.length})` : String(items.length), list: shown };
}

/**
 * The routing and source details a node carries in `metadata` (never
 * embedded): a law's section, a principle's court, track class, subject
 * section, committees and governing laws, a term's laws, a concept's target
 * laws, a decree's type and issuer. Unknown keys are not shown.
 */
export function describeNodeMetadata(nodeType: unknown, metadata: unknown): NodeMetaRow[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const m = metadata as Record<string, unknown>;
  const rows: Array<NodeMetaRow | null> = [];
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

  const section = normalizeSectionCode(m.section_code);
  if (section) rows.push({ label: "القسم", value: `${section} · ${SECTION_LABELS[section] ?? "—"}` });
  const court = str(m.court);
  if (court) rows.push({ label: "الجهة القضائية", value: court });
  const track = str(m.track);
  if (track) rows.push({ label: "المسار", value: track });
  const trackClass = str(m.track_class);
  if (trackClass) rows.push({ label: "فئة المسار (للتوجيه)", value: TRACK_CLASS_LABELS[trackClass] ?? trackClass });
  const subject = normalizeSectionCode(m.subject_section);
  if (subject) rows.push({ label: "قسم الموضوع", value: `${subject} · ${SECTION_LABELS[subject] ?? "—"}` });
  const families = strList(m.committee_families).map((id) => COMMITTEE_FAMILIES.find((f) => f.id === id)?.label ?? id);
  rows.push(listRow("اللجان", families));
  rows.push(listRow("الأنظمة الحاكمة", strList(m.governing_laws)));
  if (nodeType === "term") {
    const count = typeof m.law_count === "number" ? m.law_count : null;
    const laws = strList(m.laws);
    const row = listRow("الأنظمة التي تعرّفه", laws);
    if (row && count !== null && count > laws.length) row.value = `${count} (يُعرض ${row.list?.length ?? 0})`;
    rows.push(row);
  }
  rows.push(listRow("الأنظمة المستهدفة", strList(m.target_laws)));
  const type = str(m.type);
  if (type && nodeType === "decree") rows.push({ label: "نوع الوثيقة", value: type });
  const issuer = str(m.issuer);
  if (issuer) rows.push({ label: "الجهة المصدرة", value: issuer });
  if (typeof m.amendment_count === "number" && m.amendment_count > 0) rows.push({ label: "عدد التعديلات", value: String(m.amendment_count) });
  if (m.has_inline_regulation === true) rows.push({ label: "لائحة مضمّنة", value: "نعم" });
  const bookType = str(m.book_type);
  if (bookType && nodeType === "feqh") rows.push({ label: "نوع الكتاب", value: bookType });
  return rows.filter((r): r is NodeMetaRow => r !== null);
}

export function isExplorerEdgeType(v: unknown): v is ExplorerEdgeType {
  return typeof v === "string" && (EXPLORER_EDGE_TYPES as readonly string[]).includes(v);
}

export function isExplorerNodeType(v: unknown): v is ExplorerNodeType {
  return typeof v === "string" && (EXPLORER_NODE_TYPES as readonly string[]).includes(v);
}

export interface ExplorerNode {
  node_key: string;
  node_type: ExplorerNodeType | "query";
  title: string;
  hop: number;
  degree: number;
  has_vector: boolean;
  law_slug?: string | null;
  article_number?: number | null;
  doc_status?: string | null;
  item_status?: string | null;
  url?: string;
  snippet?: string;
}

export interface ExplorerEdgeMetadata {
  /** "owner_links": read from the owner's own files (20261118_10). */
  source?: string;
  /** A vector link's cosine similarity. */
  sim?: number;
  /** How a REPLACED_BY link was found: "successor_law" or "nearest_active". */
  method?: string;
}

export interface ExplorerEdge {
  source: string;
  target: string;
  edge_type: ExplorerEdgeType | "MATCH";
  origin: string;
  weight: number;
  evidence: string | null;
  hop: number;
  /** 20261119_10; null or absent from an older server. */
  metadata?: ExplorerEdgeMetadata | null;
}

export interface ExplorerGraph {
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
}

export function isRepealedNode(n: Pick<ExplorerNode, "doc_status" | "item_status">): boolean {
  return n.doc_status === "repealed" || n.item_status === "repealed";
}

export function edgeId(e: Pick<ExplorerEdge, "source" | "target" | "edge_type">): string {
  return `${e.source}|${e.target}|${e.edge_type}`;
}

// ─── Request validation ──────────────────────────────────────────────────────

export type ExplorerRequest =
  | { action: "overview" }
  | { action: "status" }
  /** The graph's live numbers over the last `hours` (20261121_10). */
  | { action: "live"; hours: number }
  | { action: "search"; q: string; types: ExplorerNodeType[]; limit: number }
  | { action: "neighborhood"; key: string; depth: 1 | 2; limit: number; edges: ExplorerEdgeType[] }
  | { action: "node"; key: string }
  | {
      action: "retrieve";
      q: string;
      keywords: string[];
      scope: LabScope;
      /** The law page the question is asked on (a live run's `law_slug`): «المادة ٧٧» alone then means that law's. */
      lawSlug: string | null;
      /** The article the reader has open (a live run's `article_id`): it seeds the answer and leads it. */
      articleId: string | null;
      /** true: also decrees and fiqh, more articles; false: the AI's own limits. */
      wide: boolean;
      /** false: the graph links are turned off (direct matches only), to compare. */
      links: boolean;
      /** How many times the limits to ask for (1 = as the AI asks). */
      size: LabSize;
    };

/**
 * The lab's result limits. `ai` is what the AI services ask for (tools.ts:
 * laws 8 → the graph is asked for 8 + 2, principles 4, no decrees or fiqh);
 * `wide` shows decrees and fiqh too.
 */
export const LAB_LIMITS = {
  ai: { laws: 10, principles: 4, decrees: 0, feqh: 0 },
  wide: { laws: 8, principles: 4, decrees: 2, feqh: 2 },
} as const;

/** The lab's result sizes: the limits as they are, or two / three times them. */
export const LAB_SIZES = [1, 2, 3] as const;
export type LabSize = (typeof LAB_SIZES)[number];
export const LAB_SIZE_LABELS: Readonly<Record<LabSize, string>> = { 1: "عادي", 2: "ضعفه", 3: "ثلاثة أضعافه" };

/** The limits the lab asks for: the AI's (or the wide ones) times the size. */
export function labLimits(wide: boolean, size: LabSize): { laws: number; principles: number; decrees: number; feqh: number } {
  const base = wide ? LAB_LIMITS.wide : LAB_LIMITS.ai;
  return { laws: base.laws * size, principles: base.principles * size, decrees: base.decrees * size, feqh: base.feqh * size };
}

/** Where the routed section came from (retrieve's `routing.source`). */
export const LAB_ROUTING_SOURCE_LABELS: Readonly<Record<"law" | "vote" | "none", string>> = {
  law: "من النظام المسمّى أو الصفحة",
  vote: "من أقوى النتائج",
  none: "بلا مصدر",
};

/**
 * The lab's routing switch (graph_rag_retrieve_scoped, 20261116_10): `auto` is
 * what the AI tools get; `section` keeps only the question's section (explicit
 * legal links still cross); `all` turns routing off.
 */
export const LAB_SCOPES = ["auto", "section", "all"] as const;
export type LabScope = (typeof LAB_SCOPES)[number];
export const LAB_SCOPE_LABELS: Record<LabScope, string> = {
  auto: "تلقائي",
  section: "القسم فقط",
  all: "كل الأقسام",
};
export function isLabScope(v: unknown): v is LabScope {
  return typeof v === "string" && (LAB_SCOPES as readonly string[]).includes(v);
}

export type ParseExplorerResult = { ok: true; value: ExplorerRequest } | { ok: false; error: string };

/** Node keys look like `article:labor-law__art-77`; never whitespace, quotes or `;`. */
const NODE_KEY_RE = /^[^\s;'"\\]{3,260}$/u;
/** A law slug (laws.slug) or an article id (articles.id): same rule, shorter. */
const LIBRARY_ID_RE = /^[^\s;'"\\,،/?#]{1,200}$/u;

/**
 * A slug or id typed or pasted by an admin. One percent-decode (a slug copied
 * from the address bar is still encoded after the query string is parsed),
 * then NFC as the library stores ids; validated after decoding.
 */
function libraryId(raw: string | null): string | null {
  let v = (raw ?? "").trim();
  if (/%[0-9A-Fa-f]{2}/.test(v)) {
    try {
      v = decodeURIComponent(v).trim();
    } catch {
      // a malformed escape stays as typed
    }
  }
  v = v.normalize("NFC");
  return v && LIBRARY_ID_RE.test(v) ? v : null;
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw === null || raw === "" ? NaN : Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function csv(raw: string | null): string[] {
  return (raw ?? "")
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseExplorerRequest(params: URLSearchParams): ParseExplorerResult {
  const action = (params.get("action") ?? "overview").trim() || "overview";

  if (action === "overview") return { ok: true, value: { action: "overview" } };
  if (action === "status") return { ok: true, value: { action: "status" } };
  if (action === "live") return { ok: true, value: { action: "live", hours: clampInt(params.get("hours"), 24, 1, 720) } };

  if (action === "search") {
    const q = (params.get("q") ?? "").trim().slice(0, 200);
    if (!q) return { ok: false, error: "اكتب كلمة للبحث" };
    const types = csv(params.get("types")).filter(isExplorerNodeType);
    return { ok: true, value: { action: "search", q, types, limit: clampInt(params.get("limit"), 24, 1, 60) } };
  }

  if (action === "neighborhood" || action === "node") {
    const key = (params.get("key") ?? "").trim();
    if (!NODE_KEY_RE.test(key)) return { ok: false, error: "معرّف العقدة غير صالح" };
    if (action === "node") return { ok: true, value: { action: "node", key } };
    const depth = clampInt(params.get("depth"), 1, 1, 2) as 1 | 2;
    const edges = csv(params.get("edges")).filter(isExplorerEdgeType);
    return { ok: true, value: { action: "neighborhood", key, depth, limit: clampInt(params.get("limit"), 60, 5, 200), edges } };
  }

  if (action === "retrieve") {
    const q = (params.get("q") ?? "").trim().slice(0, 1000);
    if (!q) return { ok: false, error: "اكتب سؤالاً لتجربة البحث" };
    const keywords = csv(params.get("keywords"))
      .map((k) => k.slice(0, 80))
      .slice(0, 6);
    const rawScope = (params.get("scope") ?? "").trim();
    const scope: LabScope = isLabScope(rawScope) ? rawScope : "auto";
    const rawLaw = params.get("law");
    const rawArticle = params.get("article");
    const lawSlug = libraryId(rawLaw);
    const articleId = libraryId(rawArticle);
    if ((rawLaw ?? "").trim() !== "" && !lawSlug) return { ok: false, error: "معرّف النظام غير صالح" };
    if ((rawArticle ?? "").trim() !== "" && !articleId) return { ok: false, error: "معرّف المادة غير صالح" };
    const wide = params.get("wide") === "1";
    const links = params.get("links") !== "0";
    const size = clampInt(params.get("size"), 1, 1, 3) as LabSize;
    return { ok: true, value: { action: "retrieve", q, keywords, scope, lawSlug, articleId, wide, links, size } };
  }

  return { ok: false, error: "إجراء غير معروف" };
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export interface XY {
  x: number;
  y: number;
}

/** Arc length reserved per card on a ring (cards are ~232px wide). */
const RING_ARC = 270;
const RING1_MIN = 340;
const RING_GAP = 330;
const START_ANGLE = -Math.PI / 2;

function edgeTypeRank(t: ExplorerEdge["edge_type"]): number {
  const i = (EXPLORER_EDGE_TYPES as readonly string[]).indexOf(t);
  return i === -1 ? EXPLORER_EDGE_TYPES.length : i;
}

function ringRadius(slots: number, min: number): number {
  return Math.max(min, (slots * RING_ARC) / (2 * Math.PI));
}

function round(p: XY): XY {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/**
 * The centre at 0,0; its direct neighbours on ring 1, grouped by link type into
 * contiguous sectors (one empty slot between groups); second-hop nodes on ring
 * 2, ordered by the angle of the ring-1 node they hang off. Rings grow with
 * their population, so cards never overlap. Deterministic for a given set.
 */
export function layoutRadial(centerKey: string, nodes: readonly ExplorerNode[], edges: readonly ExplorerEdge[]): Map<string, XY> {
  const pos = new Map<string, XY>();
  pos.set(centerKey, { x: 0, y: 0 });

  const sortedEdges = [...edges].sort(
    (a, b) => edgeTypeRank(a.edge_type) - edgeTypeRank(b.edge_type) || edgeId(a).localeCompare(edgeId(b)),
  );

  // Ring 1: each direct neighbour's strongest link type to the centre.
  const ring1Type = new Map<string, number>();
  for (const e of sortedEdges) {
    const other = e.source === centerKey ? e.target : e.target === centerKey ? e.source : null;
    if (!other || other === centerKey || ring1Type.has(other)) continue;
    ring1Type.set(other, edgeTypeRank(e.edge_type));
  }
  for (const n of nodes) {
    if (n.node_key !== centerKey && n.hop === 1 && !ring1Type.has(n.node_key)) ring1Type.set(n.node_key, EXPLORER_EDGE_TYPES.length);
  }

  const ring1 = [...ring1Type.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const slots: Array<string | null> = [];
  let lastGroup: number | null = null;
  for (const [key, group] of ring1) {
    if (lastGroup !== null && group !== lastGroup) slots.push(null);
    slots.push(key);
    lastGroup = group;
  }
  const r1 = ringRadius(slots.length, RING1_MIN);
  const angleOf = new Map<string, number>();
  slots.forEach((key, i) => {
    if (!key) return;
    const a = START_ANGLE + (i * 2 * Math.PI) / Math.max(slots.length, 1);
    angleOf.set(key, a);
    pos.set(key, round({ x: r1 * Math.cos(a), y: r1 * Math.sin(a) }));
  });

  // Ring 2: everything else, next to the ring-1 node it hangs off.
  const rest = nodes.filter((n) => !pos.has(n.node_key)).map((n) => n.node_key);
  const parentAngle = new Map<string, number>();
  for (const key of rest) {
    for (const e of sortedEdges) {
      const other = e.source === key ? e.target : e.target === key ? e.source : null;
      if (other && angleOf.has(other)) {
        parentAngle.set(key, angleOf.get(other)!);
        break;
      }
    }
  }
  const ring2 = [...new Set(rest)].sort(
    (a, b) => (parentAngle.get(a) ?? Infinity) - (parentAngle.get(b) ?? Infinity) || a.localeCompare(b),
  );
  if (ring2.length > 0) {
    const r2 = ringRadius(ring2.length, r1 + RING_GAP);
    const start = parentAngle.get(ring2[0]) ?? START_ANGLE;
    ring2.forEach((key, i) => {
      const a = start + (i * 2 * Math.PI) / ring2.length;
      pos.set(key, round({ x: r2 * Math.cos(a), y: r2 * Math.sin(a) }));
    });
  }

  return pos;
}

// ─── Column ("lanes") layout — the readable default ─────────────────────────

export interface LaneLabel {
  edge_type: ExplorerEdgeType | "OTHER";
  count: number;
  x: number;
  y: number;
}

const LANE_CARD_W = 232;
const LANE_ROW = 100; // an 80px card + 20px gap
const LANE_LABEL_ROW = 40;
const LANE_COL = 268; // a 232px card + 36px gap
const LANE_CENTER_HALF = 142; // half the 284px centre card
const LANE_CENTER_GAP = 120;
const LANE_OUTER_GAP = 60;
const CANVAS_ASPECT = 1.8;

type LaneEntry = { kind: "label"; type: number; count: number } | { kind: "card"; key: string };

/** Each direct neighbour's strongest link type to the centre (rank in EXPLORER_EDGE_TYPES). */
function ringOneGroups(centerKey: string, nodes: readonly ExplorerNode[], sortedEdges: readonly ExplorerEdge[]) {
  const rank = new Map<string, number>();
  for (const e of sortedEdges) {
    const other = e.source === centerKey ? e.target : e.target === centerKey ? e.source : null;
    if (!other || other === centerKey || rank.has(other)) continue;
    rank.set(other, edgeTypeRank(e.edge_type));
  }
  for (const n of nodes) {
    if (n.node_key !== centerKey && n.hop === 1 && !rank.has(n.node_key)) rank.set(n.node_key, EXPLORER_EDGE_TYPES.length);
  }
  const groups = new Map<number, string[]>();
  for (const [key, r] of rank) groups.set(r, [...(groups.get(r) ?? []), key]);
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([type, keys]) => ({ type, keys: keys.sort() }));
}

function packColumns(groups: ReadonlyArray<{ type: number; keys: string[] }>, rows: number): LaneEntry[][] {
  const capacity = rows * LANE_ROW;
  const cols: LaneEntry[][] = [];
  let cur: LaneEntry[] = [];
  let height = 0;
  const flush = () => {
    if (cur.length > 0) cols.push(cur);
    cur = [];
    height = 0;
  };
  for (const g of groups) {
    if (cur.length > 0 && height + LANE_LABEL_ROW + LANE_ROW > capacity) flush();
    cur.push({ kind: "label", type: g.type, count: g.keys.length });
    height += LANE_LABEL_ROW;
    for (const key of g.keys) {
      if (cur.length > 0 && height + LANE_ROW > capacity) flush();
      cur.push({ kind: "card", key });
      height += LANE_ROW;
    }
  }
  flush();
  return cols;
}

function columnHeight(col: readonly LaneEntry[]): number {
  return col.reduce((s, e) => s + (e.kind === "label" ? LANE_LABEL_ROW : LANE_ROW), 0);
}

/**
 * The centre at 0,0; its direct neighbours stacked in columns either side of
 * it (right first, then left, alternating outward), grouped by link type with
 * a label above each group; second-hop nodes in outer columns on the side of
 * the node they hang off. The rows per column are chosen so the whole picture
 * is as close to a landscape canvas as possible. Deterministic for a given set.
 */
export function layoutLanes(
  centerKey: string,
  nodes: readonly ExplorerNode[],
  edges: readonly ExplorerEdge[],
): { positions: Map<string, XY>; lanes: LaneLabel[] } {
  const positions = new Map<string, XY>([[centerKey, { x: 0, y: 0 }]]);
  const lanes: LaneLabel[] = [];
  const sortedEdges = [...edges].sort(
    (a, b) => edgeTypeRank(a.edge_type) - edgeTypeRank(b.edge_type) || edgeId(a).localeCompare(edgeId(b)),
  );
  const groups = ringOneGroups(centerKey, nodes, sortedEdges);
  if (groups.length === 0) return { positions, lanes };

  const units = groups.reduce((s, g) => s + g.keys.length, 0) + groups.length;
  let best: { cols: LaneEntry[][]; score: number; rows: number } | null = null;
  for (let rows = 2; rows <= Math.max(2, units); rows++) {
    const cols = packColumns(groups, rows);
    const perSide = Math.ceil(cols.length / 2);
    const width = 2 * (LANE_CENTER_HALF + LANE_CENTER_GAP + perSide * LANE_COL);
    const height = Math.max(...cols.map(columnHeight), 160);
    const score = Math.max(width / CANVAS_ASPECT, height);
    if (!best || score < best.score - 1e-6) best = { cols, score, rows };
  }

  const colX = (side: 1 | -1, index: number) => side * (LANE_CENTER_HALF + LANE_CENTER_GAP + LANE_CARD_W / 2 + index * LANE_COL);
  const columnsPerSide = { 1: 0, [-1]: 0 } as Record<1 | -1, number>;
  best!.cols.forEach((col, i) => {
    const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const x = colX(side, Math.floor(i / 2));
    columnsPerSide[side] = Math.floor(i / 2) + 1;
    let y = -columnHeight(col) / 2;
    for (const entry of col) {
      if (entry.kind === "label") {
        const type = EXPLORER_EDGE_TYPES[entry.type] ?? "OTHER";
        lanes.push({ edge_type: type, count: entry.count, x, y: Math.round(y + LANE_LABEL_ROW / 2) });
        y += LANE_LABEL_ROW;
      } else {
        positions.set(entry.key, { x, y: Math.round(y + LANE_ROW / 2) });
        y += LANE_ROW;
      }
    }
  });

  // Second hop: outer columns, on the side of the ring-1 node each hangs off.
  const rest = [...new Set(nodes.map((n) => n.node_key))].filter((k) => !positions.has(k)).sort();
  const bySide: Record<1 | -1, Array<{ key: string; parentY: number }>> = { 1: [], [-1]: [] } as Record<1 | -1, Array<{ key: string; parentY: number }>>;
  for (const key of rest) {
    let parent: XY | undefined;
    for (const e of sortedEdges) {
      const other = e.source === key ? e.target : e.target === key ? e.source : null;
      if (other && other !== centerKey && positions.has(other)) {
        parent = positions.get(other);
        break;
      }
    }
    const side: 1 | -1 = parent && parent.x < 0 ? -1 : 1;
    bySide[side].push({ key, parentY: parent?.y ?? 0 });
  }
  for (const side of [1, -1] as const) {
    const list = bySide[side].sort((a, b) => a.parentY - b.parentY || a.key.localeCompare(b.key));
    const rows = Math.max(best!.rows, 2);
    for (let c = 0; c * rows < list.length; c++) {
      const chunk = list.slice(c * rows, (c + 1) * rows);
      const x = colX(side, columnsPerSide[side] + c) + side * LANE_OUTER_GAP;
      let y = -(chunk.length * LANE_ROW) / 2;
      for (const { key } of chunk) {
        positions.set(key, { x, y: Math.round(y + LANE_ROW / 2) });
        y += LANE_ROW;
      }
    }
  }

  return { positions, lanes };
}

/**
 * "Expand" places a node's new neighbours on an arc that opens away from the
 * centre (0,0), pushing any card that would land on an existing one outward.
 * Nodes already on the canvas keep their position (they are not returned).
 */
export function layoutExpansion(anchorKey: string, keys: readonly string[], existing: ReadonlyMap<string, XY>): Map<string, XY> {
  const anchor = existing.get(anchorKey) ?? { x: 0, y: 0 };
  const fresh = [...new Set(keys)].filter((k) => !existing.has(k) && k !== anchorKey).sort();
  const out = new Map<string, XY>();
  if (fresh.length === 0) return out;

  const atCentre = Math.hypot(anchor.x, anchor.y) < 1;
  const dir = atCentre ? START_ANGLE : Math.atan2(anchor.y, anchor.x);
  const maxSpread = atCentre ? 2 * Math.PI * (1 - 1 / fresh.length) : 0.9 * Math.PI;
  let radius = Math.max(280, ((fresh.length - 1) * 250) / Math.max(maxSpread, 0.0001));
  if (fresh.length === 1) radius = 300;
  const spread = fresh.length === 1 ? 0 : Math.min(maxSpread, ((fresh.length - 1) * 250) / radius);

  const occupied = [...existing.values()];
  fresh.forEach((key, i) => {
    const a = fresh.length === 1 ? dir : dir - spread / 2 + (i * spread) / (fresh.length - 1);
    let r = radius;
    let p = { x: anchor.x + r * Math.cos(a), y: anchor.y + r * Math.sin(a) };
    for (let tries = 0; tries < 8 && occupied.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 200); tries++) {
      r += 130;
      p = { x: anchor.x + r * Math.cos(a), y: anchor.y + r * Math.sin(a) };
    }
    const placed = round(p);
    out.set(key, placed);
    occupied.push(placed);
  });
  return out;
}

// ─── Merging ─────────────────────────────────────────────────────────────────

/**
 * Adds an expansion to the graph on screen: nodes already shown keep their hop
 * (the original centre stays the centre), new nodes and new edges are appended.
 */
export function mergeNeighborhoods(base: ExplorerGraph, extra: ExplorerGraph): ExplorerGraph {
  const nodes = new Map<string, ExplorerNode>();
  for (const n of base.nodes) nodes.set(n.node_key, n);
  for (const n of extra.nodes) {
    const prev = nodes.get(n.node_key);
    nodes.set(n.node_key, prev ? { ...n, hop: prev.hop } : n);
  }
  const edges = new Map<string, ExplorerEdge>();
  for (const e of [...base.edges, ...extra.edges]) if (!edges.has(edgeId(e))) edges.set(edgeId(e), e);
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

// ─── Retrieval lab ───────────────────────────────────────────────────────────

const AR_STOPWORDS = new Set([
  "من", "في", "على", "عن", "إلى", "الى", "مع", "هل", "ما", "ماذا", "كيف", "لماذا", "متى", "أين", "أن", "إن", "ان",
  "التي", "الذي", "الذين", "هذا", "هذه", "ذلك", "تلك", "كل", "أو", "او", "ثم", "قد", "لا", "لم", "لن", "عند",
  "بعد", "قبل", "بدون", "وبدون", "دون", "غير", "بين", "حتى", "إذا", "اذا", "لو", "كان", "كانت", "يكون", "عندي",
  "لي", "لك", "هو", "هي", "انا", "أنا", "نحن", "فجأة", "يعني", "شي", "شيء",
]);

const TASHKEEL_RE = /[\u064B-\u065F\u0670\u0640]/g;

/** Explicit keywords win (like n8n's lib-queries); else the question's 4 longest distinct content words. */
export function deriveLabQueries(question: string, keywords: readonly string[]): string[] {
  const explicit = keywords.map((k) => k.trim()).filter(Boolean).slice(0, 6);
  if (explicit.length > 0) return explicit;
  const words = question
    .replace(TASHKEEL_RE, "")
    .split(/[\s\p{P}\p{S}]+/u)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !AR_STOPWORDS.has(w));
  return [...new Set(words)].sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 4);
}

export interface LabHit {
  node_key: string;
  kind: ExplorerNodeType;
  title: string;
  score: number;
  via_edge_type?: string | null;
  via_from_title?: string | null;
  /** 0 direct hit, 1 or 2 graph hops (20261115_10); absent from an older server: read from via_edge_type. */
  hop?: number;
  /** An article the question names outright, sent to the graph as a seed (20261117_10). */
  seed?: boolean;
  law_slug?: string | null;
  status?: string | null;
  url?: string;
  text?: string;
}

/** The section and laws retrieve routed a question to (the answer's `routing` object). */
export interface LabRouting {
  scope: LabScope;
  section: string | null;
  section_label: string | null;
  confident: boolean;
  /** "law" (a pinned law), "vote" (the strongest results), "none". */
  source: "law" | "vote" | "none";
  laws: string[];
  /** How many named articles seeded the answer (20261117_10); 0 from an older server. */
  seeds: number;
}

/** Reads retrieve's `routing` object; null from a server before 20261116_10. */
export function parseLabRouting(raw: unknown): LabRouting | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const section = normalizeSectionCode(r.section);
  const source = r.source === "law" || r.source === "vote" ? r.source : "none";
  return {
    scope: isLabScope(r.scope) ? r.scope : "auto",
    section,
    section_label: section ? SECTION_LABELS[section] ?? null : null,
    confident: r.confident === true,
    source,
    laws: Array.isArray(r.laws) ? r.laws.filter((l): l is string => typeof l === "string").slice(0, 12) : [],
    seeds: typeof r.seeds === "number" && Number.isFinite(r.seeds) && r.seeds > 0 ? Math.floor(r.seeds) : 0,
  };
}

/** How far from the question a lab hit is: 0 direct, 1 or 2 graph steps. */
export function labHop(h: Pick<LabHit, "hop" | "via_edge_type">): number {
  return typeof h.hop === "number" && h.hop >= 0 ? h.hop : h.via_edge_type ? 1 : 0;
}

/** A lab hit's layer: 0 direct (a named article too), 1 the first hop, 2 the second (or further). */
export type LabLayer = 0 | 1 | 2;
export const LAB_LAYERS: readonly LabLayer[] = [0, 1, 2];
export function labLayer(h: Pick<LabHit, "hop" | "via_edge_type">): LabLayer {
  return Math.min(labHop(h), 2) as LabLayer;
}

/** How many hits sit in each layer (the lab's layer chips). */
export function labLayerCounts(hits: ReadonlyArray<Pick<LabHit, "hop" | "via_edge_type">>): Record<LabLayer, number> {
  const out: Record<LabLayer, number> = { 0: 0, 1: 0, 2: 0 };
  for (const h of hits) out[labLayer(h)]++;
  return out;
}

/**
 * What the graph links changed, comparing a run with them to the same
 * question without them: the hits only the linked run has, and the hits the
 * linked run no longer shows (the links pushed them out of the limits).
 */
export function labLinksDiff<H extends Pick<LabHit, "node_key">>(
  withLinks: readonly H[],
  without: readonly H[],
): { added: Set<string>; pushedOut: H[] } {
  const base = new Set(without.map((h) => h.node_key));
  const linked = new Set(withLinks.map((h) => h.node_key));
  return {
    added: new Set(withLinks.filter((h) => !base.has(h.node_key)).map((h) => h.node_key)),
    pushedOut: without.filter((h) => !linked.has(h.node_key)),
  };
}

/** The lab's step badge: «مباشر» (direct match), «خطوة ١», «خطوة ٢». */
export function labHopLabel(hop: number): string {
  if (hop <= 0) return "مباشر";
  return hop === 1 ? "خطوة ١" : "خطوة ٢";
}

/**
 * The lab's picture: the question in the middle, each direct hit linked to it,
 * each graph-hop hit linked to the hit that led to it — a second-hop hit to the
 * first-hop hit it came through — or to the question when that seed is not
 * among the results. `ranks` is the final 1-based order.
 */
export function buildLabGraph(question: string, hits: readonly LabHit[]): ExplorerGraph & { ranks: Map<string, number> } {
  const ordered = [...hits].sort((a, b) => b.score - a.score || a.node_key.localeCompare(b.node_key));
  const ranks = new Map<string, number>();
  ordered.forEach((h, i) => ranks.set(h.node_key, i + 1));

  const nodes: ExplorerNode[] = [
    { node_key: QUERY_NODE_KEY, node_type: "query", title: question.slice(0, 140), hop: 0, degree: ordered.length, has_vector: false },
  ];
  // A seed is named by its title: the nearest hit with that title wins.
  const keyByTitle = new Map<string, string>();
  for (const h of [...ordered].sort((a, b) => labHop(a) - labHop(b))) {
    if (!keyByTitle.has(h.title)) keyByTitle.set(h.title, h.node_key);
  }
  for (const h of ordered) {
    nodes.push({
      node_key: h.node_key,
      node_type: h.kind,
      title: h.title,
      hop: labHop(h) + 1,
      degree: 0,
      has_vector: false,
      law_slug: h.law_slug ?? null,
      item_status: h.status ?? null,
      url: h.url,
      snippet: h.text?.slice(0, 160),
    });
  }

  const edges: ExplorerEdge[] = [];
  for (const h of ordered) {
    const seed = h.via_edge_type && h.via_from_title ? keyByTitle.get(h.via_from_title) : undefined;
    if (seed && seed !== h.node_key && isExplorerEdgeType(h.via_edge_type)) {
      edges.push({ source: seed, target: h.node_key, edge_type: h.via_edge_type, origin: "lab", weight: 1, evidence: null, hop: labHop(h) + 1 });
    } else {
      edges.push({ source: QUERY_NODE_KEY, target: h.node_key, edge_type: "MATCH", origin: "lab", weight: h.score, evidence: null, hop: 1 });
    }
  }
  return { nodes, edges, ranks };
}

// ─── Status tab (graph_rag_explore_status, 20261119_10) ─────────────────────

/** The watchdog's owner-link reading of its last full pass (graphOwnerLinks.ts OwnerLinkStats). */
export interface OwnerLinkRunStats {
  links: number;
  edges: number;
  resolved: Record<string, number>;
  notFound: number;
  ambiguous: number;
  stillInForce: number;
  contradictory: number;
  lawLevel: number;
  articlesNotInLaw: number;
  related: number;
  decreeOther: number;
}

export interface ExplorerStatus {
  default_model_id: string | null;
  sync: {
    dirty: boolean;
    dirty_tables: string[];
    first_dirty_at: string | null;
    last_write_at: string | null;
    last_synced_at: string | null;
    last_sync_status: string;
    last_error: string | null;
  } | null;
  running_run: { id: number; started_at: string; trigger_source: string } | null;
  last_run: {
    status: string;
    trigger_source: string;
    started_at: string | null;
    finished_at: string | null;
    nodes_upserted: number;
    nodes_deleted: number;
    edges_upserted: number;
    api_embedded: number;
    embed_only: boolean;
    error_message: string | null;
  } | null;
  owner_links_run: { finished_at: string | null; stats: OwnerLinkRunStats } | null;
  owner_links: { laws: number; decrees: number; edges: Record<string, number> };
  similarity: { with_vector: number; done: number; repealed_done: number; last_computed_at: string | null };
  replacement_pairs: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function numberRecord(v: unknown): Record<string, number> {
  const o = obj(v);
  if (!o) return {};
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(o)) if (typeof x === "number" && Number.isFinite(x)) out[k] = x;
  return out;
}

/** Reads graph_rag_explore_status(); every field defaults, so a partial answer never breaks the tab. */
export function parseExplorerStatus(raw: unknown): ExplorerStatus {
  const r = obj(raw) ?? {};
  const sync = obj(r.sync);
  const running = obj(r.running_run);
  const last = obj(r.last_run);
  const ownerRun = obj(r.owner_links_run);
  const ownerStats = obj(ownerRun?.stats);
  const owner = obj(r.owner_links) ?? {};
  const sim = obj(r.similarity) ?? {};
  return {
    default_model_id: strOrNull(r.default_model_id),
    sync: sync
      ? {
          dirty: sync.dirty === true,
          dirty_tables: strList(sync.dirty_tables),
          first_dirty_at: strOrNull(sync.first_dirty_at),
          last_write_at: strOrNull(sync.last_write_at),
          last_synced_at: strOrNull(sync.last_synced_at),
          last_sync_status: strOrNull(sync.last_sync_status) ?? "",
          last_error: strOrNull(sync.last_error),
        }
      : null,
    running_run:
      running && strOrNull(running.started_at)
        ? { id: num(running.id), started_at: String(running.started_at), trigger_source: strOrNull(running.trigger_source) ?? "" }
        : null,
    last_run: last
      ? {
          status: strOrNull(last.status) ?? "",
          trigger_source: strOrNull(last.trigger_source) ?? "",
          started_at: strOrNull(last.started_at),
          finished_at: strOrNull(last.finished_at),
          nodes_upserted: num(last.nodes_upserted),
          nodes_deleted: num(last.nodes_deleted),
          edges_upserted: num(last.edges_upserted),
          api_embedded: num(last.api_embedded),
          embed_only: last.embed_only === true,
          error_message: strOrNull(last.error_message),
        }
      : null,
    owner_links_run: ownerStats
      ? {
          finished_at: strOrNull(ownerRun?.finished_at),
          stats: {
            links: num(ownerStats.links),
            edges: num(ownerStats.edges),
            resolved: numberRecord(ownerStats.resolved),
            notFound: num(ownerStats.notFound),
            ambiguous: num(ownerStats.ambiguous),
            stillInForce: num(ownerStats.stillInForce),
            contradictory: num(ownerStats.contradictory),
            lawLevel: num(ownerStats.lawLevel),
            articlesNotInLaw: num(ownerStats.articlesNotInLaw),
            related: num(ownerStats.related),
            decreeOther: num(ownerStats.decreeOther),
          },
        }
      : null,
    owner_links: { laws: num(owner.laws), decrees: num(owner.decrees), edges: numberRecord(owner.edges) },
    similarity: {
      with_vector: num(sim.with_vector),
      done: num(sim.done),
      repealed_done: num(sim.repealed_done),
      last_computed_at: strOrNull(sim.last_computed_at),
    },
    replacement_pairs: num(r.replacement_pairs),
  };
}

/** The status tab's one-line verdict on the graph. */
export function syncVerdict(s: Pick<ExplorerStatus, "sync" | "running_run">): { tone: "ok" | "busy" | "wait" | "error"; label: string } {
  if (s.running_run) return { tone: "busy", label: "مزامنة جارية الآن" };
  if (!s.sync) return { tone: "wait", label: "لا حالة مزامنة بعد" };
  if (s.sync.last_sync_status === "failed") return { tone: "error", label: "فشلت آخر مزامنة" };
  if (s.sync.dirty || !s.sync.last_synced_at) return { tone: "wait", label: "بانتظار إعادة البناء" };
  return { tone: "ok", label: "مستقر وجاهز" };
}
