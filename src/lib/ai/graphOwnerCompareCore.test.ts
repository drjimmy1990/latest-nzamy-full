/**
 * graphOwnerCompareCore.test.ts — the owner-graph comparison (question ٣٩):
 * id bridge, type mapping, his script's key, no BOM, the annotation reasons.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/graphOwnerCompareCore.test.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { slugifyArabic } from "../../../scripts/parsers/lib/slug.ts";
import {
  annotateRow,
  bridgeDecree,
  bridgeLaw,
  bridgePrinciple,
  buildBridge,
  buildIndex,
  compareKey,
  compareSnapshots,
  computeCoverage,
  decreeUuidFromOwnerPath,
  endDoc,
  expectedDiff,
  lawSlugFromOwnerPath,
  mapOurEdge,
  ownerFamily,
  ownerFileId,
  parentGate,
  parseCompareTsv,
  parseDbExport,
  rollUpEdges,
  serializeOurGraph,
  toUuid,
  utf8NoBom,
  type DbDocLine,
  type DbEdgeLine,
  type DbEnd,
  type ExportEdge,
  type OwnerEdge,
  type OwnerNode,
} from "./graphOwnerCompareCore.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ── toUuid pinned to the seeder ──────────────────────────────────────────────

/** The seeder's own toUuid, taken from its source text and run (the module itself is never imported). */
function seederToUuid(): (key: string) => string {
  const src = readFileSync(join(root, "scripts", "seed-library.ts"), "utf8");
  const m = src.match(/export function toUuid\(key: string\): string \{[\s\S]*?\r?\n\}\r?\n/);
  assert.ok(m, "scripts/seed-library.ts no longer defines `export function toUuid(key: string): string` — re-pin the copy");
  const js = stripTypeScriptTypes(m[0].replace(/^export /, ""));
  return new Function("crypto", `${js}\nreturn toUuid;`)({ createHash }) as (key: string) => string;
}

