/**
 * libraryAccessAdmin.test.ts — the admin rules of the library-only
 * subscription (owner note ١٨ C02–C04): the direct grant's body (reason
 * mandatory), revoke / end-change bodies, the status filter, the database
 * refusals in Arabic, and the CSV export.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/libraryAccessAdmin.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CSV_BOM,
  GRANT_CSV_HEADER,
  csvCell,
  grantCsvRow,
  grantRpcError,
  grantStatus,
  parseGrantChangeBody,
  parseGrantListQuery,
  parseLibraryGrantBody,
  riyadhEndOfDayIso,
  toCsv,
  type GrantListRow,
} from './libraryAccessAdmin.ts';

const U = '11111111-2222-4333-8444-555555555555';
const NOW = new Date('2026-10-30T12:00:00.000Z');
const DAY = 86_400_000;
const at = (d: number) => new Date(NOW.getTime() + d * DAY).toISOString();

test('direct grant: user, days and a reason are required; the plan defaults to lib-admin', () => {
  const ok = parseLibraryGrantBody({ userId: U, durationDays: 90, reason: 'تعويض عن عطل' });
  assert.deepEqual(ok, { ok: true, value: { userId: U, planRef: 'lib-admin', days: 90, reason: 'تعويض عن عطل', notes: null } });
  assert.equal(parseLibraryGrantBody({ userId: U, durationDays: 90 }).ok, false, 'no reason');
  assert.equal(parseLibraryGrantBody({ userId: U, durationDays: 90, reason: '  a ' }).ok, false, 'a blank-ish reason');
  assert.equal(parseLibraryGrantBody({ userId: 'x', durationDays: 90, reason: 'سبب كاف' }).ok, false, 'bad user id');
  for (const d of [0, 3661, 1.5, '30', undefined]) {
    assert.equal(parseLibraryGrantBody({ userId: U, durationDays: d, reason: 'سبب كاف' }).ok, false, `days ${String(d)}`);
  }
  assert.equal(parseLibraryGrantBody({ userId: U, durationDays: 1, reason: 'سبب كاف' }).ok, true);
  assert.equal(parseLibraryGrantBody({ userId: U, durationDays: 3660, reason: 'سبب كاف' }).ok, true);
});

test('direct grant: only the grantable plans; notes are trimmed and optional', () => {
  assert.equal(parseLibraryGrantBody({ userId: U, planRef: 'lib-founder', durationDays: 9, reason: 'سبب كاف' }).ok, false);
  assert.equal(parseLibraryGrantBody({ userId: U, planRef: 'pro', durationDays: 9, reason: 'سبب كاف' }).ok, false);
  const r = parseLibraryGrantBody({ userId: U, planRef: 'lib-annual', durationDays: 365, reason: 'سبب كاف', notes: '  ملاحظة ' });
  assert.ok(r.ok && r.value.planRef === 'lib-annual' && r.value.notes === 'ملاحظة');
  assert.equal(parseLibraryGrantBody({ userId: U, durationDays: 9, reason: 'x'.repeat(1001) }).ok, false);
});

test('revoke / adjust bodies: a reason always, a valid date for adjust', () => {
  assert.deepEqual(parseGrantChangeBody({ action: 'revoke', reason: 'طلب المستخدم' }), {
    ok: true, value: { action: 'revoke', reason: 'طلب المستخدم' },
  });
  assert.equal(parseGrantChangeBody({ action: 'revoke' }).ok, false);
  assert.equal(parseGrantChangeBody({ action: 'adjust', reason: 'تمديد', newEndsAt: 'nope' }).ok, false);
  const adj = parseGrantChangeBody({ action: 'adjust', reason: 'تمديد', newEndsAt: '2027-01-31T20:59:59.000Z' });
  assert.ok(adj.ok && adj.value.action === 'adjust' && adj.value.newEndsAt === '2027-01-31T20:59:59.000Z');
  assert.equal(parseGrantChangeBody({ action: 'delete', reason: 'سبب' }).ok, false);
});

test('a date picked in the admin page is the end of that day in Riyadh', () => {
  assert.equal(riyadhEndOfDayIso('2027-01-31'), '2027-01-31T20:59:59.000Z');
  assert.equal(riyadhEndOfDayIso('31/01/2027'), null);
});

test('status: revoked wins; expiring within 30 days; upcoming; expired', () => {
  assert.equal(grantStatus({ starts_at: at(-1), ends_at: at(100), revoked_at: at(0) }, NOW), 'revoked');
  assert.equal(grantStatus({ starts_at: at(-1), ends_at: at(100) }, NOW), 'active');
  assert.equal(grantStatus({ starts_at: at(-1), ends_at: at(30) }, NOW), 'expiring');
  assert.equal(grantStatus({ starts_at: at(5), ends_at: at(100) }, NOW), 'upcoming');
  assert.equal(grantStatus({ starts_at: at(-50), ends_at: at(-1) }, NOW), 'expired');
});

test('database refusals map to Arabic and the right status', () => {
  assert.equal(grantRpcError({ code: 'P0002', message: 'library_grant_not_found' }).status, 404);
  assert.equal(grantRpcError({ code: '55000', message: 'library_grant_already_revoked' }).status, 409);
  assert.equal(grantRpcError({ code: '55000', message: 'library_grant_overlap' }).status, 409);
  assert.equal(grantRpcError({ code: '22023', message: 'library_grant_end_too_early' }).status, 400);
  assert.equal(grantRpcError({ code: 'PGRST202', message: 'x' }).status, 503, 'the SQL has not run');
  const unknown = grantRpcError({ code: 'XX000', message: 'secret internals' });
  assert.equal(unknown.status, 500);
  assert.ok(!unknown.error.includes('secret'), 'raw database text never reaches the admin');
});

test('list query: unknown values are dropped, never passed to the query', () => {
  const f = parseGrantListQuery(new URLSearchParams('status=active&source=purchase&plan=lib-q1&grantedBy=' + U + '&orderId=nope&page=3&q=a,b(c)%&format=csv&endsFrom=2026-11-01'));
  assert.equal(f.status, 'active');
  assert.equal(f.source, 'purchase');
  assert.equal(f.planRef, 'lib-q1');
  assert.equal(f.grantedBy, U);
  assert.equal(f.orderId, null);
  assert.equal(f.page, 3);
  assert.equal(f.q, 'abc', 'PostgREST filter separators are stripped');
  assert.equal(f.format, 'csv');
  assert.equal(f.endsFrom, '2026-10-31T21:00:00.000Z');
  const bad = parseGrantListQuery(new URLSearchParams('status=all&source=hack&plan=x&page=-1'));
  assert.equal(bad.status, null);
  assert.equal(bad.source, null);
  assert.equal(bad.planRef, null);
  assert.equal(bad.page, 1);
  assert.equal(bad.format, 'json');
});

test('CSV: BOM first, quoting of " , and newlines, CRLF rows', () => {
  const csv = toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line1\nline2', null]]);
  assert.ok(csv.startsWith(CSV_BOM), 'Excel needs the BOM to read Arabic UTF-8');
  assert.equal(csv, CSV_BOM + 'a,b\r\n"x,y","say ""hi"""\r\n"line1\nline2",\r\n');
});

test('CSV: cells starting with = + - @ TAB or CR are neutralised (formula injection)', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-2'), "'-2");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('\tx'), "'\tx");
  assert.equal(csvCell('محمد'), 'محمد');
  assert.equal(csvCell(undefined), '');
});

test('CSV row: Arabic labels for plan, source and status, one cell per header', () => {
  const r: GrantListRow = {
    id: 'g', user_id: U, user_name: 'أحمد', user_email: 'a@x.sa', user_type: 'lawyer',
    plan_ref: 'lib-admin', source: 'admin', starts_at: at(-1), ends_at: at(10),
    granted_by: U, granted_by_name: 'المدير', order_id: null, revoked_at: null, revoked_by: null,
    reason: 'تعويض', notes: null, revoke_reason: null, adjust_reason: null, created_at: at(-1),
  };
  const cells = grantCsvRow(r, NOW);
  assert.equal(cells.length, GRANT_CSV_HEADER.length);
  assert.equal(cells[4], 'منحة إدارية');
  assert.equal(cells[5], 'أدمن');
  assert.equal(cells[6], 'ينتهي خلال 30 يوماً');
  assert.equal(cells[9], 'المدير');
});

// ─── The admin screens (source pins: the UI sends what the routes require) ───

const page = (rel: string) => readFileSync(join(import.meta.dirname, '..', 'app', 'dashboard', 'admin', rel), 'utf8');

test('entitlements page: «منح اشتراك المكتبة» posts action library with the reason, and blocks an empty reason', () => {
  const src = page('entitlements/page.tsx');
  assert.ok(src.includes('منح اشتراك المكتبة'));
  assert.ok(src.includes('grant("library")'));
  assert.ok(src.includes('body.reason = libraryReason.trim();'));
  assert.ok(src.includes('body.planRef = libraryPlan;'));
  assert.ok(/action === "library" && libraryReason\.trim\(\)\.length < 3/.test(src), 'no request without a reason');
});

test('library-subscriptions page: list + server CSV link, revoke / adjust with a reason, adjust sends the Riyadh end of day', () => {
  const src = page('library-subscriptions/page.tsx');
  assert.ok(src.includes('/api/v1/admin/library-grants?'));
  assert.ok(src.includes('queryString(filters, 1, true)'), 'the CSV is the server export of the same filters');
  assert.ok(!src.includes('new Blob('), 'the CSV is never assembled in the browser');
  assert.ok(src.includes('method: "PATCH"'));
  assert.ok(src.includes('reason: reason.trim()'));
  assert.ok(src.includes('riyadhEndOfDayIso(newEnd)'));
  for (const s of ['active', 'expiring', 'upcoming', 'expired', 'revoked']) assert.ok(src.includes(`${s}:`), s);
});
