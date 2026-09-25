import assert from "node:assert/strict";
import test from "node:test";
import {
  articleNumberValue,
  orderLawChapters,
  ORPHAN_CHAPTER_LABEL,
  UNGROUPED_CHAPTER_LABEL,
} from "./_order-chapters.ts";

interface Row { id: string; chapter_id: string | null; number: number | string | null }

/**
 * Real (chapter, number) pairs from the self-hosted corpus (2026-09-25), in
 * the route's query order (articles by order_index, id; chapters by
 * order_index, id). Only the first two articles of each chapter are kept:
 * a subsequence of the query order, so every chapter's first position keeps
 * its relative rank. Chapter titles are abbreviated; index 0 is the orphan.
 */
function fixture(chapterCount: number, pairs: string) {
  const chapters = Array.from({ length: chapterCount }, (_, i) => ({
    id: `c${i}`,
    title: i === 0 ? "__orphan__" : `باب ${i}`,
  }));
  const articles: Row[] = pairs.split(" ").map((p, i) => {
    const [c, n] = p.split(":");
    return { id: `a${i}`, chapter_id: `c${c}`, number: Number(n) };
  });
  return { chapters, articles };
}

// sharia-pleading-law-qadha-edition: 15 chapters.
const SHARIA_PLEADING = fixture(15, [
  "0:48 1:1 0:60 1:2 2:24 2:25 3:41 3:42 4:49 4:50 5:61 5:62 6:75 6:76 7:86 7:87 8:94 8:95 9:101",
  "9:102 10:159 10:160 11:176 11:177 12:205 12:206 13:218 13:219 14:240 14:241",
].join(" "));

// civil-transactions-law: 93 chapters.
const CIVIL_TRANSACTIONS = fixture(93, [
  "0:1 0:2 16:3 16:4 43:19 43:20 68:25 68:26 87:28 87:29 6:30 6:31 64:87 64:88 71:94 71:95 90:104",
  "90:105 19:115 19:116 54:118 54:119 1:120 1:121 35:129 35:130 73:136 73:137 79:144 4:145 4:146",
  "28:150 28:151 58:159 85:160 20:161 20:162 3:164 3:165 15:170 15:171 57:181 57:182 61:191 61:192",
  "74:196 49:197 49:198 12:204 12:205 23:210 23:211 47:212 47:213 24:219 24:220 41:222 41:223",
  "76:238 76:239 40:248 40:249 67:255 67:256 84:259 84:260 34:266 34:267 30:280 26:281 26:282",
  "52:290 52:291 65:292 65:293 27:294 27:295 33:307 2:308 2:309 51:353 51:354 70:356 70:357 92:359",
  "92:360 7:361 7:362 50:366 50:367 14:372 14:373 63:376 63:377 78:382 78:383 86:391 86:392 91:403",
  "91:404 22:407 22:408 9:416 9:417 59:429 59:430 72:440 72:441 88:443 88:444 25:451 25:452 38:454",
  "38:455 66:459 66:460 53:461 53:462 21:463 21:464 62:468 62:469 75:473 75:474 89:475 89:476",
  "29:479 42:480 42:481 11:486 11:487 56:498 56:499 69:502 69:503 77:506 77:507 17:509 17:510",
  "45:512 45:513 80:515 80:516 83:517 83:518 81:528 5:529 5:530 8:534 8:535 48:544 48:545 18:550",
  "18:551 31:552 31:553 60:561 60:562 55:566 55:567 13:571 13:572 82:578 82:579 10:585 10:586",
  "44:603 44:604 37:607 37:608 32:679 32:680 46:698 46:699 36:719 36:720 39:721",
].join(" "));

// commercial-papers-law: 24 chapters.
const COMMERCIAL_PAPERS = fixture(24, [
  "0:1 0:2 2:12 2:13 5:21 5:22 9:29 9:30 11:35 11:36 13:38 13:39 4:42 4:43 8:48 8:49 15:68 15:69",
  "17:77 17:78 19:83 21:84 21:85 3:87 3:88 7:91 7:92 1:98 1:99 6:100 10:101 12:102 12:103 14:108",
  "14:109 16:110 18:111 18:112 20:115 20:116 22:117 23:118 23:119",
].join(" "));

