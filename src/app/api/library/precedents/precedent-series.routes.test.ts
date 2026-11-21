/**
 * N2.4 — multi-volume judicial collections. Source contracts for the parts a
 * refactor could quietly loosen: the series lookup reads catalogue columns on
 * the request client (never the service role, never `metadata`), and every
 * volume button — catalogue card and reader selector — keeps its own lock.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const route = read("./[slug]/route.ts");
const card = read("../../../laws/components/CollectionSeriesCard.tsx");
const tab = read("../../../laws/components/PrecedentsTabContent.tsx");
const selector = read("../../../precedents/[slug]/_volume-selector.tsx");
const reader = read("../../../precedents/[slug]/page.tsx");
const helper = read("../../../../lib/library/collectionSeriesLookup.ts");

test("the route reads the series on the request client, catalogue columns only, bounded", () => {
  assert.match(route, /\.select\('id, title, court, year_hijri, part, source_id, series_id, track, description, ruling_count, free'\)/);
  // Owner file 11 item 7: tagged or by title, through the one shared lookup
  // (src/lib/library/collectionSeriesLookup.ts; its own test pins the query).
  const lookup = route.slice(route.indexOf("// N2.4: the other volumes of a series"), route.indexOf("// Check user authentication"));
  assert.match(lookup, /const lookup = await readCollectionSeries\(supabase, collection\);/);
  assert.doesNotMatch(lookup, /serverOnly|metadata/);
  assert.match(lookup, /const series: CollectionSeriesInfo \| null = lookup\.series;/);
  assert.match(helper, /\.limit\(SERIES_MAX_VOLUMES\)/);
  assert.match(helper, /supabase\.schema\("library"\)\.from\("judicial_collections"\)\.select\(SERIES_SIBLING_COLUMNS\)/);
  assert.doesNotMatch(helper, /createServiceClient|metadata/);
  assert.match(route, /seriesId: seriesId \|\| null,\s*series,/);
});

test("the catalogue groups tagged series only, through precedentVolumes", () => {
  assert.match(tab, /groupCollectionVolumes<CatalogueCollectionRow & \{ col: any \}>\(/);
  assert.match(tab, /series_id: col\.series_id \?\? null/);
  assert.match(tab, /if \(entry\.kind === "series"\) \{/);
});

test("each volume button keeps its own lock (card and reader)", () => {
  assert.match(card, /const open = viewerHasFullAccess \|\| v\.row\.free !== false;/);
  assert.match(card, /onClick=\{\(\) => setShowPaywall\(true\)\}/);
  assert.match(selector, /const isOpen = \(v: CollectionSeriesInfo\["volumes"\]\[number\]\) => hasFullAccess \|\| v\.free;/);
  assert.match(selector, /disabled=\{!isOpen\(v\) && v\.id !== series\.currentId\}/);
  assert.match(reader, /<VolumeSelector series=\{collection\.series\} hasFullAccess=\{Boolean\(collection\.paywall\?\.hasFullAccess\)\}/);
});
