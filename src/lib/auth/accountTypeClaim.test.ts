import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAIMABLE_DB_USER_TYPES,
  SECTOR_ROW_BY_USER_TYPE,
  canClaimAccountType,
  isClaimableDbUserType,
  sectorRowSpecFor,
  sectorRowValuesFor,
  type AccountTypeClaimRefusal,
  type ClaimableDbUserType,
} from "./accountTypeClaim.ts";
import {
  DB_USER_TYPES,
  PICKER_TO_DB,
  isAssignableUserType,
  toProviderSubRole,
} from "./userTypes.ts";

/**
 * Small reader so a refusal assertion reads as one line and still fails with
 * the reason it actually got, instead of "expected false to equal true".
 */
function refusal(decision: ReturnType<typeof canClaimAccountType>): AccountTypeClaimRefusal | "PERMITTED" {
  return decision.ok ? "PERMITTED" : decision.reason;
}

/** A caller in the state a fresh Google signup leaves behind. */
const FRESH = { currentType: "individual", onboardingCompleted: false } as const;

/**
 * The `subRole` a well-behaved client sends for a given picker id: the one the
 * option means, or none at all. Used so the success tests below exercise the
 * real request shape rather than a hand-written table that could drift.
 */
function bodyFor(pickerId: string) {
  const subRole = toProviderSubRole(pickerId);
  return subRole === null ? { requestedPickerId: pickerId } : { requestedPickerId: pickerId, requestedSubRole: subRole };
}

// ── admin, pinned twice ──────────────────────────────────────────────────────

test("SECURITY: admin is refused as an explicit case", () => {
  // The first of the two pins the plan asks for. `admin` is a real value of
  // the profiles.user_type CHECK constraint
  // (supabase/migrations/20260603_phase1_001_profiles.sql:32-35) and one of
  // the live accounts holds it, so a claim that granted it would be a
  // straight privilege escalation with no admin action anywhere in the loop.
  //
  // This asserts the EXPLICIT branch — canClaimAccountType's first statement,
  // `if (input.requestedPickerId === "admin")`. Deleting that line makes this
  // test fail on the reason (it would fall through to "invalid_picker_id"),
  // which is the point: the guard has to be visible in the code path, not an
  // accident of "admin" happening to be missing from a map.
  assert.equal(refusal(canClaimAccountType({ requestedPickerId: "admin", ...FRESH })), "not_assignable");
});

test("SECURITY: admin is refused a second time, through isAssignableUserType", () => {
  // The second pin. If somebody ever adds an `admin` entry to PICKER_TO_DB,
  // the explicit branch above is no longer the only thing standing in the
  // way — canClaimAccountType also runs isAssignableUserType on the resolved
  // DB value, and that returns false for admin.
  assert.equal(isAssignableUserType("admin"), false);

  // And the invariant that keeps the explicit branch sufficient today: no
  // picker id resolves to admin, and every one that resolves at all resolves
  // to something assignable.
  for (const [pickerId, dbValue] of Object.entries(PICKER_TO_DB)) {
    assert.notEqual(dbValue, "admin", `picker id "${pickerId}" maps to admin`);
    assert.equal(isAssignableUserType(dbValue), true, `picker id "${pickerId}" maps to a non-assignable type`);
  }
});

// ── Every refusal, pinned ────────────────────────────────────────────────────

test("an unknown picker id is refused, never defaulted to individual", () => {
  assert.equal(refusal(canClaimAccountType({ requestedPickerId: "nonsense", ...FRESH })), "invalid_picker_id");
  assert.equal(refusal(canClaimAccountType({ requestedPickerId: "", ...FRESH })), "invalid_picker_id");
});

test("a DB user_type is not a picker id, so it is refused", () => {
  // "corporate" is the DB value; "company" is the picker id that produces it.
  // Sending the DB value back in must not work — toDbUserType translates one
  // direction only, and a caller who has confused the two is refused rather
  // than silently getting something.
  assert.equal(refusal(canClaimAccountType({ requestedPickerId: "corporate", ...FRESH })), "invalid_picker_id");
});

