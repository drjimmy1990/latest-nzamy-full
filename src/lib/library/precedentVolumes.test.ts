import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arabicOrdinalNumber,
  buildCollectionSeries,
  collectionCardExcerpt,
  collectionFallbackKey,
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

test("a row listed twice (the same id) is one volume, not a series of two copies", () => {
  const rows = [vol("moj-1434-v01", { part: null }), vol("moj-1434-v01", { part: null }), vol("solo", { series_id: null })];
  const entries = groupCollectionVolumes(rows);
  assert.deepEqual(entries.map((e) => e.kind), ["single", "single"]);
  const two = groupCollectionVolumes([vol("moj-1434-v01"), vol("moj-1434-v02"), vol("moj-1434-v01")]);
  assert.equal(two.length, 1);
  assert.equal(two[0].kind, "series");
  if (two[0].kind === "series") {
    assert.deepEqual(two[0].volumes.map((v) => [v.row.id, v.number]), [["moj-1434-v01", 1], ["moj-1434-v02", 2]]);
    assert.equal(two[0].rulingCount, 20);
  }
  const info = buildCollectionSeries([vol("moj-1434-v01"), vol("moj-1434-v02"), vol("moj-1434-v02")], "moj-1434-v02");
  assert.deepEqual(info?.volumes.map((v) => v.id), ["moj-1434-v01", "moj-1434-v02"]);
});

// ── Owner note ٠٣ (2026-10-30): the title fallback ────────────────────────────

const bog = (id: string, title: string, extra: Partial<CollectionVolumeRow> = {}): CollectionVolumeRow => ({
  id, title, part: 1, series_id: null, court: "ديوان المظالم", free: true, ruling_count: 5, ...extra,
});

test("note ٠٣: untagged volumes with an explicit suffix group by court + base title, ascending", () => {
  const base = "الأحكام والمبادئ الإدارية لديوان المظالم 1402–1426هـ";
  const out = groupCollectionVolumes([
    bog("a1", `${base} — المجلد الأول`),
    bog("a3", `${base} — المجلد الثالث`),
    bog("x", "تقريرات محكمة التمييز", { court: "المحكمة العليا" }),
    bog("a2", `${base} — المجلد الثاني`),
  ]);
  assert.deepEqual(out.map((e) => e.kind), ["series", "single"]);
  const s = out[0];
  if (s.kind !== "series") return assert.fail("series expected");
  assert.deepEqual(s.volumes.map((v) => [v.row.id, v.number]), [["a1", 1], ["a2", 2], ["a3", 3]]);
  assert.equal(s.title, base);
  assert.equal(s.key, "title:a1");
  assert.equal(s.rulingCount, 15);
});

test("note ٠٣: «1440هـ — المجلد الأول» and «(الجزء 2)» are suffixes; the year stays in the base", () => {
  const out = groupCollectionVolumes([
    bog("b2", "أحكام ديوان المظالم — 1440هـ — المجلد الثاني"),
    bog("b1", "أحكام ديوان المظالم — 1440هـ — المجلد الأول"),
    bog("c1", "أحكام ديوان المظالم — 1439هـ (الجزء 1)"),
    bog("c2", "أحكام ديوان المظالم — 1439هـ (الجزء 2)"),
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => (e.kind === "series" ? e.volumes.map((v) => v.row.id) : [])), [["b1", "b2"], ["c1", "c2"]]);
  if (out[0].kind === "series") assert.equal(out[0].title, "أحكام ديوان المظالم — 1440هـ");
  if (out[1].kind === "series") assert.equal(out[1].title, "أحكام ديوان المظالم — 1439هـ");
});

test("note ٠٣: no suffix, one volume, another court or a tagged row never form a fallback series", () => {
  // no explicit suffix: two same-titled rows stay single (nothing grouped by title alone)
  assert.deepEqual(groupCollectionVolumes([bog("p", "مجموعة المبادئ"), bog("q", "مجموعة المبادئ")]).map((e) => e.kind), ["single", "single"]);
  // «المجلد» not closing the title as a number
  assert.equal(collectionFallbackKey({ title: "شرح المجلد الأول من الأحكام", court: "" }), null);
  // one volume alone stays single
  assert.deepEqual(groupCollectionVolumes([bog("z1", "أحكام 1441هـ — المجلد الأول")]).map((e) => e.kind), ["single"]);
  // same base title under two courts: two singles
  const twoCourts = groupCollectionVolumes([
    bog("m1", "مجموعة الأحكام — المجلد الأول"),
    bog("m2", "مجموعة الأحكام — المجلد الثاني", { court: "وزارة العدل" }),
  ]);
  assert.deepEqual(twoCourts.map((e) => e.kind), ["single", "single"]);
});

test("note ٠٣: an untagged volume joins the one tagged series with its court + base title", () => {
  const out = groupCollectionVolumes([
    bog("t1", "مجموعة 1434هـ — المجلد الأول", { series_id: "s-1434" }),
    bog("t2", "مجموعة 1434هـ — المجلد الثاني", { series_id: "s-1434" }),
    bog("u3", "مجموعة 1434هـ — المجلد الثالث"),
  ]);
  assert.equal(out.length, 1);
  if (out[0].kind !== "series") return assert.fail("series expected");
  assert.equal(out[0].key, "s-1434");
  assert.deepEqual(out[0].volumes.map((v) => v.row.id), ["t1", "t2", "u3"]);
});

test("note ٠٣: the reader's selector also builds for a title-fallback series", () => {
  const rows = [bog("v2", "أحكام 1440هـ — المجلد الثاني", { free: false }), bog("v1", "أحكام 1440هـ — المجلد الأول")];
  const info = buildCollectionSeries(rows, "v2");
  assert.ok(info);
  assert.equal(info.seriesId, "title:v1");
  assert.deepEqual(info.volumes.map((v) => [v.id, v.label, v.free]), [["v1", "المجلد 1", true], ["v2", "المجلد 2", false]]);
});

test("note ٠٣ §٢: the card excerpt drops a leading «## ديباجة …» heading and the Markdown marks", () => {
  assert.equal(
    collectionCardExcerpt("## ديباجة أحكام ديوان المظالم — 1440هـ\n\nتضم هذه المجموعة **الأحكام** الصادرة عن الدوائر."),
    "تضم هذه المجموعة الأحكام الصادرة عن الدوائر.",
  );
  assert.equal(collectionCardExcerpt("**ديباجة المجموعة**\nنص المقدمة"), "نص المقدمة");
  assert.equal(collectionCardExcerpt("ديباجة: مجموعة 1439هـ\r\n- أولاً: نص"), "أولاً: نص");
  // a heading that is the whole description keeps its words, never an empty card
  assert.equal(collectionCardExcerpt("## ديباجة أحكام ديوان المظالم"), "ديباجة أحكام ديوان المظالم");
  // plain text is untouched; a «ديباجة» word inside the text stays
  assert.equal(collectionCardExcerpt("تتضمن الديباجة بيان الاختصاص"), "تتضمن الديباجة بيان الاختصاص");
  assert.equal(collectionCardExcerpt(null), "");
});
