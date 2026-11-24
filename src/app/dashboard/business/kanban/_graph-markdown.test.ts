import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasCardMarkdown, parseCardMarkdown, parseInline } from "./_graph-markdown.ts";

test("row 57: bold and italic spans; unclosed marks stay as typed", () => {
  assert.deepEqual(parseInline("**عقد** ثم *مهلة*"), [
    { text: "عقد", bold: true }, { text: " ثم " }, { text: "مهلة", italic: true },
  ]);
  assert.deepEqual(parseInline("نص **غير مغلق"), [{ text: "نص **غير مغلق" }]);
  assert.deepEqual(parseInline("٥ * ٣"), [{ text: "٥ * ٣" }], "a lone star is not italic");
});

test("row 57: headings and list lines, one block per non-empty line", () => {
  assert.deepEqual(parseCardMarkdown("# الوقائع\n\n- أولاً\n## ملاحظة\nنص").map((b) => b.kind), ["h1", "li", "h2", "p"]);
  assert.deepEqual(parseCardMarkdown("- **مهم**")[0].spans, [{ text: "مهم", bold: true }]);
});

test("row 57: plain text is left alone", () => {
  assert.equal(hasCardMarkdown("نص عادي ٥ * ٣"), false);
  assert.equal(hasCardMarkdown("**مهم**"), true);
  assert.equal(hasCardMarkdown("*مائل*"), true);
  assert.equal(hasCardMarkdown("- بند"), true);
});

test("row 57: the card draws the parsed blocks as elements, never as HTML", () => {
  const view = readFileSync(new URL("./CaseGraphView.tsx", import.meta.url), "utf8");
  assert.match(view, /<CardMarkdownView\s+text=\{node\.desc\}/);
  assert.doesNotMatch(view, /dangerouslySetInnerHTML/);
  const extras = readFileSync(new URL("./CaseGraphCardExtras.tsx", import.meta.url), "utf8");
  assert.match(extras, /parseCardMarkdown\(text\)\.map/);
  assert.doesNotMatch(extras, /dangerouslySetInnerHTML/);
});
