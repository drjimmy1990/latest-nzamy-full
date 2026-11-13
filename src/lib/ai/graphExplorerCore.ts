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

export const EXPLORER_NODE_TYPES = ["article", "principle", "decree", "feqh", "concept"] as const;
export type ExplorerNodeType = (typeof EXPLORER_NODE_TYPES)[number];

/** Same order as the radial sectors; matches the edge_type check of 20261110_10. */
export const EXPLORER_EDGE_TYPES = [
  "EXEMPTS_FROM",
  "AMENDS_ARTICLE",
  "INTERPRETS_ARTICLE",
  "SUPERSEDES_LAW",
  "PARENT_LAW",
  "ESTABLISHES_RULE",
  "CITES_ARTICLE",
  "DECONSTRUCTS_CONCEPT",
  "HAS_CONCEPT",
] as const;
export type ExplorerEdgeType = (typeof EXPLORER_EDGE_TYPES)[number];

export const QUERY_NODE_KEY = "__query__";

export const NODE_TYPE_META: Readonly<Record<ExplorerNodeType, { label: string; plural: string; color: string }>> = {
  article: { label: "مادة نظامية", plural: "المواد النظامية", color: "#C8A762" },
  principle: { label: "مبدأ قضائي", plural: "المبادئ القضائية", color: "#5FB3A1" },
  decree: { label: "مرسوم / تعميم", plural: "المراسيم والتعاميم", color: "#D9826F" },
  feqh: { label: "نص فقهي", plural: "النصوص الفقهية", color: "#A3B86C" },
  concept: { label: "مفهوم قانوني", plural: "المفاهيم القانونية", color: "#7FA8DC" },
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
    hint: "نص يقيّد حكم مادة أخرى أو يستثني منها («استثناءً من المادة…»، «مع عدم الإخلال…»).",
  },
  AMENDS_ARTICLE: {
    label: "تعديل",
    out: "يعدّل",
    in: "معدّلة بموجب",
    color: "#D9826F",
    hint: "مرسوم أو قرار عدّل نص المادة أو أضاف إليها أو حذف منها.",
  },
  INTERPRETS_ARTICLE: {
    label: "تفسير قضائي",
    out: "يفسّر",
    in: "مفسَّرة في",
    color: "#5FB3A1",
    hint: "مبدأ قضائي طبّق المادة أو فسّرها.",
  },
  SUPERSEDES_LAW: {
    label: "إحلال",
    out: "يحلّ محل",
    in: "حلّ محله",
    color: "#E06C6C",
    hint: "نظام جديد ألغى نظاماً سابقاً وحلّ محله.",
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
  CITES_ARTICLE: {
    label: "إحالة",
    out: "يُحيل إلى",
    in: "مُحال إليها من",
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
};

export function edgePhrase(type: ExplorerEdgeType, direction: "out" | "in"): string {
  return EDGE_TYPE_META[type][direction];
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

export interface ExplorerEdge {
  source: string;
  target: string;
  edge_type: ExplorerEdgeType | "MATCH";
  origin: string;
  weight: number;
  evidence: string | null;
  hop: number;
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
  | { action: "search"; q: string; types: ExplorerNodeType[]; limit: number }
  | { action: "neighborhood"; key: string; depth: 1 | 2; limit: number; edges: ExplorerEdgeType[] }
  | { action: "node"; key: string }
  | { action: "retrieve"; q: string; keywords: string[] };

export type ParseExplorerResult = { ok: true; value: ExplorerRequest } | { ok: false; error: string };

/** Node keys look like `article:labor-law__art-77`; never whitespace, quotes or `;`. */
const NODE_KEY_RE = /^[^\s;'"\\]{3,260}$/u;

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
    return { ok: true, value: { action: "retrieve", q, keywords } };
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
  law_slug?: string | null;
  status?: string | null;
  url?: string;
  text?: string;
}

/**
 * The lab's picture: the question in the middle, each direct hit linked to it,
 * each graph-hop hit linked to the hit that led to it (or to the question when
 * that seed is not among the results). `ranks` is the final 1-based order.
 */
export function buildLabGraph(question: string, hits: readonly LabHit[]): ExplorerGraph & { ranks: Map<string, number> } {
  const ordered = [...hits].sort((a, b) => b.score - a.score || a.node_key.localeCompare(b.node_key));
  const ranks = new Map<string, number>();
  ordered.forEach((h, i) => ranks.set(h.node_key, i + 1));

  const nodes: ExplorerNode[] = [
    { node_key: QUERY_NODE_KEY, node_type: "query", title: question.slice(0, 140), hop: 0, degree: ordered.length, has_vector: false },
  ];
  const keyByTitle = new Map<string, string>();
  for (const h of ordered) {
    if (!h.via_edge_type) keyByTitle.set(h.title, h.node_key);
    nodes.push({
      node_key: h.node_key,
      node_type: h.kind,
      title: h.title,
      hop: h.via_edge_type ? 2 : 1,
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
    if (seed && isExplorerEdgeType(h.via_edge_type)) {
      edges.push({ source: seed, target: h.node_key, edge_type: h.via_edge_type, origin: "lab", weight: 1, evidence: null, hop: 2 });
    } else {
      edges.push({ source: QUERY_NODE_KEY, target: h.node_key, edge_type: "MATCH", origin: "lab", weight: h.score, evidence: null, hop: 1 });
    }
  }
  return { nodes, edges, ranks };
}
