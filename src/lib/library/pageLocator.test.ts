import assert from "node:assert/strict";
import test from "node:test";
import { isPageLocator, isPageNumberedDocument, PAGE_LOCATOR_RE } from "./pageLocator.ts";

test("Arabic page locators are pages (unchanged from the reader's old rule)", () => {
  for (const v of ["الصفحة 3", "الصفحة ٤", "صفحة 12", "ص. 7", "ص7", "  الصفحة 1"]) {
    assert.ok(isPageLocator(v), v);
  }
});

test("owner item 11: English «Page N» is a page, in any case, with or without a space", () => {
  for (const v of ["Page 3", "page 3", "PAGE 12", "Page3", "  Page 45"]) {
    assert.ok(isPageLocator(v), v);
  }
});

test("article labels and words that merely start like «page» are not pages", () => {
  for (const v of ["المادة الأولى", "السادسة والأربعون", "1", "Article 3", "Pages", "Page", "Pagination 3", "صفحات", "", null, undefined]) {
    assert.ok(!isPageLocator(v as string), String(v));
  }
});

test("the regex keeps the literal shape the owner's ع-1 probe reads (case-insensitive)", () => {
  assert.equal(PAGE_LOCATOR_RE.flags.includes("i"), true);
  assert.match(String(PAGE_LOCATOR_RE), /page/);
});

test("a document is page-numbered only when every unit is a page and there is at least one", () => {
  assert.equal(isPageNumberedDocument(["الصفحة 1", "Page 2", "صفحة 3"]), true);
  assert.equal(isPageNumberedDocument(["الصفحة 1", "المادة الثانية"]), false);
  assert.equal(isPageNumberedDocument([]), false);
  assert.equal(isPageNumberedDocument(["Page 1", null]), false);
});
