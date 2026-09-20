/** Corpus-only regression for status provenance versus historical article IDs. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { unambiguousIdentityFixtures } from "./corpus-scope-test-fixtures";
import { resolveArticleIdentityStatus, resolveLawArticleIds, seedLaws } from "./seed-library.ts";
import { historicalParseFile } from "./test-evidence.ts";

const BASELINE = historicalParseFile("baseline-laws.json", "/Volumes/باك اب المكتبة القانونية/Raw_Vault_Archive/بذر_جاف_تيست_20260918_QUdyGW/laws.json");
const WIDE = historicalParseFile("wide-laws.json", "/Volumes/باك اب المكتبة القانونية/Raw_Vault_Archive/تسليم_تيست_status_undeclared_20260918_134000/49_parse-laws_status_undeclared_20260918_134500/laws.json");
const BASELINE_SHA256 = "2d05261f82539391b3b381c5373646699cb96181c0bfa4c95a10a60d7a8f2b2e";
const WIDE_SHA256 = "09b5ac929fe00d8d91a87b350168c740a88b6af756812229514bff660f8f62bd";

type Row = Record<string, any>;
const sha256 = (value: crypto.BinaryLike) => crypto.createHash("sha256").update(value).digest("hex");

function articleIds(laws: Row[], identityOf: (article: Row) => string): string[] {
  const legacyIds: string[] = [];
  for (const law of laws) {
    const lawId = String(law.slug || law.id);
    if (lawId.includes("EXTRACTION_REPORT")) continue;
    const seen = new Set<string>();
    const build = (core: string) => {
      const full = `${lawId}${core}`;
      return full.length <= 150 ? full : `${lawId.substring(0, Math.max(0, 150 - core.length))}${core}`;
    };
    for (const chapter of (law.chapters || []) as Row[]) {
      const articles = (chapter.articles || []) as Row[];
      for (const article of articles) {
        const hasRealNumber = article.number !== null && article.number !== undefined && article.number !== 0;
        const baseNum = hasRealNumber ? article.number : `i${articles.indexOf(article)}`;
        const identityStatus = identityOf(article);
        let core = `__art-${baseNum}${identityStatus === "active" ? "" : `-${identityStatus}`}`;
        let id = build(core);
        if (seen.has(id)) {
          core = `${core}__ch${chapter.number ?? "x"}_i${articles.indexOf(article)}`;
          id = build(core);
        }
        seen.add(id);
        legacyIds.push(id);
      }
    }
  }
  return resolveLawArticleIds(legacyIds);
}

test("provenance restores every historical ID that a missing-status correction would otherwise change", async () => {
  const baselineBytes = fs.readFileSync(BASELINE);
  const wideBytes = fs.readFileSync(WIDE);
  assert.equal(sha256(baselineBytes), BASELINE_SHA256);
  assert.equal(sha256(wideBytes), WIDE_SHA256);
  const baseline = JSON.parse(baselineBytes.toString("utf8")) as { laws: Row[] };
  const wide = JSON.parse(wideBytes.toString("utf8")) as { laws: Row[] };

  let newlyUndeclared = 0;
  const wideWithProvenance: Row[] = wide.laws.map((law, lawIndex) => ({
    ...law,
    chapters: ((law.chapters || []) as Row[]).map((chapter, chapterIndex) => ({
      ...chapter,
      articles: ((chapter.articles || []) as Row[]).map((article, articleIndex) => {
        const prior = baseline.laws[lawIndex]?.chapters?.[chapterIndex]?.articles?.[articleIndex];
        assert.ok(prior, "baseline occurrence exists at the same source position");
        assert.equal(String(prior.text || ""), String(article.text || ""), "status experiment did not change article text");
        if (prior.status === "active" && article.status === "status_undeclared") {
          newlyUndeclared++;
          return { ...article, status_provenance: "missing", status_legacy_identity: "active" };
        }
        return { ...article, status_provenance: "explicit", status_legacy_identity: article.status };
      }),
    })),
  }));

  const baselineIds = articleIds(baseline.laws, (article) => String(article.status));
  const wideIdsWithoutProvenance = articleIds(wide.laws, (article) => String(article.status));
  const wideIdsWithProvenance = articleIds(wideWithProvenance, (article) => resolveArticleIdentityStatus(article));
  assert.equal(baselineIds.length, 110_794);
  assert.equal(newlyUndeclared, 52_646);
  // Duplicate-resolution cascades can change additional IDs beyond the
  // articles whose status changed: measure the actual identity delta.
  assert.equal(baselineIds.filter((id, index) => id !== wideIdsWithoutProvenance[index]).length, 52_795);
  assert.equal(baselineIds.filter((id, index) => id !== wideIdsWithProvenance[index]).length, 0);

  const selectedFixtures = unambiguousIdentityFixtures(wideWithProvenance);
  const selectedIds = new Set(selectedFixtures.map(row => row.slug || row.id));
  const selectedBaselineIds = articleIds(baseline.laws.filter(row => selectedIds.has(row.slug || row.id)), article => String(article.status));

  // Independently exercise the actual seeder rather than only duplicating its
  // identity formula above. The client is in-memory and has no network target.
  const actualArticles: Row[] = [];
  const fakeClient = {
    async upsert(table: string, rows: Row[]) {
      if (table === "articles") actualArticles.push(...rows);
      return { data: rows, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedLaws(fakeClient as never, { laws: selectedFixtures } as Row, false, errors, false);
  assert.deepEqual(errors, []);
  const expectedArticles = selectedFixtures.flatMap((law) =>
    ((law.chapters || []) as Row[]).flatMap((chapter) => (chapter.articles || []) as Row[]));
  assert.equal(expectedArticles.length, actualArticles.length);
  for (let index = 0; index < actualArticles.length; index++) {
    assert.equal(actualArticles[index].id, selectedBaselineIds[index], `seeder changed historic ID at ${index}`);
    assert.equal(actualArticles[index].status, expectedArticles[index].status, `seeder changed status at ${index}`);
    assert.equal(sha256(String(actualArticles[index].text || "")), sha256(String(expectedArticles[index].text || "")), `seeder changed text at ${index}`);
  }
});
