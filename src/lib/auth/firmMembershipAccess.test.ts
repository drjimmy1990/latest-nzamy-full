import assert from "node:assert/strict";
import test from "node:test";
import { FIRM_TEAM_VIEW_ROLES } from "./firmMembershipAccess.ts";

test("only firm leadership roles may read the whole team and workload", () => {
  assert.deepEqual(
    [...FIRM_TEAM_VIEW_ROLES].sort(),
    ["hr_manager", "managing_partner", "office_admin"],
  );

  for (const role of ["lawyer", "trainee", "secretary", "accountant", "consultant"]) {
    assert.equal(FIRM_TEAM_VIEW_ROLES.has(role), false, role);
  }
});
