import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DB_USER_TYPES,
  PICKER_TO_DB,
  DASHBOARD_PATHS,
  FALLBACK_DASHBOARD_PATH,
  isDbUserType,
  toDbUserType,
  isAssignableUserType,
  dashboardPathFor,
} from "./userTypes.ts";

// ── The guard that this whole module exists for ──────────────────────────────

test("every value of PICKER_TO_DB is in DB_USER_TYPES", () => {
  // This is the test that matters most. Before this module, the onboarding
  // picker emitted "company", which the profiles.user_type CHECK constraint
  // does not allow — and nothing anywhere noticed. If someone adds a picker
  // option whose DB value is not in the constraint, this fails here instead
  // of failing as a 400 from PostgREST in front of a real user.
  for (const [pickerId, dbValue] of Object.entries(PICKER_TO_DB)) {
    assert.ok(
      DB_USER_TYPES.includes(dbValue),
      `picker id "${pickerId}" maps to "${dbValue}", which is not a DB user_type`,
    );
  }
});

// ── DB_USER_TYPES mirrors the CHECK constraint ───────────────────────────────

test("DB_USER_TYPES is exactly the CHECK-constraint list", () => {
  // supabase/migrations/20260603_phase1_001_profiles.sql:32-35
  // repeated in supabase/migrations/20260614_auto_create_role_profiles.sql:32-37
  assert.deepEqual(
    [...DB_USER_TYPES].sort(),
    [
      "admin",
      "corporate",
      "firm",
      "government",
      "individual",
      "lawyer",
      "micro",
      "ngo",
      "provider",
    ].sort(),
  );
  assert.equal(DB_USER_TYPES.length, 9);
});

test("isDbUserType accepts DB values and rejects everything else", () => {
  assert.equal(isDbUserType("corporate"), true);
  assert.equal(isDbUserType("admin"), true); // real DB value, just not assignable
  assert.equal(isDbUserType("company"), false); // picker id, not a DB value
  assert.equal(isDbUserType(""), false);
  assert.equal(isDbUserType("nonsense"), false);
});

// ── toDbUserType: picker id → DB value ───────────────────────────────────────

test('toDbUserType("company") === "corporate" — the live mismatch', () => {
  assert.equal(toDbUserType("company"), "corporate");
});

test("identity mappings still map", () => {
  assert.equal(toDbUserType("individual"), "individual");
  assert.equal(toDbUserType("micro"), "micro");
  assert.equal(toDbUserType("government"), "government");
  assert.equal(toDbUserType("ngo"), "ngo");
  assert.equal(toDbUserType("lawyer"), "lawyer");
  assert.equal(toDbUserType("firm"), "firm");
});

test("unknown returns null, never a default", () => {
  // A silent fallback to "individual" is exactly how the "company" mismatch
  // stayed invisible: the wrong value was quietly replaced with a plausible
  // one instead of failing where a human could see it.
  assert.equal(toDbUserType("nonsense"), null);
  assert.equal(toDbUserType(""), null);
});

test("toDbUserType is picker-ids-only: a DB value is not a picker id", () => {
  // Pinned deliberately. toDbUserType translates ONE direction. Do not feed it
  // a user_type already read from profiles — use isDbUserType for that.
  assert.equal(toDbUserType("corporate"), null);
  assert.equal(toDbUserType("provider"), null);
});

test("toDbUserType(\"admin\") === null — admin is not a picker id", () => {
  assert.equal(toDbUserType("admin"), null);
});

test("inherited Object properties are not picker ids", () => {
  // Guards against a plain-object lookup returning Object.prototype members.
  assert.equal(toDbUserType("constructor"), null);
  assert.equal(toDbUserType("toString"), null);
  assert.equal(toDbUserType("__proto__"), null);
});

test("PICKER_TO_DB keys are exactly the seven onboarding picker ids", () => {
  // Hand-mirrored from src/app/onboarding/page.tsx:40-46.
  assert.deepEqual(
    Object.keys(PICKER_TO_DB).sort(),
    ["company", "firm", "government", "individual", "lawyer", "micro", "ngo"].sort(),
  );
});

// ── isAssignableUserType ─────────────────────────────────────────────────────

