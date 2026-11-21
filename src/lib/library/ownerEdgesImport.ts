/**
 * ownerEdgesImport.ts — the pure half of scripts/library-owner-edges.mjs
 * (owner file 19 Nov 2026 §2/§3: merge his principle → article links, keyed by
 * his edge_id, after his four fixes).
 *
 * Reads his graph export (LEGAL_GRAPH_EDGES_CLEAN.json shape: {meta, nodes,
 * edges}; a bare edge array; or JSONL, one edge per line), checks the four
 * fixes he promised, refuses unknown types, and turns every principle →
 * article link (`cites_article`) into one library_graph.owner_edges row.
 *
 *   fix 1  from.principle — the PRINCIPLE_START number of the ruling;
 *   fix 2  to.doc = the law file's frontmatter id, verbatim (checked against
 *          his inventory الجرد.tsv when given: path → id);
 *   fix 3  to.regulation_ref for an article of a merged regulation;
 *   fix 4  a fractional article number («2/59») marked quality: flagged.
 *
 * Merged types (batch l12, owner file 02 #43 «والتعديل (236) والإلغاء (152)
 * والإحلال (59) معها»): `cites_article`, plus his amendment links (amended_by,
 * amends) and his repeal / replacement links (repealed_by, superseded_by,
 * repeals, supersedes, replaces); the resolver (20261202_30) turns them into
 * AMENDS_ARTICLE / SUPERSEDES_LAW in the graph's own direction. The other known
 * types are counted and skipped. Q132: a link whose article is not given (or
 * cannot be pinned later) is kept — it links to the target document. Nothing
 * here touches a database or the network: `node --test` loads it directly.
 */
import { createHash } from "node:crypto";
import { OWNER_GRAPH_TYPES } from "./graphLinkTypes.ts";

/** His type → our edge type, for the types we merge. */
export const MERGED_OWNER_TYPES: Readonly<Record<string, string>> = {
  cites_article: "INTERPRETS_ARTICLE",
  amended_by: "AMENDS_ARTICLE",
  amends: "AMENDS_ARTICLE",
  repealed_by: "SUPERSEDES_LAW",
  superseded_by: "SUPERSEDES_LAW",
  repeals: "SUPERSEDES_LAW",
  supersedes: "SUPERSEDES_LAW",
  replaces: "SUPERSEDES_LAW",
};

/** The article end of a merged type: the target's (to.article) or, for amended_by, the source's (from.article). */
const ARTICLE_ON_FROM: ReadonlySet<string> = new Set(["amended_by"]);
/** Law-level types: no article at either end. */
const LAW_LEVEL_TYPES: ReadonlySet<string> = new Set(["repealed_by", "superseded_by", "repeals", "supersedes", "replaces"]);

/** Every type his export may carry (his 14, plus refers_to_article from the 19 Nov decision). */
export const KNOWN_OWNER_TYPES: ReadonlySet<string> = new Set(Object.keys(OWNER_GRAPH_TYPES));

export const EVIDENCE_MAX = 300;

export interface OwnerGraphFile {
  format: "json" | "json-array" | "jsonl";
  nodes: Array<{ id?: unknown; path?: unknown; title?: unknown; type?: unknown }>;
  edges: Array<Record<string, unknown>>;
  meta: Record<string, unknown>;
  badLines: number;
}

/** Parse his export. Throws on OUR compare export (graph-owner-export*.jsonl) — never his. */
export function readOwnerGraph(text: string): OwnerGraphFile {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const trimmed = t.trimStart();
  const ours = () => {
    throw new Error("this is OUR graph export (schema nzamy_graph_owner_compare_export), not the owner's file");
  };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(t);
      if (Array.isArray(json)) return { format: "json-array", nodes: [], edges: json, meta: {}, badLines: 0 };
      if (json && typeof json === "object") {
        if (String((json as Record<string, unknown>).schema ?? "").startsWith("nzamy_graph_owner_compare_export")) ours();
        const edges = (json as Record<string, unknown>).edges;
        if (Array.isArray(edges)) {
          const nodes = (json as Record<string, unknown>).nodes;
          const meta = (json as Record<string, unknown>).meta;
          return {
            format: "json",
            nodes: Array.isArray(nodes) ? nodes : [],
            edges: edges as Array<Record<string, unknown>>,
            meta: meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {},
            badLines: 0,
          };
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("this is OUR")) throw e;
      // not one JSON document: try JSONL below
    }
  }
  const nodes: OwnerGraphFile["nodes"] = [];
  const edges: OwnerGraphFile["edges"] = [];
  let meta: Record<string, unknown> = {};
  let badLines = 0;
  for (const line of t.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o: unknown;
    try {
      o = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }
    if (!o || typeof o !== "object" || Array.isArray(o)) {
      badLines++;
      continue;
    }
    const r = o as Record<string, unknown>;
    if (String(r.schema ?? "").startsWith("nzamy_graph_owner_compare_export")) ours();
    if (r.kind === "meta") meta = r;
    else if (r.kind === "node") nodes.push(r);
    else if ("type" in r && ("from" in r || "to" in r)) edges.push(r);
    else badLines++;
  }
  if (edges.length === 0) throw new Error("no edges found (expected his {meta, nodes, edges} JSON, an edge array, or JSONL)");
  return { format: "jsonl", nodes, edges, meta, badLines };
}

function latinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
}
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const clean = (v: unknown): string => str(v).replace(/\s+/g, " ").trim();

export interface ArticleNumber {
  /** As library.articles.number stores it: «5», «23 مكرر», «9 مكرر 2»; a fraction kept as «2/59». */
  text: string | null;
  kind: "none" | "number" | "mukarrar" | "fraction" | "other";
}

/** His article number → our printed form (seed-library.ts articleNumberText / mukarrarIdPart). */
export function normalizeArticleNumber(raw: unknown): ArticleNumber {
  const s = latinDigits(clean(raw));
  if (!s) return { text: null, kind: "none" };
  if (/^\d+$/.test(s)) return { text: String(Number(s)), kind: "number" };
  const m = s.match(/^(\d+)\s*مكرر(?:\s*\(?\s*(\d+)\s*\)?)?$/u);
  if (m) return { text: m[2] ? `${Number(m[1])} مكرر ${Number(m[2])}` : `${Number(m[1])} مكرر`, kind: "mukarrar" };
  const f = s.match(/^(\d+)\s*([/.])\s*(\d+)$/);
  if (f) return { text: `${Number(f[1])}${f[2]}${f[3]}`, kind: "fraction" };
  return { text: s.slice(0, 50), kind: "other" };
}

/** A fraction written in the evidence next to «المادة» («المادة ( 2/59 )») — the number he cut. */
export function evidenceHasFraction(evidenceText: string): boolean {
  return /الماد(?:ة|تين|تان)\s*\(?\s*[0-9٠-٩]+\s*\/\s*[0-9٠-٩]+/u.test(evidenceText);
}

export function ownerEdgeId(e: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify([e.type ?? null, e.from ?? null, e.to ?? null])).digest("hex").slice(0, 16);
}

export interface OwnerEdgeRow {
  edge_id: string;
  type: string;
  from_doc: string;
  from_principle: string | null;
  from_article: string | null;
  from_regulation_ref: string | null;
  to_doc: string;
  to_article: string | null;
  to_regulation_ref: string | null;
  to_principle: string | null;
  quality: "ok" | "flagged";
  article_check: string | null;
  evidence: string | null;
}

export type RejectReason =
  | "unknown_type"
  | "missing_from_doc"
  | "missing_to_doc"
  | "missing_to_article"
  | "regulation_ref_missing"
  | "to_doc_not_file_id"
  | "duplicate_edge_id"
  | "value_too_long";

export interface ImportReport {
  edges: number;
  byType: Record<string, { total: number; merged: number }>;
  skippedTypes: Record<string, number>;
  unknownTypes: Record<string, number>;
  rejects: Record<string, number>;
  quality: { ok: number; flagged: number };
  flaggedBy: Record<string, number>;
  edgeIdsComputed: number;
  evidenceCut: number;
  /** Q132: rows with no article to pin (an article-level type): they link to the target document. */
  documentLevel: number;
  fixes: {
    fix1_from_principle: { present: number; missing: number };
    fix2_to_doc_file_id: { checked: boolean; match: number; mismatch: number; not_in_nodes: number };
    fix3_regulation_ref: { present: number; missing_where_needed: number };
    fix4_fraction_flagged: { fractions: number; flagged_by_owner: number; not_flagged: number; cut_in_evidence: number };
  };
  /** Why --apply refuses this file (empty: it may be applied). */
  refusals: string[];
}

