/**
 * Owner ٢٦٢ / ٢٦٣: the tolerant readers the parsers share.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOK_VOLUME_KEYS, COLLECTION_VOLUME_KEYS, parseVolumeNumber, readSeriesId, readSourceSummary, readVolumeNumber,
} from "./seriesFields.ts";

test("readSeriesId: series_id, then collection_id; trimmed, unquoted; empty / null-ish → null", () => {
  assert.equal(readSeriesId({ series_id: "a", collection_id: "b" }), "a");
  assert.equal(readSeriesId({ collection_id: ' "moj-judgments-1434" ' }), "moj-judgments-1434");
  assert.equal(readSeriesId({ series_id: "", collection_id: "b" }), "b");
  for (const meta of [{}, { series_id: "  " }, { collection_id: null }, { collection_id: "null" }, { series_id: "~" }, null, undefined]) {
    assert.equal(readSeriesId(meta as never), null, JSON.stringify(meta));
  }
  assert.equal(readSeriesId({ series_id: 1434 }), "1434");
  assert.equal(readSeriesId({ series_id: "x".repeat(200) })?.length, 150);
});

test("parseVolumeNumber: whole numbers 1–9999 in any digit set; nothing else", () => {
  assert.equal(parseVolumeNumber(7), 7);
  assert.equal(parseVolumeNumber("07"), 7);
  assert.equal(parseVolumeNumber("٧"), 7);
  assert.equal(parseVolumeNumber("۱۲"), 12);
  assert.equal(parseVolumeNumber(" '3' "), 3);
  for (const bad of [0, -1, 2.5, "2.5", "3-4", "المجلد الخامس", "", null, undefined, 10000, "10000", NaN]) {
    assert.equal(parseVolumeNumber(bad), null, String(bad));
  }
});

test("readVolumeNumber: first readable key in order; an unreadable one falls through", () => {
  assert.equal(readVolumeNumber({ part_number: 5, part: 1 }, COLLECTION_VOLUME_KEYS), 5);
  assert.equal(readVolumeNumber({ volume_number: "3-4", part_number: 2 }, COLLECTION_VOLUME_KEYS), 2);
  assert.equal(readVolumeNumber({ part: 4, volume: 6 }, COLLECTION_VOLUME_KEYS), 4);
  assert.equal(readVolumeNumber({ current_volume: 10, volumes_total: 12 }, BOOK_VOLUME_KEYS), 10);
  assert.equal(readVolumeNumber({ volumes_total: 12 }, BOOK_VOLUME_KEYS), null);
  assert.equal(readVolumeNumber(null, BOOK_VOLUME_KEYS), null);
});

test("readSourceSummary: the front matter's summary, else the 📝 block, else empty", () => {
  assert.equal(readSourceSummary({ summary: "  موجز الملف  " }, "<details open><summary>📝 موجز</summary>\n> آخر\n</details>"), "موجز الملف");
  assert.equal(readSourceSummary({}, "<details open>\n<summary>📝 موجز المستند</summary>\n\n> من الجسم.\n\n</details>"), "من الجسم.");
  assert.equal(readSourceSummary({ summary: null }, "لا شيء"), "");
  assert.equal(readSourceSummary(undefined, undefined), "");
});
