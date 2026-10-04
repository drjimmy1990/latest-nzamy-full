/**
 * Two-level chapters (owner-approved 2026-10-04, «الفصول بمستويين معتمد») and
 * the official_text_unpublished notice.
 *
 * Read-only: every input is a synthetic fixture written to a temp directory;
 * the parser only reads it. Run:
 *   npx tsx --test scripts/parsers/parse-laws.chapter-levels.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseLaws,
  resolveChapterLevel,
  resolveChapterParents,
  findChapterPartBoundaries,
  declaresUnpublishedOfficialText,
  type ParsedChapter,
} from "./parse-laws.ts";

const FRONTMATTER = (extra = "") => `---
id: TEST-CHAPTER-LEVELS
title: نظام اختباري
type: نظام
status: active
section_code: "00"
schema_version: "4.0"
${extra}---
`;

function writeFixture(body: string, extraFrontmatter = ""): { file: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-chapter-levels-"));
  const file = path.join(dir, "chapter-levels.fixture.md");
  fs.writeFileSync(file, FRONTMATTER(extraFrontmatter) + body, "utf8");
  return { file, dir };
}

const chapter = (meta: Record<string, unknown>, inner = "") =>
  `<!-- CHAPTER_START ${JSON.stringify(meta)} -->\n${inner}<!-- CHAPTER_END -->\n`;

const article = (n: number, text: string) =>
  `<!-- ARTICLE_START {"number": "${n}", "number_text": "المادة ${n}", "status": "active"} -->\n${text}\n<!-- ARTICLE_END -->\n`;

function parseOne(body: string, extraFrontmatter = "") {
  const { file, dir } = writeFixture(body, extraFrontmatter);
  const reportDir = path.join(dir, "report");
  const result = parseLaws(file, reportDir);
  assert.equal(result.laws.length, 1);
  const report = JSON.parse(fs.readFileSync(path.join(reportDir, "parse-report-laws.json"), "utf8"));
  return { law: result.laws[0], report };
}

const shape = (chapters: ParsedChapter[]) =>
  chapters.map((ch) => ({
    title: ch.title,
    level: ch.level,
    parent: ch.parent_source_index === undefined
      ? null
      : chapters.find((c) => c.source_index === ch.parent_source_index)?.title ?? "<missing>",
    articles: ch.articles.map((a) => a.number),
  }));

// ── resolveChapterLevel ──────────────────────────────────────────────────────

test("level: absent → 1; 1/2 as number or string; clamped and junk values are reported", () => {
  assert.deepEqual(resolveChapterLevel(undefined), { level: 1 });
  assert.deepEqual(resolveChapterLevel(null), { level: 1 });
  assert.deepEqual(resolveChapterLevel(""), { level: 1 });
  assert.deepEqual(resolveChapterLevel(1), { level: 1 });
  assert.deepEqual(resolveChapterLevel(2), { level: 2 });
  assert.deepEqual(resolveChapterLevel("2"), { level: 2 });
  assert.deepEqual(resolveChapterLevel("٢"), { level: 2 });
  for (const raw of [3, "3", 7]) {
    const r = resolveChapterLevel(raw);
    assert.equal(r.level, 2);
    assert.match(r.problem ?? "", /clamped to 2/);
  }
  for (const raw of [0, -1]) {
    const r = resolveChapterLevel(raw);
    assert.equal(r.level, 1);
    assert.match(r.problem ?? "", /clamped to 1/);
  }
  for (const raw of ["باب", true, { a: 1 }, "2a"]) {
    const r = resolveChapterLevel(raw);
    assert.equal(r.level, 1);
    assert.match(r.problem ?? "", /not a number/);
  }
});

// ── Parser fixtures ──────────────────────────────────────────────────────────

test("باب › فصل: an article-less level-1 باب is emitted and each فصل points at the باب before it", () => {
  const { law, report } = parseOne(
    chapter({ number: 1, title: "الباب الأول", level: 1 }) +
      chapter({ number: 1, title: "الفصل الأول", level: 2 }, article(1, "نص اختباري أول.")) +
      chapter({ number: 2, title: "الفصل الثاني", level: 2 }, article(2, "نص اختباري ثان.")) +
      chapter({ number: 2, title: "الباب الثاني", level: 1 }) +
      chapter({ number: 1, title: "الفصل الأول", level: 2 }, article(3, "نص اختباري ثالث.")),
  );
  assert.deepEqual(shape(law.chapters), [
    { title: "الباب الأول", level: 1, parent: null, articles: [] },
    { title: "الفصل الأول", level: 2, parent: "الباب الأول", articles: [1] },
    { title: "الفصل الثاني", level: 2, parent: "الباب الأول", articles: [2] },
    { title: "الباب الثاني", level: 1, parent: null, articles: [] },
    { title: "الفصل الأول", level: 2, parent: "الباب الثاني", articles: [3] },
  ]);
  // Identity is by source position, never by `number` (both «الفصل الأول» are number 1).
  assert.notEqual(law.chapters[1].parent_source_index, law.chapters[4].parent_source_index);
  assert.equal(law.total_articles, 3);
  assert.equal(report.counts.chapterLevelDiagnostics, 0);
});

test("فصل › فرع: a level-1 فصل with its own articles keeps them, and its فروع follow it", () => {
  const { law } = parseOne(
    chapter({ number: 1, title: "الفصل الأول", level: 1 }, article(1, "أحكام عامة.")) +
      chapter({ number: 1, title: "الفرع الأول", level: 2 }, article(2, "نص الفرع الأول.")) +
      chapter({ number: 2, title: "الفرع الثاني", level: "2" }, article(3, "نص الفرع الثاني.")),
  );
  assert.deepEqual(shape(law.chapters), [
    { title: "الفصل الأول", level: 1, parent: null, articles: [1] },
    { title: "الفرع الأول", level: 2, parent: "الفصل الأول", articles: [2] },
    { title: "الفرع الثاني", level: 2, parent: "الفصل الأول", articles: [3] },
  ]);
});

test("a level-2 chapter with no level-1 heading before it keeps no parent and is reported", () => {
  const { law, report } = parseOne(
    chapter({ number: 1, title: "الفصل اليتيم", level: 2 }, article(1, "نص.")) +
      chapter({ number: 1, title: "الباب الأول", level: 1 }) +
      chapter({ number: 1, title: "الفصل الأول", level: 2 }, article(2, "نص.")),
  );
  assert.equal(law.chapters[0].level, 2);
  assert.equal("parent_source_index" in law.chapters[0], false, "no invented parent, and no explicit undefined key");
  assert.equal(law.chapters[2].parent_source_index, law.chapters[1].source_index);
  assert.equal(report.counts.chapterLevelDiagnostics, 1);
  assert.match(report.notes.chapterLevelDiagnostics[0], /الفصل اليتيم.*no level-1 chapter before it/);
});

test("regulation isolation: a level-2 chapter inside an ATTACHED_REGULATION never attaches to the main law's باب", () => {
  const { law, report } = parseOne(
    chapter({ number: 1, title: "الباب الأول (النظام)", level: 1 }) +
      chapter({ number: 1, title: "الفصل الأول (النظام)", level: 2 }, article(1, "نص النظام.")) +
      `<!-- ATTACHED_REGULATION {"title": "اللائحة المرفقة", "instrument": "لائحة"} -->\n` +
      chapter({ number: 1, title: "الفصل الأول (اللائحة)", level: 2 }, article(2, "نص اللائحة.")) +
      chapter({ number: 2, title: "الباب الأول (اللائحة)", level: 1 }) +
      chapter({ number: 3, title: "الفصل الثاني (اللائحة)", level: 2 }, article(3, "نص اللائحة الثاني.")) +
      `<!-- ATTACHED_REGULATION_END -->\n` +
      chapter({ number: 4, title: "فصل بعد اللائحة", level: 2 }, article(4, "نص بعد اللائحة.")),
  );
  assert.deepEqual(shape(law.chapters), [
    { title: "الباب الأول (النظام)", level: 1, parent: null, articles: [] },
    { title: "الفصل الأول (النظام)", level: 2, parent: "الباب الأول (النظام)", articles: [1] },
    { title: "الفصل الأول (اللائحة)", level: 2, parent: null, articles: [2] },
    { title: "الباب الأول (اللائحة)", level: 1, parent: null, articles: [] },
    { title: "الفصل الثاني (اللائحة)", level: 2, parent: "الباب الأول (اللائحة)", articles: [3] },
    { title: "فصل بعد اللائحة", level: 2, parent: null, articles: [4] },
  ]);
  assert.equal(report.counts.chapterLevelDiagnostics, 2);
});

test("part boundaries: opening and closing ATTACHED_REGULATION markers, never inline REGULATION_END", () => {
  const body =
    `<!-- REGULATION {"ref": "x"} -->a<!-- REGULATION_END -->` +
    `<!-- ATTACHED_REGULATION {"title": "t"} -->b<!-- ATTACHED_REGULATION_END -->`;
  const boundaries = findChapterPartBoundaries(body);
  assert.equal(boundaries.length, 2);
  assert.ok(body.slice(boundaries[0]).startsWith("<!-- ATTACHED_REGULATION {"));
  assert.ok(body.slice(boundaries[1]).startsWith("<!-- ATTACHED_REGULATION_END"));
  // Pure parent resolver, positions only.
  const links = resolveChapterParents(
    [
      { source_index: 0, level: 1, title: "أ" },
      { source_index: 10, level: 2, title: "ب" },
      { source_index: 30, level: 2, title: "ج" },
      { title: "__orphan__", level: 1 },
    ],
    [20],
  );
  assert.deepEqual(links[0], {});
  assert.deepEqual(links[1], { parent_source_index: 0 });
  assert.equal(links[2].parent_source_index, undefined);
  assert.match(links[2].problem ?? "", /part 1/);
  assert.deepEqual(links[3], {});
});

test("a file without `level` parses as before: every chapter level 1, no parent key, same articles", () => {
  const plainBody =
    chapter({ number: 1, title: "الباب الأول", paddx: 1 }, article(1, "نص أول.") + article(2, "نص ثان.")) +
    chapter({ number: 2, title: "الباب الثاني", paddx: 1 }, article(3, "نص ثالث."));
  // Same byte length per marker: `"paddx":1` → `"level":1` keeps every
  // source_index identical, so the two parses must be deep-equal.
  const explicitBody = plainBody.replace(/"paddx":1/g, '"level":1');
  assert.equal(explicitBody.length, plainBody.length);
  const plain = parseOne(plainBody);
  const explicit = parseOne(explicitBody);
  for (const ch of plain.law.chapters) {
    assert.equal(ch.level, 1);
    assert.equal("parent_source_index" in ch, false);
  }
  assert.deepEqual(plain.law.chapters, explicit.law.chapters);
  // The only addition to a pre-levels chapter is `level: 1`.
  assert.deepEqual(
    plain.law.chapters.map((ch) => Object.keys(ch).sort()),
    plain.law.chapters.map(() => ["articles", "level", "number", "source_index", "title"]),
  );
  assert.deepEqual(plain.law.chapters.map((ch) => ch.articles.map((a) => a.text)), [["نص أول.", "نص ثان."], ["نص ثالث."]]);
  assert.equal(plain.report.counts.chapterLevelDiagnostics, 0);
});

test("the no-chapter and __orphan__ chapters are level 1 with no parent", () => {
  const noChapters = parseOne(article(1, "نص بلا أبواب."));
  assert.equal(noChapters.law.chapters.length, 1);
  assert.equal(noChapters.law.chapters[0].level, 1);
  assert.equal("parent_source_index" in noChapters.law.chapters[0], false);

  const withOrphan = parseOne(article(1, "مادة خارج الأبواب.") + chapter({ number: 1, title: "الباب الأول", level: 1 }, article(2, "نص.")));
  const orphan = withOrphan.law.chapters.find((ch) => ch.title === "__orphan__");
  assert.ok(orphan);
  assert.equal(orphan.level, 1);
  assert.equal("parent_source_index" in orphan, false);
});

// ── official_text_unpublished ───────────────────────────────────────────────

const NOTICE = "لم يُنشر النص الرسمي لهذه الوثيقة بعد، ويُكتفى هنا بالإشارة إلى صدورها وفق ما أعلنته الجهة المختصة رسمياً.";

test("unpublished official text: the notice becomes the description, no article, no empty chapter", () => {
  const { law, report } = parseOne(`${NOTICE}\n`, "text_availability: official_text_unpublished\ntotal_articles: 0\n");
  assert.equal(law.total_articles, 0);
  assert.deepEqual(law.chapters, []);
  assert.equal(law.description, NOTICE);
  assert.equal(report.counts.unpublishedTextNotices, 1);
  assert.equal(report.counts.syntheticWholeDocumentArticles, 0);
});

test("unpublished flag predicate: needs the flag and no positive total_articles", () => {
  assert.equal(declaresUnpublishedOfficialText({ text_availability: "official_text_unpublished", total_articles: 0 }), true);
  assert.equal(declaresUnpublishedOfficialText({ text_availability: "official_text_unpublished" }), true);
  assert.equal(declaresUnpublishedOfficialText({ text_availability: "official_text_unpublished", total_articles: "0" }), true);
  assert.equal(declaresUnpublishedOfficialText({ text_availability: "official_text_unpublished", total_articles: 4 }), false);
  assert.equal(declaresUnpublishedOfficialText({ total_articles: 0 }), false);
  assert.equal(declaresUnpublishedOfficialText({ text_availability: "full_text", total_articles: 0 }), false);
});

test("without the flag the same body is still one synthetic «الصفحة 1» (unchanged behaviour)", () => {
  const { law } = parseOne(`${NOTICE}\n`, "total_articles: 0\n");
  assert.equal(law.total_articles, 1);
  assert.equal(law.chapters[0].articles[0].number_text, "الصفحة 1");
  assert.equal(law.description, undefined);
});

test("the flag on a file that has article anchors changes nothing and is reported", () => {
  const { law, report } = parseOne(article(1, "نص مادة حقيقية."), "text_availability: official_text_unpublished\ntotal_articles: 0\n");
  assert.equal(law.total_articles, 1);
  assert.equal(law.chapters[0].articles[0].text, "نص مادة حقيقية.");
  assert.equal(law.description, undefined);
  assert.equal(report.counts.unpublishedTextNotices, 1);
  assert.match(report.notes.unpublishedTextNotices[0], /1 article\(s\) parsed/);
});

test("a positive total_articles with the flag is a contradiction: parsed as before and reported", () => {
  const { law, report } = parseOne(`${NOTICE}\n`, "text_availability: official_text_unpublished\ntotal_articles: 3\n");
  assert.equal(law.total_articles, 1);
  assert.equal(law.description, undefined);
  assert.equal(report.counts.unpublishedTextNotices, 1);
});
