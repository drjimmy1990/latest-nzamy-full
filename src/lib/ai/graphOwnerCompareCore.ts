/**
 * graphOwnerCompareCore.ts — pure helpers of scripts/graph-owner-compare.mjs
 * (question ٣٩: compare our legal graph with the owner's
 * LEGAL_GRAPH_EDGES_CLEAN.json and annotate the differences).
 *
 * Nothing here touches a database or the network. The owner's JSON is read
 * only as data. Nothing here imports his edges anywhere: the output is files
 * for him to read.
 *
 *   1. The id bridge: his node ids (`LAW-…`, `FILE-…`, `idari-…`, `NCAR-…`)
 *      against our document identities (laws.slug / laws.instrument_id,
 *      decrees_circulars.id, principles / judicial_collections metadata ids).
 *   2. The type mapping: our five exportable edge types → his raw type names,
 *      his direction, document level (article and principle ends roll up).
 *   3. The key his compare_graphs.py builds, so the annotation can explain
 *      every row of only_ours.tsv / only_theirs.tsv.
 *
 * RUN the tests: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/graphOwnerCompareCore.test.ts
 */
import { createHash } from "node:crypto";
import { nameForId, slugifyArabic } from "../../../scripts/parsers/lib/slug.ts";

// ── Identities copied from the loader (no seeder module is imported) ────────

/**
 * Copy of `toUuid` in scripts/seed-library.ts (decrees_circulars.id is
 * `toUuid(<file name without .md>)`). The test pins this copy to the seeder's
 * own source, so a change there fails the test instead of silently breaking
 * the decree bridge.
 */
export function toUuid(key: string): string {
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(key)) {
    return key.toLowerCase();
  }
  const h = createHash("sha1").update(key).digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5
  h[8] = (h[8] & 0x3f) | 0x80; // RFC-4122 variant
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** File name of one of his `path`s without `.md`, composed (NFC) as our ids are. */
export function ownerFileId(ownerPath: string): string {
  const base = ownerPath.split(/[\\/]/).pop() ?? "";
  return nameForId(base.endsWith(".md") ? base.slice(0, -3) : base);
}

/**
 * The slug parse-laws.ts gives a file without its own `slug:` frontmatter:
 * the file name, through slugifyArabic only when it holds Arabic or a space.
 */
export function lawSlugFromOwnerPath(ownerPath: string): string {
  const id = ownerFileId(ownerPath);
  return /[\s؀-ۿ]/.test(id) ? slugifyArabic(id) : id;
}

/** decrees_circulars.id of the file at his `path` (parse-decrees.ts fileId → seed toUuid). */
export function decreeUuidFromOwnerPath(ownerPath: string): string {
  return toUuid(ownerFileId(ownerPath));
}

// ── His file ─────────────────────────────────────────────────────────────────

export type OwnerFamily = "laws" | "decrees" | "judicial" | "other";

export interface OwnerNode {
  id: string;
  path: string;
  title?: string;
  type?: string;
}

export interface OwnerEnd {
  doc?: unknown;
  id?: unknown;
  article?: unknown;
  regulation_ref?: unknown;
  [key: string]: unknown;
}

export interface OwnerEdge {
  type?: unknown;
  from?: unknown;
  to?: unknown;
  article?: unknown;
  edge_id?: unknown;
  article_check?: unknown;
  [key: string]: unknown;
}

/** His family from the first folder of his `path`. */
export function ownerFamily(ownerPath: string): OwnerFamily {
  const top = ownerPath.split(/[\\/]/)[0]?.normalize("NFC").trim() ?? "";
  if (top === "أنظمة ولوائح") return "laws";
  if (top === "أوامر وتعاميم") return "decrees";
  if (top === "مبادئ وسوابق قضائية") return "judicial";
  return "other";
}

/** Strip a UTF-8 BOM read as text (json.load of his script fails on one; JSON.parse too). */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ── compare_graphs.py, line for line ─────────────────────────────────────────

/** `doc()` of compare_graphs.py: a string, or an object's `doc` ‖ `id`, and its `article`. */
export function pyDoc(x: unknown): [string, string] {
  if (x && typeof x === "object" && !Array.isArray(x)) {
    const o = x as Record<string, unknown>;
    return [pyStr(pyOr(o.doc, o.id, "")), pyStr(pyOr(o.article, ""))];
  }
  return [pyStr(pyOr(x, "")), ""];
}