test("toUuid is the seeder's toUuid (decrees_circulars.id)", () => {
  const theirs = seederToUuid();
  for (const key of [
    "مرسوم ملكي رقم م-12",
    "Circular31_هيئة_سوق_المال",
    "قرار 1447-3826 لائحة الإرشاد السياحي المعدلة لعام 1448هـ",
    "abc",
    "",
    "C81BA2F1-1BF1-443B-9B1C-A9A700F27110",
  ]) {
    assert.equal(toUuid(key), theirs(key), key);
  }
  assert.match(toUuid("x"), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(toUuid("C81BA2F1-1BF1-443B-9B1C-A9A700F27110"), "c81ba2f1-1bf1-443b-9b1c-a9a700f27110");
});

test("the seeder still keys decrees by toUuid(file name) and laws by the file-name slug rule", () => {
  const seed = readFileSync(join(root, "scripts", "seed-library.ts"), "utf8");
  assert.match(seed, /const rawId = String\(dec\.id \|\| dec\.slug\);[\s\S]{0,500}const decId = toUuid\(rawId\);/);
  const decrees = readFileSync(join(root, "scripts", "parsers", "parse-decrees.ts"), "utf8");
  assert.match(decrees, /const fileId = nameForId\(path\.basename\(filePath, "\.md"\)\);/);
  assert.match(decrees, /\n\s+id: fileId,\r?\n/);
  const laws = readFileSync(join(root, "scripts", "parsers", "parse-laws.ts"), "utf8");
  assert.match(laws, /const fileBaseName = nameForId\(path\.basename\(filePath, "\.md"\)\);/);
  assert.match(laws, /const slug = \/\[\\s\\u0600-\\u06FF\]\/\.test\(rawSlug\) \? slugifyArabic\(rawSlug\) : rawSlug;/);
});

// ── his paths → our identities ───────────────────────────────────────────────

test("his path → file id (NFC, .md dropped), family, law slug, decree uuid", () => {
  const nfd = "أوامر وتعاميم/30 - تعاميم/مرسوم رقم ٤٤".normalize("NFD") + ".md";
  assert.equal(ownerFileId(nfd), "مرسوم رقم ٤٤".normalize("NFC"));
  assert.equal(ownerFileId("a/b/Circular31.md"), "Circular31");
  assert.equal(ownerFamily("أنظمة ولوائح/25 - القسم السياحي/x.md"), "laws");
  assert.equal(ownerFamily("أوامر وتعاميم/x.md"), "decrees");
  assert.equal(ownerFamily("مبادئ وسوابق قضائية/x.md"), "judicial");
  assert.equal(ownerFamily("_deleted_backups_archive/أنظمة ولوائح/x.md"), "other");
  assert.equal(lawSlugFromOwnerPath("أنظمة ولوائح/نظام العمل.md"), slugifyArabic("نظام العمل"));
  assert.equal(lawSlugFromOwnerPath("أنظمة ولوائح/labor-law.md"), "labor-law");
  assert.equal(lawSlugFromOwnerPath("أنظمة ولوائح/labor law.md"), slugifyArabic("labor law"));
  assert.equal(decreeUuidFromOwnerPath(nfd), toUuid("مرسوم رقم ٤٤".normalize("NFC")));
});

const NODES: OwnerNode[] = [
  { id: "LAW-01-0001", path: "أنظمة ولوائح/01/نظام العمل.md", title: "نظام العمل" },
  { id: "LAW-01-0002", path: "أنظمة ولوائح/01/اللائحة التنفيذية لنظام العمل.md", title: "اللائحة" },
  { id: "LAW-01-0003", path: "أنظمة ولوائح/01/نظام بلا معرف.md", title: "نظام" },
  { id: "LAW-30-0001", path: "أوامر وتعاميم/30/مرسوم ملكي م-5.md", title: "مرسوم" },
  { id: "LAW-30-0002", path: "أوامر وتعاميم/30/أمر غائب.md", title: "غائب" },
  { id: "LAW-97-2621", path: "مبادئ وسوابق قضائية/97/حكم 1.md", title: "حكم" },
  { id: "FILE-10045000", path: "مبادئ وسوابق قضائية/97/مجموعة_1430/ج1.md", title: "مجموعة" },
  { id: "LAW-06-00474", path: "_deleted_backups_archive/أنظمة ولوائح/قديم.md", title: "قديم" },
  { id: "LAW-02-0001", path: "أنظمة ولوائح/02/مكرر.md", title: "a" },
  { id: "LAW-03-0001", path: "أنظمة ولوائح/03/مكرر.md", title: "b" },
];
const bridge = buildBridge(NODES);
const SLUG_LABOR = slugifyArabic("نظام العمل");
const SLUG_REG = slugifyArabic("اللائحة التنفيذية لنظام العمل");
const SLUG_NOID = slugifyArabic("نظام بلا معرف");
const DECREE_UUID = toUuid("مرسوم ملكي م-5");

test("bridge: laws by instrument_id first, then the file-name slug; a shared file name is left out", () => {
  assert.deepEqual(bridgeLaw(bridge, "anything", "LAW-01-0001"), { owner: "LAW-01-0001", via: "instrument_id" });
  // instrument_id wins over a slug pointing at another of his files
  assert.deepEqual(bridgeLaw(bridge, SLUG_NOID, "LAW-01-0001"), { owner: "LAW-01-0001", via: "instrument_id" });
  // an instrument_id he does not have falls back to the slug
  assert.deepEqual(bridgeLaw(bridge, SLUG_NOID, "REG-unknown"), { owner: "LAW-01-0003", via: "file_name_slug" });
  assert.equal(bridgeLaw(bridge, "no-such-slug", null), null);
  assert.equal(bridgeLaw(bridge, slugifyArabic("مكرر"), null), null, "two of his files are named مكرر.md");
  assert.deepEqual(bridge.ambiguousSlugs.get(slugifyArabic("مكرر")), ["LAW-02-0001", "LAW-03-0001"]);
});

test("bridge: decrees by the uuid of his file name; judicial by metadata ids in order", () => {
  assert.deepEqual(bridgeDecree(bridge, DECREE_UUID.toUpperCase()), { owner: "LAW-30-0001", via: "file_name_uuid" });
  assert.equal(bridgeDecree(bridge, toUuid("x")), null);
  assert.deepEqual(bridgePrinciple(bridge, { id: "slug-1", collection_id: "prec-abc", principle_meta_id: "LAW-97-2621" }), {
    owner: "LAW-97-2621",
    via: "principle_meta_id",
  });
  assert.deepEqual(bridgePrinciple(bridge, { id: "c__pr-1", collection_id: "coll-1430", collection_meta_id: "FILE-10045000" }), {
    owner: "FILE-10045000",
    via: "collection_meta_id",
  });
  assert.deepEqual(bridgePrinciple(bridge, { id: "c__pr-1", collection_id: "FILE-10045000" }), { owner: "FILE-10045000", via: "collection_id" });
  assert.deepEqual(bridgePrinciple(bridge, { id: "LAW-97-2621", collection_id: "prec-x" }), { owner: "LAW-97-2621", via: "principle_id" });
  assert.equal(bridgePrinciple(bridge, { id: "p", collection_id: "prec-x", principle_meta_id: "NOT-HIS" }), null);
});

test("an end that does not map becomes OURS:<doc key>, never dropped", () => {
  const law = (slug: string, iid: string | null = null): DbEnd => ({ node_type: "article", law_slug: slug, article_number: 3, source_id: "a1", instrument_id: iid });
  assert.equal(endDoc(bridge, law("missing")).doc, "OURS:law:missing");
  assert.equal(endDoc(bridge, { node_type: "decree", source_id: toUuid("zz") }).doc, `OURS:decree:${toUuid("zz")}`);
  assert.equal(endDoc(bridge, { node_type: "principle", source_id: "p9", collection_id: "prec-1" }).doc, "OURS:principle:p9");
  assert.equal(endDoc(bridge, { node_type: "principle", source_id: "c__pr-9", collection_id: "coll-x" }).doc, "OURS:collection:coll-x");
  assert.equal(endDoc(bridge, { node_type: "law", law_slug: SLUG_LABOR, source_id: SLUG_LABOR }).doc, "LAW-01-0001");
});

test("coverage: his nodes per family, by the same bridge, with a reason for each miss", () => {
  const docs: DbDocLine[] = [
    { kind: "doc", family: "law", slug: SLUG_LABOR, instrument_id: null },
    { kind: "doc", family: "law", slug: "x-other", instrument_id: "LAW-01-0002" },
    { kind: "doc", family: "law", slug: SLUG_NOID, instrument_id: "LAW-01-0001" }, // shadows LAW-01-0003
    { kind: "doc", family: "decree", id: DECREE_UUID },
    { kind: "doc", family: "collection", id: "coll-1430", meta_id: "FILE-10045000" },
    { kind: "doc", family: "principle", id: "p1", collection_id: "prec-1", meta_id: "LAW-97-2621" },
  ];
  const c = computeCoverage(bridge, docs);
  const fam = Object.fromEntries(c.byFamily.map((r) => [r.family, [r.mapped, r.unmapped]]));
  assert.deepEqual(fam, { laws: [2, 3], decrees: [1, 1], judicial: [2, 0], other: [0, 1] });
  assert.equal(c.slugShadowedByInstrumentId, 1);
  const reasons = Object.fromEntries(c.unmapped.map((u) => [u.id, u.reason]));
  assert.equal(reasons["LAW-01-0003"], "no_law_with_this_instrument_id_or_file_name_slug");
  assert.equal(reasons["LAW-02-0001"], "file_name_shared_by_several_owner_files");
  assert.equal(reasons["LAW-30-0002"], "no_decree_with_this_file_name_uuid_and_no_law_with_this_id_or_slug");
  assert.equal(reasons["LAW-06-00474"], "outside_the_three_library_folders");
  assert.deepEqual(c.mappedVia, { file_name_slug: 1, instrument_id: 1, file_name_uuid: 1, collection_meta_id: 1, principle_meta_id: 1 });
});

// ── type mapping ─────────────────────────────────────────────────────────────

const art = (slug: string, n: number | null, iid: string | null = null): DbEnd => ({
  node_type: "article",
  law_slug: slug,
  article_number: n,
  source_id: `${slug}-a${n}`,
  instrument_id: iid,
});
const edge = (edge_type: string, from: DbEnd, to: DbEnd, extra: Partial<DbEdgeLine> = {}): DbEdgeLine => ({
  kind: "edge",
  edge_type,
  source_key: `${from.node_type}:${from.source_id}`,
  target_key: `${to.node_type}:${to.source_id}`,
  origin: "auto_watchdog",
  evidence: "e",
  from,
  to,
  ...extra,
});
const principle: DbEnd = { node_type: "principle", source_id: "p1", collection_id: "prec-1", principle_meta_id: "LAW-97-2621" };
const decree: DbEnd = { node_type: "decree", source_id: DECREE_UUID };

test("type mapping: his names, his direction, document level", () => {
  const [ci] = mapOurEdge(bridge, edge("INTERPRETS_ARTICLE", principle, art(SLUG_LABOR, 12)));
  assert.equal(ci.type, "cites_article");
  assert.deepEqual([ci.from, ci.to], [{ doc: "LAW-97-2621" }, { doc: "LAW-01-0001", article: "12" }]);
  assert.equal(ci.provenance, "text");

  const [am] = mapOurEdge(bridge, edge("AMENDS_ARTICLE", decree, art(SLUG_LABOR, 7), { source_tag: "owner_links" }));
  assert.equal(am.type, "amended_by");
  assert.deepEqual([am.from, am.to], [{ doc: "LAW-01-0001", article: "7" }, { doc: "LAW-30-0001" }], "reversed: amended → amender");
  assert.equal(am.provenance, "owner_links");

  const [su] = mapOurEdge(bridge, edge("SUPERSEDES_LAW", { node_type: "law", law_slug: SLUG_NOID, source_id: SLUG_NOID }, art(SLUG_LABOR, 1)));
  assert.equal(su.type, "superseded_by");
  assert.deepEqual([su.from, su.to], [{ doc: "LAW-01-0001" }, { doc: "LAW-01-0003" }], "reversed: old → new, no article");

  const pl = mapOurEdge(bridge, edge("PARENT_LAW", art(SLUG_REG, 1), art(SLUG_LABOR, 40)));
  assert.deepEqual(
    pl.map((e) => [e.type, e.from, e.to, e.provenance]),
    [
      ["regulation_of", { doc: "LAW-01-0002" }, { doc: "LAW-01-0001" }, "parent_law_id"],
      ["regulated_by", { doc: "LAW-01-0001" }, { doc: "LAW-01-0002" }, "parent_law_id"],
    ],
    "the enabling article is dropped; the mirror is emitted",
  );

  const [ib] = mapOurEdge(bridge, edge("IMPLEMENTED_BY", art(SLUG_LABOR, 3), art(SLUG_REG, 9)));
  assert.equal(ib.type, "OURS:IMPLEMENTED_BY");
  assert.deepEqual([ib.from, ib.to], [{ doc: "LAW-01-0001" }, { doc: "LAW-01-0002" }]);
  assert.equal(ib.provenance, "article_regulations");

  for (const t of ["CITES_ARTICLE", "EXEMPTS_FROM", "SUBJECT_TO", "PENALIZES", "PART_OF", "NEXT_ARTICLE", "HAS_CONCEPT", "DEFINES_TERM", "DECONSTRUCTS_CONCEPT", "ESTABLISHES_RULE", "SIMILAR_TO", "REPLACED_BY"]) {
    assert.deepEqual(mapOurEdge(bridge, edge(t, art(SLUG_LABOR, 1), art(SLUG_REG, 2))), [], t);
  }
});

test("never a top-level `article`; article numbers are Latin-digit strings; a cites_article without a number has no to.article", () => {
  const all = [
    ...mapOurEdge(bridge, edge("INTERPRETS_ARTICLE", principle, art(SLUG_LABOR, 120))),
    ...mapOurEdge(bridge, edge("INTERPRETS_ARTICLE", principle, art(SLUG_LABOR, null))),
    ...mapOurEdge(bridge, edge("AMENDS_ARTICLE", decree, art(SLUG_LABOR, 5))),
    ...mapOurEdge(bridge, edge("PARENT_LAW", art(SLUG_REG, 1), art(SLUG_LABOR, 4))),
    ...mapOurEdge(bridge, edge("SUPERSEDES_LAW", art(SLUG_NOID, 1), art(SLUG_LABOR, 1))),
  ];
  for (const e of all) {
    assert.equal("article" in e, false);
    for (const end of [e.from, e.to]) if (end.article !== undefined) assert.match(end.article, /^[0-9]+$/);
  }
  assert.equal(all[1].to.article, undefined);
  assert.equal(compareKey(all[0] as unknown as OwnerEdge), "cites_article\tLAW-97-2621\tLAW-01-0001\t120");
  assert.equal(compareKey(all[2] as unknown as OwnerEdge), "amended_by\tLAW-01-0001\tLAW-30-0001\t", "from.article is ignored by his script");
});

test("roll-up: many article-level edges → one document-level edge, counted, provenance kept", () => {
  const rolled = rollUpEdges([
    ...mapOurEdge(bridge, edge("INTERPRETS_ARTICLE", principle, art(SLUG_LABOR, 12))),
    ...mapOurEdge(bridge, edge("INTERPRETS_ARTICLE", { ...principle, source_id: "p2" }, art(SLUG_LABOR, 12))),
    ...mapOurEdge(bridge, edge("INTERPRETS_ARTICLE", principle, art(SLUG_LABOR, 13))),
    ...mapOurEdge(bridge, edge("PARENT_LAW", art(SLUG_REG, 1), art(SLUG_LABOR, 4), { source_tag: "owner_links" })),
    ...mapOurEdge(bridge, edge("PARENT_LAW", art(SLUG_REG, 1), art(SLUG_LABOR, 5))),
  ]);
  const ci = rolled.filter((e) => e.type === "cites_article");
  assert.deepEqual(ci.map((e) => [e.to.article, e.our_edges]), [["12", 2], ["13", 1]]);
  const ro = rolled.find((e) => e.type === "regulation_of")!;
  assert.equal(ro.our_edges, 2);
  assert.equal(ro.provenance, "owner_links|parent_law_id");
});

// ── his script's key ─────────────────────────────────────────────────────────

test("compareKey is norm() of compare_graphs.py", () => {
  assert.equal(compareKey({ type: "cites_article", from: { doc: "A" }, to: { doc: "B", article: "2" } }), "cites_article\tA\tB\t2");
  assert.equal(compareKey({ type: "amended_by", from: { doc: "A", article: "14" }, to: { doc: "B" } }), "amended_by\tA\tB\t", "from.article dropped");
  assert.equal(compareKey({ type: "t", from: "A", to: "B", article: "9" }), "t\tA\tB\t9", "string ends; top-level article is the target article");
  assert.equal(compareKey({ type: "t", from: { id: "A" }, to: { doc: "", id: "B", article: 3 } }), "t\tA\tB\t3", "doc ‖ id; numbers through str()");
  assert.equal(compareKey({ from: {}, to: null }), "\t\t\t");
});

test("our_graph.json: UTF-8 with no BOM, valid JSON, edges list his script reads", () => {
  const edges = rollUpEdges(mapOurEdge(bridge, edge("INTERPRETS_ARTICLE", principle, art(SLUG_LABOR, 12))));
  const text = serializeOurGraph({ schema: "nzamy_graph_for_owner_compare/1", note: "عربي" }, edges);
  const buf = utf8NoBom(text);
  assert.notDeepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.notDeepEqual([...utf8NoBom("﻿{}").subarray(0, 3)], [0xef, 0xbb, 0xbf], "a BOM handed in is stripped");
  const parsed = JSON.parse(buf.toString("utf8"));
  assert.equal(parsed.meta.note, "عربي");
  assert.equal(parsed.edges.length, 1);
  assert.equal(parsed.edges[0].to.article, "12");
});

test("bridge gate: share of his regulation_of keys that ours has", () => {
  const ours = rollUpEdges(mapOurEdge(bridge, edge("PARENT_LAW", art(SLUG_REG, 1), art(SLUG_LABOR, 4))));
  const his: OwnerEdge[] = [
    { type: "regulation_of", from: { doc: "LAW-01-0002" }, to: { doc: "LAW-01-0001" } },
    { type: "regulation_of", from: { doc: "LAW-09-0001" }, to: { doc: "LAW-01-0001" } },
    { type: "regulated_by", from: { doc: "LAW-01-0001" }, to: { doc: "LAW-01-0002" } },
  ];
  assert.deepEqual(parentGate(his, ours), { his: 2, ours: 1, common: 1, rate: 0.5 });
  assert.equal(parentGate([], ours).rate, null);
});

// ── the export file ──────────────────────────────────────────────────────────

test("parseDbExport: kinds, CRLF, stray psql lines skipped, a missing snapshot refused", () => {
  const text = [
    '{"kind":"snapshot","taken_at":"t"}',
    'BEGIN',
    '{"kind":"doc","family":"law","slug":"s","instrument_id":null}',
    '{"kind":"edge","edge_type":"PARENT_LAW","source_key":"a","target_key":"b","from":{"node_type":"law","source_id":"x"},"to":{"node_type":"law","source_id":"y"}}',
    "",
  ].join("\r\n");
  const p = parseDbExport("﻿" + text);
  assert.equal(p.snapshot?.taken_at, "t");
  assert.equal(p.docs.length, 1);
  assert.equal(p.edges.length, 1);
  assert.equal(p.skippedLines, 1);
  assert.throws(() => parseDbExport('{"kind":"doc","family":"law"}\n'), /no snapshot/);
  assert.throws(() => parseDbExport('{"kind":"snapshot"}\n{"kind":"x"}\n'), /unknown kind/);
});

test("the SQL file is read-only, ends with ROLLBACK, and emits kind-tagged JSON lines", () => {
  const sql = readFileSync(join(root, "supabase", "one-time", "graph_owner_compare_export.sql"), "utf8");
  const code = sql.replace(/--.*$/gm, "");
  assert.match(code, /begin transaction isolation level repeatable read read only;/);
  assert.match(code.trimEnd(), /\nrollback;$/);
  assert.doesNotMatch(code, /\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|commit)\b/i);
  for (const kind of ["snapshot", "doc", "edge"]) assert.match(code, new RegExp(`'kind', '${kind}'`));
  for (const t of ["INTERPRETS_ARTICLE", "AMENDS_ARTICLE", "SUPERSEDES_LAW", "PARENT_LAW", "IMPLEMENTED_BY"]) assert.ok(code.includes(`'${t}'`), t);
  assert.match(code, /\\pset format unaligned/);
  assert.match(code, /\\pset tuples_only on/);
});

