import assert from "node:assert/strict";
import test from "node:test";
import {
  entityMembershipKindForPath,
  isAllowedByTypeOrMembership,
  type ActiveEntityMemberships,
} from "./entityMembership.ts";

const memberships: ActiveEntityMemberships = {
  firm: { entityId: "firm-1", entityName: "مكتب الاختبار", role: "lawyer" },
  business: { entityId: "business-1", entityName: "شركة الاختبار", role: "legal_staff" },
};

test("only the matching entity dashboard has a membership requirement", () => {
  assert.equal(entityMembershipKindForPath("/dashboard/firm/cases"), "firm");
  assert.equal(entityMembershipKindForPath("/dashboard/business/team"), "business");
  assert.equal(entityMembershipKindForPath("/dashboard/client/services"), "business");
  assert.equal(entityMembershipKindForPath("/dashboard/client/requests/new"), "business");
  assert.equal(entityMembershipKindForPath("/dashboard/client/consultation/new"), "business");
  assert.equal(entityMembershipKindForPath("/dashboard/client/cases"), null);
  assert.equal(entityMembershipKindForPath("/dashboard/lawyer"), null);
  assert.equal(entityMembershipKindForPath("/settings"), null);
});

test("an active firm membership opens only the firm dashboard", () => {
  assert.equal(isAllowedByTypeOrMembership("lawyer", ["firm"], { firm: memberships.firm }), true);
  assert.equal(isAllowedByTypeOrMembership("lawyer", ["corporate"], { firm: memberships.firm }), false);
  assert.equal(isAllowedByTypeOrMembership("lawyer", ["admin"], { firm: memberships.firm }), false);
});

test("an active business membership opens only the business dashboard", () => {
  assert.equal(isAllowedByTypeOrMembership("individual", ["corporate"], { business: memberships.business }), true);
  assert.equal(isAllowedByTypeOrMembership("individual", ["firm"], { business: memberships.business }), false);
});

test("ordinary type access and the admin bypass are unchanged", () => {
  assert.equal(isAllowedByTypeOrMembership("firm", ["firm"], {}), true);
  assert.equal(isAllowedByTypeOrMembership("corporate", ["corporate"], {}), true);
  assert.equal(isAllowedByTypeOrMembership("admin", ["firm"], {}), true);
  assert.equal(isAllowedByTypeOrMembership(null, ["firm"], memberships), true);
  assert.equal(isAllowedByTypeOrMembership(null, ["lawyer"], memberships), false);
});
