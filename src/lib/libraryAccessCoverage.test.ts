/**
 * libraryAccessCoverage.test.ts — the user's library coverage (the chain of
 * stacked grants) and the 7/3-day reminder offsets (owner note ١٨ C05/C06).
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/libraryAccessCoverage.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  libraryCoverage,
  libraryDaysLeft,
  libraryReminderOffset,
  stackedGrantWindow,
  type LibraryGrantRow,
} from './libraryAccess.ts';

const NOW = new Date('2026-10-30T12:00:00.000Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
const row = (id: string, s: number, e: number, extra: Partial<LibraryGrantRow> = {}): LibraryGrantRow => ({
  id, plan_ref: 'lib-q1', source: 'purchase', starts_at: at(s), ends_at: at(e), ...extra,
});

test('no rows, or only ended / revoked rows → none', () => {
  assert.deepEqual(libraryCoverage([], NOW), { status: 'none' });
  assert.deepEqual(libraryCoverage([row('a', -40, -10)], NOW), { status: 'none' });
  assert.deepEqual(libraryCoverage([row('a', -1, 30, { revoked_at: at(0) })], NOW), { status: 'none' });
});

test('one running grant: its own end', () => {
  const c = libraryCoverage([row('a', -10, 20)], NOW);
  assert.equal(c.status, 'active');
  if (c.status === 'none') return;
  assert.equal(c.endsAt, at(20));
  assert.equal(c.lastGrantId, 'a');
  assert.equal(c.nextStartsAt, null);
});

test('an early renewal stacks: the user is shown the END OF THE CHAIN, not the current row', () => {
  // what stackedGrantWindow writes for a 90-day renewal during a grant ending day 20
  const w = stackedGrantWindow(90, NOW, at(20))!;
  assert.equal(w.startsAt, at(20));
  const c = libraryCoverage([row('a', -10, 20), { ...row('b', 0, 0), starts_at: w.startsAt, ends_at: w.endsAt }], NOW);
  assert.equal(c.status, 'active');
  if (c.status === 'none') return;
  assert.equal(c.endsAt, at(110));
  assert.equal(c.lastGrantId, 'b', 'the reminder key is the last grant of the chain');
  assert.equal(c.planRef, 'lib-q1');
});

test('a gap (a revoked or shortened grant) stops the chain and names the next start', () => {
  const c = libraryCoverage([row('a', -10, 5), row('b', 30, 60)], NOW);
  assert.equal(c.status, 'active');
  if (c.status === 'none') return;
  assert.equal(c.endsAt, at(5));
  assert.equal(c.nextStartsAt, at(30));
});

test('only an upcoming grant (the running one was revoked) → upcoming', () => {
  const c = libraryCoverage([row('a', -10, 0.0001, { revoked_at: at(0) }), row('b', 20, 50)], NOW);
  assert.equal(c.status, 'upcoming');
  if (c.status === 'none') return;
  assert.equal(c.startsAt, at(20));
  assert.equal(c.endsAt, at(50));
});

test('overlapping legacy rows: the latest end wins, order does not matter', () => {
  const c = libraryCoverage([row('b', -5, 40), row('a', -10, 20), row('c', 40, 70)], NOW);
  if (c.status === 'none') return assert.fail('expected coverage');
  assert.equal(c.endsAt, at(70));
  assert.equal(c.lastGrantId, 'c');
});

test('unparseable dates are ignored, never thrown on', () => {
  const c = libraryCoverage([{ id: 'x', plan_ref: 'lib-q1', source: 'admin', starts_at: 'nope', ends_at: 'nope' }], NOW);
  assert.deepEqual(c, { status: 'none' });
});

test('reminder offsets: 7 then 3, nothing before 7 days or after the end', () => {
  assert.equal(libraryReminderOffset(at(10), NOW), null);
  assert.equal(libraryReminderOffset(at(7), NOW), 7);
  assert.equal(libraryReminderOffset(at(4), NOW), 7);
  assert.equal(libraryReminderOffset(at(3), NOW), 3, 'a run that missed the 7-day window sends only the 3-day one');
  assert.equal(libraryReminderOffset(at(0.5), NOW), 3);
  assert.equal(libraryReminderOffset(at(-1), NOW), null);
  assert.equal(libraryReminderOffset('bad', NOW), null);
});

test('days left rounds up and stops at 0', () => {
  assert.equal(libraryDaysLeft(at(2.2), NOW), 3);
  assert.equal(libraryDaysLeft(at(-1), NOW), 0);
});
