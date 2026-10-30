/**
 * libraryAccessReminders.test.ts — the 7- and 3-day library reminders (owner
 * note ١٨ C06): who is due, keyed on the end of the chain, and the notice.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/libraryAccessReminders.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryReminderNotice, planLibraryReminders, type LibraryGrantRowWithUser } from './libraryAccessReminders.ts';

const DAY = 86_400_000;
const NOW = new Date('2026-11-01T09:00:00.000Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
const row = (id: string, user: string, from: number, to: number, extra: Partial<LibraryGrantRowWithUser> = {}): LibraryGrantRowWithUser => ({
  id, user_id: user, plan_ref: 'lib-q1', source: 'purchase', starts_at: at(from), ends_at: at(to), ...extra,
});

test('7 days or less → the 7-day reminder; 3 days or less → the 3-day one; more than 7 → nothing', () => {
  const due = planLibraryReminders([row('g1', 'u1', -80, 6.5), row('g2', 'u2', -80, 2), row('g3', 'u3', -10, 8)], NOW);
  assert.deepEqual(due.map((d) => [d.userId, d.grantId, d.offset]), [['u2', 'g2', 3], ['u1', 'g1', 7]]);
});

test('a user who renewed early is reminded about the END OF HIS CHAIN, keyed on the last grant', () => {
  // g1 ends in 2 days, g2 stacks from g1's end for 90 days → nothing due now
  assert.deepEqual(planLibraryReminders([row('g1', 'u1', -88, 2), row('g2', 'u1', 2, 92)], NOW), []);
  // the chain ends in 5 days on g2 → the 7-day reminder, keyed on g2 (not g1)
  const due = planLibraryReminders([row('g1', 'u1', -30, 1), row('g2', 'u1', 1, 5)], NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].grantId, 'g2');
  assert.equal(due[0].offset, 7);
  assert.equal(due[0].endsAt, at(5));
});

test('revoked rows, ended rows and access that has not started yet are not reminded', () => {
  assert.deepEqual(planLibraryReminders([row('g1', 'u1', -30, 2, { revoked_at: at(-1) })], NOW), []);
  assert.deepEqual(planLibraryReminders([row('g1', 'u1', -30, -1)], NOW), []);
  assert.deepEqual(planLibraryReminders([row('g1', 'u1', 1, 5)], NOW), [], 'upcoming only → no reminder');
});

test('a gap after a revoke: the reminder counts down to the end of the CURRENT stretch', () => {
  // g1 runs to day 3; g2 starts after a gap at day 10
  const due = planLibraryReminders([row('g1', 'u1', -30, 3), row('g2', 'u1', 10, 100)], NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].grantId, 'g1');
  assert.equal(due[0].offset, 3);
});

test('the notice is Arabic, says the days left and the date, and links to the renew page', () => {
  const n7 = libraryReminderNotice({ userId: 'u1', grantId: 'g1', offset: 7, endsAt: at(7) }, NOW);
  assert.equal(n7.title, 'اشتراك المكتبة ينتهي قريباً');
  assert.match(n7.body, /خلال 7 أيام/);
  assert.equal(n7.href, '/laws/subscribe');
  const n3 = libraryReminderNotice({ userId: 'u1', grantId: 'g1', offset: 3, endsAt: at(2) }, NOW);
  assert.equal(n3.title, 'اشتراك المكتبة ينتهي قريباً جداً');
  assert.match(n3.body, /خلال يومين/);
  assert.match(libraryReminderNotice({ userId: 'u1', grantId: 'g1', offset: 3, endsAt: at(0.3) }, NOW).body, /خلال يوم واحد/);
});
