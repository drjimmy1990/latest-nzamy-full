/**
 * dualCalendar.test.ts — the arithmetic behind the shared Hijri/Gregorian
 * date picker (owner decision ١٢٧).
 *
 * The picker stores a Gregorian ISO day and lets the lawyer browse and pick in
 * either calendar. Everything it shows in the Hijri view comes from this
 * module, and this module only ever asks hijri.ts (Intl `islamic-umalqura`) —
 * so the anchors below are the same ICU facts hijri.test.ts pins, plus two
 * Ramadans whose length the whole country observed (Eid al-Fitr 2024-04-10
 * after a 30-day Ramadan 1445; Eid 2025-03-30 after a 29-day Ramadan 1446).
 *
 * The rest are invariants, not re-typed tables: every Hijri month is 29 or 30
 * days, a Hijri year is 354 or 355, the day after a month's last day is the
 * 1st of the next, and a multi-year walk round-trips both ways.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { hijriAvailable, describeDateAr } from './hijri.ts';
import { addDays, isoDate, parseIsoDate } from './deadlineEngine.ts';
import {
  monthDays,
  monthLength,
  monthOf,
  shiftMonth,
  shiftIsoByMonths,
  isoFromParts,
  partsOf,
  weekStartOffset,
  moveByKey,
  isWithinRange,
  describeDateLinesAr,
  monthTitleAr,
  yearRange,
  splitLocalDateTime,
  joinLocalDateTime,
} from './dualCalendar.ts';

test('the runtime running these tests has Umm al-Qura data', () => {
  assert.equal(hijriAvailable(), true, 'this Node build has no islamic-umalqura calendar');
});

// ─── month lengths ───────────────────────────────────────────────────────────

test('Ramadan 1445 has 30 days and Ramadan 1446 has 29 (the Eids the country kept)', () => {
  assert.equal(monthLength({ calendar: 'hijri', year: 1445, month: 9 }), 30);
  assert.equal(monthLength({ calendar: 'hijri', year: 1446, month: 9 }), 29);

  const r1445 = monthDays({ calendar: 'hijri', year: 1445, month: 9 });
  assert.ok(r1445);
  assert.equal(r1445[0].iso, '2024-03-11', '1 Ramadan 1445 (hijri.test.ts anchor)');
  assert.equal(r1445[29].iso, '2024-04-09');
  // Eid al-Fitr 1445 = 2024-04-10, the day after the 30th.
  assert.equal(isoFromParts('hijri', 1445, 10, 1), '2024-04-10');

  const r1446 = monthDays({ calendar: 'hijri', year: 1446, month: 9 });
  assert.ok(r1446);
  assert.equal(r1446[0].iso, '2025-03-01');
  assert.equal(r1446.at(-1)?.iso, '2025-03-29');
  assert.equal(isoFromParts('hijri', 1446, 10, 1), '2025-03-30');
});

test('the 30th of a 29-day Hijri month does not exist — null, never a shifted date', () => {
  assert.equal(isoFromParts('hijri', 1446, 9, 30), null, '30 Ramadan 1446');
  assert.equal(isoFromParts('hijri', 1446, 9, 29), '2025-03-29');
  assert.equal(isoFromParts('hijri', 1445, 9, 30), '2024-04-09', '30 Ramadan 1445 exists');
});

test('every Hijri month 1440–1460 is 29 or 30 days, and every year 354 or 355', () => {
  for (let y = 1440; y <= 1460; y += 1) {
    let yearDays = 0;
    for (let m = 1; m <= 12; m += 1) {
      const len = monthLength({ calendar: 'hijri', year: y, month: m });
      assert.ok(len === 29 || len === 30, `${y}-${m} has ${len} days`);
      yearDays += len;
    }
    assert.ok(yearDays === 354 || yearDays === 355, `${y} has ${yearDays} days`);
  }
});

test('the day after a Hijri month ends is the 1st of the next — across the year boundary too', () => {
  for (let y = 1444; y <= 1450; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      const days = monthDays({ calendar: 'hijri', year: y, month: m });
      assert.ok(days, `${y}-${m}`);
      const last = parseIsoDate(days.at(-1)!.iso)!;
      const next = partsOf(isoDate(addDays(last, 1)), 'hijri');
      const expect = m === 12 ? [y + 1, 1, 1] : [y, m + 1, 1];
      assert.deepEqual([next?.year, next?.month, next?.day], expect, `after ${y}-${m}`);
    }
  }
});

test('the last day of a Hijri year (30 Dhu al-Hijjah 1399) is followed by 1 Muharram 1400', () => {
  assert.equal(isoFromParts('hijri', 1399, 12, 30), '1979-11-20', 'hijri.test.ts anchor');
  assert.equal(isoFromParts('hijri', 1400, 1, 1), '1979-11-21');
  assert.equal(monthLength({ calendar: 'hijri', year: 1399, month: 12 }), 30);
});

test('Gregorian month lengths: leap and non-leap Februaries, including the 2100 century rule', () => {
  assert.equal(monthLength({ calendar: 'gregorian', year: 2024, month: 2 }), 29);
  assert.equal(monthLength({ calendar: 'gregorian', year: 2026, month: 2 }), 28);
  assert.equal(monthLength({ calendar: 'gregorian', year: 2100, month: 2 }), 28);
  assert.equal(monthLength({ calendar: 'gregorian', year: 2000, month: 2 }), 29);
  assert.equal(monthLength({ calendar: 'gregorian', year: 2026, month: 4 }), 30);
  assert.equal(monthLength({ calendar: 'gregorian', year: 2026, month: 12 }), 31);
  assert.equal(isoFromParts('gregorian', 2026, 2, 29), null, '29 Feb 2026 does not exist');
  assert.equal(isoFromParts('gregorian', 2024, 2, 29), '2024-02-29');
  assert.equal(isoFromParts('gregorian', 2026, 2, 31), null);
});

// ─── round trips ─────────────────────────────────────────────────────────────

test('every day 2025-12-01 … 2028-01-31 round-trips through both calendars', () => {
  // Crosses two Gregorian year ends and two Hijri year ends (1447→1448, 1448→1449).
  let d = parseIsoDate('2025-12-01')!;
  const end = parseIsoDate('2028-01-31')!;
  let n = 0;
  while (d.getTime() <= end.getTime()) {
    const iso = isoDate(d);
    for (const cal of ['hijri', 'gregorian'] as const) {
      const p = partsOf(iso, cal);
      assert.ok(p, `${iso} in ${cal}`);
      assert.equal(isoFromParts(cal, p.year, p.month, p.day), iso, `${iso} via ${cal}`);
    }
    d = addDays(d, 1);
    n += 1;
  }
  assert.ok(n > 780);
});

test('monthDays lists each day once, in order, with both calendars on every cell', () => {
  const days = monthDays({ calendar: 'hijri', year: 1448, month: 3 });
  assert.ok(days);
  assert.equal(days.length, 29);
  assert.equal(days[13].iso, '2026-08-27', '14 Rabiʿ al-Awwal 1448 (hijri.test.ts anchor)');
  days.forEach((cell, i) => {
    assert.equal(cell.hijri?.day, i + 1);
    assert.equal(cell.hijri?.month, 3);
    assert.equal(cell.weekday, parseIsoDate(cell.iso)!.getDay());
    if (i > 0) assert.equal(cell.iso, isoDate(addDays(parseIsoDate(days[i - 1].iso)!, 1)));
  });

  const g = monthDays({ calendar: 'gregorian', year: 2026, month: 12 });
  assert.ok(g);
  assert.equal(g.length, 31);
  assert.equal(g[30].iso, '2026-12-31');
  assert.deepEqual([g[30].hijri?.year, g[30].hijri?.month, g[30].hijri?.day], [1448, 7, 22]);
  assert.deepEqual([g[30].gregorian.year, g[30].gregorian.month, g[30].gregorian.day], [2026, 12, 31]);
});

test('weekStartOffset puts the 1st under its weekday in a Sunday-first week', () => {
  // 1 Rabiʿ al-Awwal 1448 = Fri 2026-08-14 → five blanks (Sun..Thu) before it.
  assert.equal(weekStartOffset({ calendar: 'hijri', year: 1448, month: 3 }), 5);
  // 1 Nov 2026 is a Sunday.
  assert.equal(weekStartOffset({ calendar: 'gregorian', year: 2026, month: 11 }), 0);
});

test('monthOf names the month that contains a day, in either calendar', () => {
  assert.deepEqual(monthOf('2026-08-27', 'hijri'), { calendar: 'hijri', year: 1448, month: 3 });
  assert.deepEqual(monthOf('2026-08-27', 'gregorian'), { calendar: 'gregorian', year: 2026, month: 8 });
  assert.equal(monthOf('2026-02-31', 'gregorian'), null);
  assert.equal(monthOf('', 'hijri'), null);
});

// ─── navigation ──────────────────────────────────────────────────────────────

test('shiftMonth wraps the year in both directions', () => {
  assert.deepEqual(shiftMonth({ calendar: 'hijri', year: 1447, month: 12 }, 1), { calendar: 'hijri', year: 1448, month: 1 });
  assert.deepEqual(shiftMonth({ calendar: 'hijri', year: 1448, month: 1 }, -1), { calendar: 'hijri', year: 1447, month: 12 });
  assert.deepEqual(shiftMonth({ calendar: 'gregorian', year: 2026, month: 3 }, -15), { calendar: 'gregorian', year: 2024, month: 12 });
  assert.deepEqual(shiftMonth({ calendar: 'gregorian', year: 2026, month: 3 }, 12), { calendar: 'gregorian', year: 2027, month: 3 });
});

test('shiftIsoByMonths clamps to the last day of a shorter month instead of spilling over', () => {
  // 31 Jan → Feb: 28th (2026), 29th (2024). Never 3 March.
  assert.equal(shiftIsoByMonths('2026-01-31', 'gregorian', 1), '2026-02-28');
  assert.equal(shiftIsoByMonths('2024-01-31', 'gregorian', 1), '2024-02-29');
  assert.equal(shiftIsoByMonths('2026-12-15', 'gregorian', 1), '2027-01-15');
  // 30 Ramadan 1445 → Shawwal 1445 has 29 days → 29 Shawwal.
  assert.equal(shiftIsoByMonths('2024-04-09', 'hijri', 1), isoFromParts('hijri', 1445, 10, 29));
  // 30 Dhu al-Hijjah 1399 → Muharram 1400, and a year back from there.
  const muharram = shiftIsoByMonths('1979-11-20', 'hijri', 1);
  assert.equal(partsOf(muharram!, 'hijri')?.month, 1);
  assert.equal(partsOf(muharram!, 'hijri')?.year, 1400);
  assert.equal(shiftIsoByMonths('2026-08-27', 'hijri', -12), isoFromParts('hijri', 1447, 3, 14));
});

test('moveByKey: arrows follow the RTL grid, PageUp/Down change month, Home/End the week', () => {
  const wed = '2026-09-02'; // a Wednesday
  // In an RTL grid the next day sits to the LEFT.
  assert.equal(moveByKey(wed, 'ArrowLeft', 'gregorian'), '2026-09-03');
  assert.equal(moveByKey(wed, 'ArrowRight', 'gregorian'), '2026-09-01');
  assert.equal(moveByKey(wed, 'ArrowDown', 'gregorian'), '2026-09-09');
  assert.equal(moveByKey(wed, 'ArrowUp', 'gregorian'), '2026-08-26');
  assert.equal(moveByKey(wed, 'Home', 'gregorian'), '2026-08-30', 'Sunday of that week');
  assert.equal(moveByKey(wed, 'End', 'gregorian'), '2026-09-05', 'Saturday of that week');
  assert.equal(moveByKey(wed, 'PageDown', 'gregorian'), '2026-10-02');
  assert.equal(moveByKey(wed, 'PageUp', 'gregorian', true), '2025-09-02', 'Shift+PageUp = a year back');
  assert.equal(moveByKey(wed, 'PageDown', 'hijri'), shiftIsoByMonths(wed, 'hijri', 1));
  assert.equal(moveByKey(wed, 'Tab', 'gregorian'), null);
});

test('isWithinRange compares wall-clock days and treats a missing bound as open', () => {
  assert.equal(isWithinRange('2026-10-16', '2026-10-16', undefined), true);
  assert.equal(isWithinRange('2026-10-15', '2026-10-16', undefined), false);
  assert.equal(isWithinRange('2026-10-17', undefined, '2026-10-16'), false);
  assert.equal(isWithinRange('2026-10-17', '', ''), true);
});

// ─── labels ──────────────────────────────────────────────────────────────────

test('describeDateLinesAr is describeDateAr split into its two calendars — same words, nothing dropped', () => {
  let d = parseIsoDate('2026-01-01')!;
  for (let i = 0; i < 400; i += 1) {
    const iso = isoDate(d);
    const lines = describeDateLinesAr(iso);
    assert.ok(lines);
    assert.ok(lines.hijri, `${iso} has a Hijri line`);
    assert.equal(`${lines.gregorian} · ${lines.hijri}`, describeDateAr(iso));
    d = addDays(d, 1);
  }
  assert.equal(describeDateLinesAr('2026-02-31'), null);
  assert.equal(describeDateLinesAr(''), null);
  // The weekday is what survives a day/month transposition — it must be in the line.
  assert.match(describeDateLinesAr('2026-09-02')!.gregorian, /^الأربعاء ٢ سبتمبر ٢٠٢٦ م$/);
  assert.equal(describeDateLinesAr('2026-08-27')!.hijri, '١٤ ربيع الأول ١٤٤٨ هـ');
});

test('monthTitleAr names the month in its own calendar', () => {
  assert.equal(monthTitleAr({ calendar: 'hijri', year: 1448, month: 3 }), 'ربيع الأول ١٤٤٨ هـ');
  assert.equal(monthTitleAr({ calendar: 'gregorian', year: 2026, month: 9 }), 'سبتمبر ٢٠٢٦ م');
});

test('yearRange covers the bounds in each calendar, ascending', () => {
  const g = yearRange('gregorian', '2020-03-01', '2022-01-01');
  assert.deepEqual(g, [2020, 2021, 2022]);
  const h = yearRange('hijri', '2024-03-11', '2025-03-30');
  assert.deepEqual(h, [1445, 1446]);
});

// ─── date + time (consultation scheduling) ──────────────────────────────────

test('a datetime-local value splits into a picker day and a time, and joins back unchanged', () => {
  assert.deepEqual(splitLocalDateTime('2026-10-16T09:30'), { date: '2026-10-16', time: '09:30' });
  assert.deepEqual(splitLocalDateTime(''), { date: '', time: '' });
  assert.equal(joinLocalDateTime('2026-10-16', '09:30'), '2026-10-16T09:30');
  // Without both halves there is no instant to schedule.
  assert.equal(joinLocalDateTime('2026-10-16', ''), '');
  assert.equal(joinLocalDateTime('', '09:30'), '');
  for (const v of ['2026-01-01T00:00', '2026-12-31T23:59', '2024-02-29T12:05']) {
    const { date, time } = splitLocalDateTime(v);
    assert.equal(joinLocalDateTime(date, time), v);
  }
});