test("the DB value 'provider' is still not a picker id — the three kinds are", () => {
  // `provider` is claimable now, but only through one of the three ids that
  // MEAN a specialty. The bare DB value carries none, so sending it is still
  // an unknown picker id — the same one-direction rule that refuses
  // "corporate" above.
  assert.equal(refusal(canClaimAccountType({ requestedPickerId: "provider", ...FRESH })), "invalid_picker_id");
  assert.equal(isClaimableDbUserType("provider"), true);
});

// ── The sub-role, refused in every way it can be wrong ───────────────────────

test("SPECIALTY: a sub-role outside the CHECK list is refused, never clamped", () => {
  // supabase/migrations/20260603_phase1_001_profiles.sql:159-160 allows
  // exactly ('notary','arbitrator','bailiff'). "tracker" is the PICKER id for
  // معقّب, not a column value, and it is refused here on purpose: the two
  // vocabularies must not be interchangeable by accident.
  for (const bad of ["tracker", "provider", "", "NOTARY", "notary ", "nonsense"]) {
    assert.equal(
      refusal(canClaimAccountType({ requestedPickerId: "notary", requestedSubRole: bad, ...FRESH })),
      "invalid_sub_role",
      `sub-role ${JSON.stringify(bad)} must be refused, not clamped`,
    );
  }
});

test("SPECIALTY: a provider claim with no sub-role is refused, not defaulted to notary", () => {
  // The database trigger DOES fall back to 'notary' for the email route
  // (supabase/migrations/20260821_fix_provider_signup_sub_role.sql), because a
  // trigger can only read what signup metadata gives it. This module must not
  // imitate that: the person is on screen and was asked, so a missing answer
  // is a refusal rather than a guess that files them in the wrong queue.
  for (const pickerId of ["notary", "tracker", "arbitrator"]) {
    assert.equal(
      refusal(canClaimAccountType({ requestedPickerId: pickerId, ...FRESH })),
      "sub_role_missing",
      `picker id "${pickerId}" with no sub-role must be refused`,
    );
    assert.equal(
      refusal(canClaimAccountType({ requestedPickerId: pickerId, requestedSubRole: null, ...FRESH })),
      "sub_role_missing",
    );
  }
});

test("SPECIALTY: a valid sub-role that is not this option's is refused", () => {
  // A محكّم whose body said 'notary'. Both fields are well-formed and they
  // disagree; preferring either one silently would record the wrong specialty.
  assert.equal(
    refusal(canClaimAccountType({ requestedPickerId: "arbitrator", requestedSubRole: "notary", ...FRESH })),
    "sub_role_mismatch",
  );
  assert.equal(
    refusal(canClaimAccountType({ requestedPickerId: "notary", requestedSubRole: "bailiff", ...FRESH })),
    "sub_role_mismatch",
  );
  // معقّب is the case that catches a client which sent the picker id instead
  // of the column value — 'tracker' would be `invalid_sub_role`, 'notary' is
  // this: recognised, and wrong.
  assert.equal(
    refusal(canClaimAccountType({ requestedPickerId: "tracker", requestedSubRole: "notary", ...FRESH })),
    "sub_role_mismatch",
  );
});

test("SPECIALTY: a sub-role sent with an option that has none is refused, not ignored", () => {
  // The silent half of a two-field contract. Dropping the extra field would
  // mean a client could believe it had asked for something it did not get.
  for (const pickerId of ["individual", "lawyer", "firm", "company", "micro", "government", "ngo"]) {
    assert.equal(
      refusal(canClaimAccountType({ requestedPickerId: pickerId, requestedSubRole: "notary", ...FRESH })),
      "sub_role_mismatch",
      `picker id "${pickerId}" takes no sub-role and must refuse one`,
    );
  }
});

