// Unit tests for the admin queue's registry line. SYNTHETIC values only.
import assert from "node:assert/strict";
import test from "node:test";
import { describeRegistryMatch, registryMatchesByUser, shapeRegistryMatch } from "./registryMatch.ts";

const valid = {
  status: "valid",
  licence: "99001",
  registry_name: "اسم تجريبي كامل",
  expiry: "2030-01-15",
  archived: false,
  name_match: "exact",
  mobile_match: true,
  other_claims: 0,
  checked_at: "2026-11-17T10:00:00Z",
};

test("shapeRegistryMatch keeps the known fields and drops anything else", () => {
  const m = shapeRegistryMatch({ ...valid, mobile: "0500000011" });
  assert.deepEqual(m, {
    status: "valid",
    licence: "99001",
    registryName: "اسم تجريبي كامل",
    expiry: "2030-01-15",
    archived: false,
    nameMatch: "exact",
    mobileMatch: true,
    otherClaims: 0,
    checkedAt: "2026-11-17T10:00:00Z",
  });
  assert.equal(JSON.stringify(m).includes("0500000011"), false);
});

test("shapeRegistryMatch refuses malformed input and normalises odd values", () => {
  assert.equal(shapeRegistryMatch(null), null);
  assert.equal(shapeRegistryMatch({ status: "verified" }), null);
  const m = shapeRegistryMatch({ status: "not_found", other_claims: -3, mobile_match: "true", name_match: "maybe", expiry: "15/01/2030" });
  assert.equal(m?.otherClaims, 0);
  assert.equal(m?.mobileMatch, null);
  assert.equal(m?.nameMatch, null);
  assert.equal(m?.expiry, null);
});

test("registryMatchesByUser maps rows by user id and skips bad rows", () => {
  const map = registryMatchesByUser([
    { user_id: "u1", registry_match: valid },
    { user_id: "u2", registry_match: { status: "nope" } },
    { registry_match: valid },
    null,
  ]);
  assert.deepEqual([...map.keys()], ["u1"]);
  assert.equal(registryMatchesByUser(null).size, 0);
});

test("describeRegistryMatch: a clean valid match is good", () => {
  const d = describeRegistryMatch(shapeRegistryMatch(valid)!);
  assert.equal(d.tone, "good");
  assert.equal(d.line, "السجل: اسم تجريبي كامل — ترخيص 99001 سارٍ حتى 15/01/2030");
});

test("describeRegistryMatch: a valid licence with a different name, another mobile or other claims is a warning", () => {
  for (const patch of [{ name_match: "different" }, { mobile_match: false }, { other_claims: 2 }, { archived: true }]) {
    const d = describeRegistryMatch(shapeRegistryMatch({ ...valid, ...patch })!);
    assert.equal(d.tone, "warn", JSON.stringify(patch));
    assert.ok(d.notes.length > 0);
  }
});

test("describeRegistryMatch: expired / not found are bad; no licence is neutral", () => {
  assert.equal(describeRegistryMatch(shapeRegistryMatch({ ...valid, status: "expired" })!).tone, "bad");
  assert.equal(describeRegistryMatch(shapeRegistryMatch({ status: "not_found", licence: "12345" })!).line, "السجل: الترخيص 12345 غير موجود");
  assert.equal(describeRegistryMatch(shapeRegistryMatch({ status: "no_licence" })!).tone, "neutral");
});
