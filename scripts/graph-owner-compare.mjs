#!/usr/bin/env node
/**
 * scripts/graph-owner-compare.mjs — compare our legal graph with the owner's
 * LEGAL_GRAPH_EDGES_CLEAN.json (question ٣٩). OFFLINE: reads files, writes
 * files. No database, no network, nothing imported into the graph.
 *
 * Runbook: docs/graph-rag/OWNER_GRAPH_COMPARE.md. Pure helpers + tests:
 * src/lib/ai/graphOwnerCompareCore.ts.
 *
 *   node --import tsx scripts/graph-owner-compare.mjs export \
 *     --db <graph-owner-export.jsonl> --owner <LEGAL_GRAPH_EDGES_CLEAN.json> --out <dir> [--min-parent-match=0.5]
 *       → <dir>/our_graph.json (his format, UTF-8, no BOM), <dir>/coverage.tsv,
 *         <dir>/unmapped_owner_nodes.tsv. Prints the id coverage table and the
 *         PARENT_LAW bridge check; when fewer than --min-parent-match of his
 *         regulation_of edges match ours the law-id bridge is broken, so it
 *         stops (exit 3) WITHOUT writing our_graph.json.
 *
 *   node --import tsx scripts/graph-owner-compare.mjs annotate \
 *     --tsv-dir <dir with only_ours.tsv + only_theirs.tsv> --owner <his json> --ours <our_graph.json> \
 *     --out <dir> [--summary <summary.txt his script printed>]
 *       → <dir>/diff_annotated.tsv, <dir>/diff_summary.md
 *
 *   node --import tsx scripts/graph-owner-compare.mjs snapshot --before <a.jsonl> --after <b.jsonl>
 *       → edge counts by type × origin before / after, and whether the watchdog ran between.
 *
 * His file is read only as data (JSON.parse). His compare_graphs.py is run by
 * the user, unmodified, on copies — never from here.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  REASONS,
  REASON_AR,
  annotateRow,
  buildBridge,
  buildIndex,
  compareSnapshots,
  computeCoverage,
  expectedDiff,
  mapOurEdge,
  parentGate,
  parseCompareTsv,
  parseDbExport,
  reasonTable,
  rollUpEdges,
  serializeOurGraph,
  stripBom,
  tsv,
  utf8NoBom,
} from "../src/lib/ai/graphOwnerCompareCore.ts";

function usage(code = 2) {
  const text = readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(2, 26).map((l) => l.replace(/^ \*\s?/, "")).join("\n");
  console.error(text);
  process.exit(code);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) usage();
    const eq = a.indexOf("=");
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) usage();
      out[a.slice(2)] = v;
      i++;
    }
  }
  return out;
}

function need(args, name, allowed) {
  for (const k of Object.keys(args)) {
    if (!allowed.includes(k)) {
      console.error(`unknown option --${k}`);
      usage();
    }
  }
  const v = args[name];
  if (!v) {
    console.error(`--${name} is required`);
    usage();
  }
  return resolve(v);
}

function readText(path) {
  if (!existsSync(path)) {
    console.error(`not found: ${path}`);
    process.exit(2);
  }
  return stripBom(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** His file, as data. */
function readOwner(path) {
  const json = JSON.parse(readText(path));
  const edges = Array.isArray(json) ? json : json?.edges;
  const nodes = Array.isArray(json?.nodes) ? json.nodes : [];
  if (!Array.isArray(edges)) {
    console.error(`${path}: no "edges" list`);
    process.exit(2);
  }
  if (nodes.length === 0) {
    console.error(`${path}: no "nodes" list — the id bridge needs his nodes (id + path)`);
    process.exit(2);
  }
  return { meta: json.meta ?? {}, nodes, edges };
}

function write(path, text) {
  const buf = utf8NoBom(text);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) throw new Error("BOM in output");
  writeFileSync(path, buf);
}

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : "—";
}