test("SPECIALTY: the sub-role is judged before the caller's state", () => {
  // Same ordering rule as the picker id: what was ASKED is judged before WHO
  // is asking, so the message a broken client gets names the thing it can fix.
  assert.equal(
    refusal(canClaimAccountType({ requestedPickerId: "notary", currentType: "lawyer", onboardingCompleted: true })),
    "sub_role_missing",
  );
  assert.equal(
    refusal(
      canClaimAccountType({
        requestedPickerId: "notary",
        requestedSubRole: "nonsense",
        currentType: "lawyer",
        onboardingCompleted: true,
      }),
    ),
    "invalid_sub_role",
  );
});

test("SPECIALTY: each provider kind is granted its own sub_role", () => {
  // The end-to-end shape of the fix, in one assertion: three options, three
  // grants, three different specialties — and the same user_type.
  const expected: Record<string, string> = { notary: "notary", tracker: "bailiff", arbitrator: "arbitrator" };
  for (const [pickerId, subRole] of Object.entries(expected)) {
    const decision = canClaimAccountType({ ...bodyFor(pickerId), ...FRESH });
    assert.equal(decision.ok, true, `picker id "${pickerId}" was refused: ${refusal(decision)}`);
    assert.equal(decision.ok && decision.userType, "provider");
    assert.equal(decision.ok && decision.subRole, subRole);
  }
});

test("SPECIALTY: every non-provider grant carries subRole null, never a string", () => {
  for (const [pickerId, dbValue] of Object.entries(PICKER_TO_DB)) {
    if (dbValue === "provider") continue;
    const decision = canClaimAccountType({ ...bodyFor(pickerId), ...FRESH });
    assert.equal(decision.ok && decision.subRole, null, `picker id "${pickerId}" must grant no sub-role`);
  }
});

test("a missing profiles row is refused, not assumed to be a fresh individual", () => {
  assert.equal(
    refusal(canClaimAccountType({ requestedPickerId: "lawyer", currentType: null, onboardingCompleted: false })),
    "profile_missing",
  );
  assert.equal(
    refusal(canClaimAccountType({ requestedPickerId: "lawyer", currentType: undefined, onboardingCompleted: false })),
    "profile_missing",
  );
  assert.equal(
    refusal(canClaimAccountType({ requestedPickerId: "lawyer", currentType: "", onboardingCompleted: false })),
    "profile_missing",
  );
});

test("NOT A ROLE-SWITCH API: a caller who already has a type is refused", () => {
  // This is the condition that separates a one-time onboarding claim from an
  // endpoint that lets anybody rewrite their own role whenever they like.
  // Only "individual" — the untouched signup default written by the COALESCE
  // at supabase/migrations/20260716_security_hardening.sql:24 — means "this
  // account has not chosen yet".
  for (const existing of ["lawyer", "firm", "corporate", "micro", "government", "ngo", "provider", "admin"]) {
    assert.equal(
      refusal(canClaimAccountType({ requestedPickerId: "lawyer", currentType: existing, onboardingCompleted: false })),
      "type_already_set",
      `a caller already typed "${existing}" must be refused`,
    );
  }
});

test("NOT A ROLE-SWITCH API: a caller who already onboarded is refused", () => {
  assert.equal(
    refusal(canClaimAccountType({ requestedPickerId: "lawyer", currentType: "individual", onboardingCompleted: true })),
    "onboarding_already_completed",
  );
});

test("only the boolean true counts as completed", () => {
  // Mirrors needsOnboarding's rule (src/lib/auth/onboardingGate.ts): an OAuth
  // user has no such key at all, and a truthy non-boolean must not lock them
  // out of the one claim they get.
  for (const notCompleted of [undefined, null, false, 0, "", "false", "true", 1]) {
    assert.equal(
      canClaimAccountType({ requestedPickerId: "lawyer", currentType: "individual", onboardingCompleted: notCompleted }).ok,
      true,
      `onboardingCompleted=${JSON.stringify(notCompleted)} must not count as completed`,
    );
  }
});

