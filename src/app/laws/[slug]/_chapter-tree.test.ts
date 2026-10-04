/**
 * _chapter-tree.test.ts — two-level chapters in the reader.
 * Run: npm run test:unit   (or, from this folder: node --test _chapter-tree.test.ts)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChapterTree, flattenChapterTree } from "./_chapter-tree.ts";

interface Ch {
  id?: string;
  level?: 1 | 2;
  parentChapterId?: string | null;
  title: string;
  articles: string[];
}

const view = (chapters: Ch[]) =>
  buildChapterTree(chapters).map((node) => ({
    title: node.chapter.title,
    children: node.children.map((c) => c.chapter.title),
  }));

const articlesInOrder = (chapters: Ch[]) =>
  flattenChapterTree(buildChapterTree(chapters)).flatMap((c) => c.articles);

test("باب › فصل: each فصل is shown under its باب; a باب without articles is a group header", () => {
  const chapters: Ch[] = [
    { id: "b1", level: 1, title: "الباب الأول", articles: [] },
    { id: "f1", level: 2, parentChapterId: "b1", title: "الفصل الأول", articles: ["1", "2"] },
    { id: "f2", level: 2, parentChapterId: "b1", title: "الفصل الثاني", articles: ["3"] },
    { id: "b2", level: 1, title: "الباب الثاني", articles: [] },
    { id: "f3", level: 2, parentChapterId: "b2", title: "الفصل الأول", articles: ["4"] },
  ];
  assert.deepEqual(view(chapters), [
    { title: "الباب الأول", children: ["الفصل الأول", "الفصل الثاني"] },
    { title: "الباب الثاني", children: ["الفصل الأول"] },
  ]);
  assert.deepEqual(articlesInOrder(chapters), ["1", "2", "3", "4"]);
});

test("فصل › فرع: a level-1 فصل keeps its own articles above its فروع", () => {
  const chapters: Ch[] = [
    { id: "s1", level: 1, title: "الفصل الأول", articles: ["1"] },
    { id: "r1", level: 2, parentChapterId: "s1", title: "الفرع الأول", articles: ["2"] },
    { id: "r2", level: 2, parentChapterId: "s1", title: "الفرع الثاني", articles: ["3"] },
    { id: "s2", level: 1, title: "الفصل الثاني", articles: ["4"] },
  ];
  const tree = buildChapterTree(chapters);
  assert.deepEqual(view(chapters), [
    { title: "الفصل الأول", children: ["الفرع الأول", "الفرع الثاني"] },
    { title: "الفصل الثاني", children: [] },
  ]);
  assert.deepEqual(tree[0].chapter.articles, ["1"]);
  assert.deepEqual(articlesInOrder(chapters), ["1", "2", "3", "4"]);
});

test("a level-2 chapter without a parent is shown as a top-level chapter", () => {
  const chapters: Ch[] = [
    { id: "x", level: 2, parentChapterId: null, title: "فصل بلا باب", articles: ["1"] },
    { id: "y", level: 2, title: "فصل بلا مرجع", articles: ["2"] },
    { id: "z", level: 2, parentChapterId: "missing", title: "أبوه غير موجود", articles: ["3"] },
  ];
  assert.deepEqual(view(chapters), [
    { title: "فصل بلا باب", children: [] },
    { title: "فصل بلا مرجع", children: [] },
    { title: "أبوه غير موجود", children: [] },
  ]);
});

test("a child whose باب is not right before it stays where it is (no article is ever moved)", () => {
  const chapters: Ch[] = [
    { id: "b1", level: 1, title: "الباب الأول", articles: [] },
    { id: "f1", level: 2, parentChapterId: "b1", title: "الفصل الأول", articles: ["1"] },
    { id: "o", title: "مواد خارج الأبواب", articles: ["2"] },
    { id: "f2", level: 2, parentChapterId: "b1", title: "الفصل الثاني", articles: ["3"] },
    // A child placed before its parent (bad API order) is not pulled forward either.
    { id: "f4", level: 2, parentChapterId: "b3", title: "فصل قبل بابه", articles: ["4"] },
    { id: "b3", level: 1, title: "الباب الثالث", articles: ["5"] },
    // A level-2 parent is not a group.
    { id: "f5", level: 2, parentChapterId: "f4", title: "فصل تحت فصل", articles: ["6"] },
  ];
  assert.deepEqual(view(chapters), [
    { title: "الباب الأول", children: ["الفصل الأول"] },
    { title: "مواد خارج الأبواب", children: [] },
    { title: "الفصل الثاني", children: [] },
    { title: "فصل قبل بابه", children: [] },
    { title: "الباب الثالث", children: [] },
    { title: "فصل تحت فصل", children: [] },
  ]);
  assert.deepEqual(articlesInOrder(chapters), ["1", "2", "3", "4", "5", "6"]);
});

test("chapters without `level` give today's flat list, unchanged", () => {
  const chapters: Ch[] = [
    { title: "التعريفات", articles: ["1"] },
    { title: "مواد خارج الأبواب", articles: ["2", "3"] },
    { id: "with-id", title: "الباب الثاني", articles: ["4"] },
    { title: "أحكام عامة", articles: [] },
  ];
  const tree = buildChapterTree(chapters);
  assert.equal(tree.length, chapters.length);
  tree.forEach((node, i) => {
    assert.equal(node.chapter, chapters[i], "the same chapter object, not a copy");
    assert.equal(node.index, i);
    assert.deepEqual(node.children, []);
  });
});

test("flattening always restores the input list element for element, in order", () => {
  const cases: Ch[][] = [
    [],
    [{ title: "أ", articles: ["1"] }],
    [
      { id: "b", level: 1, title: "ب", articles: [] },
      { id: "c", level: 2, parentChapterId: "b", title: "ج", articles: ["1"] },
      { id: "d", level: 2, parentChapterId: "x", title: "د", articles: ["2"] },
      { id: "e", level: 2, parentChapterId: "b", title: "هـ", articles: ["3"] },
      { level: 1, title: "و بلا معرف", articles: ["4"] },
      { id: "g", level: 2, parentChapterId: undefined, title: "ز", articles: ["5"] },
    ],
  ];
  for (const chapters of cases) {
    const flat = flattenChapterTree(buildChapterTree(chapters));
    assert.equal(flat.length, chapters.length);
    flat.forEach((chapter, i) => assert.equal(chapter, chapters[i]));
  }
});