test('isAssignableUserType("admin") === false', () => {
  // Pinned. The onboarding picker has no admin option, one of the 16 live
  // accounts IS the admin, and an admin who completed the wizard would write
  // whatever the picker offered over their own user_type — a self-downgrade
  // with no way back except a manual DB edit.
  assert.equal(isAssignableUserType("admin"), false);
});

test('isAssignableUserType("lawyer") === true', () => {
  assert.equal(isAssignableUserType("lawyer"), true);
});

test("every DB type except admin is assignable", () => {
  for (const t of DB_USER_TYPES) {
    assert.equal(isAssignableUserType(t), t !== "admin", `isAssignableUserType("${t}")`);
  }
});

test("unknown values are not assignable", () => {
  assert.equal(isAssignableUserType("company"), false); // picker id, not a DB value
  assert.equal(isAssignableUserType("nonsense"), false);
  assert.equal(isAssignableUserType(""), false);
});

test("admin is not reachable through the picker either", () => {
  // A separate invariant from isAssignableUserType: even if the guard were
  // removed, no picker id may translate to admin.
  assert.ok(!Object.values(PICKER_TO_DB).includes("admin"));
});

// ── dashboardPathFor ─────────────────────────────────────────────────────────

test("the two types whose dashboard directory does not match 1:1", () => {
  assert.equal(dashboardPathFor("corporate"), "/dashboard/business");
  assert.equal(dashboardPathFor("individual"), "/dashboard/client");
});

test("every DB type has a real dashboard path", () => {
  for (const t of DB_USER_TYPES) {
    const path = DASHBOARD_PATHS[t];
    assert.ok(path, `no dashboard path for "${t}"`);
    assert.ok(path.startsWith("/dashboard/"), `"${t}" → "${path}" is not under /dashboard/`);
    assert.equal(dashboardPathFor(t), path);
  }
});

test("the dashboard map agrees with the two maps it replaces", () => {
  // src/app/auth/callback/route.ts:47-57 (dashboardMap) and the dashDir at
  // src/proxy.ts:153-156. Both are deleted by Tasks 3 and 6; this pins the
  // union of what they said so the replacement cannot quietly differ.
  assert.deepEqual({ ...DASHBOARD_PATHS }, {
    individual: "/dashboard/client",
    lawyer: "/dashboard/lawyer",
    firm: "/dashboard/firm",
    corporate: "/dashboard/business",
    micro: "/dashboard/micro",
    provider: "/dashboard/provider",
    government: "/dashboard/government",
    ngo: "/dashboard/ngo",
    admin: "/dashboard/admin",
  });
});

test("an unrecognised type gets a path that cannot redirect-loop", () => {
  // Not a /dashboard/* path: every /dashboard/* prefix in ROUTE_ACCESS
  // (src/proxy.ts:5-14) is restricted to one user_type, so bouncing an
  // unknown-typed user to any of them would bounce them again forever.
  assert.equal(dashboardPathFor("nonsense"), FALLBACK_DASHBOARD_PATH);
  assert.equal(dashboardPathFor(""), FALLBACK_DASHBOARD_PATH);
  assert.ok(!FALLBACK_DASHBOARD_PATH.startsWith("/dashboard"));
});

test("dashboardPathFor never interpolates its argument into the path", () => {
  // The old proxy line built `/dashboard/${userType}`. Nothing user-controlled
  // may reach a redirect path.
  assert.equal(dashboardPathFor("../../etc"), FALLBACK_DASHBOARD_PATH);
  assert.equal(dashboardPathFor("//evil.example"), FALLBACK_DASHBOARD_PATH);
});

// ── The gap Task 5 has to decide about ───────────────────────────────────────

test("the DB types with no picker option are exactly provider and admin", () => {
  // Pinned so that adding a picker option breaks this test and forces the
  // note below to be updated instead of going stale.
  //   admin    — deliberately absent; it must never be self-assignable.
  //   provider — absent by omission. A service provider signing in with
  //              Google currently has no way to say what they are.
  //              Task 5 decides this; do not "fix" both together.
  const mapped = new Set(Object.values(PICKER_TO_DB));
  const unreachable = DB_USER_TYPES.filter((t) => !mapped.has(t)).sort();
  assert.deepEqual(unreachable, ["admin", "provider"]);
});
