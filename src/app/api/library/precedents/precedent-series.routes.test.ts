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

test("the route reads the series on the request client, catalogue columns only, bounded", () => {
  assert.match(route, /\.select\('id, title, court, year_hijri, part, source_id, series_id, track, description, ruling_count, free'\)/);
  const lookup = route.slice(route.indexOf("if (seriesId) {"), route.indexOf("// Check user authentication"));
  assert.match(lookup, /await supabase\s*\.schema\('library'\)\s*\.from\('judicial_collections'\)\s*\.select\('id, title, part, series_id, free, ruling_count'\)\s*\.eq\('series_id', seriesId\)/);
  assert.match(lookup, /\.limit\(SERIES_MAX_VOLUMES\)/);
  assert.doesNotMatch(lookup, /serverOnly|metadata/);
  assert.match(lookup, /series = buildCollectionSeries\(siblings\.data \?\? \[\], collection\.id\)/);
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
