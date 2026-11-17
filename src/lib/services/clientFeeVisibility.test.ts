import assert from "node:assert/strict";
import test from "node:test";
import { canSeeClientFees, firmRoleMap, FEE_VISIBLE_FIRM_ROLES, withFeesVisibleTo } from "./clientFeeVisibility.ts";

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const F1 = "f1000000-0000-0000-0000-000000000001";
const F2 = "f2000000-0000-0000-0000-000000000002";

test("S3: the card's own author always sees its fees", () => {
  assert.equal(canSeeClientFees(ME, { owner_user_id: ME, firm_id: null }, new Map()), true);
  assert.equal(canSeeClientFees(ME, { owner_user_id: ME, firm_id: F1 }, new Map([[F1, "trainee"]])), true);
});

test("S3: partners and the finance manager see a colleague's firm card fees", () => {
  for (const role of FEE_VISIBLE_FIRM_ROLES) {
    assert.equal(canSeeClientFees(ME, { owner_user_id: OTHER, firm_id: F1 }, new Map([[F1, role]])), true, role);
  }
});

test("S3: secretary, trainee and every other role do not", () => {
  for (const role of [
    "legal_secretary", "trainee", "office_admin", "hr_manager", "compliance_manager",
    "lawyer", "senior_lawyer", "legal_consultant", "in_house_counsel", "external_of_counsel",
  ]) {
    assert.equal(canSeeClientFees(ME, { owner_user_id: OTHER, firm_id: F1 }, new Map([[F1, role]])), false, role);
  }
});

test("S3: deny by default — unknown firm, no role, no firm", () => {
  assert.equal(canSeeClientFees(ME, { owner_user_id: OTHER, firm_id: F1 }, new Map()), false);
  // a partner of F2 is not a partner of F1
  assert.equal(canSeeClientFees(ME, { owner_user_id: OTHER, firm_id: F1 }, new Map([[F2, "partner"]])), false);
  assert.equal(canSeeClientFees(ME, { owner_user_id: OTHER, firm_id: null }, new Map([[F1, "partner"]])), false);
});

test("S3: withFeesVisibleTo nulls both fee fields only when hidden", () => {
  const dto = { id: "c", feeTotalSar: 1000, feePaidSar: 400 };
  assert.deepEqual(withFeesVisibleTo(dto, true), dto);
  assert.deepEqual(withFeesVisibleTo(dto, false), { id: "c", feeTotalSar: null, feePaidSar: null });
  assert.equal(dto.feeTotalSar, 1000, "the input is not mutated");
});

test("S3: firmRoleMap — owned firms count as managing_partner", () => {
  const map = firmRoleMap(
    [{ firm_id: F1, role: "legal_secretary" }, { firm_id: null, role: "lawyer" }, { firm_id: F2, role: null }],
    [F2],
  );
  assert.equal(map.get(F1), "legal_secretary");
  assert.equal(map.get(F2), "managing_partner");
  assert.equal(map.size, 2);
});
