/**
 * Owner file 11 item 7 (20 Nov): the unified volumes of /precedents/LAW-98-1255.
 * The collection has no series_id (live API: seriesId null, series null), so the
 * reader showed no volume selector, «الجزء 1», and an in-collection search over
 * one volume. These tests pin the title fallback in the shared sibling lookup,
 * the ordinal volume label, and the two routes' use of the one helper.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/collectionSeriesLookup.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readCollectionSeries, SERIES_MAX_VOLUMES, SERIES_SIBLING_COLUMNS } from "./collectionSeriesLookup.ts";
import {
  arabicVolumeOrdinal,
  collectionFallbackLookup,
  seriesCurrentVolumeLabel,
  titleNamesVolume,
  type CollectionVolumeRow,
} from "./precedentVolumes.ts";

const COURT = "الهيئة العليا لتسوية الخلافات العمالية";
const BASE = "مدونة المبادئ والقرارات العمالية لعام 1431ه";
const labour = (id: string, word: string, extra: Partial<CollectionVolumeRow> = {}): CollectionVolumeRow => ({
  id,
  title: `${BASE} - المجلد ${word}`,
  court: COURT,
  part: 1,
  series_id: null,
  free: true,
  ruling_count: 50,
  ...extra,
});

/** A recording fake of the one query chain the helper builds. */
function fakeClient(rows: CollectionVolumeRow[], error: unknown = null) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["schema", "from", "select", "eq", "ilike", "order", "limit"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return m === "limit" ? Promise.resolve({ data: error ? null : rows, error }) : chain;
    };
  }
  return { client: chain as unknown as Parameters<typeof readCollectionSeries>[0], calls };
}

test("arabicVolumeOrdinal: the owner's «المجلد الثالث», 1–39, else null", () => {
  assert.equal(arabicVolumeOrdinal(1), "الأول");
  assert.equal(arabicVolumeOrdinal(3), "الثالث");
  assert.equal(arabicVolumeOrdinal(10), "العاشر");
  assert.equal(arabicVolumeOrdinal(11), "الحادي عشر");
  assert.equal(arabicVolumeOrdinal(12), "الثاني عشر");
  assert.equal(arabicVolumeOrdinal(20), "العشرون");
  assert.equal(arabicVolumeOrdinal(21), "الحادي والعشرون");
  assert.equal(arabicVolumeOrdinal(39), "التاسع والثلاثون");
  for (const n of [0, -1, 40, 2.5, Number.NaN]) assert.equal(arabicVolumeOrdinal(n), null, String(n));
});

test("collectionFallbackLookup: the court and an escaped base-title prefix, only for an explicit volume suffix", () => {
  assert.deepEqual(collectionFallbackLookup(labour("LAW-98-1255", "الثالث")), { court: COURT, titleLike: `${BASE}%` });
  assert.deepEqual(collectionFallbackLookup({ title: "مبادئ 100%_ب - المجلد 2", court: "ك" }), { court: "ك", titleLike: "مبادئ 100\\%\\_ب%" });
  assert.equal(collectionFallbackLookup({ title: BASE, court: COURT }), null, "no volume suffix: no lookup");
  assert.equal(collectionFallbackLookup({ title: `${BASE} - المجلد الثالث`, court: "" }), null, "no court: no lookup");
  assert.equal(collectionFallbackLookup({ title: `${BASE} - المجلد الثالث`, court: null }), null);
});

