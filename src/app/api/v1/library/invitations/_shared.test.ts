/**
 * _shared.test.ts — the library invitation row → DTO (owner q378: a code's
 * own days and seats). Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/api/v1/library/invitations/_shared.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  LIBRARY_INVITATION_SELECT,
  LIBRARY_INVITATION_SELECT_V2,
  toLibraryInvitationDto,
  type LibraryInvitationRow,
} from "./_shared.ts";

const ROW: LibraryInvitationRow = {
  id: "i-1",
  code: "NZAMY2026",
  max_uses: 5,
  current_uses: 1,
  expires_at: null,
  created_by: null,
  created_at: "2026-11-03T08:00:00Z",
  updated_at: "2026-11-03T08:00:00Z",
};

test("the V2 select is the V1 select plus grant_days (20261103_11)", () => {
  assert.equal(LIBRARY_INVITATION_SELECT_V2, LIBRARY_INVITATION_SELECT + ", grant_days");
  assert.ok(!LIBRARY_INVITATION_SELECT.includes("grant_days"));
});

test("a code's own days reach the DTO; none (null, or read before 20261103_11) = the default 30", () => {
  assert.equal(toLibraryInvitationDto({ ...ROW, grant_days: 90 }).grantDays, 90);
  assert.equal(toLibraryInvitationDto({ ...ROW, grant_days: null }).grantDays, 30);
  assert.equal(toLibraryInvitationDto(ROW).grantDays, 30);
  assert.equal(toLibraryInvitationDto({ ...ROW, grant_days: 90 }).maxUses, 5, "seats = max_uses");
});
