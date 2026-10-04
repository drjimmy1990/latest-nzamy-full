import assert from "node:assert/strict";
import test from "node:test";
import { resolveEffectiveIso, splitEnactments } from "./enactmentFeed.ts";

// 2026-09-28 in Riyadh = 17 Rabi' II 1448 (Umm al-Qura).
const NOW = new Date("2026-09-28T09:00:00Z");

test("the Hijri effective date is used when the Gregorian column is empty (it is, on every live law)", () => {
  const iso = resolveEffectiveIso({ effective_date_hijri: "1448/04/20", effective_date_gregorian: null });
  assert.equal(iso, "2026-10-01");
  assert.equal(resolveEffectiveIso({ effective_date_hijri: "1448-04-20هـ" }), "2026-10-01");
  assert.equal(resolveEffectiveIso({ effective_date_hijri: "١٤٤٨/٠٤/٢٠" }), "2026-10-01");
});

test("a stored Gregorian date wins; junk or partial dates resolve to nothing", () => {
  assert.equal(resolveEffectiveIso({ effective_date_gregorian: "2027-01-05", effective_date_hijri: "1448/04/20" }), "2027-01-05");
  assert.equal(resolveEffectiveIso({ effective_date_hijri: "1448" }), null);
  assert.equal(resolveEffectiveIso({ effective_date_hijri: "1473-13-36" }), null);
  assert.equal(resolveEffectiveIso({}), null);
});

test("upcoming: after today, soonest first; recent: today back 14 days, newest first", () => {
  const rows = [
    { slug: "far", effective_date_hijri: "1448/08/12" },
    { slug: "soon", effective_date_hijri: "1448/04/20" },
    { slug: "today", effective_date_hijri: "1448/04/17" },
    { slug: "week-ago", effective_date_hijri: "1448/04/10" },
    { slug: "too-old", effective_date_hijri: "1448/03/29" },
    { slug: "no-date", effective_date_hijri: null },
  ];
  const { upcoming, recent } = splitEnactments(rows, NOW);
  assert.deepEqual(upcoming.map((r) => [r.slug, r.daysRemaining]), [["soon", 3], ["far", 114]]);
  assert.deepEqual(recent.map((r) => [r.slug, r.daysSinceEffective]), [["today", 0], ["week-ago", 7]]);
});

test("a repealed law and a duplicate slug appear in neither list twice", () => {
  const rows = [
    { slug: "x", status: "repealed", effective_date_hijri: "1448/04/20" },
    { slug: "y", effective_date_hijri: "1448/04/20" },
    { slug: "y", effective_date_hijri: "1448/04/21" },
  ];
  const { upcoming, recent } = splitEnactments(rows, NOW);
  assert.deepEqual(upcoming.map((r) => r.slug), ["y"]);
  assert.equal(recent.length, 0);
});

test("each list is capped", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ slug: `s${String(i).padStart(2, "0")}`, effective_date_hijri: "1448/05/01" }));
  assert.equal(splitEnactments(rows, NOW, 5).upcoming.length, 5);
});
