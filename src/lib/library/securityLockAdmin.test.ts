/**
 * securityLockAdmin.test.ts — owner note ١٣ C09, the admin side's pure half.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/securityLockAdmin.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { isMigrationMissing, lockDbError, parseCreateLockBody, parseLiftLockBody, toLockDto, type LockRow } from "./securityLockAdmin.ts";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const UID = "00000000-0000-0000-0000-00000000c001";

test("create: an e-mail or a user id, and a reason, are required", () => {
  assert.equal(parseCreateLockBody(null, NOW).ok, false);
  assert.equal(parseCreateLockBody({ note: "x" }, NOW).ok, false);
  assert.equal(parseCreateLockBody({ email: "a@b.co" }, NOW).ok, false);
  assert.equal(parseCreateLockBody({ email: "not-an-email", note: "x" }, NOW).ok, false);
  const ok = parseCreateLockBody({ email: " A@B.co ", note: " scraping " }, NOW);
  assert.deepEqual(ok, { ok: true, value: { userId: null, email: "a@b.co", note: "scraping", until: null } });
  const byId = parseCreateLockBody({ userId: UID, note: "x" }, NOW);
  assert.equal(byId.ok && byId.value.userId, UID);
});

test("create: the end date is optional, in the future, and at most a year away", () => {
  assert.equal(parseCreateLockBody({ email: "a@b.co", note: "x", until: "2026-10-29T00:00:00Z" }, NOW).ok, false);
  assert.equal(parseCreateLockBody({ email: "a@b.co", note: "x", until: "garbage" }, NOW).ok, false);
  assert.equal(parseCreateLockBody({ email: "a@b.co", note: "x", until: "2028-01-01T00:00:00Z" }, NOW).ok, false);
  const r = parseCreateLockBody({ email: "a@b.co", note: "x", until: "2026-11-01T00:00:00Z" }, NOW);
  assert.equal(r.ok && r.value.until, "2026-11-01T00:00:00.000Z");
  assert.equal(parseCreateLockBody({ email: "a@b.co", note: "x".repeat(1001) }, NOW).ok, false);
});

test("lift: today's count is cleared unless the admin says otherwise", () => {
  assert.deepEqual(parseLiftLockBody({}), { ok: true, value: { note: null, resetToday: true } });
  assert.deepEqual(parseLiftLockBody(null), { ok: true, value: { note: null, resetToday: true } });
  assert.deepEqual(parseLiftLockBody({ note: " ok ", resetToday: false }), { ok: true, value: { note: "ok", resetToday: false } });
  assert.equal(parseLiftLockBody({ note: "x".repeat(1001) }).ok, false);
});

const row = (over: Partial<LockRow>): LockRow => ({
  id: "l1", user_id: UID, reference: "SEC-0A1B2C3D4E", reason: "quota_breach",
  details: { refused_docs: 60 }, note: null, locked_at: "2026-10-30T10:00:00Z", locked_until: null,
  locked_by: null, lifted_at: null, lifted_by: null, lift_note: null, ...over,
});

test("toLockDto: active means open and not past its end; names are hydrated", () => {
  const people = new Map([[UID, { name: "أحمد", email: "a@b.co" }]]);
  const open = toLockDto(row({}), people, NOW);
  assert.equal(open.active, true);
  assert.equal(open.user.name, "أحمد");
  assert.equal(open.lockedBy, null); // the system
  assert.match(open.reasonAr, /تلقائي/);
  assert.equal(toLockDto(row({ locked_until: "2026-10-30T11:00:00Z" }), people, NOW).active, false);
  assert.equal(toLockDto(row({ lifted_at: "2026-10-30T11:00:00Z" }), people, NOW).active, false);
  assert.equal(toLockDto(row({ details: [1] }), people, NOW).details, null);
});

test("lockDbError: database refusals become honest Arabic answers", () => {
  assert.equal(lockDbError({ code: "P0001", message: "admin_target" }).status, 400);
  assert.equal(lockDbError({ code: "P0002", message: "not_found" }).status, 404);
  assert.equal(lockDbError({ code: "22023" }).status, 400);
  assert.equal(lockDbError({ code: "PGRST202" }).status, 503);
  assert.equal(lockDbError({ code: "XX000" }).status, 500);
  assert.equal(isMigrationMissing("42P01"), true);
  assert.equal(isMigrationMissing("23505"), false);
});
