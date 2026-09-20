/** Read-only corpus regression for the 681 silent precedent-row collisions. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { resolvePrecedentPrincipleIds, seedPrecedents } from "./seed-library.ts";
import { historicalParseFile } from "./test-evidence.ts";

const PRECEDENTS = historicalParseFile("baseline-precedents.json", "/Volumes/باك اب المكتبة القانونية/Raw_Vault_Archive/بذر_جاف_تيست_20260918_QUdyGW/precedents.json");
const PRECEDENTS_SHA256 = "935632c91a6a0ebab6d97d839f1fbc0acc867754993a09322f58d889e97d879d";

type Row = Record<string, unknown>;
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const collectionId = (coll: Row) => String(coll.id || coll.slug).substring(0, 100);
const legacyCollectionId = (collId: string, pr: Row, pri: number) =>
  `${collId}__pr-${pr.number ?? pri}`.substring(0, 150);
const legacyStandaloneId = (prec: Row) => String(prec.slug || prec.id).substring(0, 150);

test("projects all 18,983 precedent rows with stable IDs and flags the 13 unseeded folds", async () => {
  const bytes = fs.readFileSync(PRECEDENTS);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), PRECEDENTS_SHA256);
  const data = JSON.parse(bytes.toString("utf8")) as { collections: Row[]; court_precedents: Row[] };
  assert.equal(data.collections.length, 202);
  assert.equal(data.court_precedents.length, 1_272);

  const legacyIds = [
    ...data.collections.flatMap((coll) => {
      const id = collectionId(coll);
      return ((coll.principles || []) as Row[]).map((pr, pri) => legacyCollectionId(id, pr, pri));
    }),
    ...data.court_precedents.map(legacyStandaloneId),
  ];
  assert.equal(legacyIds.length, 18_983);

  const resolvedIds = resolvePrecedentPrincipleIds(legacyIds);
  assert.equal(new Set(resolvedIds).size, 18_983, "every source row has one unique principle id");
  assert.equal(resolvedIds.filter((id) => id.includes("__dup-")).length, 681, "only prior duplicate occurrences get new ids");
  assert.ok(resolvedIds.every((id) => id.length <= 150));

  const byLegacy = new Map<string, number[]>();
  legacyIds.forEach((id, index) => {
    const list = byLegacy.get(id);
    if (list) list.push(index); else byLegacy.set(id, [index]);
  });
  for (const [legacyId, indexes] of byLegacy) {
    const last = indexes[indexes.length - 1];
    assert.equal(resolvedIds[last], legacyId, `legacy id remains on current Map survivor: ${legacyId}`);
    for (const prior of indexes.slice(0, -1)) assert.notEqual(resolvedIds[prior], legacyId);
  }

  const inserted = new Map<string, Row[]>();
  const fakeClient = {
    async upsert() { throw new Error("dry run attempted insertion"); },
    async delete() { throw new Error("dry run attempted deletion"); },
  };
  const exporter = {
    outputDir: "memory-only",
    rowCounts: {} as Record<string, number>,
    write(table: string, rows: Row[]) {
      inserted.set(table, rows);
      this.rowCounts[table] = rows.length;
    },
  };
  const errors: string[] = [];
  await seedPrecedents(fakeClient as never, data as unknown as Row, true, errors, false, exporter);
  assert.deepEqual(errors, []);
  const privateRows = inserted.get("private_precedent_details") || [];
  assert.equal(privateRows.length, 13, "all unclassified source folds get audit-only rows");
  for (const row of privateRows) {
    const locator = String(row.source_locator).match(/^collections\[(\d+)\]\.principles\[(\d+)\]$/);
    assert.ok(locator, "this corpus has no standalone unclassified fold");
    const source = ((data.collections[Number(locator[1])].principles || []) as Row[])[Number(locator[2])];
    assert.equal(row.body, source.unparsed_details, "private audit body preserves the source field exactly");
    assert.equal(row.body_sha256, sha256(String(source.unparsed_details)));
    assert.equal(row.review_state, "unverified");
  }

  const rows = inserted.get("principles") || [];
  assert.equal(rows.length, 18_983);
  assert.equal(new Set(rows.map((row) => String(row.id))).size, 18_983);
  const collectionRows = inserted.get("judicial_collections") || [];
  assert.equal(collectionRows.length, 209, "202 source collections + 7 generated standalone groups");
  const rowsById = new Map(rows.map((row) => [String(row.id), row]));
  for (const row of privateRows) {
    const publicRow = rowsById.get(String(row.principle_id));
    assert.ok(publicRow, "private audit row links to the resolved public principle id");
    assert.equal(publicRow.collection_id, row.collection_id);
    assert.ok(!JSON.stringify(publicRow).includes(String(row.body)), "unverified body stays outside public principle columns");
  }

  let cursor = 0;
  const expectedParagraphs = new Map<string, Row[]>();
  for (const coll of data.collections) {
    const id = collectionId(coll);
    for (const [pri, pr] of ((coll.principles || []) as Row[]).entries()) {
      const prId = resolvedIds[cursor++];
      const row = rowsById.get(prId);
      assert.ok(row, `missing seeded collection principle ${prId}`);
      assert.equal(row.collection_id, id);
      assert.equal(row.principle_number, String(pr.number || "").substring(0, 50));
      assert.equal(sha256(String(row.text || "")), sha256(String(pr.text || "")), `text changed: ${prId}`);
      assert.equal(row.order_index, pri, `source order changed: ${prId}`);
      expectedParagraphs.set(prId, (pr.sub_principles || []) as Row[]);
    }
  }
  for (const prec of data.court_precedents) {
    const prId = resolvedIds[cursor++];
    const row = rowsById.get(prId);
    assert.ok(row, `missing seeded standalone precedent ${prId}`);
    assert.equal(row.principle_number, String(prec.ruling_number || "").substring(0, 50));
    assert.equal(sha256(String(row.text || "")), sha256(String(prec.summary || prec.preamble || "")), `text changed: ${prId}`);
  }
  assert.equal(cursor, 18_983);

  const paragraphs = inserted.get("principle_paragraphs") || [];
  const expectedParagraphCount = [...expectedParagraphs.values()].reduce((total, subs) => total + subs.length, 0);
  assert.equal(paragraphs.length, expectedParagraphCount);
  const actualByParent = new Map<string, Row[]>();
  for (const paragraph of paragraphs) {
    const parent = String(paragraph.principle_id);
    assert.ok(rowsById.has(parent), `paragraph points to a seeded principle: ${parent}`);
    const list = actualByParent.get(parent);
    if (list) list.push(paragraph); else actualByParent.set(parent, [paragraph]);
  }
  for (const [prId, expected] of expectedParagraphs) {
    const actual = (actualByParent.get(prId) || []).sort((a, b) => Number(a.order_index) - Number(b.order_index));
    assert.equal(actual.length, expected.length, `paragraph count: ${prId}`);
    for (let i = 0; i < expected.length; i++) {
      assert.equal(actual[i].letter, expected[i].letter || "");
      assert.equal(actual[i].text, expected[i].text || "");
      assert.deepEqual(actual[i].keywords, expected[i].keywords || []);
      assert.equal(actual[i].order_index, i);
    }
  }
});
