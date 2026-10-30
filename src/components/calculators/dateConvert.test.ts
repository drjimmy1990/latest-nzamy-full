/**
 * dateConvert.test.ts — owner finding LIVE-F31: «تحويل التاريخ» refuses a day
 * that does not exist instead of normalising it, and converts on Umm al-Qura.
 *
 * Run it under more than one zone; the answer must not move:
 *   TZ=UTC / TZ=Asia/Riyadh / TZ=America/New_York
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { convertGregorianToHijri, convertHijriToGregorian } from "./dateConvert.ts";
import { hijriAvailable, hijriPartsOf } from "../../lib/services/hijri.ts";

test("CALC06: 31 February 2026 is refused, not converted to «14 رمضان 1447»", () => {
  const r = convertGregorianToHijri("31", "2", "2026");
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /لا يوجد يوم ٣١ في فبراير ٢٠٢٦/);
  assert.match((r as { error: string }).error, /٢٨ يوماً/);
});

test("29 February exists only in a leap year; 31 April and 31 June never", () => {
  assert.equal(convertGregorianToHijri("29", "2", "2026").ok, false);
  assert.equal(convertGregorianToHijri("29", "2", "2028").ok, hijriAvailable());
  assert.equal(convertGregorianToHijri("31", "4", "2026").ok, false);
  assert.equal(convertGregorianToHijri("31", "6", "2026").ok, false);
});

test("out-of-range and malformed parts are refused with a reason", () => {
  for (const [d, m, y] of [["0", "1", "2026"], ["32", "1", "2026"], ["1", "13", "2026"], ["1", "0", "2026"], ["-5", "1", "2026"], ["1", "1", "1800"], ["1.5", "1", "2026"], ["", "1", "2026"]]) {
    const r = convertGregorianToHijri(d, m, y);
    assert.equal(r.ok, false, `${d}/${m}/${y}`);
    assert.ok((r as { error: string }).error.length > 0);
  }
});

test("Gregorian → Hijri agrees with the platform's Umm al-Qura calendar (hijri.ts)", { skip: !hijriAvailable() }, () => {
  const r = convertGregorianToHijri("29", "10", "2026");
  assert.equal(r.ok, true);
  const h = hijriPartsOf(new Date(2026, 9, 29))!;
  assert.deepEqual({ d: (r as { day: number }).day, m: (r as { month: number }).month, y: (r as { year: number }).year }, { d: h.day, m: h.month, y: h.year });
  assert.equal((r as { text: string }).text, `${h.day} ${h.monthName} ${h.year}هـ`);
  // Umm al-Qura: 29 October 2026 is 18 Jumada al-Ula 1448 (the header's value).
  assert.equal((r as { text: string }).text, "18 جمادى الأولى 1448هـ");
});

test("Arabic-Indic digits are accepted", { skip: !hijriAvailable() }, () => {
  const r = convertGregorianToHijri("٢٩", "١٠", "٢٠٢٦");
  assert.equal(r.ok, true);
});

test("Hijri → Gregorian round-trips", { skip: !hijriAvailable() }, () => {
  const r = convertHijriToGregorian("18", "5", "1448");
  assert.equal(r.ok, true);
  assert.equal((r as { text: string }).text, "29 أكتوبر 2026");
});

test("day 30 of a 29-day Umm al-Qura month is refused, naming the month length", { skip: !hijriAvailable() }, () => {
  // Find a 29-day month in 1447–1448 with the calendar itself, so the test
  // does not hard-code a sighting table.
  let found: { m: number; y: number } | null = null;
  for (const y of [1447, 1448]) {
    for (let m = 1; m <= 12 && !found; m += 1) {
      if (!convertHijriToGregorian("30", String(m), String(y)).ok && convertHijriToGregorian("29", String(m), String(y)).ok) found = { m, y };
    }
  }
  assert.ok(found, "expected at least one 29-day month in two years");
  const r = convertHijriToGregorian("30", String(found!.m), String(found!.y));
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /٢٩ يوماً بحسب تقويم أم القرى/);
});

test("a Hijri day above 30 or a month above 12 is refused before converting", () => {
  assert.equal(convertHijriToGregorian("31", "1", "1448").ok, false);
  assert.equal(convertHijriToGregorian("1", "13", "1448").ok, false);
  assert.equal(convertHijriToGregorian("1", "1", "1200").ok, false);
});
