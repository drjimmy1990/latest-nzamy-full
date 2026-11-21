/**
 * legislativeUpdates.test.ts — owner TODO P1-12: «أحدث التحديثات التشريعية»
 * from the library's own laws (title, link, «آخر تحديث تشريعي» date alone),
 * never the invented DEMO_UPDATES.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/legislativeUpdates.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hijriTodayKey, shapeLegislativeUpdates } from "./legislativeUpdates.ts";

const law = (slug: string, title: string, issue: string | null, update: string | null, status: string | null = "active") => ({
  slug,
  title,
  status,
  issue_date_hijri: issue,
  latest_update_date: update,
});

test("newest legislative date first, the date alone; undated, untitled and repealed laws are left out", () => {
  const items = shapeLegislativeUpdates([
    law("a-law", "نظام أ", "1420/05/01", "1446/03/12"),
    law("b-law", "نظام ب", "1447/01/08", null),
    law("c-law", "نظام ج", null, null),
    law("d-law", "نظام د", "1445/01/01", null, "repealed"),
    law("f-law", "نظام و", "1447/06/01", null, "superseded_duplicate"),
    law("g-law", "نظام ز", "1447/06/01", null, "merged_into_parent"),
    law("h-law", "نظام ح", "1440/01/01", null, null),
    law("", "بلا معرّف", "1447/02/02", null),
    law("e-law", "", "1447/02/02", null),
  ]);
  assert.deepEqual(items.map((i) => i.slug), ["b-law", "a-law", "h-law"], "a law with no recorded status is still listed");
  assert.match(items[0].dateHijri, /1447/);
  assert.match(items[1].dateHijri, /1446/);
  assert.deepEqual(Object.keys(items[0]).sort(), ["dateHijri", "slug", "title"], "nothing but the title, link and date");
});

test("a date after today is left out, never shown as the newest update", () => {
  const today = hijriTodayKey(new Date("2026-11-17T12:00:00Z"));
  assert.ok(today && today > 14480000 && today < 14490000, String(today));
  const items = shapeLegislativeUpdates([law("future", "نظام لاحق", "1460/01/01", null), law("now", "نظام", "1447/01/01", null)], 8, today);
  assert.deepEqual(items.map((i) => i.slug), ["now"]);
});

test("the limit", () => {
  const rows = Array.from({ length: 20 }, (_, n) => law(`l-${n}`, `نظام ${n}`, `14${String(20 + n).padStart(2, "0")}/01/01`, null));
  assert.equal(shapeLegislativeUpdates(rows).length, 8);
  assert.equal(shapeLegislativeUpdates(rows, 3).length, 3);
});

test("the route reads as the service role behind the library gate, the date only, and never sends the key", () => {
  const src = readFileSync(new URL("../../app/api/library/legislative-updates/route.ts", import.meta.url), "utf8");
  // Batch l12 (journal prerequisite): the library's closed switch applies, the
  // per-account lock does not — a signed-in individual sees the card a guest sees.
  assert.match(src, /const gate = await libraryGate\(\{ accountLock: false \}\);\s*if \(gate\) return gate;/);
  assert.doesNotMatch(src, /libraryGate\(\)/);
  assert.match(src, /createServiceClient\(\)/);
  assert.match(src, /latest_update_date:latest_update->>date_hijri/);
  assert.doesNotMatch(src, /"[^"]*\blatest_update\b(?!->>)[^"]*"\s*;/, "latest_update's text is never selected");
  assert.match(src, /\.order\("catalogue_recency_key"/);
  assert.doesNotMatch(src.match(/const COLUMNS = "[^"]*"/)![0], /catalogue_recency_key|official|preamble|issuing_instrument/);
});

test("the /laws card: no invented update is left, and it renders nothing without real items", () => {
  const src = readFileSync(new URL("../../app/laws/components/LegislativeUpdates.tsx", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(code, /DEMO_UPDATES|decreeRef|articleRef|مرسوم ملكي|م\/\d/);
  assert.match(code, /fetch\("\/api\/library\/legislative-updates"\)/);
  assert.match(code, /if \(items\.length === 0\) return null;/);
  assert.match(code, /href=\{`\/laws\/\$\{apiSlug\(u\.slug\)\}`\}/);
  // Mounted on /laws.
  assert.match(readFileSync(new URL("../../app/laws/(index)/page.tsx", import.meta.url), "utf8"), /<LegislativeUpdates isDark=\{isDark\} isRTL=\{isRTL\} \/>/);
});
