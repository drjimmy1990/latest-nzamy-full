import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveBusinessProfileScope,
  canWriteBusinessProfile,
  applyDelegation,
} from "./businessProfileScope.ts";

const NO_READS = { ownedId: null, ownedFailed: false, memberId: null, memberFailed: false };

test("an owner is 'owner' even though the backfill trigger also gave them a members row", () => {
  assert.deepEqual(
    resolveBusinessProfileScope({ ...NO_READS, ownedId: "biz-1", memberId: "biz-1" }),
    { scope: "owner", businessId: "biz-1", readFailed: false },
  );
});

test("an active member with no owned row is 'member' and still names the company", () => {
  assert.deepEqual(
    resolveBusinessProfileScope({ ...NO_READS, memberId: "biz-1" }),
    { scope: "member", businessId: "biz-1", readFailed: false },
  );
});

test("neither read finding a row is 'none' — and that is NOT a failure", () => {
  assert.deepEqual(resolveBusinessProfileScope(NO_READS), {
    scope: "none",
    businessId: null,
    readFailed: false,
  });
});

test("a failed read is never reported as 'nothing there'", () => {
  // Both failed.
  assert.deepEqual(
    resolveBusinessProfileScope({ ...NO_READS, ownedFailed: true, memberFailed: true }),
    { scope: "none", businessId: null, readFailed: true },
  );
  // Only the owner read failed and no membership exists: still unknown.
  assert.deepEqual(
    resolveBusinessProfileScope({ ...NO_READS, ownedFailed: true }),
    { scope: "none", businessId: null, readFailed: true },
  );
  // Only the membership read failed and no owned row: still unknown.
  assert.deepEqual(
    resolveBusinessProfileScope({ ...NO_READS, memberFailed: true }),
    { scope: "none", businessId: null, readFailed: true },
  );
});

test("a proven owned row outranks a failed membership read — no marker needed", () => {
  assert.deepEqual(
    resolveBusinessProfileScope({ ...NO_READS, ownedId: "biz-1", memberFailed: true }),
    { scope: "owner", businessId: "biz-1", readFailed: false },
  );
});

test("a proven membership with a FAILED owner read is 'member', flagged as possibly an undercount", () => {
  assert.deepEqual(
    resolveBusinessProfileScope({ ...NO_READS, ownedFailed: true, memberId: "biz-1" }),
    { scope: "member", businessId: "biz-1", readFailed: true },
  );
});

test("an id from a FAILED read is never used", () => {
  // A supabase-js error comes back as `{ data: null, error }`, but a caller
  // that forwards a stale id must not get it honoured either.
  assert.equal(
    resolveBusinessProfileScope({ ownedId: "biz-1", ownedFailed: true, memberId: "biz-2", memberFailed: true }).scope,
    "none",
  );
});

test("the owner or a registered delegate may write — owner decision ٣٦", () => {
  assert.equal(canWriteBusinessProfile("owner"), true);
  assert.equal(canWriteBusinessProfile("delegate"), true);
  assert.equal(canWriteBusinessProfile("member"), false);
  assert.equal(canWriteBusinessProfile("none"), false);
});

test("applyDelegation upgrades a member only, and only on a live delegation", () => {
  const member = { scope: "member" as const, businessId: "biz-1", readFailed: false };
  assert.deepEqual(applyDelegation(member, "delegate"), { ...member, scope: "delegate" });
  assert.deepEqual(applyDelegation(member, "not_delegate"), member);
  // The migration has not run: the WP-6 owner-only behaviour, not an error.
  assert.deepEqual(applyDelegation(member, "unavailable"), member);
  // An unknown answer must not read as «only the owner may edit».
  assert.deepEqual(applyDelegation(member, "failed"), { ...member, readFailed: true });

  const owner = { scope: "owner" as const, businessId: "biz-1", readFailed: false };
  assert.deepEqual(applyDelegation(owner, "failed"), owner);
  const none = { scope: "none" as const, businessId: null, readFailed: false };
  assert.deepEqual(applyDelegation(none, "delegate"), none);
});