// ── export ───────────────────────────────────────────────────────────────────
function cmdExport(args) {
  const allowed = ["db", "owner", "out", "min-parent-match"];
  const dbPath = need(args, "db", allowed);
  const ownerPath = need(args, "owner", allowed);
  const outDir = need(args, "out", allowed);
  const minRate = args["min-parent-match"] === undefined ? 0.5 : Number(args["min-parent-match"]);
  if (!Number.isFinite(minRate) || minRate < 0 || minRate > 1) {
    console.error("--min-parent-match must be a number from 0 to 1");
    process.exit(2);
  }

  const db = parseDbExport(readText(dbPath));
  const owner = readOwner(ownerPath);
  const ownerSha = sha256(ownerPath);
  console.log(`owner file: ${owner.edges.length} edges, ${owner.nodes.length} nodes, sha256 ${ownerSha}`);
  console.log(`our export: ${db.edges.length} edge lines, ${db.docs.length} doc lines, snapshot ${db.snapshot.taken_at ?? "?"}`);
  if (db.skippedLines) console.log(`  (${db.skippedLines} non-JSON line(s) skipped)`);

  const bridge = buildBridge(owner.nodes);
  const coverage = computeCoverage(bridge, db.docs);

  const mapped = [];
  for (const e of db.edges) mapped.push(...mapOurEdge(bridge, e));
  const edges = rollUpEdges(mapped);

  const excluded = {};
  for (const c of db.snapshot.edge_counts ?? []) {
    if (["INTERPRETS_ARTICLE", "AMENDS_ARTICLE", "SUPERSEDES_LAW", "PARENT_LAW", "IMPLEMENTED_BY"].includes(c.edge_type)) continue;
    excluded[c.edge_type] = (excluded[c.edge_type] ?? 0) + Number(c.n);
  }
  const exportedByType = {};
  const oursEndsUnmapped = {};
  for (const e of edges) {
    exportedByType[e.type] = (exportedByType[e.type] ?? 0) + 1;
    if (e.from.doc.startsWith("OURS:") || e.to.doc.startsWith("OURS:")) oursEndsUnmapped[e.type] = (oursEndsUnmapped[e.type] ?? 0) + 1;
  }
  const ourByType = {};
  for (const e of db.edges) ourByType[e.edge_type] = (ourByType[e.edge_type] ?? 0) + 1;

  console.log("\nid coverage — his nodes with a document in our library:");
  console.log("family\tmapped\tunmapped\tshare");
  for (const r of coverage.byFamily) console.log(`${r.family}\t${r.mapped}\t${r.unmapped}\t${pct(r.mapped, r.mapped + r.unmapped)}`);
  console.log(`mapped via: ${JSON.stringify(coverage.mappedVia)}`);
  if (coverage.slugShadowedByInstrumentId) console.log(`our laws whose instrument_id wins over another file-name match: ${coverage.slugShadowedByInstrumentId}`);
  if (bridge.ambiguousSlugs.size || bridge.ambiguousUuids.size) {
    console.log(`his file names shared by several of his files (left out of the bridge): ${bridge.ambiguousSlugs.size} slug(s), ${bridge.ambiguousUuids.size} uuid(s)`);
  }

  mkdirSync(outDir, { recursive: true });
  write(
    join(outDir, "coverage.tsv"),
    tsv(["family", "mapped", "unmapped"], coverage.byFamily.map((r) => [r.family, r.mapped, r.unmapped])),
  );
  write(
    join(outDir, "unmapped_owner_nodes.tsv"),
    tsv(
      ["id", "family", "reason", "tried_slug", "tried_uuid", "title", "path"],
      coverage.unmapped.map((u) => [u.id, u.family, u.reason, u.tried_slug, u.tried_uuid, u.title, u.path]),
    ),
  );

  const gate = parentGate(owner.edges, edges);
  console.log(
    `\nbridge check (PARENT_LAW ↔ his regulation_of, same parent_law_id source): his ${gate.his}, ours ${gate.ours}, common ${gate.common}` +
      (gate.rate === null ? " — his file has none, no check" : ` → ${(gate.rate * 100).toFixed(1)}% of his (minimum ${(minRate * 100).toFixed(0)}%)`),
  );
  if (gate.rate !== null && gate.rate < minRate) {
    console.error(
      "\nSTOP: the law-id bridge looks broken (few of his parent links match ours). our_graph.json NOT written.\n" +
        `Read ${join(outDir, "unmapped_owner_nodes.tsv")} and the coverage table first; a diff now would show every edge as a difference.`,
    );
    process.exit(3);
  }

  const meta = {
    schema: "nzamy_graph_for_owner_compare/1",
    generated_at: new Date().toISOString(),
    note:
      "Our graph in the owner's format, document level. Inside compare_graphs.py «ours» is HIS file: only_ours.tsv = in his file and not in ours; only_theirs.tsv = in ours and not in his. Ends we could not map are written OURS:<our doc key>, never dropped.",
    compared_against: { file: "LEGAL_GRAPH_EDGES_CLEAN.json", sha256: ownerSha, edges: owner.edges.length, nodes: owner.nodes.length },
    db_snapshot: db.snapshot,
    our_edges_by_type: ourByType,
    exported_by_type: exportedByType,
    exported_with_unmapped_end_by_type: oursEndsUnmapped,
    excluded_counts: excluded,
    type_mapping: {
      INTERPRETS_ARTICLE: "cites_article (principle doc → law, to.article)",
      AMENDS_ARTICLE: "amended_by (reversed: amended law + from.article → amender)",
      SUPERSEDES_LAW: "superseded_by (reversed: old → new); ours cannot tell repeal from supersede",
      PARENT_LAW: "regulation_of + mirror regulated_by",
      IMPLEMENTED_BY: "OURS:IMPLEMENTED_BY (our label kept)",
    },
    bridge_check: gate,
    coverage: {
      by_family: coverage.byFamily,
      mapped_via: coverage.mappedVia,
      slug_shadowed_by_instrument_id: coverage.slugShadowedByInstrumentId,
      unmapped_ids: coverage.unmapped.map((u) => u.id),
    },
  };
  const outFile = join(outDir, "our_graph.json");
  write(outFile, serializeOurGraph(meta, edges));
  console.log(`\nwrote ${outFile}: ${edges.length} document-level edges ${JSON.stringify(exportedByType)}`);
  console.log(`not exported (counted only): ${JSON.stringify(excluded)}`);
}