test("the refusal order is stable: the request is judged before the caller's state", () => {
  // A caller who is ineligible AND sent a bad picker id is told about the
  // picker id. Pinned so a reorder is a visible decision — the route maps
  // each reason to a different Arabic sentence, and swapping which one a
  // user sees is a copy change nobody would otherwise notice.
  assert.equal(
    refusal(canClaimAccountType({ requestedPickerId: "nonsense", currentType: "lawyer", onboardingCompleted: true })),
    "invalid_picker_id",
  );
  // …and among the caller's own state, a type already set is reported before
  // a completed onboarding.
  assert.equal(
    refusal(canClaimAccountType({ requestedPickerId: "lawyer", currentType: "lawyer", onboardingCompleted: true })),
    "type_already_set",
  );
});

// ── The success condition ────────────────────────────────────────────────────

test("every picker id is claimable by a fresh individual, and yields its DB value", () => {
  // The owner's requirement in one assertion: a Google user who is a client, a
  // lawyer, a firm, a company, a small business, a government body, an NGO, a
  // موثّق, a معقّب or a محكّم can say so and get the right DB value —
  // "company" included, which is the picker id the CHECK constraint does not
  // allow and which has to come out as "corporate".
  for (const [pickerId, expectedDbValue] of Object.entries(PICKER_TO_DB)) {
    const decision = canClaimAccountType({ ...bodyFor(pickerId), ...FRESH });
    assert.equal(decision.ok, true, `picker id "${pickerId}" was refused: ${refusal(decision)}`);
    assert.equal(decision.ok && decision.userType, expectedDbValue);
  }
});

test("company claims corporate, not company", () => {
  const decision = canClaimAccountType({ requestedPickerId: "company", ...FRESH });
  assert.equal(decision.ok && decision.userType, "corporate");
});

test("an individual may claim individual — it is a no-op, not a refusal", () => {
  // A client picking "فرد" must get a 200, otherwise the wizard shows them an
  // error for choosing the option that already describes them. The write is a
  // no-op on the column, which trg_lock_user_type ignores because it fires
  // only on OLD.user_type IS DISTINCT FROM NEW.user_type
  // (supabase/migrations/20260716_security_hardening.sql:137).
  const decision = canClaimAccountType({ requestedPickerId: "individual", ...FRESH });
  assert.equal(decision.ok, true);
  assert.equal(decision.ok && decision.userType, "individual");
});

// ── The claimable vocabulary tracks the picker ───────────────────────────────

test("CLAIMABLE_DB_USER_TYPES is exactly the set of PICKER_TO_DB values", () => {
  // If this fails, someone added or removed a picker option and
  // SECTOR_ROW_BY_USER_TYPE is no longer total over what a claim can produce.
  assert.deepEqual(
    [...CLAIMABLE_DB_USER_TYPES].sort(),
    [...new Set(Object.values(PICKER_TO_DB))].sort(),
  );
});

test("every claimable type is a real DB user_type", () => {
  for (const t of CLAIMABLE_DB_USER_TYPES) {
    assert.ok((DB_USER_TYPES as readonly string[]).includes(t), `"${t}" is not in the CHECK constraint`);
  }
});

test("SECURITY: admin is the only DB type that is not claimable", () => {
  assert.equal(isClaimableDbUserType("admin"), false);
  assert.equal(CLAIMABLE_DB_USER_TYPES.length, DB_USER_TYPES.length - 1);
  for (const t of DB_USER_TYPES) {
    assert.equal(isClaimableDbUserType(t), t !== "admin", `isClaimableDbUserType("${t}")`);
  }
});

// ── The sector row ───────────────────────────────────────────────────────────

