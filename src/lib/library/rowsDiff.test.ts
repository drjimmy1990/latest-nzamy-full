import { test } from "node:test";
import assert from "node:assert/strict";
import { diffKeys, diffVerdict, LIBRARY_ROW_TABLES, rowKey } from "./rowsDiff.ts";

const set = (...k: string[]) => new Set(k);

test("same keys → clean, all updated in place", () => {
  const d = diffKeys("laws", set("a", "b"), set("a", "b"));
  assert.equal(d.updated, 2);
  assert.equal(d.added, 0);
  assert.equal(d.leftBehind, 0);
  assert.equal(diffVerdict([d]), "clean");
});

test("new files only → adds-only (safe for the owner)", () => {
  const d = diffKeys("decrees_circulars", set("a", "b", "c"), set("a", "b"));
  assert.equal(d.added, 1);
  assert.deepEqual(d.sampleAdded, ["c"]);
  assert.equal(diffVerdict([d]), "adds-only");
});

test("a renamed file: same totals, one added and one left behind → needs-team", () => {
  const d = diffKeys("feqh_books", set("كتاب-جديد", "b"), set("كتاب-قديم", "b"));
  assert.equal(d.incoming, d.loaded, "counts match — a count check would miss it");
  assert.equal(d.added, 1);
  assert.equal(d.leftBehind, 1);
  assert.equal(diffVerdict([d]), "needs-team");
});

test("rows deleted on purpose coming back → resurrected → needs-team", () => {
  // measured 2026-10-04: the 20 Sep rows vs live = +2 laws, both deleted junk
  const d = diffKeys("laws", set("a", "2024-incometax-decisions-al-hkwmh", "43-1443-05-26----1443"), set("a"));
  assert.deepEqual(d.resurrected, ["2024-incometax-decisions-al-hkwmh", "43-1443-05-26----1443"]);
  assert.equal(diffVerdict([d]), "needs-team");
  // an ordinary new law is not
  assert.deepEqual(diffKeys("laws", set("a", "new-law"), set("a")).resurrected, []);
});

test("after the clean wipe (live table empty) → adds-only, loaded 0; deleted junk still stops it", () => {
  // guide section ٨: the owner re-runs the diff after «تم المسح» and loads only on this verdict
  const d = diffKeys("articles", set("law__art-1", "law__art-2"), set());
  assert.equal(d.loaded, 0);
  assert.equal(d.added, 2);
  assert.equal(d.leftBehind, 0);
  assert.equal(diffVerdict([d]), "adds-only");
  const junk = diffKeys("laws", set("a", "2024-incometax-decisions-al-hkwmh"), set());
  assert.equal(diffVerdict([d, junk]), "needs-team");
});

test("the same name in NFD vs NFC is flagged as a Unicode twin", () => {
  const nfc = "مسائل".normalize("NFC") + " " + "ئ"; // ئ composed
  const nfd = nfc.normalize("NFD");
  assert.notEqual(nfc, nfd);
  const d = diffKeys("feqh_books", set(nfd), set(nfc));
  assert.equal(d.unicodeTwins, 1);
  assert.equal(diffVerdict([d]), "needs-team");
});

test("rowKey reads the table's key and ignores empty ones", () => {
  assert.equal(rowKey({ slug: "x" }, "slug"), "x");
  assert.equal(rowKey({ id: 7 }, "id"), "7");
  assert.equal(rowKey({ id: "" }, "id"), null);
  assert.equal(rowKey({}, "id"), null);
  assert.equal(rowKey(null, "id"), null);
});

test("the 14 tables, laws keyed by slug", () => {
  assert.equal(LIBRARY_ROW_TABLES.length, 14);
  assert.equal(LIBRARY_ROW_TABLES[0].pk, "slug");
});
