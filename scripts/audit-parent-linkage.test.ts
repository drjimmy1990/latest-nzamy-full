import assert from "node:assert/strict";
import test from "node:test";
import { auditParentLinkage, type LinkSource } from "./audit-parent-linkage";

const source = (meta: Record<string, unknown>): LinkSource => ({
  filepath: "01_المكتبة_القانونية/أنظمة ولوائح/child.md", meta,
});
const records = (status = "active", parentId: string | null = "LAW-01-0001") => [
  { instrument_id: "LAW-01-0001", filepath: "01_المكتبة_القانونية/أنظمة ولوائح/parent.md", type: "نظام" },
  { instrument_id: "LAW-01-0002", filepath: "01_المكتبة_القانونية/أنظمة ولوائح/child.md",
    parent_id: parentId, status, type: "لائحة تنفيذية" },
];

test("a verified parent pointer and matching registry mirror are clean", () => {
  const result = auditParentLinkage([source({ type: "لائحة تنفيذية", status: "active",
    parent_law_id: "LAW-01-0001", parent_law: "نظام مثال" })], records(), true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.parent_ids, 1);
});

test("missing targets and missing active registry mirrors fail independently", () => {
  const result = auditParentLinkage([source({ status: "active",
    parent_law_id: "LAW-99-9999" })], records("active", null), true);
  assert.equal(result.counts.parent_target_missing, 1);
  assert.equal(result.counts.parent_id_not_mirrored, 1);
});

test("archival contradiction is not silently fixed by copying the parent", () => {
  const result = auditParentLinkage([source({ status: "active",
    parent_law_id: "LAW-01-0001" })], records("superseded_duplicate", null), true);
  assert.equal(result.counts.archival_parent_relationship_unresolved, 1);
  assert.equal(result.counts.source_registry_status_conflict, 1);
});

test("legacy names and byte-divergent registry mirrors remain visible", () => {
  const result = auditParentLinkage([source({ parent_law_title: "نظام مثال" })],
    records(), false);
  assert.equal(result.counts.legacy_parent_name_alias, 1);
  assert.equal(result.counts.registry_mirrors_differ, 1);
});

test("an exact declared id disambiguates duplicate paths but archival contradictions still fail", () => {
  const candidates = [
    ...records(),
    { instrument_id: "LAW-01-9999", filepath: source({}).filepath,
      parent_id: null, status: "superseded_duplicate", type: "قرار" },
  ];
  const result = auditParentLinkage([source({ id: "LAW-01-9999", status: "active",
    parent_law_id: "LAW-01-0001" })], candidates, true);
  assert.equal(result.counts.duplicate_registry_filepath, undefined);
  assert.equal(result.counts.source_registry_status_conflict, 1);
  assert.equal(result.counts.archival_parent_relationship_unresolved, 1);
});

test("an exact active source id safely selects the canonical row beside an archival alias", () => {
  const candidates = [
    ...records(),
    { instrument_id: "LAW-01-9999", filepath: source({}).filepath,
      parent_id: null, status: "superseded_duplicate", type: "قرار" },
  ];
  const result = auditParentLinkage([source({ id: "LAW-01-0002", status: "active",
    parent_law_id: "LAW-01-0001" })], candidates, true);
  assert.deepEqual(result.issues, []);
});

test("stale registry filepath uses a unique declared child id but flags the drift", () => {
  const rows = records();
  rows[1].filepath = "01_المكتبة_القانونية/أنظمة ولوائح/old-child.md";
  const result = auditParentLinkage([source({ id: "LAW-01-0002", status: "active",
    parent_law_id: "LAW-01-0001" })], rows, true);
  assert.equal(result.counts.registry_filepath_stale_id_fallback, 1);
  assert.equal(result.counts.parent_id_not_mirrored, undefined);
});

test("legacy system_id can safely recover a unique child after its path moves", () => {
  const rows = records();
  rows[1].filepath = "01_المكتبة_القانونية/old-child.md";
  const result = auditParentLinkage([source({ system_id: "LAW-01-0002", status: "active",
    parent_law_id: "LAW-01-0001" })], rows, true);
  assert.equal(result.counts.registry_filepath_stale_id_fallback, 1);
  assert.equal(result.counts.child_not_in_registry_by_filepath, undefined);
});

test("Windows separators in a registry path match the portable corpus path", () => {
  const rows = records();
  rows[1].filepath = rows[1].filepath!.replaceAll("/", "\\");
  const result = auditParentLinkage([source({ status: "active",
    parent_law_id: "LAW-01-0001" })], rows, true);
  assert.equal(result.counts.child_not_in_registry_by_filepath, undefined);
  assert.equal(result.counts.registry_filepath_stale_id_fallback, undefined);
});

test("nested-only parent ID is counted and cannot silently disappear", () => {
  const result = auditParentLinkage([source({ metadata: {
    parent_law_id: "LAW-99-9999", enabling_article: "المادة الأولى",
  } })], records(), true);
  assert.equal(result.relevant_files, 1);
  assert.equal(result.parent_ids, 0);
  assert.equal(result.counts.nested_parent_id_not_top_level, 1);
  assert.equal(result.counts.nested_parent_target_missing, 1);
  assert.equal(result.counts.nested_enabling_article_not_top_level, 1);
});

test("conflicting top-level and nested parent names plus YAML warnings fail", () => {
  const item = source({ parent_law: "نظام ألف", metadata: { parent_law: "نظام باء" } });
  item.warnings = ["malformed YAML"];
  const result = auditParentLinkage([item], records(), true);
  assert.equal(result.counts.parent_name_conflict, 1);
  assert.equal(result.counts.frontmatter_warning, 1);
});

test("a malformed YAML warning survives even when rescue parsing loses the parent keys", () => {
  const item = source({});
  item.warnings = ["malformed YAML"];
  const result = auditParentLinkage([item], records(), true);
  assert.equal(result.relevant_files, 1);
  assert.equal(result.counts.frontmatter_warning, 1);
});

test("missing source status with an archival registry row requires review", () => {
  const result = auditParentLinkage([source({ parent_law_id: "LAW-01-0001" })],
    records("archived", null), true);
  assert.equal(result.counts.source_status_missing_while_registry_archival, 1);
  assert.equal(result.counts.archival_parent_relationship_unresolved, 1);
});