// labor-law-qadha: 22 chapters; chapter 2 has no article in the corpus.
const LABOR_QADHA = fixture(22, [
  "0:187 1:1 1:2 0:212 3:23 3:24 4:33 4:34 5:43 5:44 6:51 6:52 8:91 8:92 7:100 7:101 9:111 9:112",
  "10:121 10:122 11:123 11:124 13:129 13:130 12:135 12:136 14:152 14:153 15:164 15:165 16:171",
  "16:172 17:188 17:189 18:197 18:198 19:213 19:214 20:232 20:233 21:247 21:248",
].join(" "));

function firstNumbers(order: { articles: Row[] }[]): number[] {
  return order.map((g) => Number(g.articles[0].number));
}

function descents(seq: number[]): number {
  let d = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) d++;
  return d;
}

function assertNoArticleLost(input: { articles: Row[] }, order: { articles: Row[] }[]) {
  const out = order.flatMap((g) => g.articles.map((a) => a.id));
  assert.equal(out.length, input.articles.length, "article count must be preserved");
  assert.deepEqual([...out].sort(), input.articles.map((a) => a.id).sort(), "every article exactly once");
}

for (const [name, law] of [
  ["civil-transactions-law", CIVIL_TRANSACTIONS],
  ["commercial-papers-law", COMMERCIAL_PAPERS],
  ["sharia-pleading-law-qadha-edition", SHARIA_PLEADING],
  ["labor-law-qadha", LABOR_QADHA],
] as const) {
  test(`${name}: chapters come out in article order, no article lost`, () => {
    const order = orderLawChapters(law.chapters, law.articles);
    assertNoArticleLost(law, order);
    assert.equal(
      descents(firstNumbers(order)),
      0,
      `first-article numbers must ascend: ${firstNumbers(order).join(",")}`,
    );
    assert.ok(order.every((g) => g.title !== "__orphan__"), "the sentinel never reaches the response");
    assert.equal(order.filter((g) => g.title === ORPHAN_CHAPTER_LABEL).length, 1);
  });
}

test("the query order was scrambled (the regression this fixes)", () => {
  // chapters.order_index is a per-level ordinal: in query order the civil
  // transactions law opened on the chapter holding article 120.
  const firstOf = new Map<string, number>();
  for (const a of CIVIL_TRANSACTIONS.articles) {
    if (!firstOf.has(a.chapter_id!)) firstOf.set(a.chapter_id!, Number(a.number));
  }
  const queryOrderFirsts = CIVIL_TRANSACTIONS.chapters.slice(1).map((c) => firstOf.get(c.id)!);
  assert.deepEqual(queryOrderFirsts.slice(0, 3), [120, 308, 164]);
  assert.ok(descents(queryOrderFirsts) > 40);
});

test("a leading orphan (the law's opening articles) is placed first", () => {
  const civil = orderLawChapters(CIVIL_TRANSACTIONS.chapters, CIVIL_TRANSACTIONS.articles);
  assert.equal(civil[0].title, ORPHAN_CHAPTER_LABEL);
  assert.deepEqual(firstNumbers(civil).slice(0, 4), [1, 3, 19, 25]);
  const papers = orderLawChapters(COMMERCIAL_PAPERS.chapters, COMMERCIAL_PAPERS.articles);
  assert.equal(papers[0].title, ORPHAN_CHAPTER_LABEL);
  assert.deepEqual(firstNumbers(papers).slice(0, 3), [1, 12, 21]);
});

test("a scattered orphan whose articles got the first order_index values is placed by number", () => {
  // sharia-pleading: article 48 is at order_index 0, article 1 at 1. Placing
  // the orphan by position alone would open the law on article 48.
  const order = orderLawChapters(SHARIA_PLEADING.chapters, SHARIA_PLEADING.articles);
  assert.deepEqual(firstNumbers(order).slice(0, 5), [1, 24, 41, 48, 49]);
  assert.equal(order[3].title, ORPHAN_CHAPTER_LABEL);
  // Within a chapter, articles keep document order.
  assert.deepEqual(order[3].articles.map((a) => a.number), [48, 60]);
});

