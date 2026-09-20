/** Read-only fake-client witness for the corrected direction in Cabinet Decision 154. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { unambiguousIdentityFixtures } from "./corpus-scope-test-fixtures";
import { seedDecrees, toUuid } from "./seed-library.ts";
import { historicalParseFile } from "./test-evidence.ts";

const DECREES = historicalParseFile("baseline-decrees.json", "/Volumes/باك اب المكتبة القانونية/Raw_Vault_Archive/بذر_جاف_تيست_20260918_QUdyGW/decrees.json");
const DECREES_SHA256 = "8ebf45e490b647dfd822c84174b7d04b19cd73c81a5406e88e9d9531383a5097";
const IDS = ["NCAR-DOC-08031", "NCAR-DOC-08032"] as const;
const CORRECT_DIRECTION = "من وزارة التجارة إلى كل من:";
const REVERSED_DIRECTION = "من كل من: وزارة الداخلية والهيئة العليا للأمن الصناعي، ووزارة الصناعة والثروة المعدنية، والهيئة العامة للغذاء والدواء، إلى وزارة التجارة";

type Row = Record<string, any>;
const sha256 = (value: crypto.BinaryLike) => crypto.createHash("sha256").update(value).digest("hex");

test("fake seeding keeps both corrected Decision 154 records and all ten exact page texts", async () => {
  const bytes = fs.readFileSync(DECREES);
  assert.equal(sha256(bytes), DECREES_SHA256);
  const parsed = JSON.parse(bytes.toString("utf8")) as { decrees: Row[] };
  const targets = parsed.decrees.filter((decree) => IDS.some((id) => String(decree.id).startsWith(id)));

  assert.equal(targets.length, 2, "the fixed archive must contain one occurrence for each NCAR source id");
  assert.deepEqual(targets.map(({ id }) => String(id).slice(0, 14)), [...IDS]);
  assert.notEqual(targets[0].id, targets[1].id, "different NCAR source ids must not be merged");
  assert.equal(targets[0].slug, targets[1].slug, "shared slug is evidence to retain distinct source-id parents");

  const inserted = new Map<string, Row[]>();
  const fakeClient = {
    async upsert(table: string, rows: Row[]) {
      inserted.set(table, [...(inserted.get(table) || []), ...rows]);
      return { data: rows, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedDecrees(fakeClient as never, { decrees: unambiguousIdentityFixtures(targets) }, false, errors, false);
  assert.deepEqual(errors, []);

  const parents = inserted.get("decrees_circulars") || [];
  const pages = inserted.get("decree_pages") || [];
  assert.equal(parents.length, 2, "same slug must not collapse the two decree parent rows");
  assert.equal(pages.length, 10, "each source occurrence keeps its five pages");
  assert.equal(new Set(parents.map(({ id }) => String(id))).size, 2);
  assert.equal(new Set(pages.map(({ id }) => String(id))).size, 10);

  for (const decree of targets) {
    const decreeId = toUuid(String(decree.id || decree.slug));
    const parent = parents.find(({ id }) => id === decreeId);
    assert.ok(parent, `missing seeded parent for ${decree.id}`);
    assert.equal(parent.title, decree.title);
    assert.equal(parent.summary, decree.summary);
    assert.match(String(parent.title), /من وزارة التجارة إلى الجهات المختصة/);
    assert.match(String(parent.summary), new RegExp(CORRECT_DIRECTION));
    assert.doesNotMatch(String(parent.summary), new RegExp(REVERSED_DIRECTION));

    const sourcePages = decree.articles as Row[];
    assert.equal(sourcePages.length, 5);
    const seededPages = pages.filter(({ decree_id }) => decree_id === decreeId);
    assert.equal(seededPages.length, 5, `all five pages remain under their own ${decree.id} parent`);
    for (const [index, article] of sourcePages.entries()) {
      const page = seededPages.find(({ id }) => id === toUuid(`${decreeId}__pg-${article.number ?? index}`));
      assert.ok(page, `missing page ${article.number} for ${decree.id}`);
      assert.equal(page.page_number, article.number || 0);
      assert.equal(page.content, article.text || "");
      if (article.number === 1) {
        assert.match(String(page.content), new RegExp(CORRECT_DIRECTION));
        assert.doesNotMatch(String(page.content), new RegExp(REVERSED_DIRECTION));
      }
    }
  }
});