// ── annotation ───────────────────────────────────────────────────────────────

test("annotate: every reason code on the right side", () => {
  const his: OwnerEdge[] = [
    { type: "related_to", from: { doc: "LAW-01-0001" }, to: { doc: "LAW-01-0002" }, edge_id: "h1" },
    { type: "cites_article", from: { doc: "LAW-97-2621" }, to: { doc: "LAW-30-0002", article: "1" }, edge_id: "h2" }, // LAW-30-0002 unmapped
    { type: "cites_article", from: { doc: "LAW-97-2621" }, to: { doc: "LAW-01-0001", article: "77", regulation_ref: "x" }, edge_id: "h3" },
    { type: "cites_article", from: { doc: "LAW-97-2621" }, to: { doc: "LAW-01-0001", article: "88" }, article_check: { found: false }, edge_id: "h4" },
    { type: "cites_article", from: { doc: "LAW-97-2621" }, to: { doc: "LAW-01-0001", article: "5" }, edge_id: "h5" }, // ours has 12
    { type: "repealed_by", from: { doc: "LAW-01-0003" }, to: { doc: "LAW-01-0001" }, edge_id: "h6" }, // ours: superseded_by same pair
    { type: "superseded_by", from: { doc: "LAW-01-0003" }, to: { doc: "LAW-01-0001" }, edge_id: "h7" }, // matched (common)
    { type: "supersedes", from: { doc: "LAW-01-0001" }, to: { doc: "LAW-01-0003" }, edge_id: "h8" }, // inverse of matched pair
    { type: "amends", from: { doc: "LAW-30-0001" }, to: { doc: "LAW-01-0002" }, edge_id: "h9" }, // ours amended_by 0002→30-0001, his has no twin
    { type: "regulation_of", from: { doc: "FILE-10045000" }, to: { doc: "LAW-01-0002" }, edge_id: "h10" }, // nothing at all
    { type: "regulated_by", from: { doc: "LAW-01-0001" }, to: { doc: "LAW-01-0002" }, edge_id: "h11" }, // common
  ];
  const ours: ExportEdge[] = rollUpEdges([
    ...mapOurEdge(bridge, edge("INTERPRETS_ARTICLE", principle, art(SLUG_LABOR, 12))),
    ...mapOurEdge(bridge, edge("SUPERSEDES_LAW", art(SLUG_NOID, 1), art(SLUG_LABOR, 1))), // superseded_by 0001 → 0003
    ...mapOurEdge(bridge, edge("AMENDS_ARTICLE", decree, art(SLUG_REG, 3))),
    ...mapOurEdge(bridge, edge("PARENT_LAW", art(SLUG_REG, 1), art(SLUG_LABOR, 4))),
    ...mapOurEdge(bridge, edge("IMPLEMENTED_BY", art(SLUG_LABOR, 3), art(SLUG_REG, 9))),
    ...mapOurEdge(bridge, edge("IMPLEMENTED_BY", art(SLUG_NOID, 3), art(SLUG_LABOR, 9))),
    ...mapOurEdge(bridge, edge("INTERPRETS_ARTICLE", principle, art("gone-law", 2))),
    ...mapOurEdge(bridge, edge("SUPERSEDES_LAW", art(SLUG_REG, 1), art(SLUG_NOID, 1))), // superseded_by 0003 → 0002
  ]);
  // His h6/h7 go 0003 → 0001 (old → new); make ours old → new for the same pair.
  const fixed = ours.map((e) =>
    e.type === "superseded_by" && e.from.doc === "LAW-01-0001" ? { ...e, from: { doc: "LAW-01-0003" }, to: { doc: "LAW-01-0001" } } : e,
  );
  const idx = buildIndex(his, fixed);
  const input = { ownerEdges: his, ourEdges: fixed, ownerUnmapped: new Set(["LAW-30-0002"]), ownerIds: new Set(NODES.map((n) => n.id)) };
  const { hisOnly, oursOnly } = expectedDiff(idx);
  const reasonOf = (side: "his_only" | "ours_only", set: Set<string>) =>
    Object.fromEntries([...set].map((k) => [k, annotateRow(idx, input, side, k)]));
  const h = reasonOf("his_only", hisOnly);
  const get = (m: Record<string, { reason: string; his_edge_ids: string; our_types: string }>, id: string, edges: OwnerEdge[] = his) =>
    m[compareKey(edges.find((e) => e.edge_id === id)!)];
  assert.equal(get(h, "h1").reason, "kind_not_in_ours");
  assert.equal(get(h, "h2").reason, "owner_node_unmapped");
  assert.equal(get(h, "h3").reason, "regulation_block");
  assert.equal(get(h, "h4").reason, "article_flagged_308");
  assert.equal(get(h, "h5").reason, "article_differs");
  assert.equal(get(h, "h6").reason, "pair_matched_other_type");
  assert.match(get(h, "h6").our_types, /superseded_by/);
  assert.equal(get(h, "h7"), undefined, "matched: not a difference");
  assert.equal(get(h, "h8").reason, "inverse_of_matched_pair");
  assert.equal(get(h, "h9").reason, "reversed");
  assert.equal(get(h, "h9").his_edge_ids, "h9");
  assert.equal(get(h, "h10").reason, "true_miss");

  const o = reasonOf("ours_only", oursOnly);
  const byType = (type: string, from: string, to: string) => Object.values(o).find((r) => r.type === type && r.from === from && r.to === to);
  assert.equal(byType("cites_article", "LAW-97-2621", "LAW-01-0001")?.reason, "regulation_block", "his same pair carries regulation_ref");
  assert.equal(byType("cites_article", "LAW-97-2621", "OURS:law:gone-law")?.reason, "ours_node_unmapped");
  assert.equal(byType("OURS:IMPLEMENTED_BY", "LAW-01-0001", "LAW-01-0002")?.reason, "pair_matched_other_type", "lines up with his regulated_by");
  assert.equal(byType("amended_by", "LAW-01-0002", "LAW-30-0001")?.reason, "reversed");
  assert.equal(byType("OURS:IMPLEMENTED_BY", "LAW-01-0003", "LAW-01-0001")?.reason, "pair_matched_other_type");
  assert.equal(byType("superseded_by", "LAW-01-0003", "LAW-01-0002")?.reason, "true_miss");
  assert.equal(byType("regulation_of", "LAW-01-0002", "LAW-01-0001")?.reason, "reversed", "his regulated_by is the mirror");
});