// ── annotate ─────────────────────────────────────────────────────────────────
function cmdAnnotate(args) {
  const allowed = ["tsv-dir", "owner", "ours", "out", "summary"];
  const tsvDir = need(args, "tsv-dir", allowed);
  const ownerPath = need(args, "owner", allowed);
  const oursPath = need(args, "ours", allowed);
  const outDir = need(args, "out", allowed);
  const summaryText = args.summary ? readText(resolve(args.summary)).trim() : "";

  const owner = readOwner(ownerPath);
  const ours = JSON.parse(readText(oursPath));
  if (!Array.isArray(ours?.edges) || ours?.meta?.schema !== "nzamy_graph_for_owner_compare/1") {
    console.error(`${oursPath}: not an our_graph.json written by the export step`);
    process.exit(2);
  }
  const hisOnlyRows = parseCompareTsv(readText(join(tsvDir, "only_ours.tsv")));
  const oursOnlyRows = parseCompareTsv(readText(join(tsvDir, "only_theirs.tsv")));

  const idx = buildIndex(owner.edges, ours.edges);
  const expected = expectedDiff(idx);
  const same = (rows, set) => rows.length === set.size && rows.every((k) => set.has(k));
  if (!same(hisOnlyRows, expected.hisOnly) || !same(oursOnlyRows, expected.oursOnly)) {
    console.error(
      "STOP: the TSVs do not come from these two JSON files " +
        `(only_ours.tsv ${hisOnlyRows.length} rows vs ${expected.hisOnly.size} expected; ` +
        `only_theirs.tsv ${oursOnlyRows.length} vs ${expected.oursOnly.size}). ` +
        "Run compare_graphs.py again on exactly these copies (positional = our_graph.json, --ours = his file).",
    );
    process.exit(3);
  }

  const input = {
    ownerEdges: owner.edges,
    ourEdges: ours.edges,
    ownerUnmapped: new Set(ours.meta?.coverage?.unmapped_ids ?? []),
    ownerIds: new Set(owner.nodes.map((n) => n.id)),
  };
  const rows = [
    ...hisOnlyRows.map((k) => annotateRow(idx, input, "his_only", k)),
    ...oursOnlyRows.map((k) => annotateRow(idx, input, "ours_only", k)),
  ];

  mkdirSync(outDir, { recursive: true });
  write(
    join(outDir, "diff_annotated.tsv"),
    tsv(
      ["type", "from", "to", "article", "side", "reason", "his_edge_ids", "our_types"],
      rows.map((r) => [r.type, r.from, r.to, r.article, r.side, r.reason, r.his_edge_ids, r.our_types]),
    ),
  );

  const common = [...idx.hisKeys].filter((k) => idx.ourKeys.has(k)).length;
  const md = [];
  md.push("# Graph comparison — annotated differences", "");
  md.push(`- His file: LEGAL_GRAPH_EDGES_CLEAN.json, sha256 \`${sha256(ownerPath)}\`, ${owner.edges.length} edges, ${owner.nodes.length} nodes.`);
  md.push(`- Our file: our_graph.json, sha256 \`${sha256(oursPath)}\`, ${ours.edges.length} edges, generated ${ours.meta.generated_at}; database snapshot ${ours.meta.db_snapshot?.taken_at ?? "?"}, graph last synced ${ours.meta.db_snapshot?.sync_state?.last_synced_at ?? "?"}.`);
  md.push(`- Keys (type, from, to, article): his ${idx.hisKeys.size}, ours ${idx.ourKeys.size}, common ${common}.`);
  md.push("- Naming in compare_graphs.py: «ours» there is HIS file, so `only_ours.tsv` = in his file and not in ours (side `his_only`), `only_theirs.tsv` = in ours and not in his (side `ours_only`).", "");
  if (summaryText) md.push("## His script's two lines, verbatim", "", "```", summaryText, "```", "");
  md.push("## Id coverage (his nodes with a document in our library)", "", "| family | mapped | unmapped |", "|---|---:|---:|");
  for (const r of ours.meta.coverage?.by_family ?? []) md.push(`| ${r.family} | ${r.mapped} | ${r.unmapped} |`);
  md.push("");
  for (const side of ["his_only", "ours_only"]) {
    const { types, counts } = reasonTable(rows, side);
    const used = REASONS.filter((r) => types.some((t) => counts.get(t)?.get(r)));
    md.push(`## ${side === "his_only" ? "In his file, not in ours (only_ours.tsv)" : "In ours, not in his file (only_theirs.tsv)"}`, "");
    if (types.length === 0) {
      md.push("None.", "");
      continue;
    }
    md.push(`| type | ${used.join(" | ")} | total |`, `|---|${used.map(() => "---:").join("|")}|---:|`);
    const totals = new Map();
    for (const t of types) {
      const m = counts.get(t);
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      used.forEach((r) => totals.set(r, (totals.get(r) ?? 0) + (m.get(r) ?? 0)));
      md.push(`| ${t} | ${used.map((r) => m.get(r) ?? 0).join(" | ")} | ${total} |`);
    }
    md.push(`| **all** | ${used.map((r) => totals.get(r)).join(" | ")} | ${[...totals.values()].reduce((a, b) => a + b, 0)} |`, "");
  }
  md.push("## Reason codes", "", "| code | meaning | بالعربية |", "|---|---|---|");
  const EN = {
    kind_not_in_ours: "his kind has no counterpart in our graph (merged regulation, related_to, cites_precedent)",
    owner_node_unmapped: "one of his documents has no document of ours by id or file name",
    ours_node_unmapped: "one of our documents has no id in his node list (written OURS:…)",
    regulation_block: "article number of a regulation merged inside the system's file (to.regulation_ref)",
    article_flagged_308: "his edge carries article_check (one of his 308 flagged)",
    article_differs: "same link between the same documents, other article number",
    pair_matched_other_type: "the two documents are linked on the other side under another type",
    inverse_of_matched_pair: "the inverse of one of his own links that matched (same fact, other direction)",
    reversed: "the link exists on the other side in the opposite direction",
    kind_not_in_his: "our kind has no counterpart in his file",
    true_miss: "both documents are known to both sides and the other side has no link between them",
  };
  for (const r of REASONS) md.push(`| \`${r}\` | ${EN[r]} | ${REASON_AR[r]} |`);
  md.push("");
  write(join(outDir, "diff_summary.md"), md.join("\n"));

  const bySide = (s) => rows.filter((r) => r.side === s).length;
  console.log(`wrote ${join(outDir, "diff_annotated.tsv")} (${bySide("his_only")} his_only + ${bySide("ours_only")} ours_only rows) and ${join(outDir, "diff_summary.md")}`);
}

