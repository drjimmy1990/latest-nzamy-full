/**
 * hijri.test.ts
 *
 * The defect this pins: the app carried TWO hand-rolled Hijri implementations
 * that disagreed with each other on 674 of 730 consecutive days, and neither
 * matched Umm al-Qura — the calendar Saudi courts file against. On 2026-08-27
 * the widget in every account header said 13 Rabiʿ al-Awwal; Umm al-Qura says
 * 14. A filing deadline is counted in those days.
 *
 * The anchors below were read from ICU's own `islamic-umalqura` calendar. They
 * are here so that anyone who "optimises" this module back into arithmetic
 * fails immediately instead of shipping a calendar that is a day out.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HIJRI_MONTHS_AR,
  hijriAvailable,
  hijriPartsOf,
  hijriLabelAr,
  gregorianFromHijri,
  toArabicDigits,
  describeDateAr,
} from './hijri.ts';

/** Local midnight, the way every caller in the app builds its dates. */
function localDate(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d);
}

// Gregorian → Umm al-Qura, verified against ICU.
const ANCHORS: Array<[string, [number, number, number], [number, number, number]]> = [
  ['the day the two implementations were caught disagreeing', [2026, 8, 27], [1448, 3, 14]],
  ['a new year in the middle of a Hijri month', [2026, 1, 1], [1447, 7, 12]],
  ['a Gregorian leap day', [2000, 2, 29], [1420, 11, 23]],
  ['the first of Ramadan', [2024, 3, 11], [1445, 9, 1]],
  ['the last day of a Gregorian year', [2026, 12, 31], [1448, 7, 22]],
  ['the last day of a Hijri year', [1979, 11, 20], [1399, 12, 30]],
];

test('the runtime running these tests has Umm al-Qura data', () => {
  // If this fails the rest of the file proves nothing, so it fails first and
  // says why rather than letting every assertion below skip silently.
  assert.equal(hijriAvailable(), true, 'this Node build has no islamic-umalqura calendar');
});

test('every anchor converts to the Umm al-Qura date ICU reports', () => {
  for (const [what, [gy, gm, gd], [hy, hm, hd]] of ANCHORS) {
    const parts = hijriPartsOf(localDate(gy, gm, gd));
    assert.ok(parts, `${what}: expected a conversion`);
    assert.deepEqual(
      [parts.year, parts.month, parts.day],
      [hy, hm, hd],
      `${what}: ${gy}-${gm}-${gd} should be ${hy}-${hm}-${hd}`,
    );
  }
});

test('the month name matches the month number', () => {
  const parts = hijriPartsOf(localDate(2024, 3, 11));
  assert.ok(parts);
  assert.equal(parts.month, 9);
  assert.equal(parts.monthName, 'رمضان');
  assert.equal(HIJRI_MONTHS_AR[parts.month - 1], parts.monthName);
});

test('there are twelve month names and no blanks', () => {
  assert.equal(HIJRI_MONTHS_AR.length, 12);
  for (const name of HIJRI_MONTHS_AR) assert.ok(name.trim().length > 0);
});

test('the label reads as Arabic with Arabic-Indic numerals', () => {
  assert.equal(hijriLabelAr(localDate(2026, 8, 27)), '١٤ ربيع الأول ١٤٤٨ هـ');
});

test('an invalid Date returns null rather than NaN anywhere on screen', () => {
  assert.equal(hijriPartsOf(new Date('nonsense')), null);
  assert.equal(hijriLabelAr(new Date('nonsense')), null);
});

// ── The reverse direction ──────────────────────────────────────────────────
//
// This is what the widget's «هجري ← ميلادي» converter calls. It is searched
// against hijriPartsOf rather than computed, so it cannot drift from the
// forward direction — which is precisely how the two old implementations came
// to disagree.

test('every anchor round-trips back to the same Gregorian day', () => {
  for (const [what, [gy, gm, gd], [hy, hm, hd]] of ANCHORS) {
    const back = gregorianFromHijri(hd, hm, hy);
    assert.ok(back, `${what}: expected a reverse conversion`);
    assert.deepEqual(
      [back.getFullYear(), back.getMonth() + 1, back.getDate()],
      [gy, gm, gd],
      `${what}: ${hy}-${hm}-${hd} should be ${gy}-${gm}-${gd}`,
    );
  }
});

test('the reverse direction agrees with the forward one across a long run', () => {
  // 400 consecutive days. The old pair of implementations diverged on 674 of
  // 730; a run this long turns that class of bug into a failing test rather
  // than a report someone writes eighteen months later.
  const start = localDate(2026, 1, 1);
  let checked = 0;
  for (let i = 0; i < 400; i += 1) {
    const g = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const h = hijriPartsOf(g);
    assert.ok(h, `no conversion for offset ${i}`);
    const back = gregorianFromHijri(h.day, h.month, h.year);
    assert.ok(back, `no reverse conversion for ${h.year}-${h.month}-${h.day}`);
    assert.deepEqual(
      [back.getFullYear(), back.getMonth() + 1, back.getDate()],
      [g.getFullYear(), g.getMonth() + 1, g.getDate()],
      `round trip broke at offset ${i}`,
    );
    checked += 1;
  }
  assert.equal(checked, 400);
});

