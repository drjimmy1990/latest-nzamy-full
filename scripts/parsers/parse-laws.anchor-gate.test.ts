/**
 * Owner package 19 Nov, items 1.4 / 4.3 / 1.3 — the anchor gate, end to end
 * on temp fixtures (no corpus, no database):
 *   - an anchor whose JSON spans lines is read (it used to vanish silently);
 *   - an anchor the parser cannot read, or a chapter / article it loses,
 *     refuses the run (like a malformed anchor file);
 *   - `total_articles` ≠ the parsed count is listed, never gating;
 *   - decrees and precedents get the same join and gate;
 *   - a parent_law_id outside a small run says it may be a partial run.
 *
 *   node --import tsx --test scripts/parsers/parse-laws.anchor-gate.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { afterEach } from "node:test";
import { parseLaws } from "./parse-laws.ts";
import { parseDecrees } from "./parse-decrees.ts";
import { parsePrecedents } from "./parse-precedents.ts";

// A refused fixture sets process.exitCode for a CLI caller, as intended; the
// assertions check it where it matters, so it must not fail this test file.
afterEach(() => {
  process.exitCode = 0;
});

function lawFile(body: string, frontmatterExtra = ""): { file: string; reportDir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-anchor-gate-"));
  const file = path.join(dir, "law.md");
  fs.writeFileSync(
    file,
    `---\nid: TEST-ANCHOR-GATE\ntitle: نظام اختباري للمراسي\ntype: نظام\nstatus: active\nsection_code: "00"\n${frontmatterExtra}---\n${body}`,
    "utf8",
  );
  const reportDir = path.join(dir, "report");
  fs.mkdirSync(reportDir);
  return { file, reportDir };
}

function report(reportDir: string, type: string) {
  const name = fs.readdirSync(reportDir).find((f) => f.startsWith(`parse-report-${type}`));
  assert.ok(name, `the ${type} parse report is written`);
  return JSON.parse(fs.readFileSync(path.join(reportDir, name), "utf8"));
}

const ONE_LINE = (n: string, text: string) =>
  `<!-- ARTICLE_START {"number": "${n}", "number_text": "المادة ${n}", "status": "active"} -->\n${text}\n<!-- ARTICLE_END -->\n`;

test("a two-line ARTICLE_START, CHAPTER_START, AMENDMENT and REGULATION are read and listed; the rest is as before", () => {
  const body =
    `<!-- CHAPTER_START {\n  "number": 1,\n  "title": "الباب الأول"\n} -->\n` +
    ONE_LINE("1", "نص المادة الأولى.") +
    `<!-- ARTICLE_START {"number": "2",\n "number_text": "المادة 2", "status": "active"} -->\n` +
    `نص المادة الثانية.\n` +
    `<!-- REGULATION {"ref": "اللائحة",\n "regNum": "2/1"} -->\nنص لائحي.\n` +
    `<details><summary>📜 الإصدارات السابقة</summary>\n\n<!-- AMENDMENT {"decree": "م/113",\n "date": "1445/03/01هـ"} -->\nالنص السابق.\n\n</details>\n` +
    `<!-- ARTICLE_END -->\n` +
    ONE_LINE("3", "نص المادة الثالثة.") +
    `<!-- CHAPTER_END -->\n`;
  const { file, reportDir } = lawFile(body);
  const law = parseLaws(file, reportDir).laws[0];
  const articles = law.chapters.flatMap((c) => c.articles);
  assert.deepEqual(articles.map((a) => a.number), [1, 2, 3], "article 2 no longer vanishes");
  assert.equal(law.chapters[0].title, "الباب الأول");
  assert.equal(articles[1].regulations[0].ref, "اللائحة");
  assert.equal(articles[1].amendments[0].decree, "م/113");
  assert.equal(articles[1].amendments[0].date, "1445/03/01هـ");
  const r = report(reportDir, "laws");
  assert.equal(r.counts.anchorJoins, 4);
  assert.equal(r.counts.anchorProblems, 0);
  assert.match(r.notes.anchorJoins[0], /^law\.md:8 — CHAPTER_START anchor joined 4 lines into one$/);
});

test("one-line ARTICLE_START JSON that does not parse refuses the run and names the line", () => {
  const { file, reportDir } = lawFile(ONE_LINE("1", "أ") + `<!-- ARTICLE_START {"number": "2",} -->\nب\n<!-- ARTICLE_END -->\n`);
  assert.throws(() => parseLaws(file, reportDir), /Law parse rejected/);
  const r = report(reportDir, "laws");
  assert.equal(r.counts.anchorProblems, 2);
  assert.match(r.notes.anchorProblems[0], /^law\.md:11 — ARTICLE_START: the JSON does not parse/);
  assert.equal(r.notes.anchorProblems[1], "law.md — ARTICLE_START: 2 in the source, 1 parsed (1 lost)");
});

test("a CHAPTER_START with no CHAPTER_END is a lost chapter: the run is refused", () => {
  const body =
    `<!-- CHAPTER_START {"number": 1, "title": "الفصل الأول"} -->\n` + ONE_LINE("1", "أ") + `<!-- CHAPTER_END -->\n` +
    `<!-- CHAPTER_START {"number": 2, "title": "الفصل الثاني"} -->\n` + ONE_LINE("2", "ب");
  const { file, reportDir } = lawFile(body);
  assert.throws(() => parseLaws(file, reportDir), /Law parse rejected/);
  assert.deepEqual(report(reportDir, "laws").notes.anchorProblems, ["law.md — CHAPTER_START: 2 in the source, 1 parsed (1 lost)"]);
});

test("an AMENDMENT outside any article is a lost card: the run is refused", () => {
  const { file, reportDir } = lawFile(`<!-- AMENDMENT {"decree": "م/1"} -->\nخارج المواد.\n` + ONE_LINE("1", "أ"));
  assert.throws(() => parseLaws(file, reportDir), /Law parse rejected/);
  assert.deepEqual(report(reportDir, "laws").notes.anchorProblems, ["law.md — AMENDMENT: 1 in the source, 0 parsed (1 lost)"]);
});

test("a latent-recovered article and the whole-document article are not shortfalls", () => {
  const latent = lawFile(
    `<!-- ARTICLE_START {"number":"5","number_text":"المادة الخامسة"} -->\nمتن.\n` +
      `<!-- REGULATION {"ref":"المادة 6 من اللائحة","regNum":"6"} -->\n<!-- ARTICLE_END -->\n` +
      `<!-- ARTICLE_START {"number":"6","number_text":"المادة السادسة","latent_recovered":true} -->\nنص كامن.\n<!-- ARTICLE_END -->\n`,
  );
  assert.equal(parseLaws(latent.file, latent.reportDir).laws[0].total_articles, 1);
  assert.equal(report(latent.reportDir, "laws").counts.anchorProblems, 0);
  const whole = lawFile("نص الوثيقة كاملاً بلا مراسٍ، وهو نص طويل بما يكفي ليُعدّ مادة واحدة.\n");
  assert.equal(parseLaws(whole.file, whole.reportDir).laws[0].total_articles, 1);
  assert.equal(report(whole.reportDir, "laws").counts.anchorProblems, 0);
});

test("item 4.3: total_articles ≠ the parsed count is listed with the anchor count, and does not refuse the run", () => {
  const { file, reportDir } = lawFile(ONE_LINE("1", "أ") + ONE_LINE("2", "ب"), "total_articles: 5\n");
  assert.equal(parseLaws(file, reportDir).laws[0].total_articles, 2);
  assert.deepEqual(report(reportDir, "laws").notes.totalArticlesMismatches, [
    "law.md — total_articles 5 in the frontmatter / 2 ARTICLE_START in the source / 2 parsed",
  ]);
});

test("gap 1.8 (c): a parent outside a small run is listed as a possible partial run", () => {
  const { file, reportDir } = lawFile(ONE_LINE("1", "أ"), "parent_law_id: LAW-00-9999\n");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("type: نظام", "type: لائحة تنفيذية"));
  parseLaws(file, reportDir);
  const lines = report(reportDir, "laws").notes.parentLinkProblems as string[];
  assert.equal(lines.length, 1);
  assert.match(lines[0], /names no law of this run — no link \(orphan list; on a partial run, e\.g\. a 3-file trial, the parent may simply not be in the input\)/);
});

test("decrees: a two-line ARTICLE_START is read as a page; unreadable JSON refuses the run", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-anchor-gate-dec-"));
  const good = path.join(dir, "تعميم.md");
  fs.writeFileSync(
    good,
    `---\ntitle: تعميم اختباري\ntype: تعميم\n---\n<!-- ARTICLE_START {\n"number": 1} -->\nأولاً.\n<!-- ARTICLE_END -->\n<!-- ARTICLE_START {"number": 2} -->\nثانياً.\n<!-- ARTICLE_END -->\n`,
    "utf8",
  );
  const out = parseDecrees(good, dir);
  assert.deepEqual(out.decrees[0].articles.map((a) => [a.number, a.text]), [[1, "أولاً."], [2, "ثانياً."]]);
  assert.equal(report(dir, "decrees").counts.anchorJoins, 1);

  const badDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-anchor-gate-dec-bad-"));
  const bad = path.join(badDir, "تعميم.md");
  fs.writeFileSync(bad, `---\ntitle: تعميم اختباري\ntype: تعميم\n---\n<!-- ARTICLE_START {"number": 1,} -->\nأولاً.\n<!-- ARTICLE_END -->\n`, "utf8");
  const before = process.exitCode;
  parseDecrees(bad, badDir);
  assert.equal(process.exitCode, 1, "the decree run does not report success");
  process.exitCode = before;
  assert.equal(report(badDir, "decrees").counts.anchorProblems, 1);
});

test("precedents: a two-line PRINCIPLE_START is a principle; one that does not parse refuses the run", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-anchor-gate-prec-"));
  const f = path.join(dir, "مبادئ.md");
  const fm = `---\ntitle: مبادئ اختبارية\nslug: test-principles\ncourt: المحكمة العليا\n---\n`;
  fs.writeFileSync(
    f,
    `${fm}<!-- PRINCIPLE_START {"number": 1} -->\n> مبدأ أول.\n<!-- PRINCIPLE_END -->\n<!-- PRINCIPLE_START {\n  "number": 2\n} -->\n> مبدأ ثانٍ.\n<!-- PRINCIPLE_END -->\n`,
    "utf8",
  );
  const before = process.exitCode;
  const out = parsePrecedents(f, dir);
  assert.equal(out.collections[0].principles.length, 2);
  assert.equal(report(dir, "precedents").counts.anchorJoins, 1);
  assert.equal(report(dir, "precedents").counts.anchorProblems, 0);

  const badDir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-anchor-gate-prec-bad-"));
  const g = path.join(badDir, "مبادئ.md");
  fs.writeFileSync(g, `${fm}<!-- PRINCIPLE_START {"number": 1} -->\n> مبدأ.\n<!-- PRINCIPLE_END -->\n<!-- PRINCIPLE_START {"number": 2,} -->\n> مفقود.\n<!-- PRINCIPLE_END -->\n`, "utf8");
  parsePrecedents(g, badDir);
  assert.equal(process.exitCode, 1);
  process.exitCode = before;
  const r = report(badDir, "precedents");
  assert.equal(r.counts.anchorProblems, 2, "the unreadable anchor and the lost principle");
});