export interface ImportResult {
  rows: OwnerEdgeRow[];
  rejected: Array<{ edge_id: string; type: string; reason: RejectReason; detail: string }>;
  report: ImportReport;
}

/** His inventory الجرد.tsv (header with `path` and `id`) → path (NFC, forward slashes) → id. */
export function parseInventory(text: string): Map<string, string> {
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/).filter((l) => l.length > 0);
  const head = (lines[0] ?? "").split("\t");
  const pi = head.indexOf("path");
  const ii = head.indexOf("id");
  if (pi < 0 || ii < 0) throw new Error("inventory: header must name `path` and `id` columns");
  const map = new Map<string, string>();
  for (const l of lines.slice(1)) {
    const c = l.split("\t");
    const p = normPath(c[pi] ?? "");
    if (p) map.set(p, (c[ii] ?? "").trim());
  }
  return map;
}
const normPath = (p: string) => p.normalize("NFC").replace(/\\/g, "/").trim();

const REGULATION_HINT = (e: Record<string, unknown>): boolean =>
  e.quality === "ok_regulation_block" ||
  /regulation/.test(str(e.resolved_by)) ||
  e.regulation_check !== undefined;

/** Turn his export into owner_edges rows + a report. `inventory` enables the fix-2 check. */
export function buildOwnerEdgeRows(file: OwnerGraphFile, inventory?: Map<string, string> | null): ImportResult {
  const nodeById = new Map<string, { path: string; type: string }>();
  for (const n of file.nodes) {
    const id = clean(n.id);
    if (id) nodeById.set(id, { path: normPath(str(n.path)), type: clean(n.type) });
  }
  const report: ImportReport = {
    edges: file.edges.length,
    byType: {},
    skippedTypes: {},
    unknownTypes: {},
    rejects: {},
    quality: { ok: 0, flagged: 0 },
    flaggedBy: {},
    edgeIdsComputed: 0,
    evidenceCut: 0,
    documentLevel: 0,
    fixes: {
      fix1_from_principle: { present: 0, missing: 0 },
      fix2_to_doc_file_id: { checked: Boolean(inventory), match: 0, mismatch: 0, not_in_nodes: 0 },
      fix3_regulation_ref: { present: 0, missing_where_needed: 0 },
      fix4_fraction_flagged: { fractions: 0, flagged_by_owner: 0, not_flagged: 0, cut_in_evidence: 0 },
    },
    refusals: [],
  };
  const rows: OwnerEdgeRow[] = [];
  const rejected: ImportResult["rejected"] = [];
  const seen = new Map<string, string>();
  const bump = (o: Record<string, number>, k: string) => (o[k] = (o[k] ?? 0) + 1);

  for (const e of file.edges) {
    const type = clean(e.type);
    const bt = (report.byType[type || "(none)"] ??= { total: 0, merged: 0 });
    bt.total++;
    let edgeId = clean(e.edge_id).toLowerCase();
    if (!/^[0-9a-f]{16}$/.test(edgeId)) {
      edgeId = ownerEdgeId(e);
      report.edgeIdsComputed++;
    }
    const reject = (reason: RejectReason, detail = "") => {
      bump(report.rejects, reason);
      rejected.push({ edge_id: edgeId, type, reason, detail });
    };
    if (!KNOWN_OWNER_TYPES.has(type)) {
      bump(report.unknownTypes, type || "(none)");
      reject("unknown_type", type);
      continue;
    }
    if (!MERGED_OWNER_TYPES[type]) {
      bump(report.skippedTypes, type);
      continue;
    }
    const from = (e.from && typeof e.from === "object" ? e.from : {}) as Record<string, unknown>;
    const to = (e.to && typeof e.to === "object" ? e.to : {}) as Record<string, unknown>;
    const fromDoc = clean(from.doc ?? from.id ?? (typeof e.from === "string" ? e.from : ""));
    const toDoc = clean(to.doc ?? to.id ?? (typeof e.to === "string" ? e.to : ""));
    const isCite = type === "cites_article";
    const principle = normalizeArticleNumber(from.principle);
    const fromPrinciple = isCite ? principle.text : null;
    if (isCite) {
      if (fromPrinciple) report.fixes.fix1_from_principle.present++;
      else report.fixes.fix1_from_principle.missing++;
    }
    if (!fromDoc) {
      reject("missing_from_doc");
      continue;
    }
    if (!toDoc) {
      reject("missing_to_doc");
      continue;
    }

    // fix 2: to.doc is the file's own id (his inventory: the node's path → id)
    const node = nodeById.get(toDoc);
    if (!node && file.nodes.length) report.fixes.fix2_to_doc_file_id.not_in_nodes++;
    if (inventory && node) {
      const fileId = inventory.get(node.path);
      if (fileId !== undefined && fileId !== toDoc) {
        report.fixes.fix2_to_doc_file_id.mismatch++;
        reject("to_doc_not_file_id", `${toDoc} → file id ${fileId}`);
        continue;
      }
      if (fileId !== undefined) report.fixes.fix2_to_doc_file_id.match++;
    }

    // The article end: to.article, or from.article for amended_by; none for a law-level type.
    const articleSide = ARTICLE_ON_FROM.has(type) ? from : to;
    const art = LAW_LEVEL_TYPES.has(type)
      ? normalizeArticleNumber(null)
      : normalizeArticleNumber(articleSide.article ?? (ARTICLE_ON_FROM.has(type) ? undefined : e.article));
    // Q132 (batch l12): no article → the link is kept and points at the document.
    if (!art.text && !LAW_LEVEL_TYPES.has(type)) report.documentLevel++;

    // fix 3: a regulation article names its regulation
    const regRef = clean(to.regulation_ref) || null;
    if (regRef) report.fixes.fix3_regulation_ref.present++;
    else if (isCite && REGULATION_HINT(e)) {
      report.fixes.fix3_regulation_ref.missing_where_needed++;
      reject("regulation_ref_missing", clean(e.resolved_by) || clean(e.quality));
      continue;
    }

    // quality: his word, then everything that makes the article number doubtful
    const evidenceObj = (e.evidence && typeof e.evidence === "object" ? e.evidence : {}) as Record<string, unknown>;
    // His amendment / repeal links carry {decree, date} or {field, value}, not text.
    const evidenceText = clean(
      typeof e.evidence === "string"
        ? e.evidence
        : evidenceObj.text ?? ([clean(evidenceObj.decree), clean(evidenceObj.date)].filter(Boolean).join(" ") || evidenceObj.value),
    );
    const flags: string[] = [];
    const hisQuality = clean(e.quality);
    const ownerFlagged = hisQuality === "flagged";
    if (hisQuality && hisQuality !== "ok" && hisQuality !== "ok_regulation_block") flags.push(ownerFlagged ? "owner_flagged" : `quality_${hisQuality}`.slice(0, 60));
    const articleCheck = clean(e.article_check);
    if (articleCheck) flags.push(articleCheck);
    if (art.kind === "fraction") {
      report.fixes.fix4_fraction_flagged.fractions++;
      if (ownerFlagged) report.fixes.fix4_fraction_flagged.flagged_by_owner++;
      else report.fixes.fix4_fraction_flagged.not_flagged++;
      flags.push("fractional_article_number");
    } else if (art.kind === "other") {
      flags.push("article_not_a_number");
    } else if (evidenceHasFraction(evidenceText) && !ownerFlagged) {
      report.fixes.fix4_fraction_flagged.cut_in_evidence++;
      flags.push("fraction_cut_in_evidence");
    }
    const suspect = e.article_parse_suspect;
    if (suspect && typeof suspect === "object") {
      const corrected = (suspect as Record<string, unknown>).corrected_parse;
      const ok = Array.isArray(corrected) && corrected.map((c) => normalizeArticleNumber(c).text).includes(art.text);
      if (!ok) flags.push("article_parse_suspect");
    }
    const quality: "ok" | "flagged" = flags.length ? "flagged" : "ok";
    report.quality[quality]++;
    for (const f of new Set(flags)) bump(report.flaggedBy, f);

    let evidence = evidenceText || null;
    if (evidence && evidence.length > EVIDENCE_MAX) {
      evidence = evidence.slice(0, EVIDENCE_MAX);
      report.evidenceCut++;
    }
    const row: OwnerEdgeRow = {
      edge_id: edgeId,
      type,
      from_doc: fromDoc,
      from_principle: fromPrinciple,
      from_article: ARTICLE_ON_FROM.has(type) ? art.text : normalizeArticleNumber(from.article).text,
      from_regulation_ref: clean(from.regulation_ref) || null,
      to_doc: toDoc,
      to_article: ARTICLE_ON_FROM.has(type) ? null : art.text,
      to_regulation_ref: regRef,
      to_principle: normalizeArticleNumber(to.principle).text,
      quality,
      article_check: articleCheck || (flags.length ? flags.join(",") : null),
      evidence,
    };
    if (
      row.from_doc.length > 200 || row.to_doc.length > 200 ||
      (row.to_regulation_ref?.length ?? 0) > 500 || (row.article_check?.length ?? 0) > 200
    ) {
      reject("value_too_long");
      continue;
    }
    const key = JSON.stringify(row);
    const prior = seen.get(edgeId);
    if (prior !== undefined) {
      if (prior !== key) reject("duplicate_edge_id", "same edge_id, different link");
      continue; // an exact repeat is the same link: kept once
    }
    seen.set(edgeId, key);
    bt.merged++;
    rows.push(row);
  }

  // Fix 1 concerns the principle → article links only.
  const merged = report.byType.cites_article?.total ?? 0;
  if (Object.keys(report.unknownTypes).length) {
    report.refusals.push(`unknown type(s): ${Object.keys(report.unknownTypes).join(", ")} — the owner must name only his known types`);
  }
  if (merged > 0 && report.fixes.fix1_from_principle.present === 0) {
    report.refusals.push("fix 1 missing: no cites_article carries from.principle — this is an export from before his four fixes");
  }
  if (report.rejects.duplicate_edge_id) {
    report.refusals.push(`${report.rejects.duplicate_edge_id} edge_id(s) name two different links — edge ids must be unique`);
  }
  if (rows.length === 0) report.refusals.push("no link to load");
  return { rows, rejected, report };
}

