/** ح-3: source position, not printed article number, determines display order. */
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildArticleOrderByRef, seedLaws } from "./seed-library.ts";
import { parseLaws } from "./parsers/parse-laws.ts";

const chapters = [
  {
    number: 1,
    source_index: 30,
    articles: [
      { number: "10", source_index: 40, text: "first-ten", status: "active" },
      { number: "0", source_index: 50, text: "first-zero", status: "active" },
    ],
  },
  {
    number: 2,
    source_index: 0,
    articles: [
      { number: "2", source_index: 10, text: "second-two", status: "active" },
      { number: "10", source_index: 20, text: "second-ten", status: "active" },
    ],
  },
];

test("ح-3 imports the live order helper and ranks inverted chapters by source_index", () => {
  const flat = chapters.flatMap((chapter) => chapter.articles);
  const byRef = buildArticleOrderByRef(chapters);
  const orderIndexes = flat.map((article) => byRef.get(article));

  assert.deepEqual(orderIndexes, [2, 3, 0, 1]);
  assert.deepEqual(flat.map((article) => article.number), ["10", "0", "2", "10"]);
  assert.deepEqual(
    flat
      .map((article, index) => ({ article, index, order: byRef.get(article)! }))
      .sort((left, right) => left.order - right.order || left.index - right.index)
      .map(({ index }) => index),
    [2, 3, 0, 1],
  );
});

test("ح-3 fake client preserves article identities, text, and count while only changing order_index", async () => {
  const data = { laws: [{ corpus_scope: "public_corpus", slug: "h3-source-order", title: "H3 fixture", chapters }] };
  const original = structuredClone(data);
  const seedOnce = async () => {
    const inserted = new Map<string, Record<string, unknown>[]>();
    const fakeClient = {
      async upsert(table: string, rows: Record<string, unknown>[]) {
        inserted.set(table, [...(inserted.get(table) || []), ...rows]);
        return { data: rows, error: null };
      },
      async delete() { return { error: null }; },
    };
    const errors: string[] = [];
    await seedLaws(fakeClient as never, data, false, errors, false);
    assert.deepEqual(errors, []);
    return inserted.get("articles") || [];
  };

  const first = await seedOnce();
  const second = await seedOnce();
  assert.deepEqual(data, original, "seeding must not alter source numbers or text");
  assert.equal(first.length, 4);
  assert.equal(new Set(first.map(({ id }) => String(id))).size, 4);
  assert.deepEqual(first.map(({ text }) => text), ["first-ten", "first-zero", "second-two", "second-ten"]);
  assert.deepEqual(first.map(({ order_index }) => order_index), [2, 3, 0, 1]);
  assert.deepEqual(
    second.map(({ id, text, number, order_index }) => ({ id, text, number, order_index })),
    first.map(({ id, text, number, order_index }) => ({ id, text, number, order_index })),
    "identity/text/count/order must remain deterministic across isolated reseeds",
  );
});

test("ح-3 limited parser fixture emits source_index before the fake seed consumes it", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "nzamy-h3-source-order-"));
  const file = path.join(dir, "h3-order.fixture.md");
  writeFileSync(file, `---
id: TEST-H3-SOURCE-ORDER
title: اختبار ترتيب المصدر
type: نظام
status: active
section_code: "00"
schema_version: "4.0"
---
<!-- CHAPTER_START {"number": 2, "title": "الفصل المبكر"} -->
<!-- ARTICLE_START {"number": "2", "status": "active"} -->
متن اختباري مبكر.
<!-- ARTICLE_END -->
<!-- ARTICLE_START {"number": "10", "status": "active"} -->
متن اختباري مبكر ثان.
<!-- ARTICLE_END -->
<!-- CHAPTER_END -->
<!-- CHAPTER_START {"number": 1, "title": "الفصل المتأخر"} -->
<!-- ARTICLE_START {"number": "10", "status": "active"} -->
متن اختباري متأخر.
<!-- ARTICLE_END -->
<!-- ARTICLE_START {"number": "0", "status": "active"} -->
متن اختباري صفري.
<!-- ARTICLE_END -->
<!-- CHAPTER_END -->
`, "utf8");

  const law = parseLaws(file).laws[0];
  assert.deepEqual(law.chapters.map((chapter) => chapter.number), [2, 1]);
  assert.ok(law.chapters[0].source_index! < law.chapters[1].source_index!);
  const articles = law.chapters.flatMap((chapter) => chapter.articles);
  assert.deepEqual(articles.map((article) => article.number), [2, 10, 10, 0]);
  assert.ok(articles.every((article) => Number.isInteger(article.source_index)));
  assert.deepEqual(
    articles.map((article) => article.source_index),
    [...articles.map((article) => article.source_index)].sort((left, right) => left! - right!),
    "parser output already follows its source markers",
  );
});

test("parser source-index assignments remain absolute marker offsets", () => {
  const parser = readFileSync(new URL("./parsers/parse-laws.ts", import.meta.url), "utf8");
  assert.match(parser, /source_index: chapterMatch\.index/);
  assert.match(parser, /source_index: blockOffset \+ match\.index/);
  assert.match(
    parser,
    /parseArticlesInBlock\(outsideBody, "__orphan__", -1\)/,
    "this narrow ordering patch must not silently replace the existing orphan path",
  );
});
