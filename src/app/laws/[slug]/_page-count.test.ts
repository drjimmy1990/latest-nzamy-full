/**
 * #13 (owner package 6-Nov): page-numbered documents are counted in pages.
 * Shapes from the 10-03 export (number_text of ARTICLE_START anchors).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isPageAnchor, isPageNumberedDocument } from "./_page-count.ts";

test("page anchors in both spellings; article numbers are not pages", () => {
  for (const p of ["الصفحة 1", "صفحة ٤", "ص. 12", "Page 3", "page 10"]) assert.equal(isPageAnchor(p), true, p);
  for (const a of ["المادة الأولى", "المادة (5)", "Pages of the law", "الصفحات", "", null, undefined]) {
    assert.equal(isPageAnchor(a), false, String(a));
  }
});

test("a document is page-numbered only when every base article is a page anchor", () => {
  assert.equal(isPageNumberedDocument([{ numberText: "الصفحة 1" }, { numberText: "الصفحة 2" }]), true);
  assert.equal(isPageNumberedDocument([{ numberText: "Page 1" }, { numberText: "Page 2" }]), true);
  // Annexes / standalone regulation rows do not decide it.
  assert.equal(isPageNumberedDocument([{ numberText: "Page 1" }, { numberText: "ملحق (1)", instrument: "ملحق" }]), true);
  // One real article → articles.
  assert.equal(isPageNumberedDocument([{ numberText: "الصفحة 1" }, { numberText: "المادة الأولى" }]), false);
  assert.equal(isPageNumberedDocument([{ numberText: "المادة الأولى" }]), false);
  assert.equal(isPageNumberedDocument([]), false);
  assert.equal(isPageNumberedDocument([{ numberText: "ملحق (1)", instrument: "ملحق" }]), false);
});

test("the sidebar labels a page-numbered document «عدد الصفحات» in both layouts", () => {
  const sidebar = readFileSync(new URL("./_sidebar.tsx", import.meta.url), "utf8");
  assert.match(sidebar, /import \{ isPageNumberedDocument \} from "\.\/_page-count";/);
  assert.match(sidebar, /const pageNumbered = isPageNumberedDocument\(law\.chapters\?\.flatMap\(\(c\) => c\.articles\) \?\? \[\]\);/);
  assert.ok(sidebar.includes('{pageNumbered ? (isRTL ? "عدد الصفحات" : "Pages") : (isRTL ? "عدد مواد النظام" : "Law Articles")}'));
  assert.ok(sidebar.includes('{pageNumbered ? (isRTL ? "عدد الصفحات" : "Pages") : (isRTL ? "عدد المواد" : "Articles")}'));
});