test('a Hijri date that does not exist returns null, not a nearby guess', () => {
  // Hijri months are 29 or 30 days. Asking for the 30th of a 29-day month must
  // answer "there is no such day" rather than sliding to the 1st of the next —
  // a silently-shifted deadline is the whole failure mode this module exists
  // to prevent. Find a real 29-day month first so the test cannot rot.
  let shortMonth: { month: number; year: number } | null = null;
  const probe = localDate(2026, 1, 1);
  for (let i = 0; i < 400 && !shortMonth; i += 1) {
    const g = new Date(probe.getFullYear(), probe.getMonth(), probe.getDate() + i);
    const h = hijriPartsOf(g);
    if (h && h.day === 29) {
      const next = new Date(g.getFullYear(), g.getMonth(), g.getDate() + 1);
      const nh = hijriPartsOf(next);
      if (nh && nh.day === 1) shortMonth = { month: h.month, year: h.year };
    }
  }
  assert.ok(shortMonth, 'expected to find a 29-day Hijri month in a 400-day window');
  assert.equal(gregorianFromHijri(30, shortMonth.month, shortMonth.year), null);
});

test('out-of-range input is refused rather than clamped', () => {
  assert.equal(gregorianFromHijri(0, 1, 1448), null);
  assert.equal(gregorianFromHijri(31, 1, 1448), null);
  assert.equal(gregorianFromHijri(1, 0, 1448), null);
  assert.equal(gregorianFromHijri(1, 13, 1448), null);
  assert.equal(gregorianFromHijri(1.5, 1, 1448), null);
  assert.equal(gregorianFromHijri(1, 1, 0), null);
});

test('toArabicDigits converts every digit and leaves the rest alone', () => {
  assert.equal(toArabicDigits(1448), '١٤٤٨');
  assert.equal(toArabicDigits('12/3'), '١٢/٣');
  assert.equal(toArabicDigits('رمضان ١٤٤٥'), 'رمضان ١٤٤٥');
});

// ─── describeDateAr — the date read-back on the hearing form ──────────────────

test("describeDateAr writes the date in words, in both calendars", () => {
  // 2 September 2026 is a Wednesday, 20 Rabiʿ al-Awwal 1448.
  assert.equal(
    describeDateAr("2026-09-02"),
    "الأربعاء ٢ سبتمبر ٢٠٢٦ م · ٢٠ ربيع الأول ١٤٤٨ هـ",
  );
});

test("a transposed day and month produce a DIFFERENT weekday", () => {
  // The whole point. `mm/dd/yyyy` in an Arabic RTL form invites ٩/٢ for ٢/٩,
  // and on a court date that is a missed hearing. Whatever else two transposed
  // readings share, they cannot share a weekday — so the weekday is what makes
  // the mistake visible before the lawyer saves it.
  const asWritten = describeDateAr("2026-09-02");
  const asMisread = describeDateAr("2026-02-09");
  assert.ok(asWritten && asMisread);
  assert.notEqual(asWritten, asMisread);
  assert.ok(asWritten.startsWith("الأربعاء"));
  assert.ok(asMisread.startsWith("الاثنين"));
});

test("the full Hijri month name is carried, never truncated", () => {
  // «ربيع الأول» and «ربيع الثاني» differ only in the second word; a read-back
  // that dropped it would be ambiguous by a month on a filing deadline.
  const rabiAwwal = describeDateAr("2026-09-02");
  assert.ok(rabiAwwal?.includes("ربيع الأول"));
  // 1448-04-20 ≈ 2 October 2026 — the NEXT month, and it must say so.
  const next = describeDateAr("2026-10-02");
  assert.ok(next?.includes("ربيع الثاني"), `expected ربيع الثاني, got «${next}»`);
});

test("a date that does not exist returns null, not a rolled-over one", () => {
  // `new Date(2026, 1, 31)` silently becomes 3 March. A form that accepted it
  // would schedule a hearing on a day the lawyer never chose.
  assert.equal(describeDateAr("2026-02-31"), null);
  assert.equal(describeDateAr("2026-13-01"), null);
  assert.equal(describeDateAr("2026-04-31"), null);
  // …but a real leap day is fine.
  assert.ok(describeDateAr("2028-02-29"));
});

test("anything that is not a complete ISO date renders nothing", () => {
  for (const bad of ["", "2026", "2026-09", "02/09/2026", "2026-9-2", "not a date"]) {
    assert.equal(describeDateAr(bad), null, `«${bad}» should not describe`);
  }
});

test("the read-back never contains Western digits", () => {
  // It sits beside a native date input that is already showing Latin numerals;
  // if the read-back did too, it would not read as a correction.
  const out = describeDateAr("2026-09-02");
  assert.ok(out);
  assert.doesNotMatch(out, /[0-9]/);
});