// ── snapshot (H4) ────────────────────────────────────────────────────────────
function cmdSnapshot(args) {
  const allowed = ["before", "after"];
  const before = parseDbExport(readText(need(args, "before", allowed))).snapshot;
  const after = parseDbExport(readText(need(args, "after", allowed))).snapshot;
  const cmp = compareSnapshots(before, after);
  console.log(`before: taken ${before.taken_at}, graph last synced ${cmp.lastSyncedBefore}`);
  console.log(`after:  taken ${after.taken_at}, graph last synced ${cmp.lastSyncedAfter}`);
  console.log("edge_type\torigin\tbefore\tafter\tdelta");
  for (const r of cmp.rows) console.log(`${r.edge_type}\t${r.origin}\t${r.before}\t${r.after}\t${r.delta > 0 ? "+" : ""}${r.delta}`);
  console.log(
    cmp.watchdogRanBetween
      ? "The watchdog rebuilt the graph between the two runs: any change above comes from library changes, not from this comparison (it writes nothing)."
      : "The watchdog did not run between the two runs.",
  );
  const owner = cmp.rows.filter((r) => r.origin === "owner_curated");
  console.log(`owner_curated edges: ${owner.length ? owner.map((r) => `${r.edge_type} ${r.before}→${r.after}`).join(", ") : "none before, none after"}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "export") cmdExport(parseArgs(rest));
else if (cmd === "annotate") cmdAnnotate(parseArgs(rest));
else if (cmd === "snapshot") cmdSnapshot(parseArgs(rest));
else usage(cmd === "--help" || cmd === "-h" ? 0 : 2);
