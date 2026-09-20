import assert from "node:assert/strict";
import test from "node:test";
import { resolvePrecedentPrincipleIds, seedPrecedents } from "./seed-library.ts";

type Row = Record<string, unknown>;

async function seedFixture(data: Row) {
  const inserted = new Map<string, Row[]>();
  const client = {
    async upsert(table: string, rows: Row[]) {
      inserted.set(table, [...(inserted.get(table) || []), ...rows]);
      return { data: rows, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedPrecedents(client as never, data, false, errors, false);
  assert.deepEqual(errors, []);
  return inserted;
}

test("collection source order changes without changing the seeder's pre-existing id/text/number/FK payload", async () => {
  const data: Row = {
    collections: [{
      id: "source-order-fixture",
      title: "fixture",
      principles: [
        { number: 0, text: "zero first", sub_principles: [{ letter: "أ", text: "paragraph zero" }] },
        { number: 10, text: "ten second", sub_principles: [] },
        { number: 0, text: "zero third", sub_principles: [{ letter: "ب", text: "paragraph repeated zero" }] },
        { number: 2, text: "two fourth", sub_principles: [] },
      ],
    }],
    court_precedents: [{ slug: "standalone-fixture", ruling_number: 10, summary: "standalone text" }],
  };

  const inserted = await seedFixture(data);
  const rows = inserted.get("principles") || [];
  const collectionRows = rows.filter((row) => row.collection_id === "source-order-fixture");
  const sourcePrinciples = ((data.collections as Row[])[0].principles || []) as Row[];
  // This is the pre-78 `principle_number` expression, preserved deliberately
  // in this narrow ordering pass. It exposes (but does not normalize) the
  // separate source-number-0 defect for a later, explicitly authorized pass.
  const pre78Numbers = sourcePrinciples.map((principle) => String(principle.number || ""));
  const pre78OrderIndexes = sourcePrinciples.map((principle) => {
    const numeric = Number(principle.number);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
  });
  assert.equal(collectionRows.length, 4);
  assert.deepEqual(collectionRows.map((row) => row.order_index), [0, 1, 2, 3]);
  assert.notDeepEqual(collectionRows.map((row) => row.order_index), pre78OrderIndexes);
  assert.deepEqual(collectionRows.map((row) => row.principle_number), pre78Numbers);
  assert.deepEqual(collectionRows.map((row) => row.text), ["zero first", "ten second", "zero third", "two fourth"]);

  const legacyIds = [
    "source-order-fixture__pr-0",
    "source-order-fixture__pr-10",
    "source-order-fixture__pr-0",
    "source-order-fixture__pr-2",
    "standalone-fixture",
  ];
  assert.deepEqual(rows.map((row) => row.id), resolvePrecedentPrincipleIds(legacyIds));
  assert.equal(rows[4].order_index, 0, "standalone precedent retains its established pi order");

  const firstTwo = [...collectionRows]
    .sort((a, b) => Number(a.order_index) - Number(b.order_index) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 2)
    .map((row) => row.text);
  assert.deepEqual(firstTwo, ["zero first", "ten second"], "first-N follows source position, not printed numbers");

  const paragraphs = inserted.get("principle_paragraphs") || [];
  for (const paragraph of paragraphs) {
    const parent = collectionRows.find((row) => row.id === paragraph.principle_id);
    assert.ok(parent, "each paragraph keeps its seeded principle FK");
  }
  assert.deepEqual(paragraphs.map((row) => row.text), ["paragraph zero", "paragraph repeated zero"]);
});
