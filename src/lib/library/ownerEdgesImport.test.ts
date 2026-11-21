/**
 * ownerEdgesImport.test.ts — the importer of the owner's principle → article
 * links (owner file 19 Nov 2026 §2/§3; scripts/library-owner-edges.mjs).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/ownerEdgesImport.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOwnerEdgeRows,
  evidenceHasFraction,
  formatReport,
  normalizeArticleNumber,
  ownerEdgeId,
  parseInventory,
  readOwnerGraph,
} from "./ownerEdgesImport.ts";

const NODES = [
  { id: "COLL-1", path: "مبادئ وسوابق قضائية/مجموعة.md", type: "مبادئ قضائية" },
  { id: "LAW-00-0001", path: "أنظمة ولوائح/نظام أ.md", type: "نظام" },
  { id: "LAW-09-0249", path: "أنظمة ولوائح/نظام قديم المعرّف.md", type: "نظام" },
];
const cite = (id: string, extra: Record<string, unknown> = {}, to: Record<string, unknown> = {}, from: Record<string, unknown> = {}) => ({
  type: "cites_article",
  edge_id: id,
  quality: "ok",
  from: { doc: "COLL-1", principle: "5", ...from },
  to: { doc: "LAW-00-0001", article: "1", ...to },
  evidence: { text: "نصت المادة (1) من النظام" },
  ...extra,
});
const file = (edges: unknown[], nodes = NODES) => readOwnerGraph(JSON.stringify({ meta: {}, nodes, edges }));

test("article numbers: Latin digits, «مكرر» as the seeder stores it, fractions kept and recognised", () => {
  assert.deepEqual(normalizeArticleNumber("12"), { text: "12", kind: "number" });
  assert.deepEqual(normalizeArticleNumber("٢٣"), { text: "23", kind: "number" });
  assert.deepEqual(normalizeArticleNumber(7), { text: "7", kind: "number" });
  assert.deepEqual(normalizeArticleNumber("23 مكرر"), { text: "23 مكرر", kind: "mukarrar" });
  assert.deepEqual(normalizeArticleNumber("٩ مكرر (٢)"), { text: "9 مكرر 2", kind: "mukarrar" });
  assert.deepEqual(normalizeArticleNumber("23مكرر"), { text: "23 مكرر", kind: "mukarrar" });
  assert.deepEqual(normalizeArticleNumber("2 / 59"), { text: "2/59", kind: "fraction" });
  assert.equal(normalizeArticleNumber("الأولى").kind, "other");
  assert.deepEqual(normalizeArticleNumber(""), { text: null, kind: "none" });
  assert.ok(evidenceHasFraction("فقد نصت المادة ( 2/59 ) من اللائحة"));
  assert.ok(!evidenceHasFraction("المادة (59) من اللائحة، الفقرة 2"));
});

test("his file shapes: {meta,nodes,edges}, an edge array, JSONL; OUR export is refused", () => {
  assert.equal(file([cite("00000000000000a1")]).format, "json");
  assert.equal(readOwnerGraph(JSON.stringify([cite("00000000000000a1")])).format, "json-array");
  const jsonl = readOwnerGraph(`{"kind":"node","id":"COLL-1","path":"x.md"}\n${JSON.stringify(cite("00000000000000a1"))}\nnot json\n`);
  assert.equal(jsonl.format, "jsonl");
  assert.equal(jsonl.nodes.length, 1);
  assert.equal(jsonl.edges.length, 1);
  assert.equal(jsonl.badLines, 1);
  assert.throws(
    () => readOwnerGraph(`{"kind" : "snapshot", "schema" : "nzamy_graph_owner_compare_export/1"}\n{"kind":"edge","edge_type":"X"}\n`),
    /OUR graph export/,
  );
  assert.throws(() => readOwnerGraph("﻿" + JSON.stringify({ meta: {}, nodes: [] })), /no edges/);
});

test("a fixed export: rows keep his edge_id, map the merged types, report every fix", () => {
  const f = file([
    cite("00000000000000a1"),
    cite("00000000000000a2", { quality: "ok_regulation_block", resolved_by: "regulation_via_parent_system" }, { regulation_ref: "اللائحة التنفيذية لنظام أ" }),
    cite("00000000000000a3", {}, { article: "23 مكرر" }),
    cite("00000000000000a4", { quality: "flagged" }, { article: "2/59" }),
    { type: "amended_by", edge_id: "00000000000000b1", from: { doc: "LAW-00-0001", article: "3" }, to: { doc: "LAW-30-0001" }, quality: "ok" },
    { type: "related_to", edge_id: "00000000000000b2", from: { doc: "LAW-00-0001" }, to: { doc: "LAW-00-0002" }, quality: "ok" },
  ]);
  const { rows, rejected, report } = buildOwnerEdgeRows(f);
  assert.deepEqual(rows.map((r) => r.edge_id), ["00000000000000a1", "00000000000000a2", "00000000000000a3", "00000000000000a4", "00000000000000b1"]);
  assert.deepEqual(rows[0], {
    edge_id: "00000000000000a1", type: "cites_article", from_doc: "COLL-1", from_principle: "5", from_article: null,
    from_regulation_ref: null, to_doc: "LAW-00-0001", to_article: "1", to_regulation_ref: null, to_principle: null,
    quality: "ok", article_check: null, evidence: "نصت المادة (1) من النظام",
  });
  assert.equal(rows[1].to_regulation_ref, "اللائحة التنفيذية لنظام أ");
  assert.equal(rows[1].quality, "ok", "ok_regulation_block is ok");
  assert.equal(rows[2].to_article, "23 مكرر");
  assert.equal(rows[3].quality, "flagged");
  assert.match(rows[3].article_check ?? "", /fractional_article_number/);
  assert.deepEqual(report.skippedTypes, { related_to: 1 }, "batch l12 (file 02 #43): amended_by is merged");
  assert.deepEqual(
    { type: rows[4].type, from_doc: rows[4].from_doc, from_article: rows[4].from_article, to_doc: rows[4].to_doc, to_article: rows[4].to_article },
    { type: "amended_by", from_doc: "LAW-00-0001", from_article: "3", to_doc: "LAW-30-0001", to_article: null },
    "amended_by: the article is on the from side (the amended law)",
  );
  assert.equal(rejected.length, 0);
  assert.deepEqual(report.fixes.fix1_from_principle, { present: 4, missing: 0 });
  assert.deepEqual(report.fixes.fix4_fraction_flagged, { fractions: 1, flagged_by_owner: 1, not_flagged: 0, cut_in_evidence: 0 });
  assert.deepEqual(report.refusals, []);
  assert.match(formatReport(report, "a".repeat(64), rows.length), /--apply would load this file/);
});

test("the pre-fix export (no from.principle anywhere) is refused for --apply", () => {
  const { report } = buildOwnerEdgeRows(file([cite("00000000000000a1", {}, {}, { principle: undefined })]));
  assert.equal(report.fixes.fix1_from_principle.missing, 1);
  assert.ok(report.refusals.some((r) => /before his four fixes/.test(r)));
});

test("unknown types are rejected and refuse --apply; refers_to_article is known (owner decision 19 Nov) but not merged", () => {
  const { report, rejected } = buildOwnerEdgeRows(
    file([cite("00000000000000a1"), { type: "contradicts", edge_id: "00000000000000c1", from: { doc: "A" }, to: { doc: "B" } },
      { type: "refers_to_article", edge_id: "00000000000000c2", from: { doc: "A", article: "1" }, to: { doc: "B", article: "2" } }]),
  );
  assert.deepEqual(report.unknownTypes, { contradicts: 1 });
  assert.equal(rejected[0].reason, "unknown_type");
  assert.deepEqual(report.skippedTypes, { refers_to_article: 1 });
  assert.ok(report.refusals.some((r) => /unknown type/.test(r)));
});

test("fix 3: a link that names a regulation without regulation_ref is rejected (it would hit the law's own article)", () => {
  const { rows, rejected, report } = buildOwnerEdgeRows(
    file([cite("00000000000000a1", { quality: "ok_regulation_block", resolved_by: "regulation_via_parent_system" })]),
  );
  assert.equal(rows.length, 0);
  assert.equal(rejected[0].reason, "regulation_ref_missing");
  assert.equal(report.fixes.fix3_regulation_ref.missing_where_needed, 1);
});

test("fix 4 and doubtful numbers: a fraction cut to a whole number, his article_check, an uncorrected parse, his weaker quality → flagged", () => {
  const { rows, report } = buildOwnerEdgeRows(
    file([
      cite("00000000000000a1", { evidence: { text: "فقد نصت المادة ( 2/59 ) من اللائحة" } }, { article: "2" }),
      cite("00000000000000a2", { article_check: "target_article_anchor_not_found" }),
      cite("00000000000000a3", { article_parse_suspect: { corrected_parse: ["24"] } }, { article: "4" }),
      cite("00000000000000a4", { article_parse_suspect: { corrected_parse: ["24"] } }, { article: "24" }),
      cite("00000000000000a5", { quality: "regulation_article_unverified" }, { regulation_ref: "لائحة" }),
      cite("00000000000000a6", { quality: "ok" }, { article: "2/59" }),
    ]),
  );
  assert.deepEqual(rows.map((r) => r.quality), ["flagged", "flagged", "flagged", "ok", "flagged", "flagged"]);
  assert.equal(rows[1].article_check, "target_article_anchor_not_found", "his own check is kept verbatim");
  assert.equal(report.fixes.fix4_fraction_flagged.cut_in_evidence, 1);
  assert.equal(report.fixes.fix4_fraction_flagged.not_flagged, 1, "a fraction he did not flag is a fix-4 miss (flagged here)");
  assert.equal(report.flaggedBy.article_parse_suspect, 1);
  assert.equal(report.flaggedBy.quality_regulation_article_unverified, 1);
});

test("fix 2 with his inventory: a node whose file now has another id is rejected; the id is never rewritten", () => {
  const inventory = parseInventory(
    "path\tid\tslug\n" +
      "أنظمة ولوائح/نظام أ.md\tLAW-00-0001\ta\n" +
      "أنظمة ولوائح/نظام قديم المعرّف.md\tLAW-09-0237\tb\n",
  );
  const { rows, rejected, report } = buildOwnerEdgeRows(
    file([cite("00000000000000a1"), cite("00000000000000a2", {}, { doc: "LAW-09-0249" }), cite("00000000000000a3", {}, { doc: "LAW-77-0000" })]),
    inventory,
  );
  assert.deepEqual(rows.map((r) => r.edge_id), ["00000000000000a1", "00000000000000a3"]);
  assert.equal(rejected[0].reason, "to_doc_not_file_id");
  assert.match(rejected[0].detail, /LAW-09-0249 → file id LAW-09-0237/);
  assert.deepEqual(report.fixes.fix2_to_doc_file_id, { checked: true, match: 1, mismatch: 1, not_in_nodes: 1 });
});

test("edge ids: his kept (lower case), a missing one computed deterministically, an id naming two links refuses --apply", () => {
  const noId = { ...cite(""), edge_id: undefined };
  const { rows, report } = buildOwnerEdgeRows(
    file([cite("00000000000000AB"), noId, noId, cite("00000000000000a9"), cite("00000000000000a9", {}, { article: "2" })]),
  );
  assert.equal(rows[0].edge_id, "00000000000000ab");
  assert.equal(rows[1].edge_id, ownerEdgeId(noId as Record<string, unknown>));
  assert.match(rows[1].edge_id, /^[0-9a-f]{16}$/);
  assert.equal(rows.length, 3, "an exact repeat is one link; the second a9 is a different link");
  assert.equal(report.edgeIdsComputed, 2);
  assert.equal(report.rejects.duplicate_edge_id, 1);
  assert.ok(report.refusals.some((r) => /two different links/.test(r)));
});

test("evidence is flattened and cut to 300 characters; the cut is counted", () => {
  const long = "نص ".repeat(200);
  const { rows, report } = buildOwnerEdgeRows(file([cite("00000000000000a1", { evidence: { text: long } })]));
  assert.equal(rows[0].evidence?.length, 300);
  assert.equal(report.evidenceCut, 1);
});

// ── Batch l12 (owner Q132, file 02 #43) ──────────────────────────────────────

test("#43: his amendment, repeal and replacement links are merged; scheduled repeal and related_to stay out", () => {
  const { rows, report } = buildOwnerEdgeRows(
    file([
      { type: "amended_by", edge_id: "00000000000000d1", from: { doc: "LAW-00-0001", article: "14" }, to: { doc: "LAW-00-1113" }, quality: "ok", evidence: { decree: "المرسوم الملكي رقم (م/113)", date: "1443/11/9ه", type: "تعديل" } },
      { type: "repealed_by", edge_id: "00000000000000d2", from: { doc: "LAW-00-1119" }, to: { doc: "LAW-00-1094" }, quality: "ok", evidence: { field: "repealed_by", value: "LAW-00-1094" } },
      { type: "superseded_by", edge_id: "00000000000000d3", from: { doc: "LAW-96-6664" }, to: { doc: "LAW-00-0114" }, quality: "ok" },
      { type: "replaces", edge_id: "00000000000000d4", from: { doc: "LAW-07-12303" }, to: { doc: "LAW-07-12251" }, quality: "ok" },
      { type: "amends", edge_id: "00000000000000d5", from: { doc: "LAW-96-5307" }, to: { doc: "LAW-96-5460" }, quality: "title_match_unverified" },
      { type: "scheduled_repeal_by", edge_id: "00000000000000d6", from: { doc: "LAW-00-1" }, to: { doc: "LAW-00-2" }, quality: "ok" },
      { type: "related_to", edge_id: "00000000000000d7", from: { doc: "LAW-00-1" }, to: { doc: "LAW-00-2" }, quality: "ok" },
    ]),
  );
  assert.deepEqual(rows.map((r) => r.type), ["amended_by", "repealed_by", "superseded_by", "replaces", "amends"]);
  assert.deepEqual(report.skippedTypes, { scheduled_repeal_by: 1, related_to: 1 });
  assert.equal(rows[0].from_article, "14");
  assert.equal(rows[0].evidence, "المرسوم الملكي رقم (م/113) 1443/11/9ه", "his {decree, date} evidence becomes text");
  assert.equal(rows[1].evidence, "LAW-00-1094", "his {field, value} evidence: the value");
  assert.equal(rows[1].to_article, null);
  assert.equal(rows[4].quality, "flagged", "his weaker quality is still recorded (staff only)");
  assert.equal(report.documentLevel, 1, "amends without an article: document level");
  assert.deepEqual(report.fixes.fix1_from_principle, { present: 0, missing: 0 }, "fix 1 concerns principle → article links only");
  assert.deepEqual(report.refusals, [], "a file of amendment links alone is not refused for fix 1");
});

test("Q132: a principle → article link with no article is kept (it opens the document), not rejected", () => {
  const { rows, rejected, report } = buildOwnerEdgeRows(file([cite("00000000000000a1", {}, { article: undefined })]));
  assert.equal(rejected.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].to_article, null);
  assert.equal(report.documentLevel, 1);
  assert.match(formatReport(report, "a".repeat(64), rows.length), /document-level \(no article to pin; the link opens the target document\): 1/);
  assert.match(formatReport(report, "a".repeat(64), rows.length), /ordinary links since 20261202_30/);
});
