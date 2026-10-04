/**
 * Two-level chapters in the seeder: `level` / `parent_chapter_id` on chapter
 * rows, mapped through the law's own source_index → chapter UUID map.
 *
 * No DB I/O: seedLaws runs against an in-memory fake client. Run:
 *   npx tsx --test scripts/seed-library.chapter-levels.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveChapterHierarchy, orderChapterRowsParentsFirst, seedLaws } from "./seed-library.ts";
import { parseLaws } from "./parsers/parse-laws.ts";

type Row = Record<string, unknown>;

test("باب › فصل: each level-2 chapter gets the resolved id of the level-1 chapter at its parent_source_index", () => {
  const chapters = [
    { source_index: 100, level: 1 },
    { source_index: 200, level: 2, parent_source_index: 100 },
    { source_index: 300, level: 2, parent_source_index: 100 },
    { source_index: 400, level: 1 },
    { source_index: 500, level: 2, parent_source_index: 400 },
  ];
  const ids = ["a", "b", "c", "d", "e"];
  assert.deepEqual(resolveChapterHierarchy(chapters, ids), [
    { level: 1, parent_chapter_id: null },
    { level: 2, parent_chapter_id: "a" },
    { level: 2, parent_chapter_id: "a" },
    { level: 1, parent_chapter_id: null },
    { level: 2, parent_chapter_id: "d" },
  ]);
});

test("never guesses a parent", () => {
  const ids = ["p", "x", "y", "z", "w", "v"];
  const result = resolveChapterHierarchy(
    [
      { source_index: 10, level: 1 },
      { source_index: 20, level: 2 },                           // orphan: no parent_source_index
      { source_index: 30, level: 2, parent_source_index: 999 },   // dangling
      { source_index: 40, level: 2, parent_source_index: 30 },    // parent is level 2
      { source_index: 50, level: 2, parent_source_index: 50 },    // itself
      { level: 1 },                                                // __orphan__: no source_index
    ],
    ids,
  );
  assert.deepEqual(result.map((r) => r.parent_chapter_id), [null, null, null, null, null, null]);
  assert.deepEqual(result.map((r) => r.level), [1, 2, 2, 2, 2, 1]);

  // Two chapters at one source position: ambiguous → no parent.
  const ambiguous = resolveChapterHierarchy(
    [{ source_index: 0, level: 1 }, { source_index: 0, level: 1 }, { source_index: 5, level: 2, parent_source_index: 0 }],
    ["a", "b", "c"],
  );
  assert.equal(ambiguous[2].parent_chapter_id, null);
});

test("parse output from before `level` existed → level 1 and no parent everywhere; level as string accepted", () => {
  assert.deepEqual(
    resolveChapterHierarchy([{ source_index: 0 }, { source_index: 9 }, {}], ["a", "b", "c"]),
    [{ level: 1, parent_chapter_id: null }, { level: 1, parent_chapter_id: null }, { level: 1, parent_chapter_id: null }],
  );
  assert.deepEqual(
    resolveChapterHierarchy([{ source_index: 0, level: "1" }, { source_index: 9, level: "2", parent_source_index: 0 }], ["a", "b"]),
    [{ level: 1, parent_chapter_id: null }, { level: 2, parent_chapter_id: "a" }],
  );
  assert.throws(() => resolveChapterHierarchy([{}], []), /1 chapters but 0 ids/);
});

test("rows are upserted parents first, stable within each group", () => {
  const rows = [
    { id: "c1", parent_chapter_id: "p1" },
    { id: "p1", parent_chapter_id: null },
    { id: "c2", parent_chapter_id: "p1" },
    { id: "p2", parent_chapter_id: null },
    { id: "legacy" },
  ];
  assert.deepEqual(orderChapterRowsParentsFirst(rows).map((r) => r.id), ["p1", "p2", "legacy", "c1", "c2"]);
});

test("parser → fake seed: level and parent_chapter_id reach the chapter rows; articles keep their chapter", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-seed-chapter-levels-"));
  const file = path.join(dir, "seed-levels.fixture.md");
  const chapter = (meta: Row, inner = "") => `<!-- CHAPTER_START ${JSON.stringify(meta)} -->\n${inner}<!-- CHAPTER_END -->\n`;
  const article = (n: number) =>
    `<!-- ARTICLE_START {"number": "${n}", "number_text": "المادة ${n}", "status": "active"} -->\nنص اختباري ${n}.\n<!-- ARTICLE_END -->\n`;
  fs.writeFileSync(file, `---
id: TEST-SEED-LEVELS
slug: seed-levels-fixture
title: نظام اختباري للمستويات
type: نظام
status: active
section_code: "00"
schema_version: "4.0"
---
${chapter({ number: 1, title: "الباب الأول", level: 1 })}${chapter({ number: 1, title: "الفصل الأول", level: 2 }, article(1))}${chapter({ number: 2, title: "الفصل الثاني", level: 2 }, article(2))}${chapter({ number: 2, title: "الباب الثاني", level: 1 }, article(3))}`, "utf8");

  const parsed = parseLaws(file);
  const before = structuredClone(parsed);
  const inserted = new Map<string, Row[]>();
  const fakeClient = {
    async upsert(table: string, rows: Row[]) {
      inserted.set(table, [...(inserted.get(table) || []), ...rows]);
      return { data: rows, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedLaws(fakeClient as never, parsed as unknown as Row, false, errors, false);
  assert.deepEqual(errors, []);
  assert.deepEqual(parsed, before, "seeding must not alter the parse output");

  const chapterRows = inserted.get("chapters") || [];
  assert.equal(chapterRows.length, 4);
  const byTitle = new Map(chapterRows.map((row) => [String(row.title), row]));
  const bab1 = byTitle.get("الباب الأول")!;
  const bab2 = byTitle.get("الباب الثاني")!;
  assert.equal(bab1.level, 1);
  assert.equal(bab1.parent_chapter_id, null);
  assert.equal(bab2.level, 1);
  assert.equal(byTitle.get("الفصل الأول")!.level, 2);
  assert.equal(byTitle.get("الفصل الأول")!.parent_chapter_id, bab1.id);
  assert.equal(byTitle.get("الفصل الثاني")!.parent_chapter_id, bab1.id);

  // Sent parents first: every referenced parent precedes its child in the stream.
  const position = new Map(chapterRows.map((row, i) => [row.id, i]));
  for (const row of chapterRows) {
    if (row.parent_chapter_id != null) assert.ok(position.get(row.parent_chapter_id)! < position.get(row.id)!);
  }

  // Articles still hang off their own (level-2 / level-1) chapter rows.
  const articleRows = inserted.get("articles") || [];
  const chapterTitleById = new Map(chapterRows.map((row) => [row.id, row.title]));
  assert.deepEqual(
    articleRows.map((row) => [row.number, chapterTitleById.get(row.chapter_id)]),
    [["1", "الفصل الأول"], ["2", "الفصل الثاني"], ["3", "الباب الثاني"]],
  );
});