/** Python truthiness `a or b or …` for JSON values. */
function pyOr(...values: unknown[]): unknown {
  for (let i = 0; i < values.length - 1; i++) {
    if (pyTruthy(values[i])) return values[i];
  }
  return values[values.length - 1];
}

function pyTruthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** Python `str()` of a JSON value, for the values his file and ours carry (strings, integers). */
function pyStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "True" : "False";
  if (v === null || v === undefined) return "None";
  return JSON.stringify(v);
}

export type CompareKey = string; // type \t from \t to \t article — the TSV row

/** The comparison key of one edge, exactly as `norm()` in compare_graphs.py. */
export function compareKey(edge: OwnerEdge): CompareKey {
  const [f] = pyDoc(edge.from);
  const [t, ta0] = pyDoc(edge.to);
  const ta = ta0 || pyStr(pyOr(edge.article, ""));
  return [pyStr(pyOr(edge.type, "")), f, t, ta].join("\t");
}

export function keyParts(key: CompareKey): { type: string; from: string; to: string; article: string } {
  const [type = "", from = "", to = "", article = ""] = key.split("\t");
  return { type, from, to, article };
}

export function pairOf(key: CompareKey): string {
  const { from, to } = keyParts(key);
  return `${from}\t${to}`;
}

// ── Our export (the SQL file's JSON lines) ──────────────────────────────────

export interface DbEnd {
  node_type: string;
  law_slug?: string | null;
  article_number?: number | null;
  source_id: string;
  collection_id?: string | null;
  instrument_id?: string | null;
  principle_meta_id?: string | null;
  collection_meta_id?: string | null;
}

export interface DbEdgeLine {
  kind: "edge";
  edge_type: string;
  source_key: string;
  target_key: string;
  origin?: string | null;
  source_tag?: string | null;
  evidence?: string | null;
  from: DbEnd;
  to: DbEnd;
}

export interface DbDocLine {
  kind: "doc";
  family: "law" | "decree" | "principle" | "collection";
  slug?: string;
  instrument_id?: string | null;
  id?: string;
  collection_id?: string | null;
  meta_id?: string | null;
}

