/**
 * Owner ٢٦٢ — parse-precedents reads a judicial collection's series label and
 * volume number for sections 97 / 98, from temp fixture files only (no
 * corpus, no database, no env).
 *   node --import tsx --test scripts/parsers/parse-precedents.series.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parsePrecedents } from "./parse-precedents.ts";

function file(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-prec-series-"));
  const f = path.join(dir, name);
  fs.writeFileSync(f, content, "utf8");
  return f;
}

/** A section-98 principles file (PRINCIPLE_START blocks). */
function principles(frontmatter: string): string {
  return file("مبادئ-المحكمة-الإدارية-العليا-ج2.md", `---
title: مبادئ المحكمة الإدارية العليا — الجزء الثاني
slug: idari-olya-mabadi-p2
court: المحكمة الإدارية العليا
year_hijri: 1440
${frontmatter}---
<!-- PRINCIPLE_START {"number": 1, "issuing_body": "المحكمة الإدارية العليا"} -->
> مبدأ اختباري أول.
<!-- PRINCIPLE_END -->
`);
}

/** A section-97 «مجموعة سوابق قضائية» volume (ARTICLE_START blocks). */
function container(frontmatter: string): string {
  return file("وزارة_العدل_المجموعة_1434_المجلد_05.md", `---
type: مجموعة سوابق قضائية
slug: moj-rulings-1434-v05
collection_title: مجموعة الأحكام القضائية لعام 1434هـ — المجلد الخامس
issuing_body: وزارة العدل
${frontmatter}---
<!-- ARTICLE_START {"number": "1", "court_type": "المحكمة العامة", "summary": "حكم اختباري."} -->
> حكم اختباري.
<!-- ARTICLE_END -->
`);
}

const one = (f: string) => {
  const out = parsePrecedents(f);
  assert.equal(out.collections.length, 1, "one collection");
  return out.collections[0];
};

test("98 principles: collection_id → series_id and part_number → part (were not read before)", () => {
  const c = one(principles("collection_id: idari-olya-mabadi\npart_number: 2\nparts_total: 20\n"));
  assert.equal(c.series_id, "idari-olya-mabadi");
  assert.equal(c.part, 2);
});

test("98 principles: series_id wins; volume_number wins over part; no fields → no series, part 1", () => {
  const c = one(principles("series_id: \"olya\"\ncollection_id: idari-olya-mabadi\nvolume_number: ٣\npart: 9\n"));
  assert.equal(c.series_id, "olya");
  assert.equal(c.part, 3);
  const bare = one(principles(""));
  assert.equal(bare.series_id, undefined);
  assert.equal(bare.part, 1);
  // The old reads stay: `part`, then `volume`.
  assert.equal(one(principles("part: 4\nvolume: 6\n")).part, 4);
  assert.equal(one(principles("volume: 6\n")).part, 6);
});

test("97 volume: collection_id stays the series label, never the id; part_number gives the volume", () => {
  const c = one(container("collection_id: moj-rulings-collection-1434\npart_number: 5\npart_label: المجلد الخامس\nparts_total: 30\n"));
  assert.equal(c.id, "moj-rulings-1434-v05");
  assert.equal(c.series_id, "moj-rulings-collection-1434");
  assert.equal(c.part, 5);
});

test("97 volume: series_id is read too; a word-only part_label gives no number (part stays 1)", () => {
  const c = one(container("series_id: moj-1434\npart_label: المجلد الخامس\n"));
  assert.equal(c.series_id, "moj-1434");
  assert.equal(c.part, 1);
});
