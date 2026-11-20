/**
 * The anchor gate (l10 items 1.4 / 4.3): multi-line JSON joined to one line,
 * `-->` inside a JSON value, and the per-kind opener count.
 *
 *   node --import tsx --test scripts/parsers/lib/anchors.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  anchorShortfall,
  bodyLineOffset,
  formatAnchorJoins,
  formatAnchorProblems,
  prepareAnchors,
  totalArticlesMismatch,
  type AnchorKind,
} from "./anchors.ts";

const LAW_KINDS: AnchorKind[] = ["ARTICLE_START", "CHAPTER_START", "AMENDMENT", "REGULATION", "ATTACHED_REGULATION"];

test("one-line anchors and other comments stay byte-identical", () => {
  const body = [
    '<!-- CHAPTER_START {"number": 1, "title": "الباب الأول"} -->',
    '<!-- ARTICLE_START {"number": "1", "number_text": "الأولى"} -->',
    "نص. <!-- PDF_PAGE_BREAK -->",
    "<!-- PDF_PAGE_BREAK\n  page 4 -->",
    '<!-- AMENDMENT {"decree": "م/1"} -->',
    '<!-- REGULATION {"regNum": "1"} -->',
    "<!-- AMENDMENTS -->",
    "<!-- REGULATION_END -->",
    "<!-- ARTICLE_END -->",
    "<!-- CHAPTER_END -->",
  ].join("\n");
  const r = prepareAnchors(body, LAW_KINDS);
  assert.equal(r.body, body);
  assert.deepEqual(r.joins, []);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.counts.ARTICLE_START, { openers: 1, readable: 1 });
  assert.deepEqual(r.counts.CHAPTER_START, { openers: 1, readable: 1 });
  assert.deepEqual(r.counts.AMENDMENT, { openers: 1, readable: 1 });
  assert.deepEqual(r.counts.REGULATION, { openers: 1, readable: 1 });
});

for (const [kind, json] of [
  ["ARTICLE_START", '{\n  "number": "2",\n  "number_text": "الثانية"\n}'],
  ["CHAPTER_START", '{"title":\n  "نزع ملكية العقارات", "number": 13}'],
  ["AMENDMENT", '{"decree": "م/113",\n "date": "1445/03/01هـ", "type": "تعديل"}'],
  ["REGULATION", '{\n"instrument": "لائحة تنفيذية",\n"regNum": "3"\n}'],
  ["ATTACHED_REGULATION", '{"title": "لائحة",\n"ref": "ر"}'],
  ["PRINCIPLE_START", '{\n"number": 4}'],
] as const) {
  test(`a two-line ${kind} anchor is joined to one line and listed`, () => {
    const body = `مقدمة\n<!-- ${kind} ${json} -->\nنص`;
    const r = prepareAnchors(body, [kind]);
    assert.equal(r.joins.length, 1);
    assert.equal(r.joins[0].kind, kind);
    assert.equal(r.joins[0].line, 2);
    assert.ok(r.joins[0].lines >= 2);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.counts[kind], { openers: 1, readable: 1 });
    const lines = r.body.split("\n");
    assert.equal(lines.length, 3, "the anchor is one line now");
    assert.equal(lines[0], "مقدمة");
    assert.equal(lines[2], "نص");
    const read = lines[1].match(new RegExp(`<!--\\s*${kind}\\s*(.*?)\\s*-->`));
    assert.ok(read);
    assert.deepEqual(JSON.parse(read[1]), JSON.parse(json), "same value as written");
  });
}

test("a line break inside a JSON string value is never guessed: not joined, reported", () => {
  const body = '<!-- ARTICLE_START {"number": "2", "title": "سطر\nسطر"} -->\nنص\n<!-- ARTICLE_END -->';
  const r = prepareAnchors(body, ["ARTICLE_START"]);
  assert.equal(r.body, body);
  assert.deepEqual(r.joins, []);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0].reason, /not closed/);
  assert.deepEqual(r.counts.ARTICLE_START, { openers: 1, readable: 0 });
});

test("«-->» inside a JSON value is written \\u003e and reads back as the same text", () => {
  const body = '<!-- ARTICLE_START {"number": "1", "title": "أ --> ب"} -->\nنص\n<!-- ARTICLE_END -->';
  const r = prepareAnchors(body, ["ARTICLE_START"]);
  assert.equal(r.joins.length, 1);
  assert.equal(r.joins[0].arrowsEscaped, 1);
  assert.equal(r.joins[0].lines, 1);
  assert.deepEqual(r.problems, []);
  const m = r.body.match(/<!--\s*ARTICLE_START\s+(.*?)\s*-->([\s\S]*?)<!--\s*ARTICLE_END\s*-->/);
  assert.ok(m);
  assert.equal(JSON.parse(m[1]).title, "أ --> ب");
  assert.equal(m[2], "\nنص\n");
  assert.match(formatAnchorJoins("f.md", r.joins)[0], /f\.md:1 — ARTICLE_START anchor 1 «-->» inside the JSON written as \\u003e/);
});

test("invalid one-line JSON, an empty anchor and a non-object are problems; the text is untouched", () => {
  const body = [
    '<!-- ARTICLE_START {"number": 1,} -->',
    "<!-- ARTICLE_END -->",
    "<!-- CHAPTER_START -->",
    '<!-- REGULATION ["x"] -->',
    '<!-- AMENDMENT {"decree": "م/1" -->',
  ].join("\n");
  const r = prepareAnchors(body, LAW_KINDS);
  assert.equal(r.body, body);
  assert.deepEqual(
    r.problems.map((p) => [p.kind, p.line]),
    [["ARTICLE_START", 1], ["CHAPTER_START", 3], ["REGULATION", 4], ["AMENDMENT", 5]],
  );
  assert.match(r.problems[0].reason, /does not parse/);
  assert.match(r.problems[1].reason, /no JSON/);
  assert.match(r.problems[2].reason, /not an object/);
  assert.match(r.problems[3].reason, /does not parse/);
  assert.equal(r.counts.ARTICLE_START.readable, 0);
  assert.match(formatAnchorProblems("x.md", r.problems, 10)[0], /^x\.md:11 — ARTICLE_START: the JSON does not parse/);
});

test("an unclosed JSON object is not joined across the next anchor", () => {
  const body = '<!-- ARTICLE_START {"number": "1"\n<!-- ARTICLE_END -->\n<!-- ARTICLE_START {"number": "2"} -->\nب\n<!-- ARTICLE_END -->';
  const r = prepareAnchors(body, ["ARTICLE_START"]);
  assert.equal(r.body, body);
  assert.deepEqual(r.counts.ARTICLE_START, { openers: 2, readable: 1 });
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].line, 1);
});

test("lines in reports are source lines even after an earlier join", () => {
  const body = '<!-- ARTICLE_START {\n"number": "1"\n} -->\nأ\n<!-- ARTICLE_END -->\n<!-- ARTICLE_START {"number": 2,} -->\nب\n<!-- ARTICLE_END -->';
  const r = prepareAnchors(body, ["ARTICLE_START"]);
  assert.equal(r.joins.length, 1);
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].line, 6);
});

test("the CRLF form joins too", () => {
  const body = '<!-- ARTICLE_START {\r\n  "number": "1"\r\n} -->\r\nنص\r\n<!-- ARTICLE_END -->';
  const r = prepareAnchors(body, ["ARTICLE_START"]);
  assert.equal(r.joins.length, 1);
  assert.ok(r.body.startsWith('<!-- ARTICLE_START { "number": "1" } -->\r\n'));
  assert.deepEqual(r.problems, []);
});

test("openers are what the parser's regex starts on: `ARTICLE_START:` and `AMENDMENTS` are not", () => {
  const r = prepareAnchors("<!-- ARTICLE_START: N -->\n<!-- AMENDMENTS -->\n<!-- AMENDMENT_IN_DETAILS {} -->", LAW_KINDS);
  assert.equal(r.counts.ARTICLE_START.openers, 0);
  assert.equal(r.counts.AMENDMENT.openers, 0);
  assert.deepEqual(r.problems, []);
});

test("shortfall and total_articles lines", () => {
  assert.equal(anchorShortfall("a.md", "ARTICLE_START", 3, 3), null);
  assert.equal(anchorShortfall("a.md", "ARTICLE_START", 3, 2), "a.md — ARTICLE_START: 3 in the source, 2 parsed (1 lost)");
  assert.match(anchorShortfall("a.md", "CHAPTER_START", 1, 2) ?? "", /1 more than written/);
  assert.equal(totalArticlesMismatch("a.md", undefined, 3, 3), null);
  assert.equal(totalArticlesMismatch("a.md", "غير معروف", 3, 3), null);
  assert.equal(totalArticlesMismatch("a.md", "3", 3, 3), null);
  assert.equal(
    totalArticlesMismatch("a.md", 5, 3, 3),
    "a.md — total_articles 5 in the frontmatter / 3 ARTICLE_START in the source / 3 parsed",
  );
});

test("bodyLineOffset counts the frontmatter lines", () => {
  const raw = "---\ntitle: x\n---\nسطر\n";
  assert.equal(bodyLineOffset(raw, "سطر\n"), 3);
  assert.equal(bodyLineOffset(raw, "غير موجود"), 0);
});