/** One-line-per-figure text for the dry run. */
export function formatReport(r: ImportReport, sha256: string, rowsToLoad: number): string {
  const out: string[] = [];
  out.push(`edges in the file: ${r.edges} (sha256 ${sha256})`);
  out.push("", "type\ttotal\tto load");
  for (const [t, v] of Object.entries(r.byType).sort()) out.push(`${t}\t${v.total}\t${v.merged}`);
  if (Object.keys(r.skippedTypes).length) {
    out.push("", `skipped — known types not merged (merged: ${Object.keys(MERGED_OWNER_TYPES).join(", ")}): ${JSON.stringify(r.skippedTypes)}`);
  }
  out.push("", `rows to load into library_graph.owner_edges: ${rowsToLoad}`);
  out.push(`quality: ok ${r.quality.ok}, flagged ${r.quality.flagged} (flagged rows are ordinary links since 20261202_30 — Q132; the quality stays for staff)`);
  out.push(`document-level (no article to pin; the link opens the target document): ${r.documentLevel}`);
  out.push(`flagged because: ${JSON.stringify(r.flaggedBy)}`);
  out.push(`rejected (not loaded): ${JSON.stringify(r.rejects)}`);
  out.push(`edge ids computed (his missing or malformed): ${r.edgeIdsComputed}; evidence cut to ${EVIDENCE_MAX} chars: ${r.evidenceCut}`);
  const f = r.fixes;
  out.push("", "his four fixes:");
  out.push(`  1 from.principle: present ${f.fix1_from_principle.present}, missing ${f.fix1_from_principle.missing}`);
  out.push(
    f.fix2_to_doc_file_id.checked
      ? `  2 to.doc = file id: match ${f.fix2_to_doc_file_id.match}, mismatch ${f.fix2_to_doc_file_id.mismatch}, to.doc not in his node list ${f.fix2_to_doc_file_id.not_in_nodes}`
      : `  2 to.doc = file id: not checked (pass --inventory <الجرد.tsv>); to.doc not in his node list ${f.fix2_to_doc_file_id.not_in_nodes}`,
  );
  out.push(`  3 regulation_ref: present ${f.fix3_regulation_ref.present}, missing where the link names a regulation ${f.fix3_regulation_ref.missing_where_needed}`);
  out.push(
    `  4 fractions: ${f.fix4_fraction_flagged.fractions} fractional numbers (flagged by him ${f.fix4_fraction_flagged.flagged_by_owner}, not ${f.fix4_fraction_flagged.not_flagged}); ` +
      `a fraction in the evidence cut to a whole number ${f.fix4_fraction_flagged.cut_in_evidence} (flagged here)`,
  );
  out.push("", r.refusals.length ? `--apply would REFUSE this file:\n  - ${r.refusals.join("\n  - ")}` : "--apply would load this file.");
  return out.join("\n");
}
