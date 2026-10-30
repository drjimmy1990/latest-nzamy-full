import assert from "node:assert/strict";
import test from "node:test";
import { parseHighlightQuery } from "../../../lib/search/multiColorSearch.ts";
import { markdownBoldToSafeHtml } from "../../../utils/sanitize.ts";
import { highlightSafeHtml, textHasHighlight } from "./_highlight-html.ts";

const terms = (q: string) => parseHighlightQuery(q).terms;
const tagsOf = (html: string) => (html.match(/<\/?[A-Za-z][^>]*>/g) ?? []).map((t) => t.replace(/\s.*$/, "").replace(/>$/, ""));

test("no terms → the HTML is returned unchanged", () => {
  const html = markdownBoldToSafeHtml("**المادة الأولى:** يعمل بهذا النظام");
  assert.equal(highlightSafeHtml(html, []), html);
  assert.equal(highlightSafeHtml(html, terms("")), html);
  assert.equal(highlightSafeHtml("", terms("عزل")), "");
});

test("a term in the text is wrapped in a coloured mark with its index", () => {
  const out = highlightSafeHtml("يجوز عزل الوكيل", terms("عزل الوكيل"));
  assert.match(out, /<mark data-hl-term="0" class="bg-amber-200[^"]*">عزل<\/mark>/);
  assert.match(out, /<mark data-hl-term="1" class="bg-emerald-200[^"]*">الوكيل<\/mark>/);
});

test("Arabic folding and the three digit scripts match (١٢٣ ↔ 123, الاثبات ↔ الإثبات)", () => {
  const out = highlightSafeHtml("المادة ١٢٣ من نظام الإثبات", terms("123 الاثبات"));
  assert.match(out, />١٢٣<\/mark>/);
  assert.match(out, />الإثبات<\/mark>/);
});

test("tags pass through untouched and a term inside an href is never wrapped", () => {
  const html = markdownBoldToSafeHtml("**عزل** انظر [الرابط](https://example.sa/عزل)");
  const out = highlightSafeHtml(html, terms("عزل"));
  assert.ok(out.includes('href="https://example.sa/عزل"'), out);
  assert.equal((out.match(/<mark /g) ?? []).length, 1);
  assert.match(out, /<strong><mark [^>]*>عزل<\/mark><\/strong>/);
  // Only the input's tags plus mark.
  const allowed = new Set(tagsOf(html).concat(["<mark", "</mark"]));
  for (const t of tagsOf(out)) assert.ok(allowed.has(t), `unexpected tag ${t}`);
});

test("a match does not cross a tag", () => {
  const out = highlightSafeHtml("عزل <strong>الوكيل</strong>", terms('"عزل الوكيل"'));
  assert.doesNotMatch(out, /<mark/);
});

test("an entity is one unit: never split, never matched by a word", () => {
  const out = highlightSafeHtml("شركة A&amp;B للتجارة", terms("amp للتجارة"));
  assert.ok(out.includes("A&amp;B"), out);
  assert.match(out, />للتجارة<\/mark>/);
  assert.doesNotMatch(out, /&a<mark|amp<\/mark>/);
});

test("focus leaves the other terms uncoloured", () => {
  const out = highlightSafeHtml("عزل الوكيل", terms("عزل الوكيل"), 1);
  assert.doesNotMatch(out, /data-hl-term="0"/);
  assert.match(out, /data-hl-term="1"/);
});

test("prefix colours the whole word", () => {
  assert.match(highlightSafeHtml("وكالته باطلة", terms("وكال*")), />وكالته<\/mark>/);
});

test("textHasHighlight", () => {
  assert.equal(textHasHighlight("نص فيه عزل", terms("عزل")), true);
  assert.equal(textHasHighlight("نص آخر", terms("عزل")), false);
  assert.equal(textHasHighlight("عزل", []), false);
  assert.equal(textHasHighlight(null, terms("عزل")), false);
});