test("every claimable type has an explicit provisioning decision", () => {
  // `null` is a decision (individual has no sector table). `undefined` is a
  // hole, and a hole would mean a user claiming that type gets a user_type
  // and no row for their dashboard to read.
  for (const t of CLAIMABLE_DB_USER_TYPES) {
    assert.ok(t in SECTOR_ROW_BY_USER_TYPE, `no provisioning decision for "${t}"`);
    assert.notEqual(SECTOR_ROW_BY_USER_TYPE[t], undefined);
  }
});

test("the sector table for each claimable type matches the signup trigger", () => {
  // Mirrored from public.handle_new_user
  // (supabase/migrations/20260716_security_hardening.sql:48-101). Note
  // corporate → business_profiles, NOT firm_profiles: an earlier version of
  // the trigger sent both there
  // (supabase/migrations/20260616_production_readiness_fixes.sql:144).
  assert.equal(sectorRowSpecFor("individual"), null);
  assert.equal(sectorRowSpecFor("lawyer")?.table, "lawyer_profiles");
  assert.equal(sectorRowSpecFor("firm")?.table, "firm_profiles");
  assert.equal(sectorRowSpecFor("corporate")?.table, "business_profiles");
  assert.equal(sectorRowSpecFor("micro")?.table, "micro_profiles");
  assert.equal(sectorRowSpecFor("government")?.table, "government_profiles");
  assert.equal(sectorRowSpecFor("ngo")?.table, "ngo_profiles");
  // The one spec that is deliberately NOT the trigger's: the trigger's
  // provider branch inserts only `user_id` (…20260716:53-56) and so raises
  // 23502 on the NOT NULL `sub_role`. The table is right; the columns are not,
  // and `sectorRowValuesFor` supplies the missing one from the grant.
  assert.equal(sectorRowSpecFor("provider")?.table, "provider_profiles");
});

test("the NOT NULL columns without defaults are all filled", () => {
  // Each of these is NOT NULL with no default in
  // supabase/migrations/20260603_phase1_002_entities.sql (firm :38,
  // business :221, government :400 and :402, ngo :570 and :572). Omitting one
  // fails the claim at its very last step, after user_type has been written.
  assert.deepEqual(sectorRowSpecFor("firm")?.columns, { name_ar: "جهة جديدة", name_en: "New Entity" });
  assert.deepEqual(sectorRowSpecFor("corporate")?.columns, {
    company_name_ar: "شركة جديدة",
    company_name_en: "New Company",
  });
  assert.deepEqual(sectorRowSpecFor("government")?.columns, {
    entity_name_ar: "جهة حكومية جديدة",
    entity_type: "other",
  });
  assert.deepEqual(sectorRowSpecFor("ngo")?.columns, { org_name_ar: "منظمة جديدة", org_type: "other" });
  assert.deepEqual(sectorRowSpecFor("micro")?.columns, { business_name: "نشاط تجاري جديد" });
  assert.deepEqual(sectorRowSpecFor("lawyer")?.columns, { is_accepting_clients: true });
  // `provider` is empty here ON PURPOSE and it is not a hole. Its one NOT NULL
  // column without a default is `sub_role`
  // (…20260603_phase1_001_profiles.sql:157-173, checked column by column), and
  // a fixed value for it in this record is exactly the bug that would file all
  // three kinds as one specialty. It arrives from the grant instead — see the
  // sectorRowValuesFor tests below.
  assert.deepEqual(sectorRowSpecFor("provider")?.columns, {});
});

test("SECURITY: no sector spec sets a verification or visibility column", () => {
  // The claim gives a Google user the same starting point an email user gets
  // at signup — and nothing more. verification_status defaults to 'pending'
  // and marketplace_visible to false in every one of these tables; if a spec
  // ever set either, a self-service claim would hand out a verified badge and
  // marketplace access with no admin in the loop.
  const forbidden = ["verification_status", "marketplace_visible", "compliance_status", "credit_balance"];
  for (const t of CLAIMABLE_DB_USER_TYPES) {
    const spec = SECTOR_ROW_BY_USER_TYPE[t];
    if (!spec) continue;
    for (const column of forbidden) {
      assert.equal(column in spec.columns, false, `${t} provisioning must not set ${column}`);
    }
  }
});