test("annotate: kind_not_in_his for our own label with no pair on his side", () => {
  const ours = rollUpEdges(mapOurEdge(bridge, edge("IMPLEMENTED_BY", art(SLUG_LABOR, 3), art(SLUG_REG, 9))));
  const idx = buildIndex([], ours);
  const input = { ownerEdges: [], ourEdges: ours, ownerUnmapped: new Set<string>(), ownerIds: new Set(NODES.map((n) => n.id)) };
  const [k] = expectedDiff(idx).oursOnly;
  assert.equal(annotateRow(idx, input, "ours_only", k).reason, "kind_not_in_his");
});

test("parseCompareTsv reads his TSVs (CRLF on Windows, header checked)", () => {
  assert.deepEqual(parseCompareTsv("type\tfrom\tto\tarticle\r\namended_by\tA\tB\t\r\ncites_article\tC\tD\t2\r\n"), [
    "amended_by\tA\tB\t",
    "cites_article\tC\tD\t2",
  ]);
  assert.deepEqual(parseCompareTsv("type\tfrom\tto\tarticle\n"), []);
  assert.throws(() => parseCompareTsv("a\tb\n"), /header/);
});

test("H4 snapshot comparison: counts by type × origin and whether the watchdog ran", () => {
  const before = { kind: "snapshot" as const, edge_counts: [{ edge_type: "PARENT_LAW", origin: "auto_watchdog", n: 10 }], sync_state: { last_synced_at: "2026-11-19T01:00:00Z" } };
  const after = {
    kind: "snapshot" as const,
    edge_counts: [
      { edge_type: "PARENT_LAW", origin: "auto_watchdog", n: 12 },
      { edge_type: "SIMILAR_TO", origin: "auto_similarity", n: 3 },
    ],
    sync_state: { last_synced_at: "2026-11-19T02:00:00Z" },
  };
  const c = compareSnapshots(before, after);
  assert.deepEqual(c.rows.map((r) => [r.edge_type, r.before, r.after, r.delta]), [["PARENT_LAW", 10, 12, 2], ["SIMILAR_TO", 0, 3, 3]]);
  assert.equal(c.watchdogRanBetween, true);
  assert.equal(compareSnapshots(before, before).watchdogRanBetween, false);
});