test("readCollectionSeries: an untagged volume finds its siblings by court + title (LAW-98-1255 shape)", async () => {
  const rows = [labour("LAW-98-1253", "الأول"), labour("LAW-98-1254", "الثاني"), labour("LAW-98-1255", "الثالث", { part: 3 }), labour("LAW-98-1256", "الرابع")];
  const { client, calls } = fakeClient(rows);
  const { series, error } = await readCollectionSeries(client, rows[2]);
  assert.equal(error, null);
  assert.ok(series);
  assert.equal(series.currentId, "LAW-98-1255");
  assert.deepEqual(series.volumes.map((v) => v.label), ["المجلد الأول", "المجلد الثاني", "المجلد الثالث", "المجلد الرابع"]);
  assert.equal(seriesCurrentVolumeLabel(series), "المجلد الثالث");
  assert.equal(series.volumes.reduce((n, v) => n + (v.rulingCount ?? 0), 0), 200);
  // The request client, catalogue columns only, bounded, by court + LIKE (never by series_id).
  assert.deepEqual(calls.find(([m]) => m === "select")?.[1], [SERIES_SIBLING_COLUMNS]);
  assert.deepEqual(calls.find(([m]) => m === "eq")?.[1], ["court", COURT]);
  assert.deepEqual(calls.find(([m]) => m === "ilike")?.[1], ["title", `${BASE}%`]);
  assert.deepEqual(calls.find(([m]) => m === "limit")?.[1], [SERIES_MAX_VOLUMES]);
  assert.doesNotMatch(SERIES_SIBLING_COLUMNS, /metadata|text/);
});

test("readCollectionSeries: another work with the same prefix never joins; a lone volume stays alone", async () => {
  const mine = labour("A3", "الثالث");
  const other = { ...labour("B1", "الأول"), title: `${BASE} الملحق - المجلد الأول` };
  const lone = await readCollectionSeries(fakeClient([mine, other]).client, mine);
  assert.equal(lone.series, null);
  assert.equal(lone.error, null);
});

test("readCollectionSeries: a tagged collection still reads by series_id; no suffix and no tag reads nothing", async () => {
  const tagged = (id: string, part: number) => ({ id, title: "مجموعة 1434", court: "وزارة العدل", part, series_id: "s-1434", free: true, ruling_count: 1 });
  const { client, calls } = fakeClient([tagged("t1", 1), tagged("t2", 2)]);
  const out = await readCollectionSeries(client, tagged("t2", 2));
  assert.deepEqual(calls.find(([m]) => m === "eq")?.[1], ["series_id", "s-1434"]);
  assert.ok(!calls.some(([m]) => m === "ilike"));
  assert.deepEqual(out.series?.volumes.map((v) => v.label), ["المجلد الأول", "المجلد الثاني"]);

  const none = fakeClient([]);
  const alone = await readCollectionSeries(none.client, { id: "x", title: "مجموعة بلا مجلد", court: COURT, series_id: null });
  assert.deepEqual(alone, { series: null, error: null });
  assert.equal(none.calls.length, 0, "no query at all");
});

test("readCollectionSeries: a failed read is returned, never thrown", async () => {
  const out = await readCollectionSeries(fakeClient([], { code: "57014" }).client, labour("LAW-98-1255", "الثالث"));
  assert.equal(out.series, null);
  assert.deepEqual(out.error, { code: "57014" });
});

test("titleNamesVolume / seriesCurrentVolumeLabel guard the citation line", () => {
  assert.equal(titleNamesVolume(`${BASE} - المجلد الثالث`), true);
  assert.equal(titleNamesVolume(BASE), false);
  assert.equal(seriesCurrentVolumeLabel(null), null);
  assert.equal(seriesCurrentVolumeLabel({ currentId: "x", volumes: [] }), null);
});

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("both routes and the reader use the one lookup and the volume label", () => {
  const precedents = read("../../app/api/library/precedents/[slug]/route.ts");
  const scoped = read("../../app/api/library/scoped-search/route.ts");
  const panel = read("../../app/precedents/[slug]/_identity-panel.tsx");
  const reader = read("../../app/precedents/[slug]/page.tsx");
  assert.match(precedents, /const lookup = await readCollectionSeries\(supabase, collection\);/);
  assert.match(scoped, /const lookup = await readCollectionSeries\(supabase, data\);/);
  assert.doesNotMatch(precedents + scoped, /buildCollectionSeries\(/);
  assert.match(panel, /const volumeLabel = seriesCurrentVolumeLabel\(collection\.series\);/);
  assert.doesNotMatch(panel, /\bScales\b/);
  assert.match(reader, /\$\{volumeCitation\(collection\)\}/);
});
