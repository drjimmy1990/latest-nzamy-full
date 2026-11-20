/**
 * Merged regulations keep their own numbering (owner file 19 Nov §1.9 and his
 * answer 3: «المادة الأولى من نظام القضاء» is the law's own article 1): every
 * chapter and article inside an ATTACHED_REGULATION block carries
 * `regulation_ref` = the block's title, and a title not found verbatim in
 * merged_regulation_details[].name is reported.
 *
 * Read-only: every input is a synthetic fixture written to a temp directory;
 * the parser only reads it. Run:
 *   npx tsx --test scripts/parsers/parse-laws.regulation-ref.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  findAttachedRegulationBlocks,
  parseLaws,
  stampRegulationRefs,
  type ParsedChapter,
} from "./parse-laws.ts";

const FRONTMATTER = (extra = "") => `---
id: TEST-REGULATION-REF
title: نظام اختباري
type: نظام
status: active
section_code: "00"
schema_version: "4.0"
${extra}---
`;

const MERGED = `has_merged_regulation: true
merged_regulation_details:
  - name: "لائحة التفتيش"
    total_articles: 1
  - name: "لائحة أعوان القضاء"
    total_articles: 1
`;

const chapter = (title: string, inner: string) =>
  `<!-- CHAPTER_START ${JSON.stringify({ number: 1, title })} -->\n${inner}<!-- CHAPTER_END -->\n`;
const article = (n: number, text: string) =>
  `<!-- ARTICLE_START {"number": "${n}", "number_text": "المادة ${n}", "status": "active"} -->\n${text}\n<!-- ARTICLE_END -->\n`;
const block = (meta: Record<string, unknown> | string, inner: string) =>
  `<!-- ATTACHED_REGULATION ${typeof meta === "string" ? meta : JSON.stringify(meta)} -->\n${inner}<!-- ATTACHED_REGULATION_END -->\n`;

function parseOne(body: string, extraFrontmatter = "") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-regulation-ref-"));
  const file = path.join(dir, "regulation-ref.fixture.md");
  fs.writeFileSync(file, FRONTMATTER(extraFrontmatter) + body, "utf8");
  const reportDir = path.join(dir, "report");
  const result = parseLaws(file, reportDir);
  assert.equal(result.laws.length, 1);
  const report = JSON.parse(fs.readFileSync(path.join(reportDir, "parse-report-laws.json"), "utf8"));
  return { law: result.laws[0], report };
}

const rows = (chapters: ParsedChapter[]) =>
  chapters.flatMap((ch) =>
    ch.articles.map((a) => ({ chapter: ch.title, chapterRef: ch.regulation_ref ?? null, number: a.number, ref: a.regulation_ref ?? null })),
  );

// The law's article 1, then two merged regulations each with its OWN article 1.
const TWO_BLOCKS =
  chapter("الباب الأول", article(1, "نص المادة الأولى من النظام.") + article(2, "نص المادة الثانية من النظام.")) +
  block({ title: "لائحة التفتيش", instrument: "لائحة" }, chapter("الفصل الأول من لائحة التفتيش", article(1, "المادة الأولى من لائحة التفتيش."))) +
  block({ title: "لائحة  أعوان\nالقضاء" }, chapter("الفصل الأول من لائحة الأعوان", article(1, "المادة الأولى من لائحة الأعوان."))) +
  chapter("الباب الأخير", article(3, "نص المادة الثالثة من النظام."));

test("two attached blocks, each with an article 1: the law's article 1 has no ref, each block's article 1 has its own", () => {
  const { law, report } = parseOne(TWO_BLOCKS, MERGED);
  assert.deepEqual(rows(law.chapters), [
    { chapter: "الباب الأول", chapterRef: null, number: 1, ref: null },
    { chapter: "الباب الأول", chapterRef: null, number: 2, ref: null },
    { chapter: "الفصل الأول من لائحة التفتيش", chapterRef: "لائحة التفتيش", number: 1, ref: "لائحة التفتيش" },
    { chapter: "الفصل الأول من لائحة الأعوان", chapterRef: "لائحة أعوان القضاء", number: 1, ref: "لائحة أعوان القضاء" },
    { chapter: "الباب الأخير", chapterRef: null, number: 3, ref: null },
  ]);
  // Outside a block the key is absent (not undefined, not null): the parse output of a law
  // without blocks is byte-identical to before.
  assert.equal("regulation_ref" in law.chapters[0], false);
  assert.equal("regulation_ref" in law.chapters[0].articles[0], false);
  assert.equal(report.counts.regulationRefProblems, 0, "both titles are in merged_regulation_details (whitespace collapsed)");
});

test("a block title not found verbatim in merged_regulation_details[].name is reported; its articles still carry the title", () => {
  const { law, report } = parseOne(
    block({ title: "لائحة التفتيش القضائي" }, chapter("فصل", article(1, "نص."))) +
      block({ title: "لائحة التفتيش" }, chapter("فصل آخر", article(1, "نص آخر."))),
    MERGED,
  );
  assert.deepEqual(rows(law.chapters).map((r) => r.ref), ["لائحة التفتيش القضائي", "لائحة التفتيش"]);
  assert.equal(report.counts.regulationRefProblems, 1);
  assert.match(report.notes.regulationRefProblems[0], /«لائحة التفتيش القضائي» is not found verbatim in merged_regulation_details\[\]\.name/);
  // A merged name with no block (لائحة أعوان القضاء) is not a problem: it may be an inline REGULATION series.
});

test("no merged_regulation_details at all: every block title is reported", () => {
  const { report } = parseOne(block({ title: "لائحة التفتيش" }, chapter("فصل", article(1, "نص."))));
  assert.equal(report.counts.regulationRefProblems, 1);
});

test("an unreadable marker and an unclosed block are reported; nothing is guessed", () => {
  const body = `<!-- ATTACHED_REGULATION {"title": "مكسور" -->\nx\n<!-- ATTACHED_REGULATION_END -->\n<!-- ATTACHED_REGULATION {"name": "لائحة بلا نهاية"} -->\ny`;
  const blocks = findAttachedRegulationBlocks(body);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].name, null);
  assert.match(blocks[0].problem ?? "", /no readable title\/name/);
  assert.equal(blocks[1].name, "لائحة بلا نهاية", "`name` is read when there is no `title`");
  assert.match(blocks[1].problem ?? "", /no ATTACHED_REGULATION_END/);
  assert.equal(blocks[1].end, body.length, "an unclosed block runs to the end of the file");

  const chapters: ParsedChapter[] = [
    { source_index: blocks[0].start + 10, number: 1, title: "a", level: 1, articles: [] },
    { source_index: blocks[1].start + 10, number: 1, title: "b", level: 1, articles: [] },
    { number: -1, title: "__orphan__", level: 1, articles: [] },
  ];
  const problems = stampRegulationRefs(chapters, blocks, ["لائحة بلا نهاية"]);
  assert.equal(problems.length, 2);
  assert.equal("regulation_ref" in chapters[0], false, "an unreadable title stamps nothing");
  assert.equal(chapters[1].regulation_ref, "لائحة بلا نهاية");
  assert.equal("regulation_ref" in chapters[2], false, "the orphan chapter is never stamped");
});

test("a law with no attached block: no regulation_ref anywhere, no problem", () => {
  const { law, report } = parseOne(chapter("الباب الأول", article(1, "نص.")), MERGED);
  assert.equal(JSON.stringify(law).includes("regulation_ref"), false);
  assert.equal(report.counts.regulationRefProblems, 0);
});