test("labor-law-qadha: the empty chapter is dropped, the rest kept", () => {
  const order = orderLawChapters(LABOR_QADHA.chapters, LABOR_QADHA.articles);
  assert.equal(order.length, LABOR_QADHA.chapters.length - 1);
  assert.ok(!order.some((g) => g.title === "باب 2"), "chapter 2 has no article in the corpus");
  assert.ok(order.every((g) => g.articles.length > 0));
});

test("empty real headings with every article in the orphan -> one chapter, nothing lost", () => {
  // The shape of transport-and-vehicle-services-requirements-1441: 8 empty
  // headings, then 2 articles under the orphan.
  const chapters = [
    { id: "o", title: "__orphan__" },
    ...Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, title: `الباب ${i + 1}` })),
  ];
  const articles: Row[] = [
    { id: "a1", chapter_id: "o", number: 1 },
    { id: "a2", chapter_id: "o", number: 2 },
  ];
  const order = orderLawChapters(chapters, articles);
  assert.deepEqual(order.map((g) => g.title), [ORPHAN_CHAPTER_LABEL]);
  assertNoArticleLost({ articles }, order);
});

test("a law with no articles keeps its headings, relabelled, in query order", () => {
  const order = orderLawChapters(
    [{ id: "o", title: "__orphan__" }, { id: "x", title: "الباب الأول" }],
    [] as Row[],
  );
  assert.deepEqual(order, [
    { title: ORPHAN_CHAPTER_LABEL, articles: [] },
    { title: "الباب الأول", articles: [] },
  ]);
});

test("articles with no or an unknown chapter_id are kept under «أحكام عامة», placed by position", () => {
  const articles: Row[] = [
    { id: "a1", chapter_id: null, number: 1 },
    { id: "a2", chapter_id: "x", number: 2 },
    { id: "a3", chapter_id: "gone", number: 3 },
  ];
  const order = orderLawChapters([{ id: "x", title: "الباب الأول" }], articles);
  assert.deepEqual(order.map((g) => g.title), [UNGROUPED_CHAPTER_LABEL, "الباب الأول"]);
  assert.deepEqual(order[0].articles.map((a) => a.id), ["a1", "a3"]);
  assertNoArticleLost({ articles }, order);
  // No chapters at all: the whole law is one «أحكام عامة» group (the old fallback).
  const none = orderLawChapters([], articles);
  assert.deepEqual(none.map((g) => g.title), [UNGROUPED_CHAPTER_LABEL]);
  assertNoArticleLost({ articles }, none);
});

test("when the real chapters do not ascend by number, the orphan keeps its position", () => {
  const chapters = [
    { id: "o", title: "__orphan__" },
    { id: "p", title: "ب" },
    { id: "q", title: "ج" },
  ];
  // Real chapters' first numbers go 10 then 5: there is no numeric scale.
  const articles: Row[] = [
    { id: "a1", chapter_id: "p", number: 10 },
    { id: "a2", chapter_id: "o", number: 7 },
    { id: "a3", chapter_id: "q", number: 5 },
  ];
  const order = orderLawChapters(chapters, articles);
  assert.deepEqual(order.map((g) => g.title), ["ب", ORPHAN_CHAPTER_LABEL, "ج"]);
});

test("an orphan with no numeric article number is placed by position", () => {
  const chapters = [
    { id: "o", title: "__orphan__" },
    { id: "p", title: "ب" },
    { id: "q", title: "ج" },
  ];
  const articles: Row[] = [
    { id: "a1", chapter_id: "p", number: 1 },
    { id: "a2", chapter_id: "o", number: null },
    { id: "a3", chapter_id: "q", number: 2 },
  ];
  assert.deepEqual(
    orderLawChapters(chapters, articles).map((g) => g.title),
    ["ب", ORPHAN_CHAPTER_LABEL, "ج"],
  );
});

test("articleNumberValue: null and non-numeric are NaN, never 0", () => {
  assert.ok(Number.isNaN(articleNumberValue(null)));
  assert.ok(Number.isNaN(articleNumberValue(undefined)));
  assert.ok(Number.isNaN(articleNumberValue("")));
  assert.ok(Number.isNaN(articleNumberValue("الأولى")));
  assert.equal(articleNumberValue(0), 0);
  assert.equal(articleNumberValue("12"), 12);
  assert.equal(articleNumberValue(3.5), 3.5);
});
