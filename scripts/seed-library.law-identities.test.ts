/** Read-only corpus regression for law chapter/article identity collisions. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { unambiguousIdentityFixtures } from "./corpus-scope-test-fixtures";
import { resolveLawArticleIds, resolveLawChapterIds, seedLaws, toUuid } from "./seed-library.ts";
import { corpusFile, historicalParseFile } from "./test-evidence.ts";

// Deliberately external, immutable test evidence. This makes the test a local
// corpus-regression check, not a portable unit test for a fresh checkout.
const LAWS = historicalParseFile("baseline-laws.json", "/Volumes/باك اب المكتبة القانونية/Raw_Vault_Archive/بذر_جاف_تيست_20260918_QUdyGW/laws.json");
const LAWS_SHA256 = "2d05261f82539391b3b381c5373646699cb96181c0bfa4c95a10a60d7a8f2b2e";
const EIGHT_SOURCE = corpusFile(["أنظمة ولوائح", "07 - القسم العقاري والبناء", "قواعد عمل تنظيم بيع أو تأجير وحدات عقارية على الخارطة لعام 1439هـ", "NCAR-DOC-01364_هيئات-1-220_1439-03-09_قواعد عمل تنظيم بيع أو تأجير وحدات عقارية على الخارطة.md"], "/Users/nezamy/Projects/Raw_Vault/01_المكتبة_القانونية/أنظمة ولوائح/07 - القسم العقاري والبناء/قواعد عمل تنظيم بيع أو تأجير وحدات عقارية على الخارطة لعام 1439هـ/NCAR-DOC-01364_هيئات-1-220_1439-03-09_قواعد عمل تنظيم بيع أو تأجير وحدات عقارية على الخارطة.md");
const EIGHT_SOURCE_SHA256 = "c6708aeccc650955f6650e7e4df9176afb8e793a66cbf49748b3359631c92e2c";
const TARGET_SLUG = "off-plan-real-estate-units-sale-lease-work-rules-1439h";

type Row = Record<string, any>;
type ExpectedArticle = { lawId: string; chapter: Row; article: Row; legacyId: string; id?: string; chapterId?: string };
type ExpectedChapter = { lawId: string; chapter: Row; legacyId: string; id?: string };
const sha256 = (value: crypto.BinaryLike) => crypto.createHash("sha256").update(value).digest("hex");

function expectedIdentityPlan(laws: Row[]) {
  const chapters: ExpectedChapter[] = [];
  const articles: ExpectedArticle[] = [];
  for (const law of laws) {
    const lawId = String(law.slug || law.id);
    if (lawId.includes("EXTRACTION_REPORT")) continue;
    const sourceChapters = (law.chapters || []) as Row[];
    const seenArticleIds = new Set<string>();
    const buildArticleId = (core: string) => {
      const full = `${lawId}${core}`;
      return full.length <= 150 ? full : `${lawId.substring(0, Math.max(0, 150 - core.length))}${core}`;
    };
    for (const chapter of sourceChapters) {
      const expectedChapter: ExpectedChapter = {
        lawId, chapter,
        legacyId: toUuid(`${lawId}__ch-${chapter.number ?? sourceChapters.indexOf(chapter)}`),
      };
      chapters.push(expectedChapter);
      const sourceArticles = (chapter.articles || []) as Row[];
      for (const article of sourceArticles) {
        const hasRealNumber = article.number !== null && article.number !== undefined && article.number !== 0;
        const baseNum = hasRealNumber ? article.number : `i${sourceArticles.indexOf(article)}`;
        const statusSuffix = article.status && article.status !== "active" ? `-${article.status}` : "";
        let core = `__art-${baseNum}${statusSuffix}`;
        let legacyId = buildArticleId(core);
        if (seenArticleIds.has(legacyId)) {
          core = `${core}__ch${chapter.number ?? "x"}_i${sourceArticles.indexOf(article)}`;
          legacyId = buildArticleId(core);
        }
        seenArticleIds.add(legacyId);
        articles.push({ lawId, chapter, article, legacyId, chapterId: expectedChapter.legacyId });
      }
    }
  }
  const chapterIds = resolveLawChapterIds(chapters.map(({ legacyId }) => legacyId));
  const articleIds = resolveLawArticleIds(articles.map(({ legacyId }) => legacyId));
  chapters.forEach((entry, index) => { entry.id = chapterIds[index]; });
  const byChapter = new Map(chapters.map((entry) => [entry.chapter, entry.id]));
  articles.forEach((entry, index) => {
    entry.id = articleIds[index];
    entry.chapterId = byChapter.get(entry.chapter);
  });
  return { chapters, articles, chapterIds, articleIds };
}

test("seeds all law chapters/articles with stable IDs, exact content, and occurrence-correct FKs", async () => {
  const bytes = fs.readFileSync(LAWS);
  assert.equal(sha256(bytes), LAWS_SHA256);
  assert.equal(sha256(fs.readFileSync(EIGHT_SOURCE)), EIGHT_SOURCE_SHA256);
  const data = JSON.parse(bytes.toString("utf8")) as { laws: Row[] };
  const { chapters: expectedChapters, articles: expectedArticles, chapterIds, articleIds } = expectedIdentityPlan(data.laws);
  assert.equal(expectedChapters.length, 12_629);
  assert.equal(expectedArticles.length, 110_794);
  assert.equal(new Set(chapterIds).size, 12_629);
  assert.equal(new Set(articleIds).size, 110_794);

  const chapterGroups = new Map<string, ExpectedChapter[]>();
  for (const chapter of expectedChapters) chapterGroups.set(chapter.legacyId, [...(chapterGroups.get(chapter.legacyId) || []), chapter]);
  const collisions = [...chapterGroups.values()].filter((group) => group.length > 1);
  assert.equal(collisions.length, 216);
  assert.equal(collisions.reduce((sum, group) => sum + group.length - 1, 0), 444);
  assert.equal(collisions.filter((group) => new Set(group.map(({ chapter }) => String(chapter.title || ""))).size > 1).length, 210);
  for (const group of collisions) {
    const last = group.at(-1)!;
    assert.equal(last.id, last.legacyId, "last Map survivor retains its historic chapter id");
    for (const earlier of group.slice(0, -1)) assert.notEqual(earlier.id, earlier.legacyId);
  }

  const fixtures = unambiguousIdentityFixtures(data.laws);
  const selectedPlan = expectedIdentityPlan(fixtures);

  const inserted = new Map<string, Row[]>();
  const fakeClient = {
    async upsert(table: string, rows: Row[]) {
      inserted.set(table, [...(inserted.get(table) || []), ...rows]);
      return { data: rows, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedLaws(fakeClient as never, { laws: fixtures } as Row, false, errors, false);
  assert.deepEqual(errors, []);

  const chapterRows = inserted.get("chapters") || [];
  const articleRows = inserted.get("articles") || [];
  assert.equal(chapterRows.length, selectedPlan.chapters.length);
  assert.equal(articleRows.length, selectedPlan.articles.length);
  assert.equal(new Set(chapterRows.map(({ id }) => String(id))).size, selectedPlan.chapters.length);
  assert.equal(new Set(articleRows.map(({ id }) => String(id))).size, selectedPlan.articles.length);
  const chaptersById = new Map(chapterRows.map((row) => [String(row.id), row]));
  const articlesById = new Map(articleRows.map((row) => [String(row.id), row]));

  for (const expected of selectedPlan.chapters) {
    const row = chaptersById.get(expected.id!);
    assert.ok(row, `missing chapter occurrence ${expected.id}`);
    assert.equal(row.law_slug, expected.lawId);
    assert.equal(row.number, expected.chapter.number || 0);
    assert.equal(row.title, expected.chapter.title || "");
  }

  let expectedAmendments = 0;
  let expectedRegulations = 0;
  for (const expected of selectedPlan.articles) {
    const row = articlesById.get(expected.id!);
    assert.ok(row, `missing article occurrence ${expected.id}`);
    assert.equal(row.law_slug, expected.lawId);
    assert.equal(row.chapter_id, expected.chapterId, `article parent is its source chapter occurrence: ${expected.id}`);
    assert.ok(chaptersById.has(String(row.chapter_id)));
    assert.equal(row.number, String(expected.article.number || "0").substring(0, 20));
    assert.equal(sha256(String(row.text || "")), sha256(String(expected.article.text || "")), `article text changed: ${expected.id}`);
    expectedAmendments += ((expected.article.amendments || []) as Row[]).length;
    expectedRegulations += ((expected.article.regulations || []) as Row[]).length;
  }

  const amendments = inserted.get("article_amendments") || [];
  const regulations = inserted.get("article_regulations") || [];
  assert.equal(amendments.length, expectedAmendments);
  assert.equal(regulations.length, expectedRegulations);
  assert.equal(new Set(amendments.map(({ id }) => String(id))).size, amendments.length);
  assert.equal(new Set(regulations.map(({ id }) => String(id))).size, regulations.length);
  const amendmentsById = new Map(amendments.map((row) => [String(row.id), row]));
  const regulationsById = new Map(regulations.map((row) => [String(row.id), row]));
  for (const row of amendments) assert.ok(articlesById.has(String(row.article_id)), "amendment FK targets its repaired article");
  for (const row of regulations) assert.ok(articlesById.has(String(row.article_id)), "regulation FK targets its repaired article");
  for (const expected of selectedPlan.articles) {
    for (const [index, amendment] of ((expected.article.amendments || []) as Row[]).entries()) {
      const row = amendmentsById.get(toUuid(`${expected.id}__amd-${index}`));
      assert.ok(row, "derived amendment identity remains present");
      assert.equal(row.article_id, expected.id, "amendment retains its exact article parent");
      assert.equal(row.summary, amendment.summary || "");
    }
    for (const [index, regulation] of ((expected.article.regulations || []) as Row[]).entries()) {
      const row = regulationsById.get(toUuid(`${expected.id}__reg-${index}`));
      assert.ok(row, "derived regulation identity remains present");
      assert.equal(row.article_id, expected.id, "regulation retains its exact article parent");
      assert.equal(sha256(String(row.text || "")), sha256(String(regulation.text || "")));
    }
  }

  const target = selectedPlan.articles.filter(({ lawId }) => lawId === TARGET_SLUG);
  assert.equal(target.length, 62, "all target source article occurrences remain present");
  assert.equal(new Set(target.map(({ id }) => id)).size, 62);
  for (const expected of target) {
    const row = articlesById.get(expected.id!);
    assert.ok(row);
    assert.equal(row.chapter_id, expected.chapterId);
    assert.equal(sha256(String(row.text || "")), sha256(String(expected.article.text || "")));
  }
});
