import { test } from "node:test";
import assert from "node:assert/strict";
import { needsOnboarding } from "./onboardingGate.ts";
import { hasValidSaudiMobile } from "../services/saudiMobile.ts";

test("a fresh Google user needs onboarding", () => {
  assert.equal(
    needsOnboarding({ userType: "individual", onboardingCompleted: false, hasPhone: false }),
    true,
  );
});

test("REGRESSION G1: lawyers and firms are SKIPPED, not forced", () => {
  // src/proxy.ts:135 names the variable `skipOnboarding` but assigns
  // `!['lawyer','firm'].includes(userType)` — true for everyone EXCEPT
  // lawyers and firms — and the guard at :137 requires `!skipOnboarding`.
  // The block therefore fires on exactly the two roles its own comment
  // (:133) says to skip. These two assertions are the inversion, pinned.
  assert.equal(
    needsOnboarding({ userType: "lawyer", onboardingCompleted: false, hasPhone: false }),
    false,
  );
  assert.equal(
    needsOnboarding({ userType: "firm", onboardingCompleted: false, hasPhone: false }),
    false,
  );
});

test("an admin is never sent to a wizard that cannot describe them", () => {
  // The picker has no admin option, so an admin completing it could
  // downgrade their own account. One of the 16 live accounts is the admin.
  assert.equal(
    needsOnboarding({ userType: "admin", onboardingCompleted: false, hasPhone: false }),
    false,
  );
});

test("REGRESSION G2: undefined counts as NOT completed, never as completed", () => {
  // src/proxy.ts:140 requires `onboarding_completed === false` strictly. A
  // Google user's metadata has no such key at all, so the comparison is
  // `undefined === false` — false — and the gate never fires for them.
  assert.equal(
    needsOnboarding({ userType: "individual", onboardingCompleted: undefined, hasPhone: true }),
    true,
  );
});

test("a completed individual with a phone is done", () => {
  assert.equal(
    needsOnboarding({ userType: "individual", onboardingCompleted: true, hasPhone: true }),
    false,
  );
});

test("a completed individual WITHOUT a phone still needs it — WhatsApp has no other channel", () => {
  assert.equal(
    needsOnboarding({ userType: "individual", onboardingCompleted: true, hasPhone: false }),
    true,
  );
});

// UAT-REG-002 / appendix 03 §5. The gate takes `hasPhone` as a boolean, so the
// defect was never here — it was in how src/proxy.ts computed it:
// `(profile?.phone ?? "").trim() !== ""`, a presence test that a row holding
// `letters-and-email@example.test` passes. These two cases pin the CALLER's
// contract: whatever the proxy passes must be the answer to "can we dial
// this?", and `hasValidSaudiMobile` is the function that answers it.
test("the caller's hasPhone must be format-aware: a malformed number is still gated", () => {
  for (const stored of [
    "letters-and-email@example.test",
    "abc@example.com",
    "   ",
    "0112345678",
    "051234567",
    "+201012345678",
  ]) {
    assert.equal(hasValidSaudiMobile(stored), false, stored);
    assert.equal(
      needsOnboarding({
        userType: "individual",
        onboardingCompleted: true,
        hasPhone: hasValidSaudiMobile(stored),
      }),
      true,
      stored,
    );
  }
});

test("the caller's hasPhone accepts every form the registration screens allow", () => {
  for (const stored of ["+966512345678", "0512345678", "00966512345678", "٠٥١٢٣٤٥٦٧٨"]) {
    assert.equal(hasValidSaudiMobile(stored), true, stored);
    assert.equal(
      needsOnboarding({
        userType: "individual",
        onboardingCompleted: true,
        hasPhone: hasValidSaudiMobile(stored),
      }),
      false,
      stored,
    );
  }
});

test("only the boolean `true` counts as completed", () => {
  // The caller passes `profiles.onboarding_completed`, which the schema
  // declares `boolean not null default false`
  // (supabase/migrations/20260603_phase1_001_profiles.sql:50), so a real
  // caller can only ever pass a boolean. These cases are the defensive
  // edge: a string, a number or null must not be mistaken for completion.
  // Wrongly gating a finished user costs one wizard visit; wrongly waving
  // an unfinished one through leaves them without a phone forever.
  assert.equal(
    needsOnboarding({ userType: "individual", onboardingCompleted: "true", hasPhone: true }),
    true,
  );
  assert.equal(
    needsOnboarding({ userType: "individual", onboardingCompleted: 1, hasPhone: true }),
    true,
  );
  assert.equal(
    needsOnboarding({ userType: "individual", onboardingCompleted: null, hasPhone: true }),
    true,
  );
});

test("a missing user type is gated — the wizard is where a type gets chosen", () => {
  // The proxy will call this with `profile?.user_type`, which is undefined
  // when the profiles row is missing, and the OAuth callback does the same.
  // An account whose type nobody can read has not finished choosing one,
  // whatever the other two inputs say — so this branch is checked before
  // completion and phone. Both callers inherit this answer instead of each
  // inventing one.
  assert.equal(
    needsOnboarding({ userType: undefined, onboardingCompleted: true, hasPhone: true }),
    true,
  );
  assert.equal(
    needsOnboarding({ userType: null, onboardingCompleted: true, hasPhone: true }),
    true,
  );
  assert.equal(
    needsOnboarding({ userType: "", onboardingCompleted: true, hasPhone: true }),
    true,
  );
});

test("an unrecognised type is treated as an ordinary non-exempt type", () => {
  // This module owns one list — the three exempt types — and deliberately
  // does not own the DB vocabulary. Checking `userType` against the full
  // CHECK-constraint list here would duplicate DB_USER_TYPES in a second
  // place and let the two drift, which is the class of bug the vocabulary
  // module exists to end. Validating a picker value is toDbUserType's job.
  // So an unrecognised non-empty type is gated when it is unfinished and
  // passes when it is finished, exactly like `corporate` would.
  assert.equal(
    needsOnboarding({ userType: "nonsense", onboardingCompleted: false, hasPhone: false }),
    true,
  );
  assert.equal(
    needsOnboarding({ userType: "nonsense", onboardingCompleted: true, hasPhone: true }),
    false,
  );
});

test("the exemption is unconditional — it does not depend on phone or completion", () => {
  // Task 3 has to be able to state that an existing lawyer with no phone is
  // NOT redirected; 6 of the 16 live accounts are exactly that (lawyer,
  // no phone). The exemption must therefore survive the worst input.
  assert.equal(
    needsOnboarding({ userType: "lawyer", onboardingCompleted: undefined, hasPhone: false }),
    false,
  );
  assert.equal(
    needsOnboarding({ userType: "admin", onboardingCompleted: null, hasPhone: false }),
    false,
  );
});

test("every other DB user type is gated, including provider", () => {
  // `provider` is a real value of the profiles.user_type CHECK constraint
  // and is NOT exempt here: the exempt set is lawyer, firm, admin. Note the
  // stale comment at src/proxy.ts:133 claims providers are skipped too,
  // while its list (:135) never mentioned them. Whether a provider should
  // be exempt is Task 5's open question; this module gates them today.
  for (const t of ["corporate", "micro", "provider", "government", "ngo"]) {
    assert.equal(
      needsOnboarding({ userType: t, onboardingCompleted: false, hasPhone: false }),
      true,
      `${t} should be gated`,
    );
  }
});
