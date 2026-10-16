import test from "node:test";
import assert from "node:assert/strict";
import { delegationStatus, validateNewDelegation, DELEGATION_AR } from "./businessDelegations.ts";
import { riyadhToday, isIsoDate } from "../riyadhToday.ts";

const TODAY = "2026-10-17";
const D = "aaaaaaaa-0000-4000-8000-000000000001";

test("status: revoked wins, then expiry, then the membership", () => {
  assert.equal(delegationStatus({ revokedAt: "2026-10-01T00:00:00Z", expiresOn: null, memberActive: true }, TODAY), "revoked");
  assert.equal(delegationStatus({ revokedAt: null, expiresOn: "2026-10-16", memberActive: true }, TODAY), "expired");
  // The last day itself still counts — the SQL helper compares `>=` today.
  assert.equal(delegationStatus({ revokedAt: null, expiresOn: TODAY, memberActive: true }, TODAY), "active");
  assert.equal(delegationStatus({ revokedAt: null, expiresOn: null, memberActive: false }, TODAY), "lapsed");
  assert.equal(delegationStatus({ revokedAt: null, expiresOn: null, memberActive: true }, TODAY), "active");
});

test("validate: a delegate id is required and must be a uuid", () => {
  assert.deepEqual(validateNewDelegation({}, TODAY), { ok: false, error: DELEGATION_AR.delegateRequired });
  assert.deepEqual(validateNewDelegation({ delegateUserId: "x" }, TODAY), { ok: false, error: DELEGATION_AR.delegateRequired });
  assert.deepEqual(validateNewDelegation(null, TODAY), { ok: false, error: DELEGATION_AR.badBody });
});

test("validate: scope defaults to company_profile and refuses anything else", () => {
  const ok = validateNewDelegation({ delegateUserId: D }, TODAY);
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.value.scope, "company_profile");
  assert.deepEqual(validateNewDelegation({ delegateUserId: D, scope: "billing" }, TODAY), { ok: false, error: DELEGATION_AR.badScope });
});

test("validate: expiry is a real date and not before today (Riyadh)", () => {
  assert.deepEqual(validateNewDelegation({ delegateUserId: D, expiresOn: "2026-02-30" }, TODAY), { ok: false, error: DELEGATION_AR.badExpiry });
  assert.deepEqual(validateNewDelegation({ delegateUserId: D, expiresOn: "2026-10-16" }, TODAY), { ok: false, error: DELEGATION_AR.pastExpiry });
  const ok = validateNewDelegation({ delegateUserId: D, expiresOn: TODAY, note: "  " }, TODAY);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.expiresOn, TODAY);
    assert.equal(ok.value.note, null);
  }
});

test("validate: the note is capped", () => {
  assert.deepEqual(validateNewDelegation({ delegateUserId: D, note: "x".repeat(501) }, TODAY), { ok: false, error: DELEGATION_AR.noteTooLong });
});

test("riyadhToday is the Riyadh date, not the UTC date", () => {
  // 22:30 UTC on 16 October is 01:30 on 17 October in Riyadh (UTC+3).
  assert.equal(riyadhToday(new Date("2026-10-16T22:30:00Z")), "2026-10-17");
  assert.equal(riyadhToday(new Date("2026-10-16T20:59:00Z")), "2026-10-16");
  assert.ok(isIsoDate("2026-10-17"));
  assert.ok(!isIsoDate("2026-13-01"));
  assert.ok(!isIsoDate("17-10-2026"));
});
