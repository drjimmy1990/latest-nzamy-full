/**
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/insertFromLibrary.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cartItems, fitsLimit, folderItems, insertAtCursor, libraryHref } from "./insertFromLibrary.ts";

test("insertAtCursor: at the caret, on its own line, replacing a selection; caret after the insert", () => {
  assert.deepEqual(insertAtCursor("", 0, 0, "X"), { value: "X", caret: 1 });
  assert.deepEqual(insertAtCursor("أب", 1, 1, "X"), { value: "أ\nX\nب", caret: 3 });
  assert.deepEqual(insertAtCursor("سطر\n", 4, 4, "X"), { value: "سطر\nX", caret: 5 });
  assert.deepEqual(insertAtCursor("abcd", 1, 3, "X"), { value: "a\nX\nd", caret: 3 });
  // No cursor known (the box never had focus): appended at the end.
  assert.deepEqual(insertAtCursor("ab", null, null, "X"), { value: "ab\nX", caret: 4 });
  assert.deepEqual(insertAtCursor("ab", 9, 9, "X"), { value: "ab\nX", caret: 4 });
});

test("folders: a citation with the library link, no notes read; malformed rows dropped", () => {
  const body = {
    folders: [{
      name: "عمالي",
      notes: "سرّي",
      smart_folder_items: [
        { id: "i1", entity_type: "law", entity_id: "labor-law", title: "نظام العمل" },
        { id: "i2", entity_type: "precedent", entity_id: "p 1", title: "مبدأ" },
        { id: "i3", entity_type: "law", entity_id: "", title: "بلا رابط" },
      ],
    }],
  };
  const items = folderItems(body, "https://example.test");
  assert.equal(items.length, 2);
  assert.equal(items[0].text, "«نظام العمل» — مكتبة الأنظمة: https://example.test/laws/labor-law");
  assert.equal(items[0].detail, "نظام · عمالي");
  assert.equal(items[1].text.endsWith("/precedents/p%201"), true);
  assert.ok(!JSON.stringify(items).includes("سرّي"));
  assert.deepEqual(folderItems(null, ""), []);
  assert.equal(libraryHref("order", "a%20b"), "/laws/orders/a%20b");
  assert.equal(libraryHref("book", "b1"), null);
  const book = folderItems({ folders: [{ name: "", smart_folder_items: [{ id: "b", entity_type: "book", entity_id: "b1", title: "كتاب" }] }] }, "https://example.test");
  assert.equal(book[0].text, "«كتاب»", "no broken link for a book");
});

test("draft cart: the article quoted with its law; a legacy row without text is a citation only", () => {
  const body = {
    data: {
      items: [
        { article_number: "77", payload: { lawName: "نظام العمل", lawSlug: "labor", articleNum: "77", articleTitle: "المادة السابعة والسبعون", articleText: "إذا أُنهي العقد…" } },
        { article_number: "5", payload: { lawName: "نظام الإثبات", articleNum: "5", articleText: "" } },
        { article_number: "9" },
      ],
    },
  };
  const items = cartItems(body);
  assert.equal(items.length, 2);
  assert.equal(items[0].text, "نظام العمل — المادة السابعة والسبعون:\n«إذا أُنهي العقد…»");
  assert.equal(items[1].text, "نظام الإثبات — المادة 5");
});

test("draft cart: a regulation added alone is quoted as the regulation, not the article", () => {
  const items = cartItems({ data: { items: [{ article_number: "3", payload: {
    lawName: "نظام العمل", lawSlug: "labor", articleNum: "3", articleTitle: "المادة الثالثة", articleText: "نص المادة",
    isArticleAdded: false, isExecRegAdded: true, execReg: { ref: "المادة ٣ من اللائحة", text: "نص اللائحة" },
  } }] } });
  assert.equal(items.length, 1);
  assert.ok(items[0].text.includes("«نص اللائحة»") && !items[0].text.includes("نص المادة"));
});

test("an insert that would pass the box's limit is refused, never cut", () => {
  assert.equal(fitsLimit("ab", "cd", 10), true);
  assert.equal(fitsLimit("a".repeat(9), "bc", 10), false);
});

test("the three editors mount the picker on their own text box", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  assert.match(read("src/components/draft/steps/StepAiDraft.tsx"), /<InsertFromLibraryButton[^>]*targetRef=\{factsRef\}/);
  assert.match(read("src/components/contracts/steps/draft/StepContext.tsx"), /<InsertFromLibraryButton[^>]*targetRef=\{descRef\}/);
  assert.match(read("src/app/dashboard/lawyer/cases/[id]/page.tsx"), /<InsertFromLibraryButton[^>]*targetRef=\{newNoteRef\}/);
});