export interface DbSnapshotLine {
  kind: "snapshot";
  taken_at?: string;
  edge_counts?: Array<{ edge_type: string; origin: string; n: number }>;
  node_counts?: Array<{ node_type: string; n: number }>;
  sync_state?: Record<string, unknown> | null;
  library?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ParsedDbExport {
  snapshot: DbSnapshotLine | null;
  docs: DbDocLine[];
  edges: DbEdgeLine[];
  skippedLines: number;
}

/** Parse the `-At` output of graph_owner_compare_export.sql: one JSON object per line, each with a `kind`. */
export function parseDbExport(text: string): ParsedDbExport {
  const out: ParsedDbExport = { snapshot: null, docs: [], edges: [], skippedLines: 0 };
  for (const raw of stripBom(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.startsWith("{")) {
      out.skippedLines++;
      continue;
    }
    const row = JSON.parse(line) as { kind?: string };
    if (row.kind === "snapshot") {
      if (out.snapshot) throw new Error("two snapshot lines: is this two exports glued together?");
      out.snapshot = row as DbSnapshotLine;
    } else if (row.kind === "doc") out.docs.push(row as DbDocLine);
    else if (row.kind === "edge") out.edges.push(row as DbEdgeLine);
    else throw new Error(`unknown kind ${JSON.stringify(row.kind)} in the export`);
  }
  if (!out.snapshot) throw new Error("no snapshot line: run the whole SQL file, with -At");
  return out;
}

// ── The bridge ───────────────────────────────────────────────────────────────

export type BridgeVia =
  | "instrument_id"
  | "file_name_slug"
  | "file_name_uuid"
  | "principle_meta_id"
  | "collection_meta_id"
  | "collection_id"
  | "principle_id";

export interface Bridge {
  ownerIds: ReadonlySet<string>;
  ownerNodes: ReadonlyMap<string, OwnerNode>;
  /** his file-name slug → his id (laws + decrees folders; a slug two of his files share is left out). */
  slugToOwner: ReadonlyMap<string, string>;
  /** decree uuid of his file name → his id (laws + decrees folders; shared names left out). */
  uuidToOwner: ReadonlyMap<string, string>;
  /** slug / uuid that two or more of his files share → their ids. */
  ambiguousSlugs: ReadonlyMap<string, string[]>;
  ambiguousUuids: ReadonlyMap<string, string[]>;
}

export function buildBridge(ownerNodes: readonly OwnerNode[]): Bridge {
  const nodes = new Map<string, OwnerNode>();
  for (const n of ownerNodes) if (n && typeof n.id === "string" && n.id) nodes.set(n.id, n);
  const bySlug = new Map<string, string[]>();
  const byUuid = new Map<string, string[]>();
  for (const n of nodes.values()) {
    const fam = ownerFamily(String(n.path ?? ""));
    if (fam !== "laws" && fam !== "decrees") continue;
    const p = String(n.path ?? "");
    if (!p) continue;
    const slug = lawSlugFromOwnerPath(p);
    if (slug) bySlug.set(slug, [...(bySlug.get(slug) ?? []), n.id]);
    const uuid = decreeUuidFromOwnerPath(p);
    byUuid.set(uuid, [...(byUuid.get(uuid) ?? []), n.id]);
  }
  const unique = (m: Map<string, string[]>) => new Map([...m].filter(([, ids]) => ids.length === 1).map(([k, ids]) => [k, ids[0]]));
  const shared = (m: Map<string, string[]>) => new Map([...m].filter(([, ids]) => ids.length > 1));
  return {
    ownerIds: new Set(nodes.keys()),
    ownerNodes: nodes,
    slugToOwner: unique(bySlug),
    uuidToOwner: unique(byUuid),
    ambiguousSlugs: shared(bySlug),
    ambiguousUuids: shared(byUuid),
  };
}

export interface BridgeHit {
  owner: string;
  via: BridgeVia;
}

/** One of our laws → his id: `instrument_id` first, then the file-name slug. */
export function bridgeLaw(bridge: Bridge, slug: string, instrumentId?: string | null): BridgeHit | null {
  const iid = (instrumentId ?? "").trim();
  if (iid && bridge.ownerIds.has(iid)) return { owner: iid, via: "instrument_id" };
  const bySlug = bridge.slugToOwner.get(slug);
  if (bySlug) return { owner: bySlug, via: "file_name_slug" };
  return null;
}

/** One of our decrees (uuid) → his id, through the uuid of his file name. */
export function bridgeDecree(bridge: Bridge, uuid: string): BridgeHit | null {
  const hit = bridge.uuidToOwner.get(String(uuid).toLowerCase());
  return hit ? { owner: hit, via: "file_name_uuid" } : null;
}

/** A synthetic per-court collection of standalone rulings (seed-library.ts groupCollectionId). */
export function isStandaloneCollection(collectionId: string | null | undefined): boolean {
  return String(collectionId ?? "").startsWith("prec-");
}

/** One of our principles → his id: principle metadata id, collection metadata id, collection id, principle id. */
export function bridgePrinciple(
  bridge: Bridge,
  p: { id: string; collection_id?: string | null; principle_meta_id?: string | null; collection_meta_id?: string | null },
): BridgeHit | null {
  const tries: Array<[string | null | undefined, BridgeVia]> = [
    [p.principle_meta_id, "principle_meta_id"],
    [p.collection_meta_id, "collection_meta_id"],
    [p.collection_id, "collection_id"],
    [p.id, "principle_id"],
  ];
  for (const [value, via] of tries) {
    const v = (value ?? "").trim();
    if (v && bridge.ownerIds.has(v)) return { owner: v, via };
  }
  return null;
}

/** Doc id in his format for one end of our edge, or `OURS:<doc key>` when it does not map. Never dropped. */
export function endDoc(bridge: Bridge, end: DbEnd): { doc: string; via: BridgeVia | null } {
  if (end.node_type === "decree") {
    const hit = bridgeDecree(bridge, end.source_id);
    return hit ? { doc: hit.owner, via: hit.via } : { doc: `OURS:decree:${end.source_id}`, via: null };
  }
  if (end.node_type === "principle") {
    const hit = bridgePrinciple(bridge, {
      id: end.source_id,
      collection_id: end.collection_id,
      principle_meta_id: end.principle_meta_id,
      collection_meta_id: end.collection_meta_id,
    });
    if (hit) return { doc: hit.owner, via: hit.via };
    return isStandaloneCollection(end.collection_id) || !end.collection_id
      ? { doc: `OURS:principle:${end.source_id}`, via: null }
      : { doc: `OURS:collection:${end.collection_id}`, via: null };
  }
  if (end.law_slug) {
    const hit = bridgeLaw(bridge, end.law_slug, end.instrument_id);
    return hit ? { doc: hit.owner, via: hit.via } : { doc: `OURS:law:${end.law_slug}`, via: null };
  }
  return { doc: `OURS:${end.node_type}:${end.source_id}`, via: null };
}

// ── Coverage: his nodes against our library ─────────────────────────────────

export interface CoverageRow {
  family: OwnerFamily;
  mapped: number;
  unmapped: number;
}

export interface UnmappedOwnerNode {
  id: string;
  family: OwnerFamily;
  path: string;
  title: string;
  reason: string;
  tried_slug: string;
  tried_uuid: string;
}

export interface Coverage {
  byFamily: CoverageRow[];
  mappedVia: Record<string, number>;
  mappedIds: Set<string>;
  unmapped: UnmappedOwnerNode[];
  /** our laws whose instrument_id wins over a different file-name match. */
  slugShadowedByInstrumentId: number;
}

/** Which of his nodes have a document in our library, by the same bridge the edges use. */
export function computeCoverage(bridge: Bridge, docs: readonly DbDocLine[]): Coverage {
  const mappedVia = new Map<string, BridgeVia>();
  const mark = (hit: BridgeHit | null) => {
    if (hit && !mappedVia.has(hit.owner)) mappedVia.set(hit.owner, hit.via);
  };
  let slugShadowedByInstrumentId = 0;
  const principleById = new Map<string, DbDocLine>();
  const collectionMeta = new Map<string, string | null>();
  for (const d of docs) if (d.family === "collection" && d.id) collectionMeta.set(d.id, d.meta_id ?? null);
  for (const d of docs) {
    if (d.family === "law" && d.slug) {
      const hit = bridgeLaw(bridge, d.slug, d.instrument_id);
      const bySlug = bridge.slugToOwner.get(d.slug);
      if (hit?.via === "instrument_id" && bySlug && bySlug !== hit.owner) slugShadowedByInstrumentId++;
      mark(hit);
    } else if (d.family === "decree" && d.id) {
      mark(bridgeDecree(bridge, d.id));
    } else if (d.family === "principle" && d.id) {
      principleById.set(d.id, d);
      mark(bridgePrinciple(bridge, {
        id: d.id,
        collection_id: d.collection_id,
        principle_meta_id: d.meta_id,
        collection_meta_id: d.collection_id ? collectionMeta.get(d.collection_id) : null,
      }));
    } else if (d.family === "collection" && d.id) {
      mark(bridgePrinciple(bridge, { id: "", collection_id: d.id, collection_meta_id: d.meta_id }));
    }
  }

  const families: OwnerFamily[] = ["laws", "decrees", "judicial", "other"];
  const rows = new Map<OwnerFamily, CoverageRow>(families.map((f) => [f, { family: f, mapped: 0, unmapped: 0 }]));
  const unmapped: UnmappedOwnerNode[] = [];
  for (const n of bridge.ownerNodes.values()) {
    const p = String(n.path ?? "");
    const family = ownerFamily(p);
    const row = rows.get(family)!;
    if (mappedVia.has(n.id)) {
      row.mapped++;
      continue;
    }
    row.unmapped++;
    const slug = family === "laws" || family === "decrees" ? lawSlugFromOwnerPath(p) : "";
    const uuid = family === "laws" || family === "decrees" ? decreeUuidFromOwnerPath(p) : "";
    let reason: string;
    if (family === "other") reason = "outside_the_three_library_folders";
    else if (family === "judicial") reason = "no_principle_or_collection_carries_this_id";
    else if (bridge.ambiguousSlugs.has(slug) || bridge.ambiguousUuids.has(uuid)) reason = "file_name_shared_by_several_owner_files";
    else if (family === "laws") reason = "no_law_with_this_instrument_id_or_file_name_slug";
    else reason = "no_decree_with_this_file_name_uuid_and_no_law_with_this_id_or_slug";
    unmapped.push({ id: n.id, family, path: p, title: String(n.title ?? ""), reason, tried_slug: slug, tried_uuid: uuid });
  }
  const via: Record<string, number> = {};
  for (const v of mappedVia.values()) via[v] = (via[v] ?? 0) + 1;
  unmapped.sort((a, b) => a.family.localeCompare(b.family) || a.id.localeCompare(b.id));
  return {
    byFamily: families.map((f) => rows.get(f)!),
    mappedVia: via,
    mappedIds: new Set(mappedVia.keys()),
    unmapped,
    slugShadowedByInstrumentId,
  };
}

// ── Type mapping (gap report §3b) ────────────────────────────────────────────

export const EXPORTED_OUR_TYPES = [
  "INTERPRETS_ARTICLE",
  "CITES_ARTICLE",
  "AMENDS_ARTICLE",
  "SUPERSEDES_LAW",
  "PARENT_LAW",
  "IMPLEMENTED_BY",
] as const;

export interface ExportEnd {
  doc: string;
  article?: string;
}

export interface ExportEdge {
  type: string;
  from: ExportEnd;
  to: ExportEnd;
  our_type: string;
  our_from: string;
  our_to: string;
  origin: string;
  provenance: string;
  evidence: string;
  /** how many of our article/principle-level edges rolled up into this document-level edge. */
  our_edges: number;
}

/** Article number as his file writes it: Latin digits, never Arabic-Indic. */
export function articleString(n: number | null | undefined): string | undefined {
  return typeof n === "number" && Number.isFinite(n) ? String(Math.trunc(n)) : undefined;
}

export function provenanceOf(e: Pick<DbEdgeLine, "edge_type" | "source_tag">): string {
  if (e.source_tag === "owner_links") return "owner_links";
  switch (e.edge_type) {
    case "PARENT_LAW":
      return "parent_law_id";
    case "IMPLEMENTED_BY":
      return "article_regulations";
    case "SUPERSEDES_LAW":
      return "supersedes_law_slug_or_repeal_text";
    default:
      return "text";
  }
}

/**
 * One of our edges → zero, one or two edges in his format. Zero means the
 * type is not exported (counted in meta.excluded_counts). Never a top-level
 * `article`: his script would read it as the target article.
 */
export function mapOurEdge(bridge: Bridge, e: DbEdgeLine): ExportEdge[] {
  if (!(EXPORTED_OUR_TYPES as readonly string[]).includes(e.edge_type)) return [];
  const s = endDoc(bridge, e.from);
  const t = endDoc(bridge, e.to);
  const tArt = articleString(e.to.node_type === "article" ? e.to.article_number : null);
  const base = {
    our_type: e.edge_type,
    our_from: e.source_key,
    our_to: e.target_key,
    origin: String(e.origin ?? ""),
    provenance: provenanceOf(e),
    evidence: String(e.evidence ?? "").slice(0, 180),
    our_edges: 1,
  };
  const end = (doc: string, article?: string): ExportEnd => (article ? { doc, article } : { doc });
  switch (e.edge_type) {
    case "INTERPRETS_ARTICLE": // principle → article  ⇒  cites_article principle doc → law (+ to.article)
      return [{ type: "cites_article", from: end(s.doc), to: end(t.doc, tArt), ...base }];
    case "CITES_ARTICLE": // law article → article of ANOTHER law  ⇒  cites_article law → law (+ to.article).
      // His file never lists a law citing itself (0 of 12,296), so «المادة ٣ من هذا النظام» is not exported.
      if (s.doc === t.doc) return [];
      return [{ type: "cites_article", from: end(s.doc), to: end(t.doc, tArt), ...base }];
    case "AMENDS_ARTICLE": // amender → amended article  ⇒  amended_by amended law (+ from.article) → amender (reversed)
      return [{ type: "amended_by", from: end(t.doc, tArt), to: end(s.doc), ...base }];
    case "SUPERSEDES_LAW": // new → old  ⇒  superseded_by old → new (reversed)
      return [{ type: "superseded_by", from: end(t.doc), to: end(s.doc), ...base }];
    case "PARENT_LAW": // regulation → system  ⇒  regulation_of, and the mirror regulated_by (his 241/241 are mirrors)
      return [
        { type: "regulation_of", from: end(s.doc), to: end(t.doc), ...base },
        { type: "regulated_by", from: end(t.doc), to: end(s.doc), ...base },
      ];
    case "IMPLEMENTED_BY": // system article → regulation article; our own label kept
      return [{ type: "OURS:IMPLEMENTED_BY", from: end(s.doc), to: end(t.doc), ...base }];
    default:
      return [];
  }
}

/** Roll our edges up to document level: one export edge per (type, from, from.article, to, to.article). */
export function rollUpEdges(edges: readonly ExportEdge[]): ExportEdge[] {
  const out = new Map<string, ExportEdge>();
  for (const e of edges) {
    const k = [e.type, e.from.doc, e.from.article ?? "", e.to.doc, e.to.article ?? ""].join("\t");
    const prev = out.get(k);
    if (!prev) {
      out.set(k, { ...e });
      continue;
    }
    prev.our_edges += e.our_edges;
    if (!prev.provenance.split("|").includes(e.provenance)) prev.provenance = `${prev.provenance}|${e.provenance}`;
    if (!prev.our_type.split("|").includes(e.our_type)) prev.our_type = `${prev.our_type}|${e.our_type}`;
  }
  return [...out.values()].sort((a, b) =>
    (a.type + "\t" + a.from.doc + "\t" + a.to.doc + "\t" + (a.to.article ?? "") + "\t" + (a.from.article ?? "")).localeCompare(
      b.type + "\t" + b.from.doc + "\t" + b.to.doc + "\t" + (b.to.article ?? "") + "\t" + (b.from.article ?? ""),
    ),
  );
}

/**
 * The bridge gate: his regulation_of edges come from the same `parent_law_id`
 * our PARENT_LAW does, so a low match rate means the law-id bridge is broken,
 * not the graph.
 */
export function parentGate(ownerEdges: readonly OwnerEdge[], ours: readonly ExportEdge[]): {
  his: number;
  ours: number;
  common: number;
  rate: number | null;
} {
  const his = new Set(ownerEdges.filter((e) => e.type === "regulation_of").map(compareKey));
  const our = new Set(ours.filter((e) => e.type === "regulation_of").map((e) => compareKey(e as unknown as OwnerEdge)));
  let common = 0;
  for (const k of our) if (his.has(k)) common++;
  return { his: his.size, ours: our.size, common, rate: his.size ? common / his.size : null };
}

/** UTF-8 bytes with no BOM (his script's json.load(…, encoding='utf8') fails on a BOM). */
export function utf8NoBom(text: string): Buffer {
  return Buffer.from(stripBom(text), "utf8");
}

/** The whole our_graph.json text. */
export function serializeOurGraph(meta: Record<string, unknown>, edges: readonly ExportEdge[]): string {
  const lines = edges.map((e) => "  " + JSON.stringify(e));
  return `{"meta":${JSON.stringify(meta, null, 1)},\n"edges":[\n${lines.join(",\n")}\n]}\n`;
}

export function tsv(header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const cell = (v: unknown) => String(v ?? "").replace(/[\t\r\n]+/g, " ");
  return [header.join("\t"), ...rows.map((r) => r.map(cell).join("\t"))].join("\n") + "\n";
}

// ── Annotation of the two TSVs ───────────────────────────────────────────────

export type Side = "his_only" | "ours_only";

export const REASONS = [
  "kind_not_in_ours",
  "owner_node_unmapped",
  "ours_node_unmapped",
  "regulation_block",
  "article_flagged_308",
  "article_differs",
  "pair_matched_other_type",
  "inverse_of_matched_pair",
  "reversed",
  "kind_not_in_his",
  "true_miss",
] as const;
export type Reason = (typeof REASONS)[number];

/** Arabic gloss of each reason, for the owner. */
export const REASON_AR: Record<Reason, string> = {
  kind_not_in_ours: "نوع لا يقابله نوع في جرافنا (لائحة مدمجة، يحيل إلى، مبدأ يحيل لمبدأ)",
  owner_node_unmapped: "مستند في ملفه لم نجد له مقابلاً في مكتبتنا بالمعرّف أو اسم الملف",
  ours_node_unmapped: "مستند عندنا لم نجد له معرّفاً في قائمة عُقده",
  regulation_block: "رقم مادة من لائحة مدمجة داخل ملف النظام (regulation_ref)",
  article_flagged_308: "رابط عليه علامة فحص المادة في ملفه (ضمن الـ308)",
  article_differs: "الرابط نفسه بين المستندين برقم مادة مختلف",
  pair_matched_other_type: "المستندان مرتبطان عندنا بنوع آخر",
  inverse_of_matched_pair: "عكس رابط في ملفه نفسه طابقناه (الحقيقة نفسها بالاتجاه الآخر)",
  reversed: "الرابط موجود عندنا بالاتجاه المعاكس",
  kind_not_in_his: "نوع من جرافنا لا يقابله نوع في ملفه",
  true_miss: "المستندان معروفان للطرفين ولا رابط بينهما عند الطرف الآخر",
};

/** His new→old kinds: the inverse of his own old→new kinds. */
export const OWNER_NEW_TO_OLD = new Set(["supersedes", "repeals", "replaces", "amends"]);
export const OWNER_KINDS_NOT_IN_OURS = new Set(["contains_merged_regulation", "related_to", "cites_precedent"]);

export interface AnnotateInput {
  ownerEdges: readonly OwnerEdge[];
  ourEdges: readonly ExportEdge[];
  /** his node ids with no document of ours (meta.coverage.unmapped_ids of our_graph.json). */
  ownerUnmapped: ReadonlySet<string>;
  ownerIds: ReadonlySet<string>;
}

export interface AnnotatedRow {
  type: string;
  from: string;
  to: string;
  article: string;
  side: Side;
  reason: Reason;
  his_edge_ids: string;
  our_types: string;
}

interface Index {
  hisByKey: Map<CompareKey, OwnerEdge[]>;
  hisByTriple: Map<string, OwnerEdge[]>;
  hisKeys: Set<CompareKey>;
  hisPairs: Set<string>;
  hisTypesByPair: Map<string, Set<string>>;
  ourByKey: Map<CompareKey, ExportEdge[]>;
  ourKeys: Set<CompareKey>;
  ourTriples: Map<string, Set<string>>; // type\tfrom\tto → articles
  ourTypesByPair: Map<string, Set<string>>;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}
function add<K>(m: Map<K, Set<string>>, k: K, v: string) {
  const s = m.get(k);
  if (s) s.add(v);
  else m.set(k, new Set([v]));
}

export function buildIndex(ownerEdges: readonly OwnerEdge[], ourEdges: readonly ExportEdge[]): Index {
  const idx: Index = {
    hisByKey: new Map(),
    hisByTriple: new Map(),
    hisKeys: new Set(),
    hisPairs: new Set(),
    hisTypesByPair: new Map(),
    ourByKey: new Map(),
    ourKeys: new Set(),
    ourTriples: new Map(),
    ourTypesByPair: new Map(),
  };
  for (const e of ownerEdges) {
    const k = compareKey(e);
    const p = keyParts(k);
    push(idx.hisByKey, k, e);
    push(idx.hisByTriple, `${p.type}\t${p.from}\t${p.to}`, e);
    idx.hisKeys.add(k);
    idx.hisPairs.add(`${p.from}\t${p.to}`);
    add(idx.hisTypesByPair, `${p.from}\t${p.to}`, p.type);
  }
  for (const e of ourEdges) {
    const k = compareKey(e as unknown as OwnerEdge);
    const p = keyParts(k);
    push(idx.ourByKey, k, e);
    idx.ourKeys.add(k);
    add(idx.ourTriples, `${p.type}\t${p.from}\t${p.to}`, p.article);
    add(idx.ourTypesByPair, `${p.from}\t${p.to}`, p.type);
  }
  return idx;
}

/** The two sets his script writes: only_ours.tsv (= his file only) and only_theirs.tsv (= ours only). */
export function expectedDiff(idx: Index): { hisOnly: Set<CompareKey>; oursOnly: Set<CompareKey> } {
  const hisOnly = new Set([...idx.hisKeys].filter((k) => !idx.ourKeys.has(k)));
  const oursOnly = new Set([...idx.ourKeys].filter((k) => !idx.hisKeys.has(k)));
  return { hisOnly, oursOnly };
}

const ownerFlag = (e: OwnerEdge, field: string): boolean => {
  const to = e.to && typeof e.to === "object" ? (e.to as Record<string, unknown>) : {};
  return field === "regulation_ref" ? pyTruthy(to.regulation_ref) : pyTruthy(e[field]);
};

function idsOf(edges: readonly OwnerEdge[] | undefined, cap = 20): string {
  const ids = [...new Set((edges ?? []).map((e) => String(e.edge_id ?? "")).filter(Boolean))].sort();
  return ids.length > cap ? `${ids.slice(0, cap).join(",")},+${ids.length - cap}` : ids.join(",");
}

function sortedJoin(s: Set<string> | undefined): string {
  return s ? [...s].sort().join(",") : "";
}

export function annotateRow(idx: Index, input: AnnotateInput, side: Side, key: CompareKey): AnnotatedRow {
  const p = keyParts(key);
  const pair = `${p.from}\t${p.to}`;
  const rev = `${p.to}\t${p.from}`;
  const triple = `${p.type}\t${p.from}\t${p.to}`;
  const unmappedOwner = (doc: string) => !input.ownerIds.has(doc) || input.ownerUnmapped.has(doc);
  let reason: Reason;
  let hisIds: string;
  let ourTypes: string;

  if (side === "his_only") {
    const his = idx.hisByKey.get(key) ?? [];
    hisIds = idsOf(his);
    const our = new Set([...(idx.ourTypesByPair.get(pair) ?? []), ...[...(idx.ourTypesByPair.get(rev) ?? [])].map((t) => `${t}(reversed)`)]);
    ourTypes = sortedJoin(our);
    if (OWNER_KINDS_NOT_IN_OURS.has(p.type)) reason = "kind_not_in_ours";
    else if (unmappedOwner(p.from) || unmappedOwner(p.to)) reason = "owner_node_unmapped";
    else if (his.some((e) => ownerFlag(e, "regulation_ref"))) reason = "regulation_block";
    else if (his.some((e) => ownerFlag(e, "article_check"))) reason = "article_flagged_308";
    else if (idx.ourTriples.has(triple)) reason = "article_differs";
    else if (idx.ourTypesByPair.has(pair)) reason = "pair_matched_other_type";
    else if (OWNER_NEW_TO_OLD.has(p.type) && idx.hisPairs.has(rev) && idx.ourTypesByPair.has(rev)) reason = "inverse_of_matched_pair";
    else if (idx.ourTypesByPair.has(rev)) reason = "reversed";
    else reason = "true_miss";
  } else {
    const ours = idx.ourByKey.get(key) ?? [];
    ourTypes = [...new Set(ours.flatMap((e) => e.our_type.split("|")))].sort().join(",");
    const hisSame = idx.hisByTriple.get(triple);
    hisIds = idsOf(hisSame ?? [...(idx.hisByKey.get(key) ?? [])]);
    if (p.from.startsWith("OURS:") || p.to.startsWith("OURS:")) reason = "ours_node_unmapped";
    else if (hisSame && hisSame.some((e) => ownerFlag(e, "regulation_ref"))) reason = "regulation_block";
    else if (hisSame) reason = "article_differs";
    else if (idx.hisTypesByPair.has(pair)) {
      reason = "pair_matched_other_type";
      hisIds = idsOf([...idx.hisByKey.entries()].filter(([k]) => pairOf(k) === pair).flatMap(([, v]) => v));
    } else if (idx.hisTypesByPair.has(rev)) reason = "reversed";
    else if (p.type.startsWith("OURS:")) reason = "kind_not_in_his";
    else reason = "true_miss";
  }
  return { type: p.type, from: p.from, to: p.to, article: p.article, side, reason, his_edge_ids: hisIds, our_types: ourTypes };
}

/** Parse one TSV his script wrote (header `type from to article`, CRLF on Windows). */
export function parseCompareTsv(text: string): CompareKey[] {
  const lines = stripBom(text).split(/\r?\n/).filter((l) => l.length > 0);
  if (lines[0] !== "type\tfrom\tto\tarticle") throw new Error("not a compare_graphs.py TSV (header differs)");
  return lines.slice(1).map((l) => {
    const parts = l.split("\t");
    while (parts.length < 4) parts.push("");
    return parts.slice(0, 4).join("\t");
  });
}

export function reasonTable(rows: readonly AnnotatedRow[], side: Side): { types: string[]; counts: Map<string, Map<Reason, number>> } {
  const counts = new Map<string, Map<Reason, number>>();
  for (const r of rows) {
    if (r.side !== side) continue;
    const m = counts.get(r.type) ?? new Map<Reason, number>();
    m.set(r.reason, (m.get(r.reason) ?? 0) + 1);
    counts.set(r.type, m);
  }
  return { types: [...counts.keys()].sort(), counts };
}

// ── H4: before / after snapshots ─────────────────────────────────────────────

export function compareSnapshots(before: DbSnapshotLine, after: DbSnapshotLine): {
  rows: Array<{ edge_type: string; origin: string; before: number; after: number; delta: number }>;
  lastSyncedBefore: unknown;
  lastSyncedAfter: unknown;
  watchdogRanBetween: boolean;
} {
  const m = new Map<string, { edge_type: string; origin: string; before: number; after: number; delta: number }>();
  for (const [side, snap] of [["before", before], ["after", after]] as const) {
    for (const c of snap.edge_counts ?? []) {
      const k = `${c.edge_type}\t${c.origin}`;
      const row = m.get(k) ?? { edge_type: c.edge_type, origin: c.origin, before: 0, after: 0, delta: 0 };
      row[side] = Number(c.n) || 0;
      m.set(k, row);
    }
  }
  const rows = [...m.values()].map((r) => ({ ...r, delta: r.after - r.before })).sort((a, b) => a.edge_type.localeCompare(b.edge_type) || a.origin.localeCompare(b.origin));
  const lastSyncedBefore = before.sync_state?.last_synced_at ?? null;
  const lastSyncedAfter = after.sync_state?.last_synced_at ?? null;
  return { rows, lastSyncedBefore, lastSyncedAfter, watchdogRanBetween: String(lastSyncedBefore) !== String(lastSyncedAfter) };
}
