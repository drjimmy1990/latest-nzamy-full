import assert from "node:assert/strict";
import test from "node:test";
import { USER_TYPE_TO_AUDIENCE, audienceForUserType, audienceTabsView, extraPlanIdsFor, withExtraPlans } from "./audienceForUserType.ts";

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

test("an independent consultant also sees the consultant card; an advocate the lawyers family only", () => {
  assert.deepEqual(extraPlanIdsFor("lawyer", "consultant", false), ["consultant-independent"]);
  assert.deepEqual(extraPlanIdsFor("lawyer", "advocate", false), []);
  // Library mode lists the library plans only.
  assert.deepEqual(extraPlanIdsFor("lawyer", "consultant", true), []);
  // A provider already has the card in its own family; other types never get it.
  for (const userType of ["provider", "firm", "individual", "corporate", "admin", null, undefined] as const) {
    assert.deepEqual(extraPlanIdsFor(userType, "consultant", false), [], String(userType));
  }
});

test("withExtraPlans appends the extra plans once, in source order, keeping the family's own", () => {
  const family = [{ id: "lawyer-pro" }, { id: "topup-100" }];
  const source = [{ id: "provider-free" }, { id: "consultant-independent" }];
  assert.deepEqual(
    withExtraPlans(family, ["consultant-independent"], source).map((p) => p.id),
    ["lawyer-pro", "topup-100", "consultant-independent"],
  );
  assert.equal(withExtraPlans(family, [], source), family, "no extras: the same list");
  // Already in the list, or missing from the source: nothing added.
  assert.deepEqual(
    withExtraPlans([...family, { id: "consultant-independent" }], ["consultant-independent"], source).map((p) => p.id),
    ["lawyer-pro", "topup-100", "consultant-independent"],
  );
  assert.deepEqual(withExtraPlans(family, ["nope"], source).map((p) => p.id), ["lawyer-pro", "topup-100"]);
});
