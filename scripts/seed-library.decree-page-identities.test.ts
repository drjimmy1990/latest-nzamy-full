/** Read-only corpus regression for silent decree page/material identity loss. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { unambiguousIdentityFixtures } from "./corpus-scope-test-fixtures";
import { resolveDecreePageIds, seedDecrees, toUuid } from "./seed-library.ts";
import { historicalParseFile } from "./test-evidence.ts";

// Immutable external evidence; deliberately non-portable without this archive.
const DECREES = historicalParseFile("baseline-decrees.json", "/Volumes/باك اب المكتبة القانونية/Raw_Vault_Archive/بذر_جاف_تيست_20260918_QUdyGW/decrees.json");
const DECREES_SHA256 = "8ebf45e490b647dfd822c84174b7d04b19cd73c81a5406e88e9d9531383a5097";

type Row = Record<string, any>;
type ExpectedPage = { decree: Row; decreeId: string; article: Row; legacyId: string; id?: string };
const sha256 = (value: crypto.BinaryLike) => crypto.createHash("sha256").update(value).digest("hex");

test("seeds all 7,711 decree page occurrences with stable identities, content, and parent links", async () => {
  const bytes = fs.readFileSync(DECREES);
  assert.equal(sha256(bytes), DECREES_SHA256);
  const data = JSON.parse(bytes.toString("utf8")) as { decrees: Row[] };

  const expectedPages: ExpectedPage[] = [];
  const expectedDecrees: Array<{ decree: Row; id: string }> = [];
  for (const decree of data.decrees) {
    const rawId = String(decree.id || decree.slug);
    if (rawId.includes("EXTRACTION_REPORT")) continue;
    const decreeId = toUuid(rawId);
    expectedDecrees.push({ decree, id: decreeId });
    for (let pi = 0; pi < (decree.articles || []).length; pi++) {
      const article = decree.articles[pi] as Row;
      expectedPages.push({
        decree,
        decreeId,
        article,
        legacyId: toUuid(`${decreeId}__pg-${article.number ?? pi}`),
      });
    }
  }
  assert.equal(expectedDecrees.length, 3_318);
  assert.equal(expectedPages.length, 7_711);

  const ids = resolveDecreePageIds(expectedPages.map(({ legacyId }) => legacyId));
  ids.forEach((id, index) => { expectedPages[index].id = id; });
  assert.equal(new Set(ids).size, 7_711);
  const groups = new Map<string, ExpectedPage[]>();
  for (const page of expectedPages) groups.set(page.legacyId, [...(groups.get(page.legacyId) || []), page]);
  const collisions = [...groups.values()].filter((group) => group.length > 1);
  assert.equal(collisions.length, 271);
  assert.equal(collisions.reduce((sum, group) => sum + group.length - 1, 0), 309);
  assert.equal(collisions.filter((group) => new Set(group.map(({ article }) => String(article.text || ""))).size > 1).length, 269);
  for (const group of collisions) {
    const last = group.at(-1)!;
    assert.equal(last.id, last.legacyId, "last historical Map survivor keeps its UUID");
    for (const earlier of group.slice(0, -1)) assert.notEqual(earlier.id, earlier.legacyId);
  }

  const fixtures = unambiguousIdentityFixtures(data.decrees);
  const fixtureIds = new Set(fixtures.map(row => String(row.id || row.slug)));
  const selectedPages = expectedPages.filter(row => fixtureIds.has(String(row.decree.id || row.decree.slug)));
  const selectedDecrees = expectedDecrees.filter(row => fixtureIds.has(String(row.decree.id || row.decree.slug)));

  const inserted = new Map<string, Row[]>();
  const fakeClient = {
    async upsert(table: string, rows: Row[]) {
      inserted.set(table, [...(inserted.get(table) || []), ...rows]);
      return { data: rows, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedDecrees(fakeClient as never, { decrees: fixtures } as Row, false, errors, false);
  assert.deepEqual(errors, []);

  const decreeRows = inserted.get("decrees_circulars") || [];
  const pageRows = inserted.get("decree_pages") || [];
  assert.equal(decreeRows.length, selectedDecrees.length);
  assert.equal(pageRows.length, selectedPages.length);
  assert.equal(new Set(decreeRows.map(({ id }) => String(id))).size, selectedDecrees.length);
  assert.equal(new Set(pageRows.map(({ id }) => String(id))).size, selectedPages.length);
  const decreesById = new Map(decreeRows.map((row) => [String(row.id), row]));
  const pagesById = new Map(pageRows.map((row) => [String(row.id), row]));

  for (const expected of selectedDecrees) {
    const row = decreesById.get(expected.id);
    assert.ok(row, `missing decree parent ${expected.id}`);
    assert.equal(row.title, expected.decree.title || "");
    assert.equal(row.ref, expected.decree.ref || "");
  }
  for (const expected of selectedPages) {
    const row = pagesById.get(expected.id!);
    assert.ok(row, `missing decree page occurrence ${expected.id}`);
    assert.equal(row.decree_id, expected.decreeId, `page retains its exact decree parent: ${expected.id}`);
    assert.ok(decreesById.has(String(row.decree_id)));
    assert.equal(row.page_number, expected.article.number || 0);
    assert.equal(sha256(String(row.content || "")), sha256(String(expected.article.text || "")), `content changed: ${expected.id}`);
  }
});
