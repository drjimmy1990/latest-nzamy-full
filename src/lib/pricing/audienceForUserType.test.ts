import assert from "node:assert/strict";
import test from "node:test";
import { USER_TYPE_TO_AUDIENCE, audienceForUserType, audienceTabsView } from "./audienceForUserType.ts";

const MAPPED = [
  ["lawyer", "lawyers"],
  ["firm", "firms"],
  ["individual", "individuals"],
  ["corporate", "companies"],
  ["micro", "micro"],
  ["government", "government"],
  ["ngo", "ngo"],
  ["provider", "providers"],
] as const;

test("every account type but admin has its own pricing tab", () => {
  for (const [userType, audience] of MAPPED) {
    assert.equal(audienceForUserType(userType), audience, userType);
  }
  assert.equal(Object.keys(USER_TYPE_TO_AUDIENCE).length, MAPPED.length);
  assert.equal(audienceForUserType("admin"), null);
  assert.equal(audienceForUserType(null), null);
  assert.equal(audienceForUserType(undefined), null);
});

test("while the session resolves, no tab bar is shown — guest or member", () => {
  assert.deepEqual(audienceTabsView({ loading: true, isLoggedIn: false, userType: null }), { kind: "pending" });
  assert.deepEqual(audienceTabsView({ loading: true, isLoggedIn: true, userType: "lawyer" }), { kind: "pending" });
});

test("a guest sees every family", () => {
  assert.deepEqual(audienceTabsView({ loading: false, isLoggedIn: false, userType: null }), { kind: "all" });
});

test("a member is locked to their own family", () => {
  for (const [userType, audience] of MAPPED) {
    assert.deepEqual(
      audienceTabsView({ loading: false, isLoggedIn: true, userType }),
      { kind: "locked", audience },
      userType,
    );
  }
});

test("a signed-in type with no family (admin, or no profile yet) keeps the full bar", () => {
  assert.deepEqual(audienceTabsView({ loading: false, isLoggedIn: true, userType: "admin" }), { kind: "all" });
  assert.deepEqual(audienceTabsView({ loading: false, isLoggedIn: true, userType: null }), { kind: "all" });
});
