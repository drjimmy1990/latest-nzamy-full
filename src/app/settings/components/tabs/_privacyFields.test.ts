import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPrivacyToggles,
  readPrivacyStates,
  PRIVACY_DEFAULT_STATES,
  type PrivacyToggleKey,
} from "./_privacyFields.ts";

/** The exact allowlist PUT /api/v1/settings accepts (route.ts allowedFields). */
const PUT_ALLOWLIST = new Set([
  "notifications_enabled",
  "email_notifications",
  "whatsapp_notifications",
  "push_notifications",
  "newsletter",
  "marketing_emails",
  "two_factor_enabled",
  "session_timeout_minutes",
  "data_sharing_consent",
  "analytics_consent",
  "preferences",
]);

const ALL_ROLES = [
  "individual", "lawyer", "firm", "corporate", "micro",
  "government", "ngo", "provider", "admin", null,
];

test("every role gets exactly the four real-column toggles, and every key is on the PUT allowlist", () => {
  for (const role of ALL_ROLES) {
    const defs = getPrivacyToggles(role);
    assert.equal(defs.length, 4, `role ${role} got ${defs.length} toggles, expected 4`);
    const keys = defs.map((d) => d.key);
    assert.deepEqual(
      [...keys].sort(),
      ["analytics_consent", "data_sharing_consent", "marketing_emails", "newsletter"],
    );
    for (const key of keys) {
      assert.ok(PUT_ALLOWLIST.has(key), `${key} (role ${role}) is not in the PUT allowlist`);
    }
  }
});

test("every role gets a data_sharing_consent row", () => {
  for (const role of ALL_ROLES) {
    const defs = getPrivacyToggles(role);
    assert.ok(defs.some((d) => d.key === "data_sharing_consent"));
  }
});

test("corporate and ngo see the PDPL sentence on data_sharing_consent", () => {
  for (const role of ["corporate", "ngo"]) {
    const def = getPrivacyToggles(role).find((d) => d.key === "data_sharing_consent")!;
    assert.match(def.label, /PDPL/);
  }
});

test("every other role sees the general data-sharing sentence, not the PDPL one", () => {
  for (const role of ["individual", "lawyer", "firm", "micro", "government", "provider", "admin", null]) {
    const def = getPrivacyToggles(role).find((d) => d.key === "data_sharing_consent")!;
    assert.doesNotMatch(def.label, /PDPL/);
  }
});

test("no two toggle definitions share a key, for any role", () => {
  for (const role of ALL_ROLES) {
    const keys = getPrivacyToggles(role).map((d) => d.key);
    assert.equal(new Set(keys).size, keys.length, `role ${role} has a duplicate toggle key`);
  }
});

// ── readPrivacyStates ────────────────────────────────────────────────

test("readPrivacyStates(null) is all-false — never defaults a consent to ON in memory", () => {
  const states = readPrivacyStates(null);
  assert.deepEqual(states, PRIVACY_DEFAULT_STATES);
  for (const v of Object.values(states)) assert.equal(v, false);
});

test("readPrivacyStates(undefined) is all-false", () => {
  assert.deepEqual(readPrivacyStates(undefined), PRIVACY_DEFAULT_STATES);
});

test("readPrivacyStates reflects exactly what the server returned", () => {
  const states = readPrivacyStates({
    data_sharing_consent: true,
    analytics_consent: false,
    marketing_emails: true,
    newsletter: false,
  });
  assert.deepEqual(states, {
    data_sharing_consent: true,
    analytics_consent: false,
    marketing_emails: true,
    newsletter: false,
  });
});

test("readPrivacyStates treats a null column as false, not as unanswered-true", () => {
  const states = readPrivacyStates({ data_sharing_consent: null });
  assert.equal(states.data_sharing_consent, false);
});

test("readPrivacyStates never invents true for a key missing from the row", () => {
  const states = readPrivacyStates({ analytics_consent: true });
  const key: PrivacyToggleKey = "data_sharing_consent";
  assert.equal(states[key], false);
});
