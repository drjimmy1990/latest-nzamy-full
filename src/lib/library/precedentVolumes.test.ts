import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arabicOrdinalNumber,
  buildCollectionSeries,
  collectionVolumeLabel,
  groupCollectionVolumes,
  type CollectionVolumeRow,
} from "./precedentVolumes.ts";

const vol = (id: string, extra: Partial<CollectionVolumeRow> = {}): CollectionVolumeRow => ({
  id,
  title: "مجموعة الأحكام القضائية لعام 1434هـ",
  part: 1,
  series_id: "moj-rulings-collection-1434",
  free: true,
  ruling_count: 10,
  ...extra,
});

test("arabicOrdinalNumber: digits, ordinal words, compounds up to the thirties", () => {
  const cases: Array<[string, number | null]> = [
    ["01", 1], ["30", 30], ["١٢", 12], ["الأول", 1], ["الاول", 1], ["الثاني", 2], ["العاشر", 10],
    ["الحادي عشر", 11], ["الثاني عشر", 12], ["التاسع عشر", 19], ["العشرين", 20],
    ["الحادي والعشرين", 21], ["التاسع والعشرين", 29], ["الثلاثين", 30],
    ["الرابع عشر — مجلد الفهارس الشاملة", 14], ["الفهارس", null], ["", null],
  ];
  for (const [input, want] of cases) assert.equal(arabicOrdinalNumber(input), want, input);
});

test("a series is only what carries the same series_id, two volumes or more; the rest stay single", () => {
  const rows = [
    vol("moj-rulings-1434-v02"),
    { id: "single-a", title: "تقريرات محكمة التمييز", part: 1, series_id: null },
    vol("moj-rulings-1434-v01"),
    { id: "lonely", title: "مجموعة وحيدة", part: 1, series_id: "only-one" },
  ];
  const out = groupCollectionVolumes(rows);
  assert.deepEqual(out.map((e) => e.kind), ["series", "single", "single"]);
  const s = out[0];
  assert.equal(s.kind, "series");
  if (s.kind !== "series") return;
  // first-appearance order of the catalogue; volumes in reading order
  assert.deepEqual(s.volumes.map((v) => v.row.id), ["moj-rulings-1434-v01", "moj-rulings-1434-v02"]);
  assert.deepEqual(s.volumes.map((v) => v.number), [1, 2]);
  assert.equal(s.count, 2);
  assert.equal(s.rulingCount, 20);
});

test("volume numbers: distinct parts win; when every part is 1 (the loader's default) the id's -vNN, then the title", () => {
  const byPart = groupCollectionVolumes([vol("b", { part: 3 }), vol("a", { part: 2 })]);
  assert.equal(byPart[0].kind, "series");
  if (byPart[0].kind === "series") assert.deepEqual(byPart[0].volumes.map((v) => [v.row.id, v.number]), [["a", 2], ["b", 3]]);

  const byId = groupCollectionVolumes([vol("moj-rulings-1434-v10"), vol("moj-rulings-1434-v09"), vol("moj-rulings-1434-v1")]);
  if (byId[0].kind === "series") assert.deepEqual(byId[0].volumes.map((v) => v.number), [1, 9, 10]);

  const byTitle = groupCollectionVolumes([
    vol("x2", { title: "مجموعة الأحكام القضائية لعام 1434 هـ - المجلد الحادي عشر" }),
    vol("x1", { title: "مجموعة الأحكام القضائية لعام 1434 هـ - المجلد 02" }),
  ]);
  if (byTitle[0].kind === "series") {
    assert.deepEqual(byTitle[0].volumes.map((v) => [v.row.id, v.number]), [["x1", 2], ["x2", 11]]);
    // the series title drops the volume token
    assert.equal(byTitle[0].title, "مجموعة الأحكام القضائية لعام 1434 هـ");
  }
});

