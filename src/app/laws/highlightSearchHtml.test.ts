import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml, highlightSearchHtml } from "./highlightSearchHtml.ts";

const MARK_OPEN = '<mark class="bg-yellow-300/80 text-yellow-900 rounded px-0.5">';
const mark = (s: string) => `${MARK_OPEN}${s}</mark>`;

/** Every `<` / `>` in the output belongs to our own <mark> tags. */
function onlyMarkTags(html: string): boolean {
  return html.replaceAll(MARK_OPEN, "").replaceAll("</mark>", "").search(/[<>]/) === -1;
}

test("a label carrying HTML is escaped, matched or not", () => {
  const label = '<img src=x onerror=alert(1)> نظام العمل';
  const out = highlightSearchHtml(label, "العمل");
  assert.ok(onlyMarkTags(out), out);
  assert.ok(out.startsWith("&lt;img src=x onerror=alert(1)&gt; نظام "));
  assert.ok(out.endsWith(mark("العمل")));
  // No term: still fully escaped.
  assert.equal(highlightSearchHtml(label, ""), escapeHtml(label));
});

test("a query carrying HTML never injects markup", () => {
  for (const q of ['<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', "'><svg onload=alert(1)>"]) {
    const label = `before ${q} after`;
    const out = highlightSearchHtml(label, q);
    assert.ok(onlyMarkTags(out), out);
    assert.ok(!out.includes("<script"), out);
    assert.ok(!out.includes("<img"), out);
    assert.ok(out.includes(MARK_OPEN), "the literal query text is still found and marked");
  }
});

test("regex metacharacters in the query are literal", () => {
  assert.equal(highlightSearchHtml("abc", ".*"), "abc");
  assert.equal(highlightSearchHtml("a.*b", ".*"), `a${mark(".*")}b`);
  assert.equal(highlightSearchHtml("f(x) = 1", "(x"), `f${mark("(x")}) = 1`);
  assert.equal(highlightSearchHtml("[ab] c", "[a"), `${mark("[a")}b] c`);
  assert.equal(highlightSearchHtml("a\\b c", "\\b"), `a${mark("\\b")} c`);
  // Lone metacharacters must not throw (an unbalanced `(` or `[` would).
  for (const q of ["((", "[[", "\\\\", "+?", "a|b", "$^"]) {
    assert.doesNotThrow(() => highlightSearchHtml("text ((( [[[ \\\\ +? a|b $^", q), q);
  }
});

test("matched text holding & < > is escaped inside <mark> too", () => {
  assert.equal(highlightSearchHtml("A&B<C", "&b<"), `A${mark("&amp;B&lt;")}C`);
});

test("numerals match across scripts both ways", () => {
  assert.equal(highlightSearchHtml("نظام 1445هـ", "١٤٤٥"), `نظام ${mark("1445")}هـ`);
  assert.equal(highlightSearchHtml("نظام ١٤٤٥هـ", "1445"), `نظام ${mark("١٤٤٥")}هـ`);
  assert.equal(highlightSearchHtml("م/۱۴", "م/14"), mark("م/۱۴"));
});

test("Arabic letter variants and harakat in the text are matched", () => {
  assert.equal(highlightSearchHtml("نظام الإثبات", "الاثبات"), `نظام ${mark("الإثبات")}`);
  assert.equal(highlightSearchHtml("اللائحة", "اللائحه"), mark("اللائحة"));
  assert.equal(highlightSearchHtml("قَانُون", "قانون"), mark("قَانُون"));
});

test("harakat in the term are dropped, so a long run of marks cannot stall the regex", () => {
  const term = "َ".repeat(40) + "x";
  const label = "َ".repeat(5000) + "y";
  const started = Date.now();
  assert.equal(highlightSearchHtml(label, term), escapeHtml(label));
  assert.ok(Date.now() - started < 500, "highlight stays linear");
  assert.equal(highlightSearchHtml("قانون", "قَانُون"), mark("قانون"));
});

test("the laws page uses this module for its dangerouslySetInnerHTML suggestion label", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const page = readFileSync(path.join(here, "page.tsx"), "utf8");
  assert.match(page, /import \{ highlightSearchHtml as highlightText \} from "\.\/highlightSearchHtml"/);
  assert.ok(!/function highlightText\(/.test(page), "no second, untested copy in the page");
  const sinks = page.match(/dangerouslySetInnerHTML=\{\{ __html: [^}]+\}\}/g) ?? [];
  assert.deepEqual(sinks, ["dangerouslySetInnerHTML={{ __html: highlightText(s.label, search) }}"]);
});