test("the owner column is the only place the user id goes", () => {
  const lawyer = sectorRowValuesFor({ userType: "lawyer", subRole: null }, "11111111-1111-1111-1111-111111111111");
  assert.deepEqual(lawyer, {
    table: "lawyer_profiles",
    ownerColumn: "user_id",
    ownerColumnIsUnique: true,
    row: { is_accepting_clients: true, user_id: "11111111-1111-1111-1111-111111111111" },
  });

  const firm = sectorRowValuesFor({ userType: "firm", subRole: null }, "22222222-2222-2222-2222-222222222222");
  assert.deepEqual(firm, {
    table: "firm_profiles",
    ownerColumn: "owner_user_id",
    ownerColumnIsUnique: false,
    row: {
      name_ar: "جهة جديدة",
      name_en: "New Entity",
      owner_user_id: "22222222-2222-2222-2222-222222222222",
    },
  });

  assert.equal(
    sectorRowValuesFor({ userType: "individual", subRole: null }, "33333333-3333-3333-3333-333333333333"),
    null,
  );
});

test("SPECIALTY: the provider row carries the grant's sub_role and nothing else", () => {
  // The last link in the chain. Three grants, three rows, three different
  // `sub_role` values in the same table — and the user id only ever in
  // `user_id`, which is the PRIMARY KEY
  // (supabase/migrations/20260603_phase1_001_profiles.sql:158).
  assert.deepEqual(
    sectorRowValuesFor({ userType: "provider", subRole: "bailiff" }, "44444444-4444-4444-4444-444444444444"),
    {
      table: "provider_profiles",
      ownerColumn: "user_id",
      ownerColumnIsUnique: true,
      row: { sub_role: "bailiff", user_id: "44444444-4444-4444-4444-444444444444" },
    },
  );
  assert.equal(
    sectorRowValuesFor({ userType: "provider", subRole: "notary" }, "55555555-5555-5555-5555-555555555555")?.row
      .sub_role,
    "notary",
  );
  assert.equal(
    sectorRowValuesFor({ userType: "provider", subRole: "arbitrator" }, "66666666-6666-6666-6666-666666666666")?.row
      .sub_role,
    "arbitrator",
  );
});

test("SPECIALTY: no non-provider row ever gets a sub_role column", () => {
  const nonProvider = CLAIMABLE_DB_USER_TYPES.filter(
    (t): t is Exclude<ClaimableDbUserType, "provider"> => t !== "provider",
  );
  for (const t of nonProvider) {
    const values = sectorRowValuesFor({ userType: t, subRole: null }, "77777777-7777-7777-7777-777777777777");
    if (values === null) continue;
    assert.equal("sub_role" in values.row, false, `${t} must not write sub_role`);
  }
});

test("lawyer, micro and provider are the rows a constraint can deduplicate", () => {
  // firm/business/government/ngo have `id uuid primary key default
  // gen_random_uuid()` and no unique index on owner_user_id
  // (supabase/migrations/20260603_phase1_002_entities.sql:36-37, 219-220,
  // 398-399, 568-569), so the trigger's bare ON CONFLICT DO NOTHING there can
  // never fire and the route has to check for an existing row itself. If a
  // migration ever adds those unique indexes, flip the flag here and the
  // route's upsert path covers them race-free.
  //
  // lawyer_profiles, provider_profiles and micro_profiles instead key on
  // `user_id` as their PRIMARY KEY
  // (supabase/migrations/20260603_phase1_001_profiles.sql:93, :158 and :216
  // respectively), so the upsert path is race-free for all three.
  const uniqueOwners = CLAIMABLE_DB_USER_TYPES.filter((t) => SECTOR_ROW_BY_USER_TYPE[t]?.ownerColumnIsUnique === true);
  assert.deepEqual([...uniqueOwners].sort(), ["lawyer", "micro", "provider"]);
});
