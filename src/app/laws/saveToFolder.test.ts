import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bookSaveDoc, collectionSaveDoc, lawSaveDoc, orderSaveDoc } from "./saveToFolder.ts";

test("٠٤: each result card type becomes the folder modal's currentDoc", () => {
  assert.deepEqual(lawSaveDoc({ slug: "labor", title: "نظام العمل", titleEn: "Labor Law", cat: "SA-06" }), {
    slug: "labor", title: "نظام العمل", titleEn: "Labor Law", catId: "SA-06", type: "law",
  });
  assert.deepEqual(collectionSaveDoc({ id: "c1", title: "مجموعة الأحكام" }), {
    slug: "c1", title: "مجموعة الأحكام", titleEn: "مجموعة الأحكام", catId: "", type: "precedent",
  });
  assert.equal(collectionSaveDoc({ id: "c1", slug: "c2", title: "x" })?.slug, "c2");
  assert.equal(orderSaveDoc({ id: 7, title: "تعميم" })?.slug, "7");
  assert.equal(orderSaveDoc({ id: 7, title: "تعميم" })?.type, "order");
  assert.equal(bookSaveDoc({ slug: "mughni", title: "المغني — باب", bookTitle: "المغني" })?.title, "المغني");
  assert.equal(bookSaveDoc({ slug: "mughni", title: "المغني" })?.type, "book");
});

test("٠٤: no id or no title → no button (null), never a dead folder entry", () => {
  assert.equal(lawSaveDoc({ slug: "", title: "x" }), null);
  assert.equal(collectionSaveDoc({ title: "x" }), null);
  assert.equal(orderSaveDoc({ id: "o1", title: "  " }), null);
  assert.equal(bookSaveDoc(null), null);
});

test("source: the four card types carry the button; one modal on the page; never inside a <Link>", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const page = read("./page.tsx");
  assert.equal((page.match(/onSaveToFolder=\{setSaveDoc\}/g) ?? []).length, 4, "laws, precedents, orders, fiqh tabs");
  assert.match(page, /<FolderSelectionModal isOpen=\{true\} onClose=\{\(\) => setSaveDoc\(null\)\} currentDoc=\{saveDoc\} \/>/);
  const laws = read("./components/LawsTabContent.tsx");
  assert.match(laws, /<SaveToFolderButton doc=\{lawSaveDoc\(sys\)\}/);
  assert.match(laws, /<SaveToFolderButton doc=\{collectionSaveDoc\(col\)\}/);
  assert.match(laws, /<SaveToFolderButton doc=\{bookSaveDoc\(book\)\}/);
  assert.match(read("./components/PrecedentsTabContent.tsx"), /<SaveToFolderButton doc=\{collectionSaveDoc\(col\)\}/);
  assert.match(read("./components/FeqhTabContent.tsx"), /<SaveToFolderButton doc=\{bookSaveDoc\(/);
  assert.equal((read("./components/ListItems.tsx").match(/<SaveToFolderButton doc=\{orderSaveDoc\(o\)\}/g) ?? []).length, 2);
  // the button is a sibling placed just before the card's <Link>, not a child of it
  for (const src of [laws, read("./components/PrecedentsTabContent.tsx"), read("./components/FeqhTabContent.tsx")]) {
    for (const m of src.matchAll(/<SaveToFolderButton [^\n]*className="absolute[^\n]*\/>\s*\n\s*<Link\b/g)) {
      assert.ok(m.index !== undefined);
    }
    assert.doesNotMatch(src, /<Link\b[^>]*>\s*<SaveToFolderButton/);
  }
  const button = read("./components/SaveToFolderButton.tsx");
  assert.match(button, /e\.stopPropagation\(\);/);
  assert.match(button, /type="button"/);
});
