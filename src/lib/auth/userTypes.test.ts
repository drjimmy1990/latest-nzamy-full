import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DB_USER_TYPES,
  PICKER_TO_DB,
  PICKER_TO_SUB_ROLE,
  PROVIDER_SUB_ROLES,
  DASHBOARD_PATHS,
  FALLBACK_DASHBOARD_PATH,
  isDbUserType,
  isProviderSubRole,
  toDbUserType,
  toProviderSubRole,
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

test("the three service-provider ids all map to the one user_type provider", () => {
  // موثّق, معقّب and محكّم are not three user types. They are three values of
  // provider_profiles.sub_role sharing the single profiles.user_type
  // 'provider' — which is why PICKER_TO_SUB_ROLE has to exist beside this map
  // rather than this map being asked to carry both facts.
  assert.equal(toDbUserType("notary"), "provider");
  assert.equal(toDbUserType("tracker"), "provider");
  assert.equal(toDbUserType("arbitrator"), "provider");
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

test("PICKER_TO_DB keys are exactly the ten onboarding picker ids", () => {
  // Hand-mirrored from the option lists in src/app/onboarding/page.tsx. The
  // last three are the service-provider kinds and share one user_type; they
  // are spelled the same way /register/provider spells them
  // (src/app/register/provider/types.ts:1).
  assert.deepEqual(
    Object.keys(PICKER_TO_DB).sort(),
    [
      "company",
      "firm",
      "government",
      "individual",
      "lawyer",
      "micro",
      "ngo",
      "notary",
      "tracker",
      "arbitrator",
    ].sort(),
  );
});

// ── The sub-role vocabulary ──────────────────────────────────────────────────

test("PROVIDER_SUB_ROLES is exactly the provider_profiles.sub_role CHECK list", () => {
  // supabase/migrations/20260603_phase1_001_profiles.sql:159-160
  assert.deepEqual([...PROVIDER_SUB_ROLES].sort(), ["arbitrator", "bailiff", "notary"].sort());
  assert.equal(PROVIDER_SUB_ROLES.length, 3);
});

test("isProviderSubRole accepts the three CHECK values and nothing else", () => {
  assert.equal(isProviderSubRole("notary"), true);
  assert.equal(isProviderSubRole("arbitrator"), true);
  assert.equal(isProviderSubRole("bailiff"), true);
  // "tracker" is the PICKER id for معقّب; "bailiff" is what the column holds.
  // Sending the picker id as a sub-role must not be accepted.
  assert.equal(isProviderSubRole("tracker"), false);
  assert.equal(isProviderSubRole("provider"), false);
  assert.equal(isProviderSubRole(""), false);
  assert.equal(isProviderSubRole("nonsense"), false);
});

test("tracker maps to bailiff — the one sub-role that is not its own name", () => {
  // The single most breakable line in this module. The interface calls the
  // role معقّب / "Gov. Agent"; the database column calls it `bailiff`.
  // /register/provider makes the same translation for its email signup at
  // src/app/register/provider/page.tsx:375, and the two must agree because
  // both routes write the same column.
  assert.equal(toProviderSubRole("tracker"), "bailiff");
  assert.equal(toProviderSubRole("notary"), "notary");
  assert.equal(toProviderSubRole("arbitrator"), "arbitrator");
});

test("the three provider ids have three DISTINCT sub_roles", () => {
  // The failure this whole map exists to prevent: three options that all
  // resolve to one specialty would file a محكّم in the موثّق queue, and
  // nothing on screen would say so. Absent is visible; wrong is not.
  const subRoles = ["notary", "tracker", "arbitrator"].map((id) => toProviderSubRole(id));
  assert.deepEqual([...new Set(subRoles)].length, 3);
  for (const s of subRoles) {
    assert.ok(s !== null && isProviderSubRole(s), `"${s}" is not a CHECK-constraint value`);
  }
});

test("PICKER_TO_SUB_ROLE and PICKER_TO_DB agree about who has a sub-role", () => {
  // Exactly the picker ids whose user_type is `provider` carry a sub-role, and
  // no others. Two hand-maintained maps, so the correspondence is pinned here
  // rather than assumed; `canClaimAccountType` re-checks it at runtime and
  // refuses the claim if they ever disagree.
  assert.deepEqual(Object.keys(PICKER_TO_SUB_ROLE).sort(), Object.keys(PICKER_TO_DB).sort());
  for (const [pickerId, dbValue] of Object.entries(PICKER_TO_DB)) {
    const subRole = toProviderSubRole(pickerId);
    assert.equal(
      subRole !== null,
      dbValue === "provider",
      `picker id "${pickerId}" maps to "${dbValue}" but its sub_role is ${JSON.stringify(subRole)}`,
    );
  }
});

test("toProviderSubRole returns null for a non-picker-id, never a default", () => {
  // 'notary' is the value the DATABASE trigger clamps to for the email route
  // (supabase/migrations/20260821_fix_provider_signup_sub_role.sql). Nothing
  // in this module may imitate that: a trigger has only metadata to read,
  // whereas a picker id either means a specialty or does not.
  assert.equal(toProviderSubRole("nonsense"), null);
  assert.equal(toProviderSubRole(""), null);
  assert.equal(toProviderSubRole("bailiff"), null); // a sub_role is not a picker id
  assert.equal(toProviderSubRole("constructor"), null);
  assert.equal(toProviderSubRole("__proto__"), null);
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
  // The OAuth callback's `dashboardMap` and the proxy's local `dashDir`. Both
  // have since been deleted — those two files call `dashboardPathFor` now — so
  // no line number is given for either; this pins the union of what they said
  // so the replacement cannot quietly differ.
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
  // (src/lib/auth/routeAccess.ts)
  // (src/proxy.ts:13-37) is restricted to one user_type, so bouncing an
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

// ── The one DB type no picker can reach ──────────────────────────────────────

test("SECURITY: the only DB type with no picker option is admin", () => {
  // Pinned so that adding a picker option breaks this test and forces the note
  // below to be updated instead of going stale.
  //
  //   admin — deliberately absent, permanently, and the only one left. It must
  //           never be reachable from any control: one of the live accounts IS
  //           the admin, the onboarding wizard writes whatever the picker
  //           offers, and only a manual database edit could undo a
  //           self-downgrade. `isAssignableUserType` guards it a second time
  //           in code, and `canClaimAccountType` a third time as an explicit
  //           branch, so this list being right is not the only thing standing
  //           in the way — but it is the first thing.
  //
  // `provider` used to be the second entry here, and this comment used to
  // argue at length that a picker option for it could only be wrong. That
  // argument was sound for the code as it then stood and is now spent: the
  // discriminant it said could not survive the trip does survive it.
  // `PICKER_TO_SUB_ROLE` above carries a distinct `sub_role` per provider
  // picker id, the claim route's contract validates one against the CHECK list
  // and against the chosen option, `AccountTypeGrant` makes a provider grant
  // without a sub-role unrepresentable, and `sectorRowValuesFor` writes it
  // into `provider_profiles`. The three tests above this one pin that chain.
  //
  // Note what closing it did NOT depend on:
  // supabase/migrations/20260821_fix_provider_signup_sub_role.sql, which is
  // written and unapplied. That migration repairs the signup TRIGGER, which is
  // what the /register/provider EMAIL route goes through; the claim route
  // provisions the row itself in application code. The two routes reach
  // `provider` by different mechanisms and are still in different states — do
  // not read this test as evidence that the email route works.
  const mapped = new Set(Object.values(PICKER_TO_DB));
  const unreachable = DB_USER_TYPES.filter((t) => !mapped.has(t)).sort();
  assert.deepEqual(unreachable, ["admin"]);
});
