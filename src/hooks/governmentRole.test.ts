import test from "node:test";
import assert from "node:assert/strict";

import { GOVERNMENT_ROLES, normalizeGovernmentRole, resolveGovernmentRole } from "./governmentRole.ts";

test("the app's four roles pass through unchanged", () => {
  for (const role of GOVERNMENT_ROLES) {
    assert.equal(normalizeGovernmentRole(role), role);
    assert.equal(resolveGovernmentRole(role), role);
  }
});

test("case and surrounding whitespace do not hide a known role", () => {
  assert.equal(normalizeGovernmentRole(" Judge "), "judge");
  assert.equal(normalizeGovernmentRole("PROSECUTOR"), "prosecutor");
});

test("the database's «counsel» is the app's gov_counsel", () => {
  assert.equal(normalizeGovernmentRole("counsel"), "gov_counsel");
});

test("database roles the app has no screen for fall back instead of crashing", () => {
  // government_members.role also allows clerk and admin.
  for (const raw of ["clerk", "admin"]) {
    assert.equal(normalizeGovernmentRole(raw), undefined, raw);
    assert.equal(resolveGovernmentRole(raw), "gov_counsel", raw);
  }
});

test("missing, junk and non-string values are rejected", () => {
  for (const raw of [undefined, null, "", "  ", "superuser", 42, {}, ["judge"], true]) {
    assert.equal(normalizeGovernmentRole(raw), undefined, JSON.stringify(raw) ?? String(raw));
    assert.equal(resolveGovernmentRole(raw), "gov_counsel");
  }
});

test("prototype member names never resolve to a role", () => {
  for (const raw of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.equal(normalizeGovernmentRole(raw), undefined, raw);
  }
});
