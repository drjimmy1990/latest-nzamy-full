/** Compare the current full parser result with the fixed pre-status baseline. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { unambiguousIdentityFixtures } from "./corpus-scope-test-fixtures";
import { seedLaws } from "./seed-library.ts";
import { historicalParseFile } from "./test-evidence.ts";

const BASELINE = historicalParseFile("baseline-laws.json", "/Volumes/باك اب المكتبة القانونية/Raw_Vault_Archive/بذر_جاف_تيست_20260918_QUdyGW/laws.json");
const CURRENT = historicalParseFile("current-laws.json", "/Volumes/باك اب المكتبة القانونية/Raw_Vault_Archive/قياس_حالة_الأنظمة_تيست_20260918_GWU3JW/laws.json");
const BASELINE_SHA256 = "2d05261f82539391b3b381c5373646699cb96181c0bfa4c95a10a60d7a8f2b2e";
const CURRENT_SHA256 = "ac54a86b3efd23da1a60f95023c1260153e071f496d5cb7ea6ab74a52a5b58f3";

type Row = Record<string, any>;
const sha256 = (value: crypto.BinaryLike) => crypto.createHash("sha256").update(value).digest("hex");

function load(path: string, expectedHash: string): { laws: Row[] } {
  const bytes = fs.readFileSync(path);
  assert.equal(sha256(bytes), expectedHash);
  return JSON.parse(bytes.toString("utf8"));
}

async function seededArticles(data: { laws: Row[] }): Promise<Row[]> {
  const articles: Row[] = [];
  const fakeClient = {
    async upsert(table: string, rows: Row[]) {
      if (table === "articles") articles.push(...rows);
      return { data: rows, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedLaws(fakeClient as never, { laws: unambiguousIdentityFixtures(data.laws) } as Row, false, errors, false);
  assert.deepEqual(errors, []);
  return articles;
}

test("current full parse preserves every historical article ID and text while correcting missing status", async () => {
  const baseline = load(BASELINE, BASELINE_SHA256);
  const current = load(CURRENT, CURRENT_SHA256);
  assert.equal(baseline.laws.length, 5_901);
  assert.equal(current.laws.length, 5_901);

  let missing = 0;
  let explicit = 0;
  let synthetic = 0;
  for (const law of current.laws) {
    for (const chapter of (law.chapters || []) as Row[]) {
      for (const article of (chapter.articles || []) as Row[]) {
        if (article.status_provenance === "missing") missing++;
        else if (article.status_provenance === "explicit") explicit++;
        else if (article.status_provenance === "synthetic_parent_legacy") synthetic++;
        else assert.fail(`unknown status provenance: ${article.status_provenance}`);
      }
    }
  }
  assert.equal(missing, 52_644);
  assert.equal(explicit, 57_984);
  assert.equal(synthetic, 166);

  const before = await seededArticles(baseline);
  const after = await seededArticles(current);
  const selectedBaseline = unambiguousIdentityFixtures(baseline.laws).flatMap(law => law.chapters.flatMap((chapter: Row) => chapter.articles));
  const selectedCurrent = unambiguousIdentityFixtures(current.laws).flatMap(law => law.chapters.flatMap((chapter: Row) => chapter.articles));
  assert.equal(before.length, selectedBaseline.length);
  assert.equal(after.length, selectedCurrent.length);
  assert.equal(after.length, before.length);
  let changedStatus = 0;
  let undeclared = 0;
  for (let index = 0; index < before.length; index++) {
    const oldRow = before[index];
    const newRow = after[index];
    assert.equal(newRow.id, oldRow.id, `changed ID at ${index}`);
    assert.equal(newRow.chapter_id, oldRow.chapter_id, `changed chapter FK at ${index}`);
    assert.equal(newRow.number, oldRow.number, `changed locator at ${index}`);
    assert.equal(newRow.number_text, oldRow.number_text, `changed locator text at ${index}`);
    assert.equal(sha256(String(newRow.text || "")), sha256(String(oldRow.text || "")), `changed text at ${index}`);
    if (newRow.status !== oldRow.status) changedStatus++;
    if (newRow.status === "status_undeclared") undeclared++;
  }
  assert.equal(changedStatus, selectedCurrent.filter((row, index) => row.status !== selectedBaseline[index].status).length);
  assert.equal(undeclared, selectedCurrent.filter(row => row.status === "status_undeclared").length);
  const historicalBefore = baseline.laws.flatMap(law => law.chapters.flatMap((chapter: Row) => chapter.articles));
  const historicalAfter = current.laws.flatMap(law => law.chapters.flatMap((chapter: Row) => chapter.articles));
  assert.equal(historicalBefore.length, 110_794);
  assert.equal(historicalAfter.filter((row, index) => row.status !== historicalBefore[index].status).length, 52_810);
  assert.equal(historicalAfter.filter(row => row.status === "status_undeclared").length, 53_381);
});
