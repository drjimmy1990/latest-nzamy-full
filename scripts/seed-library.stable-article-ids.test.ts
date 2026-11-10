/**
 * Owner report 2026-11-09: (1) an article's id must not change when its status
 * changes, (2) a decree page numbered 32.1 must load. Synthetic rows only; the
 * client is in-memory and has no network target.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  articleIdentityCore,
  countLawArticleBaseNums,
  decreePageNumber,
  seedDecrees,
  seedLaws,
} from "./seed-library.ts";

type Row = Record<string, any>;

function fakeClient() {
  const inserted = new Map<string, Row[]>();
  return {
    inserted,
    client: {
      async upsert(table: string, rows: Row[]) {
        inserted.set(table, [...(inserted.get(table) || []), ...rows]);
        return { data: rows, error: null };
      },
      async delete() { return { error: null }; },
    },
  };
}

const art = (number: number | string, status: string, extra: Row = {}) => ({
  number,
  number_text: `المادة ${number}`,
  status,
  status_provenance: "explicit",
  status_legacy_identity: status,
  text: `متن اختباري ${number}`,
  ...extra,
});

function law(articles: Row[][]): Row {
  return {
    slug: "test-law",
    title: "نظام اختباري",
    corpus_scope: "public_corpus",
    chapters: articles.map((list, i) => ({ number: i + 1, title: `الباب ${i + 1}`, articles: list })),
  };
}

async function seededArticles(laws: Row[]): Promise<Row[]> {
  const { client, inserted } = fakeClient();
  const errors: string[] = [];
  await seedLaws(client as never, { laws } as Row, false, errors, false);
  assert.deepEqual(errors, []);
  return inserted.get("articles") || [];
}

test("the status is not part of an article id", async () => {
  const rows = await seededArticles([law([[
    art(1, "active"),
    art(2, "amended", { amendments: [{ date: "1440", decree: "م/1", summary: "تعديل" }] }),
    art(3, "repealed"),
    art(4, "added"),
    art(5, "suspended"),
  ]])]);
  assert.deepEqual(rows.map((r) => r.id), [
    "test-law__art-1", "test-law__art-2", "test-law__art-3", "test-law__art-4", "test-law__art-5",
  ]);
  assert.deepEqual(rows.map((r) => r.status), ["active", "amended", "repealed", "added", "suspended"]);
});

test("an amendment or a repeal keeps the same article id and child ids", async () => {
  const before = law([[art(7, "active", { regulations: [{ ref: "اللائحة", text: "نص", sortKey: "1" }] })]]);
  const after = law([[art(7, "amended", {
    regulations: [{ ref: "اللائحة", text: "نص", sortKey: "1" }],
  })]]);
  const repealed = law([[art(7, "repealed", { regulations: [{ ref: "اللائحة", text: "نص", sortKey: "1" }] })]]);

  const run = async (l: Row) => {
    const { client, inserted } = fakeClient();
    const errors: string[] = [];
    await seedLaws(client as never, { laws: [l] } as Row, false, errors, false);
    assert.deepEqual(errors, []);
    return { article: inserted.get("articles")![0], regulation: inserted.get("article_regulations")![0] };
  };
  const a = await run(before);
  const b = await run(after);
  const c = await run(repealed);
  assert.equal(a.article.id, "test-law__art-7");
  assert.equal(b.article.id, a.article.id);
  assert.equal(c.article.id, a.article.id);
  assert.equal(b.regulation.id, a.regulation.id, "the regulation row keeps its id too");
  assert.equal(c.regulation.article_id, a.article.id);
});

test("two articles sharing one number keep their historic status-suffixed ids", async () => {
  const rows = await seededArticles([law([
    [art(10, "repealed"), art(11, "amended")],
    [art(10, "added"), art(10, "active")],
  ])]);
  assert.deepEqual(rows.map((r) => r.id), [
    "test-law__art-10-repealed",
    "test-law__art-11",
    "test-law__art-10-added",
    "test-law__art-10",
  ]);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});

test("a third duplicate with the same number and status still gets a unique id", async () => {
  const rows = await seededArticles([law([[art(9, "repealed"), art(9, "repealed")]])]);
  assert.equal(rows[0].id, "test-law__art-9-repealed");
  assert.match(rows[1].id, /^test-law__art-9-repealed__ch1_i1/);
});

test("articles without a number keep their positional id, without status", async () => {
  const rows = await seededArticles([law([[art(0, "amended"), art(0, "active")]])]);
  assert.deepEqual(rows.map((r) => r.id), ["test-law__art-i0", "test-law__art-i1"]);
});

test("articleIdentityCore and the base-number count", () => {
  assert.equal(articleIdentityCore("5", "amended", false), "__art-5");
  assert.equal(articleIdentityCore("5", "amended", true), "__art-5-amended");
  assert.equal(articleIdentityCore("5", "active", true), "__art-5");
  const counts = countLawArticleBaseNums([{ articles: [{ number: 1 }, { number: 2 }] }, { articles: [{ number: 1 }] }]);
  assert.equal(counts.get("1"), 2);
  assert.equal(counts.get("2"), 1);
});

test("decreePageNumber: the whole part, the printed label, never a fractional integer", () => {
  assert.deepEqual(decreePageNumber(32), { page_number: 32, number_text: null });
  assert.deepEqual(decreePageNumber("7"), { page_number: 7, number_text: null });
  assert.deepEqual(decreePageNumber(32.1), { page_number: 32, number_text: "32.1" });
  assert.deepEqual(decreePageNumber("40.11"), { page_number: 40, number_text: "40.11" });
  assert.deepEqual(decreePageNumber(null), { page_number: 0, number_text: null });
  assert.deepEqual(decreePageNumber(0), { page_number: 0, number_text: null });
  assert.deepEqual(decreePageNumber("ب"), { page_number: 0, number_text: "ب" });
});

test("decree pages 32 and 32.1 load as two rows, in source order, with distinct ids", async () => {
  const { client, inserted } = fakeClient();
  const errors: string[] = [];
  const decree = {
    id: "0b6c7f5e-2a1d-4c3b-9e8f-1a2b3c4d5e6f",
    title: "قرار اختباري",
    type: "cabinet_decision",
    corpus_scope: "public_corpus",
    articles: [
      { number: 32, text: "صفحة 32" },
      { number: 32.1, text: "صفحة 32.1" },
      { number: 33, text: "صفحة 33" },
    ],
  };
  await seedDecrees(client as never, { decrees: [decree] } as Row, false, errors, false);
  assert.deepEqual(errors, []);
  const pages = inserted.get("decree_pages") || [];
  assert.deepEqual(pages.map((p) => [p.page_number, p.number_text, p.order_index]), [
    [32, null, 0],
    [32, "32.1", 1],
    [33, null, 2],
  ]);
  assert.equal(new Set(pages.map((p) => p.id)).size, 3);
  for (const p of pages) assert.ok(Number.isInteger(p.page_number));
});
