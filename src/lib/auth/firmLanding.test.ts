/**
 * firmLanding.test.ts — N01-25/26/27 (owner package 13-Nov).
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/firmLanding.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  firmLandingFor,
  defaultDashboardPathFor,
  isFirmLandingCheckPath,
  FIRM_DASHBOARD_PATH,
} from "./firmLanding.ts";
import { routeAccessRuleFor } from "./routeAccess.ts";
import { entityMembershipKindForPath } from "./entityMembership.ts";

test("an active firm member who is a lawyer or an individual lands on the firm dashboard", () => {
  assert.equal(firmLandingFor("lawyer", true), FIRM_DASHBOARD_PATH);
  assert.equal(firmLandingFor("individual", true), FIRM_DASHBOARD_PATH);
  assert.equal(defaultDashboardPathFor("lawyer", true), "/dashboard/firm");
});

test("a solo lawyer keeps landing on /dashboard/lawyer", () => {
  assert.equal(firmLandingFor("lawyer", false), null);
  assert.equal(defaultDashboardPathFor("lawyer", false), "/dashboard/lawyer");
  assert.equal(defaultDashboardPathFor("individual", false), "/dashboard/client");
});

test("no other type is moved, membership or not", () => {
  for (const t of ["admin", "firm", "corporate", "micro", "provider", "government", "ngo", "", "nonsense"]) {
    assert.equal(firmLandingFor(t, true), null, t);
  }
  assert.equal(firmLandingFor(null, true), null);
  assert.equal(firmLandingFor(undefined, true), null);
  assert.equal(defaultDashboardPathFor("admin", true), "/dashboard/admin");
  assert.equal(defaultDashboardPathFor("firm", true), "/dashboard/firm");
});

test("the edge asks only for a lawyer on the exact /dashboard/lawyer root", () => {
  assert.equal(isFirmLandingCheckPath("/dashboard/lawyer", "lawyer"), true);
  assert.equal(isFirmLandingCheckPath("/dashboard/lawyer/", "lawyer"), true);
  for (const p of [
    "/dashboard/lawyer/cases",
    "/dashboard/lawyer/cases/abc",
    "/dashboard/lawyer/clients",
    "/dashboard/lawyerx",
    "/dashboard/firm",
    "/dashboard",
    "/dashboard/client",
  ]) {
    assert.equal(isFirmLandingCheckPath(p, "lawyer"), false, p);
  }
  for (const t of ["admin", "firm", "individual", "corporate", null]) {
    assert.equal(isFirmLandingCheckPath("/dashboard/lawyer", t), false, String(t));
  }
});

test("the redirect target cannot loop: a lawyer is refused there by type and admitted by membership", () => {
  // /dashboard/firm is not a landing-check path, its rule does not admit
  // `lawyer`, and it is a firm-membership path — so the redirected request
  // takes the existing type-refused → membership branch and passes.
  assert.equal(isFirmLandingCheckPath(FIRM_DASHBOARD_PATH, "lawyer"), false);
  const rule = routeAccessRuleFor(FIRM_DASHBOARD_PATH);
  assert.ok(rule);
  assert.equal((rule.allowedTypes as readonly string[]).includes("lawyer"), false);
  assert.equal(entityMembershipKindForPath(FIRM_DASHBOARD_PATH), "firm");
});