test("no number is invented: duplicate or missing numbers fall back to id order with no number", () => {
  const out = groupCollectionVolumes([vol("zeta"), vol("alpha")]);
  assert.equal(out[0].kind, "series");
  if (out[0].kind !== "series") return;
  assert.deepEqual(out[0].volumes.map((v) => [v.row.id, v.number]), [["alpha", null], ["zeta", null]]);
  assert.equal(collectionVolumeLabel(out[0].volumes[0]), "مجموعة الأحكام القضائية لعام 1434هـ");
  const dup = groupCollectionVolumes([vol("s-v01"), vol("t-v01")]);
  if (dup[0].kind === "series") assert.deepEqual(dup[0].volumes.map((v) => v.number), [null, null]);
});

test("each volume keeps its own free flag (a free first volume never unlocks a paid one)", () => {
  const out = groupCollectionVolumes([vol("s-v01", { free: true }), vol("s-v02", { free: false })]);
  if (out[0].kind !== "series") return assert.fail("series expected");
  assert.deepEqual(out[0].volumes.map((v) => v.row.free), [true, false]);
});

test("collectionVolumeLabel: «المجلد N» when known", () => {
  const out = groupCollectionVolumes([vol("s-v03"), vol("s-v12")]);
  if (out[0].kind !== "series") return assert.fail("series expected");
  assert.deepEqual(out[0].volumes.map(collectionVolumeLabel), ["المجلد 3", "المجلد 12"]);
});

test("buildCollectionSeries: the reader's selector, or null for a stand-alone collection", () => {
  const rows = [vol("s-v02", { free: false, ruling_count: 7 }), vol("s-v01")];
  const series = buildCollectionSeries(rows, "s-v02");
  assert.ok(series);
  assert.equal(series.currentId, "s-v02");
  assert.equal(series.seriesId, "moj-rulings-collection-1434");
  assert.deepEqual(series.volumes, [
    { id: "s-v01", label: "المجلد 1", number: 1, free: true, rulingCount: 10 },
    { id: "s-v02", label: "المجلد 2", number: 2, free: false, rulingCount: 7 },
  ]);
  assert.equal(buildCollectionSeries([vol("s-v01")], "s-v01"), null);
  assert.equal(buildCollectionSeries(rows, "missing"), null);
  assert.equal(buildCollectionSeries([{ id: "a", title: "t", series_id: null }, { id: "b", title: "t", series_id: null }], "a"), null);
});

test("the owner corpus' two series shapes (2026-10-25) get volumes 1..N, part = 1 on every row", () => {
  // moj-rulings-collection-1434: `id: moj-rulings-1434-vNN`, collection_title without a volume
  const rulings = Array.from({ length: 30 }, (_, i) => ({
    id: `moj-rulings-1434-v${String(30 - i).padStart(2, "0")}`,
    title: "مجموعة الأحكام القضائية لعام 1434هـ",
    part: 1,
    series_id: "moj-rulings-collection-1434",
  }));
  // moj-judgments-1434: no slug / id — the parser's filename fallback id; title
  // here WITHOUT its volume, so only the id can tell the volumes apart
  const judgments = Array.from({ length: 14 }, (_, i) => ({
    id: `97 - السوابق القضائية__وزارة_العدل_المجموعة_1435_المجلد_${String(14 - i).padStart(2, "0")}`,
    title: "مجموعة الأحكام القضائية لعام 1435 هـ",
    part: 1,
    series_id: "moj-judgments-1435",
  }));
  const out = groupCollectionVolumes([...rulings, ...judgments]);
  assert.equal(out.length, 2);
  for (const [entry, n] of [[out[0], 30], [out[1], 14]] as const) {
    assert.equal(entry.kind, "series");
    if (entry.kind !== "series") continue;
    assert.deepEqual(entry.volumes.map((v) => v.number), Array.from({ length: n }, (_, i) => i + 1));
    assert.equal(collectionVolumeLabel(entry.volumes[n - 1]), `المجلد ${n}`);
  }
});
