import assert from "node:assert/strict";
import test from "node:test";
import { altAnchor, findToc, nextActiveTocId, slugify } from "./_article-md.ts";

test("slugify and altAnchor are unchanged by the move out of ArticleView", () => {
  assert.equal(slugify("أولاً: الأساس النظامي (المادة 77)"), "أولاً-الأساس-النظامي-المادة-77");
  assert.equal(altAnchor("بمضي 60 يوماً", slugify("بمضي 60 يوماً")), "بمضي-60-يوما");
  assert.equal(altAnchor("المقدمة", "المقدمة"), null);
});

test("findToc reads the article's own list and swallows its closing rule", () => {
  const md = ["# عنوان", "", "## جدول المحتويات (TOC)", "- [المقدمة](#المقدمة)", "", "- [الخاتمة](#الخاتمة)", "---", "نص"].join("\n");
  assert.deepEqual(findToc(md), {
    items: [
      { text: "المقدمة", href: "المقدمة" },
      { text: "الخاتمة", href: "الخاتمة" },
    ],
    start: 2,
    end: 7,
  });
  assert.equal(findToc("# بلا فهرس\nنص"), null);
});

// ─── N1.6: the active TOC entry ──────────────────────────────────────────────

const ORDER = ["a", "b", "c"];

test("N1.6: the first visible heading in TOC order is active", () => {
  assert.equal(nextActiveTocId(ORDER, new Set(["c", "b"]), null), "b");
  assert.equal(nextActiveTocId(ORDER, new Set(["a"]), "c"), "a");
});

test("N1.6: between two headings the previous entry stays lit", () => {
  assert.equal(nextActiveTocId(ORDER, new Set(), "b"), "b");
  assert.equal(nextActiveTocId(ORDER, new Set(), null), null);
});

test("N1.6: ids outside the TOC are ignored", () => {
  assert.equal(nextActiveTocId(ORDER, new Set(["zzz"]), "zzz"), null);
  assert.equal(nextActiveTocId(ORDER, new Set(["zzz", "c"]), null), "c");
});
