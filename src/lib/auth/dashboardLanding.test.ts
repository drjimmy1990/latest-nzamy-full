/**
 * D-33 (owner package 25-Nov): /dashboard had no page, so every link and
 * notification pointing at it was a 404 for a signed-in user. The page now
 * redirects to the account's own home; the decision is this module.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/dashboardLanding.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dashboardLandingFor } from "./dashboardLanding.ts";
import { dashboardPathFor } from "./userTypes.ts";

const done = { onboardingCompleted: true, phone: "0500000000", isActiveFirmMember: false };

test("a finished account lands on its own type's dashboard", () => {
  for (const t of ["individual", "corporate", "lawyer", "firm", "government", "ngo", "provider", "admin"]) {
    assert.equal(dashboardLandingFor({ userType: t, ...done }), dashboardPathFor(t), t);
    assert.match(dashboardLandingFor({ userType: t, ...done }), /^\/dashboard\//, t);
  }
});

test("an active firm member who is a lawyer or an individual lands on /dashboard/firm; others keep theirs", () => {
  assert.equal(dashboardLandingFor({ userType: "lawyer", ...done, isActiveFirmMember: true }), "/dashboard/firm");
  assert.equal(dashboardLandingFor({ userType: "individual", ...done, isActiveFirmMember: true }), "/dashboard/firm");
  assert.equal(dashboardLandingFor({ userType: "corporate", ...done, isActiveFirmMember: true }), dashboardPathFor("corporate"));
});

test("an unfinished account, or one with no profile row, goes to /onboarding", () => {
  assert.equal(dashboardLandingFor({ userType: null, onboardingCompleted: null, phone: null, isActiveFirmMember: false }), "/onboarding");
  assert.equal(dashboardLandingFor({ userType: "individual", onboardingCompleted: undefined, phone: "0500000000", isActiveFirmMember: false }), "/onboarding");
});

test("never /dashboard itself (no loop), never a path built from the type", () => {
  const out = dashboardLandingFor({ userType: "../../evil", ...done });
  assert.notEqual(out, "/dashboard");
  assert.doesNotMatch(out, /evil/);
});

test("the page redirects with the caller's own RLS reads, and is dynamic", () => {
  const page = readFileSync(new URL("../../app/dashboard/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /["']use client["']/);
  assert.match(page, /export const dynamic = "force-dynamic";/);
  assert.match(page, /import \{ createClient \} from "@\/lib\/supabase\/server";/);
  assert.doesNotMatch(page, /createServiceClient|service_role/);
  assert.match(page, /\.from\("profiles"\)\.select\("user_type, phone, onboarding_completed"\)\.eq\("id", user\.id\)/);
  assert.match(page, /\.from\("firm_members"\)\.select\("id"\)\.eq\("user_id", user\.id\)\.eq\("status", "active"\)/);
  assert.match(page, /redirect\(\s*dashboardLandingFor\(/);
});
