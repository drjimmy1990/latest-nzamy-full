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
} from "./accountTypeClaim.ts";
import { DB_USER_TYPES, PICKER_TO_DB, isAssignableUserType } from "./userTypes.ts";

/**
 * Small reader so a refusal assertion reads as one line and still fails with
 * the reason it actually got, instead of "expected false to equal true".
 */
function refusal(decision: ReturnType<typeof canClaimAccountType>): AccountTypeClaimRefusal | "PERMITTED" {
  return decision.ok ? "PERMITTED" : decision.reason;
}

/** A caller in the state a fresh Google signup leaves behind. */
const FRESH = { currentType: "individual", onboardingCompleted: false } as const;

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

test("provider is refused: it has no picker option and no provisionable sector row", () => {
  // provider_profiles.sub_role is NOT NULL with a CHECK and no default
  // (supabase/migrations/20260603_phase1_001_profiles.sql:159-160), and a
  // claim has no way to know whether the caller is a notary, an arbitrator or
  // a bailiff. Service providers keep registering through /register/provider.
  assert.equal(refusal(canClaimAccountType({ requestedPickerId: "provider", ...FRESH })), "invalid_picker_id");
  assert.equal(isClaimableDbUserType("provider"), false);
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
  // The owner's requirement in one assertion: a Google user who is a client,
  // a lawyer, a firm, a company, a small business, a government body or an
  // NGO can say so and get the right DB value — "company" included, which is
  // the picker id the CHECK constraint does not allow and which has to come
  // out as "corporate".
  for (const [pickerId, expectedDbValue] of Object.entries(PICKER_TO_DB)) {
    const decision = canClaimAccountType({ requestedPickerId: pickerId, ...FRESH });
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

test("admin and provider are DB types that are deliberately not claimable", () => {
  assert.equal(isClaimableDbUserType("admin"), false);
  assert.equal(isClaimableDbUserType("provider"), false);
  assert.equal(CLAIMABLE_DB_USER_TYPES.length, DB_USER_TYPES.length - 2);
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
  const lawyer = sectorRowValuesFor("lawyer", "11111111-1111-1111-1111-111111111111");
  assert.deepEqual(lawyer, {
    table: "lawyer_profiles",
    ownerColumn: "user_id",
    ownerColumnIsUnique: true,
    row: { is_accepting_clients: true, user_id: "11111111-1111-1111-1111-111111111111" },
  });

  const firm = sectorRowValuesFor("firm", "22222222-2222-2222-2222-222222222222");
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

  assert.equal(sectorRowValuesFor("individual", "33333333-3333-3333-3333-333333333333"), null);
});

test("only lawyer_profiles and micro_profiles can be deduplicated by a constraint", () => {
  // firm/business/government/ngo have `id uuid primary key default
  // gen_random_uuid()` and no unique index on owner_user_id
  // (supabase/migrations/20260603_phase1_002_entities.sql:36-37, 219-220,
  // 398-399, 568-569), so the trigger's bare ON CONFLICT DO NOTHING there can
  // never fire and the route has to check for an existing row itself. If a
  // migration ever adds those unique indexes, flip the flag here and the
  // route's upsert path covers them race-free.
  const uniqueOwners = CLAIMABLE_DB_USER_TYPES.filter((t) => SECTOR_ROW_BY_USER_TYPE[t]?.ownerColumnIsUnique === true);
  assert.deepEqual([...uniqueOwners].sort(), ["lawyer", "micro"]);
});
