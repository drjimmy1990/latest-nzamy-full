import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firmInviteErrorResponse, firmInvitePath, isFirmInviteRole, isInviteToken,
  normaliseInviteEmail, redeemErrorMessage,
} from "./_invitations.ts";
import { restrictionErrorResponse, restrictionFeatureMissing } from "../../cases/[id]/restriction/_restriction.ts";

test("firm invitations: e-mail is trimmed, lower-cased and must look like one", () => {
  assert.equal(normaliseInviteEmail("  New@Example.COM "), "new@example.com");
  assert.equal(normaliseInviteEmail("no-at-sign"), null);
  assert.equal(normaliseInviteEmail(42), null);
});

test("firm invitations: only the firm_members role CHECK values", () => {
  assert.ok(isFirmInviteRole("finance_manager"));
  assert.ok(!isFirmInviteRole("owner"));
});

test("firm invitations: the link is /invite/team/<hex token>, not the library /invite/<code>", () => {
  const token = "a".repeat(64);
  assert.equal(firmInvitePath(token), `/invite/team/${token}`);
  assert.ok(isInviteToken(token));
  assert.ok(!isInviteToken("../etc"));
  assert.ok(!isInviteToken("NZM-INV-1234"));
});

test("firm invitations: database refusals become honest statuses", () => {
  assert.equal(firmInviteErrorResponse("PGRST202").status, 503);
  assert.equal(firmInviteErrorResponse("42501").status, 403);
  assert.equal(firmInviteErrorResponse("P0002").status, 404);
  assert.equal(firmInviteErrorResponse("P0003").status, 410);
  assert.equal(firmInviteErrorResponse("XX000").status, 500);
  assert.match(redeemErrorMessage("42501").message, /بالبريد الذي وصلته الدعوة/);
});

test("restricted cases: errors of set_case_restricted map to statuses", () => {
  assert.ok(restrictionFeatureMissing("42703"));
  assert.equal(restrictionErrorResponse("42501").status, 403);
  assert.equal(restrictionErrorResponse("22023").status, 400);
  assert.equal(restrictionErrorResponse("P0002").status, 404);
  assert.equal(restrictionErrorResponse("42883").status, 503);
  assert.equal(restrictionErrorResponse(null).status, 500);
});
